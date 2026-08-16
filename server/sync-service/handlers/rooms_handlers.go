// @ai-context
// 本文件由 rooms.go 拆分而来（拆分日期 2026-08）：房间 HTTP 路由处理器与共享辅助。
// Splitted from rooms.go (2026-08): room HTTP handlers and shared helpers.
// 职责：CreateRoom/JoinRoom/LeaveRoom/ListRooms 四个 Gin handler、请求结构体、
// sanitizeRoomMember 与 broadcastRoomPresence 辅助（HTTP 与 WS 共用）。
// 仅做文件切分，零行为改变。
package handlers

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

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
