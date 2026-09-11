//! AI 精修任务执行（F2-B4 拆分，2026-08-21：自 commands_ai_refine.rs 拆出——
//! 豁免清单拆分计划兑现；行数回归 ≤300）。
//!
//! @ai-context: 后台任务主体：规则草稿 → 切片 → 并发精修（F2：并发 2-3，
//!              单片失败重试 1 次，仍失败保留已成功片 = 部分成功，不再
//!              一片失败全任务失败）→ 合并 → diff。panic 由 catch_unwind
//!              归一 Failed（状态流转永不失联）。审计/任务落库在此层完成。
//! @ai-context: 并发实现：std::thread::scope + channel 工作池（spawn_blocking
//!              线程内再开 worker——网络调用阻塞 worker 线程，互不干扰；
//!              AiClient 为 Clone+Send，跨线程共享安全）。

use crate::ai_chat::AiTurn;
use crate::ai_client::AiClient;
use crate::ai_mock::AiMockAdapter;
use crate::ai_note_refine::AiNoteRefineAdapter;
use crate::ai_strategy::ResolvedDims;
use crate::ai_task::{slice_note, AiTaskFailure, AiTaskState, SLICE_MAX_CHARS};
use crate::commands::AppState;
use crate::commands_ai_refine::{set_task, AiRefineResult};
use crate::commands_session_note::build_rule_draft_with_analysis;
use crate::note_diff::{diff_markdown, diff_stats};
use crate::note_filter::PurifyEnv;
use crate::outline::{detect_outline_smart, OutlineConfig};
use crate::video_profile::ProfileKind;

/// 并发切片精修 worker 池子模块（拆分目的与锁窗口/时序口径见 workers.rs 模块头）
#[path = "ai_refine_task/workers.rs"]
mod workers;
/// 子模块再导出：既有 `crate::ai_refine_task::{…}` 导入路径保持不变。
pub(crate) use self::workers::{refine_slices_concurrent, RefineCtx};

/// 任务终态骨架子模块（catch_unwind 归一 + 落库/审计/裁剪，锁序见 skeleton.rs 模块头）
#[path = "ai_refine_task/skeleton.rs"]
mod skeleton;
/// 子模块再导出：既有 `crate::ai_refine_task::{…}` 导入路径保持不变。
pub(crate) use self::skeleton::run_refine_task_skeleton;

/// 屏卡图装载子模块（视觉增强的目录时序/缩放口径见 vision.rs 模块头）
#[path = "ai_refine_task/vision.rs"]
mod vision;
use self::vision::load_session_vision_images;

/// 流式帧推送子模块（唯一 emit 点与静默口径见 stream.rs 模块头）
#[path = "ai_refine_task/stream.rs"]
mod stream;

/// 切片并发上限（REQ-145：并发 2-3——配额并发安全由 command 层启动前按
/// 预估片数一次性消耗保证，此处 worker 数不超切片数）。v0.17.0：pub(crate)
/// ——笔记级精修任务共用同一上限。
pub(crate) const CONCURRENCY: usize = 3;

/// 精修流式帧（REQ-247 B+ 档：片级解析流——片完成 validate 后推渲染，
/// 中间态永不承诺；事件通道 "ai:refine-stream"，载荷 RefineStreamPayload）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum RefineStreamFrame {
    /// 片完成进度（收集推进时推——前端进度行）
    Progress { slice_index: usize, slice_total: usize },
    /// 该片精修结果（validate 通过后的渲染 markdown——逐章正文流出）
    BlockDone { slice_index: usize, markdown: String },
    /// REQ-290①：片内流式增量（NDJSON 逐节解析即推——打字机正文；text=节渲染
    /// 的 markdown 片段，同片内按到达序拼接；终稿以 BlockDone 为准）
    Delta { slice_index: usize, text: String },
    /// 该片失败（回退纯规则语义——诚实降级提示）
    SliceFailed { slice_index: usize, reason: String },
    /// 任务终态（全部片合并完成）
    Done { slices: usize, failed_slices: usize },
}

