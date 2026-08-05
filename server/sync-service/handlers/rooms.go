// @ai-context
// Phase 4.1 协作深潜（Collaborative Deep Dive）：内存态房间协议 + HTTP 路由 + WS 消息处理。
// Collaborative deep-dive rooms: in-memory room lifecycle, HTTP endpoints, WS presence/cheer.
// Why: 纯在场功能（presence），无需 DB——房间随进程生命周期存在，空置超过 10 分钟自动回收。
// 隐私约束：room:presence 仅携带 {userId, nickname, status, focusMinutes, taskSummary}，
// 绝不携带任何学习内容明细；cheer 仅限固定类型（like/encourage），禁止自由文本。
package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
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
	go roomManager.cleanupLoop()
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

// ---------- HTTP handlers ----------

type createRoomRequest struct {
	Name     string `json:"name"`
	IsPublic *bool  `json:"isPublic"` // 默认 true
}

// CreateRoom handles POST /api/v1/rooms
func CreateRoom(c *gin.Context) {
	userID := c.GetString("user_id")
	var req createRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || utf8.RuneCountInString(req.Name) > 64 {
		c.JSON(http.StatusBadRequest, gin.H{"error": errInvalidRoomName.Error()})
		return
	}
	isPublic := true
	if req.IsPublic != nil {
		isPublic = *req.IsPublic
	}
	room := roomManager.createRoom(userID, req.Name, isPublic)
	if room == nil {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "room limit reached (max 10 per user)"})
		return
	}
	c.JSON(http.StatusOK, room)
}

type joinRoomRequest struct {
	Nickname     string `json:"nickname"`
	Status       string `json:"status"`
	FocusMinutes int    `json:"focusMinutes"`
	TaskSummary  string `json:"taskSummary"`
}

// JoinRoom handles POST /api/v1/rooms/:id/join
func JoinRoom(c *gin.Context) {
	roomID := c.Param("id")
	userID := c.GetString("user_id")
	var req joinRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	member, errMsg := sanitizeRoomMember(userID, req.Nickname, req.Status, req.TaskSummary, req.FocusMinutes)
	if errMsg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": errMsg})
		return
	}
	room, err := roomManager.joinRoom(roomID, member)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	// 广播到场通知（排除加入者自己，状态经 HTTP 响应返回）
	broadcastRoomPresence(roomID, member, userID)
	c.JSON(http.StatusOK, room)
}

// LeaveRoom handles POST /api/v1/rooms/:id/leave
func LeaveRoom(c *gin.Context) {
	roomID := c.Param("id")
	userID := c.GetString("user_id")

	member, wasMember := roomManager.getMember(roomID, userID)
	if !roomManager.leaveRoom(roomID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": errRoomNotFound.Error()})
		return
	}
	if wasMember {
		// 广播离开事件：presence 中 status 置为 "left" 表示成员已退出（仅在场字段，无内容）
		member.Status = "left"
		broadcastRoomPresence(roomID, member, userID)
	}
	c.JSON(http.StatusOK, gin.H{"roomId": roomID, "left": true})
}

// ListRooms handles GET /api/v1/rooms
func ListRooms(c *gin.Context) {
	rooms := roomManager.listRooms()
	if rooms == nil {
		rooms = []RoomInfo{}
	}
	c.JSON(http.StatusOK, gin.H{"rooms": rooms})
}

// ---------- 共享辅助 ----------

// sanitizeRoomMember 校验并归一化成员字段，返回 (成员, 空错误串) 或错误信息。
func sanitizeRoomMember(userID, nickname, status, taskSummary string, focusMinutes int) (RoomMember, string) {
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		nickname = userID
	}
	if utf8.RuneCountInString(nickname) > 32 {
		return RoomMember{}, errInvalidNickname.Error()
	}
	if status != "" && !validRoomMemberStatus(status) {
		return RoomMember{}, errInvalidRoomState.Error()
	}
	if status == "" {
		status = "focusing"
	}
	// WG-2: taskSummary 是白名单内唯一自由文本字段，先 trim 防纯空白绕过
	taskSummary = strings.TrimSpace(taskSummary)
	if utf8.RuneCountInString(taskSummary) > 64 {
		return RoomMember{}, errInvalidTask.Error()
	}
	if focusMinutes < 0 {
		focusMinutes = 0
	}
	return RoomMember{
		UserID:       userID,
		Nickname:     nickname,
		Status:       status,
		FocusMinutes: focusMinutes,
		TaskSummary:  taskSummary,
	}, ""
}

