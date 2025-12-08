package handlers

import (
	"go-tagger/db"
	"go-tagger/models"

	"github.com/gin-gonic/gin"
)

func HandleGetPeople(c *gin.Context) {
	var people []models.Person
	query := db.DB.Model(&models.Person{})
	// join with photo_people join with photos to order by number of photos descending
	query = query.
		Select("people.*, COUNT(photo_people.photo_id) as photo_count").
		Joins("LEFT JOIN photo_people ON people.id = photo_people.person_id").
		Joins("LEFT JOIN photos ON photos.id = photo_people.photo_id").
		Group("people.id").
		Order("photo_count DESC").
		Limit(10)

	query.Find(&people)

	// Extract just the names for the frontend
	peopleNames := make([]string, len(people))
	for i, person := range people {
		peopleNames[i] = person.Name
	}

	c.JSON(200, peopleNames)
}

func HandleGetPeopleAutoComplete(c *gin.Context) {
	var people []models.Person
	query := db.DB.Model(&models.Person{})
	query = query.Where("name LIKE ?", c.Query("q")+"%")
	query.Find(&people)

	// Extract just the names for the frontend
	peopleNames := make([]string, len(people))
	for i, person := range people {
		peopleNames[i] = person.Name
	}

	c.JSON(200, peopleNames)
}
