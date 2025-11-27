package services

import (
	"go-tagger/db"
	"go-tagger/models"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/disintegration/imaging"
)

var (
	// PhotoRoot is the directory that will be scanned for source media files.
	PhotoRoot = os.Getenv("PHOTO_ROOT")
	// ThumbnailRoot is where generated thumbnails are stored on disk.
	ThumbnailRoot = os.Getenv("THUMBNAIL_ROOT")
	// ThumbnailURLPrefix is the public route prefix clients use to fetch thumbnails.
	ThumbnailURLPrefix = "/media/thumbnails/"
)

// In services/indexer.go
var indexingRunning sync.Mutex

// Supported extensions for indexing
var supportedExtensions = map[string]bool{
	".bmp":  true,
	".avi":  true,
	".tiff": true,
	".ico":  true,
	".svg":  true,
	".gif":  true,
	".jpeg": true,
	".jpg":  true,
	".png":  true,
	".heic": true,
	".nef":  true,
	".mov":  true,
	".mp4":  true,
	".m4v":  true,
	".webp": true,
	".webm": true,
}

var videoExtensions = map[string]bool{
	".avi":  true,
	".mov":  true,
	".mp4":  true,
	".m4v":  true,
	".webm": true,
}

var imageExtensions = map[string]bool{
	".bmp":  true,
	".tiff": true,
	".ico":  true,
	".svg":  true,
	".gif":  true,
	".jpeg": true,
	".jpg":  true,
	".png":  true,
	".heic": true,
	".nef":  true,
}

// IndexFiles scans the PhotoRoot and populates the database.
func OldIndexFiles() {
	log.Println("Starting file system index...")
	count := 0

	err := filepath.Walk(PhotoRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			log.Printf("Error accessing path %s: %v\n", path, err)
			return nil // Continue walking even if one file fails
		}

		// Skip directories
		if info.IsDir() {
			return nil
		}

		// Check if the file extension is supported
		ext := strings.ToLower(filepath.Ext(path))
		if supportedExtensions[ext] {
			hash, err := CalculateSHA256Hash(path)
			if err != nil {
				log.Printf("Skipping file %s: Could not calculate hash: %v", path, err)
				return nil // Skip this file, but continue walking
			}
			width, height, takenAt := ReadInitialMetadata(path)

			// fileType determination
			fileType := "unknown"
			if imageExtensions[ext] {
				fileType = "image"
			} else if videoExtensions[ext] {
				fileType = "video"
			}
			// Create a new Photo model
			photo := models.Photo{
				FilePath:      path,
				FileHash:      hash,
				ThumbnailPath: "/thumbnails/" + hash + ext + ".jpg", // Simple placeholder path
				Width:         width,                                // Placeholder
				Height:        height,                               // Placeholder
				TakenAt:       takenAt,
				FileType:      fileType,
			}
			// Insert the record. Use FirstOrCreate to prevent re-inserting existing files.
			result := db.DB.FirstOrCreate(&photo, models.Photo{FileHash: hash})

			if result.Error != nil {
				log.Printf("Error saving %s to database: %v\n", path, result.Error)
			}

			if result.RowsAffected > 0 {
				count++
			}
		}
		return nil
	})

	if err != nil {
		log.Fatalf("Fatal error during file walking: %v", err)
	}

	log.Printf("File system index complete. Added %d new records.", count)
}

