package repository

import (
	"llmapi-dashboard/internal/entities"

	"gorm.io/gorm"
)

func ListActiveAPIKeys(db *gorm.DB) ([]entities.APIKey, error) {
	var rows []entities.APIKey
	err := db.Where("is_deleted = ?", false).Order("id asc").Find(&rows).Error
	return rows, err
}

func FindActiveAPIKeyByID(db *gorm.DB, id int64) (entities.APIKey, error) {
	var row entities.APIKey
	err := db.Where("id = ? AND is_deleted = ?", id, false).First(&row).Error
	return row, err
}
