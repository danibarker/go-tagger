package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"go-tagger/db"
	"go-tagger/models"
	"go-tagger/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type photoIDsInput struct {
	PhotoIDs []uint `json:"photo_ids" binding:"required"`
}

func splitCSVTrimmed(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, p)
	}
	return out
}

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
		tags := splitCSVTrimmed(input.Tags)
		if len(tags) == 0 {
			// ignore empty tag filter
		} else if input.TagsOrAnd == "and" {
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
		people := splitCSVTrimmed(input.People)
		if len(people) == 0 {
			// ignore empty people filter
		} else if input.PeopleOrAnd == "and" {
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
	if input.NotTags != "" {
		notTagsList := splitCSVTrimmed(input.NotTags)
		if len(notTagsList) > 0 {
			query = query.Where("photos.id NOT IN (SELECT photo_id FROM photo_tags JOIN tags ON photo_tags.tag_id = tags.id WHERE tags.name IN ?)", notTagsList)
		}
	}
	if input.NotPeople != "" {
		notPeopleList := splitCSVTrimmed(input.NotPeople)
		if len(notPeopleList) > 0 {
			query = query.Where("photos.id NOT IN (SELECT photo_id FROM photo_people JOIN people ON photo_people.person_id = people.id WHERE people.name IN ?)", notPeopleList)
		}
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
	var input photoIDsInput

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

func HandleGetTrashPhotos(c *gin.Context) {
	var input models.PaginationInput
	if err := c.ShouldBindQuery(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pagination parameters"})
		return
	}

	offset := (input.Page - 1) * input.Limit

	var photos []models.Photo
	var totalRows int64

	query := db.DB.Model(&models.Photo{})
	query = query.Where("marked_for_deletion = ?", true)

	// Keep the same optional filters as the main gallery so this endpoint is interchangeable.
	if input.Name != "" {
		query = query.Where("file_path LIKE ?", "%"+input.Name+"%")
	}
	if input.FileType != "" && input.FileType != "any" {
		query = query.Where("file_type = ?", input.FileType)
	}
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
		tags := splitCSVTrimmed(input.Tags)
		if len(tags) == 0 {
			// ignore empty tag filter
		} else if input.TagsOrAnd == "and" {
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
		query = query.Joins("LEFT JOIN photo_tags ON photos.id = photo_tags.photo_id").
			Where("photo_tags.photo_id IS NULL")
	}
	if input.People != "" {
		people := splitCSVTrimmed(input.People)
		if len(people) == 0 {
			// ignore empty people filter
		} else if input.PeopleOrAnd == "and" {
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
		query = query.Joins("LEFT JOIN photo_people ON photos.id = photo_people.photo_id").
			Where("photo_people.photo_id IS NULL")
	}

	query.Count(&totalRows)

	result := query.Select("photos.id", "photos.file_path", "photos.thumbnail_path", "photos.file_hash", "photos.width", "photos.height", "photos.file_type", "photos.taken_at").
		Preload("Tags").
		Preload("People").
		Order("photos.id asc").
		Offset(offset).
		Limit(input.Limit).
		Find(&photos)

	for i := range photos {
		photos[i].FilePath = filepath.Base(photos[i].FilePath)
	}

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error fetching photos"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  photos,
		"total": totalRows,
		"page":  input.Page,
		"limit": input.Limit,
	})
}

func HandleRestorePhotos(c *gin.Context) {
	var input photoIDsInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: photo_ids are required."})
		return
	}

	if err := db.DB.Model(&models.Photo{}).Where("id IN ?", input.PhotoIDs).Update("marked_for_deletion", false).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while restoring photos."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Photos restored successfully.", "photos_restored": len(input.PhotoIDs)})
}

