// @ai-context
// WebSocket 入口与消息协议：升级握手、协议类型定义、广播入口与增量查询。
// WebSocket entry points and message protocol: upgrade handshake, wire types, broadcast API.
// Why: 协议类型（WSMessage/WSOperationPayload）留在本文件作为对外契约的单一定义点。
package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"entropydecrease/sync-service/models"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ---------- WebSocket upgrader ----------

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins during development; restrict in production.
		return true
	},
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
