//! 笔记版本管理 commands（REQ-144 + REQ-143 成本展示，v0.8.0 M4）。
//!
//! @ai-context: 版本时间线数据源（list/diff/rollback）+ 成本记录展示；
//!              写路径统一走 versioned_save（转笔记首快照惰性/精修采纳/
//!              补充采纳/手动保存/回滚=新版本——见 db_notes_versions.rs）。
//! @ai-context: 段级 diff 复用 note_diff.rs（M2 预览内核——任意两版对比）；
//!              回滚不破坏历史链（新版本 parent=目标版本）。

use tauri::State;

use crate::commands::AppState;
use crate::db_ai_usage::AiUsageRecord;
use crate::db_notes_versions::NoteVersion;
use crate::note_diff::{diff_markdown, diff_sections, diff_stats, DiffOp, SectionDiff};
use crate::types::Note;

/// 版本列表（旧→新；含惰性首快照——旧数据迁移兼容）。
#[tauri::command]
pub fn note_versions_list(state: State<'_, AppState>, note_id: i64) -> Result<Vec<NoteVersion>, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    state.db.list_versions(note_id).map_err(|e| e.to_string())
}

/// 任意两版段级 diff（版本对比视图数据源——note_diff 内核）。
#[tauri::command]
pub fn note_versions_diff(
    state: State<'_, AppState>,
    note_id: i64,
    v1_id: i64,
    v2_id: i64,
) -> Result<Vec<DiffOp>, String> {
    let v1 = get_version_for_note(&state, note_id, v1_id)?;
    let v2 = get_version_for_note(&state, note_id, v2_id)?;
    Ok(diff_markdown(&v1.content, &v2.content))
}

/// 回滚到目标版本（新版本 user_edit，parent=目标版本——历史链不破坏）。
#[tauri::command]
pub fn note_versions_rollback(
    state: State<'_, AppState>,
    note_id: i64,
    target_version_id: i64,
) -> Result<Note, String> {
    if note_id <= 0 || target_version_id <= 0 {
        return Err("无效的参数".to_string());
    }
    state
        .db
        .rollback_to(note_id, target_version_id)
        .map_err(|e| e.to_string())?;
    // REQ-278 审查补端：回滚 = 笔记内容变更（版本链新枝）→ 广播 notes 域
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Notes);
    state
        .db
        .get_note(note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())
}

/// 笔记成本记录（版本时间线"费用"列数据源）。
#[tauri::command]
pub fn note_versions_usage(state: State<'_, AppState>, note_id: i64) -> Result<Vec<AiUsageRecord>, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    state.db.list_ai_usage(note_id).map_err(|e| e.to_string())
}

/// 按会话 id 查关联笔记（取最新）。
#[tauri::command]
pub fn note_by_session(state: State<'_, AppState>, session_id: i64) -> Result<Option<Note>, String> {
    state.db.find_note_by_session(session_id).map_err(|e| e.to_string())
}

/// 任意两篇 markdown 的章节级分组 diff（VersionPanel 对比用）。
#[tauri::command]
pub fn diff_markdown_sections(old_md: String, new_md: String) -> Vec<SectionDiff> {
    diff_sections(&old_md, &new_md)
}

/// 整篇有序行级 diff 响应（diff_markdown_ops 数据源——三态流 + 行数统计）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDiffOps {
    /// 有序三态流（base/refined 各行全集划分——LCS 保序，前端按栏消费染色）
    pub ops: Vec<DiffOp>,
    pub added: usize,
    pub removed: usize,
}

/// 行级 diff 入口字符护栏上限（两段文本合计字符数）。
///
/// @ai-context Why（P2-6 审查修复）：note_diff 仅按「行数乘积 4M」回退
///              （LCS_CELLS_MAX），无字符级上限——单行超长文本的行数乘积
///              1×1 不触发回退，但行比较/克隆/ops 序列化与 JSON 传输仍随
///              总字符数线性放大；2M 字符 ≈ 常规精修/笔记量级（万字符内）
///              两个数量级以上的余量，超限即视为异常输入走降级。
const DIFF_MD_CHARS_MAX: usize = 2_000_000;

