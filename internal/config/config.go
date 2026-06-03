package config

import (
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

const DefaultTimeZone = "Asia/Shanghai"

var (
	DefaultWorkDir    = filepath.Join(".", "data")
	DefaultSQLitePath = filepath.Join(DefaultWorkDir, "app.db")
	DefaultLogDir     = filepath.Join(DefaultWorkDir, "logs")
)

type Config struct {
	AppPort                string
	AppBasePath            string
	SQLitePath             string
	AvailableModelsBaseURL string
	AvailableModelsAPIKey  string
	TutorialPDFPath        string

	// Deprecated fields kept so lower-level packages and tests that still use the
	// old write-capable helpers can compile while the app wires read-only mode.
	CPAPublicURL             string
	TLSEnabled               bool
	TLSCertFile              string
	TLSKeyFile               string
	CPABaseURL               string
	CPAManagementKey         string
	RedisQueueAddr           string
	RedisQueueTLS            bool
	RedisQueueKey            string
	RedisQueueBatchSize      int
	RedisQueueIdleInterval   time.Duration
	MetadataSyncInterval     time.Duration
	QuotaAutoRefreshEnabled  bool
	QuotaAutoRefreshInterval time.Duration
	QuotaRefreshWorkerLimit  int
	WorkDir                  string
	BackupEnabled            bool
	BackupDir                string
	BackupInterval           time.Duration
	BackupRetentionDays      int
	RequestTimeout           time.Duration
	TLSSkipVerify            bool
	LogLevel                 string
	LogFileEnabled           bool
	LogDir                   string
	LogRetentionDays         int
	AuthEnabled              bool
	LoginPassword            string
	AuthSessionTTL           time.Duration
}

type LoadOptions struct {
	EnvFile string
}

var executableDir = func() (string, error) {
	executablePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Dir(executablePath), nil
}

func LoadFromEnv() (*Config, error) {
	return Load(LoadOptions{})
}

func Load(options LoadOptions) (*Config, error) {
	envBaseDir, err := loadDotEnv(options)
	if err != nil {
		return nil, err
	}
	if err := applyProjectTimeZone(); err != nil {
		return nil, err
	}

	appBasePath, err := normalizeBasePath(strings.TrimSpace(os.Getenv("APP_BASE_PATH")))
	if err != nil {
		return nil, fmt.Errorf("APP_BASE_PATH is invalid: %w", err)
	}

	cfg := &Config{
		AppPort:                getString("APP_PORT", "8080"),
		AppBasePath:            appBasePath,
		SQLitePath:             strings.TrimSpace(os.Getenv("APP_DB_PATH")),
		AvailableModelsBaseURL: strings.TrimSpace(os.Getenv("AVAILABLE_MODELS_BASE_URL")),
		AvailableModelsAPIKey:  strings.TrimSpace(os.Getenv("AVAILABLE_MODELS_API_KEY")),
		TutorialPDFPath:        strings.TrimSpace(os.Getenv("TUTORIAL_PDF_PATH")),
		LogLevel:               "info",
		LogFileEnabled:         false,
		AuthSessionTTL:         7 * 24 * time.Hour,
	}
	if cfg.SQLitePath == "" {
		return nil, fmt.Errorf("APP_DB_PATH is required")
	}
	authEnabled, err := getBool("AUTH_ENABLED", false)
	if err != nil {
		return nil, err
	}
	authSessionTTL, err := getDuration("AUTH_SESSION_TTL", cfg.AuthSessionTTL)
	if err != nil {
		return nil, err
	}
	if authSessionTTL <= 0 {
		return nil, fmt.Errorf("AUTH_SESSION_TTL must be positive")
	}
	cfg.AuthEnabled = authEnabled
	cfg.LoginPassword = strings.TrimSpace(os.Getenv("LOGIN_PASSWORD"))
	cfg.AuthSessionTTL = authSessionTTL
	if cfg.AuthEnabled && cfg.LoginPassword == "" {
		return nil, fmt.Errorf("LOGIN_PASSWORD is required when AUTH_ENABLED is true")
	}
	cfg.resolveRelativePaths(envBaseDir)
	return cfg, nil
}

func applyProjectTimeZone() error {
	zoneName := strings.TrimSpace(os.Getenv("TZ"))
	if zoneName == "" {
		zoneName = DefaultTimeZone
		if err := os.Setenv("TZ", zoneName); err != nil {
			return fmt.Errorf("set default TZ: %w", err)
		}
	}
	location, err := time.LoadLocation(zoneName)
	if err != nil {
		return fmt.Errorf("TZ is invalid: %w", err)
	}
	time.Local = location
	return nil
}

func loadDotEnv(options LoadOptions) (string, error) {
	if strings.TrimSpace(options.EnvFile) != "" {
		return loadDotEnvFile(options.EnvFile, true)
	}

	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}
	if loaded, err := loadOptionalDotEnv(filepath.Join(cwd, ".env")); err != nil || loaded {
		if loaded {
			return cwd, err
		}
		return "", err
	}

	exeDir, err := executableDir()
	if err != nil {
		return "", fmt.Errorf("get executable directory: %w", err)
	}
	loaded, err := loadOptionalDotEnv(filepath.Join(exeDir, ".env"))
	if loaded {
		return exeDir, err
	}
	return "", err
}

func loadOptionalDotEnv(path string) (bool, error) {
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, fmt.Errorf("stat .env: %w", err)
	}
	if err := godotenv.Overload(path); err != nil {
		return false, fmt.Errorf("load .env: %w", err)
	}
	return true, nil
}

func loadDotEnvFile(path string, required bool) (string, error) {
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) && !required {
			return "", nil
		}
		return "", fmt.Errorf("stat env file: %w", err)
	}
	if err := godotenv.Overload(path); err != nil {
		return "", fmt.Errorf("load env file: %w", err)
	}
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve env file path: %w", err)
	}
	return filepath.Dir(absolutePath), nil
}

func (cfg *Config) resolveRelativePaths(baseDir string) {
	if baseDir == "" {
		return
	}
	cfg.SQLitePath = resolveRelativePath(baseDir, cfg.SQLitePath)
	cfg.TutorialPDFPath = resolveRelativePath(baseDir, cfg.TutorialPDFPath)
}

func resolveRelativePath(baseDir, value string) string {
	if value == "" || filepath.IsAbs(value) {
		return value
	}
	return filepath.Join(baseDir, value)
}

func normalizeBasePath(value string) (string, error) {
	if value == "" || value == "/" {
		return "", nil
	}
	if !strings.HasPrefix(value, "/") {
		return "", fmt.Errorf("must start with '/'")
	}

	normalized := path.Clean(value)
	if normalized == "." || normalized == "/" {
		return "", nil
	}
	if !strings.HasPrefix(normalized, "/") {
		normalized = "/" + normalized
	}
	return normalized, nil
}

func getString(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getDuration(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	duration, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a valid duration: %w", key, err)
	}
	return duration, nil
}

func getBool(key string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a valid bool: %w", key, err)
	}
	return parsed, nil
}
