package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"go-tagger/db"
	"go-tagger/models"
	"go-tagger/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"
)

func parseNameList(value string) []string {
	parts := strings.Split(value, ",")
	seen := make(map[string]struct{})
	var result []string
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func mergeNameLists(a, b []string) []string {
	seen := make(map[string]struct{})
	var result []string
	for _, value := range append(a, b...) {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

// HandleUploadPhotos handles multipart uploads and stores media with tags.
func HandleUploadPhotos(c *gin.Context) {
	folderName, err := services.SanitizeUploadFolderName(c.PostForm("folder"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid multipart form"})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No files provided"})
		return
	}

	tags := parseNameList(c.PostForm("tags"))
	people := parseNameList(c.PostForm("people"))

	destinationDir := filepath.Join(services.PhotoRoot, folderName)
	if err := os.MkdirAll(destinationDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
		return
	}
	if services.ThumbnailRoot == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Thumbnail root is not configured"})
		return
	}
	if err := os.MkdirAll(services.ThumbnailRoot, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create thumbnail folder"})
		return
	}

	uploaded := 0
	skipped := 0
	errors := make([]string, 0)
	var photosToWrite []models.Photo

	for _, file := range files {
		safeName := filepath.Base(file.Filename)
		ext := strings.ToLower(filepath.Ext(safeName))
		if !services.IsSupportedExtension(ext) {
			skipped++
			errors = append(errors, fmt.Sprintf("%s: unsupported file type", safeName))
			continue
		}

		destinationPath, err := services.UniqueFilePath(destinationDir, safeName)
		if err != nil {
			skipped++
			errors = append(errors, fmt.Sprintf("%s: %v", safeName, err))
			continue
		}

		if err := c.SaveUploadedFile(file, destinationPath); err != nil {
			skipped++
			errors = append(errors, fmt.Sprintf("%s: failed to save", safeName))
			continue
		}

		info, err := os.Stat(destinationPath)
		if err != nil {
			skipped++
			errors = append(errors, fmt.Sprintf("%s: failed to stat", safeName))
			continue
		}

		hash, err := services.CalculateSHA256Hash(destinationPath)
		if err != nil {
			skipped++
			errors = append(errors, fmt.Sprintf("%s: failed to hash", safeName))
			continue
		}

		width, height, takenAt, fileTags, filePeople := services.ReadInitialMetadata(destinationPath)
		mergedTags := mergeNameLists(tags, fileTags)
		mergedPeople := mergeNameLists(people, filePeople)

		fileType := services.DetectFileType(ext)
		thumbPath := filepath.Join(services.ThumbnailRoot, hash+".jpg")
		if fileType == "video" {
			if err := services.GenerateVideoThumbnail(destinationPath, thumbPath); err != nil {
				errors = append(errors, fmt.Sprintf("%s: thumbnail failed (%v)", safeName, err))
			}
		} else if fileType == "image" {
			if ext == ".webp" {
				if err := services.GenerateImageThumbnailFFmpeg(destinationPath, thumbPath); err != nil {
					errors = append(errors, fmt.Sprintf("%s: thumbnail failed (%v)", safeName, err))
				}
			} else {
				if err := services.GenerateImageThumbnail(destinationPath, thumbPath); err != nil {
					errors = append(errors, fmt.Sprintf("%s: thumbnail failed (%v)", safeName, err))
				}
			}
		}

		photo := models.Photo{
			FilePath:      destinationPath,
			FileHash:      hash,
			ThumbnailPath: services.ThumbnailURLPrefix + hash + ".jpg",
			Width:         width,
			Height:        height,
			FileSize:      info.Size(),
			TakenAt:       takenAt,
			FileType:      fileType,
		}

		result := db.DB.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "file_hash"}},
			DoNothing: true,
		}).Create(&photo)
		if result.Error != nil {
			skipped++
			errors = append(errors, fmt.Sprintf("%s: failed to save record", safeName))
			continue
		}
		if photo.ID == 0 {
			if err := db.DB.Where("file_hash = ?", hash).First(&photo).Error; err != nil {
				skipped++
				errors = append(errors, fmt.Sprintf("%s: failed to lookup existing record", safeName))
				continue
			}
		}

		var tagModels []models.Tag
		for _, tagName := range mergedTags {
			var tag models.Tag
			if err := db.DB.FirstOrCreate(&tag, models.Tag{Name: tagName}).Error; err != nil {
				errors = append(errors, fmt.Sprintf("%s: failed to create tag '%s'", safeName, tagName))
				continue
			}
			tagModels = append(tagModels, tag)
		}

		var personModels []models.Person
		for _, personName := range mergedPeople {
			var person models.Person
			if err := db.DB.FirstOrCreate(&person, models.Person{Name: personName}).Error; err != nil {
				errors = append(errors, fmt.Sprintf("%s: failed to create person '%s'", safeName, personName))
				continue
			}
			personModels = append(personModels, person)
		}

		if len(tagModels) > 0 {
			if err := db.DB.Model(&photo).Association("Tags").Append(&tagModels); err != nil {
				errors = append(errors, fmt.Sprintf("%s: failed to attach tags", safeName))
			}
		}
		if len(personModels) > 0 {
			if err := db.DB.Model(&photo).Association("People").Append(&personModels); err != nil {
				errors = append(errors, fmt.Sprintf("%s: failed to attach people", safeName))
			}
		}

		if len(tagModels) > 0 || len(personModels) > 0 {
			photo.Tags = tagModels
			photo.People = personModels
			photosToWrite = append(photosToWrite, photo)
		}

		uploaded++
	}

	if len(photosToWrite) > 0 {
		go func(toWrite []models.Photo) {
			if err := services.BulkWriteAllMetadata(toWrite); err != nil {
				fmt.Printf("Error writing metadata to files: %v\n", err)
			}
		}(photosToWrite)
	}

	c.JSON(http.StatusOK, gin.H{
		"uploaded": uploaded,
		"skipped":  skipped,
		"errors":   errors,
	})
}
