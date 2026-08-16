// @ai-context
// Phase 4.3 学习社交镜像（Social Learning Mirror）：topicHash 匿名在场计数，TTL 5 分钟自动过期。
// Social learning mirror: anonymous presence counts per topic hash, 5-minute TTL with cleanup loop.
// Why: 只暴露聚合计数（N 人在学习同类内容），绝不暴露任何用户身份；按 userID 去重防止刷计数。
package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"regexp"
	"sort"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// pulseTTL 匿名在场的有效期：超过 5 分钟未上报视为离开。
const pulseTTL = 5 * time.Minute

// blurThreshold 计数模糊阈值：低于该值的计数对外显示为 0。
// 防止攻击者通过前后计数差推断目标用户是否在场（隐私保护）。
const blurThreshold = 3

// topicHashPattern topicHash 为客户端生成的内容哈希，限定安全字符集（如 base64url/hex）。
var topicHashPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

// saltRotateInterval 服务端盐轮换周期：盐每日更换，防止跨日离线枚举建立 hash→主题 映射。
const saltRotateInterval = 24 * time.Hour

// topicSalt 服务端加盐密钥（进程内随机，定期轮换）。
type topicSalt struct {
	mu        sync.Mutex
	salt      []byte
	rotatedAt time.Time
}

var topicSaler = &topicSalt{}

// getSalt 返回当前盐（每 saltRotateInterval 轮换一次）。
func (s *topicSalt) getSalt(now time.Time) []byte {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.salt) == 0 || now.Sub(s.rotatedAt) >= saltRotateInterval {
		buf := make([]byte, 16)
		_, _ = rand.Read(buf)
		s.salt = buf
		s.rotatedAt = now
	}
	return s.salt
}

// saltHash 对客户端 topicHash 加盐后再哈希，服务端只存储加盐后的值。
// 客户端原始 hash 无法直接枚举服务端存储（无盐时已知主题 hash 可离线探测在场）。
func saltHash(clientHash string, now time.Time) string {
	mac := hmac.New(sha256.New, topicSaler.getSalt(now))
	mac.Write([]byte(clientHash))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

// blurCount 低计数模糊：小于阈值的计数对外显示 0（防在场推断）。
func blurCount(n int) int {
	if n < blurThreshold {
		return 0
	}
	return n
}

// PulseEntry 单个主题的匿名在场聚合（无任何身份信息）。
type PulseEntry struct {
	TopicHash   string    `json:"topicHash"`
	Count       int       `json:"count"`
	LastUpdated time.Time `json:"lastUpdated"`
}

// SocialMirrorManager 维护 topicHash → 匿名计数，及 userID → topic 的去重索引。
type SocialMirrorManager struct {
	mu         sync.RWMutex
	pulses     map[string]*PulseEntry          // topicHash → 聚合在场
	userPulses map[string]map[string]time.Time // userID → topicHash → 最后上报时间
}

// socialMirrorManager 全局单例；init 中启动过期清理循环。
var socialMirrorManager = &SocialMirrorManager{
	pulses:     make(map[string]*PulseEntry),
	userPulses: make(map[string]map[string]time.Time),
}

func init() {
	go goSafe(socialMirrorManager.cleanupLoop)
}

// ---------- SocialMirrorManager 核心方法 ----------

func (m *SocialMirrorManager) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		m.cleanupExpired(time.Now())
	}
}

// cleanupExpired 清理超过 pulseTTL 未上报的在场记录并同步递减计数（对时间参数化，便于测试）。
func (m *SocialMirrorManager) cleanupExpired(now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for userID, topics := range m.userPulses {
		for topicHash, last := range topics {
			if now.Sub(last) >= pulseTTL {
				delete(topics, topicHash)
				m.decrementLocked(topicHash)
			}
		}
		if len(topics) == 0 {
			delete(m.userPulses, userID)
		}
	}
}

// decrementLocked 递减主题计数，归零后移除条目（调用方必须持有写锁）。
func (m *SocialMirrorManager) decrementLocked(topicHash string) {
	if e, ok := m.pulses[topicHash]; ok {
		e.Count--
		if e.Count <= 0 {
			delete(m.pulses, topicHash)
		}
	}
}

