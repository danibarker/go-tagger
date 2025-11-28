package handlers

import (
	"go-tagger/db"
	"go-tagger/models"

	"github.com/gin-gonic/gin"
)

func HandleGetTagsAutoComplete(c *gin.Context) {
	var tags []models.Tag
	query := db.DB.Model(&models.Tag{})
	query = query.Where("name LIKE ?", c.Query("q")+"%")
	query.Find(&tags)

	c.JSON(200, gin.H{
		"tags": tags,
	})
}

func HandleGetTopTags(c *gin.Context) {
	var tags []models.Tag
	query := db.DB.Model(&models.Tag{})
	// join with photo_tags join with photos to order by number of photos descending
	query = query.
		Select("tags.*, COUNT(photo_tags.photo_id) as photo_count").
		Joins("LEFT JOIN photo_tags ON tags.id = photo_tags.tag_id").
		Joins("LEFT JOIN photos ON photos.id = photo_tags.photo_id").
		Group("tags.id").
		Order("photo_count DESC").
		Limit(10)

	query.Find(&tags)

	c.JSON(200, gin.H{
		"tags": tags,
	})
}
