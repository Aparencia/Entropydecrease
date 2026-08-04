// @ai-context
// 冲突解决 handler：客户端提交 local/remote/manual 三种策略的裁决结果。
// Conflict resolution handler: applies client-side local/remote/manual resolution decisions.
// Why: remote 策略无需写库（服务端已是权威版本），客户端随后 Pull 即可收敛。
package handlers

import (
	"net/http"
	"time"

	"entropydecrease/sync-service/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type resolveRequest struct {
	EntityType string      `json:"entityType"`
	EntityID   string      `json:"entityId"`
	Strategy   string      `json:"strategy"` // "local" | "remote" | "manual"
	Data       interface{} `json:"data,omitempty"`
	Version    int64       `json:"version"`
	DeviceID   string      `json:"deviceId"`
}

// Resolve handles conflict resolution submitted by the client.
func Resolve(c *gin.Context) {
	userID := c.GetString("user_id")

	var req resolveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	switch req.Strategy {
	case "local", "manual":
		// Client wins / manual merge: overwrite server with supplied data.
		if req.Data == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "local/manual strategy requires data field"})
			return
		}

		payloadJSON := toJSON(req.Data)
		if payloadJSON == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data field produced empty payload"})
			return
		}

		txErr := models.DB.Transaction(func(tx *gorm.DB) error {
			seqNo, err := nextSeqNo(tx)
			if err != nil {
				return err
			}

			// Upsert EntityVersion.
			var ev models.EntityVersion
			res := tx.Where("user_id = ? AND entity_type = ? AND entity_id = ?", userID, req.EntityType, req.EntityID).First(&ev)
			if res.RowsAffected > 0 {
				if err := tx.Model(&ev).Updates(map[string]interface{}{
					"version": req.Version,
					"data":    payloadJSON,
				}).Error; err != nil {
					return err
				}
			} else {
				if err := tx.Create(&models.EntityVersion{
					UserID:     userID,
					EntityType: req.EntityType,
					EntityID:   req.EntityID,
					Version:    req.Version,
					Data:       payloadJSON,
				}).Error; err != nil {
					return err
				}
			}

			// Append Operation log.
			return tx.Create(&models.Operation{
				ServerSeqNo: seqNo,
				DeviceID:    req.DeviceID,
				UserID:      userID,
				EntityType:  req.EntityType,
				EntityID:    req.EntityID,
				Operation:   "update",
				Version:     req.Version,
				Payload:     payloadJSON,
				CreatedAt:   time.Now().UTC().Format(time.RFC3339),
			}).Error
		})

		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": txErr.Error()})
			return
		}

	case "remote":
		// Server wins: no changes needed; client will pull latest.

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown strategy: " + req.Strategy})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"resolved": true,
		"strategy": req.Strategy,
	})
}
