package services

import (
	"go-tagger/models" // Import the Photo model
	"log"
	"time"

	"github.com/barasher/go-exiftool"
)

var Et *exiftool.Exiftool

// InitExifTool creates a single, reusable instance of Exiftool with stay_open optimization.
func InitExifTool() {
	var err error
	// Allocate a 100MB buffer for the ExifTool process (100 * 1024 * 1024 bytes)
	const bufferSize = 100 * 1024 * 1024
	buffer := make([]byte, bufferSize)
	Et, err = exiftool.NewExiftool(exiftool.Buffer(buffer, bufferSize))
	if err != nil {
		log.Fatalf("Error initializing Exiftool for bulk operations: %v", err)
	}
	log.Println("ExifTool service started successfully.")
}

// BulkWriteTags handles the core logic of writing tags to the physical files.
// It receives a list of Photo records (which contain the FilePath).
func BulkWriteTags(photos []models.Photo) error {
	// 1. Prepare metadata struct for ExifTool
	var metadataList []exiftool.FileMetadata

	// Exiftool is most efficient when writing to multiple files at once.
	// We iterate through our database photos and prepare the metadata for each.
	for _, photo := range photos {
		var tagNames []string
		for _, tag := range photo.Tags {
			tagNames = append(tagNames, tag.Name)
		}
		fm := exiftool.EmptyFileMetadata()
		fm.SetStrings("XMP:Subject", tagNames) // XMP:Subject is the industry standard for portable tags
		fm.File = photo.FilePath
		metadataList = append(metadataList, fm)
	}

	// 2. Write Metadata in one go (very fast operation thanks to stay_open)
	Et.WriteMetadata(metadataList)

	// 3. Check for errors from the file system write
	for _, fileInfo := range metadataList {
		if fileInfo.Err != nil {
			log.Printf("Error writing metadata to %s: %v", fileInfo.File, fileInfo.Err)
			// Decide how to handle this: abort all, or continue? We'll continue for now.
		}
	}
	return nil
}

// BulkWritePeople handles writing people metadata to the physical files.
func BulkWritePeople(photos []models.Photo) error {
	var metadataList []exiftool.FileMetadata

	for _, photo := range photos {
		var peopleNames []string
		for _, person := range photo.People {
			peopleNames = append(peopleNames, person.Name)
		}
		fm := exiftool.EmptyFileMetadata()
		// XMP:PersonInImage is the standard field for people/faces in images
		fm.SetStrings("XMP:PersonInImage", peopleNames)
		fm.File = photo.FilePath
		metadataList = append(metadataList, fm)
	}

	Et.WriteMetadata(metadataList)

	for _, fileInfo := range metadataList {
		if fileInfo.Err != nil {
			log.Printf("Error writing people metadata to %s: %v", fileInfo.File, fileInfo.Err)
		}
	}
	return nil
}

// BulkWriteAllMetadata writes both tags and people to files
func BulkWriteAllMetadata(photos []models.Photo) error {
	var metadataList []exiftool.FileMetadata

	for _, photo := range photos {
		var tagNames []string
		for _, tag := range photo.Tags {
			tagNames = append(tagNames, tag.Name)
		}
		var peopleNames []string
		for _, person := range photo.People {
			peopleNames = append(peopleNames, person.Name)
		}

		fm := exiftool.EmptyFileMetadata()
		fm.SetStrings("XMP:Subject", tagNames)
		fm.SetStrings("XMP:PersonInImage", peopleNames)
		fm.File = photo.FilePath
		metadataList = append(metadataList, fm)
	}

	Et.WriteMetadata(metadataList)

	for _, fileInfo := range metadataList {
		if fileInfo.Err != nil {
			log.Printf("Error writing metadata to %s: %v", fileInfo.File, fileInfo.Err)
		}
	}
	return nil
}

func ReadInitialMetadata(filePath string) (int, int, time.Time, []string, []string) {
	if Et == nil {
		log.Println("ExifTool not initialized. Returning defaults.")
		return 0, 0, time.Time{}, nil, nil
	}

	// Corrected: Use ExtractMetadata to read metadata for the specified file
	fileMetadata := Et.ExtractMetadata(filePath)

	if len(fileMetadata) == 0 || fileMetadata[0].Err != nil {
		log.Printf("Error reading metadata for %s: %v", filePath, fileMetadata[0].Err)
		return 0, 0, time.Time{}, nil, nil
	}

	data := fileMetadata[0].Fields

	// Attempt to parse Width and Height
	// Use float64 then cast to int, as ExifTool sometimes returns numeric fields as float64
	width, _ := data["ImageWidth"].(float64)
	height, _ := data["ImageHeight"].(float64)

	var takenAt time.Time
	if dateStr, ok := data["DateTimeOriginal"].(string); ok {
		// Attempt to parse the common EXIF format: YYYY:MM:DD hh:mm:ss
		parsedTime, err := time.Parse("2006:01:02 15:04:05", dateStr)
		if err == nil {
			takenAt = parsedTime
		}
	}

	// Read existing tags from XMP:Subject
	var tags []string
	if subjectData, ok := data["Subject"]; ok {
		// Subject can be a single string or an array of strings
		switch v := subjectData.(type) {
		case string:
			if v != "" {
				tags = []string{v}
			}
		case []interface{}:
			for _, item := range v {
				if str, ok := item.(string); ok && str != "" {
					tags = append(tags, str)
				}
			}
		}
	}

	// Read existing people from XMP:PersonInImage
	var people []string
	if personData, ok := data["PersonInImage"]; ok {
		// PersonInImage can be a single string or an array of strings
		switch v := personData.(type) {
		case string:
			if v != "" {
				people = []string{v}
			}
		case []interface{}:
			for _, item := range v {
				if str, ok := item.(string); ok && str != "" {
					people = append(people, str)
				}
			}
		}
	}

	return int(width), int(height), takenAt, tags, people
}
