// @ai-context
// 同步推送 handler：批量接收客户端操作，版本比对后落库并向其他在线设备广播。
// Sync push handler: accepts client operation batches, applies version checks, persists and broadcasts.
// Why: 冲突判定采用"客户端版本 < 服务端版本即冲突"的单向规则，冲突解决走独立的 Resolve 端点。
package handlers

import (
	"context"
	"net/http"

	"entropydecrease/sync-service/cache"
	"entropydecrease/sync-service/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type pushRequest struct {
	DeviceID   string `json:"deviceId"`
	Operations []struct {
		ID         string      `json:"id"`
		EntityType string      `json:"entityType"`
		EntityID   string      `json:"entityId"`
		Operation  string      `json:"operation"`
		Version    int64       `json:"version"`
		Patch      string      `json:"patch,omitempty"`
		Payload    interface{} `json:"payload,omitempty"`
		CreatedAt  string      `json:"createdAt"`
	} `json:"operations"`
}

// Push accepts a batch of client operations and applies them server-side.
//   - client version >= server version → accept
//   - client version <  server version → conflict
func Push(c *gin.Context) {
	var req pushRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")
	accepted := make([]string, 0)
	conflicts := make([]ConflictInfo, 0)
	pushErrors := make([]string, 0)
	var latestSeqNo int64 // track highest seqNo assigned in this push batch

	for _, op := range req.Operations {
		// Look up current server version for this entity.
		var ev models.EntityVersion
		result := models.DB.Where("user_id = ? AND entity_type = ? AND entity_id = ?", userID, op.EntityType, op.EntityID).First(&ev)

		if result.RowsAffected == 0 && result.Error != nil && result.Error != gorm.ErrRecordNotFound {
			pushErrors = append(pushErrors, "db error: "+result.Error.Error())
			continue
		}
		entityExists := result.RowsAffected > 0

		if entityExists && op.Version < ev.Version {
			// Conflict: client is behind server.
			conflicts = append(conflicts, ConflictInfo{
				EntityType:    op.EntityType,
				EntityID:      op.EntityID,
				ServerVersion: ev.Version,
				ServerData:    fromJSON(ev.Data),
			})
			continue
		}

		// Accept: run inside a transaction for atomicity.
		var opSeqNo int64
		txErr := models.DB.Transaction(func(tx *gorm.DB) error {
			seqNo, err := nextSeqNo(tx)
			if err != nil {
				return err
			}
			opSeqNo = seqNo

			payloadJSON := toJSON(op.Payload)

			// Upsert EntityVersion.
			if entityExists {
				if err := tx.Model(&ev).Updates(map[string]interface{}{
					"version": op.Version,
					"data":    payloadJSON,
				}).Error; err != nil {
					return err
				}
			} else {
				newEV := models.EntityVersion{
					UserID:     userID,
					EntityType: op.EntityType,
					EntityID:   op.EntityID,
					Version:    op.Version,
					Data:       payloadJSON,
				}
				if err := tx.Create(&newEV).Error; err != nil {
					return err
				}
			}

			// Append Operation log.
			dbOp := models.Operation{
				ServerSeqNo: seqNo,
				DeviceID:    req.DeviceID,
				UserID:      userID,
				EntityType:  op.EntityType,
				EntityID:    op.EntityID,
				Operation:   op.Operation,
				Version:     op.Version,
				Patch:       op.Patch,
				Payload:     payloadJSON,
				CreatedAt:   op.CreatedAt,
			}
			return tx.Create(&dbOp).Error
		})

		if txErr != nil {
			pushErrors = append(pushErrors, "tx error: "+txErr.Error())
			continue
		}
		accepted = append(accepted, op.ID)
		if opSeqNo > latestSeqNo {
			latestSeqNo = opSeqNo
		}
	}

	// Update Redis cache after successful push.
	ctx := context.Background()
	if req.DeviceID != "" {
		_ = cache.SetDeviceOnline(ctx, userID, req.DeviceID)
	}
	if latestSeqNo > 0 {
		_ = cache.SetLastSyncVersion(ctx, userID, latestSeqNo)
	}

	// Broadcast accepted operations to the user's other online devices via WebSocket.
	if len(accepted) > 0 {
		wsOps := make([]WSOperationPayload, 0, len(accepted))
		for _, op := range req.Operations {
			for _, aid := range accepted {
				if op.ID == aid {
					wsOps = append(wsOps, WSOperationPayload{
						EntityType: op.EntityType,
						EntityID:   op.EntityID,
						Operation:  op.Operation,
						Data:       op.Payload,
						Version:    op.Version,
						DeviceID:   req.DeviceID,
					})
					break
				}
			}
		}
		BroadcastOperation(userID, req.DeviceID, wsOps)
	}

	c.JSON(http.StatusOK, gin.H{
		"accepted":  accepted,
		"conflicts": conflicts,
		"errors":    pushErrors,
	})
}
