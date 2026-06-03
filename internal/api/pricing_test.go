package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cpa-usage-keeper/internal/entities"
	"cpa-usage-keeper/internal/service"
	servicedto "cpa-usage-keeper/internal/service/dto"
)

type pricingStub struct {
	usedModels []string
	pricing    []entities.ModelPriceSetting
	updated    *entities.ModelPriceSetting
	lastUpdate *servicedto.UpdatePricingInput
	deleted    string
	err        error
}

func (s pricingStub) ListUsedModels(context.Context) ([]string, error) {
	return s.usedModels, s.err
}

func (s pricingStub) ListPricing(context.Context) ([]entities.ModelPriceSetting, error) {
	return s.pricing, s.err
}

func (s *pricingStub) UpdatePricing(_ context.Context, input servicedto.UpdatePricingInput) (*entities.ModelPriceSetting, error) {
	s.lastUpdate = &input
	return s.updated, s.err
}

func (s *pricingStub) DeletePricing(_ context.Context, model string) error {
	s.deleted = model
	return s.err
}

func TestPricingRoutesReturnEmptyResponsesWithoutProvider(t *testing.T) {
	router := NewRouter(nil, nil, nil, nil, AuthConfig{}, nil, "")

	usedReq := httptest.NewRequest(http.MethodGet, "/api/v1/models/used", nil)
	usedResp := httptest.NewRecorder()
	router.ServeHTTP(usedResp, usedReq)
	if usedResp.Code != http.StatusOK || !contains(usedResp.Body.String(), `"models":[]`) {
		t.Fatalf("unexpected used models response: %d %s", usedResp.Code, usedResp.Body.String())
	}

	pricingReq := httptest.NewRequest(http.MethodGet, "/api/v1/pricing", nil)
	pricingResp := httptest.NewRecorder()
	router.ServeHTTP(pricingResp, pricingReq)
	if pricingResp.Code != http.StatusOK || !contains(pricingResp.Body.String(), `"pricing":[]`) {
		t.Fatalf("unexpected pricing response: %d %s", pricingResp.Code, pricingResp.Body.String())
	}
}

func TestPricingRoutesReturnConfiguredData(t *testing.T) {
	router := NewRouter(nil, nil, nil, &pricingStub{
		usedModels: []string{"claude-sonnet"},
		pricing: []entities.ModelPriceSetting{{
			Model:                "claude-sonnet",
			PromptPricePer1M:     3,
			CompletionPricePer1M: 15,
			CachePricePer1M:      0.3,
		}},
	}, AuthConfig{}, nil, "")

	usedReq := httptest.NewRequest(http.MethodGet, "/api/v1/models/used", nil)
	usedResp := httptest.NewRecorder()
	router.ServeHTTP(usedResp, usedReq)
	if usedResp.Code != http.StatusOK || !contains(usedResp.Body.String(), `claude-sonnet`) {
		t.Fatalf("unexpected used models response: %d %s", usedResp.Code, usedResp.Body.String())
	}

	pricingReq := httptest.NewRequest(http.MethodGet, "/api/v1/pricing", nil)
	pricingResp := httptest.NewRecorder()
	router.ServeHTTP(pricingResp, pricingReq)
	if pricingResp.Code != http.StatusOK || !contains(pricingResp.Body.String(), `"prompt_price_per_1m":3`) {
		t.Fatalf("unexpected pricing response: %d %s", pricingResp.Code, pricingResp.Body.String())
	}
}

func TestUpdatePricingRoute(t *testing.T) {
	provider := &pricingStub{
		updated: &entities.ModelPriceSetting{
			Model:                "claude-sonnet",
			PromptPricePer1M:     3,
			CompletionPricePer1M: 15,
			CachePricePer1M:      0.3,
		},
	}
	router := NewRouter(nil, nil, nil, provider, AuthConfig{}, nil, "")

	req := httptest.NewRequest(http.MethodPut, "/api/v1/pricing/claude-sonnet", strings.NewReader(`{"prompt_price_per_1m":3,"completion_price_per_1m":15,"cache_price_per_1m":0.3}`))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK || !contains(resp.Body.String(), `"model":"claude-sonnet"`) {
		t.Fatalf("unexpected update response: %d %s", resp.Code, resp.Body.String())
	}
}