// pulse 上报匿名在场：同一用户同一主题在 TTL 内重复上报只刷新时间、不重复计数；
// 已过期上报则先撤销旧在场再重新计数，保证计数恒等于"在场且未过期"的用户数。
func (m *SocialMirrorManager) pulse(userID, topicHash string, now time.Time) *PulseEntry {
	m.mu.Lock()
	defer m.mu.Unlock()
	topics := m.userPulses[userID]
	if topics == nil {
		topics = make(map[string]time.Time)
		m.userPulses[userID] = topics
	}
	if last, ok := topics[topicHash]; ok {
		if now.Sub(last) < pulseTTL {
			// TTL 内重复上报：仅刷新时间
			topics[topicHash] = now
			m.pulses[topicHash].LastUpdated = now
			return m.pulses[topicHash]
		}
		// 已过期（清理循环尚未运行）：撤销旧在场防双计
		delete(topics, topicHash)
		m.decrementLocked(topicHash)
	}
	topics[topicHash] = now
	e := m.pulses[topicHash]
	if e == nil {
		e = &PulseEntry{TopicHash: topicHash}
		m.pulses[topicHash] = e
	}
	e.Count++
	e.LastUpdated = now
	return e
}

// query 查询单个主题的匿名在场（返回副本）。
func (m *SocialMirrorManager) query(topicHash string) (PulseEntry, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	e, ok := m.pulses[topicHash]
	if !ok {
		return PulseEntry{}, false
	}
	return PulseEntry{TopicHash: e.TopicHash, Count: e.Count, LastUpdated: e.LastUpdated}, true
}

// peers 返回全部主题的匿名聚合（按计数降序），不暴露身份。
func (m *SocialMirrorManager) peers() []PulseEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]PulseEntry, 0, len(m.pulses))
	for _, e := range m.pulses {
		out = append(out, PulseEntry{TopicHash: e.TopicHash, Count: e.Count, LastUpdated: e.LastUpdated})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	return out
}

// ---------- HTTP handlers ----------

// SocialPulse handles POST /api/v1/social/pulse
// 匿名在场上报：userId 取自 JWT（仅用于按用户去重，绝不进入响应）。
func SocialPulse(c *gin.Context) {
	userID := c.GetString("user_id")
	var req struct {
		TopicHash string `json:"topicHash"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if !topicHashPattern.MatchString(req.TopicHash) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid topicHash: must match [A-Za-z0-9_-]{1,128}"})
		return
	}
	e := socialMirrorManager.pulse(userID, saltHash(req.TopicHash, time.Now()), time.Now())
	c.JSON(http.StatusOK, gin.H{
		"topicHash":   req.TopicHash, // 回显客户端原始 hash（加盐值仅内部使用）
		"count":       blurCount(e.Count), // 此刻有 N 人正在学习同类内容（低值模糊防推断）
		"lastUpdated": e.LastUpdated,
	})
}

// SocialPulseQuery handles GET /api/v1/social/pulse?topicHash=xxx
func SocialPulseQuery(c *gin.Context) {
	topicHash := c.Query("topicHash")
	if !topicHashPattern.MatchString(topicHash) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid topicHash: must match [A-Za-z0-9_-]{1,128}"})
		return
	}
	e, ok := socialMirrorManager.query(saltHash(topicHash, time.Now()))
	if !ok {
		c.JSON(http.StatusOK, gin.H{"topicHash": topicHash, "count": 0})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"topicHash":   topicHash,
		"count":       blurCount(e.Count),
		"lastUpdated": e.LastUpdated,
	})
}

// SocialPeers handles GET /api/v1/social/peers
func SocialPeers(c *gin.Context) {
	peers := socialMirrorManager.peers()
	if peers == nil {
		peers = []PulseEntry{}
	}
	// 低计数模糊：响应中的 topicHash 为内部加盐值，不暴露客户端原始 hash；
	// 计数低于阈值显示为 0（防在场推断）。
	blurred := make([]PulseEntry, 0, len(peers))
	for _, e := range peers {
		blurred = append(blurred, PulseEntry{TopicHash: e.TopicHash, Count: blurCount(e.Count), LastUpdated: e.LastUpdated})
	}
	c.JSON(http.StatusOK, gin.H{"peers": blurred})
}
