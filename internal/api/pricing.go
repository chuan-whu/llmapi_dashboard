package api

import (
	"net/http"
	"strings"

	"llmapi-dashboard/internal/entities"
	"llmapi-dashboard/internal/service"

	"github.com/gin-gonic/gin"
)

type usedModelsResponse struct {
	Models []string `json:"models"`
}

type pricingEntryResponse struct {
	Model                string  `json:"model"`
	PromptPricePer1M     float64 `json:"prompt_price_per_1m"`
	CompletionPricePer1M float64 `json:"completion_price_per_1m"`
	CachePricePer1M      float64 `json:"cache_price_per_1m"`
}

type pricingListResponse struct {
	Pricing []pricingEntryResponse `json:"pricing"`
}

type modelInfoQueryRequest struct {
	APIKey string `json:"apiKey"`
}

func registerReadOnlyPricingRoutes(router gin.IRoutes, pricingProvider service.PricingProvider) {
	router.GET("/pricing", func(c *gin.Context) {
		if pricingProvider == nil {
			c.JSON(http.StatusOK, pricingListResponse{Pricing: []pricingEntryResponse{}})
			return
		}
		settings, err := pricingProvider.ListPricing(c.Request.Context())
		if err != nil {
			writeInternalError(c, "list pricing failed", err)
			return
		}
		c.JSON(http.StatusOK, pricingListResponse{Pricing: pricingSettingsResponse(settings)})
	})
}

func registerAvailableModelsRoutes(router gin.IRoutes, provider service.AvailableModelsProvider) {
	router.GET("/models/available", func(c *gin.Context) {
		if provider == nil {
			c.JSON(http.StatusOK, usedModelsResponse{Models: []string{}})
			return
		}
		models, err := provider.FetchAvailableModels(c.Request.Context())
		if err != nil {
			writeInternalError(c, "fetch available models failed", err)
			return
		}
		c.JSON(http.StatusOK, usedModelsResponse{Models: models})
	})
}

func registerOhMyGPTQueryRoutes(router gin.IRoutes, provider service.OhMyGPTQueryProvider) {
	router.POST("/models/query", func(c *gin.Context) {
		if provider == nil {
			c.JSON(http.StatusNotImplemented, gin.H{"error": "OhMyGPT query provider is not configured"})
			return
		}
		var request modelInfoQueryRequest
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		apiKey := strings.TrimSpace(request.APIKey)
		if apiKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "apiKey is required"})
			return
		}
		result, err := provider.QueryAPIKey(c.Request.Context(), apiKey)
		if err != nil {
			if strings.Contains(err.Error(), "required") {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			writeInternalError(c, "query OhMyGPT quota failed", err)
			return
		}
		c.JSON(http.StatusOK, result)
	})
}

func pricingSettingsResponse(settings []entities.ModelPriceSetting) []pricingEntryResponse {
	response := make([]pricingEntryResponse, 0, len(settings))
	for _, setting := range settings {
		response = append(response, pricingEntryResponse{
			Model:                setting.Model,
			PromptPricePer1M:     setting.PromptPricePer1M,
			CompletionPricePer1M: setting.CompletionPricePer1M,
			CachePricePer1M:      setting.CachePricePer1M,
		})
	}
	return response
}