func isPathUnderRoot(path, root string) bool {
	if path == "" {
		return false
	}
	if root == "" {
		return true
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(absRoot, absPath)
	if err != nil {
		return false
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return false
	}
	return true
}

func HandlePermanentDeletePhotos(c *gin.Context) {
	var input photoIDsInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: photo_ids are required."})
		return
	}

	// Fetch paths + hashes before deleting DB rows.
	var photos []models.Photo
	if err := db.DB.Select("id", "file_path", "file_hash").Where("id IN ?", input.PhotoIDs).Find(&photos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while reading photos to delete."})
		return
	}

	filesDeleted := 0
	thumbsDeleted := 0
	var fileErrors []string

	for _, p := range photos {
		resolved := services.ResolvePhotoPath(p.FilePath)
		if resolved != "" && isPathUnderRoot(resolved, services.PhotoRoot) {
			if err := os.Remove(resolved); err == nil {
				filesDeleted++
			} else if !os.IsNotExist(err) {
				fileErrors = append(fileErrors, fmt.Sprintf("file remove failed id=%d path=%s err=%v", p.ID, resolved, err))
			}
		} else if resolved != "" {
			fileErrors = append(fileErrors, fmt.Sprintf("skipped file delete (outside PHOTO_ROOT) id=%d path=%s", p.ID, resolved))
		}

		if services.ThumbnailRoot != "" && p.FileHash != "" {
			thumbPath := filepath.Join(services.ThumbnailRoot, p.FileHash+".jpg")
			if !isPathUnderRoot(thumbPath, services.ThumbnailRoot) {
				fileErrors = append(fileErrors, fmt.Sprintf("skipped thumb delete (outside THUMBNAIL_ROOT) id=%d path=%s", p.ID, thumbPath))
				continue
			}
			if err := os.Remove(thumbPath); err == nil {
				thumbsDeleted++
			} else if !os.IsNotExist(err) {
				fileErrors = append(fileErrors, fmt.Sprintf("thumb remove failed id=%d path=%s err=%v", p.ID, thumbPath, err))
			}
		}
	}

	if len(fileErrors) > 0 {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":             "Failed to delete one or more files; database rows were not removed.",
			"files_deleted":     filesDeleted,
			"thumbs_deleted":    thumbsDeleted,
			"file_errors":       fileErrors,
			"file_errors_count": len(fileErrors),
		})
		return
	}

	if err := db.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DELETE FROM photo_tags WHERE photo_id IN ?", input.PhotoIDs).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM photo_people WHERE photo_id IN ?", input.PhotoIDs).Error; err != nil {
			return err
		}
		// Hard delete rows (bypass gorm.Model DeletedAt soft-delete).
		if err := tx.Unscoped().Where("id IN ?", input.PhotoIDs).Delete(&models.Photo{}).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while permanently deleting photos."})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":           "Photos permanently deleted.",
		"photos_deleted":    len(input.PhotoIDs),
		"files_deleted":     filesDeleted,
		"thumbs_deleted":    thumbsDeleted,
		"file_errors":       fileErrors,
		"file_errors_count": len(fileErrors),
	})
}

// HandleGetPhotoByHash returns full photo metadata by hash
func HandleGetPhotoByHash(c *gin.Context) {
	hash := c.Param("hash")
	if hash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hash parameter is required"})
		return
	}

	var photo models.Photo
	if err := db.DB.Preload("Tags").Preload("People").Where("file_hash = ?", hash).First(&photo).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "photo not found"})
		return
	}

	// Extract just the filename from the full path
	photo.FilePath = filepath.Base(photo.FilePath)

	c.JSON(http.StatusOK, photo)
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
	resolvedPath := services.ResolvePhotoPath(photo.FilePath)

	// Set appropriate Content-Type based on file extension
	ext := strings.ToLower(filepath.Ext(resolvedPath))
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

	// Open the file
	file, err := os.Open(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("original missing: hash=%s path=%s err=%v", hash, resolvedPath, err)
			c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
			return
		}
		log.Printf("original open failed: hash=%s path=%s err=%v", hash, resolvedPath, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open file"})
		return
	}
	defer file.Close()

	// Get file info
	fileInfo, err := file.Stat()
	if err != nil {
		log.Printf("original stat failed: hash=%s path=%s err=%v", hash, resolvedPath, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to stat file"})
		return
	}

	http.ServeContent(c.Writer, c.Request, fileInfo.Name(), fileInfo.ModTime(), file)
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

	// If thumbnail doesn't exist, try to generate it on-demand
	if _, err := os.Stat(thumbPath); os.IsNotExist(err) {
		if c.Request.Method == http.MethodHead {
			log.Printf("thumbnail missing on HEAD: hash=%s path=%s", hash, thumbPath)
			c.JSON(http.StatusNotFound, gin.H{"error": "thumbnail not found"})
			return
		}
		// Find the photo by hash to get the original file path
		var photo models.Photo
		if err := db.DB.Where("file_hash = ?", hash).First(&photo).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "photo not found"})
			return
		}
		resolvedPath := services.ResolvePhotoPath(photo.FilePath)

		// Generate thumbnail based on file type
		ext := strings.ToLower(filepath.Ext(resolvedPath))
		if photo.FileType == "image" {
			if ext == ".webp" {
				if err := services.GenerateImageThumbnailFFmpeg(resolvedPath, thumbPath); err != nil {
					log.Printf("thumbnail generate failed (webp): hash=%s path=%s src=%s err=%v", hash, thumbPath, resolvedPath, err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate thumbnail"})
					return
				}
			} else {
				if err := services.GenerateImageThumbnail(resolvedPath, thumbPath); err != nil {
					log.Printf("thumbnail generate failed (image): hash=%s path=%s src=%s err=%v", hash, thumbPath, resolvedPath, err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate thumbnail"})
					return
				}
			}
		} else if photo.FileType == "video" {
			if err := services.GenerateVideoThumbnail(resolvedPath, thumbPath); err != nil {
				log.Printf("thumbnail generate failed (video): hash=%s path=%s src=%s err=%v", hash, thumbPath, resolvedPath, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate thumbnail"})
				return
			}
		}
	} else if err != nil {
		log.Printf("thumbnail stat failed: hash=%s path=%s err=%v", hash, thumbPath, err)
		c.JSON(http.StatusNotFound, gin.H{"error": "thumbnail not found", "path": thumbPath, "err": err.Error()})
		return
	}

	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	if c.Request.Method == http.MethodHead {
		c.Status(http.StatusOK)
		return
	}
	c.File(thumbPath)
}
