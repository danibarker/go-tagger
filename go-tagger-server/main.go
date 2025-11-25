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
)

const clientDistPath = "../go-tagger-client/dist"

func main() {
	args := os.Args

	db.Init()
	services.InitExifTool()

	if len(args) > 1 && args[1] == "index" {
		services.IndexFiles()
		return
	}

	r := gin.Default()

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

	r.GET("/media/photos/:hash", handlers.HandleServeOriginalPhoto)
	r.GET("/media/thumbnails/:hash", handlers.HandleServeThumbnail)

	api := r.Group("/api")
	{
		api.POST("/photos/batch/tags", handlers.HandleBatchTagging)
		api.GET("/photos", handlers.HandleGetPhotos)
		api.GET("/photos/:id", handlers.HandleGetPhotoByID)
		api.POST("/photos/:id/tags", handlers.HandleAddTagsToPhoto)
		api.PATCH("/photos/:id/tags", handlers.HandleUpdateTagsOfPhoto)
		api.POST("/index", handlers.HandleIndexing)
		api.PATCH("/index", handlers.HandleUpdateIndexing)
	}

	// 4. Run the Server
	r.Run(":8080") // Application runs on http://localhost:8080
}
