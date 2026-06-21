package service

import (
	"context"

	"gorm.io/gorm"
	"llmapi-dashboard/internal/entities"
	"llmapi-dashboard/internal/repository"
)

type PricingProvider interface {
	ListPricing(context.Context) ([]entities.ModelPriceSetting, error)
}

type pricingService struct {
	db *gorm.DB
}

func NewPricingService(db *gorm.DB) PricingProvider {
	return &pricingService{db: db}
}

func (s *pricingService) ListPricing(context.Context) ([]entities.ModelPriceSetting, error) {
	return repository.ListModelPriceSettings(s.db)
}
