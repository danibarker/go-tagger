package handlers

import (
	"go-tagger/db"
	"go-tagger/models"
	"go-tagger/services"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// HandleBatchTagging processes the bulk tagging request from the frontend.
func HandleBatchTagging(c *gin.Context) {
	var input struct {
		PhotoIDs []uint `json:"photo_ids" binding:"required"`
		// Backward compatible add field
		NewTags []string `json:"new_tags"`
		// Preferred add field
		AddTags []string `json:"add_tags"`
		// Remove tags from all selected photos
		RemoveTags []string `json:"remove_tags"`
	}

	// 1. Validate and Bind Input
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: photo_ids is required."})
		return
	}
	addTagNames := input.AddTags
	if len(addTagNames) == 0 {
		addTagNames = input.NewTags
	}
	if len(addTagNames) == 0 && len(input.RemoveTags) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: provide add_tags/new_tags and/or remove_tags."})
		return
	}

	var photos []models.Photo
	if err := db.DB.Where("id IN ?", input.PhotoIDs).Find(&photos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while fetching photos."})
		return
	}
	var tagsToAdd []models.Tag
	for _, tagName := range addTagNames {
		if tagName == "" {
			continue
		}
		var tag models.Tag
		if err := db.DB.FirstOrCreate(&tag, models.Tag{Name: tagName}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while creating/fetching tags."})
			return
		}
		tagsToAdd = append(tagsToAdd, tag)
	}

	var tagsToRemove []models.Tag
	if len(input.RemoveTags) > 0 {
		if err := db.DB.Where("name IN ?", input.RemoveTags).Find(&tagsToRemove).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while fetching tags to remove."})
			return
		}
	}

	tagIDsToRemove := make([]uint, 0, len(tagsToRemove))
	for _, t := range tagsToRemove {
		tagIDsToRemove = append(tagIDsToRemove, t.ID)
	}

	updated := 0
	for _, photo := range photos {
		if len(tagsToAdd) > 0 {
			if err := db.DB.Model(&photo).Association("Tags").Append(&tagsToAdd); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while adding photo tags."})
				return
			}
		}
		if len(tagIDsToRemove) > 0 {
			if err := db.DB.Table("photo_tags").Where("photo_id = ? AND tag_id IN ?", photo.ID, tagIDsToRemove).Delete(&struct{}{}).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while removing photo tags."})
				return
			}
		}
		updated++
	}

	// fetch updated records for file writing to write tags to files
	var updatedPhotos []models.Photo
	if err := db.DB.Preload("Tags").Where("id IN ?", input.PhotoIDs).Find(&updatedPhotos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while fetching updated photos."})
		return
	}

	// Write tags to files asynchronously
	go func(photos []models.Photo) {
		if err := services.BulkWriteTags(photos); err != nil {
			// Log the error; we can't return it to the user at this point
			// since this is running in a separate goroutine.
			// Consider implementing a notification system for failures.
			// For now, we just log it.
			println("Error writing tags to files:", err.Error())
		}
	}(updatedPhotos)

	// 5. Success Response
	c.JSON(http.StatusOK, gin.H{"message": "Successfully updated tags for selected photos.", "photos_updated": updated})
}

