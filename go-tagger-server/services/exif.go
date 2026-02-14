package services

import (
	"go-tagger/models" // Import the Photo model
	"log"
	"path/filepath"
	"strings"
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

func canWriteMetadata(filePath string) bool {
	ext := strings.ToLower(filepath.Ext(filePath))
	return ext != ".webp"
}

// BulkWriteTags handles the core logic of writing tags to the physical files.
// It receives a list of Photo records (which contain the FilePath).
func BulkWriteTags(photos []models.Photo) error {
	// 1. Prepare metadata struct for ExifTool
	var metadataList []exiftool.FileMetadata

	// Exiftool is most efficient when writing to multiple files at once.
	// We iterate through our database photos and prepare the metadata for each.
	for _, photo := range photos {
		resolvedPath := ResolvePhotoPath(photo.FilePath)
		if !canWriteMetadata(resolvedPath) {
			continue
		}
		var tagNames []string
		for _, tag := range photo.Tags {
			tagNames = append(tagNames, tag.Name)
		}
		if len(tagNames) == 0 {
			continue
		}
		fm := exiftool.EmptyFileMetadata()
		fm.SetStrings("XMP:Subject", tagNames) // XMP:Subject is the industry standard for portable tags
		fm.File = resolvedPath
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
		resolvedPath := ResolvePhotoPath(photo.FilePath)
		if !canWriteMetadata(resolvedPath) {
			continue
		}
		var peopleNames []string
		for _, person := range photo.People {
			peopleNames = append(peopleNames, person.Name)
		}
		if len(peopleNames) == 0 {
			continue
		}
		fm := exiftool.EmptyFileMetadata()
		// XMP:PersonInImage is the standard field for people/faces in images
		fm.SetStrings("XMP:PersonInImage", peopleNames)
		fm.File = resolvedPath
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
		resolvedPath := ResolvePhotoPath(photo.FilePath)
		if !canWriteMetadata(resolvedPath) {
			continue
		}
		var tagNames []string
		for _, tag := range photo.Tags {
			tagNames = append(tagNames, tag.Name)
		}
		var peopleNames []string
		for _, person := range photo.People {
			peopleNames = append(peopleNames, person.Name)
		}
		if len(tagNames) == 0 && len(peopleNames) == 0 {
			continue
		}

		fm := exiftool.EmptyFileMetadata()
		fm.SetStrings("XMP:Subject", tagNames)
		fm.SetStrings("XMP:PersonInImage", peopleNames)
		fm.File = resolvedPath
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
	filePath = ResolvePhotoPath(filePath)
	if Et == nil {
		log.Println("ExifTool not initialized. Returning defaults.")
		return 0, 0, time.Time{}, nil, nil
	}

	// Corrected: Use ExtractMetadata to read metadata for the specified file
	fileMetadata := Et.ExtractMetadata(filePath)

	if len(fileMetadata) == 0 {
		log.Printf("Error reading metadata for %s: no metadata returned", filePath)
		return 0, 0, time.Time{}, nil, nil
	}
	if fileMetadata[0].Err != nil {
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

	// Read existing tags and people from common XMP field names.
	tags := readStringList(data, "Subject", "XMP:Subject", "XMP-dc:Subject")
	people := readStringList(data, "PersonInImage", "XMP:PersonInImage", "XMP-iptcExt:PersonInImage")

	return int(width), int(height), takenAt, tags, people
}

func readStringList(data map[string]interface{}, keys ...string) []string {
	seen := make(map[string]struct{})
	var results []string

	add := func(value string) {
		if value == "" {
			return
		}
		if _, exists := seen[value]; exists {
			return
		}
		seen[value] = struct{}{}
		results = append(results, value)
	}

	for _, key := range keys {
		raw, ok := data[key]
		if !ok {
			continue
		}
		switch v := raw.(type) {
		case string:
			add(v)
		case []string:
			for _, item := range v {
				add(item)
			}
		case []interface{}:
			for _, item := range v {
				if str, ok := item.(string); ok {
					add(str)
				}
			}
		}
	}

	return results
}