/// 后台精修任务：规则草稿 → 切片 → 逐片精修（mock/云端）→ 合并 → diff。
///
/// @ai-context: v0.17.0（REQ-245）：dims=策略解析结果（command 层 resolve 后
///              传入）——每片提示词一致（切片间风格统一），协议零改动。
pub fn run_refine_task(
    st: AppState,
    task_id: u64,
    session_id: i64,
    mock: bool,
    dims: ResolvedDims,
    // REQ-284（v0.19.7）：任务级画面理解覆写（None=跟随全局设置；
    // command 层透传前端「仅本次」勾选）
    vision_override: Option<bool>,
) {
    // 诊断日志（2026-08-21 真机"排队中"排查）：tauri dev 终端可见各阶段进度
    eprintln!(
        "[refine-task] task={} start session={} mock={} strategy={}",
        task_id, session_id, mock, dims.preset_id
    );
    run_refine_task_skeleton(st.clone(), task_id, format!("session={}", session_id), move || {
        run_refine_task_inner(&st, task_id, session_id, mock, &dims, vision_override)
    });
}

/// 构建精修适配器（密钥解析/Provider 解析统一口径——会话级/笔记级共用；
/// v0.17.0 REQ-246 提取）。密钥来源诊断日志在层内（脱敏：只打长度+前 6 字符）。
pub(crate) fn build_refine_adapter(
    st: &AppState,
) -> Result<(AiClient, AiNoteRefineAdapter), AiTaskFailure> {
    let settings = st
        .ai_settings
        .lock()
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?
        .clone();
    let env_key = std::env::var("SILICONFLOW_API_KEY").ok().filter(|k| !k.is_empty());
    // M1 统一解析口：env 优先 > 默认 Provider per-provider 凭据 > 旧 default scope
    let stored_key = crate::commands_ai_providers::resolve_default_provider_key(st)
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?;
    eprintln!(
        "[refine-task] key: env={} stored={}",
        env_key
            .as_ref()
            .map(|k| format!("{}:{}..", k.len(), &k[..6.min(k.len())]))
            .unwrap_or_else(|| "无".to_string()),
        stored_key
            .as_ref()
            .map(|k| format!("{}:{}..", k.len(), &k[..6.min(k.len())]))
            .unwrap_or_else(|| "无".to_string()),
    );
    let store = st
        .ai_providers
        .lock()
        .map_err(|e| AiTaskFailure::Other(format!("AI Provider 存储锁中毒: {}", e)))?
        .clone();
    let client = AiClient::from_settings_with_store(&settings, stored_key, &store);
    Ok((client.clone(), AiNoteRefineAdapter::new(client)))
}

