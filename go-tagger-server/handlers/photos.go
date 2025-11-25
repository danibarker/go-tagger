package handlers

import (
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

	// Optional filters
	if input.Name != "" {
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
			for _, tag := range tags {
				query = query.Joins("JOIN photo_tags pt_"+tag+" ON photos.id = pt_"+tag+".photo_id").
					Joins("JOIN tags t_"+tag+" ON pt_"+tag+".tag_id = t_"+tag+".id AND t_"+tag+".name = ?", tag)
			}
		} else {
			query = query.Joins("JOIN photo_tags ON photos.id = photo_tags.photo_id").
				Joins("JOIN tags ON photo_tags.tag_id = tags.id").
				Where("tags.name IN ?", tags)
		}
	}
	if input.People != "" {
		people := strings.Split(input.People, ",")
		if input.PeopleOrAnd == "and" {
			for _, person := range people {
				query = query.Joins("JOIN photo_people pp_"+person+" ON photos.id = pp_"+person+".photo_id").
					Joins("JOIN people p_"+person+" ON pp_"+person+".person_id = p_"+person+".id AND p_"+person+".name = ?", person)
			}
		} else {
			query = query.Joins("JOIN photo_people ON photos.id = photo_people.photo_id").
				Joins("JOIN people ON photo_people.person_id = people.id").
				Where("people.name IN ?", people)
		}
	}
	query.Count(&totalRows)

	// 3. Fetch Paginated Data
	// Select only the fields needed for the gallery view (faster query)
	result := query.Select("id", "thumbnail_path", "file_hash", "width", "height", "file_type", "taken_at").
		Order("photos.id asc"). // Order by ID to ensure consistent paging
		Limit(input.Limit).
		Offset(offset).
		Find(&photos)

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

func HandleGetPhotoByID(c *gin.Context) {

}

func HandleAddTagsToPhoto(c *gin.Context) {
}

func HandleUpdateTagsOfPhoto(c *gin.Context) {

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
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.File(photo.FilePath)
}

// HandleServeThumbnail streams the generated thumbnail file for a photo hash.
func HandleServeThumbnail(c *gin.Context) {
	hash := c.Param("hash")
	if hash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hash parameter is required"})
		return
	}
	thumbPath := filepath.Join(services.ThumbnailRoot, hash+".jpg")
	if _, err := os.Stat(thumbPath); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "thumbnail not found"})
		return
	}
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.File(thumbPath)
}
