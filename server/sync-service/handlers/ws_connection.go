// @ai-context
// WebSocket 单连接生命周期：读写泵、心跳保活与安全关闭。
// Single WebSocket connection lifecycle: read/write pumps, ping-pong keepalive, safe teardown.
// Why: close() 由 mutex 保护且幂等，因为 readPump/writePump/manager 三方都可能触发关闭。
package handlers

import (
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
			select {
			case c.Send <- pong:
			default:
			}

		case "sync_request":
			// Client asks for updates since a given version.
			var payload WSSyncRequestPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				continue
			}
			ops := fetchOperationsSince(payload.SinceVersion, c.DeviceID)
			data, _ := json.Marshal(ops)
			resp, _ := json.Marshal(WSMessage{Type: "operation", Payload: data})
			select {
			case c.Send <- resp:
			default:
			}

		case "operation":
			// Client-pushed operation over WebSocket (future enhancement).
			// For now, acknowledge receipt.
			ack, _ := json.Marshal(WSMessage{Type: "ack", Payload: msg.Payload})
			select {
			case c.Send <- ack:
			default:
			}
		}
	}
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
