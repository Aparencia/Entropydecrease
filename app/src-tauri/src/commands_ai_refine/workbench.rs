//! 精修工作台（批 0-C3 Task 4 拆分，原 commands_ai_refine.rs 447–571 + 690–751 行）。
//!
//! @ai-context: 工作台一次取全「规则草稿 + 精修版 + 章节分组 diff + 统计 + 版本 meta」；
//!              精修版三级数据源（① 调用方内存结果 ② 最新未采纳成功任务 ③ 已落库
//!              笔记最新版本）与 `refine_workbench` 同文件，避免跨文件错序。
//! @ai-context: 契约红线：WorkbenchData 顶层必须 camelCase（v0.12.3 P0 修复），嵌套
//!              SectionDiff 必须保持 snake_case（刻意契约）—— 本文件的内联测试
//!              `workbench_data_serializes_camel_case_top_level` 是该 P0 的唯一回归，
//!              **随实现整块搬运（D5）**，删声明即静默丢覆盖。
//! @ai-context: 边界：`stats_from` 只服务本文件的 `refine_workbench`（两处调用），
//!              故保持**私有**——本批零可见性放宽（分析 D4 的 pub(super) 在
//!              「refine_workbench 与 stats_from 同文件」的终态下不再需要）。

use tauri::State;

use crate::anchor_strip::strip_anchors;
use crate::commands::AppState;
use crate::commands_session_note::build_rule_draft_with_analysis;
use crate::note_diff::{diff_sections, DiffStats, SectionDiff};
use crate::note_filter::PurifyEnv;
use crate::note_version::VersionMeta;

use super::dto::AiRefineResult;

// ────────────────────────────────────────────────────────────
// 精修工作台（Task 11 / spec 6️⃣——规则草稿+精修结果+章节分组 diff 一次取全）
// ────────────────────────────────────────────────────────────

/// 工作台数据（前端 RefineWorkbench 模态数据源）。
///
/// @ai-context: 必须 camelCase（与 AiRefineResult 等兄弟结构体一致）——本模块
///              其余结构体均已 2026-08 统一契约；此处缺失曾导致前端按
///              ruleMarkdown 读取得到 undefined → renderMd(undefined).split
///              （"Cannot read properties of undefined (reading 'split')"，
///              v0.11.5 引入、真机验收漏测，v0.12.3 修复补测）。
/// @ai-context: 嵌套 section（SectionDiff）保持 snake_case 是刻意契约
///              （首次出现即定，前端类型注释"勿改"），rename 只作用于顶层键。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchData {
    pub rule_markdown: String,
    pub refined_markdown: Option<String>,
    pub sections: Vec<SectionDiff>,
    pub stats: DiffStats,
    pub meta: Option<VersionMeta>,
}

/// 工作台数据接口：规则草稿 + 精修结果 + 章节分组 diff 一次取全。
///
/// refined_markdown 为 None → 尚未精修；否则包含最新精修版内容与章节 diff。
///
/// @ai-context: 精修版三级数据源（修复：原实现只查已落库笔记——采纳前打开
///              工作台右侧恒空；且任务成功事件先于 DB 落库，存在竞态）：
///              ① refine_result 参数（调用方内存结果——采纳前刚完成的任务，
///                 消除竞态）② 最新未采纳成功任务（DB 持久化——重启后恢复）
///              ③ 已落库笔记最新版本（采纳后）。
#[tauri::command]
pub async fn refine_workbench(
    state: State<'_, AppState>,
    session_id: i64,
    refine_result: Option<AiRefineResult>,
) -> Result<WorkbenchData, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    // ① 构建规则草稿（与精修任务同管线）
    let env = PurifyEnv {
        config: state.purify.clone(),
        symbol: state.symbol_normalize.clone(),
        corrections: state.ocr_corrections.clone(),
    };
    let (draft, _) = build_rule_draft_with_analysis(
        &state.db,
        &state.ui_junk,
        &env,
        &state.data_dir,
        session_id,
        None,
    )
    .map_err(|e| e.to_string())?;
    let rule_md = strip_anchors(&draft.markdown);

    // ② 精修版数据源：内存结果（优先）＞ 未采纳成功任务（DB 兜底）＞ 已落库笔记
    let unadopted = state
        .db
        .find_latest_unadopted_refine(session_id)
        .map_err(|e| e.to_string())?;
    let pending_result: Option<AiRefineResult> = match (refine_result, unadopted) {
        (Some(r), _) => Some(r),
        // 解析失败降级（日志可观测——不影响工作台打开，可经任务中心重取）
        (None, Some(task)) => task.result_json.as_deref().and_then(|j| {
            serde_json::from_str::<AiRefineResult>(j)
                .map_err(|e| eprintln!("[refine-workbench] 未采纳任务 {} 结果解析失败: {}", task.task_id, e))
                .ok()
        }),
        (None, None) => None,
    };

    let note = state.db.find_note_by_session(session_id).map_err(|e| e.to_string())?;
    let (refined_md, sections, stats, meta) = if let Some(result) = pending_result {
        let secs = diff_sections(&rule_md, &result.refined_markdown);
        let st = stats_from(&secs);
        // 未落库：成本按模型单价在 apply 时核算——此处不做虚假回填
        let m = VersionMeta {
            cost_yuan: None,
            model: Some(result.model.clone()),
            slices: Some(result.slices),
            merged_from: None,
        };
        (Some(result.refined_markdown), secs, st, Some(m))
    } else if let Some(ref note) = note {
        // 取最新版本内容作为精修版
        let versions = state.db.list_versions(note.id).map_err(|e| e.to_string())?;
        let latest = versions.last()
            .map(|v| v.content.clone())
            .unwrap_or_else(|| note.content.clone());
        let secs = diff_sections(&rule_md, &latest);
        let st = stats_from(&secs);
        // 取最新版本 meta
        let m = versions.last().map(|v| VersionMeta {
            cost_yuan: v.meta.cost_yuan,
            model: v.meta.model.clone(),
            slices: v.meta.slices,
            merged_from: v.meta.merged_from.clone(),
        });
        (Some(latest), secs, st, m)
    } else {
        (None, vec![], DiffStats { added: 0, removed: 0, unchanged: 0 }, None)
    };

    Ok(WorkbenchData {
        rule_markdown: rule_md,
        refined_markdown: refined_md,
        sections,
        stats,
        meta,
    })
}

