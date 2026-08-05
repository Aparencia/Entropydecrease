// @ai-context
// Phase 4.3 学习社交镜像测试：匿名去重、TTL 过期清理、聚合查询、身份不泄露。
package handlers

import (
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"
)

// resetSocialMirrorManager 清空全局镜像状态（测试隔离）。
func resetSocialMirrorManager() {
	socialMirrorManager.mu.Lock()
	socialMirrorManager.pulses = make(map[string]*PulseEntry)
	socialMirrorManager.userPulses = make(map[string]map[string]time.Time)
	socialMirrorManager.mu.Unlock()
}

func TestSocialMirror_PulseDedupePerUser(t *testing.T) {
	resetSocialMirrorManager()
	defer resetSocialMirrorManager()

	now := time.Now()
	// 同用户重复上报不重复计数
	e1 := socialMirrorManager.pulse("u1", "topic-math", now)
	e2 := socialMirrorManager.pulse("u1", "topic-math", now.Add(1*time.Minute))
	if e1.Count != 1 || e2.Count != 1 {
		t.Fatalf("dedupe failed: e1=%d e2=%d", e1.Count, e2.Count)
	}
	// 不同用户分别计数
	e3 := socialMirrorManager.pulse("u2", "topic-math", now.Add(2*time.Minute))
	if e3.Count != 2 {
		t.Fatalf("count = %d, want 2", e3.Count)
	}
	// 不同主题独立计数
	e4 := socialMirrorManager.pulse("u1", "topic-physics", now.Add(3*time.Minute))
	if e4.Count != 1 {
		t.Fatalf("physics count = %d, want 1", e4.Count)
	}
}

func TestSocialMirror_TTLExpiryCleanup(t *testing.T) {
	resetSocialMirrorManager()
	defer resetSocialMirrorManager()

	now := time.Now()
	socialMirrorManager.pulse("u1", "topic-math", now)                    // u1 在 t=0 上报
	socialMirrorManager.pulse("u2", "topic-math", now.Add(2*time.Minute)) // u2 在 t=2min 上报
	socialMirrorManager.pulse("u3", "topic-other", now)

	// 未过期：不清除
	socialMirrorManager.cleanupExpired(now.Add(4 * time.Minute))
	if e, ok := socialMirrorManager.query("topic-math"); !ok || e.Count != 2 {
		t.Fatalf("early cleanup: %+v ok=%v", e, ok)
	}

	// t=6min：u1 已过期（6min≥5min），u2 仍在场（4min<5min）→ 计数递减为 1
	socialMirrorManager.cleanupExpired(now.Add(6 * time.Minute))
	e, ok := socialMirrorManager.query("topic-math")
	if !ok || e.Count != 1 {
		t.Fatalf("after expiry count = %+v ok=%v, want 1", e, ok)
	}
	// 全部过期后条目消失
	socialMirrorManager.cleanupExpired(now.Add(12 * time.Minute))
	if _, ok := socialMirrorManager.query("topic-math"); ok {
		t.Fatal("topic should vanish after all presence expired")
	}
}

func TestSocialMirror_RefreshKeepsPresenceAlive(t *testing.T) {
	resetSocialMirrorManager()
	defer resetSocialMirrorManager()

	now := time.Now()
	socialMirrorManager.pulse("u1", "topic-math", now)
	// 4 分钟时刷新 → 过期时间顺延
	socialMirrorManager.pulse("u1", "topic-math", now.Add(4*time.Minute))
	socialMirrorManager.cleanupExpired(now.Add(6*time.Minute + 30*time.Second))
	if e, ok := socialMirrorManager.query("topic-math"); !ok || e.Count != 1 {
		t.Fatalf("refresh should keep presence: %+v ok=%v", e, ok)
	}
}

func TestSocialMirror_ExpiredRepulseNoDoubleCount(t *testing.T) {
	resetSocialMirrorManager()
	defer resetSocialMirrorManager()

	now := time.Now()
	socialMirrorManager.pulse("u1", "topic-math", now)
	socialMirrorManager.cleanupExpired(now.Add(6 * time.Minute))

	// 过期后重新上报：计数应为 1（而非 2）
	e := socialMirrorManager.pulse("u1", "topic-math", now.Add(7*time.Minute))
	if e.Count != 1 {
		t.Fatalf("repulse count = %d, want 1", e.Count)
	}
}

func TestSocialPulse_HTTP(t *testing.T) {
	resetSocialMirrorManager()
	defer resetSocialMirrorManager()

	c, w := socialTestContext(http.MethodPost, "/api/v1/social/pulse",
		`{"topicHash":"topic-math"}`, "u1", nil)
	SocialPulse(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	// 低计数模糊：单用户在场对外显示 0（防在场推断）
	if resp["count"] != float64(0) || resp["topicHash"] != "topic-math" {
		t.Fatalf("pulse response = %+v", resp)
	}
	// 响应必须不含任何用户身份字段
	if _, leaked := resp["userId"]; leaked {
		t.Fatal("pulse response must not expose userId")
	}

	// 非法 topicHash → 400
	c2, w2 := socialTestContext(http.MethodPost, "/api/v1/social/pulse",
		`{"topicHash":"bad hash!@@#"}`, "u1", nil)
	SocialPulse(c2)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("invalid topicHash status = %d, want 400", w2.Code)
	}
}

