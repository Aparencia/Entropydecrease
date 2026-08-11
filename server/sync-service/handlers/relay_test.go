// @ai-context
// Phase 4.2 番茄钟协作接力测试：配对生命周期、权限校验、WS 通知、统计累计。
package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

// resetRelayManager 清空全局接力状态（测试隔离，含序号重置）。
func resetRelayManager() {
	relayManager.mu.Lock()
	relayManager.pairs = make(map[string]*RelayPair)
	relayManager.stats = make(map[string]*RelayUserStats)
	relayManager.seq = 0
	relayManager.mu.Unlock()
}

func TestRelay_FullLifecycle(t *testing.T) {
	resetRelayManager()
	defer resetRelayManager()

	partnerConn := newTestWSConn("u2", t)

	// A 发起配对
	c, w := socialTestContext(http.MethodPost, "/api/v1/relay/pair",
		`{"partnerUserId":"u2"}`, "u1", nil)
	RelayPairRequest(c)
	if w.Code != http.StatusOK {
		t.Fatalf("pair status = %d, body = %s", w.Code, w.Body.String())
	}
	var pair RelayPair
	if err := json.Unmarshal(w.Body.Bytes(), &pair); err != nil {
		t.Fatal(err)
	}
	if pair.Status != "waiting" || pair.UserA != "u1" || pair.UserB != "u2" {
		t.Fatalf("unexpected pair: %+v", pair)
	}
	// 对方收到 relay:request 通知
	reqMsg := expectWSMessage(t, partnerConn, "relay:request")
	if reqMsg["pairId"] != pair.PairID || reqMsg["fromUserId"] != "u1" {
		t.Fatalf("unexpected relay:request: %+v", reqMsg)
	}

	// B 接受
	c2, w2 := socialTestContext(http.MethodPost, "/api/v1/relay/accept",
		`{"pairId":"`+pair.PairID+`"}`, "u2", nil)
	RelayAccept(c2)
	if w2.Code != http.StatusOK {
		t.Fatalf("accept status = %d, body = %s", w2.Code, w2.Body.String())
	}
	var accepted RelayPair
	_ = json.Unmarshal(w2.Body.Bytes(), &accepted)
	if accepted.Status != "running" {
		t.Fatalf("pair status = %s, want running", accepted.Status)
	}

	// A 完成一轮
	connA := newTestWSConn("u1", t)
	c3, w3 := socialTestContext(http.MethodPost, "/api/v1/relay/complete",
		`{"pairId":"`+pair.PairID+`","focusMinutes":25}`, "u1", nil)
	RelayComplete(c3)
	if w3.Code != http.StatusOK {
		t.Fatalf("complete status = %d, body = %s", w3.Code, w3.Body.String())
	}
	// 搭档收到 turn-complete 通知
	doneMsg := expectWSMessage(t, partnerConn, "relay:turn-complete")
	if doneMsg["relayCount"] != float64(1) || doneMsg["totalFocusMinutes"] != float64(25) {
		t.Fatalf("unexpected turn-complete: %+v", doneMsg)
	}
	// A 自己的连接应无回显
	assertNoMessage(t, connA)

	// 双方统计一致
	statsA, pairsA := relayManager.userStats("u1")
	statsB, _ := relayManager.userStats("u2")
	if statsA.RelayCount != 1 || statsA.TotalFocusMinutes != 25 {
		t.Fatalf("A stats = %+v", statsA)
	}
	if statsB.RelayCount != 1 || statsB.TotalFocusMinutes != 25 {
		t.Fatalf("B stats = %+v", statsB)
	}
	if len(pairsA) != 1 || pairsA[0].RelayCount != 1 {
		t.Fatalf("A pairs = %+v", pairsA)
	}

	// GET /relay/stats HTTP
	c4, w4 := socialTestContext(http.MethodGet, "/api/v1/relay/stats", "", "u1", nil)
	RelayStats(c4)
	if w4.Code != http.StatusOK {
		t.Fatalf("stats status = %d", w4.Code)
	}
	var statsResp map[string]interface{}
	_ = json.Unmarshal(w4.Body.Bytes(), &statsResp)
	if statsResp["relayCount"] != float64(1) {
		t.Fatalf("stats response = %+v", statsResp)
	}
}