/// 任意两篇 markdown 的整篇有序行级 diff（精修工作台行级标色/差异模式）。
///
/// @ai-context Why（批 3 / 用户问题11）：工作台此前只有章节分组
///              diff_markdown_sections（丢失行间顺序，无法行级染色）；
///              note_versions_diff 需 DB 版本 id，只读/内存文本对比不可用——
///              补薄命令直接暴露 note_diff::diff_markdown 全文档流（纯函数
///              复用，无第二套 diff 引擎）；前端三入口（会话级/笔记级/只读）
///              统一经本命令对"实际展示的两版文本"取数，保证行与渲染对齐。
/// @ai-context Why（P2-6 审查修复）：改 async——Tauri 同步 command 在主线程
///              执行，超长文本的 diff 会卡 UI；async 命令派发到异步运行时
///              线程执行（仓库先例：commands.rs list_notes/proofread_run 等
///              async 命令同步体，无 await 点直接返回）。计算核心无 await
///              点、CPU 量已被 DIFF_MD_CHARS_MAX + note_diff 行数乘积 4M 回退
///              双向封顶——同步算完即返即可，无需 spawn_blocking。
#[tauri::command]
pub async fn diff_markdown_ops(
    old_md: String,
    new_md: String,
) -> Result<MarkdownDiffOps, String> {
    diff_markdown_ops_inner(&old_md, &new_md)
}

/// diff_markdown_ops 同步计算核心（纯函数；单测直接调用，不依赖运行时）。
///
/// 降级口径（P2-6）：超限返回 Err 而非空 ops——前端 RefineWorkbench.load
/// 对本命令取数失败 catch(() => null) → ops=null → mdFallbackRows 全文本
/// 不染色兜底（refineDiff.ts 既有「取数失败→不染色」路径）；空数组在 JS
/// 是 truthy，splitDiffSides([]) 会让工作台双栏渲染成空白——不可用空 ops
/// 表达降级（已核对前端对空/失败的消费，走失败路径）。
fn diff_markdown_ops_inner(old_md: &str, new_md: &str) -> Result<MarkdownDiffOps, String> {
    if old_md.chars().count() + new_md.chars().count() > DIFF_MD_CHARS_MAX {
        return Err(format!(
            "内容过长（两段合计超 {} 字符）——跳过行级染色，原文不受影响",
            DIFF_MD_CHARS_MAX
        ));
    }
    let ops = diff_markdown(old_md, new_md);
    let (added, removed, _) = diff_stats(&ops);
    Ok(MarkdownDiffOps { ops, added, removed })
}