// IndexFiles scans the PhotoRoot and populates the database using efficient batch insertion.
func IndexFiles() {
	if !indexingRunning.TryLock() { // TryLock returns false if the lock is already held
		log.Println("Indexing is already running. Skipping request.")
		return
	}
	defer indexingRunning.Unlock()
	log.Println("Starting file system index with batch processing...")

	// Array to hold new photo records before insertion
	var newPhotos []models.Photo

	// Use a map to track existing FileHashes to prevent duplicate inserts during the walk.
	// This is faster than querying the DB thousands of times.
	existingHashes := make(map[string]bool)
	db.DB.Model(&models.Photo{}).Select("file_hash").Find(&existingHashes)

	// Ensure thumbnail directory exists
	if _, err := os.Stat(ThumbnailRoot); os.IsNotExist(err) {
		if err := os.MkdirAll(ThumbnailRoot, 0755); err != nil {
			log.Fatalf("Failed to create thumbnail directory: %v", err)
		}
	}

	err := filepath.Walk(PhotoRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			log.Printf("Error accessing path %s: %v\n", path, err)
			return nil
		}
		if info.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if supportedExtensions[ext] {
			hash, err := CalculateSHA256Hash(path)
			if err != nil {
				log.Printf("Skipping file %s: Could not calculate hash: %v", path, err)
				return nil
			}
			if existingHashes[hash] {
				return nil
			}
			width, height, takenAt := ReadInitialMetadata(path)

			fileType := "unknown"
			if imageExtensions[ext] {
				fileType = "image"
			} else if videoExtensions[ext] {
				fileType = "video"
			}

			// Generate thumbnail for images
			var thumbURL string
			if fileType == "image" {
				thumbFileName := hash + ".jpg"
				thumbDiskPath := filepath.Join(ThumbnailRoot, thumbFileName)
				thumbURL = ThumbnailURLPrefix + thumbFileName
				if _, err := os.Stat(thumbDiskPath); os.IsNotExist(err) {
					img, err := imaging.Open(path)
					if err != nil {
						log.Printf("Failed to open image for thumbnail %s: %v", path, err)
						thumbURL = ""
					} else {
						thumb := imaging.Resize(img, 300, 0, imaging.Lanczos)
						if err := imaging.Save(thumb, thumbDiskPath); err != nil {
							log.Printf("Failed to save thumbnail for %s: %v", path, err)
							thumbURL = ""
						}
					}
				}
			}

			photo := models.Photo{
				FilePath:      path,
				FileHash:      hash,
				ThumbnailPath: thumbURL,
				Width:         width,
				Height:        height,
				TakenAt:       takenAt,
				FileType:      fileType,
			}
			newPhotos = append(newPhotos, photo)
		}
		return nil
	})

	if err != nil {
		log.Fatalf("Fatal error during file walking: %v", err)
	}

	// --- 5. BATCH INSERTION (The Speed Fix!) ---
	if len(newPhotos) > 0 {
		// Insert up to 1000 records at a time
		result := db.DB.CreateInBatches(newPhotos, 1000)

		if result.Error != nil {
			log.Fatalf("Error during batch insert: %v", result.Error)
		}
		log.Printf("File system index complete. Inserted %d new records in batch.", result.RowsAffected)
	} else {
		log.Println("File system index complete. No new records found to insert.")
	}

	// This line is needed to re-index the map for the next run (though usually done on restart)
	db.DB.Model(&models.Photo{}).Select("file_hash").Find(&existingHashes)

}
func UpdateIndexFiles() {
	if !indexingRunning.TryLock() {
		log.Println("Index update already running. Skipping request.")
		return
	}
	defer indexingRunning.Unlock()

	log.Println("Starting file system update check for deletes/moves...")

	var photos []models.Photo
	// 1. Fetch all records (we only need ID and FilePath initially)
	db.DB.Select("id", "file_path", "file_hash").Find(&photos)

	deletedCount := 0
	renamedCount := 0

	// Use a WaitGroup for concurrent file checks
	var wg sync.WaitGroup

	// Create channels for batch processing results
	deleteCh := make(chan uint, 100) // Channel for IDs to delete
	// renameCh  := make(chan models.Photo, 100) // Channel for renamed file updates

	// --- 2. CONCURRENTLY CHECK FILE EXISTENCE ---
	for _, photo := range photos {
		wg.Add(1)
		go func(p models.Photo) {
			defer wg.Done()

			// Check if the file still exists at the recorded path
			if _, err := os.Stat(p.FilePath); os.IsNotExist(err) {

				// File is MISSING. Check if it was RENAMED/MOVED.
				// We do this by calculating the hash of the file at the old path and
				// searching the disk for a file with the same content (same FileHash).
				// *Since that is extremely slow, we'll mark it for deletion for simplicity.*

				// In a full application, you'd trigger a full scan to find the new location
				// using the known FileHash, but that's a massive performance hit.

				// For now: Assume missing path means DELETED.
				deleteCh <- p.ID

			} else if err == nil {
				// File exists. Check if content or path has been modified.

				// Check content modification by comparing hash (slow)
				// For simplicity, we skip content check here as the daily index handles adds.

				// If you wanted to check for content modification:
				// newHash, _ := CalculateSHA256Hash(p.FilePath)
				// if newHash != p.FileHash { /* Handle content change */ }
			}
		}(photo)
	}

	// Wait for all checks to finish
	wg.Wait()
	close(deleteCh)

	// --- 3. BATCH DELETE MISSING RECORDS ---
	var idsToDelete []uint
	for id := range deleteCh {
		idsToDelete = append(idsToDelete, id)
	}

	if len(idsToDelete) > 0 {
		// Use GORM to delete all missing records in one go
		result := db.DB.Delete(&models.Photo{}, idsToDelete)
		deletedCount = int(result.RowsAffected)
		log.Printf("Successfully deleted %d records for missing files.", deletedCount)
	}

	log.Printf("Index update complete. Deleted: %d, Renamed/Updated: %d.", deletedCount, renamedCount)
}

// In services/indexer.go:

// IsIndexingRunning checks if the global index lock is currently held.
func IsIndexingRunning() bool {
	// TryLock returns false if the lock is already held (i.e., running)
	return !indexingRunning.TryLock()
}
