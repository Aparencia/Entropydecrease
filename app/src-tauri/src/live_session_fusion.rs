//! 实时会话融合域（v0.7.0 M0 X-O5 行数拆分：live_session.rs 798 行超限硬拆）。
//!
//! @ai-context: REQ-031 融合状态跟踪（内存标记，ADR-008 决策——不迁移 sessions 表；
//!              V1.0 ADR-006 派生表落地时自然取代）与后台融合线程（停止后
//!              join 采样线程 → 读字幕段 → rewrite_with_fusion → 事件）。
//!              融合不阻塞停止响应：finish+emit 秒回后移入本线程执行。

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::db::Db;
use crate::fusion::SubtitleSegment;
use crate::types::TranscriptSegment;

/// 会话融合状态跟踪（REQ-031：内存标记，ADR-008 决策——不迁移 sessions 表；
/// V1.0 ADR-006 派生表落地时自然取代）。
#[derive(Clone, Default)]
pub struct FusionTracker {
    fusing: Arc<Mutex<HashSet<i64>>>,
}

impl FusionTracker {
    pub fn begin(&self, id: i64) {
        self.fusing.lock().expect("fusion lock poisoned").insert(id);
    }
    pub fn end(&self, id: i64) {
        self.fusing.lock().expect("fusion lock poisoned").remove(&id);
    }
    /// 会话是否正在后台融合（前端据此展示"融合中"；当前由事件驱动，
    /// 查询入口保留供后续轮询/恢复场景，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn is_fusing(&self, id: i64) -> bool {
        self.fusing.lock().expect("fusion lock poisoned").contains(&id)
    }
}

/// 启动后台融合线程（会话停止后调用）。
///
/// @ai-context: Db/AppHandle 均为 Arc 可跨线程；字幕/ASR 段所有权随闭包转移；
///              失败保留原段（replace_segments 单事务回滚保证）。
/// @ai-context: 审查 P1 修复（TD-035）：spawn 失败必须清理 fusing 标记并告知前端，
///              否则标记永久残留（累积泄漏）且 UI 一直显示"融合中"。
#[allow(clippy::too_many_arguments)]
pub(crate) fn spawn_fusion(
    app: &tauri::AppHandle,
    db: &Db,
    session_id: i64,
    screen_worker: Option<JoinHandle<()>>,
    subtitle_segments: Arc<Mutex<Vec<SubtitleSegment>>>,
    asr_segments: Vec<TranscriptSegment>,
    fusion: FusionTracker,
) {
    fusion.begin(session_id);
    let _ = app.emit("session:fusing", session_id);
    let thread_tracker = fusion.clone();
    let fusion_db = db.clone();
    let fusion_app = app.clone();
    let spawn_result = std::thread::Builder::new()
        .name("entropy-fusion".into())
        .spawn(move || {
            // 等待采样线程退出（有界 5s，超时 detach），再读取字幕段用于融合——
            // worker 退出前的 voter.flush 保证末句字幕已定稿入缓存
            if let Some(worker) = screen_worker {
                let deadline = Instant::now() + Duration::from_secs(5);
                while !worker.is_finished() && Instant::now() < deadline {
                    std::thread::sleep(Duration::from_millis(100));
                }
                if !worker.is_finished() {
                    eprintln!("[LiveSession] 屏幕采样线程 5s 内未退出，已 detach");
                }
            }
            let subtitle_segments =
                subtitle_segments.lock().expect("subtitle segments lock poisoned").clone();
            let result = crate::live_keyframes::rewrite_with_fusion(
                &fusion_db,
                session_id,
                &subtitle_segments,
                &asr_segments,
            );
            thread_tracker.end(session_id);
            match result {
                Ok(()) => {
                    // REQ-282（v0.19.6）：融合完成即首句升级——融合段为最终
                    // 时间轴，此时取首个可用句最稳；仅 kind=source 生效，失败
                    // 静默（标题保持来源名，不阻断 fused 事件）；升级成功广播
                    // 会话域变更（列表/详情即时可见新标题）。
                    match fusion_db.auto_title_upgrade(session_id) {
                        Ok(true) => crate::notify::emit_changed(
                            &fusion_app,
                            crate::notify::DataDomain::Sessions,
                        ),
                        Ok(false) => {}
                        Err(e) => eprintln!("[LiveSession] 会话标题首句升级失败: {}", e),
                    }
                    let _ = fusion_app.emit("session:fused", session_id);
                }
                Err(e) => {
                    // 融合失败保留原段，前端提示（详情页仍可读原始轴）
                    if let Err(t) = fusion_db.auto_title_upgrade(session_id) {
                        eprintln!("[LiveSession] 会话标题首句升级失败（融合失败路径）: {}", t);
                    }
                    let _ = fusion_app.emit(
                        "session:fusion-failed",
                        format!("融合失败（原始段已保留）: {}", e),
                    );
                }
            }
        });
    if let Err(e) = spawn_result {
        // spawn 失败：清理标记 + 推送失败事件（原始段仍在库中，不丢数据）
        fusion.end(session_id);
        let _ = app.emit(
            "session:fusion-failed",
            format!("融合线程启动失败（原始段已保留）: {}", e),
        );
    }
}