/// 读版本并校验归属（diff 输入防御）。
fn get_version_for_note(state: &AppState, note_id: i64, version_id: i64) -> Result<NoteVersion, String> {
    let v = state
        .db
        .get_version(version_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("版本不存在: {}", version_id))?;
    if v.note_id != note_id {
        return Err("版本与笔记不匹配".to_string());
    }
    Ok(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// AAA：整篇有序流——前后未变行保序、中段删除/新增按原始出现序交错
    /// （工作台染色按流消费即得各栏行序，无需二次对齐）。
    #[test]
    fn diff_markdown_ops_keeps_whole_document_order() {
        // Arrange：首行未变、中段一删一增、尾行未变
        let old_md = "甲\n删我\n尾".to_string();
        let new_md = "甲\n加我\n尾".to_string();
        // Act
        let out = diff_markdown_ops_inner(&old_md, &new_md).expect("正常输入应成功");
        // Assert：三态各自一个且有序（unchanged → removed → added）
        assert_eq!(
            out.ops,
            vec![
                DiffOp::Unchanged("甲".into()),
                DiffOp::Removed("删我".into()),
                DiffOp::Added("加我".into()),
                DiffOp::Unchanged("尾".into()),
            ]
        );
        assert_eq!((out.added, out.removed), (1, 1));
    }

    /// AAA：空侧边界——单侧全量标记，另一侧无行。
    #[test]
    fn diff_markdown_ops_empty_side_counts_every_line() {
        // Arrange/Act
        let out =
            diff_markdown_ops_inner("", "新增1\n新增2").expect("正常输入应成功");
        // Assert：空基线的整篇都是新增
        assert_eq!(out.ops.len(), 2);
        assert!(out.ops.iter().all(|o| matches!(o, DiffOp::Added(_))));
        assert_eq!((out.added, out.removed), (2, 0));

        let out = diff_markdown_ops_inner("删1\n删2", "").expect("正常输入应成功");
        // Assert：空精修版的整篇都是删除
        assert!(out.ops.iter().all(|o| matches!(o, DiffOp::Removed(_))));
        assert_eq!((out.added, out.removed), (0, 2));
    }

    /// AAA：serde 契约——顶层 camelCase + DiffOp 外部小写标签
    /// （与前端 types/notes.ts DiffOp 联合类型逐字对齐）。
    #[test]
    fn diff_markdown_ops_serializes_camel_case_and_lowercase_tags() {
        // Arrange/Act
        let out =
            diff_markdown_ops_inner("旧\n同", "新\n同").expect("正常输入应成功");
        let json = serde_json::to_value(&out).unwrap();
        // Assert：顶层键 camelCase（ops/added/removed）
        assert!(json.get("ops").is_some());
        assert!(json.get("added").is_some());
        assert!(json.get("removed").is_some());
        assert!(json.get("ops").unwrap().is_array());
        // Assert：op 条目为外部小写标签 {removed: "旧"} / {added: "新"} / {unchanged: "同"}
        assert_eq!(json["ops"][0]["removed"], "旧");
        assert_eq!(json["ops"][1]["added"], "新");
        assert_eq!(json["ops"][2]["unchanged"], "同");
        assert_eq!(json["added"], 1);
        assert_eq!(json["removed"], 1);
    }

    /// AAA（P2-6）：字符护栏——两段合计超 DIFF_MD_CHARS_MAX → Err 降级，
    /// 不进入 diff 计算。选型：单行超长文本行数乘积 1×1，note_diff 的 4M
    /// 行数回退拦不住，唯独入口字符护栏能拦下。
    #[test]
    fn diff_markdown_ops_over_char_limit_returns_err_degrade() {
        // Arrange：old 距上限差 1 字符 + new 两字符 = 合计刚好超 1 字符
        let old_md = "甲".repeat(DIFF_MD_CHARS_MAX - 1);
        let new_md = "乙丙".to_string();
        // Act
        let res = diff_markdown_ops_inner(&old_md, &new_md);
        // Assert：Err（前端按取数失败降级为全文本不染色）且报错可读
        let err = res.expect_err("超限应返回 Err 降级");
        assert!(err.contains("内容过长"), "报错应说明超限原因: {err}");
    }

    /// AAA（P2-6）：边界——合计恰为 DIFF_MD_CHARS_MAX 时不误伤（正常路径
    /// 与原行为一致：与既有 3 例同内核，仅多一次字符计数）。
    #[test]
    fn diff_markdown_ops_at_char_limit_still_diffs() {
        // Arrange：old 恰占满上限（单行——行数乘积 1×0 不触发 LCS 回退）
        let old_md = "甲".repeat(DIFF_MD_CHARS_MAX);
        let new_md = String::new();
        // Act
        let out = diff_markdown_ops_inner(&old_md, &new_md).expect("恰好上限不应降级");
        // Assert：整行删除（行为与原实现逐字节一致）
        assert_eq!(out.ops.len(), 1);
        assert!(matches!(out.ops[0], DiffOp::Removed(_)));
        assert_eq!((out.added, out.removed), (0, 1));
    }
}
