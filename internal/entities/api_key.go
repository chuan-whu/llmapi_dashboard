package entities

import "time"

// APIKey stores API keys used by usage filters and analysis.
type APIKey struct {
	ID           int64  `gorm:"primaryKey"`
	APIKey       string `gorm:"uniqueIndex:uniq_api_keys_api_key"`
	DisplayKey   string
	KeyAlias     string
	IsDeleted    bool       `gorm:"index:idx_api_keys_is_deleted"`
	LastSyncedAt *time.Time `gorm:"serializer:storageTime"`
	CreatedAt    time.Time  `gorm:"serializer:storageTime"`
	UpdatedAt    time.Time  `gorm:"serializer:storageTime"`
}

func (APIKey) TableName() string {
	return "cpa_api_keys"
}
