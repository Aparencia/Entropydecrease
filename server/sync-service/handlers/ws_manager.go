// @ai-context
// WebSocket 连接管理器：按 userID → deviceID 两级索引维护全部在线连接。
// WebSocket connection manager: tracks live connections indexed by userID → deviceID.
// Why: 广播时发送缓冲已满则异步关闭该连接（背压保护），防止单个慢客户端拖垮广播路径。
package handlers

import (
	"log"
	"sync"
)

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
func (m *WSManager) register(c *WSConnection) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.connections[c.UserID]; !ok {
		m.connections[c.UserID] = make(map[string]*WSConnection)
	}
	// Replace any previous connection from the same device.
	if old, exists := m.connections[c.UserID][c.DeviceID]; exists {
		old.close()
	}
	m.connections[c.UserID][c.DeviceID] = c
	log.Printf("[ws] registered user=%s device=%s", c.UserID, c.DeviceID)
}

// unregister removes a connection from the manager.
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
		if conn.isClosed() {
			continue
		}
		select {
		case conn.Send <- message:
		default:
			// Buffer full → close connection to protect the server.
			log.Printf("[ws] buffer overflow, closing user=%s device=%s", userID, deviceID)
			go conn.close()
		}
	}
}
