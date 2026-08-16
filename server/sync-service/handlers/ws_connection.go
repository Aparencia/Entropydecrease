// @ai-context
// WebSocket 单连接生命周期：读写泵、心跳保活与安全关闭。
// Single WebSocket connection lifecycle: read/write pumps, ping-pong keepalive, safe teardown.
// Why: close() 由 mutex 保护且幂等，因为 readPump/writePump/manager 三方都可能触发关闭。
package handlers

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ---------- Timing constants ----------

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 65536
)

// ---------- Connection ----------

// WSConnection represents a single WebSocket connection bound to a user+device.
type WSConnection struct {
	UserID   string
	DeviceID string
	Conn     *websocket.Conn
	Send     chan []byte
	closed   bool
	mu       sync.Mutex

	// SYNC-H2: sync_request 在飞查询信号槽（容量 2）——客户端可连续发送
	// 任意数量 sync_request，每个都启动 goroutine 查库会打满数据库连接池
	syncReqSlots chan struct{}
}

// close safely marks the connection as closed and closes the underlying socket.
func (c *WSConnection) close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.closed {
		c.closed = true
		close(c.Send)
		_ = c.Conn.Close()
	}
}

// isClosed returns whether the connection has already been torn down.
func (c *WSConnection) isClosed() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.closed
}

// send safely sends data to the connection's Send channel, holding the lock
// to prevent send-on-closed-channel panics. Returns false if the channel is
// closed or the buffer is full.
func (c *WSConnection) send(data []byte) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return false
	}
	select {
	case c.Send <- data:
		return true
	default:
		return false
	}
}

// readPump reads messages from the WebSocket connection.
// It handles ping/pong and incoming sync_request / operation messages.
func (c *WSConnection) readPump() {
	defer func() {
		wsManager.unregister(c)
		c.close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[ws] read error user=%s device=%s: %v", c.UserID, c.DeviceID, err)
			}
			return
		}

		var msg WSMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("[ws] bad message from user=%s device=%s: %v", c.UserID, c.DeviceID, err)
			continue
		}

		switch msg.Type {
		case "ping":
			// Respond with pong.
			pong, _ := json.Marshal(WSMessage{Type: "pong"})
			c.send(pong)

		case "sync_request":
			// Client asks for updates since a given version.
			var payload WSSyncRequestPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				continue
			}
			// M10: 查库改为异步执行（goroutine），结果经 Send 通道回投，
			// 避免慢查询阻塞 readPump 导致心跳超时。
			// SYNC-H2: 在飞查询超限时丢弃本次请求（客户端轮询会重发），
			// 防止单连接洪泛打满数据库连接池（上限 50）拖垮全部用户
			select {
			case c.syncReqSlots <- struct{}{}:
				go goSafe(func() {
					defer func() { <-c.syncReqSlots }()
					c.handleSyncRequest(payload.SinceVersion)
				})
			default:
				log.Printf("[ws] sync_request dropped (in-flight limit reached) user=%s device=%s", c.UserID, c.DeviceID)
			}

		case "operation":
			// Client-pushed operation over WebSocket (future enhancement).
			// For now, acknowledge receipt.
			ack, _ := json.Marshal(WSMessage{Type: "ack", Payload: msg.Payload})
			c.send(ack)

		// Phase 4 社交功能消息：协作深潜房间（4.1）
		case "room:create", "room:join", "room:leave", "room:presence", "room:cheer":
			handleRoomWSMessage(c, msg)

		// Phase 4 社交功能消息：番茄钟协作接力（4.2）——客户端上报状态转发给搭档
		case "relay:partner-status":
			handleRelayWSMessage(c, msg)

		// Phase 4 社交功能消息：虚拟自习室座位状态同步（4.4）
		case "studyroom:seat-status":
			handleStudyRoomWSMessage(c, msg)
		}
	}
}

// handleSyncRequest 异步处理 sync_request：带超时查询增量操作并回投结果。
// M10: context.WithTimeout 防止查询长时间阻塞；M9: 查询失败记录日志并通知客户端。
func (c *WSConnection) handleSyncRequest(sinceVersion int64) {
	// 查询超时上限 15 秒，超时后丢弃本次请求（不阻塞心跳）
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	ops, hasMore, err := fetchOperationsSince(ctx, c.UserID, sinceVersion, c.DeviceID)
	if err != nil {
		log.Printf("[ws] sync_request query failed user=%s device=%s: %v", c.UserID, c.DeviceID, err)
		errPayload, _ := json.Marshal(map[string]string{"error": "sync query failed"})
		resp, _ := json.Marshal(WSMessage{Type: "sync_error", Payload: errPayload})
		c.send(resp)
		return
	}

	data, _ := json.Marshal(ops)
	// M2: hasMore 分页标志放在 WSMessage 顶层（payload 保持 operation 数组，向后兼容）
	resp, _ := json.Marshal(WSMessage{Type: "operation", Payload: data, HasMore: hasMore})
	c.send(resp)
}

// writePump pumps messages from the Send channel to the WebSocket connection.
// It also sends periodic ping frames to keep the connection alive.
func (c *WSConnection) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Channel closed.
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("[ws] write error user=%s device=%s: %v", c.UserID, c.DeviceID, err)
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
