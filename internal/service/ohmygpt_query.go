package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
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

var ohMyGPTAPIKeySuffixPattern = regexp.MustCompile(`[A-Za-z0-9_-]{3,}$`)

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
		return OhMyGPTQueryResponse{}, fmt.Errorf("create Oh My GPT query request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Accept", "application/json")

	client := s.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return OhMyGPTQueryResponse{}, fmt.Errorf("query Oh My GPT quota: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return OhMyGPTQueryResponse{}, fmt.Errorf("query Oh My GPT quota returned status %d", resp.StatusCode)
	}

	var result OhMyGPTQueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return OhMyGPTQueryResponse{}, fmt.Errorf("decode Oh My GPT query response: %w", err)
	}
	result.Data = filterOhMyGPTTokensByAPIKey(result.Data, trimmedAPIKey)
	return result, nil
}

func filterOhMyGPTTokensByAPIKey(tokens []OhMyGPTAPIKeyToken, apiKey string) []OhMyGPTAPIKeyToken {
	suffix := apiKeySuffix(apiKey)
	if suffix == "" {
		return tokens
	}
	filtered := make([]OhMyGPTAPIKeyToken, 0, len(tokens))
	for _, token := range tokens {
		if strings.HasSuffix(token.Key, suffix) {
			filtered = append(filtered, token)
		}
	}
	return filtered
}

func apiKeySuffix(apiKey string) string {
	trimmed := strings.TrimSpace(apiKey)
	if trimmed == "" {
		return ""
	}
	match := ohMyGPTAPIKeySuffixPattern.FindString(trimmed)
	if len(match) < 3 {
		return ""
	}
	if len(match) <= 3 {
		return match
	}
	return match[len(match)-3:]
}
