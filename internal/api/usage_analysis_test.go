package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"llmapi-dashboard/internal/entities"
	"llmapi-dashboard/internal/helper"
	"llmapi-dashboard/internal/service"
	servicedto "llmapi-dashboard/internal/service/dto"
)

type usageAnalysisStub struct {
	analysis      *servicedto.AnalysisSnapshot
	err           error
	lastFilter    servicedto.UsageFilter
	analysisCalls int
}

type usageAnalysisAPIKeyStub struct {
	rows []entities.APIKey
	err  error
}

func (s usageAnalysisAPIKeyStub) ListAPIKeys(context.Context) ([]entities.APIKey, error) {
	return s.rows, s.err
}

func (s *usageAnalysisStub) GetUsageOverview(context.Context, servicedto.UsageFilter) (*servicedto.UsageOverviewSnapshot, error) {
	return nil, nil
}

func (s *usageAnalysisStub) ListUsageEvents(context.Context, servicedto.UsageFilter) (*servicedto.UsageEventsPage, error) {
	return nil, nil
}

func (s *usageAnalysisStub) ListUsageEventFilterOptions(context.Context, servicedto.UsageFilter) (*servicedto.UsageEventFilterOptions, error) {
	return nil, nil
}

func (s *usageAnalysisStub) GetAnalysis(_ context.Context, filter servicedto.UsageFilter) (*servicedto.AnalysisSnapshot, error) {
	s.lastFilter = filter
	s.analysisCalls++
	return s.analysis, s.err
}

func newUsageAnalysisTestRouter(provider service.UsageProvider, apiKeyProvider service.APIKeyProvider, authConfig AuthConfig) *gin.Engine {
	return NewReadOnlyRouter(nil, provider, nil, apiKeyProvider, authConfig, nil, "")
}

func TestUsageAnalysisReturnsAggregatedRows(t *testing.T) {
	bucket := time.Date(2026, 4, 22, 10, 0, 0, 0, time.Local)
	provider := &usageAnalysisStub{analysis: &servicedto.AnalysisSnapshot{
		Granularity: servicedto.AnalysisGranularityHourly,
		TokenUsage: []servicedto.AnalysisTokenUsageBucket{{
			Bucket:          bucket,
			InputTokens:     30,
			OutputTokens:    9,
			CachedTokens:    1,
			ReasoningTokens: 2,
			TotalTokens:     42,
			Requests:        2,
		}},
		APIKeyComposition: []servicedto.AnalysisCompositionItem{{
			Key:         "sk-provider123456",
			TotalTokens: 42,
			Requests:    2,
		}},
		APIKeyCostComposition: []servicedto.AnalysisCostCompositionItem{{
			Key:      "sk-provider123456",
			Cost:     0.0042,
			Requests: 2,
		}},
		ModelComposition: []servicedto.AnalysisCompositionItem{{
			Key:         "claude-sonnet",
			TotalTokens: 42,
			Requests:    2,
		}},
		AuthFilesComposition: []servicedto.AnalysisCompositionItem{{
			Key:         "auth-file-1",
			Label:       "Auth File One",
			TotalTokens: 30,
			Requests:    1,
		}},
		AIProviderComposition: []servicedto.AnalysisCompositionItem{{
			Key:         "provider-1",
			Label:       "AI account 1",
			TotalTokens: 12,
			Requests:    1,
		}},
		Heatmap: []servicedto.AnalysisHeatmapCell{{
			APIKey:      "sk-provider123456",
			Model:       "claude-sonnet",
			TotalTokens: 42,
			Requests:    2,
		}},
	}}
	router := newUsageAnalysisTestRouter(provider, nil, AuthConfig{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/usage/analysis?range=24h", nil)
	resp := httptest.NewRecorder()

	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Code)
	}
	body := resp.Body.String()
	if !contains(body, `"granularity":"hourly"`) || !contains(body, `"token_usage":[`) || !contains(body, `"heatmap":`) {
		t.Fatalf("unexpected response body: %s", body)
	}
	if !contains(body, `"api_key_composition":[`) || !contains(body, `"api_key_cost_composition":[`) || !contains(body, `"model_composition":[`) || !contains(body, `"auth_files_composition":[`) || !contains(body, `"ai_provider_composition":[`) {
		t.Fatalf("expected composition payloads in response body: %s", body)
	}
	if !contains(body, `"key":"sk-p*****************3456"`) || !contains(body, `"label":"sk-p*****************3456"`) {
		t.Fatalf("expected redacted api key composition in response body: %s", body)
	}
	if !contains(body, `"key":"aut*********file-1"`) || !contains(body, `"label":"Auth File One"`) || !contains(body, `"percent":100`) {
		t.Fatalf("expected auth file composition in response body: %s", body)
	}
	if !contains(body, `"key":"pro*********ider-1"`) || !contains(body, `"label":"AI account 1"`) || contains(body, "Provider One") || contains(body, "codex account") || contains(body, "openai account") || contains(body, "claude account") {
		t.Fatalf("expected anonymized ai provider composition in response body: %s", body)
	}
	if !contains(body, `"cost":0.0042`) || !contains(body, `"cost_percent":100`) {
		t.Fatalf("expected api key cost composition in response body: %s", body)
	}
	if !contains(body, `"model":"claude-sonnet"`) || !contains(body, `"intensity":1`) {
		t.Fatalf("expected heatmap cell in response body: %s", body)
	}
	if provider.analysisCalls != 1 {
		t.Fatalf("expected GetAnalysis to be called once, got %d", provider.analysisCalls)
	}
	if provider.lastFilter.Range != "24h" {
		t.Fatalf("expected range to be passed through, got %+v", provider.lastFilter)
	}
	if provider.lastFilter.StartTime == nil || provider.lastFilter.EndTime == nil {
		t.Fatalf("expected resolved time bounds in filter, got %+v", provider.lastFilter)
	}
}

