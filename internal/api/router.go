package api

import (
	"bytes"
	"context"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"cpa-usage-keeper/internal/poller"
	"cpa-usage-keeper/internal/quota"
	"cpa-usage-keeper/internal/service"
	"cpa-usage-keeper/internal/timeutil"
	"cpa-usage-keeper/internal/updatecheck"
	"cpa-usage-keeper/internal/version"
	"github.com/gin-gonic/gin"
)

const appBasePathPlaceholder = "__APP_BASE_PATH__"
const tutorialPDFURLPlaceholder = "__TUTORIAL_PDF_URL__"
const tutorialPDFRoutePath = "/api/v1/tutorial.pdf"

type StatusProvider interface {
	Status() poller.Status
}

type ActiveStatusRecorder interface {
	RecordActiveStatus(time.Time)
}

type QuotaProvider interface {
	GetCachedQuota(context.Context, quota.CacheRequest) (quota.CacheResponse, error)
	Refresh(context.Context, quota.RefreshRequest) (quota.RefreshResponse, error)
	GetRefreshTaskByAuthIndex(context.Context, string) (quota.RefreshTaskResponse, error)
}

type StatusRouteConfig struct {
	CPAPublicURL   string
	ActiveRecorder ActiveStatusRecorder
}

type TutorialPDFConfig struct {
	Path string
}

type OptionalProviders struct {
	UsageIdentity   service.UsageIdentityProvider
	Quota           QuotaProvider
	CPAAPIKeys      service.CPAAPIKeyProvider
	Status          StatusRouteConfig
	TutorialPDFPath string
}

func NewReadOnlyRouter(
	staticFS fs.FS,
	usageProvider service.UsageProvider,
	usageIdentityProvider service.UsageIdentityProvider,
	cpaAPIKeyProvider service.CPAAPIKeyProvider,
	authConfig AuthConfig,
	authHandler *authHandler,
	basePath string,
	readOnlyProviders ...any,
) *gin.Engine {
	router := gin.New()
	_ = router.SetTrustedProxies(nil)
	router.Use(gin.Recovery())

	appGroup := router.Group(basePath)
	registerHealthRoutes(appGroup)

	apiV1 := appGroup.Group("/api/v1")
	apiV1.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
	})

	authGroup := apiV1.Group("/auth")
	if authHandler == nil {
		authHandler = NewAuthHandler(authConfig, nil)
	}
	authGroup.GET("/session", authHandler.getSession)
	authGroup.POST("/login", authHandler.login)
	authGroup.POST("/logout", authHandler.logout)

	protected := apiV1.Group("")
	protected.Use(authHandler.adminMiddleware())
	var pricingProvider service.PricingProvider
	var availableModelsProvider service.AvailableModelsProvider
	var tutorialPDFConfig TutorialPDFConfig
	for _, provider := range readOnlyProviders {
		if typed, ok := provider.(service.PricingProvider); ok {
			pricingProvider = typed
		}
		if typed, ok := provider.(service.AvailableModelsProvider); ok {
			availableModelsProvider = typed
		}
		if typed, ok := provider.(TutorialPDFConfig); ok {
			tutorialPDFConfig = typed
		}
	}
	registerReadOnlyStatusRoute(protected)
	registerTutorialPDFRoute(protected, tutorialPDFConfig)
	registerUsageOverviewRoute(protected, usageProvider)
	registerUsageAnalysisRoute(protected, usageProvider, cpaAPIKeyProvider)
	registerUsageEventsRoute(protected, usageProvider, usageIdentityProvider, cpaAPIKeyProvider)
	registerUsageIdentityRoutes(protected, usageIdentityProvider)
	registerCPAAPIKeyOptionRoutes(protected, cpaAPIKeyProvider)
	registerReadOnlyPricingRoutes(protected, pricingProvider)
	registerAvailableModelsRoutes(protected, availableModelsProvider)
	registerStaticRoutes(router, appGroup, staticFS, basePath, tutorialPDFConfig)
	return router
}

