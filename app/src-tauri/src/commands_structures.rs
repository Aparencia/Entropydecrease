//! 结构图命令层（REQ-182/183/184 / v0.7.7；v0.10.2 重构）：参考图集分析 / 手动框选 / 列表 / 删除。
//!
//! @ai-context: IPC 安全边界：全部入参校验（session_id>0、归一化坐标 0-1、
//!              最小尺寸）；文件访问限定会话图片目录（data_dir/session-images/<id>，
//!              AGENTS.md 安全红线）；事件 session:structures-updated 驱动前端图库刷新。
//! @ai-context: v0.10.2 起取消停止后自动触发——改为前端「分析参考图集」手动
//!              调用（capture_session_structures 直扫 full/ 参考帧 + 四层过滤）；
//!              去重幂等，重复分析不重复入库。

use tauri::Emitter;
use tauri::State;

use crate::commands::AppState;
use crate::db_structures::StructureImageRecord;
use crate::structure_capture::CaptureSummary;

/// 会话图片目录（与 commands_images 同约定）。
fn session_images_dir(data_dir: &std::path::Path, session_id: i64) -> std::path::PathBuf {
    data_dir.join("session-images").join(session_id.to_string())
}

/// 批量捕获结构图（图库「分析参考图集」触发；v0.10.2 起不再自动触发；幂等）。
#[tauri::command]
pub async fn capture_session_structures(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<CaptureSummary, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let state: AppState = (*state).clone();
    let summary = tauri::async_runtime::spawn_blocking(move || {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        crate::structure_capture::capture_session_structures(
            &state.db,
            &state.data_dir,
            session_id,
            now,
        )
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
    .map_err(|e| e.to_string())?;
    // 图库刷新事件（前端 ImageGallery 监听）
    let _ = state.app.emit("session:structures-updated", &summary);
    Ok(summary)
}

/// 手动框选截取（REQ-184）：屏卡全帧图归一化坐标 → 裁剪入库。
///
/// @ai-context: 入参归一化 0-1（前端框选与图同坐标系）；像素换算按 image_ref
///              解码帧的宽高；越界钳制；<32×32 拒绝（误触防护）；原样裁剪
///              （不做白边——用户意图优先）；手动不设预算上限。
/// @ai-context: 审查修复：屏定位改用 first_seen_ms（屏号对旧数据聚类屏不唯一
///              ——多聚类屏 screen_id 均为 NULL，按屏号匹配会错屏）。
#[tauri::command]
pub async fn capture_structure_manual(
    state: State<'_, AppState>,
    session_id: i64,
    first_seen_ms: u64,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
) -> Result<StructureImageRecord, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    // 归一化坐标校验（防负数/越界/空框）
    if !(0.0..=1.0).contains(&x) || !(0.0..=1.0).contains(&y) || !(0.0..=1.0).contains(&w) || !(0.0..=1.0).contains(&h) {
        return Err("框选坐标无效（须 0-1 归一化）".to_string());
    }
    let state: AppState = (*state).clone();
    tauri::async_runtime::spawn_blocking(move || {
        manual_capture_inner(&state, session_id, first_seen_ms, x, y, w, h)
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
}

/// 手动捕获核心（IO；独立函数便于单测）。
fn manual_capture_inner(
    state: &AppState,
    session_id: i64,
    first_seen_ms: u64,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
) -> std::result::Result<StructureImageRecord, String> {
    // ① 定位屏卡 image_ref（复用屏卡体系；按 first_seen 精确定位——聚类屏
    //    屏号不唯一；无图 → 明确错误，前端禁用按钮）
    // v0.12.0 M5 补完成：画面要点屏按会话类型分派（photo=OCR 屏；video=关键帧
    // 纯图屏）——框选截取入口与详情/预览同一分派，防屏卡定位错表
    let blocks = state.db.list_ocr_blocks(session_id).map_err(|e| e.to_string())?;
    let images_dir = session_images_dir(&state.data_dir, session_id);
    let kind = state
        .db
        .get_session(session_id)
        .map_err(|e| e.to_string())?
        .and_then(|s| s.kind);
    let screens = crate::screens::build_view_screens(kind.as_deref(), session_id, &blocks, Some(&images_dir));
    let screen = screens
        .iter()
        .find(|s| s.first_seen_ms == first_seen_ms)
        .ok_or_else(|| "未找到对应屏卡".to_string())?;
    let image_ref = screen
        .image_ref
        .clone()
        .ok_or_else(|| "该屏无图像，无法框选截取".to_string())?;
    // ② 解码全帧图
    let frame = image::open(images_dir.join(&image_ref))
        .map_err(|e| format!("屏图解码失败: {}", e))?
        .to_rgb8();
    let (fw, fh) = (frame.width(), frame.height());
    // ③ 归一化 → 像素坐标（钳制越界；最小尺寸拒绝）
    let px = |v: f32, dim: u32| (v * dim as f32).round().min(dim as f32) as u32;
    let (cx, cy) = (px(x, fw), px(y, fh));
    let (cw, ch) = (px(w, fw).min(fw - cx), px(h, fh).min(fh - cy));
    if cw < 32 || ch < 32 {
        return Err("框选区域无效（过小或超出画面边缘）".to_string());
    }
    let crop = image::imageops::crop_imm(&frame, cx, cy, cw, ch).to_image();
    // ④ 手动入库（不设预算/不去重）+ 记录
    let mut store =
        crate::structure_store::StructureImageStore::new(images_dir.clone()).map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let rel = store
        .save_manual(now, &crate::structure_capture::rgb_to_bgra(&crop), crop.width(), crop.height())
        .map_err(|e| e.to_string())?;
    let rec = StructureImageRecord {
        id: 0,
        session_id,
        screen_id: screen.screen_id,
        kind: "manual".to_string(),
        bbox: format!(r#"{{"x":{},"y":{},"w":{},"h":{}}}"#, cx, cy, cw, ch),
        source_ts_ms: screen.first_seen_ms,
        crop_path: rel,
        source: "manual".to_string(),
        created_at: now,
    };
    let id = crate::db_structures::insert_structure_image(&state.db, &rec).map_err(|e| e.to_string())?;
    let mut saved = rec;
    saved.id = id;
    let _ = state.app.emit("session:structures-updated", ());
    Ok(saved)
}

/// 会话结构图列表（图库数据源；按入库时间升序）。
#[tauri::command]
pub fn list_session_structure_images(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Vec<StructureImageRecord>, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    crate::db_structures::list_structure_images(&state.db, session_id).map_err(|e| e.to_string())
}

/// 删除结构图（记录驱动：先删文件后删记录——文件删除失败时记录保留可重试，
/// 避免记录已删而文件残留的不一致；审查修复）。
#[tauri::command]
pub fn delete_structure_image(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的记录 id".to_string());
    }
    let rec = crate::db_structures::get_structure_image(&state.db, id)
        .map_err(|e| e.to_string())?;
    if let Some(r) = rec {
        let images_dir = session_images_dir(&state.data_dir, r.session_id);
        let store = crate::structure_store::StructureImageStore::new(images_dir)
            .map_err(|e| e.to_string())?;
        store.delete_image(&r.crop_path).map_err(|e| e.to_string())?;
        crate::db_structures::delete_structure_image(&state.db, id)
            .map_err(|e| e.to_string())?;
    }
    let _ = state.app.emit("session:structures-updated", ());
    Ok(true)
}