func TestUsageAnalysisUsesMaskedAPIKeysInsteadOfAliases(t *testing.T) {
	bucket := time.Date(2026, 4, 22, 10, 0, 0, 0, time.Local)
	lastSyncedAt := time.Date(2026, 5, 13, 10, 0, 0, 0, time.Local)
	provider := &usageAnalysisStub{analysis: &servicedto.AnalysisSnapshot{
		Granularity: servicedto.AnalysisGranularityHourly,
		TokenUsage:  []servicedto.AnalysisTokenUsageBucket{{Bucket: bucket, TotalTokens: 42, Requests: 2}},
		APIKeyComposition: []servicedto.AnalysisCompositionItem{{
			Key:         "sk-alpha123456",
			TotalTokens: 42,
			Requests:    2,
		}},
		ModelComposition: []servicedto.AnalysisCompositionItem{{Key: "claude-sonnet", TotalTokens: 42, Requests: 2}},
		Heatmap: []servicedto.AnalysisHeatmapCell{{
			APIKey:      "sk-alpha123456",
			Model:       "claude-sonnet",
			TotalTokens: 42,
			Requests:    2,
		}},
	}}
	router := newUsageAnalysisTestRouter(provider, usageAnalysisAPIKeyStub{rows: []entities.APIKey{{
		ID:           1,
		APIKey:       "sk-alpha123456",
		DisplayKey:   "sk-*********123456",
		KeyAlias:     "Primary Key",
		LastSyncedAt: &lastSyncedAt,
	}}}, AuthConfig{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/usage/analysis?range=24h&api_key_id=1", nil)
	resp := httptest.NewRecorder()

	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Code)
	}
	body := resp.Body.String()
	if !contains(body, `"key":"1"`) || !contains(body, `"label":"sk-a*****************3456"`) || !contains(body, `"api_key":"sk-a*****************3456"`) {
		t.Fatalf("expected analysis payload to use API key id and masked key label, got %s", body)
	}
	if contains(body, "Primary Key") || contains(body, "sk-alpha123456") || contains(body, "sk-*********123456") {
		t.Fatalf("expected alias, raw key, and stale masks to stay hidden, got %s", body)
	}
	if provider.lastFilter.APIKeyID != "1" {
		t.Fatalf("expected API key id to pass into usage filter, got %+v", provider.lastFilter)
	}
}

func TestBuildAnalysisHeatmapPayloadSortsKeysByRequests(t *testing.T) {
	payload := buildAnalysisHeatmapPayload([]servicedto.AnalysisHeatmapCell{
		{APIKey: "sk-low123456", Model: "model-low", Requests: 1, TotalTokens: 100},
		{APIKey: "sk-high654321", Model: "model-high", Requests: 5, TotalTokens: 50},
		{APIKey: "sk-high654321", Model: "model-low", Requests: 2, TotalTokens: 20},
	}, nil)

	if got := payload.APIKeys; len(got) != 2 || got[0] != helper.MaskAPIKeyForDisplay("sk-high654321") || got[1] != helper.MaskAPIKeyForDisplay("sk-low123456") {
		t.Fatalf("expected api keys sorted by total requests desc, got %+v", got)
	}
	if got := payload.Models; len(got) != 2 || got[0] != "model-high" || got[1] != "model-low" {
		t.Fatalf("expected models sorted by total requests desc, got %+v", got)
	}
}

func TestUsageAnalysisRequiresAuthWhenEnabled(t *testing.T) {
	router := newUsageAnalysisTestRouter(&usageAnalysisStub{}, nil, AuthConfig{Enabled: true, LoginPassword: "secret", SessionTTL: time.Hour})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/usage/analysis", nil)
	resp := httptest.NewRecorder()

	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", resp.Code)
	}
}
