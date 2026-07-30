// @ai-context
// 同步查询 handlers：增量拉取（Pull）与同步状态摘要（Status）。
// Sync query handlers: incremental pull and lightweight sync-store status summary.
// Why: Pull 排除请求设备自身产生的操作（device_id != ?），避免变更回环。
package handlers

import (
	"net/http"
	"strconv"

	"entropydecrease/sync-service/cache"
	"entropydecrease/sync-service/models"

	"github.com/gin-gonic/gin"
)

// Pull returns all server operations since `sinceVersion` (exclusive).
// Query params: deviceId, sinceVersion
func Pull(c *gin.Context) {
	userID := c.GetString("user_id")
	deviceID := c.Query("deviceId")
	sinceVersionStr := c.DefaultQuery("sinceVersion", "0")
	sinceVersion, err := strconv.ParseInt(sinceVersionStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sinceVersion"})
		return
	}

	var ops []models.Operation
	if err := models.DB.
		Where("user_id = ? AND server_seq_no > ? AND device_id != ?", userID, sinceVersion, deviceID).
		Order("server_seq_no ASC").
		Find(&ops).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]gin.H, 0, len(ops))
	var latestVersion int64 = sinceVersion

	for _, op := range ops {
		result = append(result, gin.H{
			"entityType": op.EntityType,
			"entityId":   op.EntityID,
			"operation":  op.Operation,
			"data":       fromJSON(op.Payload),
			"version":    op.ServerSeqNo,
		})
		if op.ServerSeqNo > latestVersion {
			latestVersion = op.ServerSeqNo
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"operations":    result,
		"latestVersion": latestVersion,
	})
}

// Status returns a lightweight summary of the sync store.
func Status(c *gin.Context) {
	userID := c.GetString("user_id")

	var opCount, evCount int64
	models.DB.Model(&models.Operation{}).Where("user_id = ?", userID).Count(&opCount)
	models.DB.Model(&models.EntityVersion{}).Where("user_id = ?", userID).Count(&evCount)

	var g models.GlobalSeqNo
	models.DB.First(&g)

	c.JSON(http.StatusOK, gin.H{
		"totalOperations": opCount,
		"trackedEntities": evCount,
		"latestSeqNo":     g.SeqNo,
		"redisConnected":  cache.RDB != nil,
	})
}