func TestRelay_ErrorCases(t *testing.T) {
	resetRelayManager()
	defer resetRelayManager()

	// 不能与自己配对
	c, w := socialTestContext(http.MethodPost, "/api/v1/relay/pair",
		`{"partnerUserId":"u1"}`, "u1", nil)
	RelayPairRequest(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("self-pair status = %d, want 400", w.Code)
	}

	// 重复等待请求被拒（409）
	c, w = socialTestContext(http.MethodPost, "/api/v1/relay/pair",
		`{"partnerUserId":"u2"}`, "u1", nil)
	RelayPairRequest(c)
	if w.Code != http.StatusOK {
		t.Fatalf("first pair status = %d", w.Code)
	}
	c, w = socialTestContext(http.MethodPost, "/api/v1/relay/pair",
		`{"partnerUserId":"u3"}`, "u1", nil)
	RelayPairRequest(c)
	if w.Code != http.StatusConflict {
		t.Fatalf("pending-duplicate status = %d, want 409", w.Code)
	}

	// 非受邀方不能接受（403）
	c, w = socialTestContext(http.MethodPost, "/api/v1/relay/accept",
		`{"pairId":"pair_1"}`, "u9", nil)
	RelayAccept(c)
	if w.Code != http.StatusForbidden {
		t.Fatalf("wrong-acceptor status = %d, want 403", w.Code)
	}

	// 未知 pair（404）
	c, w = socialTestContext(http.MethodPost, "/api/v1/relay/accept",
		`{"pairId":"pair_nope"}`, "u2", nil)
	RelayAccept(c)
	if w.Code != http.StatusNotFound {
		t.Fatalf("unknown-pair status = %d, want 404", w.Code)
	}

	// waiting 状态下不能 complete（400）
	c, w = socialTestContext(http.MethodPost, "/api/v1/relay/complete",
		`{"pairId":"pair_1"}`, "u1", nil)
	RelayComplete(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("complete-while-waiting status = %d, want 400", w.Code)
	}

	// 局外人不能 complete（403）
	c, w = socialTestContext(http.MethodPost, "/api/v1/relay/accept",
		`{"pairId":"pair_1"}`, "u2", nil)
	RelayAccept(c)
	if w.Code != http.StatusOK {
		t.Fatalf("accept status = %d", w.Code)
	}
	c, w = socialTestContext(http.MethodPost, "/api/v1/relay/complete",
		`{"pairId":"pair_1"}`, "u9", nil)
	RelayComplete(c)
	if w.Code != http.StatusForbidden {
		t.Fatalf("outsider-complete status = %d, want 403", w.Code)
	}
}

func TestRelay_WSPartnerStatus(t *testing.T) {
	resetRelayManager()
	defer resetRelayManager()

	partnerConn := newTestWSConn("u2", t)
	connA := newTestWSConn("u1", t)

	p, _ := relayManager.createPair("u1", "u2")
	_, _ = relayManager.acceptPair(p.PairID, "u2")

	// A 上报状态 → 转发给 B
	payload, _ := json.Marshal(gin.H{"pairId": p.PairID, "status": "focusing"})
	handleRelayWSMessage(connA, WSMessage{Type: "relay:partner-status", Payload: payload})

	msg := expectWSMessage(t, partnerConn, "relay:partner-status")
	if msg["userId"] != "u1" || msg["status"] != "focusing" {
		t.Fatalf("unexpected partner-status: %+v", msg)
	}
	assertNoMessage(t, connA)

	// 非法状态被忽略
	badPayload, _ := json.Marshal(gin.H{"pairId": p.PairID, "status": "sleeping"})
	handleRelayWSMessage(connA, WSMessage{Type: "relay:partner-status", Payload: badPayload})
	assertNoMessage(t, partnerConn)

	// 非成员上报被忽略
	ghost := newTestWSConn("ghost", t)
	handleRelayWSMessage(ghost, WSMessage{Type: "relay:partner-status", Payload: payload})
	assertNoMessage(t, partnerConn)
}

func TestRelay_ActivePairDuplicateRejected(t *testing.T) {
	resetRelayManager()
	defer resetRelayManager()

	p, _ := relayManager.createPair("u1", "u2")
	_, _ = relayManager.acceptPair(p.PairID, "u2")

	// 反向再请求同一人：running 状态重复配对被拒（409）
	_, err := relayManager.createPair("u2", "u1")
	if err != errPairExists {
		t.Fatalf("err = %v, want errPairExists", err)
	}
}
