// @ai-context
// 同步推送 handler：批量接收客户端操作，版本比对后落库并向其他在线设备广播。
// Sync push handler: accepts client operation batches, applies version checks, persists and broadcasts.
// Why: 冲突判定采用"客户端版本 < 服务端版本即冲突"的单向规则，冲突解决走独立的 Resolve 端点。
package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"entropydecrease/sync-service/cache"
	"entropydecrease/sync-service/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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
//
// M7: 整个批次在单个事务内执行（要么全部成功要么全部回滚），
// M1: 版本读取也在事务内并加 FOR UPDATE 行锁，消除 TOCTOU 竞态；
// M6: 客户端 op.ID 幂等去重（配合 (user_id, device_id, op_id) 唯一索引）。
func Push(c *gin.Context) {
	// M8: 限制请求体最大 1MB，防止超大请求耗尽内存
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)

	var req pushRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request body too large (max 1MB)"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")
	accepted := make([]string, 0, len(req.Operations))
	conflicts := make([]ConflictInfo, 0)
	skipped := make([]string, 0) // M6: 幂等去重跳过的操作
	pushErrors := make([]string, 0)
	var latestSeqNo int64                 // track highest seqNo assigned in this push batch
	opSeqNoByID := make(map[string]int64) // M11: op.ID → serverSeqNo，广播时同时携带两套版本语义

	// M7: 整个 push 循环包裹在单个事务中
	txErr := models.DB.Transaction(func(tx *gorm.DB) error {
		for _, op := range req.Operations {
			// M6: 幂等检查——op.ID 已存在则跳过（重复推送/网络重试）
			if op.ID != "" {
				var dupCount int64
				if err := tx.Model(&models.Operation{}).
					Where("user_id = ? AND device_id = ? AND op_id = ?", userID, req.DeviceID, op.ID).
					Count(&dupCount).Error; err != nil {
					pushErrors = append(pushErrors, "idempotency check error: "+err.Error())
					continue
				}
				if dupCount > 0 {
					skipped = append(skipped, op.ID)
					continue
				}
			}

			// M1: 版本读取移入事务内并加 FOR UPDATE 行锁，与后续写入原子化，消除 TOCTOU
			var ev models.EntityVersion
			result := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("user_id = ? AND entity_type = ? AND entity_id = ?", userID, op.EntityType, op.EntityID).
				First(&ev)
			if result.RowsAffected == 0 && result.Error != nil && result.Error != gorm.ErrRecordNotFound {
				// 记录错误并跳过该操作（M1）
				pushErrors = append(pushErrors, "db error: "+result.Error.Error())
				continue
			}
			entityExists := result.RowsAffected > 0

			// SYNC-H1: 冲突判定收紧为 client version <= server version。
			// 原实现仅拒绝 <，两台设备基于同一版本各自编辑会产生相同版本号
			// 不同内容，后到者静默覆盖先到者（数据丢失且无冲突提示）。
			// 相同版本的幂等重试由 op.ID 去重处理，不受影响。
			if entityExists && op.Version <= ev.Version {
				// Conflict: client is behind server.
				conflicts = append(conflicts, ConflictInfo{
					EntityType:    op.EntityType,
					EntityID:      op.EntityID,
					ServerVersion: ev.Version,
					ServerData:    fromJSON(ev.Data),
				})
				continue
			}

			// Accept: 分配全局序号
			seqNo, err := nextSeqNo(tx)
			if err != nil {
				return err
			}
			if seqNo > latestSeqNo {
				latestSeqNo = seqNo
			}

			payloadJSON := toJSON(op.Payload)

			// M6: op.ID 为空时生成服务端 fallback 唯一 ID，避免空串撞唯一索引
			opID := op.ID
			if opID == "" {
				opID = fmt.Sprintf("%s-%d", req.DeviceID, seqNo)
			} else {
				opSeqNoByID[op.ID] = seqNo
			}

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
				OpID:        opID,
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
			if err := tx.Create(&dbOp).Error; err != nil {
				// M6: 并发下唯一索引兜底——重复 op.ID 视为已处理，跳过而非回滚整个批次
				if isUniqueViolation(err) && op.ID != "" {
					skipped = append(skipped, op.ID)
					delete(opSeqNoByID, op.ID)
					continue
				}
				return err
			}
			accepted = append(accepted, op.ID)
		}
		return nil
	})

	if txErr != nil {
		pushErrors = append(pushErrors, "tx error: "+txErr.Error())
		// M7: 事务回滚后 accepted/序号映射全部失效，必须清空避免广播未落库的操作
		accepted = nil
		opSeqNoByID = nil
		latestSeqNo = 0
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
	// M11: 广播同时携带 ServerSeqNo（Pull 游标）与 Version（实体版本），语义各自独立。
	// SYNC-M2: 广播条件从 opSeqNoByID 非空改为 accepted 非空——
	// 全部操作无 ID（服务端 fallback ID）时变更已落库但不再被广播；
	// 空 ID 操作同样需要广播（其 ServerSeqNo 为 0，客户端按实体版本收敛）。
	if len(accepted) > 0 {
		skippedSet := make(map[string]bool, len(skipped))
		for _, id := range skipped {
			skippedSet[id] = true
		}
		conflictKeys := make(map[string]bool, len(conflicts))
		for _, cf := range conflicts {
			conflictKeys[cf.EntityType+":"+cf.EntityID] = true
		}

		wsOps := make([]WSOperationPayload, 0, len(accepted))
		for _, op := range req.Operations {
			// 跳过被去重跳过或冲突的操作
			if op.ID != "" && skippedSet[op.ID] {
				continue
			}
			if conflictKeys[op.EntityType+":"+op.EntityID] {
				continue
			}
			wsOps = append(wsOps, WSOperationPayload{
				EntityType:  op.EntityType,
				EntityID:    op.EntityID,
				Operation:   op.Operation,
				Data:        op.Payload,
				Version:     op.Version,
				ServerSeqNo: opSeqNoByID[op.ID], // 空 ID 操作未登记序号时为 0
				DeviceID:    req.DeviceID,
			})
		}
		if len(wsOps) > 0 {
			BroadcastOperation(userID, req.DeviceID, wsOps)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"accepted":  accepted,
		"conflicts": conflicts,
		"skipped":   skipped,
		"errors":    pushErrors,
	})
}
