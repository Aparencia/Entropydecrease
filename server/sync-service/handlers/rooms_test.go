// @ai-context
// Phase 4.1 协作深潜测试：房间生命周期、在场广播、cheer 隐私约束、空房自动回收。
package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// resetRoomManager 清空全局房间状态（测试隔离）。
func resetRoomManager() {
	roomManager.mu.Lock()
	roomManager.rooms = make(map[string]*Room)
	roomManager.mu.Unlock()
}

// newTestWSConn 注册一个测试 WS 连接（发送缓冲 16，无真实 socket），返回连接与清理函数。
// 注意：测试连接 Conn 为 nil，清理时仅注销（unregister），不调用 close()（避免 nil 解引用）。
func newTestWSConn(userID string, t *testing.T) *WSConnection {
	t.Helper()
	conn := &WSConnection{
		UserID:   userID,
		DeviceID: "dev-" + userID,
		Send:     make(chan []byte, 16),
	}
	if !wsManager.register(conn) {
		t.Fatalf("register conn failed for %s", userID)
	}
	t.Cleanup(func() {
		wsManager.unregister(conn)
	})
	return conn
}

// expectWSMessage 从连接通道读取一条消息并断言类型，返回解析后的 payload。
func expectWSMessage(t *testing.T, conn *WSConnection, wantType string) map[string]interface{} {
	t.Helper()
	select {
	case raw := <-conn.Send:
		var msg WSMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			t.Fatalf("invalid WS message: %v", err)
		}
		if msg.Type != wantType {
			t.Fatalf("message type = %q, want %q", msg.Type, wantType)
		}
		var payload map[string]interface{}
		if len(msg.Payload) > 0 {
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				t.Fatalf("invalid payload: %v", err)
			}
		}
		return payload
	case <-time.After(2 * time.Second):
		t.Fatalf("no %s message received for %s", wantType, conn.UserID)
		return nil
	}
}

// assertNoMessage 断言连接在短时间内无新消息。
func assertNoMessage(t *testing.T, conn *WSConnection) {
	t.Helper()
	select {
	case raw := <-conn.Send:
		t.Fatalf("unexpected message: %s", string(raw))
	case <-time.After(200 * time.Millisecond):
	}
}

// socialTestContext 构造带 user_id 的 Gin 测试上下文。
func socialTestContext(method, path, body, userID string, params gin.Params) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = params
	c.Set("user_id", userID)
	return c, w
}

func TestRoomManager_CreateJoinLeaveLifecycle(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	room := roomManager.createRoom("owner1", "深潜一号", true)
	if room.ID == "" || room.OwnerID != "owner1" || !room.IsPublic {
		t.Fatalf("unexpected room: %+v", room)
	}
	if len(room.Members) != 1 || room.Members["owner1"].Status != "focusing" {
		t.Fatalf("owner should auto-join, got %+v", room.Members)
	}

	member := RoomMember{UserID: "user2", Nickname: "潜航员B", Status: "focusing", TaskSummary: "数学复习"}
	joined, err := roomManager.joinRoom(room.ID, member)
	if err != nil || len(joined.Members) != 2 {
		t.Fatalf("join failed: %v, members=%d", err, len(joined.Members))
	}

	if !roomManager.leaveRoom(room.ID, "user2") {
		t.Fatal("leave should succeed for member")
	}
	state, _ := roomManager.getRoomState(room.ID)
	if len(state.Members) != 1 {
		t.Fatalf("members after leave = %d, want 1", len(state.Members))
	}
	if roomManager.leaveRoom(room.ID, "ghost") {
		t.Fatal("leave should fail for non-member")
	}
}

func TestRoomManager_JoinUnknownRoom(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	_, err := roomManager.joinRoom("room_nope", RoomMember{UserID: "u1"})
	if err != errRoomNotFound {
		t.Fatalf("err = %v, want errRoomNotFound", err)
	}
}

