// @ai-context
// 同步服务数据模型：实体版本表、操作日志、全局序号、CRDT 变更集。
// Sync-service data models: entity versions, operation log, global sequence, CRDT changesets.
// Why: Operation/CRDTChange 不嵌入 gorm.Model，因为 CreatedAt 由客户端提供（跨设备时间语义）。
package models

import "gorm.io/gorm"

// EntityVersion tracks the latest version for each synced entity.
type EntityVersion struct {
	gorm.Model
	UserID     string `gorm:"uniqueIndex:idx_user_entity;not null" json:"userId"`
	EntityType string `gorm:"uniqueIndex:idx_user_entity;not null" json:"entityType"`
	EntityID   string `gorm:"uniqueIndex:idx_user_entity;not null" json:"entityId"`
	Version    int64  `gorm:"not null" json:"version"`
	Data       string `gorm:"type:text" json:"data"` // JSON-serialized payload
}

// Operation is an append-only log of all sync operations.
// We avoid gorm.Model because we manage CreatedAt ourselves (client-supplied timestamp).
// OpID 为客户端生成的操作 ID，配合 (user_id, device_id, op_id) 唯一索引实现推送幂等（M6）。
type Operation struct {
	ID          uint   `gorm:"primaryKey"`
	ServerSeqNo int64  `gorm:"uniqueIndex;not null" json:"serverSeqNo"`
	OpID        string `gorm:"column:op_id;uniqueIndex:idx_user_device_op,priority:3" json:"opId"`
	DeviceID    string `gorm:"uniqueIndex:idx_user_device_op,priority:2;index;not null" json:"deviceId"`
	UserID      string `gorm:"uniqueIndex:idx_user_device_op,priority:1;index:idx_op_user;not null" json:"userId"`
	EntityType  string `gorm:"index;not null" json:"entityType"`
	EntityID    string `gorm:"not null" json:"entityId"`
	Operation   string `gorm:"not null" json:"operation"` // create|update|delete
	Version     int64  `gorm:"not null" json:"version"`
	Patch       string `gorm:"type:text" json:"patch"`
	Payload     string `gorm:"type:text" json:"payload"` // JSON-serialized
	CreatedAt   string `gorm:"not null" json:"createdAt"`
}

// GlobalSeqNo holds the single-row global sequence counter.
type GlobalSeqNo struct {
	ID    uint  `gorm:"primaryKey"`
	SeqNo int64 `gorm:"not null;default:0"`
}

// CRDTChange stores CRDT changesets uploaded by clients.
// Each row is an immutable, append-only change record keyed by a global sequence number.
// ChangesetHash 为 changeset 的 SHA-256（hex），配合 (user_id, changeset_hash) 唯一
// 索引实现 CRDT 推送幂等（SYNC-M3）：网络重试的重复 changeset 不再重复落库。
type CRDTChange struct {
	ID            uint   `gorm:"primaryKey"`
	ServerSeqNo   int64  `gorm:"uniqueIndex;not null" json:"serverSeqNo"`
	DeviceID      string `gorm:"index;not null" json:"deviceId"`
	UserID        string `gorm:"index:idx_crdt_user;uniqueIndex:idx_crdt_user_hash,priority:1;not null" json:"userId"`
	TableName     string `gorm:"index;not null" json:"tableName"`
	EntityID      string `gorm:"not null" json:"entityId"`
	Changeset     string `gorm:"type:text;not null" json:"changeset"` // base64-encoded Automerge changes
	ChangesetHash string `gorm:"uniqueIndex:idx_crdt_user_hash,priority:2;not null" json:"-"` // sha256(changeset)
	Operation     string `gorm:"not null" json:"operation"`             // create|update|delete
	CreatedAt     string `gorm:"not null" json:"createdAt"`
}