// HandleBatchPeopleTagging processes the bulk people tagging request
func HandleBatchPeopleTagging(c *gin.Context) {
	var input struct {
		PhotoIDs []uint `json:"photo_ids" binding:"required"`
		// Backward compatible add field
		NewPeople []string `json:"new_people"`
		// Preferred add field
		AddPeople []string `json:"add_people"`
		// Remove people from all selected photos
		RemovePeople []string `json:"remove_people"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: photo_ids is required."})
		return
	}
	addPeopleNames := input.AddPeople
	if len(addPeopleNames) == 0 {
		addPeopleNames = input.NewPeople
	}
	if len(addPeopleNames) == 0 && len(input.RemovePeople) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: provide add_people/new_people and/or remove_people."})
		return
	}

	var photos []models.Photo
	if err := db.DB.Where("id IN ?", input.PhotoIDs).Find(&photos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while fetching photos."})
		return
	}

	var peopleToAdd []models.Person
	for _, personName := range addPeopleNames {
		if personName == "" {
			continue
		}
		var person models.Person
		if err := db.DB.FirstOrCreate(&person, models.Person{Name: personName}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while creating/fetching people."})
			return
		}
		peopleToAdd = append(peopleToAdd, person)
	}

	var peopleToRemove []models.Person
	if len(input.RemovePeople) > 0 {
		if err := db.DB.Where("name IN ?", input.RemovePeople).Find(&peopleToRemove).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while fetching people to remove."})
			return
		}
	}

	peopleIDsToRemove := make([]uint, 0, len(peopleToRemove))
	for _, p := range peopleToRemove {
		peopleIDsToRemove = append(peopleIDsToRemove, p.ID)
	}

	updated := 0
	for _, photo := range photos {
		if len(peopleToAdd) > 0 {
			if err := db.DB.Model(&photo).Association("People").Append(&peopleToAdd); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while adding photo people."})
				return
			}
		}
		if len(peopleIDsToRemove) > 0 {
			if err := db.DB.Table("photo_people").Where("photo_id = ? AND person_id IN ?", photo.ID, peopleIDsToRemove).Delete(&struct{}{}).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while removing photo people."})
				return
			}
		}
		updated++
	}

	// fetch updated records for file writing
	var updatedPhotos []models.Photo
	if err := db.DB.Preload("People").Where("id IN ?", input.PhotoIDs).Find(&updatedPhotos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while fetching updated photos."})
		return
	}

	// Write people to files asynchronously
	go func(photos []models.Photo) {
		if err := services.BulkWritePeople(photos); err != nil {
			println("Error writing people to files:", err.Error())
		}
	}(updatedPhotos)

	c.JSON(http.StatusOK, gin.H{"message": "Successfully updated people for selected photos.", "photos_updated": updated})
}

func HandleIndexing(c *gin.Context) {
	// Check immediately if an index is already running
	if services.IsIndexingRunning() {
		c.JSON(http.StatusAccepted, gin.H{"message": "Full index already running in background."})
		return
	}
	// Trigger the batch indexing process
	go services.IndexFiles()

	c.JSON(http.StatusOK, gin.H{"message": "Indexing started in the background."})
}

func HandleUpdateIndexing(c *gin.Context) {
	// Check immediately if an index is already running
	if services.IsIndexingRunning() {
		c.JSON(http.StatusAccepted, gin.H{"message": "Full index already running in background."})
		return
	}
	// Trigger the batch indexing process
	go services.UpdateIndexFiles()

	c.JSON(http.StatusOK, gin.H{"message": "Index update started in the background."})
}

func HandleResetIndex(c *gin.Context) {
	// Check immediately if an index is already running
	if services.IsIndexingRunning() {
		c.JSON(http.StatusAccepted, gin.H{"message": "Index already running in background."})
		return
	}

	// Delete all photos and associations
	if err := db.DB.Exec("DELETE FROM photo_tags").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear photo tags."})
		return
	}
	if err := db.DB.Exec("DELETE FROM photo_people").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear photo people."})
		return
	}
	if err := db.DB.Exec("DELETE FROM photos").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear photos."})
		return
	}

	// Now trigger a full reindex
	go services.IndexFiles()

	c.JSON(http.StatusOK, gin.H{"message": "Database cleared. Full reindex started in the background."})
}

func HandleGetPerfMonitoring(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": services.EnablePerfMonitoring})
}

func HandleSetPerfMonitoring(c *gin.Context) {
	var input struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input."})
		return
	}
	services.EnablePerfMonitoring = input.Enabled
	c.JSON(http.StatusOK, gin.H{"message": "Performance monitoring updated.", "enabled": services.EnablePerfMonitoring})
}

// HandleSyncMetadataToFiles writes all existing tags and people from database to actual files
func HandleSyncMetadataToFiles(c *gin.Context) {
	var total int64
	if err := db.DB.Model(&models.Photo{}).Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while counting photos."})
		return
	}

	if total == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No photos to sync.", "photos_synced": 0})
		return
	}

	const batchSize = 500
	processed := 0
	var batchPhotos []models.Photo

	err := db.DB.Preload("Tags").Preload("People").FindInBatches(&batchPhotos, batchSize, func(tx *gorm.DB, batch int) error {
		if err := services.BulkWriteAllMetadata(batchPhotos); err != nil {
			return err
		}
		processed += len(batchPhotos)
		return nil
	}).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error writing metadata to files: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Successfully synced metadata to files.", "photos_to_sync": processed})
}
