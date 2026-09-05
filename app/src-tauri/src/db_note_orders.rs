//! 笔记手动排序数据层（REQ-287，v0.19.7）。
//!
//! @ai-context: 交互矩阵裁决——组内位置移动=该组切"手动排序"（首次拖拽自动
//!              快照）；与自动排序（更新时间/固定/创建）互斥，scope 级生效：
//!              `g:{groupId}`=具体组，`none`=未分组区。独立表免改 notes 列与
//!              全库行映射（35 表重建涟漪零承担）；排序仅在树视图（无搜索/
//!              标签/非手动排序筛选）由前端消费（前端先拉全量再按 scope 排）。
//!              空序=未启用（清表即回自动）；数据量 ≤2000/scope（命令层守卫）。

use crate::db::Db;
use crate::error::Result;

/// scope 合法性（纯函数可单测）：`g:` + 纯数字，或 `none`。
pub fn is_valid_scope(scope: &str) -> bool {
    if scope == "none" {
        return true;
    }
    scope
        .strip_prefix("g:")
        .is_some_and(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
}

impl Db {
    /// 全量拉取手动序（scope, note_id, ord 升序）——前端树视图消费（量小）。
    pub fn load_note_orders(&self) -> Result<Vec<(String, i64, i64)>> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare("SELECT scope, note_id, ord FROM note_orders ORDER BY scope, ord")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 保存某 scope 的完整手动序（事务内先删后插=快照语义；ids 保序编号）。
    ///
    /// @ai-context: 首次启用=前端把当前可见序全量写入；后续移动=前端重算后整
    ///              表覆写（单命令单事务，无逐位移动的复杂度）。with_conn 仅给
    ///              &Connection 无法开事务（db_fragments 同款：直接锁 + tx）。
    pub fn save_note_order(&self, scope: &str, note_ids: &[i64]) -> Result<()> {
        let mut conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM note_orders WHERE scope = ?1", [scope])?;
        {
            let mut stmt =
                tx.prepare("INSERT INTO note_orders (scope, note_id, ord) VALUES (?1, ?2, ?3)")?;
            for (i, id) in note_ids.iter().enumerate() {
                stmt.execute([scope, &id.to_string(), &(i as i64).to_string()])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// 清除某 scope 手动序（=回自动排序；幂等——无记录时零动作）。
    pub fn clear_note_order(&self, scope: &str) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute("DELETE FROM note_orders WHERE scope = ?1", [scope])?;
            Ok(affected > 0)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::is_valid_scope;

    #[test]
    fn scope_validation() {
        assert!(is_valid_scope("g:3"));
        assert!(is_valid_scope("g:123456789"));
        assert!(is_valid_scope("none"));
        assert!(!is_valid_scope(""));
        assert!(!is_valid_scope("g:"));
        assert!(!is_valid_scope("G:1"));
        assert!(!is_valid_scope("g:1a"));
        assert!(!is_valid_scope("notes"));
    }
}
