package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cpa-usage-keeper/internal/config"
	"cpa-usage-keeper/internal/entities"
	"cpa-usage-keeper/internal/repository"
	"gorm.io/gorm"
)

func TestAppCloseClosesDatabase(t *testing.T) {
	app, err := NewWithConfig(testAppConfig(t))
	if err != nil {
		t.Fatalf("NewWithConfig returned error: %v", err)
	}
	sqlDB, err := app.DB.DB()
	if err != nil {
		t.Fatalf("load sql db: %v", err)
	}

	if err := app.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}

	if err := sqlDB.Ping(); err == nil {
		t.Fatal("expected database ping to fail after app close")
	}
}

func TestNewWithConfigBuildsReadOnlyDashboardOnly(t *testing.T) {
	app, err := NewWithConfig(testAppConfig(t))
	if err != nil {
		t.Fatalf("NewWithConfig returned error: %v", err)
	}
	defer app.Close()

	if app.Poller != nil || app.RedisIngest != nil || app.RedisProcess != nil || app.Maintenance != nil || app.MetadataSync != nil || app.QuotaService != nil || app.QuotaAutoRefresh != nil || app.BackupMaintenance != nil {
		t.Fatalf("expected read-only app to skip CPA/background runners, got %+v", app)
	}
	if app.Router == nil || app.LogCloser == nil || app.DB == nil {
		t.Fatalf("expected router, log closer, and db to be initialized, got %+v", app)
	}
}

func TestNewWithConfigOpensDatabaseReadOnly(t *testing.T) {
	app, err := NewWithConfig(testAppConfig(t))
	if err != nil {
		t.Fatalf("NewWithConfig returned error: %v", err)
	}
	defer app.Close()

	err = app.DB.Create(&entities.UsageEvent{EventKey: "write-through-app"}).Error
	if err == nil {
		t.Fatal("expected writes through app database to fail")
	}
}

func TestReadOnlyRouterKeepsDashboardEndpointsAndDropsCPADependentEndpoints(t *testing.T) {
	app, err := NewWithConfig(testAppConfig(t))
	if err != nil {
		t.Fatalf("NewWithConfig returned error: %v", err)
	}
	defer app.Close()

	for _, testCase := range []struct {
		method string
		path   string
		status int
	}{
		{method: http.MethodGet, path: "/api/v1/status", status: http.StatusOK},
		{method: http.MethodGet, path: "/api/v1/usage/overview?range=8h", status: http.StatusOK},
		{method: http.MethodGet, path: "/api/v1/usage/analysis?range=8h", status: http.StatusOK},
		{method: http.MethodGet, path: "/api/v1/usage/events?range=8h", status: http.StatusOK},
		{method: http.MethodGet, path: "/api/v1/usage/events/filters/models", status: http.StatusOK},
		{method: http.MethodGet, path: "/api/v1/usage/events/filters/sources", status: http.StatusOK},
		{method: http.MethodGet, path: "/api/v1/usage/api-keys/options", status: http.StatusOK},
		{method: http.MethodGet, path: "/api/v1/usage/identities/page?auth_type=2", status: http.StatusOK},
		{method: http.MethodGet, path: "/api/v1/models/available", status: http.StatusOK},
		{method: http.MethodGet, path: "/api/v1/pricing", status: http.StatusOK},
		{method: http.MethodPut, path: "/api/v1/pricing", status: http.StatusNotFound},
		{method: http.MethodDelete, path: "/api/v1/pricing?model=gpt-5", status: http.StatusNotFound},
		{method: http.MethodGet, path: "/api/v1/auth/session", status: http.StatusOK},
		{method: http.MethodPost, path: "/api/v1/auth/logout", status: http.StatusNoContent},
		{method: http.MethodPost, path: "/api/v1/auth/api-key-login", status: http.StatusNotFound},
		{method: http.MethodGet, path: "/api/v1/key-overview?range=8h", status: http.StatusNotFound},
		{method: http.MethodPost, path: "/api/v1/quota/refresh", status: http.StatusNotFound},
		{method: http.MethodGet, path: "/api/v1/update/check", status: http.StatusNotFound},
	} {
		resp := httptest.NewRecorder()
		req := httptest.NewRequest(testCase.method, testCase.path, nil)
		app.Router.ServeHTTP(resp, req)
		if resp.Code != testCase.status {
			t.Fatalf("%s %s expected status %d, got %d body=%s", testCase.method, testCase.path, testCase.status, resp.Code, resp.Body.String())
		}
	}
}

func TestReadOnlyRouterProtectsDashboardEndpointsWhenAuthEnabled(t *testing.T) {
	cfg := testAppConfig(t)
	cfg.AuthEnabled = true
	cfg.LoginPassword = "secret"
	cfg.AuthSessionTTL = time.Hour
	app, err := NewWithConfig(cfg)
	if err != nil {
		t.Fatalf("NewWithConfig returned error: %v", err)
	}
	defer app.Close()

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/usage/overview?range=8h", nil)
	app.Router.ServeHTTP(resp, req)
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated overview to return 401, got %d body=%s", resp.Code, resp.Body.String())
	}

	loginResp := httptest.NewRecorder()
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(`{"password":"secret"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	app.Router.ServeHTTP(loginResp, loginReq)
	if loginResp.Code != http.StatusNoContent {
		t.Fatalf("expected login status 204, got %d body=%s", loginResp.Code, loginResp.Body.String())
	}

	authedResp := httptest.NewRecorder()
	authedReq := httptest.NewRequest(http.MethodGet, "/api/v1/usage/overview?range=8h", nil)
	for _, cookie := range loginResp.Result().Cookies() {
		authedReq.AddCookie(cookie)
	}
	app.Router.ServeHTTP(authedResp, authedReq)
	if authedResp.Code != http.StatusOK {
		t.Fatalf("expected authenticated overview to return 200, got %d body=%s", authedResp.Code, authedResp.Body.String())
	}
}

func TestStatusIsLocalOnly(t *testing.T) {
	app, err := NewWithConfig(testAppConfig(t))
	if err != nil {
		t.Fatalf("NewWithConfig returned error: %v", err)
	}
	defer app.Close()

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	app.Router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Code)
	}
	body := resp.Body.String()
	for _, forbidden := range []string{"cpa_public_url", "last_run_at", "last_error"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("expected local status response not to include %q, got %s", forbidden, body)
		}
	}
}

func testAppConfig(t *testing.T) config.Config {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "app.db")
	seedDashboardDatabase(t, dbPath)
	return config.Config{
		AppPort:        "8080",
		AppBasePath:    "",
		SQLitePath:     dbPath,
		LogLevel:       "info",
		LogFileEnabled: false,
	}
}

func seedDashboardDatabase(t *testing.T, dbPath string) {
	t.Helper()
	db, err := repository.OpenDatabase(config.Config{SQLitePath: dbPath})
	if err != nil {
		t.Fatalf("OpenDatabase returned error: %v", err)
	}
	closeDatabaseNow(t, db)
}

func closeDatabaseNow(t *testing.T, db *gorm.DB) {
	t.Helper()
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("load sql database: %v", err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatalf("close database: %v", err)
	}
}