// broadcastRoomPresence 向房间广播成员在场信息（排除指定用户）。
func broadcastRoomPresence(roomID string, member RoomMember, excludeUserID string) {
	msg := marshalWSMessage("room:presence", member)
	if msg == nil {
		return
	}
	roomManager.broadcastToRoom(roomID, msg, excludeUserID)
}

// ---------- WebSocket 消息处理（4.1 协议） ----------

// handleRoomWSMessage 处理客户端经 WS 发送的房间消息（room:create/join/leave/presence/cheer）。
func handleRoomWSMessage(c *WSConnection, msg WSMessage) {
	switch msg.Type {
	case "room:create":
		var payload struct {
			Name     string `json:"name"`
			IsPublic *bool  `json:"isPublic"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return
		}
		payload.Name = strings.TrimSpace(payload.Name)
		if payload.Name == "" || utf8.RuneCountInString(payload.Name) > 64 {
			return
		}
		isPublic := true
		if payload.IsPublic != nil {
			isPublic = *payload.IsPublic
		}
		room := roomManager.createRoom(c.UserID, payload.Name, isPublic)
		c.send(marshalWSMessage("room:state", room))

	case "room:join":
		var payload struct {
			RoomID       string `json:"roomId"`
			Nickname     string `json:"nickname"`
			Status       string `json:"status"`
			FocusMinutes int    `json:"focusMinutes"`
			TaskSummary  string `json:"taskSummary"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return
		}
		member, errMsg := sanitizeRoomMember(c.UserID, payload.Nickname, payload.Status, payload.TaskSummary, payload.FocusMinutes)
		if errMsg != "" {
			return
		}
		room, err := roomManager.joinRoom(payload.RoomID, member)
		if err != nil {
			return
		}
		c.send(marshalWSMessage("room:state", room))
		broadcastRoomPresence(payload.RoomID, member, c.UserID)

	case "room:leave":
		var payload struct {
			RoomID string `json:"roomId"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return
		}
		member, wasMember := roomManager.getMember(payload.RoomID, c.UserID)
		if !roomManager.leaveRoom(payload.RoomID, c.UserID) {
			return
		}
		if wasMember {
			member.Status = "left"
			broadcastRoomPresence(payload.RoomID, member, c.UserID)
		}

	case "room:presence":
		var payload struct {
			RoomID       string `json:"roomId"`
			Status       string `json:"status"`
			FocusMinutes int    `json:"focusMinutes"`
			TaskSummary  string `json:"taskSummary"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return
		}
		if payload.Status != "" && !validRoomMemberStatus(payload.Status) {
			return
		}
		if utf8.RuneCountInString(payload.TaskSummary) > 64 {
			return
		}
		member, ok := roomManager.updateMemberPresence(payload.RoomID, c.UserID,
			payload.Status, payload.FocusMinutes, payload.TaskSummary)
		if !ok {
			return
		}
		broadcastRoomPresence(payload.RoomID, *member, c.UserID)

	case "room:cheer":
		var payload struct {
			RoomID string `json:"roomId"`
			Type   string `json:"type"` // like | encourage
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return
		}
		if !validCheerType(payload.Type) {
			return
		}
		// 轻互动仅携带发送者昵称与固定类型，无自由文本
		member, ok := roomManager.getMember(payload.RoomID, c.UserID)
		if !ok {
			return
		}
		msg := marshalWSMessage("room:cheer", gin.H{"from": member.Nickname, "type": payload.Type})
		if msg == nil {
			return
		}
		roomManager.broadcastToRoom(payload.RoomID, msg, c.UserID)
	}
}
