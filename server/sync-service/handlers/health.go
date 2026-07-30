// @ai-context
// 健康探针 handlers：liveness（/health）与 readiness（/ready，检查 DB 连通性）。
// Health probe handlers: liveness and readiness (DB connectivity check).
// Why: 版本号收敛为单一常量 ServiceVersion，消除源项目中 main 内联 0.5.0 与此处 0.2.0-alpha 的漂移。
package handlers

import (
	"net/http"

	"entropydecrease/sync-service/models"

	"github.com/gin-gonic/gin"
)

// ServiceVersion is the single source of truth for the sync-service version string.
const ServiceVersion = "0.5.0"

// HealthCheck handles GET /health and GET /api/health (liveness probe).
func HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "sync-service",
		"version": ServiceVersion,
	})
}

// ReadyCheck handles GET /ready (readiness probe): verifies DB connectivity.
func ReadyCheck(c *gin.Context) {
	sqlDB, err := models.DB.DB()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "not_ready",
			"error":  "db unavailable",
		})
		return
	}
	if err := sqlDB.Ping(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "not_ready",
			"error":  "db ping failed",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}
