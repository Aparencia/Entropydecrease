//! 知识体系画布数据层（v0.13.8）。
//!
//! @ai-context: 数据落在两处——knowledge_nodes.canvas_x/y（问题节点画布位置，
//!              随 list_knowledge_nodes 行返回；React Flow 左上角坐标口径）
//!              与 knowledge_canvas_states（体系 1:1 视口，upsert 覆盖）。
//!              概念/模型无画布列：属浮动参照，每次打开画布按辐射布局重排
//!              （规格 §二.3 零破坏——不为浮动参照扩展表）。
//! @ai-context: 画布=手动画布非自动图（REQ-029 P3）：位置只由用户拖拽或
//!              「自动排列」写入，算法不主动重排已存位置（规格 §4.4 纪律）。
//! @ai-context: 写路径全部幂等（UPDATE/upsert）——拖拽落点可重复保存；
//!              batch 单事务（校验在 command 层前置，全通过才整体写入）。

use rusqlite::params;

use crate::db::Db;
use crate::error::Result;

impl Db {
    /// 保存单个节点画布位置（拖拽落点；幂等覆盖；节点不存在返回 false）。
    ///
    /// @ai-context: 前端 onNodeDragStop 防抖后调用；不校验体系归属——
    ///              归属校验在 command 层（get_knowledge_node 保证存在性）。
    pub fn update_node_canvas_position(&self, node_id: i64, x: f64, y: f64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE knowledge_nodes SET canvas_x = ?1, canvas_y = ?2 WHERE id = ?3",
                params![x, y, node_id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 批量写入节点画布位置（辐射布局初始化/「自动排列」；单事务——部分失败整体回滚）。
    ///
    /// @ai-context: 输入已由 command 层全量校验（节点存在且属指定体系、坐标有限值）；
    ///              数据层只落库不重复校验——事务保证全有或全无。with_conn 只给
    ///              &Connection 无法开事务，照 create_application_tx 手法直接锁 +
    ///              conn.transaction()（显式事务）。
    pub fn set_node_canvas_positions(&self, positions: &[(i64, f64, f64)]) -> Result<bool> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;
        let mut stmt =
            tx.prepare("UPDATE knowledge_nodes SET canvas_x = ?1, canvas_y = ?2 WHERE id = ?3")?;
        for (id, x, y) in positions {
            stmt.execute(params![x, y, id])?;
        }
        // stmt 持有 tx 借用，drop 后才能 commit（rusqlite 借用规则）
        drop(stmt);
        tx.commit()?;
        Ok(true)
    }

    /// 读取体系画布视口（从未保存返回 None——前端按内容 fitView 兜底）。
    pub fn get_canvas_viewport(&self, system_id: i64) -> Result<Option<(f64, f64, f64)>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT viewport_x, viewport_y, zoom FROM knowledge_canvas_states WHERE system_id = ?1",
            )?;
            let mut rows = stmt.query_map(params![system_id], |row| {
                Ok((row.get::<_, f64>(0)?, row.get::<_, f64>(1)?, row.get::<_, f64>(2)?))
            })?;
            match rows.next() {
                Some(Ok(v)) => Ok(Some(v)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 保存体系画布视口（upsert——切回画布时 setViewport 恢复）。
    ///
    /// @ai-context: system_id 主键冲突即覆盖（每体系一份视口）；
    ///              zoom 合法性校验在 command 层（>0 有限值）。
    pub fn save_canvas_viewport(&self, system_id: i64, x: f64, y: f64, zoom: f64) -> Result<bool> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO knowledge_canvas_states (system_id, viewport_x, viewport_y, zoom)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(system_id) DO UPDATE SET viewport_x = ?2, viewport_y = ?3, zoom = ?4",
                params![system_id, x, y, zoom],
            )?;
            Ok(true)
        })
    }
}

/// 命令层单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_knowledge_canvas_tests.rs"]
mod tests;
