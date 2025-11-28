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
)

func HandleGetPhotos(c *gin.Context) {
	var input models.PaginationInput

	// 1. Bind Query Parameters (Page, Limit)
	if err := c.ShouldBindQuery(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pagination parameters"})
		return
	}

	// Calculate offset
	offset := (input.Page - 1) * input.Limit

	var photos []models.Photo
	var totalRows int64

	// 2. Count Total Rows (for frontend pagination control)
	query := db.DB.Model(&models.Photo{})
	query = query.Where("marked_for_deletion = ?", false)
	// Optional filters
	if input.Name != "" {
		query = query.Where("file_path LIKE ?", "%"+input.Name+"%")
	}
	if input.FileType != "" && input.FileType != "any" {
		query = query.Where("file_type = ?", input.FileType)
	}
	// before/after for date and time

	if input.BeforeDate != "" && input.BeforeTime != "" {
		query = query.Where("taken_at <= ?", input.BeforeDate+" "+input.BeforeTime)
	} else if input.BeforeDate != "" {
		query = query.Where("taken_at <= ?", input.BeforeDate+" 23:59:59")
	} else if input.BeforeTime != "" {
		query = query.Where("taken_at <= ?", input.BeforeTime)
	}

	if input.AfterDate != "" && input.AfterTime != "" {
		query = query.Where("taken_at >= ?", input.AfterDate+" "+input.AfterTime)
	} else if input.AfterDate != "" {
		query = query.Where("taken_at >= ?", input.AfterDate+" 00:00:00")
	} else if input.AfterTime != "" {
		query = query.Where("taken_at >= ?", input.AfterTime)
	}

	if input.Tags != "" {
		tags := strings.Split(input.Tags, ",")
		if input.TagsOrAnd == "and" {
			for i, tag := range tags {
				alias := fmt.Sprintf("pt_%d", i)
				tagAlias := fmt.Sprintf("t_%d", i)
				query = query.Joins(fmt.Sprintf("JOIN photo_tags %s ON photos.id = %s.photo_id", alias, alias)).
					Joins(fmt.Sprintf("JOIN tags %s ON %s.tag_id = %s.id AND %s.name = ?", tagAlias, alias, tagAlias, tagAlias), tag)
			}
		} else {
			query = query.Joins("JOIN photo_tags ON photos.id = photo_tags.photo_id").
				Joins("JOIN tags ON photo_tags.tag_id = tags.id").
				Where("tags.name IN ?", tags).
				Distinct()
		}
	} else if input.Untagged {
		// Photos with no tags
		query = query.Joins("LEFT JOIN photo_tags ON photos.id = photo_tags.photo_id").
			Where("photo_tags.photo_id IS NULL")
	}
	if input.People != "" {
		people := strings.Split(input.People, ",")
		if input.PeopleOrAnd == "and" {
			for i, person := range people {
				alias := fmt.Sprintf("pp_%d", i)
				personAlias := fmt.Sprintf("p_%d", i)
				query = query.Joins(fmt.Sprintf("JOIN photo_people %s ON photos.id = %s.photo_id", alias, alias)).
					Joins(fmt.Sprintf("JOIN people %s ON %s.person_id = %s.id AND %s.name = ?", personAlias, alias, personAlias, personAlias), person)
			}
		} else {
			query = query.Joins("JOIN photo_people ON photos.id = photo_people.photo_id").
				Joins("JOIN people ON photo_people.person_id = people.id").
				Where("people.name IN ?", people).
				Distinct()
		}
	} else if input.Untagged {
		// Photos with no people tags
		query = query.Joins("LEFT JOIN photo_people ON photos.id = photo_people.photo_id").
			Where("photo_people.photo_id IS NULL")
	}
	query.Count(&totalRows)

	// 3. Fetch Paginated Data
	// Select only the fields needed for the gallery view (faster query)
	result := query.Select("photos.id", "photos.file_path", "photos.thumbnail_path", "photos.file_hash", "photos.width", "photos.height", "photos.file_type", "photos.taken_at").
		Preload("Tags").
		Preload("People").
		Order("photos.id asc").
		Offset(offset).
		Limit(input.Limit).
		Find(&photos)

	// Extract just the filename from the full path
	for i := range photos {
		photos[i].FilePath = filepath.Base(photos[i].FilePath)
	}

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error fetching photos"})
		return
	}

	// 4. Return Data
	c.JSON(http.StatusOK, gin.H{
		"data":  photos,
		"total": totalRows,
		"page":  input.Page,
		"limit": input.Limit,
	})

}

func HandleDeletePhotos(c *gin.Context) {
	var input struct {
		PhotoIDs []uint `json:"photo_ids" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: photo_ids are required."})
		return
	}

	// Mark photos for deletion in the database
	if err := db.DB.Model(&models.Photo{}).Where("id IN ?", input.PhotoIDs).Update("marked_for_deletion", true).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while marking photos for deletion."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Photos marked for deletion successfully.", "photos_marked": len(input.PhotoIDs)})
}

// HandleServeOriginalPhoto streams the original media file by photo hash.
func HandleServeOriginalPhoto(c *gin.Context) {
	hash := c.Param("hash")
	if hash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hash parameter is required"})
		return
	}
	var photo models.Photo
	if err := db.DB.Where("file_hash = ?", hash).First(&photo).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "photo not found"})
		return
	}

	// Set appropriate Content-Type based on file extension
	ext := strings.ToLower(filepath.Ext(photo.FilePath))
	var contentType string
	switch ext {
	case ".mp4":
		contentType = "video/mp4"
	case ".mov":
		contentType = "video/quicktime"
	case ".avi":
		contentType = "video/x-msvideo"
	case ".webm":
		contentType = "video/webm"
	case ".m4v":
		contentType = "video/x-m4v"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".png":
		contentType = "image/png"
	case ".gif":
		contentType = "image/gif"
	case ".webp":
		contentType = "image/webp"
	case ".bmp":
		contentType = "image/bmp"
	case ".tiff", ".tif":
		contentType = "image/tiff"
	default:
		contentType = "application/octet-stream"
	}

	// Set cache and content-type headers
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("Content-Type", contentType)

	// If this is a HEAD request, just return headers
	if c.Request.Method == "HEAD" {
		c.Status(http.StatusOK)
		return
	}

	// Open the file
	file, err := os.Open(photo.FilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open file"})
		return
	}
	defer file.Close()

	// Get file info
	fileInfo, err := file.Stat()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to stat file"})
		return
	}

	c.DataFromReader(http.StatusOK, fileInfo.Size(), contentType, file, nil)
}

// HandleServeThumbnail streams the generated thumbnail file for a photo hash.
func HandleServeThumbnail(c *gin.Context) {
	hash := c.Param("hash")
	if hash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hash parameter is required"})
		return
	}
	// Strip .jpg extension if present (for backward compatibility)
	hash = strings.TrimSuffix(hash, ".jpg")

	thumbPath := filepath.Join(services.ThumbnailRoot, hash+".jpg")

	// Set debug headers early
	c.Header("X-Debug-Thumbnail-Path", thumbPath)
	c.Header("X-Debug-Thumbnail-Root", services.ThumbnailRoot)
	c.Header("X-Debug-Hash", hash)

	if _, err := os.Stat(thumbPath); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "thumbnail not found", "path": thumbPath, "err": err.Error()})
		return
	}
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.File(thumbPath)
}
