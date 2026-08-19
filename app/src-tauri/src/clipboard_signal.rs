//! 剪贴板信号（REQ-104 / v0.7.0 M1：课中复制内容=高置信信号 → 热词候选/产物）。
//!
//! @ai-context: 技能自学场景中"课上复制"是用户主动行为——复制的内容（术语/关键词/示例）
//!              置信度高于被动 OCR/ASR（"复制即标记"）。Tauri 2 无内置剪贴板事件，
//!              本模块以 2s 间隔轮询系统剪贴板（arboard，Windows 走 clipboard-win）：
//!              文本变化且非空 → record_copy 记一条信号；会话期间监听由
//!              commands_live start/stop 控制（Arc<AtomicBool> stop 标志）。
//! @ai-context: **隐私红线（REQ-104 验收口径）**：原始剪贴板内容绝不持久化——只存前
//!              PREVIEW_MAX_CHARS（30）字符预览供消费；全文仅瞬时用于变化检测哈希
//!              （FNV-1a，不可逆、非加密用途），哈希不入库、不落盘。
//! @ai-context: REQ-132（P9 剪贴板图片直贴）随本监听顺带：剪贴板图片变化 → RGBA→BGRA
//!              转换后走 image_store::save_frame 落库会话图集（复用其 aHash/dHash 去重
//!              + 每会话预算），本模块再以字节哈希（last_image_hash）防同图重复落库；
//!              落库后 emit `session:clipboard-image`（前端图集自动刷新）。
//! @ai-context: 信号为内存态（会话结束随进程消失，不写 DB；REQ-108 事件表为后续版本）。
//! @ai-context: arboard 被剪贴板占用（其他进程持有）时 get_text/get_image 返回 Err——
//!              静默跳过本轮继续（轮询语义，非错误）。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use tauri::Emitter;

/// 信号文本预览上限（字符数）。隐私红线：完整剪贴板内容只存在于轮询瞬间的局部变量，
/// 存储/消费路径一律只保留前 30 字符。
pub const PREVIEW_MAX_CHARS: usize = 30;
/// 信号内存队列上限（超出丢弃最旧；内存态，不落盘）。
const MAX_SIGNALS: usize = 50;
/// 剪贴板轮询间隔（2s；同时是停止响应延迟的上界）。
const POLL_INTERVAL: Duration = Duration::from_secs(2);
/// 停止检查分片（每片检查一次 stop，停止响应及时）。
const SLEEP_SLICE: Duration = Duration::from_millis(100);

/// 单条剪贴板复制信号。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClipboardSignal {
    pub session_id: i64,
    /// 内容预览（≤30 字符）——原始剪贴板内容不持久化（隐私红线）。
    pub text_preview: String,
    /// 会话内时间戳（会话纪元毫秒，与屏幕帧时间戳同域）。
    pub timestamp_ms: u64,
}

/// 剪贴板信号存储（内存态；AppState 持有，跨命令共享）。
#[derive(Debug, Default)]
pub struct ClipboardSignalStore {
    pub recent_signals: Mutex<Vec<ClipboardSignal>>,
}