func TestRoomManager_ListRoomsOnlyPublic(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	roomManager.createRoom("a", "public room", true)
	roomManager.createRoom("b", "private room", false)

	rooms := roomManager.listRooms()
	if len(rooms) != 1 {
		t.Fatalf("public rooms = %d, want 1", len(rooms))
	}
	if rooms[0].Name != "public room" || rooms[0].MemberCount != 1 {
		t.Fatalf("unexpected room info: %+v", rooms[0])
	}
}

func TestRoomManager_AutoDeleteAfterEmptyTTL(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	room := roomManager.createRoom("owner1", "临时房", true)
	roomManager.leaveRoom(room.ID, "owner1")

	// 空置未超过 10 分钟：保留
	roomManager.cleanupExpired(time.Now())
	if _, ok := roomManager.getRoomState(room.ID); !ok {
		t.Fatal("room deleted too early")
	}

	// 空置超过 10 分钟：回收
	roomManager.mu.Lock()
	roomManager.rooms[room.ID].isEmptySince = time.Now().Add(-11 * time.Minute)
	roomManager.mu.Unlock()
	roomManager.cleanupExpired(time.Now())
	if _, ok := roomManager.getRoomState(room.ID); ok {
		t.Fatal("empty room should be auto-deleted after TTL")
	}
}

func TestRoomManager_NonEmptyRoomNeverDeleted(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	room := roomManager.createRoom("owner1", "活跃房", true)
	member := RoomMember{UserID: "user2", Nickname: "B"}
	roomManager.joinRoom(room.ID, member)

	roomManager.cleanupExpired(time.Now().Add(30 * time.Minute))
	if _, ok := roomManager.getRoomState(room.ID); !ok {
		t.Fatal("active room should never be deleted")
	}
}

