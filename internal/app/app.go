package app

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"llmapi-dashboard/internal/api"
	"llmapi-dashboard/internal/auth"
	"llmapi-dashboard/internal/config"
	"llmapi-dashboard/internal/logging"
	"llmapi-dashboard/internal/repository"
	"llmapi-dashboard/internal/service"
	webui "llmapi-dashboard/web"
)

type Options struct {
	EnvFile string
}

type App struct {
	Config    *config.Config
	DB        *gorm.DB
	Router    *gin.Engine
	LogCloser io.Closer
}

func New() (*App, error) {
	return NewWithOptions(Options{})
}

func NewWithOptions(options Options) (*App, error) {
	cfg, err := config.Load(config.LoadOptions{EnvFile: options.EnvFile})
	if err != nil {
		return nil, err
	}

	return NewWithConfig(*cfg)
}

func NewWithConfig(cfg config.Config) (*App, error) {
	logCloser, err := logging.Configure(cfg)
	if err != nil {
		return nil, err
	}

	db, err := repository.OpenReadOnlyDatabase(cfg)
	if err != nil {
		_ = logCloser.Close()
		return nil, err
	}

	usageService := service.NewUsageService(db)
	usageIdentityService := service.NewUsageIdentityService(db)
	apiKeyService := service.NewAPIKeyService(db)
	pricingService := service.NewPricingService(db)
	availableModelsService := service.NewAvailableModelsService(cfg.AvailableModelsBaseURL, cfg.AvailableModelsAPIKey)
	ohMyGPTQueryService := service.NewOhMyGPTQueryService(cfg.OhMyGPTQueryURL, cfg.OhMyGPTQueryToken)
	dailyQuotaService := service.NewDailyQuotaQueryService(cfg.DailyQuotaQueryCommand, cfg.DailyQuotaQueryWorkDir, cfg.DailyQuotaCacheTTL)
	sessionManager := auth.NewSessionManager(cfg.AuthSessionTTL)
	authConfig := api.AuthConfig{
		Enabled:       cfg.AuthEnabled,
		LoginPassword: cfg.LoginPassword,
		SessionTTL:    cfg.AuthSessionTTL,
		BasePath:      cfg.AppBasePath,
	}
	authHandler := api.NewAuthHandler(authConfig, sessionManager)

	return &App{
		Config:    &cfg,
		DB:        db,
		LogCloser: logCloser,
		Router: api.NewReadOnlyRouter(
			webui.Static,
			usageService,
			usageIdentityService,
			apiKeyService,
			authConfig,
			authHandler,
			cfg.AppBasePath,
			api.TutorialPDFConfig{Path: cfg.TutorialPDFPath},
			pricingService,
			availableModelsService,
			ohMyGPTQueryService,
			dailyQuotaService,
		),
	}, nil
}

func closeGormDB(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

func (a *App) Close() error {
	if a == nil {
		return nil
	}

	var closeErr error
	if a.DB != nil {
		closeErr = errors.Join(closeErr, closeGormDB(a.DB))
		a.DB = nil
	}
	if a.LogCloser != nil {
		closeErr = errors.Join(closeErr, a.LogCloser.Close())
		a.LogCloser = nil
	}
	return closeErr
}

func (a *App) Run() error {
	if a == nil || a.Router == nil || a.Config == nil {
		return fmt.Errorf("application is not initialized")
	}

	server := &http.Server{
		Addr:    ":" + a.Config.AppPort,
		Handler: a.Router,
	}
	return server.ListenAndServe()
}
