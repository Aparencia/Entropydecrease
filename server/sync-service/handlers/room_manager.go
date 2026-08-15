// @ai-context
// 本文件由 rooms.go 拆分而来（拆分日期 2026-08）：房间领域模型与状态管理。
// Splitted from rooms.go (2026-08): room domain types and in-memory state management.
// 职责：Room/RoomMember/RoomInfo 结构体、RoomManager 结构与全部核心方法
//（cleanupLoop/cleanupExpired/createRoom/joinRoom/leaveRoom/listRooms/getRoomState/
// getMember/updateMemberPresence/broadcastToRoom）、roomManager 单例与 init()、
// 错误哨兵与状态校验辅助。仅做文件切分，零行为改变。
package handlers

import (
	"errors"
	"log"
	"sort"
	"strconv"
	"sync"
	"time"
)

// roomEmptyTTL 空房自动删除阈值：成员清空后超过 10 分钟即回收。
const roomEmptyTTL = 10 * time.Minute

// 房间数量与存活防护（WG-1 防内存无界增长）：
// maxRoomsPerUser 每用户可创建的房间上限；
// roomMaxActiveTTL 活跃房间最长存活（即使仍有成员也回收，防止长期驻留）。
const (
	maxRoomsPerUser  = 10
	roomMaxActiveTTL = 24 * time.Hour
)

// RoomMember 房间成员的匿名在场信息（隐私白名单字段，禁止扩展学习内容）。
type RoomMember struct {
	UserID       string `json:"userId"`
	Nickname     string `json:"nickname"`
	FocusMinutes int    `json:"focusMinutes"`
	TaskSummary  string `json:"taskSummary"` // 短描述，如 "数学复习"（≤64 字符）
	Status       string `json:"status"`      // focusing | break | done
}

// Room 协作深潜房间。
type Room struct {
	ID           string                `json:"id"`
	Name         string                `json:"name"`
	OwnerID      string                `json:"ownerId"`
	IsPublic     bool                  `json:"isPublic"`
	Members      map[string]RoomMember `json:"members"`
	CreatedAt    time.Time             `json:"createdAt"`
	isEmptySince time.Time             // 内部字段：成员清空的起始时间（自动删除判定）
}

// RoomInfo 房间列表条目——不暴露成员明细，仅聚合计数。
type RoomInfo struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	OwnerID     string    `json:"ownerId"`
	IsPublic    bool      `json:"isPublic"`
	MemberCount int       `json:"memberCount"`
	CreatedAt   time.Time `json:"createdAt"`
}

// RoomManager 管理全部在线房间（内存态，进程内单例）。
type RoomManager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
	seq   uint64
}

// roomManager 全局单例；init 中启动空房回收循环。
var roomManager = &RoomManager{rooms: make(map[string]*Room)}

func init() {
	go goSafe(roomManager.cleanupLoop)
}

// 错误哨兵
var (
	errRoomNotFound     = errors.New("room not found")
	errNotRoomMember    = errors.New("not a room member")
	errInvalidRoomName  = errors.New("invalid room name")
	errInvalidNickname  = errors.New("invalid nickname")
	errInvalidTask      = errors.New("invalid task summary")
	errInvalidRoomState = errors.New("invalid member status")
)

// ---------- RoomManager 核心方法 ----------

func (m *RoomManager) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		m.cleanupExpired(time.Now())
	}
}

// cleanupExpired 删除空置超过 roomEmptyTTL 的房间与超过最长存活期的活跃房间（对时间参数化，便于测试）。
func (m *RoomManager) cleanupExpired(now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, room := range m.rooms {
		if now.Sub(room.CreatedAt) > roomMaxActiveTTL {
			delete(m.rooms, id)
			log.Printf("[room] auto-deleted long-lived room %s (%s, age=%s)", id, room.Name, now.Sub(room.CreatedAt).Round(time.Second))
			continue
		}
		if len(room.Members) == 0 && !room.isEmptySince.IsZero() && now.Sub(room.isEmptySince) > roomEmptyTTL {
			delete(m.rooms, id)
			log.Printf("[room] auto-deleted empty room %s (%s)", id, room.Name)
		}
	}
}

