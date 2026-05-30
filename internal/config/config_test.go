package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var configEnvKeys = []string{
	"APP_DB_PATH", "APP_PORT", "APP_BASE_PATH", "TZ",
	"BASE_URL", "KEY", "CPA_BASE_URL", "CPA_MANAGEMENT_KEY", "AUTH_ENABLED", "LOGIN_PASSWORD", "AUTH_SESSION_TTL",
	"WORK_DIR", "LOG_FILE_ENABLED", "BACKUP_ENABLED", "REDIS_QUEUE_ADDR",
}

func TestMain(m *testing.M) {
	previousEnv := make(map[string]string, len(configEnvKeys))
	previousPresent := make(map[string]bool, len(configEnvKeys))
	for _, key := range configEnvKeys {
		previousEnv[key], previousPresent[key] = os.LookupEnv(key)
		if err := os.Unsetenv(key); err != nil {
			panic(err)
		}
	}
	code := m.Run()
	for _, key := range configEnvKeys {
		if previousPresent[key] {
			if err := os.Setenv(key, previousEnv[key]); err != nil {
				panic(err)
			}
			continue
		}
		if err := os.Unsetenv(key); err != nil {
			panic(err)
		}
	}
	os.Exit(code)
}

func withIsolatedEnvFiles(t *testing.T) {
	t.Helper()
	previousEnv := make(map[string]string, len(configEnvKeys))
	previousPresent := make(map[string]bool, len(configEnvKeys))
	for _, key := range configEnvKeys {
		previousEnv[key], previousPresent[key] = os.LookupEnv(key)
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
	}
	t.Cleanup(func() {
		for _, key := range configEnvKeys {
			if previousPresent[key] {
				if err := os.Setenv(key, previousEnv[key]); err != nil {
					t.Fatalf("restore %s: %v", key, err)
				}
				continue
			}
			if err := os.Unsetenv(key); err != nil {
				t.Fatalf("unset %s: %v", key, err)
			}
		}
	})
	cwd := t.TempDir()
	exeDir := t.TempDir()
	previousExecutableDir := executableDir
	previousWorkingDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get cwd: %v", err)
	}
	t.Cleanup(func() {
		executableDir = previousExecutableDir
		if err := os.Chdir(previousWorkingDir); err != nil {
			t.Fatalf("restore cwd: %v", err)
		}
	})
	if err := os.Chdir(cwd); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	executableDir = func() (string, error) { return exeDir, nil }
}

func TestLoadFromEnvAppliesReadOnlyDashboardDefaults(t *testing.T) {
	t.Setenv("APP_DB_PATH", filepath.Join(t.TempDir(), "app.db"))

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}

	if cfg.AppPort != "8080" {
		t.Fatalf("expected default app port 8080, got %s", cfg.AppPort)
	}
	if cfg.AppBasePath != "" {
		t.Fatalf("expected empty default base path, got %q", cfg.AppBasePath)
	}
	if cfg.LogFileEnabled {
		t.Fatal("expected persistent log files disabled in read-only dashboard mode")
	}
	if cfg.CPABaseURL != "" || cfg.CPAManagementKey != "" || cfg.BackupEnabled || cfg.RedisQueueAddr != "" {
		t.Fatalf("expected CPA/backup/redis settings to be unused, got %+v", cfg)
	}
	if cfg.AuthEnabled || cfg.LoginPassword != "" || cfg.AuthSessionTTL != 7*24*time.Hour {
		t.Fatalf("expected login protection defaults to be disabled with 168h TTL, got %+v", cfg)
	}
}

func TestLoadFromEnvRequiresAppDBPath(t *testing.T) {
	withIsolatedEnvFiles(t)

	_, err := LoadFromEnv()
	if err == nil || err.Error() != "APP_DB_PATH is required" {
		t.Fatalf("expected APP_DB_PATH required error, got %v", err)
	}
}

