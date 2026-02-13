package services

import (
	"fmt"
	"go-tagger/db"
	"go-tagger/models"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/disintegration/imaging"
	"github.com/joho/godotenv"
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp" // Register WebP format
	"gorm.io/gorm/clause"
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

// Performance monitoring
var (
	EnablePerfMonitoring = true
	perfHashingTime      int64 // nanoseconds
	perfMetadataTime     int64
	perfDBTime           int64
	perfFileWalkTime     int64
	perfTotalFiles       int64
	perfStartTime        time.Time
)

func resetPerfCounters() {
	atomic.StoreInt64(&perfHashingTime, 0)
	atomic.StoreInt64(&perfMetadataTime, 0)
	atomic.StoreInt64(&perfDBTime, 0)
	atomic.StoreInt64(&perfFileWalkTime, 0)
	atomic.StoreInt64(&perfTotalFiles, 0)
	perfStartTime = time.Now()
}

func logPerfStats() {
	if !EnablePerfMonitoring {
		return
	}
	elapsed := time.Since(perfStartTime)
	totalFiles := atomic.LoadInt64(&perfTotalFiles)
	hashTime := time.Duration(atomic.LoadInt64(&perfHashingTime))
	metaTime := time.Duration(atomic.LoadInt64(&perfMetadataTime))
	dbTime := time.Duration(atomic.LoadInt64(&perfDBTime))
	walkTime := time.Duration(atomic.LoadInt64(&perfFileWalkTime))

	log.Printf("=== PERFORMANCE STATS ===")
	log.Printf("Total elapsed time: %v", elapsed)
	log.Printf("Files processed: %d", totalFiles)
	if totalFiles > 0 {
		log.Printf("Throughput: %.2f files/sec", float64(totalFiles)/elapsed.Seconds())
	}
	log.Printf("Time in hash calculation: %v (%.1f%%)", hashTime, float64(hashTime)/float64(elapsed)*100)
	log.Printf("Time in metadata reading: %v (%.1f%%)", metaTime, float64(metaTime)/float64(elapsed)*100)
	log.Printf("Time in database ops: %v (%.1f%%)", dbTime, float64(dbTime)/float64(elapsed)*100)
	log.Printf("Time in file walking: %v (%.1f%%)", walkTime, float64(walkTime)/float64(elapsed)*100)
	unaccounted := elapsed - hashTime - metaTime - dbTime - walkTime
	log.Printf("Unaccounted time: %v (%.1f%%)", unaccounted, float64(unaccounted)/float64(elapsed)*100)
	log.Printf("========================")
}

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
	".webp": true,
}

func init() {
	err := godotenv.Load()
	if err != nil {
		log.Println("Warning: Could not load .env file. Using system environment variables.")
	}
	PhotoRoot = os.Getenv("PHOTO_ROOT")
	ThumbnailRoot = os.Getenv("THUMBNAIL_ROOT")
}

// GenerateImageThumbnailFFmpeg uses ffmpeg to generate a thumbnail from an image file (including WebP VP8X)
func GenerateImageThumbnailFFmpeg(imagePath, thumbnailPath string) error {
	// Use ffmpeg to convert and resize the image
	// -i: input file
	// -vf scale=300:-1: resize to width 300, maintain aspect ratio
	// -frames:v 1: extract only 1 frame (for animated formats)
	cmd := exec.Command("ffmpeg",
		"-i", imagePath,
		"-vf", "scale=300:-1",
		"-frames:v", "1",
		"-y", // Overwrite output file if exists
		thumbnailPath,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg error: %v, output: %s", err, string(output))
	}
	return nil
}

// GenerateImageThumbnail uses the imaging library to generate a thumbnail from an image file
func GenerateImageThumbnail(imagePath, thumbnailPath string) error {
	img, err := imaging.Open(imagePath)
	if err != nil {
		return fmt.Errorf("failed to open image: %v", err)
	}
	thumb := imaging.Resize(img, 300, 0, imaging.Lanczos)
	if err := imaging.Save(thumb, thumbnailPath); err != nil {
		return fmt.Errorf("failed to save thumbnail: %v", err)
	}
	return nil
}

