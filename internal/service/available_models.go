package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type AvailableModelsProvider interface {
	FetchAvailableModels(context.Context) ([]string, error)
}

type availableModelsService struct {
	baseURL    string
	key        string
	httpClient *http.Client
}

func NewAvailableModelsService(baseURL, key string) AvailableModelsProvider {
	return &availableModelsService{
		baseURL: strings.TrimSpace(baseURL),
		key:     strings.TrimSpace(key),
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (s *availableModelsService) FetchAvailableModels(ctx context.Context) ([]string, error) {
	if s == nil || s.baseURL == "" || s.key == "" {
		return []string{}, nil
	}
	endpoint, err := normalizeModelsEndpoint(s.baseURL)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create models request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.key)
	req.Header.Set("Accept", "application/json")

	client := s.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch available models: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch available models returned status %d", resp.StatusCode)
	}

	var raw json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode available models: %w", err)
	}
	return parseAvailableModels(raw)
}

func normalizeModelsEndpoint(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("AVAILABLE_MODELS_BASE_URL is required")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("AVAILABLE_MODELS_BASE_URL must be an absolute URL")
	}
	path := strings.TrimRight(parsed.Path, "/")
	switch {
	case path == "":
		parsed.Path = "/v1/models"
	case path == "/v1":
		parsed.Path = "/v1/models"
	case strings.HasSuffix(path, "/models"):
		parsed.Path = path
	default:
		parsed.Path = path + "/v1/models"
	}
	return parsed.String(), nil
}

func parseAvailableModels(raw json.RawMessage) ([]string, error) {
	var array []string
	if err := json.Unmarshal(raw, &array); err == nil {
		return normalizeModelNames(array), nil
	}

	var openAIResponse struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &openAIResponse); err != nil {
		return nil, fmt.Errorf("decode available models payload: %w", err)
	}
	models := make([]string, 0, len(openAIResponse.Data))
	for _, item := range openAIResponse.Data {
		models = append(models, item.ID)
	}
	return normalizeModelNames(models), nil
}

func normalizeModelNames(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	models := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		models = append(models, trimmed)
	}
	sort.Strings(models)
	return models
}
