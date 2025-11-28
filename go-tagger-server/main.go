package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"go-tagger/db"
	"go-tagger/handlers"
	"go-tagger/services" // <-- Ensure this is imported

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

const clientDistPath = "../go-tagger-client/dist"

func init() {
	// Load .env file before the main function or any global variables are initialized.
	err := godotenv.Load()
	if err != nil {
		log.Println("Warning: Could not load .env file. Using system environment variables.")
	}
}
func main() {
	args := os.Args

	// check .env for THUMBNAIL_ROOT and PHOTO_ROOT
	log.Printf("PHOTO_ROOT: %s", os.Getenv("PHOTO_ROOT"))
	log.Printf("THUMBNAIL_ROOT: %s", os.Getenv("THUMBNAIL_ROOT"))
	db.Init()
	services.InitExifTool()

	if len(args) > 1 && args[1] == "index" {
		services.IndexFiles()
		return
	}

	r := gin.Default()

	// Register media routes BEFORE NoRoute handler (both GET and HEAD)
	r.GET("/media/photos/:hash", handlers.HandleServeOriginalPhoto)
	r.HEAD("/media/photos/:hash", handlers.HandleServeOriginalPhoto)
	r.GET("/media/thumbnails/:hash", handlers.HandleServeThumbnail)
	r.HEAD("/media/thumbnails/:hash", handlers.HandleServeThumbnail)

	if info, err := os.Stat(clientDistPath); err == nil && info.IsDir() {
		assetsDir := filepath.Join(clientDistPath, "assets")
		if _, err := os.Stat(assetsDir); err == nil {
			r.Static("/assets", assetsDir)
		}

		indexFile := filepath.Join(clientDistPath, "index.html")
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/media/") {
				c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
				return
			}

			candidate := filepath.Join(clientDistPath, strings.TrimPrefix(path, "/"))
			if fileInfo, err := os.Stat(candidate); err == nil && !fileInfo.IsDir() {
				c.File(candidate)
				return
			}

			c.File(indexFile)
		})
	} else {
		log.Printf("client build directory not available, skipped static hosting: %v", err)
	}

	api := r.Group("/api")
	{
		api.POST("/photos/batch/tags", handlers.HandleBatchTagging)
		api.POST("/photos/batch/people", handlers.HandleBatchPeopleTagging)
		api.GET("/photos", handlers.HandleGetPhotos)
		api.GET("/photos/:id", handlers.HandleGetPhotoByID)
		api.POST("/photos/:id/tags", handlers.HandleAddTagsToPhoto)
		api.PATCH("/photos/:id/tags", handlers.HandleUpdateTagsOfPhoto)
		api.POST("/index", handlers.HandleIndexing)
		api.PATCH("/index", handlers.HandleUpdateIndexing)
	}

	// 4. Run the Server
	r.Run(":" + os.Getenv("SERVER_PORT")) // Application runs on http://localhost:5080
}