// createRoom 创建房间并将 owner 自动加入为成员。每用户房间数受限（WG-1）。
func (m *RoomManager) createRoom(ownerID, name string, isPublic bool) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	// 每用户房间数上限：超出拒绝创建，防单用户无限建房
	owned := 0
	for _, room := range m.rooms {
		if room.OwnerID == ownerID {
			owned++
		}
	}
	if owned >= maxRoomsPerUser {
		return nil
	}
	m.seq++
	room := &Room{
		ID:        "room_" + strconv.FormatUint(m.seq, 10),
		Name:      name,
		OwnerID:   ownerID,
		IsPublic:  isPublic,
		Members:   make(map[string]RoomMember),
		CreatedAt: time.Now().UTC(),
	}
	room.Members[ownerID] = RoomMember{UserID: ownerID, Nickname: ownerID, Status: "focusing"}
	m.rooms[room.ID] = room
	return room
}

// joinRoom 加入房间；已加入则覆盖成员信息（幂等）。
func (m *RoomManager) joinRoom(roomID string, member RoomMember) (*Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return nil, errRoomNotFound
	}
	room.Members[member.UserID] = member
	room.isEmptySince = time.Time{}
	return room, nil
}

// leaveRoom 离开房间；离开后成员为空则记录空置起始时间。返回 false 表示房间不存在或本非成员。
func (m *RoomManager) leaveRoom(roomID, userID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return false
	}
	if _, exists := room.Members[userID]; !exists {
		return false
	}
	delete(room.Members, userID)
	if len(room.Members) == 0 {
		room.isEmptySince = time.Now()
	}
	return true
}

// listRooms 返回全部公开房间的摘要（不含成员明细），按创建时间倒序。
func (m *RoomManager) listRooms() []RoomInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]RoomInfo, 0, len(m.rooms))
	for _, room := range m.rooms {
		if !room.IsPublic {
			continue
		}
		out = append(out, RoomInfo{
			ID:          room.ID,
			Name:        room.Name,
			OwnerID:     room.OwnerID,
			IsPublic:    true,
			MemberCount: len(room.Members),
			CreatedAt:   room.CreatedAt,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

// getRoomState 返回房间深拷贝（防止调用方通过指针篡改内部状态）。
func (m *RoomManager) getRoomState(roomID string) (*Room, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return nil, false
	}
	cp := *room
	cp.Members = make(map[string]RoomMember, len(room.Members))
	for k, v := range room.Members {
		cp.Members[k] = v
	}
	return &cp, true
}

// getMember 获取指定房间内某成员的在场信息。
func (m *RoomManager) getMember(roomID, userID string) (RoomMember, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return RoomMember{}, false
	}
	member, exists := room.Members[userID]
	return member, exists
}

// updateMemberPresence 更新成员在场状态（presence 上报）。未变更的字段保持原值。
func (m *RoomManager) updateMemberPresence(roomID, userID, status string, focusMinutes int, taskSummary string) (*RoomMember, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return nil, false
	}
	member, exists := room.Members[userID]
	if !exists {
		return nil, false
	}
	if status != "" {
		member.Status = status
	}
	if focusMinutes >= 0 {
		member.FocusMinutes = focusMinutes
	}
	if taskSummary != "" {
		member.TaskSummary = taskSummary
	}
	room.Members[userID] = member
	cp := member
	return &cp, true
}

// broadcastToRoom 向房间内全部成员推送 WS 消息（可排除指定用户，避免回声）。
func (m *RoomManager) broadcastToRoom(roomID string, msg []byte, excludeUserID string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return
	}
	for userID := range room.Members {
		if userID == excludeUserID {
			continue
		}
		wsManager.sendToUser(userID, msg)
	}
}

// ---------- 校验辅助 ----------

// validRoomMemberStatus 校验成员状态枚举（focusing/break/done）。
func validRoomMemberStatus(s string) bool {
	return s == "focusing" || s == "break" || s == "done"
}

// validCheerType 校验轻互动类型（like/encourage），禁止自由文本。
func validCheerType(s string) bool {
	return s == "like" || s == "encourage"
}