/// 精修任务主体（返回 Result；panic 由外层 catch_unwind 兜底）。
///
/// @ai-context: v0.16.0（REQ-230）返回 (结果, 轨迹)——轨迹为每片 LLM 调用的
///              提示词/回答；外层终态时随任务落库（任务对话视图数据源）。
fn run_refine_task_inner(
    st: &AppState,
    task_id: u64,
    session_id: i64,
    mock: bool,
    dims: &ResolvedDims,
    vision_override: Option<bool>,
) -> Result<(AiRefineResult, Vec<AiTurn>), AiTaskFailure> {
    let env = PurifyEnv {
        config: st.purify.clone(),
        symbol: st.symbol_normalize.clone(),
        corrections: st.ocr_corrections.clone(),
    };
    // ① 规则草稿 + 结构分析一次完成（审查修复 2026-08-21：build_rule_draft_
    //    with_analysis 返回 analysis——章节/术语直接复用，消除二次 analyze 双跑）
    eprintln!("[refine-task] task={} 阶段①构建规则草稿（本地分析）", task_id);
    let (draft, analysis) =
        build_rule_draft_with_analysis(&st.db, &st.ui_junk, &env, &st.data_dir, session_id, None)
            .map_err(AiTaskFailure::Other)?;
    eprintln!("[refine-task] task={} 草稿完成 markdown={} 字符", task_id, draft.markdown.chars().count());
    // 7️⃣ 锚点剥离（2026-08-22，spec 7️⃣）：段落锚点全剥省 token（锚点对整理
    // 无语义，段级溯源由协议 anchor_ref 承担）；章节锚点记录 (标题, ms) 映射，
    // 精修输出合并后按标题精确匹配回挂（不丢不假）
    let (strip_md, chapter_anchors) = crate::anchor_strip::strip_anchors_with_map(&draft.markdown);
    eprintln!(
        "[refine-task] task={} 锚点剥离: {} → {} 字符（章节锚点 {} 个）",
        task_id,
        draft.markdown.chars().count(),
        strip_md.chars().count(),
        chapter_anchors.len()
    );
    // ② 精修上下文（档案/章节/术语——analysis 已含章节边界与术语表）
    let session = st
        .db
        .get_session(session_id)
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?
        .ok_or_else(|| AiTaskFailure::Other("会话不存在".to_string()))?;
    let kind = session
        .profile
        .as_deref()
        .map(ProfileKind::parse)
        .unwrap_or(ProfileKind::Lecture);
    let ocr_blocks = st
        .db
        .list_ocr_blocks(session_id)
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?;
    let outline = detect_outline_smart(&ocr_blocks, &draft.ocr_screens, &OutlineConfig::default());
    let chapters: Vec<String> = if outline.is_empty() {
        analysis
            .chapters
            .iter()
            .enumerate()
            .map(|(i, _)| format!("第 {} 节", i + 1))
            .collect()
    } else {
        outline.iter().map(|e| e.text.clone()).collect()
    };
    let glossary: Vec<String> = analysis.glossary.iter().map(|g| g.term.clone()).collect();
    // ③ 切片（≤8000 字/片；进度按片上报）——输入为剥离锚点后的 markdown
    let slices = slice_note(&strip_md, SLICE_MAX_CHARS);
    let total = slices.len();
    eprintln!("[refine-task] task={} 切片 {} 片", task_id, total);
    set_task(st, task_id, AiTaskState::Running { finished_slices: 0, total_slices: total });
    let settings = st
        .ai_settings
        .lock()
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?
        .clone();
    // v0.17.0：密钥/Provider/适配器统一解析口（会话级/笔记级共用）
    let (client, adapter) = build_refine_adapter(st)?;
    let mock_adapter = AiMockAdapter;
    // v0.12.0 M5：画面理解——仅精修设置开启时装载会话屏卡图（≤1280px 控 token；
    // 空 → 精修纯文本，现有行为零变化；图文会话不触发——调用方只对视频会话接线）
    // REQ-284（v0.19.7）：任务级覆写优先于全局（resolve 纯函数——覆写缺省=全局）
    let vision_enabled = crate::ai_settings::resolve_vision_refine(vision_override, settings.vision_refine_enabled);
    let vision_images = if vision_enabled {
        load_session_vision_images(&st.data_dir, session_id)
    } else {
        Vec::new()
    };
    // F2-B4：并发精修（worker 池消费切片队列；按片上报进度；失败片重试后
    // 仍失败 → 记 failed 下标，不中断其他片——部分成功语义）
    let (markdowns, failed, mut turns) = refine_slices_concurrent(RefineCtx {
        slices: &slices,
        chapters: &chapters,
        glossary: &glossary,
        profile: kind.as_str(),
        adapter: &adapter,
        mock_adapter: &mock_adapter,
        mock,
        workers: total.min(CONCURRENCY),
        st,
        task_id,
        vision_images: &vision_images,
        dims,
    });
    // ④ 合并（协议层 merge_refine_slices：各片 join + 章节锚点回挂——7️⃣
    // 剥离的章节锚点按标题精确匹配还原，未匹配不挂）
    let mut refined = crate::ai_refine_protocol::merge_refine_slices(&markdowns, &chapter_anchors);
    // 与规则版 diff（基线=本地版，AI 变化点高亮）
    // 丢图修复（2026-08-21 F1）：协议 v2 前，模型可能丢弃规则版画面配图行
    // （`- ![画面 N](session-images/..)`）——本地合并降级：AI 未保留配图时
    // 把规则版配图行按章节合并回精修版（不丢不假，零模型成本）
    refined = crate::note_image_merge::merge_rule_images(&draft.markdown, &refined);
    let diff = diff_markdown(&draft.markdown, &refined);
    let (added, removed, _) = diff_stats(&diff);
    turns.sort_by_key(|t| t.turn); // 轨迹按片序排列（并发收集序 ≠ 片序）
    Ok((
        AiRefineResult {
            title: draft.title.clone(),
            base_markdown: draft.markdown.clone(),
            refined_markdown: refined,
            diff,
            added_lines: added,
            removed_lines: removed,
            slices: total,
            failed_slices: failed,
            model: client.config.model,
            // v0.17.0：策略溯源（档位 + 每维最终值——工作台溯源条数据源）
            strategy: Some(crate::commands_ai_refine::RefineStrategyInfo {
                preset_id: dims.preset_id.clone(),
                dims: dims.dims.clone(),
                // REQ-279：自定义档文本随结果落库（溯源/重生成沿用）
                custom_text: if dims.custom_text.is_empty() { None } else { Some(dims.custom_text.clone()) },
            }),
        },
        turns,
    ))
}