func TestCreateRoom_HTTP(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	c, w := socialTestContext(http.MethodPost, "/api/v1/rooms",
		`{"name":"深潜房间","isPublic":true}`, "u1", nil)
	CreateRoom(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp Room
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response not Room JSON: %v", err)
	}
	if resp.Name != "深潜房间" || resp.OwnerID != "u1" || len(resp.Members) != 1 {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

func TestCreateRoom_InvalidName(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	c, w := socialTestContext(http.MethodPost, "/api/v1/rooms", `{"name":"  "}`, "u1", nil)
	CreateRoom(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestJoinRoom_BroadcastsPresenceToOthers(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	owner := newTestWSConn("owner1", t)
	joiner := newTestWSConn("u2", t)

	room := roomManager.createRoom("owner1", "房间", true)

	c, w := socialTestContext(http.MethodPost, "/api/v1/rooms/"+room.ID+"/join",
		`{"nickname":"潜航员B","taskSummary":"数学复习"}`, "u2", gin.Params{{Key: "id", Value: room.ID}})
	JoinRoom(c)

	if w.Code != http.StatusOK {
		t.Fatalf("join status = %d, body = %s", w.Code, w.Body.String())
	}
	// owner 应收到 room:presence（排除加入者 u2）
	payload := expectWSMessage(t, owner, "room:presence")
	if payload["userId"] != "u2" || payload["nickname"] != "潜航员B" {
		t.Fatalf("unexpected presence payload: %+v", payload)
	}
	if _, leaked := payload["taskContent"]; leaked {
		t.Fatal("presence must never carry content details")
	}
	// joiner 自己不应收到回声
	assertNoMessage(t, joiner)
}

func TestJoinRoom_UnknownRoom404(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	c, w := socialTestContext(http.MethodPost, "/api/v1/rooms/room_nope/join", `{}`, "u1",
		gin.Params{{Key: "id", Value: "room_nope"}})
	JoinRoom(c)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestLeaveRoom_BroadcastsLeftPresence(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	owner := newTestWSConn("owner1", t)
	room := roomManager.createRoom("owner1", "房间", true)
	roomManager.joinRoom(room.ID, RoomMember{UserID: "u2", Nickname: "B", Status: "focusing"})

	c, w := socialTestContext(http.MethodPost, "/api/v1/rooms/"+room.ID+"/leave", "", "u2",
		gin.Params{{Key: "id", Value: room.ID}})
	LeaveRoom(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	payload := expectWSMessage(t, owner, "room:presence")
	if payload["userId"] != "u2" || payload["status"] != "left" {
		t.Fatalf("unexpected left presence: %+v", payload)
	}
}

func TestWS_RoomPresenceUpdate(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	owner := newTestWSConn("owner1", t)
	member := newTestWSConn("u2", t)

	room := roomManager.createRoom("owner1", "房间", true)
	roomManager.joinRoom(room.ID, RoomMember{UserID: "u2", Nickname: "B", Status: "focusing"})

	// u2 经 WS 上报在场变化
	payload, _ := json.Marshal(gin.H{"roomId": room.ID, "status": "break", "focusMinutes": 25})
	handleRoomWSMessage(member, WSMessage{Type: "room:presence", Payload: payload})

	msg := expectWSMessage(t, owner, "room:presence")
	if msg["userId"] != "u2" || msg["status"] != "break" || msg["focusMinutes"] != float64(25) {
		t.Fatalf("unexpected presence: %+v", msg)
	}
	// 发送者不应收到回声
	assertNoMessage(t, member)
}

func TestWS_RoomPresenceUnknownMemberIgnored(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	ghost := newTestWSConn("ghost", t)
	room := roomManager.createRoom("owner1", "房间", true)

	payload, _ := json.Marshal(gin.H{"roomId": room.ID, "status": "break"})
	handleRoomWSMessage(ghost, WSMessage{Type: "room:presence", Payload: payload})

	assertNoMessage(t, ghost)
}

func TestWS_RoomCheer_PrivacyConstrained(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	owner := newTestWSConn("owner1", t)
	cheerer := newTestWSConn("u2", t)

	room := roomManager.createRoom("owner1", "房间", true)
	roomManager.joinRoom(room.ID, RoomMember{UserID: "u2", Nickname: "潜航员B", Status: "focusing"})

	payload, _ := json.Marshal(gin.H{"roomId": room.ID, "type": "like"})
	handleRoomWSMessage(cheerer, WSMessage{Type: "room:cheer", Payload: payload})

	msg := expectWSMessage(t, owner, "room:cheer")
	if msg["from"] != "潜航员B" || msg["type"] != "like" {
		t.Fatalf("unexpected cheer: %+v", msg)
	}
	// 自由文本被拒绝（非法类型忽略，无广播）
	badPayload, _ := json.Marshal(gin.H{"roomId": room.ID, "type": "自定义文本", "text": "垃圾内容"})
	handleRoomWSMessage(cheerer, WSMessage{Type: "room:cheer", Payload: badPayload})
	assertNoMessage(t, owner)
	// 发送者无回声
	assertNoMessage(t, cheerer)
}

func TestWS_RoomCreateAndJoin(t *testing.T) {
	resetRoomManager()
	defer resetRoomManager()

	connA := newTestWSConn("a1", t)
	connB := newTestWSConn("b2", t)

	createPayload, _ := json.Marshal(gin.H{"name": "WS 房间", "isPublic": true})
	handleRoomWSMessage(connA, WSMessage{Type: "room:create", Payload: createPayload})
	stateMsg := expectWSMessage(t, connA, "room:state")
	roomID, _ := stateMsg["id"].(string)
	if roomID == "" {
		t.Fatalf("room state missing id: %+v", stateMsg)
	}

	joinPayload, _ := json.Marshal(gin.H{"roomId": roomID, "nickname": "B"})
	handleRoomWSMessage(connB, WSMessage{Type: "room:join", Payload: joinPayload})
	expectWSMessage(t, connB, "room:state")
	expectWSMessage(t, connA, "room:presence")

	leavePayload, _ := json.Marshal(gin.H{"roomId": roomID})
	handleRoomWSMessage(connB, WSMessage{Type: "room:leave", Payload: leavePayload})
	expectWSMessage(t, connA, "room:presence")
}
