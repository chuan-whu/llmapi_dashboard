package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"llmapi-dashboard/internal/auth"
	"llmapi-dashboard/internal/service"
)

func TestReadOnlyDailyQuotaRouteReturnsProviderResult(t *testing.T) {
	provider := &dailyQuotaProviderStub{
		response: service.DailyQuotaResponse{
			Status:       "partial",
			DailyRefresh: service.DailyQuotaBalance{Status: "ok", Remaining: "135.75"},
			PayAsYouGo:   service.DailyQuotaBalance{Status: "failed"},
		},
	}
	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "", provider)

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/daily-quota", nil)
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK || resp.Body.String() != `{"status":"partial","daily_refresh":{"status":"ok","remaining":"135.75"},"pay_as_you_go":{"status":"failed"}}` {
		t.Fatalf("unexpected daily quota response: %d %s", resp.Code, resp.Body.String())
	}
	if provider.calls != 1 {
		t.Fatalf("expected provider to be called once, got %d", provider.calls)
	}
}

func TestReadOnlyDailyQuotaRouteReturnsFailedWithoutProvider(t *testing.T) {
	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "")

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/daily-quota", nil)
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK || resp.Body.String() != `{"status":"failed"}` {
		t.Fatalf("unexpected daily quota response without provider: %d %s", resp.Code, resp.Body.String())
	}
}

func TestDailyQuotaRouteRequiresAdminSessionWhenAuthEnabled(t *testing.T) {
	authConfig := AuthConfig{Enabled: true, LoginPassword: "secret", SessionTTL: time.Hour}
	router := NewReadOnlyRouter(nil, nil, nil, nil, authConfig, NewAuthHandler(authConfig, auth.NewSessionManager(time.Hour)), "", &dailyQuotaProviderStub{
		response: service.DailyQuotaResponse{
			Status:       "ok",
			DailyRefresh: service.DailyQuotaBalance{Status: "ok", Remaining: "1.00"},
			PayAsYouGo:   service.DailyQuotaBalance{Status: "ok", Remaining: "2.00"},
		},
	})

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/daily-quota", nil)
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d body=%s", resp.Code, resp.Body.String())
	}
}

type dailyQuotaProviderStub struct {
	response service.DailyQuotaResponse
	calls    int
}

func (s *dailyQuotaProviderStub) GetDailyQuota(context.Context) service.DailyQuotaResponse {
	s.calls++
	return s.response
}