func NewRouter(
	staticFS fs.FS,
	statusProvider StatusProvider,
	usageProvider service.UsageProvider,
	pricingProvider service.PricingProvider,
	authConfig AuthConfig,
	authHandler *authHandler,
	basePath string,
	optionalProviders ...OptionalProviders,
) *gin.Engine {
	router := gin.New()
	_ = router.SetTrustedProxies(nil)
	router.Use(gin.Recovery())

	appGroup := router.Group(basePath)
	registerHealthRoutes(appGroup)

	apiV1 := appGroup.Group("/api/v1")
	apiV1.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
	})

	authGroup := apiV1.Group("/auth")
	if authHandler == nil {
		authHandler = NewAuthHandler(authConfig, nil)
	}
	authHandler.registerRoutes(authGroup)

	var usageIdentityProvider service.UsageIdentityProvider
	var quotaProvider QuotaProvider
	var cpaAPIKeyProvider service.CPAAPIKeyProvider
	var statusConfig StatusRouteConfig
	var tutorialPDFConfig TutorialPDFConfig
	if len(optionalProviders) > 0 {
		usageIdentityProvider = optionalProviders[0].UsageIdentity
		quotaProvider = optionalProviders[0].Quota
		cpaAPIKeyProvider = optionalProviders[0].CPAAPIKeys
		statusConfig = optionalProviders[0].Status
		tutorialPDFConfig = TutorialPDFConfig{Path: optionalProviders[0].TutorialPDFPath}
	}
	authHandler.setCPAAPIKeyProvider(cpaAPIKeyProvider)

	adminProtected := apiV1.Group("")
	adminProtected.Use(authHandler.adminMiddleware())
	registerStatusRoutes(adminProtected, statusProvider, statusConfig)
	registerUpdateRoutes(adminProtected, nil)
	registerUsageOverviewRoute(adminProtected, usageProvider)
	registerUsageAnalysisRoute(adminProtected, usageProvider, cpaAPIKeyProvider)
	registerUsageEventsRoute(adminProtected, usageProvider, usageIdentityProvider, cpaAPIKeyProvider)
	registerUsageIdentityRoutes(adminProtected, usageIdentityProvider)
	registerCPAAPIKeyRoutes(adminProtected, cpaAPIKeyProvider)
	registerPricingRoutes(adminProtected, pricingProvider)
	registerQuotaRoutes(adminProtected, quotaProvider)
	registerTutorialPDFRoute(adminProtected, tutorialPDFConfig)

	keyViewerProtected := apiV1.Group("")
	keyViewerProtected.Use(authHandler.apiKeyViewerMiddleware())
	registerKeyOverviewRoute(keyViewerProtected, usageProvider, cpaAPIKeyProvider, authHandler)

	if staticFS != nil {
		registerStaticRoutes(router, appGroup, staticFS, basePath, tutorialPDFConfig)
	}

	return router
}

func registerStaticRoutes(router *gin.Engine, appGroup *gin.RouterGroup, staticFS fs.FS, basePath string, tutorialPDFConfig TutorialPDFConfig) {
	if staticFS == nil {
		return
	}
	if indexFile, err := staticFS.Open("index.html"); err == nil {
		_ = indexFile.Close()
		httpFS := http.FS(staticFS)
		serveIndex := func(c *gin.Context) {
			indexHTML, err := renderIndexHTML(staticFS, basePath, tutorialPDFConfig)
			if err != nil {
				c.Status(http.StatusNotFound)
				return
			}
			setHTMLCacheHeaders(c)
			c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
		}
		serveAsset := func(c *gin.Context) {
			assetPath := "assets/" + strings.TrimPrefix(c.Param("filepath"), "/")
			if assetFile, err := staticFS.Open(assetPath); err == nil {
				_ = assetFile.Close()
				setStaticAssetCacheHeaders(c)
				c.FileFromFS(assetPath, httpFS)
				return
			}
			c.Status(http.StatusNotFound)
		}

		appGroup.GET("/", serveIndex)
		appGroup.GET("/assets/*filepath", serveAsset)
		appGroup.HEAD("/assets/*filepath", serveAsset)
		router.NoRoute(func(c *gin.Context) {
			requestPath, ok := stripBasePath(basePath, c.Request.URL.Path)
			if !ok {
				c.Status(http.StatusNotFound)
				return
			}
			if strings.HasPrefix(requestPath, "/api/") {
				c.Status(http.StatusNotFound)
				return
			}

			if assetPath, ok := staticAssetPath(requestPath); ok {
				if assetFile, err := staticFS.Open(assetPath); err == nil {
					_ = assetFile.Close()
					setStaticAssetCacheHeaders(c)
					c.FileFromFS(assetPath, httpFS)
					return
				}
			}

			serveIndex(c)
		})
	}
}

func setHTMLCacheHeaders(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
}

func setStaticAssetCacheHeaders(c *gin.Context) {
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
}

func renderIndexHTML(staticFS fs.FS, basePath string, tutorialPDFConfig TutorialPDFConfig) ([]byte, error) {
	indexFile, err := staticFS.Open("index.html")
	if err != nil {
		return nil, err
	}
	defer indexFile.Close()
	indexHTML, err := io.ReadAll(indexFile)
	if err != nil {
		return nil, err
	}

	indexHTML = bytes.ReplaceAll(
		indexHTML,
		[]byte(strconv.Quote(appBasePathPlaceholder)),
		[]byte(strconv.Quote(basePath)),
	)
	indexHTML = bytes.ReplaceAll(
		indexHTML,
		[]byte(strconv.Quote(tutorialPDFURLPlaceholder)),
		[]byte(strconv.Quote(tutorialPDFURL(basePath, tutorialPDFConfig))),
	)
	return indexHTML, nil
}

