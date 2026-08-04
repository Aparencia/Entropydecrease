// @ai-context
// Redis 同步状态缓存，连接失败时优雅降级为 no-op。
// Redis sync-state cache with graceful degradation: all helpers no-op when RDB is nil.
// Why: 同步服务的核心链路走 PostgreSQL，Redis 仅承担加速职责，不可用不应阻塞启动。
package cache

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

// M3: Redis 键 TTL 常量——所有缓存键都必须有过期时间，防止无界增长。
const (
	// lastSyncVersionTTL 用户最后同步版本缓存有效期（7 天）。
	lastSyncVersionTTL = 7 * 24 * time.Hour
	// deviceOnlineTTL 设备在线集合有效期（24 小时），SAdd 后需刷新。
	deviceOnlineTTL = 24 * time.Hour
)

// RDB is the shared Redis client. It is nil when Redis is unavailable,
// in which case all cache operations silently no-op (graceful degradation).
var RDB *redis.Client

// InitRedis connects to Redis using the REDIS_URL environment variable.
// If the connection fails the service starts normally with caching disabled.
func InitRedis() error {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return fmt.Errorf("invalid REDIS_URL: %w", err)
	}

	RDB = redis.NewClient(opts)

	ctx := context.Background()
	if err := RDB.Ping(ctx).Err(); err != nil {
		// Redis 不可用时优雅降级（不阻塞启动）
		fmt.Printf("[WARNING] Redis connection failed, sync cache disabled: %v\n", err)
		RDB = nil
		return nil
	}

	fmt.Println("[sync-service] Redis connected")
	return nil
}

// GetRedis returns the shared Redis client, or nil when Redis is unavailable.
// Callers must nil-check the return value and degrade gracefully.
func GetRedis() *redis.Client {
	return RDB
}

// CloseRedis closes the Redis connection if it is open.
func CloseRedis() {
	if RDB != nil {
		RDB.Close()
	}
}

// ---------- Sync-state cache helpers ----------

// SetLastSyncVersion caches the user's last known sync version (TTL 7 天)。
func SetLastSyncVersion(ctx context.Context, userID string, version int64) error {
	if RDB == nil {
		return nil
	}
	key := fmt.Sprintf("sync:%s:lastVersion", userID)
	return RDB.Set(ctx, key, version, lastSyncVersionTTL).Err()
}

// GetLastSyncVersion returns the cached last-sync version for a user,
// or 0 when the key does not exist or Redis is unavailable.
func GetLastSyncVersion(ctx context.Context, userID string) (int64, error) {
	if RDB == nil {
		return 0, nil
	}
	key := fmt.Sprintf("sync:%s:lastVersion", userID)
	val, err := RDB.Get(ctx, key).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return val, err
}

// SetDeviceOnline marks a device as online for the given user (集合 TTL 24 小时，每次写入刷新过期时间)。
func SetDeviceOnline(ctx context.Context, userID, deviceID string) error {
	if RDB == nil {
		return nil
	}
	key := fmt.Sprintf("sync:%s:devices", userID)
	if err := RDB.SAdd(ctx, key, deviceID).Err(); err != nil {
		return err
	}
	// SADD 本身不带 TTL，需显式刷新集合过期时间
	return RDB.Expire(ctx, key, deviceOnlineTTL).Err()
}

// SetDeviceOffline removes a device from the online set (WebSocket 断开时调用，M3)。
func SetDeviceOffline(ctx context.Context, userID, deviceID string) error {
	if RDB == nil {
		return nil
	}
	key := fmt.Sprintf("sync:%s:devices", userID)
	return RDB.SRem(ctx, key, deviceID).Err()
}

// GetOnlineDevices returns the set of device IDs currently marked online
// for the given user, or nil when Redis is unavailable.
func GetOnlineDevices(ctx context.Context, userID string) ([]string, error) {
	if RDB == nil {
		return nil, nil
	}
	key := fmt.Sprintf("sync:%s:devices", userID)
	return RDB.SMembers(ctx, key).Result()
}
