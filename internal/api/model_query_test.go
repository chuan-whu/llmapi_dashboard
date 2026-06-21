package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"llmapi-dashboard/internal/service"
)

func TestReadOnlyModelQueryRouteUsesOhMyGPTProvider(t *testing.T) {
	provider := &ohMyGPTQueryStub{
		response: service.OhMyGPTQueryResponse{
			StatusCode: 200,
			Message:    "ok",
			Data: []service.OhMyGPTAPIKeyToken{{
				Key:         "sk-live-full-value-alpha",
				Remark:      "user-a",
				CreatedAt:   "2025-07-30T07:31:10.000Z",
				ExpiredAt:   "2035-07-28T07:26:00.000Z",
				UsedTimes:   "1",
				UsedFee:     "90.00",
				MaxFee:      "25000.00",
				Permissions: []string{"gpt-5"},
			}},
		},
	}
	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "", provider)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/models/query", strings.NewReader(`{"apiKey":" sk-live-full-value-alpha "}`))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK || !strings.Contains(resp.Body.String(), `"remark":"user-a"`) {
		t.Fatalf("unexpected model query response: %d %s", resp.Code, resp.Body.String())
	}
	if provider.apiKey != "sk-live-full-value-alpha" {
		t.Fatalf("expected trimmed API key to be passed through, got %q", provider.apiKey)
	}
}

type ohMyGPTQueryStub struct {
	apiKey   string
	response service.OhMyGPTQueryResponse
	err      error
}

func (s *ohMyGPTQueryStub) QueryAPIKey(_ context.Context, apiKey string) (service.OhMyGPTQueryResponse, error) {
	s.apiKey = apiKey
	return s.response, s.err
}
