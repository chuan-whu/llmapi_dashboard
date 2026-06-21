package service

import (
	"context"

	"llmapi-dashboard/internal/entities"
	"llmapi-dashboard/internal/repository"

	"gorm.io/gorm"
)

type APIKeyProvider interface {
	ListAPIKeys(ctx context.Context) ([]entities.APIKey, error)
}

type APIKeyService struct {
	db *gorm.DB
}

func NewAPIKeyService(db *gorm.DB) APIKeyProvider {
	return &APIKeyService{db: db}
}

func (s *APIKeyService) ListAPIKeys(context.Context) ([]entities.APIKey, error) {
	return repository.ListActiveAPIKeys(s.db)
}
