// @ai-context
// Phase 4.4 虚拟自习室（Virtual Study Room）：固定 12 座位的座位同步（纯内存）。
// Virtual study rooms: fixed 12-seat layout with focus-status seat sync, all in-memory.
// Why: 座位状态为轻量在场数据，无需 DB；seat-update 经 WS 广播给同房占座用户。
// 隐私：座位载荷仅含 {number, occupied, status, userId}，不含任何学习内容。
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
)

// studyRoomSeatCount 每间自习室固定座位数。
const studyRoomSeatCount = 12

// defaultStudyRoomCount 服务启动时预创建的自习室数量。
const defaultStudyRoomCount = 5

// StudySeat 单个座位的在场状态（userId 为最小身份信息，供成员定位自己的座位）。
type StudySeat struct {
	Number   int    `json:"number"`
	Occupied bool   `json:"occupied"`
	Status   string `json:"status"` // focusing | break | away
	UserID   string `json:"userId"`
}

// StudyRoom 一间虚拟自习室（固定座位布局）。
type StudyRoom struct {
	ID    string      `json:"id"`
	Seats []StudySeat `json:"seats"`
}

// StudyRoomManager 管理全部自习室（内存态单例，启动时预创建默认房间）。
type StudyRoomManager struct {
	mu    sync.RWMutex
	rooms map[string]*StudyRoom
}

// studyRoomManager 全局单例；init 预创建默认自习室。
var studyRoomManager = &StudyRoomManager{rooms: make(map[string]*StudyRoom)}

func init() {
	for i := 1; i <= defaultStudyRoomCount; i++ {
		id := fmt.Sprintf("studyroom_%d", i)
		seats := make([]StudySeat, 0, studyRoomSeatCount)
		for n := 1; n <= studyRoomSeatCount; n++ {
			seats = append(seats, StudySeat{Number: n, Status: "away"})
		}
		studyRoomManager.rooms[id] = &StudyRoom{ID: id, Seats: seats}
	}
}

// 错误哨兵
var (
	errStudyRoomNotFound = errors.New("study room not found")
	errInvalidSeat       = errors.New("invalid seat number")
	errSeatTaken         = errors.New("seat already occupied")
	errInvalidSeatStatus = errors.New("invalid seat status")
)

// ---------- StudyRoomManager 核心方法 ----------

// get 返回自习室深拷贝（防止外部篡改内部状态）。
func (m *StudyRoomManager) get(roomID string) (*StudyRoom, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return nil, false
	}
	cp := &StudyRoom{ID: room.ID, Seats: make([]StudySeat, len(room.Seats))}
	copy(cp.Seats, room.Seats)
	return cp, true
}

// occupySeat 占座：自动释放该用户在本房间的旧座位；目标座位被他人占用则返回 errSeatTaken。
func (m *StudyRoomManager) occupySeat(roomID, userID string, seatNumber int, status string) (*StudySeat, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return nil, errStudyRoomNotFound
	}
	if seatNumber < 1 || seatNumber > studyRoomSeatCount {
		return nil, errInvalidSeat
	}
	if !validSeatStatus(status) {
		return nil, errInvalidSeatStatus
	}
	// 释放该用户本房间的旧座位（一人一座）
	for i := range room.Seats {
		if room.Seats[i].Occupied && room.Seats[i].UserID == userID {
			room.Seats[i].Occupied = false
			room.Seats[i].UserID = ""
			room.Seats[i].Status = "away"
		}
	}
	if room.Seats[seatNumber-1].Occupied {
		return nil, errSeatTaken
	}
	room.Seats[seatNumber-1] = StudySeat{
		Number: seatNumber, Occupied: true, Status: status, UserID: userID,
	}
	seat := room.Seats[seatNumber-1]
	return &seat, nil
}

// leaveSeat 释放该用户在本房间的座位；未占座返回 false。
func (m *StudyRoomManager) leaveSeat(roomID, userID string) (*StudySeat, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return nil, false
	}
	for i := range room.Seats {
		if room.Seats[i].Occupied && room.Seats[i].UserID == userID {
			room.Seats[i].Occupied = false
			room.Seats[i].UserID = ""
			room.Seats[i].Status = "away"
			seat := room.Seats[i]
			return &seat, true
		}
	}
	return nil, false
}

