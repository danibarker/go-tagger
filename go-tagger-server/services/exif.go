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
	Et, err = exiftool.NewExiftool()
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

func ReadInitialMetadata(filePath string) (int, int, time.Time) {
	if Et == nil {
		log.Println("ExifTool not initialized. Returning defaults.")
		return 0, 0, time.Time{}
	}

	// Corrected: Use ExtractMetadata to read metadata for the specified file
	fileMetadata := Et.ExtractMetadata(filePath)

	if len(fileMetadata) == 0 || fileMetadata[0].Err != nil {
		log.Printf("Error reading metadata for %s: %v", filePath, fileMetadata[0].Err)
		return 0, 0, time.Time{}
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

	return int(width), int(height), takenAt
}
