package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"

	"cpa-usage-keeper/internal/api"
	"cpa-usage-keeper/internal/auth"
	"cpa-usage-keeper/internal/config"
	"cpa-usage-keeper/internal/logging"
	"cpa-usage-keeper/internal/poller"
	"cpa-usage-keeper/internal/repository"
	"cpa-usage-keeper/internal/service"
	webui "cpa-usage-keeper/web"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Runner 是 App 后台任务的最小接口，具体语义由字段名和实现方法表达。
type Runner interface {
	Run(ctx context.Context) error
}

// StatusProvider 只提供运行状态，不作为后台 runner 启动。
type StatusProvider interface {
	Status() poller.Status
}

type Options struct {
	EnvFile string
}

type QuotaRunner interface {
	SetRefreshContext(context.Context)
	StopRefreshTasks()
	WaitRefreshTasks()
	StartAutoRefresh(context.Context) error
}

type App struct {
	Config            *config.Config
	DB                *gorm.DB
	Router            *gin.Engine
	Poller            StatusProvider
	RedisIngest       Runner
	RedisProcess      Runner
	Maintenance       *StorageCleanupRunner
	MetadataSync      *MetadataSyncRunner
	QuotaService      QuotaRunner
	QuotaAutoRefresh  QuotaRunner
	BackupMaintenance *DatabaseBackupRunner
	LogCloser         io.Closer

	backgroundCancel context.CancelFunc
	backgroundWG     sync.WaitGroup
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
	cpaAPIKeyService := service.NewCPAAPIKeyService(db)
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
			cpaAPIKeyService,
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

	a.stopBackgroundTasks()
	if a.QuotaService != nil {
		a.QuotaService.StopRefreshTasks()
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

func (a *App) startBackgroundContext() context.Context {
	ctx, cancel := context.WithCancel(context.Background())
	a.backgroundCancel = cancel
	return ctx
}

func (a *App) startBackgroundTask(run func()) {
	a.backgroundWG.Add(1)
	go func() {
		defer a.backgroundWG.Done()
		run()
	}()
}

func (a *App) stopBackgroundTasks() {
	if a.backgroundCancel != nil {
		a.backgroundCancel()
		a.backgroundCancel = nil
	}
	a.backgroundWG.Wait()
}
