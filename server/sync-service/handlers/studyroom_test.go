// @ai-context
// Phase 4.4 虚拟自习室测试：占座/换座/释放、冲突、状态更新广播、座位载荷隐私。
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

// resetStudyRoomManager 清空并重建默认自习室（测试隔离）。
func resetStudyRoomManager() {
	studyRoomManager.mu.Lock()
	studyRoomManager.rooms = make(map[string]*StudyRoom)
	for i := 1; i <= defaultStudyRoomCount; i++ {
		id := fmt.Sprintf("studyroom_%d", i)
		seats := make([]StudySeat, 0, studyRoomSeatCount)
		for n := 1; n <= studyRoomSeatCount; n++ {
			seats = append(seats, StudySeat{Number: n, Status: "away"})
		}
		studyRoomManager.rooms[id] = &StudyRoom{ID: id, Seats: seats}
	}
	studyRoomManager.mu.Unlock()
}

func TestStudyRoom_OccupyLeaveLifecycle(t *testing.T) {
	resetStudyRoomManager()
	defer resetStudyRoomManager()

	room, _ := studyRoomManager.get("studyroom_1")
	if len(room.Seats) != studyRoomSeatCount {
		t.Fatalf("seats = %d, want %d", len(room.Seats), studyRoomSeatCount)
	}

	seat, err := studyRoomManager.occupySeat("studyroom_1", "u1", 3, "focusing")
	if err != nil || !seat.Occupied || seat.UserID != "u1" || seat.Status != "focusing" {
		t.Fatalf("occupy failed: seat=%+v err=%v", seat, err)
	}

	// 换座：自动释放旧座位
	_, err = studyRoomManager.occupySeat("studyroom_1", "u1", 7, "break")
	if err != nil {
		t.Fatalf("move seat failed: %v", err)
	}
	room, _ = studyRoomManager.get("studyroom_1")
	if room.Seats[2].Occupied {
		t.Fatal("old seat should be released on move")
	}
	if !room.Seats[6].Occupied || room.Seats[6].UserID != "u1" {
		t.Fatalf("new seat = %+v", room.Seats[6])
	}

	// 离开
	released, ok := studyRoomManager.leaveSeat("studyroom_1", "u1")
	if !ok || released.Number != 7 || released.Occupied {
		t.Fatalf("leave failed: %+v ok=%v", released, ok)
	}
	// 未占座时离开返回 false
	if _, ok := studyRoomManager.leaveSeat("studyroom_1", "u1"); ok {
		t.Fatal("leave should fail when not seated")
	}
}

func TestStudyRoom_SeatConflict(t *testing.T) {
	resetStudyRoomManager()
	defer resetStudyRoomManager()

	if _, err := studyRoomManager.occupySeat("studyroom_1", "u1", 1, "focusing"); err != nil {
		t.Fatal(err)
	}
	_, err := studyRoomManager.occupySeat("studyroom_1", "u2", 1, "focusing")
	if err != errSeatTaken {
		t.Fatalf("err = %v, want errSeatTaken", err)
	}
	// 非法座位号
	if _, err := studyRoomManager.occupySeat("studyroom_1", "u2", 13, "focusing"); err != errInvalidSeat {
		t.Fatalf("err = %v, want errInvalidSeat", err)
	}
	// 未知房间
	if _, err := studyRoomManager.occupySeat("studyroom_nope", "u2", 1, "focusing"); err != errStudyRoomNotFound {
		t.Fatalf("err = %v, want errStudyRoomNotFound", err)
	}
}

