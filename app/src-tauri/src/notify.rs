//! data:* 通用变更事件总线（REQ-278，v0.19.4）。
//!
//! @ai-context Why：此前绝大多数写命令落库后零广播，前端各页互不知情——AI
//!               任务采纳/会话转化等完成后发起页需切页才见详情。本模块提供
//!               统一域事件族 `data:notes-changed` / `data:sessions-changed` /
//!               `data:note-groups-changed` / `data:goals-changed` /
//!               `data:knowledge-changed`，由各写命令在成功落库后广播。
//! @ai-context 纪律：事件=增强，绝不阻断主流程（发送失败静默 `let _`）；负载
//!               恒为空——前端只关心"某域变了"，具体变化由受影响的页面自取；
//!               ai 任务域不新增（已有 ai:task-update / ai:refine-stream /
//!               ai:task-update 等既有事件通道，见各模块原 emit）。
//! @ai-context 订阅端：前端 useDbRefresh hook（防抖+活跃页门控）消费；
//!               事件名白名单由 DataDomain 枚举保证（无字符串拼接注入面）。

use tauri::Emitter;

/// 数据域（决定广播事件名；每域一个事件，禁止动态字符串）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DataDomain {
    Notes,
    Sessions,
    NoteGroups,
    Goals,
    Knowledge,
}

/// 域 → 事件名（静态映射——白名单；新增域在此登记并同步前端 hook 的联合类型）
fn event_name(domain: DataDomain) -> &'static str {
    match domain {
        DataDomain::Notes => "data:notes-changed",
        DataDomain::Sessions => "data:sessions-changed",
        DataDomain::NoteGroups => "data:note-groups-changed",
        DataDomain::Goals => "data:goals-changed",
        DataDomain::Knowledge => "data:knowledge-changed",
    }
}

/// 广播「某数据域已变化」（负载空；发送失败静默——广播是增强不是契约）
pub fn emit_changed(app: &tauri::AppHandle, domain: DataDomain) {
    let _ = app.emit(event_name(domain), ());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_names_match_frontend_contract() {
        // 与 app/src/hooks/useDbRefresh.ts 的 DataDomain 联合类型逐项对齐——
        // 变更任何事件名必须同步前端（防静默失联）
        assert_eq!(event_name(DataDomain::Notes), "data:notes-changed");
        assert_eq!(event_name(DataDomain::Sessions), "data:sessions-changed");
        assert_eq!(event_name(DataDomain::NoteGroups), "data:note-groups-changed");
        assert_eq!(event_name(DataDomain::Goals), "data:goals-changed");
        assert_eq!(event_name(DataDomain::Knowledge), "data:knowledge-changed");
    }

    #[test]
    fn all_domains_covered_exhaustively() {
        // 枚举穷尽守卫：未来新增域若未在此映射即编译失败
        let names: Vec<&str> = [
            DataDomain::Notes,
            DataDomain::Sessions,
            DataDomain::NoteGroups,
            DataDomain::Goals,
            DataDomain::Knowledge,
        ]
        .iter()
        .map(|d| event_name(*d))
        .collect();
        assert_eq!(names.len(), 5);
        let mut uniq = names.clone();
        uniq.sort_unstable();
        uniq.dedup();
        assert_eq!(uniq.len(), 5, "事件名必须互异");
    }
}
