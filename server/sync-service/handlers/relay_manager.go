// @ai-context
// 本文件由 relay.go 拆分而来（拆分日期 2026-08）：接力配对领域模型与状态机。
// Splitted from relay.go (2026-08): relay pair domain types and state machine.
// 职责：RelayPair/RelayUserStats/RelayManager 结构体、TTL 常量、relayManager
// 单例与 init()、错误哨兵、核心方法（createPair/acceptPair/completeTurn/endPair/
// userStats/partnerOf/cleanupLoop/cleanupExpired）与 relayErrorStatus 状态映射。
// 仅做文件切分，零行为改变。
package handlers

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"
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
