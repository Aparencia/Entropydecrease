//! 前台时间线（REQ-128 M16 / v0.7.0 M2）：前台窗口切换序列落库 + 实践段标记。
//!
//! @ai-context: 前台切换是"视频 ↔ 编辑器交替"实践段的直接证据——录制目标窗口
//!              （视频）在前台 = 观看讲解；切到其他窗口（编辑器/浏览器）=
//!              动手实践。切换序列以 ForegroundSwitch 事件落库（REQ-108 事件表，
//!              低频行为级），消费端（analysis.rs）用纯函数 practice_segments
//!              推导实践段，供 A4 周报（V1.0）与跟练档案（REQ-123 步骤边界）备数据。
//! @ai-context: 本版只拿到 hwnd（无标题/进程信息）——tool 字段诚实标注 "other"；
//!              目标窗口判定依赖"会话起点前台窗口 = 录制目标"假设（用户启动
//!              录制时视频窗口在前台；自窗口/启动瞬间前台偏移为已知偏差，
//!              V1.0 用 target_hwnd 富化载荷 + 自窗口过滤修正）。
//! @ai-context: 采样粒度 2s（屏幕 worker 轮询）——2s 内快速往返切换可能漏记，
//!              时间线以 2s 粒度近似（事件级数据，非逐帧）。

use crate::db::Db;
use crate::session_events::{EventKind, NewSessionEvent, SessionEvent};

/// 实践段（视频窗口切走 → 切回之间的时间段）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PracticeSegment {
    /// 实践段起点（ms，相对会话起点；= 离开视频窗口的事件时刻）
    pub start_ms: u64,
    /// 实践段终点（ms；= 回到视频窗口的事件时刻；会话结束时未闭合段取最后观测时刻）
    pub end_ms: u64,
    /// 实践工具（本版无标题/进程信息 → 恒 "other"，诚实标注；V1.0 补窗口信息）
    pub tool: String,
}

/// 前台监控器（有状态；由屏幕 worker 每 2s 调用 observe）。
///
/// @ai-context: 独立于 region_tracker 的 REQ-084 前台检测（不改变其行为）——
///              本监控只负责前台切换事件落库，二者互不干扰。
pub struct ForegroundMonitor {
    /// 上次观测到的前台 hwnd（None=尚未观测/探测失败；变化检测基准）
    last_hwnd: Option<i64>,
    /// 上次成功落库的 hwnd（None 探测间隙去重——失败返回 None 不产生重复事件）
    last_recorded_hwnd: Option<i64>,
    /// 录制目标窗口 hwnd（= 会话录制窗口；V1.0 载荷富化/自窗口过滤预留，经 getter 暴露）
    /// #[allow(dead_code)]：当前仅测试经 getter 读取；V1.0 富化载荷时消费。
    #[allow(dead_code)]
    target_hwnd: Option<i64>,
}

impl ForegroundMonitor {
    /// 构造监控器（target_hwnd = 会话录制目标窗口，与 LiveSessionParams.hwnd 同源）。
    pub fn new(target_hwnd: Option<i64>) -> Self {
        Self { last_hwnd: None, last_recorded_hwnd: None, target_hwnd }
    }

    /// 录制目标窗口（会话启动时传入；诊断/测试用）。
    /// #[allow(dead_code)]：当前仅测试消费；V1.0 自窗口过滤/载荷富化时接线。
    #[allow(dead_code)]
    pub fn target_hwnd(&self) -> Option<i64> {
        self.target_hwnd
    }

