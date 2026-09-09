//! 实时会话暂停边沿检测与应用（批 2a：暂停边沿收敛域，live_session_loop.rs 迁出）。
//!
//! @ai-context(Why)：主循环 500ms 轮询粒度下，暂停+恢复都可能落在同一轮询窗内
//!              ——loop 看不到标志边沿 → 暂停前后语音在同一 ASR 流里连句（恢复丢
//!              内容路径 A/B）。本文件收口边沿语义：flag 可见边沿照常处理；
//!              seq（捕获线程实测的已完成物理暂停区间计数）跳跃部分做代数补偿：
//!              flush_no_rescore + reset + 合成 Pause/Resume 事件对（时刻取最近
//!              实测区间 edge 槽，缺槽回落当前会话时刻）。
//! @ai-context：暂停边沿 flush 改 **flush_no_rescore**（跳过 SenseVoice 整句
//!              重打分——暂停延迟根源①：重打分有界 3s，暂停边沿同步等它；
//!              边沿只需断句，Zipformer+标点兜底足够，停止路径 flush 保留重打分）。
//! @ai-context：恢复丢内容路径 C 由"暂停边沿先于恢复发生"保证（命令置位 µs 级
//!              返回，引擎侧动作由本函数在 ≤1 节拍内完成——暂停中停止/恢复的
//!              flush 与切断都收敛在此）；跨暂停链式合并防护 = 边界切断
//!              （sentence_start_ms/last_speech_ms/last_final_clean/语速基准
//!              → None；pending_merge 由 flush 兜底落库后清空——persist 内部
//!              状态全在 FinalEventCtx 字段，无私有状态需收敛进 persist）。
//! @ai-context：事件时刻沿用 live_session_loop.rs:137-138 会话时刻公式
//!              （epoch.elapsed() - 累计暂停补偿）；恢复时刻按上一 Pause 事件
//!              夹逼（会话时刻轴在暂停期不前进，恢复检测可早于暂停检测的晚记
//!              时刻——夹逼保证 DB 事件时间戳单调）。

use std::sync::atomic::Ordering;

use tauri::Emitter;

use crate::live_session_loop::LiveLoopCtx;
use crate::live_session_persist::{
    flush_tail_and_persist, FinalEventCtx, PendingMerge,
};
use crate::pause_state::{PauseInterval, PauseSource, SessionPause};

