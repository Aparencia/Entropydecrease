// @ai-context
// 社交端点简易限流中间件：每用户滑动窗口计数，防配对请求/在场脉冲等被高频调用
// 造成 WS 推送洪泛或资源滥用。内存态计数，进程重启即清零（社交数据本身纯内存）。
// Social endpoint rate limiting: per-user sliding window counters to prevent
// WS push flooding from relay requests / presence pulses. In-memory only.
package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// windowSize 滑动窗口时长（秒）。
const windowSize = 60 * time.Second

// defaultLimit 默认每窗口请求上限。
const defaultLimit = 30

// 各端点更严格的独立上限：配对请求会向对方推送 WS 消息，须收紧防骚扰。
const relayPairLimit = 10

// rateBucket 单用户单路径的滑动窗口计数。
type rateBucket struct {
	windowStart time.Time
	count       int
}

// RateLimiter 按 userID + 路径维度限流。
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
}

// limiter 全局单例。
var limiter = &RateLimiter{buckets: make(map[string]*rateBucket)}

// key 组装 userID + 路径的计数键。
func key(userID, path string) string { return userID + "|" + path }

// allow 判定请求是否放行；放行时递增计数。
func (l *RateLimiter) allow(k string, limit int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	b, ok := l.buckets[k]
	if !ok || now.Sub(b.windowStart) >= windowSize {
		l.buckets[k] = &rateBucket{windowStart: now, count: 1}
		// 定期清理过期桶，防 map 无界增长（每次写入顺带清理一次）
		if len(l.buckets) > 4096 {
			for kk, bb := range l.buckets {
				if now.Sub(bb.windowStart) >= windowSize {
					delete(l.buckets, kk)
				}
			}
		}
		return true
	}
	if b.count >= limit {
		return false
	}
	b.count++
	return true
}

// RateLimit 返回按用户限流的 Gin 中间件。path 为端点标识（如 "relay/pair"），
// limit 为该端点每窗口上限（≤0 时用默认值）。
func RateLimit(path string, limit int) gin.HandlerFunc {
	if limit <= 0 {
		limit = defaultLimit
	}
	return func(c *gin.Context) {
		userID := c.GetString("user_id")
		if userID == "" {
			c.Next()
			return
		}
		if !limiter.allow(key(userID, path), limit) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded, slow down"})
			return
		}
		c.Next()
	}
}