func TestLoadReadsSpecifiedEnvFileAndResolvesDBPath(t *testing.T) {
	withIsolatedEnvFiles(t)
	envDir := t.TempDir()
	envPath := filepath.Join(envDir, "custom.env")
	if err := os.WriteFile(envPath, []byte("APP_DB_PATH=./snapshots/app.db\nAPP_PORT=9091\nAPP_BASE_PATH=/keeper/\n"), 0o600); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	cfg, err := Load(LoadOptions{EnvFile: envPath})
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.SQLitePath != filepath.Join(envDir, "snapshots", "app.db") || cfg.AppPort != "9091" || cfg.AppBasePath != "/keeper" {
		t.Fatalf("unexpected config from env file: %+v", cfg)
	}
}

func TestLoadReadsLoginProtectionEnvVars(t *testing.T) {
	t.Setenv("APP_DB_PATH", filepath.Join(t.TempDir(), "app.db"))
	t.Setenv("CPA_BASE_URL", "https://cpa.example.com")
	t.Setenv("CPA_MANAGEMENT_KEY", "secret")
	t.Setenv("AUTH_ENABLED", "true")
	t.Setenv("LOGIN_PASSWORD", "secret")
	t.Setenv("AUTH_SESSION_TTL", "2h")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}
	if cfg.CPABaseURL != "" || cfg.CPAManagementKey != "" {
		t.Fatalf("expected CPA env vars to be ignored, got %+v", cfg)
	}
	if !cfg.AuthEnabled || cfg.LoginPassword != "secret" || cfg.AuthSessionTTL != 2*time.Hour {
		t.Fatalf("expected login protection env vars to be applied, got %+v", cfg)
	}
}

func TestLoadReadsAvailableModelsEnvVars(t *testing.T) {
	t.Setenv("APP_DB_PATH", filepath.Join(t.TempDir(), "app.db"))
	t.Setenv("BASE_URL", " https://api.openai.com/v1 ")
	t.Setenv("KEY", " sk-test-key ")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}
	if cfg.BaseURL != "https://api.openai.com/v1" || cfg.Key != "sk-test-key" {
		t.Fatalf("expected available model env vars to be applied, got %+v", cfg)
	}
}

func TestLoadRequiresPasswordWhenAuthEnabled(t *testing.T) {
	t.Setenv("APP_DB_PATH", filepath.Join(t.TempDir(), "app.db"))
	t.Setenv("AUTH_ENABLED", "true")

	_, err := LoadFromEnv()
	if err == nil || err.Error() != "LOGIN_PASSWORD is required when AUTH_ENABLED is true" {
		t.Fatalf("expected LOGIN_PASSWORD required error, got %v", err)
	}
}

func TestLoadRejectsMissingSpecifiedEnvFile(t *testing.T) {
	missingPath := filepath.Join(t.TempDir(), "missing.env")

	_, err := Load(LoadOptions{EnvFile: missingPath})
	if err == nil || !strings.Contains(err.Error(), "stat env file") {
		t.Fatalf("expected missing specified env file error, got %v", err)
	}
}

func TestLoadFromEnvAppliesDefaultTimeZone(t *testing.T) {
	previousLocal := time.Local
	t.Cleanup(func() { time.Local = previousLocal })
	t.Setenv("TZ", "")
	t.Setenv("APP_DB_PATH", filepath.Join(t.TempDir(), "app.db"))

	_, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}
	if time.Local.String() != "Asia/Shanghai" {
		t.Fatalf("expected default local timezone Asia/Shanghai, got %s", time.Local)
	}
}

func TestLoadFromEnvRejectsInvalidBasePath(t *testing.T) {
	t.Setenv("APP_DB_PATH", filepath.Join(t.TempDir(), "app.db"))
	t.Setenv("APP_BASE_PATH", "keeper")

	_, err := LoadFromEnv()
	if err == nil || err.Error() != "APP_BASE_PATH is invalid: must start with '/'" {
		t.Fatalf("expected APP_BASE_PATH validation error, got %v", err)
	}
}