func registerTutorialPDFRoute(router gin.IRoutes, config TutorialPDFConfig) {
	router.GET("/tutorial.pdf", func(c *gin.Context) {
		pdfPath := strings.TrimSpace(config.Path)
		if pdfPath == "" {
			c.Status(http.StatusNotFound)
			return
		}
		info, err := os.Stat(pdfPath)
		if err != nil || info.IsDir() {
			c.Status(http.StatusNotFound)
			return
		}
		setPDFCacheHeaders(c)
		c.Header("Content-Type", "application/pdf")
		c.Header("Content-Disposition", mime.FormatMediaType("inline", map[string]string{
			"filename": filepath.Base(pdfPath),
		}))
		c.File(pdfPath)
	})
}

func setPDFCacheHeaders(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
}

func tutorialPDFURL(basePath string, config TutorialPDFConfig) string {
	pdfPath := strings.TrimSpace(config.Path)
	if pdfPath == "" {
		return ""
	}
	version := ""
	if info, err := os.Stat(pdfPath); err == nil && !info.IsDir() {
		version = "?v=" + strconv.FormatInt(info.ModTime().UnixNano(), 10)
	}
	if basePath == "" {
		return tutorialPDFRoutePath + version
	}
	return basePath + tutorialPDFRoutePath + version
}

func cleanURLPath(requestPath string) string {
	cleaned := path.Clean(requestPath)
	if cleaned == "." {
		return "/"
	}
	if !strings.HasPrefix(cleaned, "/") {
		return "/" + cleaned
	}
	return cleaned
}

func staticAssetPath(requestPath string) (string, bool) {
	cleaned := cleanURLPath(requestPath)
	if strings.Contains(cleaned, "\\") {
		return "", false
	}
	relPath := strings.TrimPrefix(cleaned, "/")
	if relPath == "" {
		return "", false
	}
	return relPath, true
}

func stripBasePath(basePath, requestPath string) (string, bool) {
	cleaned := cleanURLPath(requestPath)
	if basePath == "" {
		return cleaned, true
	}
	if cleaned == basePath {
		return "/", true
	}
	if !strings.HasPrefix(cleaned, basePath+"/") {
		return "", false
	}
	trimmed := strings.TrimPrefix(cleaned, basePath)
	if trimmed == "" {
		return "/", true
	}
	return trimmed, true
}

type statusResponse struct {
	Running            bool       `json:"running"`
	SyncRunning        bool       `json:"sync_running"`
	Timezone           string     `json:"timezone"`
	Version            string     `json:"version"`
	UpdateCheckEnabled bool       `json:"updateCheckEnabled"`
	CPAPublicURL       string     `json:"cpa_public_url,omitempty"`
	LastRunAt          *time.Time `json:"last_run_at,omitempty"`
	LastError          string     `json:"last_error,omitempty"`
	LastWarning        string     `json:"last_warning,omitempty"`
	LastStatus         string     `json:"last_status,omitempty"`
}

func registerStatusRoutes(router gin.IRoutes, statusProvider StatusProvider, config StatusRouteConfig) {
	router.GET("/status", func(c *gin.Context) {
		if statusProvider == nil {
			c.JSON(http.StatusOK, buildStatusResponse(poller.Status{}, config))
			return
		}

		c.JSON(http.StatusOK, buildStatusResponse(statusProvider.Status(), config))
	})
	router.GET("/status/active", func(c *gin.Context) {
		if config.ActiveRecorder != nil {
			// 前端可见页面用这个轻量心跳续约，避免限额自动刷新在无人查看后台时持续扫库和请求上游。
			config.ActiveRecorder.RecordActiveStatus(time.Now())
		}
		c.Status(http.StatusNoContent)
	})
}

func registerReadOnlyStatusRoute(router gin.IRoutes) {
	router.GET("/status", func(c *gin.Context) {
		c.JSON(http.StatusOK, statusResponse{
			Running:            false,
			SyncRunning:        false,
			Timezone:           time.Local.String(),
			Version:            version.Version,
			UpdateCheckEnabled: false,
		})
	})
}

func buildStatusResponse(status poller.Status, config StatusRouteConfig) statusResponse {
	response := statusResponse{
		Running:            status.Running,
		SyncRunning:        status.SyncRunning,
		Timezone:           time.Local.String(),
		Version:            version.Version,
		UpdateCheckEnabled: updatecheck.IsStableVersion(version.Version),
		CPAPublicURL:       config.CPAPublicURL,
		LastError:          status.LastError,
		LastWarning:        status.LastWarning,
		LastStatus:         status.LastStatus,
	}
	if !status.LastRunAt.IsZero() {
		lastRunAt := timeutil.NormalizeStorageTime(status.LastRunAt)
		response.LastRunAt = &lastRunAt
	}
	return response
}
