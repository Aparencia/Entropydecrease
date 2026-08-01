// @ai-context
// 同步服务入口：初始化 DB/Redis、注册健康探针与同步路由、启动 Gin 服务。
// Sync-service entry point: DB/Redis bootstrap, health probes, sync routes, Gin server startup.
// Why: 健康处理器统一收敛到 handlers 包（HealthCheck/ReadyCheck），main 只做装配不含业务逻辑。
package main

import (
	"os"

	"entropydecrease/sync-service/cache"
	"entropydecrease/sync-service/handlers"
	"entropydecrease/sync-service/middleware"
	"entropydecrease/sync-service/models"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// logger is the global structured logger.
var logger *zap.Logger

func init() {
	var err error
	if os.Getenv("APP_ENV") == "production" {
		logger, err = zap.NewProduction()
	} else {
		logger, err = zap.NewDevelopment()
	}
	if err != nil {
		panic(err)
	}
}

func main() {
	defer logger.Sync() //nolint:errcheck

	// Initialise PostgreSQL connection before anything else.
	if err := models.InitDB(); err != nil {
		logger.Fatal("Database initialisation failed", zap.Error(err))
	}

	// Initialise Redis cache (graceful degradation on failure).
	if err := cache.InitRedis(); err != nil {
		logger.Warn("Redis init error (graceful degradation)", zap.Error(err))
	}
	defer cache.CloseRedis()

	r := gin.Default()

	// Health check — liveness probe.
	// Also keep the legacy /api/health endpoint for backward compatibility.
	r.GET("/health", handlers.HealthCheck)
	r.GET("/api/health", handlers.HealthCheck)

	// Readiness probe — checks DB connectivity.
	r.GET("/ready", handlers.ReadyCheck)

	// Sync API v1
	v1 := r.Group("/api/v1/sync")
	v1.Use(middleware.AuthMiddleware())
	{
		v1.POST("/push", handlers.Push)
		v1.GET("/pull", handlers.Pull)
		v1.POST("/resolve", handlers.Resolve)
		v1.GET("/status", handlers.Status)

		// CRDT changeset endpoints (v1.4.0+)
		v1.POST("/crdt/changes", handlers.CRDTPush)
		v1.GET("/crdt/changes", handlers.CRDTPull)
	}

	// Social proof stats — public (no auth) read + authenticated report.
	r.GET("/api/v1/stats/today", handlers.StatsToday)
	statsAuth := r.Group("/api/v1/stats")
	statsAuth.Use(middleware.AuthMiddleware())
	{
		statsAuth.POST("/report", handlers.ReportLearningEvent)
	}

	// WebSocket real-time sync channel.
	// Uses WSAuthMiddleware which reads the JWT from ?token= query parameter
	// (browsers cannot set custom headers on WebSocket upgrade requests).
	ws := r.Group("/api/v1/sync")
	ws.Use(middleware.WSAuthMiddleware())
	{
		ws.GET("/ws", func(c *gin.Context) {
			userID := c.GetString("user_id")
			deviceID := c.Query("device_id")
			handlers.HandleWebSocketWithGin(c, userID, deviceID)
		})
	}

	logger.Info("sync-service starting", zap.String("addr", ":8080"))
	if err := r.Run(":8080"); err != nil {
		logger.Fatal("Failed to start server", zap.Error(err))
	}
}
