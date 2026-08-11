// @ai-context
// 同步查询 handlers：增量拉取（Pull）与同步状态摘要（Status）。
// Sync query handlers: incremental pull and lightweight sync-store status summary.
// Why: Pull 排除请求设备自身产生的操作（device_id != ?），避免变更回环。
package handlers

import (
	"log"
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
	// SYNC-L2: deviceId 白名单校验（与 WS 入口一致）——空值会让
	// device_id != '' 拉回本设备变更造成回环；超长参数增加索引扫描成本
	if !isValidDeviceID(deviceID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid deviceId: must match [A-Za-z0-9_-]{1,64}"})
		return
	}
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
		Limit(1000). // M2: 增量查询限制返回行数
		Find(&ops).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// M2: hasMore 标志，客户端可继续翻页（恰好 1000 条时多拉一次空结果，无害）
	hasMore := len(ops) >= 1000

	result := make([]gin.H, 0, len(ops))
	var latestVersion int64 = sinceVersion

	for _, op := range ops {
		result = append(result, gin.H{
			"entityType":  op.EntityType,
			"entityId":    op.EntityID,
			"operation":   op.Operation,
			"data":        fromJSON(op.Payload),
			"version":     op.ServerSeqNo,
			"serverSeqNo": op.ServerSeqNo, // M11: Pull 以 ServerSeqNo 为游标
		})
		if op.ServerSeqNo > latestVersion {
			latestVersion = op.ServerSeqNo
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"operations":    result,
		"latestVersion": latestVersion,
		"hasMore":       hasMore,
	})
}

// Status returns a lightweight summary of the sync store.
func Status(c *gin.Context) {
	userID := c.GetString("user_id")

	var opCount, evCount int64
	// M9: 统计查询失败时记录日志并返回 503，不再吞没 DB 错误
	if err := models.DB.Model(&models.Operation{}).Where("user_id = ?", userID).Count(&opCount).Error; err != nil {
		log.Printf("[status] count operations failed user=%s: %v", userID, err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "db unavailable"})
		return
	}
	if err := models.DB.Model(&models.EntityVersion{}).Where("user_id = ?", userID).Count(&evCount).Error; err != nil {
		log.Printf("[status] count entity versions failed user=%s: %v", userID, err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "db unavailable"})
		return
	}

	var g models.GlobalSeqNo
	if err := models.DB.First(&g).Error; err != nil {
		log.Printf("[status] read GlobalSeqNo failed user=%s: %v", userID, err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "db unavailable"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"totalOperations": opCount,
		"trackedEntities": evCount,
		"latestSeqNo":     g.SeqNo,
		"redisConnected":  cache.RDB != nil,
	})
}
