package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type OhMyGPTQueryProvider interface {
	QueryAPIKey(context.Context, string) (OhMyGPTQueryResponse, error)
}

type OhMyGPTQueryResponse struct {
	StatusCode int                  `json:"statusCode"`
	Message    string               `json:"message"`
	Data       []OhMyGPTAPIKeyToken `json:"data"`
}

type OhMyGPTAPIKeyToken struct {
	Key         string   `json:"key"`
	Remark      string   `json:"remark"`
	CreatedAt   string   `json:"created_at"`
	UsedAt      *string  `json:"used_at"`
	ExpiredAt   string   `json:"expired_at"`
	UsedTimes   string   `json:"used_times"`
	UsedFee     string   `json:"used_fee"`
	MaxFee      string   `json:"max_fee"`
	Permissions []string `json:"permissions"`
	IsDisabled  bool     `json:"is_disabled"`
}

type ohMyGPTQueryService struct {
	endpoint   string
	token      string
	httpClient *http.Client
}

func NewOhMyGPTQueryService(endpoint, token string) OhMyGPTQueryProvider {
	return &ohMyGPTQueryService{
		endpoint: strings.TrimSpace(endpoint),
		token:    strings.TrimSpace(token),
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (s *ohMyGPTQueryService) QueryAPIKey(ctx context.Context, apiKey string) (OhMyGPTQueryResponse, error) {
	if s == nil || s.endpoint == "" || s.token == "" {
		return OhMyGPTQueryResponse{}, fmt.Errorf("OHMYGPT_QUERY_URL and OHMYGPT_QUERY_TOKEN are required")
	}
	trimmedAPIKey := strings.TrimSpace(apiKey)
	if trimmedAPIKey == "" {
		return OhMyGPTQueryResponse{}, fmt.Errorf("apiKey is required")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, nil)
	if err != nil {
		return OhMyGPTQueryResponse{}, fmt.Errorf("create OhMyGPT query request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Accept", "application/json")

	client := s.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return OhMyGPTQueryResponse{}, fmt.Errorf("query OhMyGPT quota: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return OhMyGPTQueryResponse{}, fmt.Errorf("query OhMyGPT quota returned status %d", resp.StatusCode)
	}

	var result OhMyGPTQueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return OhMyGPTQueryResponse{}, fmt.Errorf("decode OhMyGPT query response: %w", err)
	}
	result.Data = filterOhMyGPTTokensByAPIKey(result.Data, trimmedAPIKey)
	return result, nil
}

func filterOhMyGPTTokensByAPIKey(tokens []OhMyGPTAPIKeyToken, apiKey string) []OhMyGPTAPIKeyToken {
	targetKey := strings.TrimSpace(apiKey)
	if targetKey == "" {
		return tokens
	}
	filtered := make([]OhMyGPTAPIKeyToken, 0, len(tokens))
	for _, token := range tokens {
		if strings.TrimSpace(token.Key) == targetKey {
			filtered = append(filtered, token)
		}
	}
	return filtered
}