impl ClipboardSignalStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// 清空全部信号（新会话监听启动时调用——信号语义=最近一次会话的课中复制）。
    pub fn clear(&self) {
        if let Ok(mut v) = self.recent_signals.lock() {
            v.clear();
        }
    }

    /// 记录一条复制信号（内存入队；超 MAX_SIGNALS 丢弃最旧；空白不构成信号）。
    pub fn record_copy(&self, session_id: i64, text: &str, now_ms: u64) {
        if text.trim().is_empty() {
            return; // 空白/空剪贴板轮询命中不构成信号（防御）
        }
        let text_preview = preview(text);
        if let Ok(mut v) = self.recent_signals.lock() {
            v.push(ClipboardSignal { session_id, text_preview, timestamp_ms: now_ms });
            if v.len() > MAX_SIGNALS {
                let overflow = v.len() - MAX_SIGNALS;
                v.drain(0..overflow);
            }
        }
    }

    /// 取某会话的信号文本（按入队顺序；供热词候选/产物消费）。
    ///
    /// @ai-context: REQ-104 规定的最小公共 API（产物接入与 REQ-108 事件表为后续
    ///              版本消费方）；当前消费走 all_signal_texts（建议命令无会话参数），
    ///              故标记 allow(dead_code) 防误报，接入时移除。
    #[allow(dead_code)]
    pub fn signal_texts(&self, session_id: i64) -> Vec<String> {
        self.recent_signals
            .lock()
            .map(|v| {
                v.iter()
                    .filter(|s| s.session_id == session_id)
                    .map(|s| s.text_preview.clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// 全部会话信号文本（热词候选消费：信号为内存态且总量小，
    /// 跨会话合并只影响"提名人"列表，不落库）。
    pub fn all_signal_texts(&self) -> Vec<String> {
        self.recent_signals
            .lock()
            .map(|v| v.iter().map(|s| s.text_preview.clone()).collect())
            .unwrap_or_default()
    }
}

/// 预览截断（纯函数）：前 PREVIEW_MAX_CHARS 个字符（按 char 边界，不拆多字节字符）。
pub fn preview(text: &str) -> String {
    text.chars().take(PREVIEW_MAX_CHARS).collect()
}

/// 内容哈希（纯函数）：FNV-1a 64 位——仅用于剪贴板内容变化检测
/// （不可逆，原始内容不落盘；非加密用途，碰撞概率对"变化检测"足够低）。
pub fn content_hash(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// RGBA8 → BGRA8（纯函数）：arboard `get_image` 返回 RGBA（R 在前），而
/// image_store::save_frame 期望 BGRA（屏幕捕获格式）——不转换会红蓝互换。
/// 尺寸与字节数不匹配返回 None（防御）。
pub fn rgba_to_bgra(rgba: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let expected = width as usize * height as usize * 4;
    if width == 0 || height == 0 || rgba.len() != expected {
        return None;
    }
    let mut out = Vec::with_capacity(expected);
    for px in rgba.chunks_exact(4) {
        out.extend_from_slice(&[px[2], px[1], px[0], px[3]]);
    }
    Some(out)
}

/// 剪贴板监听线程句柄（AppState 持有；stop 置位后线程在一个轮询周期内退出）。
pub struct ClipboardMonitorHandle {
    pub stop: Arc<AtomicBool>,
    /// JoinHandle 仅作生命周期持有（drop 即 detach）；线程退出由 stop 标志驱动，
    /// 停止时不 join（避免阻塞 IPC）——字段当前只写不读，标记 allow 防误报。
    #[allow(dead_code)]
    pub thread: JoinHandle<()>,
}

/// 启动剪贴板监听线程（REQ-104/132）。
///
/// @param app - 事件推送（session:clipboard-image 图集刷新）
/// @param session_id - 信号归属会话
/// @param epoch - 会话纪元（与屏幕帧时间戳同域；图片文件名防跨源冲突）
/// @param stop - 停止标志（stop_live_session 置位；线程分片休眠及时退出）
/// @param store - 共享信号存储（跨命令消费）
/// @param image_dir - 会话图片目录（data_dir/session-images/<id>；REQ-132 直贴落库）
/// @param db - 会话 DB（REQ-108 事件表写入——审查补接线：Clipboard 事件
///             设计文档承诺"record_copy 顺带写"，原实现仅存内存信号）
pub fn spawn_clipboard_monitor(
    app: tauri::AppHandle,
    session_id: i64,
    epoch: Instant,
    stop: Arc<AtomicBool>,
    store: Arc<ClipboardSignalStore>,
    image_dir: std::path::PathBuf,
    db: crate::db::Db,
) -> JoinHandle<()> {
    std::thread::Builder::new()
        .name("entropy-clipboard-monitor".into())
        .spawn(move || monitor_loop(app, session_id, epoch, stop, store, image_dir, db))
        .expect("启动剪贴板监听线程失败")
}

/// 监听主循环：2s 轮询文本+图片；剪贴板被占用（arboard Err）静默跳过继续。
fn monitor_loop(
    app: tauri::AppHandle,
    session_id: i64,
    epoch: Instant,
    stop: Arc<AtomicBool>,
    store: Arc<ClipboardSignalStore>,
    image_dir: std::path::PathBuf,
    db: crate::db::Db,
) {
    let mut last_text_hash: Option<u64> = None;
    let mut last_image_hash: Option<u64> = None;
    // 图片库：monitor 独立实例（复用 save_frame 的 aHash/dHash 去重 + 预算）；
    // 预算为 0 时从磁盘重建刷新计数（屏幕 worker 可能已并行存图）
    let mut image_store: Option<crate::image_store::SessionImageStore> =
        crate::image_store::SessionImageStore::new(image_dir.clone()).ok();
    while !stop.load(Ordering::SeqCst) {
        let now_ms = epoch.elapsed().as_millis() as u64;
        let mut clipboard = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(_) => {
                sleep_interval(&stop); // 剪贴板初始化失败（罕见）→ 跳过本轮
                continue;
            }
        };
        // 1) 文本信号（REQ-104）：变化且非空 → record_copy + 事件表（REQ-108）
        if let Ok(text) = clipboard.get_text() {
            if !text.trim().is_empty() {
                let h = content_hash(text.as_bytes());
                if last_text_hash != Some(h) {
                    last_text_hash = Some(h);
                    store.record_copy(session_id, &text, now_ms);
                    // REQ-108 补接线（审查发现）：Clipboard 事件落库——
                    // 只存 30 字预览（隐私红线，与 record_copy 同口径）
                    let _ = db.add_event(&crate::session_events::NewSessionEvent {
                        session_id,
                        kind: crate::session_events::EventKind::Clipboard,
                        timestamp_ms: now_ms,
                        payload: serde_json::json!({
                            "preview": preview(&text),
                        }),
                    });
                }
            }
        }
        // 2) 图片信号（REQ-132）：内容变化 → 转换 BGRA 落库图集（去重+预算在 image_store）
        if let Ok(img) = clipboard.get_image() {
            let h = content_hash(img.bytes.as_ref());
            if last_image_hash != Some(h) {
                last_image_hash = Some(h);
                save_clipboard_image(&app, &mut image_store, &img, now_ms, &image_dir);
            }
        }
        sleep_interval(&stop);
    }
}

/// 剪贴板图片落库（REQ-132）：RGBA→BGRA → save_frame（full/<ts>.webp）。
///
/// @ai-context: 时间戳与会话纪元同域（与屏幕帧文件名不冲突）；极端同 ms 场景
///              自增偏移防覆盖（覆盖会导致已存帧丢失）。预算耗尽 → 静默丢弃。
fn save_clipboard_image(
    app: &tauri::AppHandle,
    image_store: &mut Option<crate::image_store::SessionImageStore>,
    img: &arboard::ImageData<'_>,
    now_ms: u64,
    image_dir: &std::path::Path,
) {
    let width = img.width as u32;
    let height = img.height as u32;
    let Some(bgra) = rgba_to_bgra(img.bytes.as_ref(), width, height) else {
        return; // 数据尺寸不匹配（防御，arboard 不应产出）
    };
    // 预算刷新：剩余 0 时从磁盘重建计数（屏幕 worker 并行存图使内存计数过时）
    if image_store.as_ref().is_some_and(|s| s.remaining_budget() == Some(0)) {
        *image_store = crate::image_store::SessionImageStore::new(image_dir.to_path_buf()).ok();
    }
    let Some(store) = image_store.as_mut() else { return };
    if store.remaining_budget() == Some(0) {
        return; // 预算耗尽 → 丢弃（REQ-132：预算生效）
    }
    let mut ts = now_ms;
    while image_dir.join("full").join(format!("{}.webp", ts)).exists() {
        ts += 1; // 防覆盖：同 ms 帧已存在则偏移
    }
    match store.save_frame(ts, &bgra, width, height) {
        Ok(rel) => {
            let _ = app.emit("session:clipboard-image", rel);
        }
        Err(e) => eprintln!("[Clipboard] 剪贴板图片落库失败: {}", e),
    }
}

/// 分片休眠（每片检查 stop——停止响应及时；总时长 POLL_INTERVAL）。
fn sleep_interval(stop: &AtomicBool) {
    let mut elapsed = Duration::ZERO;
    while elapsed < POLL_INTERVAL && !stop.load(Ordering::SeqCst) {
        std::thread::sleep(SLEEP_SLICE);
        elapsed += SLEEP_SLICE;
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "clipboard_signal_tests.rs"]
mod tests;
