// @ai-context
// 社交证据统计端点：返回今日匿名聚合学习统计（无需认证）。
// Social proof stats endpoint: returns today's anonymous aggregate learning stats (no auth).
// Why: 客户端 CompletionCelebration 展示"今天有 N 位潜航员完成了深潜"。
// 基于 Redis 计数器，每次客户端上报学习事件时 INCR。
package handlers

import (
	"context"
	"net/http"
	"time"

	"entropydecrease/sync-service/cache"

	"github.com/gin-gonic/gin"
)

// TodayStatsResponse is the JSON shape returned by GET /api/v1/stats/today.
type TodayStatsResponse struct {
	DeepDiveCount   int64 `json:"deepDiveCount"`
	ActiveUsers     int64 `json:"activeUsers"`
	TotalMinutesToday int64 `json:"totalMinutesToday"`
}

// redis key helpers — scoped to today's date
func todayKey(prefix string) string {
	return prefix + ":" + time.Now().Format("2006-01-02")
}

// StatsToday handles GET /api/v1/stats/today
// Returns anonymous aggregate stats for today. No authentication required.
func StatsToday(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	rdb := cache.GetRedis()
	if rdb == nil {
		// Redis unavailable — return zeros gracefully
		c.JSON(http.StatusOK, TodayStatsResponse{})
		return
	}

	diveKey := todayKey("stats:dives")
	userKey := todayKey("stats:users")
	minKey := todayKey("stats:minutes")

	dives, err1 := rdb.Get(ctx, diveKey).Int64()
	users, err2 := rdb.Get(ctx, userKey).Int64()
	minutes, err3 := rdb.Get(ctx, minKey).Int64()

	// On error, default to 0
	if err1 != nil {
		dives = 0
	}
	if err2 != nil {
		users = 0
	}
	if err3 != nil {
		minutes = 0
	}

	c.JSON(http.StatusOK, TodayStatsResponse{
		DeepDiveCount:     dives,
		ActiveUsers:       users,
		TotalMinutesToday: minutes,
	})
}

// ReportLearningEvent handles POST /api/v1/stats/report
// Called by clients after a learning milestone to increment today's counters.
// Requires auth (user_id from middleware).
func ReportLearningEvent(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	rdb := cache.GetRedis()
	if rdb == nil {
		c.Status(http.StatusNoContent)
		return
	}

	userID := c.GetString("user_id")

	var body struct {
		Type           string `json:"type"`           // "pomodoro" | "flashcard" | "feynman"
		DurationMinutes int   `json:"durationMinutes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	diveKey := todayKey("stats:dives")
	userKey := todayKey("stats:users")
	minKey := todayKey("stats:minutes")
	ttl := 48 * time.Hour // keys expire after 2 days

	pipe := rdb.Pipeline()
	pipe.Incr(ctx, diveKey)
	pipe.Expire(ctx, diveKey, ttl)
	if body.DurationMinutes > 0 {
		pipe.IncrBy(ctx, minKey, int64(body.DurationMinutes))
		pipe.Expire(ctx, minKey, ttl)
	}
	// Track unique users via a set
	pipe.SAdd(ctx, userKey, userID)
	pipe.Expire(ctx, userKey, ttl)
	_, _ = pipe.Exec(ctx)

	c.Status(http.StatusNoContent)
}
