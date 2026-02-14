package handlers
package handlers

import (
	"net/http"

	"go-tagger/services"

	"github.com/gin-gonic/gin"
)

// HandleImportMetadataFromFiles reads metadata from files and imports tags/people into the database.
func HandleImportMetadataFromFiles(c *gin.Context) {
	if services.IsIndexingRunning() {
		c.JSON(http.StatusConflict, gin.H{"error": "Indexing is running. Try again when indexing completes."})
		return
	}

	processed, withMetadata, err := services.ImportMetadataFromFiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to import metadata from files: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":              "Metadata import complete.",
		"photos_scanned":       processed,
		"photos_with_metadata": withMetadata,
	})
}