func TestStudyRoom_HTTPOccupyBroadcast(t *testing.T) {
	resetStudyRoomManager()
	defer resetStudyRoomManager()

	connA := newTestWSConn("u1", t)
	connB := newTestWSConn("u2", t)

	// A 占座
	c, w := socialTestContext(http.MethodPost, "/api/v1/studyroom/studyroom_1/seat",
		`{"seatNumber":2,"status":"focusing"}`, "u1",
		gin.Params{{Key: "id", Value: "studyroom_1"}})
	StudyRoomSeat(c)
	if w.Code != http.StatusOK {
		t.Fatalf("seat status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["seat"].(map[string]interface{})["number"] != float64(2) {
		t.Fatalf("seat response = %+v", resp)
	}
	expectWSMessage(t, connA, "studyroom:seat-update")

	// B 占同一座位 → 409
	c2, w2 := socialTestContext(http.MethodPost, "/api/v1/studyroom/studyroom_1/seat",
		`{"seatNumber":2}`, "u2", gin.Params{{Key: "id", Value: "studyroom_1"}})
	StudyRoomSeat(c2)
	if w2.Code != http.StatusConflict {
		t.Fatalf("conflict status = %d, want 409", w2.Code)
	}

	// B 占别的座位 → A 收到广播
	c3, w3 := socialTestContext(http.MethodPost, "/api/v1/studyroom/studyroom_1/seat",
		`{"seatNumber":5}`, "u2", gin.Params{{Key: "id", Value: "studyroom_1"}})
	StudyRoomSeat(c3)
	if w3.Code != http.StatusOK {
		t.Fatalf("B seat status = %d", w3.Code)
	}
	expectWSMessage(t, connA, "studyroom:seat-update")
	expectWSMessage(t, connB, "studyroom:seat-update")

	// A 离开 → B 收到广播
	c4, w4 := socialTestContext(http.MethodPost, "/api/v1/studyroom/studyroom_1/leave-seat",
		"", "u1", gin.Params{{Key: "id", Value: "studyroom_1"}})
	StudyRoomLeaveSeat(c4)
	if w4.Code != http.StatusOK {
		t.Fatalf("leave status = %d", w4.Code)
	}
	msg := expectWSMessage(t, connB, "studyroom:seat-update")
	seat := msg["seat"].(map[string]interface{})
	if seat["occupied"] != false || seat["number"] != float64(2) {
		t.Fatalf("leave broadcast = %+v", seat)
	}
}

func TestStudyRoom_HTTPGetShape(t *testing.T) {
	resetStudyRoomManager()
	defer resetStudyRoomManager()

	studyRoomManager.occupySeat("studyroom_1", "u1", 1, "focusing")

	c, w := socialTestContext(http.MethodGet, "/api/v1/studyroom/studyroom_1", "", "u1",
		gin.Params{{Key: "id", Value: "studyroom_1"}})
	StudyRoomGet(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var resp struct {
		ID    string `json:"id"`
		Seats []struct {
			Number   int    `json:"number"`
			Occupied bool   `json:"occupied"`
			Status   string `json:"status"`
			UserID   string `json:"userId"`
		} `json:"seats"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.ID != "studyroom_1" || len(resp.Seats) != studyRoomSeatCount {
		t.Fatalf("room shape = %+v", resp)
	}
	if !resp.Seats[0].Occupied || resp.Seats[0].UserID != "u1" || resp.Seats[0].Status != "focusing" {
		t.Fatalf("seat 1 = %+v", resp.Seats[0])
	}

	// 未知房间 404
	c2, w2 := socialTestContext(http.MethodGet, "/api/v1/studyroom/studyroom_nope", "", "u1",
		gin.Params{{Key: "id", Value: "studyroom_nope"}})
	StudyRoomGet(c2)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("unknown room status = %d, want 404", w2.Code)
	}
}

func TestStudyRoom_WSSSeatStatusUpdate(t *testing.T) {
	resetStudyRoomManager()
	defer resetStudyRoomManager()

	connA := newTestWSConn("u1", t)
	connB := newTestWSConn("u2", t)
	// 直接调用 manager 占座（不经 HTTP，无广播），缓冲初始为空
	studyRoomManager.occupySeat("studyroom_1", "u1", 1, "focusing")
	studyRoomManager.occupySeat("studyroom_1", "u2", 2, "focusing")

	// u1 经 WS 切换为 break
	payload, _ := json.Marshal(gin.H{"roomId": "studyroom_1", "status": "break"})
	handleStudyRoomWSMessage(connA, WSMessage{Type: "studyroom:seat-status", Payload: payload})

	msg := expectWSMessage(t, connB, "studyroom:seat-update")
	seat := msg["seat"].(map[string]interface{})
	if seat["status"] != "break" || seat["userId"] != "u1" {
		t.Fatalf("status update = %+v", seat)
	}
	expectWSMessage(t, connA, "studyroom:seat-update")

	// 未占座的用户无法更新状态
	ghost := newTestWSConn("ghost", t)
	handleStudyRoomWSMessage(ghost, WSMessage{Type: "studyroom:seat-status", Payload: payload})
	assertNoMessage(t, connB)

	// 非法状态被忽略
	badPayload, _ := json.Marshal(gin.H{"roomId": "studyroom_1", "status": "sleeping"})
	handleStudyRoomWSMessage(connA, WSMessage{Type: "studyroom:seat-status", Payload: badPayload})
	assertNoMessage(t, connB)
}
