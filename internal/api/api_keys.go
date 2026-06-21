package api

import (
	"net/http"
	"strconv"

	"llmapi-dashboard/internal/entities"
	"llmapi-dashboard/internal/helper"
	"llmapi-dashboard/internal/service"
	"llmapi-dashboard/internal/timeutil"

	"github.com/gin-gonic/gin"
)

type APIKeyResponse struct {
	ID           string  `json:"id"`
	KeyAlias     string  `json:"keyAlias"`
	DisplayKey   string  `json:"displayKey"`
	Label        string  `json:"label"`
	LastSyncedAt *string `json:"lastSyncedAt"`
}

type APIKeyListResponse struct {
	Items []APIKeyResponse `json:"items"`
}

type APIKeyOption struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type APIKeyOptionsResponse struct {
	Options []APIKeyOption `json:"options"`
}

func registerAPIKeyOptionRoutes(router gin.IRoutes, provider service.APIKeyProvider) {
	router.GET("/usage/api-keys/options", func(c *gin.Context) {
		rows, err := listAPIKeyOptionRows(c, provider)
		if err != nil {
			return
		}
		c.JSON(http.StatusOK, APIKeyOptionsResponse{Options: rows})
	})
}

func listAPIKeyRows(c *gin.Context, provider service.APIKeyProvider) ([]APIKeyResponse, error) {
	if provider == nil {
		return []APIKeyResponse{}, nil
	}
	rows, err := provider.ListAPIKeys(c.Request.Context())
	if err != nil {
		writeInternalError(c, "list api keys failed", err)
		return nil, err
	}
	response := make([]APIKeyResponse, 0, len(rows))
	for _, row := range rows {
		response = append(response, toAPIKeyResponse(row))
	}
	return response, nil
}

func listAPIKeyOptionRows(c *gin.Context, provider service.APIKeyProvider) ([]APIKeyOption, error) {
	if provider == nil {
		return []APIKeyOption{}, nil
	}
	rows, err := provider.ListAPIKeys(c.Request.Context())
	if err != nil {
		writeInternalError(c, "list api key options failed", err)
		return nil, err
	}
	response := make([]APIKeyOption, 0, len(rows))
	for _, row := range rows {
		response = append(response, toAPIKeyOption(row))
	}
	return response, nil
}

func toAPIKeyResponse(row entities.APIKey) APIKeyResponse {
	displayKey := helper.APIKeyMaskedDisplayKey(row)
	var lastSyncedAt *string
	if row.LastSyncedAt != nil {
		value := timeutil.FormatStorageTime(*row.LastSyncedAt)
		lastSyncedAt = &value
	}
	return APIKeyResponse{
		ID:           strconv.FormatInt(row.ID, 10),
		KeyAlias:     "",
		DisplayKey:   displayKey,
		Label:        displayKey,
		LastSyncedAt: lastSyncedAt,
	}
}

func toAPIKeyOption(row entities.APIKey) APIKeyOption {
	label := helper.APIKeyMaskedDisplayKey(row)
	return APIKeyOption{
		ID:    strconv.FormatInt(row.ID, 10),
		Label: label,
	}
}
