package services

import (
	"fmt"
	"go-tagger/db"
	"go-tagger/models"
	"log"

	"gorm.io/gorm"
)

// ImportMetadataFromFiles scans existing photo files and imports tags/people into the database.
// It adds new associations without removing existing ones.
func ImportMetadataFromFiles() (int, int, error) {
	if Et == nil {
		return 0, 0, fmt.Errorf("ExifTool not initialized")
	}

	var total int64
	if err := db.DB.Model(&models.Photo{}).Count(&total).Error; err != nil {
		return 0, 0, err
	}
	if total == 0 {
		return 0, 0, nil
	}

	const batchSize = 500
	processed := 0
	withMetadata := 0

	var batchPhotos []models.Photo
	err := db.DB.FindInBatches(&batchPhotos, batchSize, func(tx *gorm.DB, batch int) error {
		type photoMetadata struct {
			tags   []string
			people []string
		}

		metadataByID := make(map[uint]photoMetadata)
		for _, photo := range batchPhotos {
			_, _, _, tags, people := ReadInitialMetadata(photo.FilePath)
			if len(tags) == 0 && len(people) == 0 {
				continue
			}
			metadataByID[photo.ID] = photoMetadata{tags: tags, people: people}
		}

		if len(metadataByID) == 0 {
			processed += len(batchPhotos)
			return nil
		}

		withMetadata += len(metadataByID)

		tagSet := make(map[string]bool)
		peopleSet := make(map[string]bool)
		for _, metadata := range metadataByID {
			for _, tag := range metadata.tags {
				tagSet[tag] = true
			}
			for _, person := range metadata.people {
				peopleSet[person] = true
			}
		}

		tagNameToID := make(map[string]uint)
		for tagName := range tagSet {
			var tag models.Tag
			if err := db.DB.FirstOrCreate(&tag, models.Tag{Name: tagName}).Error; err != nil {
				return err
			}
			tagNameToID[tagName] = tag.ID
		}

		personNameToID := make(map[string]uint)
		for personName := range peopleSet {
			var person models.Person
			if err := db.DB.FirstOrCreate(&person, models.Person{Name: personName}).Error; err != nil {
				return err
			}
			personNameToID[personName] = person.ID
		}

		for _, photo := range batchPhotos {
			metadata, ok := metadataByID[photo.ID]
			if !ok {
				continue
			}
			for _, tagName := range metadata.tags {
				tagID := tagNameToID[tagName]
				result := tx.Exec("INSERT INTO photo_tags (photo_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING", photo.ID, tagID)
				if result.Error != nil {
					return result.Error
				}
			}
			for _, personName := range metadata.people {
				personID := personNameToID[personName]
				result := tx.Exec("INSERT INTO photo_people (photo_id, person_id) VALUES (?, ?) ON CONFLICT DO NOTHING", photo.ID, personID)
				if result.Error != nil {
					return result.Error
				}
			}
		}

		processed += len(batchPhotos)
		log.Printf("Metadata import batch %d: processed %d photos, found metadata for %d", batch, len(batchPhotos), len(metadataByID))
		return nil
	}).Error

	return processed, withMetadata, err
}
