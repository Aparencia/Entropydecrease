// @ai-context
// 冲突解决 handler：客户端提交 local/remote/manual 三种策略的裁决结果。
// Conflict resolution handler: applies client-side local/remote/manual resolution decisions.
// Why: remote 策略无需写库（服务端已是权威版本），客户端随后 Pull 即可收敛。
package handlers

import (
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"entropydecrease/sync-service/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

	// M8: 限制请求体最大 1MB
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)

	var req resolveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request body too large (max 1MB)"})
			return
		}
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
			// SYNC-M1: 版本校验 + FOR UPDATE 行锁——与 Push 的 M1 防护一致，
			// 拒绝回退版本（客户端可提交任意小版本号制造数据回退）；
			// 加锁消除 TOCTOU 竞态（另一设备并发推送时基于过期版本覆盖）
			var ev models.EntityVersion
			res := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("user_id = ? AND entity_type = ? AND entity_id = ?", userID, req.EntityType, req.EntityID).
				First(&ev)
			if res.Error != nil && res.Error != gorm.ErrRecordNotFound {
				return res.Error
			}
			if res.RowsAffected > 0 && req.Version <= ev.Version {
				return errors.New("resolve rejected: client version must be newer than server version")
			}

			seqNo, err := nextSeqNo(tx)
			if err != nil {
				return err
			}

			// Upsert EntityVersion.
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
			log.Printf("Resolve failed: %v", txErr)
			c.JSON(http.StatusInternalServerError, gin.H{"error": txErr.Error()})
			return
		}

		// SYNC-M1: 广播解决结果到其他在线设备（原实现不广播，
		// 其他设备只能等下一次 Pull 才收敛，实时性延迟）
		BroadcastOperation(userID, req.DeviceID, []WSOperationPayload{
			{
				EntityType:  req.EntityType,
				EntityID:    req.EntityID,
				Operation:   "update",
				Data:        req.Data,
				Version:     req.Version,
				ServerSeqNo: 0, // Resolve 的广播无明确序号，客户端按实体版本收敛
				DeviceID:    req.DeviceID,
			},
		})

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