    /// 观测一次前台窗口：与 last_hwnd 不同（变化）且 hwnd 有效且与上次落库不同
    /// → 写 ForegroundSwitch 事件（payload {"hwnd": i64}）。
    ///
    /// @ai-context: 首观测（last_hwnd=None→Some）即落库——提供会话起点基线事件
    ///              （practice_segments 依赖"首事件 hwnd = 录制目标"）。
    /// @ai-context: 副作用：DB 写入失败仅 eprintln（前台信号不阻断屏幕链路）；
    ///              容量守卫由 db.add_event 内部处理（FIFO 删最旧）。
    pub fn observe(&mut self, current_hwnd: Option<i64>, now_ms: u64, session_id: i64, db: &Db) {
        let changed = current_hwnd != self.last_hwnd;
        self.last_hwnd = current_hwnd;
        if changed {
            if let Some(hwnd) = current_hwnd {
                if self.last_recorded_hwnd != Some(hwnd) {
                    self.last_recorded_hwnd = Some(hwnd);
                    let event = NewSessionEvent {
                        session_id,
                        kind: EventKind::ForegroundSwitch,
                        timestamp_ms: now_ms,
                        payload: serde_json::json!({ "hwnd": hwnd }),
                    };
                    if let Err(e) = db.add_event(&event) {
                        eprintln!("[ForegroundMonitor] 前台事件落库失败: {}", e);
                    }
                }
            }
        }
    }
}

/// 从 ForegroundSwitch 事件序列推导实践段（纯函数，无副作用）。
///
/// @ai-context: 目标窗口 = 序列首事件的 hwnd（假设：会话起点前台窗口即录制目标
///              ——用户启动录制时视频窗口在前台；假设偏差时实践段整体偏移，
///              由真机样本校准）。转换规则：目标→其他 = 实践段开始；
///              其他→目标 = 实践段结束；tool 无窗口信息 → 恒 "other"（诚实标注）。
/// @ai-context: 未闭合段（事件序列结束时仍在实践）end 取最后观测时刻——
///              诚实标注"会话结束时仍在实践"，不丢数据。
/// @ai-context: 边界：空事件/单事件/全同 hwnd → 空向量（无交替不产生实践段）；
///              载荷缺 hwnd 的事件跳过（防御脏数据）；输入须按时间升序
///              （落库查询 ORDER BY timestamp_ms 保证）。
pub fn practice_segments(events: &[SessionEvent]) -> Vec<PracticeSegment> {
    // ① 提取有效 (hwnd, timestamp) 序列（仅 ForegroundSwitch；载荷缺 hwnd 跳过）
    let pairs: Vec<(i64, u64)> = events
        .iter()
        .filter(|e| e.kind == EventKind::ForegroundSwitch)
        .filter_map(|e| {
            e.payload
                .get("hwnd")
                .and_then(|v| v.as_i64())
                .map(|h| (h, e.timestamp_ms))
        })
        .collect();
    if pairs.len() < 2 {
        return Vec::new();
    }
    let target = pairs[0].0;
    let mut segments: Vec<PracticeSegment> = Vec::new();
    let mut open: Option<PracticeSegment> = None;
    // ② 相邻转换扫描：目标→其他 开段；其他→目标 闭段
    for w in pairs.windows(2) {
        let (prev_hwnd, _) = w[0];
        let (cur_hwnd, cur_t) = w[1];
        if prev_hwnd == target && cur_hwnd != target {
            // 离开视频 → 实践段开始（防御：若有未闭合段先闭——脏序列兜底）
            if let Some(o) = open.take() {
                segments.push(PracticeSegment { end_ms: cur_t, ..o });
            }
            open = Some(PracticeSegment {
                start_ms: cur_t,
                end_ms: 0,
                tool: "other".to_string(),
            });
        } else if prev_hwnd != target && cur_hwnd == target {
            // 回到视频 → 实践段结束
            if let Some(o) = open.take() {
                segments.push(PracticeSegment {
                    start_ms: o.start_ms,
                    end_ms: cur_t,
                    tool: o.tool,
                });
            }
        }
    }
    // ③ 未闭合段：end = 最后观测时刻（会话结束时仍在实践，诚实标注不丢数据）
    if let Some(o) = open {
        let last_t = pairs.last().map(|(_, t)| *t).unwrap_or(o.start_ms);
        segments.push(PracticeSegment { start_ms: o.start_ms, end_ms: last_t, tool: o.tool });
    }
    // ④ 零长段（离开即结束/会话即止）无信息量，丢弃
    segments.into_iter().filter(|s| s.end_ms > s.start_ms).collect()
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "foreground_timeline_tests.rs"]
mod tests;
