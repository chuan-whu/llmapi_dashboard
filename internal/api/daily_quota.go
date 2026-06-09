package api

import (
	"net/http"

	"cpa-usage-keeper/internal/service"
	"github.com/gin-gonic/gin"
)

func registerDailyQuotaRoute(router gin.IRoutes, provider service.DailyQuotaProvider) {
	router.GET("/daily-quota", func(c *gin.Context) {
		if provider == nil {
			c.JSON(http.StatusOK, service.DailyQuotaResponse{Status: service.DailyQuotaStatusFailed})
			return
		}
		c.JSON(http.StatusOK, provider.GetDailyQuota(c.Request.Context()))
	})
}
