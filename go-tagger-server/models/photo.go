package models

import (
	"time"

	// Required for PostgreSQL array types
	"gorm.io/gorm"
)

// Photo is the model for a single image record in the database.
type Photo struct {
	// GORM.Model includes ID, CreatedAt, UpdatedAt, and DeletedAt
	gorm.Model

	// Essential File Data
	FilePath string `gorm:"type:text;not null;uniqueIndex" json:"file_path"`
	FileHash string `gorm:"type:varchar(64);not null;uniqueIndex" json:"file_hash"` // Used to detect duplicates

	// Web Display Data
	ThumbnailPath string `gorm:"type:varchar(255)" json:"thumbnail_path"`
	Width         int    `gorm:"not null" json:"width"`
	Height        int    `gorm:"not null" json:"height"`

	FileType string `gorm:"type:varchar(8);not null" json:"file_type"` // e.g., image, video

	// Tags and Metadata (The Bulk Editing Target)
	// Uses pq.StringArray to map Go's []string to PostgreSQL's TEXT ARRAY type.
	Tags   []Tag    `gorm:"many2many:photo_tags;" json:"tags"`
	People []Person `gorm:"many2many:photo_people;" json:"people"`

	// Custom fields for bulk renaming, e.g.
	CustomTitle string `gorm:"type:varchar(255)" json:"custom_title"`

	// Metadata from the file itself (optional but useful)
	TakenAt time.Time `json:"taken_at"`

	// Soft delete flag
	MarkedForDeletion bool `gorm:"default:false" json:"marked_for_deletion"`
}
