// @ai-context
// 同步 handlers 共享辅助：JSON 序列化与全局序号分配。
// Shared sync handler helpers: JSON (de)serialisation and global sequence allocation.
// Why: nextSeqNo 必须在事务内 FOR UPDATE 行锁，保证多设备并发推送时序号严格单调。
package handlers

import (
	"encoding/json"
	"errors"

	"entropydecrease/sync-service/models"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ConflictInfo is returned to the client when a version conflict is detected.
type ConflictInfo struct {
	EntityType    string      `json:"entityType"`
	EntityID      string      `json:"entityId"`
	ServerVersion int64       `json:"serverVersion"`
	ServerData    interface{} `json:"serverData"`
}

// toJSON serialises v to a JSON string. Returns "" when v is nil.
func toJSON(v interface{}) string {
	if v == nil {
		return ""
	}
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

// fromJSON deserialises a JSON string back to interface{}.
// Returns nil when the string is empty.
func fromJSON(s string) interface{} {
	if s == "" {
		return nil
	}
	var v interface{}
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		return s // fall back to raw string
	}
	return v
}

// nextSeqNo atomically increments and returns the new GlobalSeqNo inside tx.
func nextSeqNo(tx *gorm.DB) (int64, error) {
	var g models.GlobalSeqNo
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&g).Error; err != nil {
		return 0, err
	}
	g.SeqNo++
	if err := tx.Save(&g).Error; err != nil {
		return 0, err
	}
	return g.SeqNo, nil
}

// isUniqueViolation 判断错误是否为 PostgreSQL 唯一约束冲突（23505）。
// M6/M7: 用于幂等写入时区分"重复操作"与"真实 DB 错误"。
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
