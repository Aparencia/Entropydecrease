// @ai-context
// Phase 4.2 番茄钟协作接力（Pomodoro Relay）：双人结对、轮次接力与个人统计（纯内存）。
// Pomodoro relay: two-person pairing, turn relay and per-user stats, all in-memory.
// Why: 接力关系是短期临时协作，无需落库；配对请求经 WS relay:request 通知对方。
package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RelayPair 一条接力配对关系（waiting：待对方接受；running：接力进行中）。
type RelayPair struct {
	PairID            string    `json:"pairId"`
	UserA             string    `json:"userA"` // 发起方
	UserB             string    `json:"userB"` // 接受方
	Status            string    `json:"status"`
	RelayCount        int       `json:"relayCount"`
	TotalFocusMinutes int       `json:"totalFocusMinutes"`
	CreatedAt         time.Time `json:"createdAt"`
}

// RelayUserStats 用户累计接力统计。
type RelayUserStats struct {
	RelayCount        int `json:"relayCount"`
	TotalFocusMinutes int `json:"totalFocusMinutes"`
}

// RelayManager 管理全部接力配对与统计（内存态单例）。
type RelayManager struct {
	mu    sync.RWMutex
	pairs map[string]*RelayPair
	stats map[string]*RelayUserStats
	seq   uint64
}

// relayManager 全局单例。
var relayManager = &RelayManager{
	pairs: make(map[string]*RelayPair),
	stats: make(map[string]*RelayUserStats),
}

// 接力生命周期 TTL：
// waitingPairTTL 待接受配对超时回收（对方不响应即清理）；
// runningPairTTL 进行中配对最长存活（长期闲置也回收，防内存无界增长）。
const (
	waitingPairTTL = 10 * time.Minute
	runningPairTTL = 24 * time.Hour
)

func init() {
	go goSafe(relayManager.cleanupLoop)
}

// cleanupLoop 周期回收过期配对（waiting 超 TTL / running 超最长存活）。
func (m *RelayManager) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		m.cleanupExpired(time.Now())
	}
}

// cleanupExpired 删除过期配对（对时间参数化，便于测试）。
func (m *RelayManager) cleanupExpired(now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, p := range m.pairs {
		age := now.Sub(p.CreatedAt)
		if (p.Status == "waiting" && age > waitingPairTTL) || (p.Status == "running" && age > runningPairTTL) {
			delete(m.pairs, id)
			log.Printf("[relay] auto-reaped %s pair %s (age=%s)", p.Status, id, age.Round(time.Second))
		}
	}
}

// 错误哨兵
var (
	errPairNotFound      = errors.New("pair not found")
	errPairSelf          = errors.New("cannot pair with yourself")
	errPairExists        = errors.New("an active pair already exists with this partner")
	errPairPendingExists = errors.New("you already have a pending pair request")
	errNotPartner        = errors.New("only the invited partner can accept")
	errPairNotWaiting    = errors.New("pair is not waiting for acceptance")
	errPairNotRunning    = errors.New("pair is not running")
	errNotInPair         = errors.New("user is not part of this pair")
)

// ---------- RelayManager 核心方法 ----------

// createPair 发起配对请求：A 请求与 B 结对。
func (m *RelayManager) createPair(requesterID, partnerID string) (*RelayPair, error) {
	if requesterID == partnerID {
		return nil, errPairSelf
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	// 同一对用户已有进行中的接力时拒绝重复配对
	for _, p := range m.pairs {
		if p.Status == "running" &&
			((p.UserA == requesterID && p.UserB == partnerID) ||
				(p.UserA == partnerID && p.UserB == requesterID)) {
			return nil, errPairExists
		}
	}
	// 请求者已有待接受的请求时拒绝（避免堆积）
	for _, p := range m.pairs {
		if p.Status == "waiting" && p.UserA == requesterID {
			return nil, errPairPendingExists
		}
	}
	m.seq++
	p := &RelayPair{
		PairID:    "pair_" + strconv.FormatUint(m.seq, 10),
		UserA:     requesterID,
		UserB:     partnerID,
		Status:    "waiting",
		CreatedAt: time.Now().UTC(),
	}
	m.pairs[p.PairID] = p
	return p, nil
}

// acceptPair 接受配对：仅受邀方（UserB）可接受。
func (m *RelayManager) acceptPair(pairID, userID string) (*RelayPair, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.pairs[pairID]
	if !ok {
		return nil, errPairNotFound
	}
	if p.UserB != userID {
		return nil, errNotPartner
	}
	if p.Status != "waiting" {
		return nil, errPairNotWaiting
	}
	p.Status = "running"
	return p, nil
}

// completeTurn 完成一轮番茄钟：累计轮次与专注分钟，双方统计同步更新。
func (m *RelayManager) completeTurn(pairID, userID string, focusMinutes int) (*RelayPair, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.pairs[pairID]
	if !ok {
		return nil, errPairNotFound
	}
	if p.Status != "running" {
		return nil, errPairNotRunning
	}
	if userID != p.UserA && userID != p.UserB {
		return nil, errNotInPair
	}
	p.RelayCount++
	if focusMinutes > 0 {
		p.TotalFocusMinutes += focusMinutes
	}
	// 双方个人统计同步累加（接力是共同成果）
	for _, uid := range []string{p.UserA, p.UserB} {
		s := m.stats[uid]
		if s == nil {
			s = &RelayUserStats{}
			m.stats[uid] = s
		}
		s.RelayCount++
		if focusMinutes > 0 {
			s.TotalFocusMinutes += focusMinutes
		}
	}
	return p, nil
}

// endPair 结束配对：仅配对方可调用，删除配对并通知搭档（WG-1: 防无界增长）。
func (m *RelayManager) endPair(pairID, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.pairs[pairID]
	if !ok {
		return errPairNotFound
	}
	if userID != p.UserA && userID != p.UserB {
		return errNotInPair
	}
	delete(m.pairs, pairID)
	return nil
}

// userStats 返回用户累计统计与全部相关配对（深拷贝）。
func (m *RelayManager) userStats(userID string) (RelayUserStats, []RelayPair) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s := m.stats[userID]
	if s == nil {
		s = &RelayUserStats{}
	}
	pairs := make([]RelayPair, 0)
	for _, p := range m.pairs {
		if p.UserA == userID || p.UserB == userID {
			pairs = append(pairs, *p)
		}
	}
	return *s, pairs
}

// partnerOf 返回用户在配对中的搭档（非成员返回 false）。
func (m *RelayManager) partnerOf(pairID, userID string) (string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.pairs[pairID]
	if !ok {
		return "", false
	}
	switch userID {
	case p.UserA:
		return p.UserB, true
	case p.UserB:
		return p.UserA, true
	}
	return "", false
}

// relayErrorStatus 将错误哨兵映射为 HTTP 状态码。
func relayErrorStatus(err error) int {
	switch {
	case errors.Is(err, errPairNotFound):
		return http.StatusNotFound
	case errors.Is(err, errNotPartner), errors.Is(err, errNotInPair):
		return http.StatusForbidden
	case errors.Is(err, errPairExists), errors.Is(err, errPairPendingExists):
		return http.StatusConflict
	default:
		return http.StatusBadRequest
	}
}

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
