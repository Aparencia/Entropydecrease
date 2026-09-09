//! 组排序与置顶数据层（REQ-315，v0.20.11 批 6）。
//!
//! @ai-context: 交互矩阵扩展自 REQ-287 笔记手动序（note_orders）：组列表按 kind
//!              分区——分区渲染序 = 置顶区（pin=1，区内按 updated_at 降序）→
//!              手动区（本表 seq 升序）→ 自动区（其余按 updated_at 降序）。
//!              save=分区快照（先删后插单事务；空 ids=分区整体回自动）；clear=
//!              单组回自动（稀疏行合法——渲染规则②③支持缺行成员回落自动区）。
//!              置顶组不参与手动序写入（save 校验拒绝），存量行保留——取消置顶
//!              即回原手动位（notes.pin 同语义，批 6 措辞统一为「置顶」）。
//! @ai-context: FK ON DELETE CASCADE 随组删除清行（与 note_orders 无 FK 的差异：
//!              笔记移组跨 scope 复用 id 需 purge 防"移回复活旧序位"，组即排序
//!              scope 本体、删除即消亡无复用路径）。kind 变更边界（改判换分区）
//!              在 db_note_groups::override_group_route 同事务清行。
//! @ai-context: pin 列存 note_groups（与 notes.pin 对齐），但更新方法落本模块——
//!              置顶=排序域第一区操作，与手动序同域内聚（db_note_groups.rs 已
//!              接近 300 行上限，AGENTS §3 单文件约束）。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;

/// 手动序 kind 分区白名单（对齐渲染分区 course/topic/standalone/feed——非法值
/// 拒绝防任意入库；feed 分区当前无自然成员但保留合法位防前端枚举扩展炸命令）。
pub fn is_valid_group_order_kind(kind: &str) -> bool {
    matches!(kind, "course" | "topic" | "standalone" | "feed")
}

impl Db {
    /// 组置顶状态（REQ-315；pin=1 置顶 / 0 取消——排序纯函数置顶区消费）。
    ///
    /// @ai-context: updated_at 同步刷新：置顶动作把它推为置顶区内最新
    ///              （置顶区内部按更新时间降序，与取消置顶回落自动区的口径一致）。
    /// @ai-context: 批 7 审查修复（P2-7 双保险·写侧）：置顶/取消置顶=用户在操作
    ///              该组=编排痕迹——与路由改判同权置 route_overridden=1（仅
    ///              route/series 自动产物；Why 见 db_note_groups::rename_group），
    ///              空组自动清理不再误删被用户置过顶的组（REQ-315/REQ-316 边界）。
    pub fn update_note_group_pin(&self, id: i64, pin: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE note_groups SET pin = ?1,
                 route_overridden = CASE WHEN source IN ('route', 'series') THEN 1 ELSE route_overridden END,
                 updated_at = ?2 WHERE id = ?3",
                params![pin, unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 全量组手动序（group_id, seq）——侧栏/树头消费（量小整拉，渲染排序在前端
    /// 纯函数，本层不替前端预排；seq 并列按 id 决胜保证确定序——测试可断言）。
    pub fn load_group_orders(&self) -> Result<Vec<(i64, i64)>> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare("SELECT group_id, seq FROM note_group_orders ORDER BY seq, group_id")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 保存某 kind 分区完整手动序（快照：先删该分区全部行再按序编号插入）。
    ///
    /// @ai-context: 删除域=kind 全分区而非仅入参 ids——组改判/置顶遗留的陈旧行
    ///              一并清（分区渲染只认本表 seq，不留双轨）；空 ids=分区整体
    ///              回自动排序（前端「手排 ↺」复位语义）。
    pub fn save_group_order(&self, kind: &str, group_ids: &[i64]) -> Result<()> {
        // 事务需要 &mut Connection（with_conn 只给 &Connection——同 delete_group）
        let mut conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM note_group_orders WHERE group_id IN
             (SELECT id FROM note_groups WHERE kind = ?1)",
            params![kind],
        )?;
        {
            let mut stmt = tx.prepare("INSERT INTO note_group_orders (group_id, seq) VALUES (?1, ?2)")?;
            for (i, id) in group_ids.iter().enumerate() {
                stmt.execute(params![*id, i as i64])?;
            }
        }
        // 批 7 审查修复（P2-7 双保险·写侧）：手排保存=用户编排痕迹——快照内
        // 全部组与路由改判同权置 route_overridden=1（仅 route/series 自动产物；
        // Why 见 db_note_groups::rename_group），用户亲手排过位的空组不被自动
        // 清理误删。同事务原子：快照回滚则编排标记一并回滚，无半态。
        if !group_ids.is_empty() {
            let mut sql = String::from(
                "UPDATE note_groups SET route_overridden = 1
                 WHERE source IN ('route', 'series') AND id IN (",
            );
            for (i, _) in group_ids.iter().enumerate() {
                if i > 0 {
                    sql.push(',');
                }
                sql.push_str(&format!("?{}", i + 1));
            }
            sql.push(')');
            let mut ps: Vec<&dyn rusqlite::ToSql> = Vec::new();
            for id in group_ids {
                ps.push(id);
            }
            tx.execute(&sql, rusqlite::params_from_iter(ps))?;
        }
        tx.commit()?;
        Ok(())
    }

    /// 清除单组手动位（=该组回自动区；幂等——无行零动作返回 false 不广播）。
    pub fn clear_group_order(&self, group_id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected =
                conn.execute("DELETE FROM note_group_orders WHERE group_id = ?1", params![group_id])?;
            Ok(affected > 0)
        })
    }

    /// 归属校验（save 守卫）：每个 id 必须当前属于该 kind 分区且未置顶——陈旧
    /// 序/置顶组误写整体拒绝（前端 bug/并发改判后的分区污染不落库）。
    pub fn verify_group_order_membership(&self, kind: &str, group_ids: &[i64]) -> Result<bool> {
        self.with_conn(|conn| {
            if group_ids.is_empty() {
                return Ok(true);
            }
            let mut sql = String::from(
                "SELECT id FROM note_groups WHERE kind = ?1 AND pin = 0 AND id IN (",
            );
            for (i, _) in group_ids.iter().enumerate() {
                if i > 0 {
                    sql.push(',');
                }
                sql.push_str(&format!("?{}", i + 2));
            }
            sql.push(')');
            let mut stmt = conn.prepare(&sql)?;
            let mut ps: Vec<&dyn rusqlite::ToSql> = vec![&kind];
            for id in group_ids {
                ps.push(id);
            }
            let rows = stmt.query_map(rusqlite::params_from_iter(ps), |row| {
                row.get::<_, i64>(0)
            })?;
            let found: Vec<i64> = rows.collect::<rusqlite::Result<Vec<_>>>()?;
            let want: std::collections::HashSet<i64> = group_ids.iter().copied().collect();
            let got: std::collections::HashSet<i64> = found.into_iter().collect();
            Ok(got == want)
        })
    }
}

#[cfg(test)]
#[path = "db_note_group_orders_tests.rs"]
mod tests;