// GenerateVideoThumbnail uses ffmpeg to extract a thumbnail from a video file
func GenerateVideoThumbnail(videoPath, thumbnailPath string) error {
	// Use ffmpeg to extract a frame at 1 second into the video
	// -i: input file
	// -ss: seek to position (1 second)
	// -vframes 1: extract only 1 frame
	// -vf scale=300:-1: resize to width 300, maintain aspect ratio
	cmd := exec.Command("ffmpeg",
		"-i", videoPath,
		"-ss", "00:00:01",
		"-vframes", "1",
		"-vf", "scale=300:-1",
		"-y", // Overwrite output file if exists
		thumbnailPath,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg error: %v, output: %s", err, string(output))
	}
	return nil
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
			width, height, takenAt, _, _ := ReadInitialMetadata(path)

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

	resetPerfCounters()
	defer logPerfStats()

	// Array to hold new photo records before insertion
	var newPhotos []models.Photo
	var photosMutex sync.Mutex
	processedCount := 0
	skippedCount := 0
	var counterMutex sync.Mutex

	// Store metadata for newly indexed photos (hash -> {tags, people})
	type photoMetadata struct {
		tags   []string
		people []string
	}
	photoMetadataMap := make(map[string]photoMetadata)
	var metadataMutex sync.Mutex
	var metadataSampleCount int64

	// 1. Fetch all existing hashes into a simple string slice
	var existingHashesSlice []string
	if err := db.DB.Model(&models.Photo{}).Select("file_hash").Find(&existingHashesSlice).Error; err != nil {
		log.Fatalf("Failed to fetch existing hashes from DB: %v", err)
	}

	// 2. Convert the slice to a map for O(1) fast lookup during file walk
	existingHashes := make(map[string]bool)
	for _, hash := range existingHashesSlice {
		existingHashes[hash] = true
	}
	// Ensure thumbnail directory exists
	fmt.Printf("Thumbnail root: %s\n", ThumbnailRoot)
	if _, err := os.Stat(ThumbnailRoot); os.IsNotExist(err) {
		if err := os.MkdirAll(ThumbnailRoot, 0755); err != nil {
			log.Fatalf("Failed to create thumbnail directory: %v", err)
		}
	}

	// Worker pool for concurrent file processing
	type fileJob struct {
		path string
		info os.FileInfo
		ext  string
	}

	jobs := make(chan fileJob, 1000)
	var wg sync.WaitGroup

	// Start worker goroutines
	numWorkers := 20 // Process 20 files concurrently
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				// Measure hash calculation time
				hashStart := time.Now()
				hash, err := CalculateSHA256Hash(job.path)
				if EnablePerfMonitoring {
					atomic.AddInt64(&perfHashingTime, int64(time.Since(hashStart)))
					atomic.AddInt64(&perfTotalFiles, 1)
				}

				if err != nil {
					log.Printf("Skipping file %s: Could not calculate hash: %v", job.path, err)
					continue
				}

				counterMutex.Lock()
				processedCount++
				currentProcessed := processedCount
				counterMutex.Unlock()

				if currentProcessed%1000 == 0 {
					counterMutex.Lock()
					log.Printf("Progress: Processed %d files, found %d new photos, skipped %d duplicates", processedCount, len(newPhotos), skippedCount)
					counterMutex.Unlock()
					if EnablePerfMonitoring {
						logPerfStats()
					}
				}

				if existingHashes[hash] {
					counterMutex.Lock()
					skippedCount++
					counterMutex.Unlock()
					continue
				}

				// Measure metadata reading time
				metaStart := time.Now()
				width, height, takenAt, tags, people := ReadInitialMetadata(job.path)
				if EnablePerfMonitoring {
					atomic.AddInt64(&perfMetadataTime, int64(time.Since(metaStart)))
				}

				// Store metadata for later association
				if len(tags) > 0 || len(people) > 0 {
					if atomic.AddInt64(&metadataSampleCount, 1) <= 10 {
						maxItems := 10
						tagsSample := tags
						peopleSample := people
						truncatedTags := false
						truncatedPeople := false
						if len(tags) > maxItems {
							tagsSample = tags[:maxItems]
							truncatedTags = true
						}
						if len(people) > maxItems {
							peopleSample = people[:maxItems]
							truncatedPeople = true
						}
						log.Printf("Metadata sample: %s (tags=%d, people=%d, tagsSample=%v, peopleSample=%v, truncatedTags=%t, truncatedPeople=%t)", job.path, len(tags), len(people), tagsSample, peopleSample, truncatedTags, truncatedPeople)
					}
					metadataMutex.Lock()
					photoMetadataMap[hash] = photoMetadata{tags: tags, people: people}
					metadataMutex.Unlock()
				}

				fileType := "unknown"
				if imageExtensions[job.ext] {
					fileType = "image"
				} else if videoExtensions[job.ext] {
					fileType = "video"
				}

				// Set thumbnail URL path (generate lazily on-demand during serving, not during indexing)
				thumbFileName := hash + ".jpg"
				thumbURL := ThumbnailURLPrefix + thumbFileName

				photo := models.Photo{
					FilePath:      job.path,
					FileHash:      hash,
					ThumbnailPath: thumbURL,
					Width:         width,
					Height:        height,
					FileSize:      job.info.Size(),
					TakenAt:       takenAt,
					FileType:      fileType,
				}

				// Add to batch
				photosMutex.Lock()
				newPhotos = append(newPhotos, photo)
				currentLen := len(newPhotos)
				photosMutex.Unlock()

				// Batch insert when we reach 1000 photos
				if currentLen >= 1000 {
					photosMutex.Lock()
					if len(newPhotos) >= 1000 {
						batch := newPhotos[:1000]
						newPhotos = newPhotos[1000:]
						photosMutex.Unlock()

						dbStart := time.Now()
						result := db.DB.Clauses(clause.OnConflict{
							Columns:   []clause.Column{{Name: "file_hash"}},
							DoNothing: true,
						}).CreateInBatches(batch, 1000)
						if EnablePerfMonitoring {
							atomic.AddInt64(&perfDBTime, int64(time.Since(dbStart)))
						}

						if result.Error != nil {
							log.Printf("Error during chunk batch insert: %v", result.Error)
						}
						log.Printf("Inserted %d photos in chunk.", result.RowsAffected)
					} else {
						photosMutex.Unlock()
					}
				}
			}
		}()
	}

	fileWalkStart := time.Now()
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
			// Send job to worker pool
			jobs <- fileJob{path: path, info: info, ext: ext}
		}
		return nil
	})
	if EnablePerfMonitoring {
		atomic.AddInt64(&perfFileWalkTime, int64(time.Since(fileWalkStart)))
	}

	close(jobs) // No more jobs
	wg.Wait()   // Wait for all workers to finish

	if err != nil {
		log.Fatalf("Fatal error during file walking: %v", err)
	}

	log.Printf("File walk complete. Processed %d files total, found %d new photos, skipped %d existing", processedCount, len(newPhotos), skippedCount)

	// --- 5. BATCH INSERTION (The Speed Fix!) ---
	if len(newPhotos) > 0 {
		dbStart := time.Now()
		// Insert up to 1000 records at a time
		result := db.DB.Clauses(clause.OnConflict{
			// Check for conflict on file_hash (the unique content identifier)
			Columns: []clause.Column{{Name: "file_hash"}},
			// If a conflict occurs, do nothing and continue to the next record
			DoNothing: true,
		}).CreateInBatches(newPhotos, len(newPhotos)) // Insert the remainder
		if EnablePerfMonitoring {
			atomic.AddInt64(&perfDBTime, int64(time.Since(dbStart)))
		}
		if result.Error != nil {
			log.Printf("Error during batch insert: %v", result.Error)
			// Don't crash the server, just log and continue
		}
		log.Printf("File system index complete. Inserted %d new records. Total processed: %d, Skipped: %d", result.RowsAffected, processedCount, skippedCount)
	} else {
		log.Printf("File system index complete. No new records found to insert. Total processed: %d, All skipped: %d", processedCount, skippedCount)
	}

	// --- 6. IMPORT EXISTING METADATA (TAGS AND PEOPLE) ---
	if len(photoMetadataMap) > 0 {
		log.Printf("Importing existing metadata for %d photos...", len(photoMetadataMap))

		// Collect all hashes that have metadata
		var hashesWithMetadata []string
		for hash := range photoMetadataMap {
			hashesWithMetadata = append(hashesWithMetadata, hash)
		}

		// Query photos by hash to get their IDs
		var photosWithMetadata []models.Photo
		db.DB.Where("file_hash IN ?", hashesWithMetadata).Find(&photosWithMetadata)
		log.Printf("Metadata import: loaded %d photos for %d hashes.", len(photosWithMetadata), len(hashesWithMetadata))

		// Create a map of hash -> photo ID for quick lookup
		hashToPhotoID := make(map[string]uint)
		for _, photo := range photosWithMetadata {
			hashToPhotoID[photo.FileHash] = photo.ID
		}

		// Collect all unique tag and people names
		tagSet := make(map[string]bool)
		peopleSet := make(map[string]bool)
		for _, metadata := range photoMetadataMap {
			for _, tag := range metadata.tags {
				tagSet[tag] = true
			}
			for _, person := range metadata.people {
				peopleSet[person] = true
			}
		}

		log.Printf("Metadata import: unique tags=%d, people=%d", len(tagSet), len(peopleSet))
		// Find or create all tags
		tagNameToID := make(map[string]uint)
		for tagName := range tagSet {
			var tag models.Tag
			db.DB.FirstOrCreate(&tag, models.Tag{Name: tagName})
			tagNameToID[tagName] = tag.ID
		}

		// Find or create all people
		personNameToID := make(map[string]uint)
		for personName := range peopleSet {
			var person models.Person
			db.DB.FirstOrCreate(&person, models.Person{Name: personName})
			personNameToID[personName] = person.ID
		}

		// Create associations
		for hash, metadata := range photoMetadataMap {
			photoID, exists := hashToPhotoID[hash]
			if !exists {
				log.Printf("Metadata import: photo hash not found in DB: %s", hash)
				continue
			}

			// Associate tags
			for _, tagName := range metadata.tags {
				tagID := tagNameToID[tagName]
				// PostgreSQL-compatible upsert to avoid duplicate key errors
				result := db.DB.Exec("INSERT INTO photo_tags (photo_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING", photoID, tagID)
				if result.Error != nil {
					log.Printf("Failed to link tag '%s' to photo %d: %v", tagName, photoID, result.Error)
				}
			}

			// Associate people
			for _, personName := range metadata.people {
				personID := personNameToID[personName]
				result := db.DB.Exec("INSERT INTO photo_people (photo_id, person_id) VALUES (?, ?) ON CONFLICT DO NOTHING", photoID, personID)
				if result.Error != nil {
					log.Printf("Failed to link person '%s' to photo %d: %v", personName, photoID, result.Error)
				}
			}
		}

		log.Printf("Metadata import complete. Processed %d tags and %d people.", len(tagSet), len(peopleSet))
	}
}
func UpdateIndexFiles() {
	indexingRunning.Lock() // This blocks if another index is running.
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
	// TryLock attempts to acquire the lock. If successful, the lock was free.
	if indexingRunning.TryLock() {
		// Immediately release the lock we just acquired, because we only wanted to check the status.
		indexingRunning.Unlock()
		return false // The indexer is NOT running.
	}
	// If TryLock fails, the lock is already held by another function (IndexFiles).
	return true // The indexer IS running.
}
