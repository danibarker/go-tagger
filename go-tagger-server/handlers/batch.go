package handlers

import (
	"go-tagger/db"
	"go-tagger/models"
	"go-tagger/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleBatchTagging processes the bulk tagging request from the frontend.
func HandleBatchTagging(c *gin.Context) {
	var input models.BatchTagInput

	// 1. Validate and Bind Input
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: photo_ids and new_tags are required."})
		return
	}

	var photos []models.Photo
	if err := db.DB.Where("id IN ?", input.PhotoIDs).Find(&photos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while fetching photos."})
		return
	}
	var tags []models.Tag
	for _, tagName := range input.NewTags {
		var tag models.Tag
		if err := db.DB.FirstOrCreate(&tag, models.Tag{Name: tagName}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while creating/fetching tags."})
			return
		}
		tags = append(tags, tag)
	}

	updated := 0
	for _, photo := range photos {
		if err := db.DB.Model(&photo).Association("Tags").Append(&tags); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while updating photo tags."})
			return
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
	c.JSON(http.StatusOK, gin.H{"message": "Successfully added tags to all photos.", "photos_updated": updated})
}

// HandleBatchPeopleTagging processes the bulk people tagging request
func HandleBatchPeopleTagging(c *gin.Context) {
	var input struct {
		PhotoIDs  []uint   `json:"photo_ids" binding:"required"`
		NewPeople []string `json:"new_people" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: photo_ids and new_people are required."})
		return
	}

	var photos []models.Photo
	if err := db.DB.Where("id IN ?", input.PhotoIDs).Find(&photos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while fetching photos."})
		return
	}

	var people []models.Person
	for _, personName := range input.NewPeople {
		var person models.Person
		if err := db.DB.FirstOrCreate(&person, models.Person{Name: personName}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while creating/fetching people."})
			return
		}
		people = append(people, person)
	}

	updated := 0
	for _, photo := range photos {
		if err := db.DB.Model(&photo).Association("People").Append(&people); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while updating photo people."})
			return
		}
		updated++
	}

	c.JSON(http.StatusOK, gin.H{"message": "Successfully added people to all photos.", "photos_updated": updated})
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