/// 待发出事件（有序：合成漏区间对 → 可见边沿；DB 插入与 emit 同序）。
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct PlanEvent {
    pub kind: PlanEventKind,
    pub source: PauseSource,
    pub moment_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PlanEventKind {
    Pause,
    Resume,
}

/// 一次观察的计算结果（纯；执行器只做副作用落库/emit/flush）。
#[derive(Debug, Clone, PartialEq, Default)]
pub(crate) struct PauseEdgeAction {
    /// 有序事件（合成对在前——它们真实发生在可见边沿之前）
    pub events: Vec<PlanEvent>,
    /// 需要 no-rescore flush + 引擎 reset + 边界切断
    pub flush_cut: bool,
    /// 本次观察判定的漏检完整区间总数（诊断；edge 槽只保最近区间，>1 时
    /// 更早区间只补 flush 不补事件——时刻不可考，执行器记日志）
    pub missed_count: u32,
}

/// loop 侧暂停观察点（跨轮询保持；new 时快照当前状态——会话起点对齐）。
#[derive(Debug, Clone)]
pub(crate) struct PauseEdgeView {
    pub flag: bool,
    /// 已消化的区间计数（delta = seq - view.seq 即待判定的漏检区间数）
    pub seq: u64,
    /// 当前可见暂停区间的完成增量(+1)尚未被吸收（loop 已见上升沿但恢复的
    /// Start 尚未执行，或 loop 起点即在暂停中）——对应 +1 到达时在稳态/
    /// 上升沿/下降沿任一观察吸收一次，防把"本已可见的暂停"重复合成为
    /// 漏检区间
    pub own_pending: bool,
    /// 当前暂停的上升沿是否已处理（未处理=引擎可能未清流——恢复边沿防御 flush）
    pub pause_processed: bool,
    /// 上一已发 Pause 事件时刻（恢复时刻夹逼基准）
    pub last_pause_ms: Option<u64>,
}

impl PauseEdgeView {
    pub(crate) fn new(shared: &SessionPause) -> Self {
        Self {
            flag: shared.paused.load(Ordering::SeqCst),
            seq: shared.completed_intervals(),
            // loop 起点即在暂停中：该暂停区间的完成增量同样需吸收一次
            own_pending: shared.paused.load(Ordering::SeqCst),
            pause_processed: false,
            last_pause_ms: None,
        }
    }
}

/// 会话时刻公式（与 live_session_loop.rs:137-138 同口径）。
fn session_now_ms(ctx: &LiveLoopCtx<'_>) -> u64 {
    ctx.epoch.elapsed().as_millis() as u64
        - ctx.pause.total_paused_ms.load(Ordering::SeqCst)
}

/// 合成漏区间事件对（最多一对——edge 槽只保最近完成区间；delta>1 的更早
/// 区间时刻已不可考，调用方记诊断日志）。槽缺失（理论不可达——每完成区间
/// 必先写槽）回落当前会话时刻。返回是否产出了合成对（供调用方更新 last_pause）。
fn push_synth(
    out: &mut PauseEdgeAction,
    next: &mut PauseEdgeView,
    interval: Option<PauseInterval>,
    reason: Option<PauseSource>,
    session_now: u64,
) {
    let (s_ms, e_ms, src) = match interval {
        Some(iv) => (iv.pause_ms, iv.resume_ms, iv.source),
        None => (
            session_now,
            session_now,
            reason.unwrap_or(PauseSource::Manual),
        ),
    };
    next.last_pause_ms = Some(s_ms);
    out.events.push(PlanEvent { kind: PlanEventKind::Pause, source: src, moment_ms: s_ms });
    out.events.push(PlanEvent {
        kind: PlanEventKind::Resume,
        source: src,
        moment_ms: e_ms.max(s_ms),
    });
}

/// 纯函数：一次暂停观察的边沿判定（真值表单测见 live_session_pause_tests.rs）。
///
/// 语义（seq=已完成物理暂停区间计数；每区间在捕获线程执行 Start 成功时完成
/// +1，**含 loop 已可见处理的暂停区间**——完成增量须按归属吸收）：
/// - own_pending=当前可见暂停的完成增量未吸收：上升沿置真；下降沿 delta 0
///   （恢复抢跑，Start 未执行）保持真；下降沿 delta ≥ 1（自身完成已在
///   delta 内）与稳态/上升沿吸收（own_pending 的 +1 到达）后置假。loop
///   起点即在暂停中 → new 即真。旧完成增量在上升沿未到（delta 0）→ 待吸收
///   位并入新期（由新期稳态/下降沿吸收一次）。
/// - 稳态（标志未变）：delta 0 → 无；先吸收 own_pending 的 +1，余下 delta 为
///   双沿都漏检的区间（稳态假=轮询窗内往返；稳态真=暂停期 flap）→ 合成事件
///   对 + flush_cut（引擎可能跨漏区间连句）；稳态真吸收 own 完成且无余量
///   时，若完成区间 resume 晚于已发 Pause 事件时刻（可见暂停的恢复沿丢
///   采样）→ 补发合成 Resume + flush_cut + 复位 pause_processed（P2-3，
///   见分支注释）
/// - 上升沿（→暂停）：可见暂停事件 + flush_cut（no-rescore 断句）；先吸收
///   own_pending 的 +1（其恢复沿若已可见发出，不得重复合成），余下
///   delta_eff ≥ 1 = 此前的真漏检完整区间 → 先补合成对
/// - 下降沿（→恢复）：可见恢复事件；delta ≥ 1 吸收自身区间完成 +1，余下
///   k = delta-1 为暂停期 flap → 合成 + flush_cut；!pause_processed（loop
///   起点即在暂停中，引擎未清流）→ 防御 flush（边界保护）
/// - 合成对时刻取 edge 槽（最近完成区间实测会话时刻；缺槽回落当前会话
///   时刻）；恢复可见事件时刻按上一 Pause 事件夹逼（会话轴单调——暂停期
///   补偿未累计，恢复检测的会话时刻公式可低于暂停事件时刻）
pub(crate) fn plan_edge_observation(
    view: &PauseEdgeView,
    paused_now: bool,
    seq_now: u64,
    reason: Option<PauseSource>,
    interval: Option<PauseInterval>,
    session_now: u64,
) -> (PauseEdgeAction, PauseEdgeView) {
    let delta = seq_now.saturating_sub(view.seq);
    let mut out = PauseEdgeAction::default();
    let mut next = view.clone();
    next.flag = paused_now;
    next.seq = seq_now;

    if paused_now == view.flag {
        if delta == 0 {
            return (out, next);
        }
        // 稳态：先吸收"本已可见暂停区间"的完成增量（+1），余下为漏检区间
        let (delta_eff, own_pending) = if view.own_pending {
            (delta.saturating_sub(1), false)
        } else {
            (delta, view.own_pending)
        };
        next.own_pending = own_pending;
        out.missed_count = delta_eff as u32;
        if delta_eff > 0 {
            push_synth(&mut out, &mut next, interval, reason, session_now);
            out.flush_cut = true;
        } else if paused_now && view.own_pending {
            // P2-3（审查修复）：吸收的 +1 = 本已可见暂停**自身**区间的完成——
            // 物理恢复已发生但 loop 未采到恢复沿（恢复+再次暂停同落一个
            // <500ms 未采样窗，该次恢复从未落库，暂停区间会并入下次可见
            // 恢复造成时长虚高）。若完成区间 resume 晚于已发出的 Pause
            // 事件时刻（存在未见过的恢复沿）→ 补发合成 Resume（时刻夹逼
            // ≥ Pause 事件保 DB 单调）+ flush_cut（恢复后采到的内容跨该
            // 边界不得与后续连句——路径 C 防护）+ 复位 pause_processed
            // （当前暂停=恢复后的再次暂停，其上升沿从未处理——后续下降沿
            // k=0 时不再静默放行，防御 flush 兜底）。resume 不晚于 Pause
            // 事件时刻 = 更早一次**已见**恢复（抢跑下降沿已发可见 Resume）
            // 的迟到完成增量 → 保持现状（静默吸收）。
            if let Some((iv, last_p)) =
                interval.zip(view.last_pause_ms).filter(|(iv, p)| iv.resume_ms > *p)
            {
                let r = iv.resume_ms.max(last_p);
                out.events.push(PlanEvent {
                    kind: PlanEventKind::Resume,
                    source: iv.source,
                    moment_ms: r,
                });
                out.flush_cut = true;
                next.pause_processed = false;
            }
        }
    } else if paused_now {
        // 上升沿：可见暂停。先吸收 own_pending 的完成增量（+1——它对应本已
        // 可见暂停的物理完成，其恢复沿已按可见边沿发出事件；不吸收会把
        // delta 全数当漏检，manual <500ms 往返链上把已见暂停重复合成为
        // Pause/Resume 对——DB 序倒挂 + missed_count 误报 + 多余 flush），
        // 余下 delta_eff ≥ 1 = 此前的真漏检完整区间（先补合成对）；delta 0
        // = 旧完成增量未到——待吸收位并入新期（下方 own_pending 保持真，
        // 由新期稳态/下降沿吸收一次）
        let delta_eff = delta.saturating_sub(u64::from(view.own_pending));
        out.missed_count = delta_eff as u32;
        if delta_eff > 0 {
            push_synth(&mut out, &mut next, interval, reason, session_now);
        }
        let src = reason.unwrap_or(PauseSource::Manual);
        let m = session_now;
        out.events.push(PlanEvent { kind: PlanEventKind::Pause, source: src, moment_ms: m });
        next.last_pause_ms = Some(m);
        out.flush_cut = true;
        next.pause_processed = true;
        // 新可见暂停的完成增量待吸收（恢复 Start 执行时 +1 到达）
        next.own_pending = true;
    } else {
        // 下降沿：可见恢复（delta 0 = Start 未执行抢跑；≥1 吸收自身区间完成
        // +1，余下为暂停期 flap 合成）
        let (k, own_pending) = if delta == 0 { (0, true) } else { (delta - 1, false) };
        next.own_pending = own_pending;
        out.missed_count = k as u32;
        if k > 0 {
            push_synth(&mut out, &mut next, interval, reason, session_now);
        }
        if k > 0 || !view.pause_processed {
            // k>0：flap 内容在引擎流里连句；!pause_processed：loop 起点即在
            // 暂停中（引擎未清流防御）——恢复边沿边界保护 flush
            out.flush_cut = true;
        }
        let src = reason.unwrap_or(PauseSource::Manual);
        // 恢复时刻夹逼：≥ 上一 Pause 事件（会话轴单调——暂停期补偿未累计，
        // 检测时刻可晚于恢复请求，直接会话时刻公式会低于暂停事件时刻）
        let r = session_now.max(view.last_pause_ms.unwrap_or(0));
        out.events.push(PlanEvent { kind: PlanEventKind::Resume, source: src, moment_ms: r });
        next.pause_processed = false;
    }
    (out, next)
}

/// 暂停边沿处理副作用（loop 编排调用；flush/reset/切断/落库/emit 全收敛于此）。
///
/// @ai-context: flush 一律 flush_no_rescore（暂停延迟根源①）；边界切断清单
///              = sentence_start_ms/last_speech_ms/last_final_clean/语速基准
///              （跨暂停链式合并与误去重防护——persist 内部状态均在
///              FinalEventCtx 字段，无 persist 私有状态需额外收敛）。
#[allow(clippy::too_many_arguments)]
pub(crate) fn detect_and_apply_pause_edges(
    view: &mut PauseEdgeView,
    ctx: &mut LiveLoopCtx<'_>,
    sentence_start_ms: &mut Option<u64>,
    last_speech_ms: &mut Option<u64>,
    last_final_clean: &mut Option<String>,
    pending_merge: &mut Option<PendingMerge>,
    last_segment_end: &mut Option<u64>,
    pause_history: &mut std::collections::VecDeque<u64>,
    last_speech_rate: &mut Option<f32>,
    sentence_rms_sum: &mut f32,
    sentence_rms_count: &mut u32,
) {
    let now_ms = session_now_ms(ctx);
    let paused_now = ctx.pause.paused.load(Ordering::SeqCst);
    let (action, next) = plan_edge_observation(
        view,
        paused_now,
        ctx.pause.completed_intervals(),
        ctx.pause.reason(),
        ctx.pause.edge_interval(),
        now_ms,
    );
    *view = next;
    if action.events.is_empty() && !action.flush_cut {
        return;
    }
    if action.missed_count > 1 {
        // 一次轮询窗内多个漏检区间：edge 槽只保最近完成区间，更早区间只补
        // flush 不补事件（时刻不可考）——诊断可观测，不静默
        eprintln!(
            "[LiveSession] 会话 {} 漏检暂停区间 {} 个（槽仅保最近一个，更早不补事件）",
            ctx.session_id, action.missed_count
        );
    }
    if action.flush_cut {
        // 动态合并阈值先算（借用释放后再构造 ctx——与主循环同模式）
        let merge_gap_ms = crate::asr_merge::adaptive_merge_gap(pause_history.iter().copied());
        // 全部字段显式 reborrow（&mut *x）——ctx 被 flush 消费后编排状态仍可
        // 供下方边界切断使用
        flush_tail_and_persist(
            FinalEventCtx {
                app: ctx.app,
                db: ctx.db,
                session_id: ctx.session_id,
                asr_segments: ctx.asr_segments,
                sentence_start_ms: &mut *sentence_start_ms,
                last_speech_ms: &mut *last_speech_ms,
                last_final_clean: &mut *last_final_clean,
                pending_merge: &mut *pending_merge,
                last_segment_end: &mut *last_segment_end,
                pause_history: &mut *pause_history,
                merge_gap_ms,
                last_speech_rate: &mut *last_speech_rate,
            },
            ctx.asr_engine,
            now_ms,
            sentence_rms_sum,
            sentence_rms_count,
            // 暂停边沿：跳过 SenseVoice 重打分（暂停延迟根源①；停止路径保留）
            false,
        );
        // 边界切断：跨暂停链式合并/误去重防护（pending_merge 已由 flush 兜底落库）
        *sentence_start_ms = None;
        *last_speech_ms = None;
        *last_final_clean = None;
        *last_speech_rate = None;
        // 重建流（reset：清句音频/状态，热词重读——TD-032 语义在引擎侧）
        ctx.asr_engine.reset();
    }
    for ev in action.events {
        let kind = match ev.kind {
            PlanEventKind::Pause => crate::session_events::EventKind::Pause,
            PlanEventKind::Resume => crate::session_events::EventKind::Resume,
        };
        let _ = ctx.db.add_event(&crate::session_events::NewSessionEvent {
            session_id: ctx.session_id,
            kind,
            timestamp_ms: ev.moment_ms,
            payload: serde_json::json!({ "source": ev.source.as_str() }),
        });
        let name = match ev.kind {
            PlanEventKind::Pause => "live:paused",
            PlanEventKind::Resume => "live:resumed",
        };
        let reason = ev.source.as_str();
        let _ = ctx.app.emit(name, serde_json::json!({ "reason": reason }));
        match ev.kind {
            PlanEventKind::Pause => {
                eprintln!("[LiveSession] 会话 {} 暂停 @{}ms (source={})", ctx.session_id, ev.moment_ms, reason)
            }
            PlanEventKind::Resume => {
                eprintln!("[LiveSession] 会话 {} 恢复 @{}ms (source={})", ctx.session_id, ev.moment_ms, reason)
            }
        }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "live_session_pause_tests.rs"]
mod tests;
