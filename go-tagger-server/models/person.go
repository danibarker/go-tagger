package models

import "gorm.io/gorm"

type Person struct {
	gorm.Model
	Name   string  `gorm:"type:varchar(100);not null;uniqueIndex" json:"name"`
	Photos []Photo `gorm:"many2many:photo_people;" json:"photos"`
}