func TestUpdatePricingRouteAcceptsModelInBody(t *testing.T) {
	provider := &pricingStub{
		updated: &entities.ModelPriceSetting{
			Model:                "openai/gpt-4.1",
			PromptPricePer1M:     3,
			CompletionPricePer1M: 15,
			CachePricePer1M:      0.3,
		},
	}
	router := NewRouter(nil, nil, nil, provider, AuthConfig{}, nil, "")

	req := httptest.NewRequest(http.MethodPut, "/api/v1/pricing", strings.NewReader(`{"model":"openai/gpt-4.1","prompt_price_per_1m":3,"completion_price_per_1m":15,"cache_price_per_1m":0.3}`))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK || !contains(resp.Body.String(), `"model":"openai/gpt-4.1"`) {
		t.Fatalf("unexpected update response: %d %s", resp.Code, resp.Body.String())
	}
	if provider.lastUpdate == nil || provider.lastUpdate.Model != "openai/gpt-4.1" {
		t.Fatalf("expected model from body to be passed through, got %+v", provider.lastUpdate)
	}
}

func TestDeletePricingRoute(t *testing.T) {
	provider := &pricingStub{}
	router := NewRouter(nil, nil, nil, provider, AuthConfig{}, nil, "")

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/pricing?model=openai%2Fgpt-4.1", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d %s", resp.Code, resp.Body.String())
	}
	if provider.deleted != "openai/gpt-4.1" {
		t.Fatalf("expected model to be deleted, got %q", provider.deleted)
	}
}

func TestReadOnlyPricingRoutesExposeOnlyGetEndpoints(t *testing.T) {
	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "", &pricingStub{
		pricing: []entities.ModelPriceSetting{{
			Model:                "gpt-5",
			PromptPricePer1M:     1.25,
			CompletionPricePer1M: 5.5,
			CachePricePer1M:      0.2,
		}},
	}, staticAvailableModelsFetcher{models: []string{"gpt-5", "gpt-5-mini"}})

	pricingReq := httptest.NewRequest(http.MethodGet, "/api/v1/pricing", nil)
	pricingResp := httptest.NewRecorder()
	router.ServeHTTP(pricingResp, pricingReq)
	if pricingResp.Code != http.StatusOK || !contains(pricingResp.Body.String(), `"model":"gpt-5"`) || !contains(pricingResp.Body.String(), `"prompt_price_per_1m":1.25`) {
		t.Fatalf("unexpected read-only pricing response: %d %s", pricingResp.Code, pricingResp.Body.String())
	}

	modelsReq := httptest.NewRequest(http.MethodGet, "/api/v1/models/available", nil)
	modelsResp := httptest.NewRecorder()
	router.ServeHTTP(modelsResp, modelsReq)
	if modelsResp.Code != http.StatusOK || modelsResp.Body.String() != `{"models":["gpt-5","gpt-5-mini"]}` {
		t.Fatalf("unexpected available models response: %d %s", modelsResp.Code, modelsResp.Body.String())
	}

	for _, testCase := range []struct {
		method string
		path   string
	}{
		{method: http.MethodPut, path: "/api/v1/pricing"},
		{method: http.MethodPut, path: "/api/v1/pricing/gpt-5"},
		{method: http.MethodDelete, path: "/api/v1/pricing?model=gpt-5"},
	} {
		resp := httptest.NewRecorder()
		req := httptest.NewRequest(testCase.method, testCase.path, strings.NewReader(`{"model":"gpt-5"}`))
		router.ServeHTTP(resp, req)
		if resp.Code != http.StatusNotFound {
			t.Fatalf("%s %s expected 404 in read-only router, got %d %s", testCase.method, testCase.path, resp.Code, resp.Body.String())
		}
	}
}

func TestReadOnlyModelQueryRouteUsesOhMyGPTProvider(t *testing.T) {
	provider := &ohMyGPTQueryStub{
		response: serviceOhMyGPTResponse("张三"),
	}
	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "", provider)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/models/query", strings.NewReader(`{"apiKey":" sk-test "}`))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK || !contains(resp.Body.String(), `"remark":"张三"`) {
		t.Fatalf("unexpected model query response: %d %s", resp.Code, resp.Body.String())
	}
	if provider.apiKey != "sk-test" {
		t.Fatalf("expected trimmed API key to be passed through, got %q", provider.apiKey)
	}
}

type staticAvailableModelsFetcher struct {
	models []string
	err    error
}

func (s staticAvailableModelsFetcher) FetchAvailableModels(context.Context) ([]string, error) {
	return s.models, s.err
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

func serviceOhMyGPTResponse(remark string) service.OhMyGPTQueryResponse {
	return service.OhMyGPTQueryResponse{
		StatusCode: 200,
		Message:    "ok",
		Data: []service.OhMyGPTAPIKeyToken{{
			Key:         "sk-*************************************************6dc",
			Remark:      remark,
			CreatedAt:   "2025-07-30T07:31:10.000Z",
			UsedAt:      nil,
			ExpiredAt:   "2035-07-28T07:26:00.000Z",
			UsedTimes:   "1",
			UsedFee:     "90.00",
			MaxFee:      "25000.00",
			Permissions: []string{"gpt-5"},
			IsDisabled:  false,
		}},
	}
}
