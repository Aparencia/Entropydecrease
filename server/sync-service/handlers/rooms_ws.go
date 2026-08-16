// @ai-context
// 本文件由 rooms.go 拆分而来（拆分日期 2026-08）：房间 WebSocket 消息处理。
// Splitted from rooms.go (2026-08): room WebSocket message handling.
// 职责：handleRoomWSMessage 处理 room:create/join/leave/presence/cheer 五类
// WS 消息及其内联 payload 结构体（4.1 协议）。仅做文件切分，零行为改变。
package handlers

import (
	"encoding/json"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

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