func TestSocialPulse_HTTP_BlurThreshold(t *testing.T) {
	resetSocialMirrorManager()
	defer resetSocialMirrorManager()

	// 达到阈值（3 人）才显示真实计数：u1/u2/u3 三人同主题
	for _, uid := range []string{"u1", "u2", "u3"} {
		c, w := socialTestContext(http.MethodPost, "/api/v1/social/pulse",
			`{"topicHash":"topic-math"}`, uid, nil)
		SocialPulse(c)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
		}
	}
	c, w := socialTestContext(http.MethodGet, "/api/v1/social/pulse?topicHash=topic-math", "", "u1", nil)
	c.Request.URL.RawQuery = "topicHash=topic-math"
	SocialPulseQuery(c)
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["count"] != float64(3) {
		t.Fatalf("threshold count = %+v, want 3", resp)
	}
}

func TestSocialPulseQuery_HTTP(t *testing.T) {
	resetSocialMirrorManager()
	defer resetSocialMirrorManager()

	// 经加盐路径上报（与 HTTP 处理一致）：单人在场 → 模糊显示 0
	socialMirrorManager.pulse("u1", saltHash("topic-math", time.Now()), time.Now())

	c, w := socialTestContext(http.MethodGet, "/api/v1/social/pulse?topicHash=topic-math", "", "u1", nil)
	c.Request.URL.RawQuery = "topicHash=topic-math"
	SocialPulseQuery(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["count"] != float64(0) {
		t.Fatalf("query response = %+v", resp)
	}
	if _, leaked := resp["userId"]; leaked {
		t.Fatal("query response must not expose userId")
	}

	// 不存在主题：count 0
	c2, w2 := socialTestContext(http.MethodGet, "/api/v1/social/pulse?topicHash=topic-nope", "", "u1", nil)
	c2.Request.URL.RawQuery = "topicHash=topic-nope"
	SocialPulseQuery(c2)
	if w2.Code != http.StatusOK {
		t.Fatalf("status = %d", w2.Code)
	}
	var resp2 map[string]interface{}
	_ = json.Unmarshal(w2.Body.Bytes(), &resp2)
	if resp2["count"] != float64(0) {
		t.Fatalf("missing topic response = %+v", resp2)
	}
}

func TestSocialPeers_HTTP_NoIdentity(t *testing.T) {
	resetSocialMirrorManager()
	defer resetSocialMirrorManager()

	// math 主题 2 人（模糊为 0）、physics 主题 3 人（达阈值显示 3）
	socialMirrorManager.pulse("u1", saltHash("topic-math", time.Now()), time.Now())
	socialMirrorManager.pulse("u2", saltHash("topic-math", time.Now()), time.Now())
	socialMirrorManager.pulse("u3", saltHash("topic-physics", time.Now()), time.Now())
	socialMirrorManager.pulse("u4", saltHash("topic-physics", time.Now()), time.Now())
	socialMirrorManager.pulse("u5", saltHash("topic-physics", time.Now()), time.Now())

	c, w := socialTestContext(http.MethodGet, "/api/v1/social/peers", "", "u1", nil)
	SocialPeers(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var resp struct {
		Peers []map[string]interface{} `json:"peers"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Peers) != 2 {
		t.Fatalf("peers = %d, want 2: %s", len(resp.Peers), w.Body.String())
	}
	// 按计数降序：physics(3) 在 math(0) 前（模糊后排序）
	if resp.Peers[0]["count"] != float64(3) {
		t.Fatalf("peers[0] = %+v, want physics blurred count 3", resp.Peers[0])
	}
	// 低值模糊：math 主题 2 人显示 0
	if resp.Peers[1]["count"] != float64(0) {
		t.Fatalf("peers[1] = %+v, want math blurred count 0", resp.Peers[1])
	}
	for _, p := range resp.Peers {
		if _, leaked := p["userId"]; leaked {
			t.Fatalf("peers must not expose userId: %+v", p)
		}
	}
}

// TestConcurrentSocialAccess 并发冒烟：清理 goroutine 与请求处理并发访问各管理器不得 panic
// （map 并发写若无锁保护会触发 fatal error，该测试即为锁保护回归验证）。
func TestConcurrentSocialAccess(t *testing.T) {
	resetSocialMirrorManager()
	resetRoomManager()
	resetStudyRoomManager()
	defer resetSocialMirrorManager()
	defer resetRoomManager()
	defer resetStudyRoomManager()

	room := roomManager.createRoom("owner1", "并发房", true)
	roomManager.joinRoom(room.ID, RoomMember{UserID: "u2", Nickname: "B", Status: "focusing"})
	studyRoomManager.occupySeat("studyroom_1", "u1", 1, "focusing")

	done := make(chan struct{})
	var wg sync.WaitGroup

	// 模拟清理循环（与真实 goroutine 相同的访问模式）
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(2 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				socialMirrorManager.cleanupExpired(time.Now())
				roomManager.cleanupExpired(time.Now())
			}
		}
	}()

	// 模拟并发请求
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			uid := "user_" + string(rune('a'+n))
			for j := 0; j < 200; j++ {
				topic := "topic-" + string(rune('a'+n%3))
				socialMirrorManager.pulse(uid, topic, time.Now())
				socialMirrorManager.query(topic)
				socialMirrorManager.peers()
				roomManager.getRoomState(room.ID)
				roomManager.updateMemberPresence(room.ID, "u2", "break", j, "")
				roomManager.broadcastToRoom(room.ID, []byte("{}"), "")
				studyRoomManager.occupySeat("studyroom_1", uid, (j%12)+1, "focusing")
				studyRoomManager.leaveSeat("studyroom_1", uid)
			}
		}(i)
	}

	// 先停止清理循环，再等待全部 goroutine 完成（避免死锁）
	close(done)
	wg.Wait()
}
