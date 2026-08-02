// @ai-context
// WebSocket 入口与消息协议：升级握手、协议类型定义、广播入口与增量查询。
// WebSocket entry points and message protocol: upgrade handshake, wire types, broadcast API.
// Why: 协议类型（WSMessage/WSOperationPayload）留在本文件作为对外契约的单一定义点。
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"entropydecrease/sync-service/models"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ---------- WebSocket upgrader ----------

// allowedOrigins 保存生产模式下允许建立 WebSocket 连接的来源列表。
// 由 CORS_ORIGINS 环境变量解析，逗号分隔；未配置时默认为空（拒绝所有跨域请求）。
var allowedOrigins = parseAllowedOrigins()

// parseAllowedOrigins 从 CORS_ORIGINS 环境变量解析允许的来源列表。
// 若环境变量未设置或为空，返回 nil（生产模式下将拒绝所有跨域请求）。
func parseAllowedOrigins() []string {
	raw := os.Getenv("CORS_ORIGINS")
	if raw == "" {
		return nil
	}
	origins := strings.Split(raw, ",")
	// 去除两端空白，过滤空字符串
	result := make([]string, 0, len(origins))
	for _, o := range origins {
		o = strings.TrimSpace(o)
		if o != "" {
			result = append(result, o)
		}
	}
	return result
}

// isDevMode 判断当前是否处于开发模式。
// fail-secure 原则：未显式声明开发模式时，默认启用安全检查。
// 满足以下任一条件即视为开发模式：
//   - APP_ENV=development
//   - GIN_MODE=debug（必须显式设置，未设置时视为生产模式）
func isDevMode() bool {
	if os.Getenv("APP_ENV") == "development" {
		return true
	}
	// 仅当 GIN_MODE 显式设为 debug 时才视为开发模式
	// 未设置或设为 release 时均视为生产模式（安全默认）
	return os.Getenv("GIN_MODE") == "debug"
}

// isOriginAllowed 检查请求来源是否在允许列表中。
// 开发模式：允许所有来源（便于本地调试）。
// 生产模式：仅允许 CORS_ORIGINS 中配置的来源。
func isOriginAllowed(r *http.Request) bool {
	// 开发模式下不限制来源，方便本地调试和前端开发
	if isDevMode() {
		return true
	}
	// 生产模式：逐一比对请求 Origin 与配置白名单
	origin := r.Header.Get("Origin")
	if origin == "" {
		// 生产模式下拒绝无 Origin 请求，防止 CSRF 绕过
		// gorilla/websocket 默认行为也是拒绝空 Origin
		if !isDevMode() {
			log.Printf("[ws] 拒绝无 Origin 头的 WebSocket 连接请求（生产模式）")
			return false
		}
		// 开发模式下允许非浏览器客户端（如 wscat）无 Origin 连接
		return true
	}
	for _, allowed := range allowedOrigins {
		if strings.EqualFold(origin, allowed) {
			return true
		}
	}
	log.Printf("[ws] origin rejected: %s (allowed: %v)", origin, allowedOrigins)
	return false
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// CheckOrigin 实现跨域安全策略：
	// - 开发模式（APP_ENV=development 或 GIN_MODE=debug）：允许所有来源
	// - 生产模式：仅允许 CORS_ORIGINS 环境变量中配置的白名单来源
	CheckOrigin: isOriginAllowed,
}

// ---------- Message protocol ----------

// WSMessage defines the wire format for all WebSocket messages.
type WSMessage struct {
	Type    string          `json:"type"` // "operation", "ack", "ping", "pong", "sync_request"
	Payload json.RawMessage `json:"payload"`
}

// WSOperationPayload is carried inside "operation" messages pushed to clients.
type WSOperationPayload struct {
	EntityType string      `json:"entityType"`
	EntityID   string      `json:"entityId"`
	Operation  string      `json:"operation"`
	Data       interface{} `json:"data,omitempty"`
	Version    int64       `json:"version"`
	DeviceID   string      `json:"deviceId"` // originating device
}

// WSSyncRequestPayload is sent by clients inside a "sync_request" message.
type WSSyncRequestPayload struct {
	SinceVersion int64 `json:"sinceVersion"`
}

// ---------- Gin handler entry-points ----------

// HandleWebSocketWithGin is the Gin-compatible entry point for WebSocket upgrades.
// It expects user_id to have been extracted by the JWT middleware already.
func HandleWebSocketWithGin(c *gin.Context, userID string, deviceID string) {
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id query parameter is required"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[ws] upgrade failed user=%s: %v", userID, err)
		return
	}

	wsConn := &WSConnection{
		UserID:   userID,
		DeviceID: deviceID,
		Conn:     conn,
		Send:     make(chan []byte, 256),
	}

	wsManager.register(wsConn)

	go wsConn.writePump()
	go wsConn.readPump()
}

// BroadcastOperation notifies all other online devices of a user about new operations.
// Called from the Push handler after operations are accepted.
func BroadcastOperation(userID string, sourceDeviceID string, ops []WSOperationPayload) {
	if len(ops) == 0 {
		return
	}
	data, err := json.Marshal(ops)
	if err != nil {
		return
	}
	msg, err := json.Marshal(WSMessage{Type: "operation", Payload: data})
	if err != nil {
		return
	}
	wsManager.broadcastToUser(userID, sourceDeviceID, msg)
}

// ---------- helpers ----------

// fetchOperationsSince queries the DB for operations newer than sinceVersion, excluding the requesting device.
func fetchOperationsSince(sinceVersion int64, excludeDeviceID string) []WSOperationPayload {
	var ops []operationRow
	_ = models.DB.
		Table("operations").
		Select("entity_type, entity_id, operation, payload, server_seq_no, device_id").
		Where("server_seq_no > ? AND device_id != ?", sinceVersion, excludeDeviceID).
		Order("server_seq_no ASC").
		Find(&ops).Error

	result := make([]WSOperationPayload, 0, len(ops))
	for _, op := range ops {
		result = append(result, WSOperationPayload{
			EntityType: op.EntityType,
			EntityID:   op.EntityID,
			Operation:  op.Operation,
			Data:       fromJSON(op.Payload),
			Version:    op.ServerSeqNo,
			DeviceID:   op.DeviceID,
		})
	}
	return result
}

// operationRow is a lightweight projection used by fetchOperationsSince.
type operationRow struct {
	EntityType  string
	EntityID    string
	Operation   string
	Payload     string
	ServerSeqNo int64
	DeviceID    string
}
