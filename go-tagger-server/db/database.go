package db

import (
	"go-tagger/models"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Init() {
	// Connection string for the Docker PostgreSQL container
	dsn := "host=localhost user=user password=password dbname=photo_db port=5433 sslmode=disable TimeZone=America/Denver"

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})

	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Automatically migrate the Photo struct to create/update the table
	DB.AutoMigrate(&models.Photo{})
	log.Println("Database connection successful and schema migrated.")
}