// updateSeatStatus 更新本用户座位上的专注状态；未占座返回 false。
func (m *StudyRoomManager) updateSeatStatus(roomID, userID, status string) (*StudySeat, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return nil, false
	}
	for i := range room.Seats {
		if room.Seats[i].Occupied && room.Seats[i].UserID == userID {
			room.Seats[i].Status = status
			seat := room.Seats[i]
			return &seat, true
		}
	}
	return nil, false
}

// roomAudience 返回当前占座用户列表（WS seat-update 广播受众 = 同房占座者）。
func (m *StudyRoomManager) roomAudience(roomID string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return nil
	}
	users := make([]string, 0, len(room.Seats))
	for i := range room.Seats {
		if room.Seats[i].Occupied {
			users = append(users, room.Seats[i].UserID)
		}
	}
	return users
}

// ---------- 校验辅助 ----------

// validSeatStatus 校验座位状态枚举（focusing/break/away）。
func validSeatStatus(s string) bool {
	return s == "focusing" || s == "break" || s == "away"
}

// studyRoomErrorStatus 将错误哨兵映射为 HTTP 状态码。
func studyRoomErrorStatus(err error) int {
	switch {
	case errors.Is(err, errStudyRoomNotFound):
		return http.StatusNotFound
	case errors.Is(err, errSeatTaken):
		return http.StatusConflict
	default:
		return http.StatusBadRequest
	}
}

// broadcastSeatUpdate 向同房占座用户广播座位变更（含变更者本人，保证全房同步）。
func broadcastSeatUpdate(roomID string, seat StudySeat) {
	msg := marshalWSMessage("studyroom:seat-update", gin.H{"roomId": roomID, "seat": seat})
	if msg == nil {
		return
	}
	for _, userID := range studyRoomManager.roomAudience(roomID) {
		wsManager.sendToUser(userID, msg)
	}
}

// ---------- HTTP handlers ----------

// StudyRoomSeat handles POST /api/v1/studyroom/:id/seat
func StudyRoomSeat(c *gin.Context) {
	roomID := c.Param("id")
	userID := c.GetString("user_id")
	var req struct {
		SeatNumber int    `json:"seatNumber"`
		Status     string `json:"status"` // focusing | break | away（默认 focusing）
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if req.Status == "" {
		req.Status = "focusing"
	}
	seat, err := studyRoomManager.occupySeat(roomID, userID, req.SeatNumber, req.Status)
	if err != nil {
		c.JSON(studyRoomErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	broadcastSeatUpdate(roomID, *seat)
	c.JSON(http.StatusOK, gin.H{"roomId": roomID, "seat": seat})
}

// StudyRoomLeaveSeat handles POST /api/v1/studyroom/:id/leave-seat
func StudyRoomLeaveSeat(c *gin.Context) {
	roomID := c.Param("id")
	userID := c.GetString("user_id")
	if _, ok := studyRoomManager.get(roomID); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": errStudyRoomNotFound.Error()})
		return
	}
	seat, released := studyRoomManager.leaveSeat(roomID, userID)
	if released {
		broadcastSeatUpdate(roomID, *seat)
	}
	c.JSON(http.StatusOK, gin.H{"roomId": roomID, "released": released})
}

// StudyRoomGet handles GET /api/v1/studyroom/:id
func StudyRoomGet(c *gin.Context) {
	roomID := c.Param("id")
	room, ok := studyRoomManager.get(roomID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": errStudyRoomNotFound.Error()})
		return
	}
	c.JSON(http.StatusOK, room)
}

// ---------- WebSocket 消息处理（4.4 协议） ----------

// handleStudyRoomWSMessage 处理 "studyroom:seat-status"：更新自己座位上的专注状态并广播。
func handleStudyRoomWSMessage(c *WSConnection, msg WSMessage) {
	var payload struct {
		RoomID string `json:"roomId"`
		Status string `json:"status"` // focusing | break | away
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil || payload.RoomID == "" {
		return
	}
	if !validSeatStatus(payload.Status) {
		return
	}
	seat, ok := studyRoomManager.updateSeatStatus(payload.RoomID, c.UserID, payload.Status)
	if !ok {
		return
	}
	broadcastSeatUpdate(payload.RoomID, *seat)
}
