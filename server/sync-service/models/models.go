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
type Operation struct {
	ID          uint   `gorm:"primaryKey"`
	ServerSeqNo int64  `gorm:"uniqueIndex;not null" json:"serverSeqNo"`
	DeviceID    string `gorm:"index;not null" json:"deviceId"`
	UserID      string `gorm:"index:idx_op_user;not null" json:"userId"`
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
type CRDTChange struct {
	ID         uint   `gorm:"primaryKey"`
	ServerSeqNo int64  `gorm:"uniqueIndex;not null" json:"serverSeqNo"`
	DeviceID   string `gorm:"index;not null" json:"deviceId"`
	UserID     string `gorm:"index:idx_crdt_user;not null" json:"userId"`
	TableName  string `gorm:"index;not null" json:"tableName"`
	EntityID   string `gorm:"not null" json:"entityId"`
	Changeset  string `gorm:"type:text;not null" json:"changeset"` // base64-encoded Automerge changes
	Operation  string `gorm:"not null" json:"operation"`            // create|update|delete
	CreatedAt  string `gorm:"not null" json:"createdAt"`
}
