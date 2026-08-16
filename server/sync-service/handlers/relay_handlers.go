// @ai-context
// 本文件由 relay.go 拆分而来（拆分日期 2026-08）：接力 HTTP/WS 处理器与消息载荷。
// Splitted from relay.go (2026-08): relay HTTP/WS handlers and message payloads.
// 职责：RelayPairRequest/RelayEnd/RelayAccept/RelayComplete/RelayStats 五个 Gin
// handler 与 handleRelayWSMessage（relay:partner-status 转发，4.2 协议）。
// 仅做文件切分，零行为改变。
package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ---------- HTTP handlers ----------

// RelayPairRequest handles POST /api/v1/relay/pair
func RelayPairRequest(c *gin.Context) {
	userID := c.GetString("user_id")
	var req struct {
		PartnerUserID string `json:"partnerUserId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.PartnerUserID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "partnerUserId is required"})
		return
	}
	// WG-1: 对方 ID 做长度/字符集白名单校验，防止任意超长参数与 WS 洪泛
	if !isValidDeviceID(req.PartnerUserID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid partnerUserId: must match [A-Za-z0-9_-]{1,64}"})
		return
	}
	p, err := relayManager.createPair(userID, req.PartnerUserID)
	if err != nil {
		c.JSON(relayErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	// 经 WS 通知对方（对方离线则静默跳过）
	wsManager.sendToUser(p.UserB, marshalWSMessage("relay:request", gin.H{
		"pairId": p.PairID, "fromUserId": p.UserA, "status": p.Status,
	}))
	c.JSON(http.StatusOK, p)
}

// RelayEnd handles POST /api/v1/relay/end：任一方结束配对，通知搭档。
func RelayEnd(c *gin.Context) {
	userID := c.GetString("user_id")
	var req struct {
		PairID string `json:"pairId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.PairID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pairId is required"})
		return
	}
	partner, ok := relayManager.partnerOf(req.PairID, userID)
	if !ok {
		c.JSON(relayErrorStatus(errNotInPair), gin.H{"error": "pair not found or not a member"})
		return
	}
	if err := relayManager.endPair(req.PairID, userID); err != nil {
		c.JSON(relayErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	wsManager.sendToUser(partner, marshalWSMessage("relay:ended", gin.H{
		"pairId": req.PairID, "userId": userID,
	}))
	c.JSON(http.StatusOK, gin.H{"pairId": req.PairID, "status": "ended"})
}

// RelayAccept handles POST /api/v1/relay/accept
func RelayAccept(c *gin.Context) {
	userID := c.GetString("user_id")
	var req struct {
		PairID string `json:"pairId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.PairID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pairId is required"})
		return
	}
	p, err := relayManager.acceptPair(req.PairID, userID)
	if err != nil {
		c.JSON(relayErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	// 通知发起方：已被接受
	wsManager.sendToUser(p.UserA, marshalWSMessage("relay:accepted", gin.H{
		"pairId": p.PairID, "userId": userID, "status": p.Status,
	}))
	c.JSON(http.StatusOK, p)
}

// RelayComplete handles POST /api/v1/relay/complete
func RelayComplete(c *gin.Context) {
	userID := c.GetString("user_id")
	var req struct {
		PairID       string `json:"pairId"`
		FocusMinutes int    `json:"focusMinutes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.PairID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pairId is required"})
		return
	}
	p, err := relayManager.completeTurn(req.PairID, userID, req.FocusMinutes)
	if err != nil {
		c.JSON(relayErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	// 通知搭档：本轮完成
	if partner, ok := relayManager.partnerOf(p.PairID, userID); ok {
		wsManager.sendToUser(partner, marshalWSMessage("relay:turn-complete", gin.H{
			"pairId": p.PairID, "userId": userID,
			"relayCount": p.RelayCount, "totalFocusMinutes": p.TotalFocusMinutes,
		}))
	}
	c.JSON(http.StatusOK, p)
}

// RelayStats handles GET /api/v1/relay/stats
func RelayStats(c *gin.Context) {
	userID := c.GetString("user_id")
	stats, pairs := relayManager.userStats(userID)
	c.JSON(http.StatusOK, gin.H{
		"relayCount":        stats.RelayCount,
		"totalFocusMinutes": stats.TotalFocusMinutes,
		"pairs":             pairs,
	})
}

// ---------- WebSocket 消息处理（4.2 协议） ----------

// handleRelayWSMessage 处理 "relay:partner-status"：客户端上报自己的番茄钟状态，
// 服务器校验其确为配对成员后转发给搭档（状态仅限枚举，不携带内容）。
func handleRelayWSMessage(c *WSConnection, msg WSMessage) {
	var payload struct {
		PairID string `json:"pairId"`
		Status string `json:"status"` // focusing | break | done（与房间成员状态一致）
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil || payload.PairID == "" {
		return
	}
	if !validRoomMemberStatus(payload.Status) {
		return
	}
	partner, ok := relayManager.partnerOf(payload.PairID, c.UserID)
	if !ok {
		return
	}
	wsManager.sendToUser(partner, marshalWSMessage("relay:partner-status", gin.H{
		"pairId": payload.PairID, "userId": c.UserID, "status": payload.Status,
	}))
}
