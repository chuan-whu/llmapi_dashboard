package api

import (
	"crypto/subtle"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"llmapi-dashboard/internal/auth"
)

const sessionCookieName = "llmapi_dashboard_session"

const maxFailedLoginAttempts = 5

type AuthConfig struct {
	Enabled       bool
	LoginPassword string
	SessionTTL    time.Duration
	BasePath      string
}

type authHandler struct {
	config         AuthConfig
	sessions       *auth.SessionManager
	mu             sync.Mutex
	failedAttempts map[string]int
}

type loginRequest struct {
	Password string `json:"password"`
}

type sessionResponse struct {
	Authenticated bool      `json:"authenticated"`
	Role          auth.Role `json:"role,omitempty"`
}

func NewAuthHandler(config AuthConfig, sessions *auth.SessionManager) *authHandler {
	return &authHandler{config: config, sessions: sessions, failedAttempts: make(map[string]int)}
}

func (h *authHandler) registerRoutes(router gin.IRoutes) {
	router.GET("/session", h.getSession)
	router.POST("/login", h.login)
	router.POST("/logout", h.logout)
}

func (h *authHandler) adminMiddleware() gin.HandlerFunc {
	return h.roleMiddleware(auth.RoleAdmin)
}

func (h *authHandler) roleMiddleware(allowedRoles ...auth.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		if h == nil || !h.config.Enabled {
			c.Next()
			return
		}
		if h.sessions == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		token, err := c.Cookie(sessionCookieName)
		session, ok := h.sessions.Get(token)
		if err != nil || !ok {
			h.deleteSession(token)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		if len(allowedRoles) > 0 && !sessionRoleAllowed(session.Role, allowedRoles) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.Set("auth_token", token)
		c.Set("auth_session", session)
		c.Next()
	}
}

func sessionRoleAllowed(role auth.Role, allowedRoles []auth.Role) bool {
	for _, allowed := range allowedRoles {
		if role == allowed {
			return true
		}
	}
	return false
}

func (h *authHandler) getSession(c *gin.Context) {
	if h == nil || !h.config.Enabled {
		c.JSON(http.StatusOK, sessionResponse{Authenticated: true, Role: auth.RoleAdmin})
		return
	}
	if h.sessions == nil {
		c.JSON(http.StatusOK, sessionResponse{Authenticated: false})
		return
	}

	token, err := c.Cookie(sessionCookieName)
	if err != nil {
		c.JSON(http.StatusOK, sessionResponse{Authenticated: false})
		return
	}
	session, ok := h.sessions.Get(token)
	if !ok {
		h.deleteSession(token)
		c.JSON(http.StatusOK, sessionResponse{Authenticated: false})
		return
	}
	c.JSON(http.StatusOK, sessionResponse{Authenticated: true, Role: session.Role})
}

func (h *authHandler) login(c *gin.Context) {
	if h == nil || !h.config.Enabled {
		c.Status(http.StatusNoContent)
		return
	}
	if h.sessions == nil {
		writeInternalError(c, "session manager is not configured", nil)
		return
	}

	var request loginRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	clientKey := loginClientKey(c)
	passwordMatches := subtle.ConstantTimeCompare([]byte(request.Password), []byte(h.config.LoginPassword)) == 1
	if h.tooManyFailedAttempts(clientKey) && !passwordMatches {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many failed login attempts"})
		return
	}

	if !passwordMatches {
		h.recordFailedAttempt(clientKey)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
		return
	}
	h.clearFailedAttempts(clientKey)

	token, expiresAt, err := h.sessions.Create()
	if err != nil {
		writeInternalError(c, "create auth session failed", err)
		return
	}

	setSessionCookie(c, h.config.BasePath, token, expiresAt)
	c.Status(http.StatusNoContent)
}

func (h *authHandler) logout(c *gin.Context) {
	if h == nil || !h.config.Enabled {
		c.Status(http.StatusNoContent)
		return
	}
	if h.sessions != nil {
		if token, err := c.Cookie(sessionCookieName); err == nil {
			h.deleteSession(token)
		}
	}
	clearSessionCookie(c, h.config.BasePath)
	c.Status(http.StatusNoContent)
}

func (h *authHandler) tooManyFailedAttempts(key string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.failedAttempts[key] >= maxFailedLoginAttempts
}

func (h *authHandler) recordFailedAttempt(key string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.failedAttempts[key]++
}

func (h *authHandler) clearFailedAttempts(key string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.failedAttempts, key)
}

func (h *authHandler) deleteSession(token string) {
	if h == nil || token == "" {
		return
	}
	if h.sessions != nil {
		h.sessions.Delete(token)
	}
}

func loginClientKey(c *gin.Context) string {
	host, _, err := net.SplitHostPort(c.Request.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return c.ClientIP()
}

func setSessionCookie(c *gin.Context, basePath, token string, expiresAt time.Time) {
	secure := c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     sessionCookiePath(basePath),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  expiresAt,
		MaxAge:   int(time.Until(expiresAt).Seconds()),
	})
}

func sessionCookiePath(basePath string) string {
	if basePath == "" {
		return "/"
	}
	return basePath
}

func clearSessionCookie(c *gin.Context, basePath string) {
	cookiePath := sessionCookiePath(basePath)
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     cookiePath,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
	})
}
