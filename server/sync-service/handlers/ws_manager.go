// @ai-context
// WebSocket 连接管理器：按 userID → deviceID 两级索引维护全部在线连接。
// WebSocket connection manager: tracks live connections indexed by userID → deviceID.
// Why: 广播时发送缓冲已满则异步关闭该连接（背压保护），防止单个慢客户端拖垮广播路径。
package handlers

import (
	"context"
	"log"
	"sync"
	"time"

	"entropydecrease/sync-service/cache"

	"github.com/gorilla/websocket"
)

// maxConnsPerUser 每用户最大 WebSocket 连接数（M12）。
const maxConnsPerUser = 5

// WSManager keeps track of all live WebSocket connections, indexed by userID → deviceID.
type WSManager struct {
	mu          sync.RWMutex
	connections map[string]map[string]*WSConnection
}

// Global singleton used by handlers.
var wsManager = &WSManager{
	connections: make(map[string]map[string]*WSConnection),
}

// register adds a connection to the manager.
// 返回 false 表示该用户连接数已达上限被拒绝（M12）。
func (m *WSManager) register(c *WSConnection) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	devices, ok := m.connections[c.UserID]
	if !ok {
		devices = make(map[string]*WSConnection)
		m.connections[c.UserID] = devices
	}
	// M12: 每用户连接数上限 ≤5；同一设备的重连替换不占用新名额
	if _, exists := devices[c.DeviceID]; !exists && len(devices) >= maxConnsPerUser {
		log.Printf("[ws] registration rejected user=%s device=%s: too many connections (%d)", c.UserID, c.DeviceID, len(devices))
		return false
	}
	// Replace any previous connection from the same device.
	if old, exists := devices[c.DeviceID]; exists {
		old.close()
	}
	devices[c.DeviceID] = c
	log.Printf("[ws] registered user=%s device=%s", c.UserID, c.DeviceID)
	return true
}

// unregister removes a connection from the manager.
// M3: 连接断开时同步从 Redis 在线设备集合移除（异步执行，不阻塞锁）。
func (m *WSManager) unregister(c *WSConnection) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if devices, ok := m.connections[c.UserID]; ok {
		if existing, exists := devices[c.DeviceID]; exists && existing == c {
			delete(devices, c.DeviceID)
			log.Printf("[ws] unregistered user=%s device=%s", c.UserID, c.DeviceID)
		}
		if len(devices) == 0 {
			delete(m.connections, c.UserID)
		}
	}
	// M3: 断开时从在线设备集合移除
	go func() {
		if err := cache.SetDeviceOffline(context.Background(), c.UserID, c.DeviceID); err != nil {
			log.Printf("[ws] SetDeviceOffline failed user=%s device=%s: %v", c.UserID, c.DeviceID, err)
		}
	}()
}

// broadcastToUser sends a message to all online devices of a user, optionally excluding one device.
func (m *WSManager) broadcastToUser(userID string, excludeDeviceID string, message []byte) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	devices, ok := m.connections[userID]
	if !ok {
		return
	}
	for deviceID, conn := range devices {
		if deviceID == excludeDeviceID {
			continue
		}
		if !conn.send(message) {
			// Buffer full or closed → close connection to protect the server.
			log.Printf("[ws] buffer overflow, closing user=%s device=%s", userID, deviceID)
			go conn.close()
		}
	}
}

// closeAll 向所有在线连接广播 CloseMessage 并关闭（M5：优雅关闭）。
func (m *WSManager) closeAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	closePayload := websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutting down")
	for userID, devices := range m.connections {
		for deviceID, conn := range devices {
			_ = conn.Conn.WriteControl(websocket.CloseMessage, closePayload, time.Now().Add(writeWait))
			conn.close()
			log.Printf("[ws] closed on shutdown user=%s device=%s", userID, deviceID)
		}
	}
}