/// 章节分组 diff 统计（新增/删除/未变行数——与 diff_sections 同口径）。
fn stats_from(secs: &[SectionDiff]) -> DiffStats {
    DiffStats {
        added: secs.iter().map(|s| s.added_lines.len()).sum(),
        removed: secs.iter().map(|s| s.removed_lines.len()).sum(),
        unchanged: secs.iter()
            .filter(|s| s.status == crate::note_diff::DiffStatus::Unchanged)
            .count(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// v0.12.3 回归（Bug#2）：WorkbenchData 顶层键必须 camelCase——
    /// 前端按 ruleMarkdown/refinedMarkdown 读取；snake_case 键使字段为
    /// undefined → renderMd(undefined).split 抛
    /// "Cannot read properties of undefined (reading 'split')"
    /// （原实现缺失 rename_all，v0.11.5 引入、真机验收漏测）。
    #[test]
    fn workbench_data_serializes_camel_case_top_level() {
        let data = WorkbenchData {
            rule_markdown: "# 标题\n正文".to_string(),
            refined_markdown: Some("# 标题\n精修正文".to_string()),
            sections: vec![crate::note_diff::SectionDiff {
                heading: "标题".to_string(),
                status: crate::note_diff::DiffStatus::Modified,
                removed_lines: vec!["正文".to_string()],
                added_lines: vec!["精修正文".to_string()],
            }],
            stats: crate::note_diff::DiffStats {
                added: 1,
                removed: 1,
                unchanged: 0,
            },
            meta: Some(crate::note_version::VersionMeta {
                cost_yuan: Some(0.01),
                model: Some("test-model".to_string()),
                slices: Some(1),
                merged_from: None,
            }),
        };
        let v = serde_json::to_value(&data).expect("序列化失败");
        let obj = v.as_object().expect("应为 JSON 对象");
        assert!(obj.contains_key("ruleMarkdown"), "顶层键必须为 ruleMarkdown（camelCase）");
        assert!(obj.contains_key("refinedMarkdown"), "顶层键必须为 refinedMarkdown（camelCase）");
        assert!(obj.contains_key("sections"));
        assert!(obj.contains_key("stats"));
        assert!(obj.contains_key("meta"));
        // 嵌套 SectionDiff 保持 snake_case（首次出现即定的契约，勿随顶层 rename）
        let sec = &obj["sections"][0];
        assert!(sec.get("removed_lines").is_some(), "SectionDiff 嵌套键保持 snake_case");
        assert!(sec.get("added_lines").is_some());
        assert_eq!(sec["status"], "modified");
    }

    /// stats_from：按 diff_sections 分组行数统计（工作台头部 新增/删除/未变 徽标）。
    #[test]
    fn stats_from_aggregates_section_lines() {
        use crate::note_diff::{DiffStatus, SectionDiff};
        let secs = vec![
            SectionDiff { heading: "A".into(), status: DiffStatus::Modified, removed_lines: vec!["a".into()], added_lines: vec!["A".into(), "B".into()] },
            SectionDiff { heading: "B".into(), status: DiffStatus::Unchanged, removed_lines: vec![], added_lines: vec![] },
            SectionDiff { heading: "C".into(), status: DiffStatus::Added, removed_lines: vec![], added_lines: vec!["c".into()] },
            SectionDiff { heading: "D".into(), status: DiffStatus::Removed, removed_lines: vec!["d".into()], added_lines: vec![] },
        ];
        let s = stats_from(&secs);
        assert_eq!(s.added, 3);
        assert_eq!(s.removed, 2);
        assert_eq!(s.unchanged, 1);
    }
}
