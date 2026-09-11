//! 会话屏卡图装载（拆分自 ai_refine_task.rs；AGENTS.md §3 单文件 ≤300 行）。
//!
//! @ai-context: 仅 vision_refine_enabled 开启时调用；目录缺失/解码失败 → 跳过（空
//!              列表 → 精修纯文本，现有行为零变化——画面理解是可选增强，绝不阻塞
//!              精修主链路）。图片库为 data_dir/session-images/<id> 下平铺
//!              `{timestamp_ms}.webp`（审查修复：旧过滤器漏 webp 导致取不到图）。
//! @ai-context: 数量上限 MAX_IMAGES=3：按时间戳**数值**倒序取最近 3 张（字典序对
//!              变长数字不成立）；长边 >1280 按比例缩放（长图缩放不裁剪，保完整）。
//! @ai-context: 隐私红线（ADR-010 扩展）：图片仅随精修切片请求上云，不作独立提取
//!              命令；base64 不入轨迹库。

use base64::Engine;

/// v0.12.0 M5：装载会话屏卡图（≤1280px 控 token → WebP/PNG base64 data URI）。
///
/// @ai-context: 仅 vision_refine_enabled 开启时调用；目录缺失/解码失败 → 跳过
///              （空列表 → 精修纯文本，现有行为零变化——画面理解是可选增强，
///              不是硬依赖，绝不阻塞精修主链路）。图片库为
///              data_dir/session-images/<id> 下平铺 `{timestamp_ms}.webp`（存图
///              口径——审查修复：旧过滤器漏 webp 导致取不到图）。
/// @ai-context: 数量上限 MAX_IMAGES=3（审查修复）：会话屏卡可数百张，全量装载 →
///              每切片请求携带全部图 → 内存/带宽/token 失控；按时间戳取最近 3 张
///              （画面要点随精修的最新上下文，时序语义正确）。
/// @ai-context: 隐私红线（ADR-010 扩展）：图片仅随精修切片请求上云，不作独立
///              提取命令；缩放控 token（长图缩放不裁剪，保画面完整）。
pub(super) fn load_session_vision_images(data_dir: &std::path::Path, session_id: i64) -> Vec<String> {
    const MAX_EDGE: u32 = 1280;
    const MAX_IMAGES: usize = 3;
    let dir = data_dir.join("session-images").join(session_id.to_string());
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    // 文件名 = 时间戳（{ts}.webp）→ 按数值排序取最近 N 张（字典序对变长数字不成立，
    // 须解析数值——"1000" 字典序 < "999"）
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if !p.is_file() {
                return None;
            }
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            if ext != "webp" && ext != "png" && ext != "jpg" && ext != "jpeg" {
                return None;
            }
            Some(p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
        })
        .collect();
    names.sort_by_key(|n| {
        n.split('.').next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)
    });
    names.reverse();
    names.truncate(MAX_IMAGES);
    let mut out = Vec::new();
    for name in names {
        let path = dir.join(&name);
        let Ok(frame) = image::open(&path) else { continue };
        // 长边 >1280 按比例缩放（保比例；小图原样——控 token 同时不糊画面）。
        // resize 返回 RgbaImage，与 to_rgba8() 同型。
        let (w, h) = (frame.width(), frame.height());
        let max_edge = w.max(h);
        let rgb = if max_edge > MAX_EDGE {
            let scale = MAX_EDGE as f32 / max_edge as f32;
            let nw = (w as f32 * scale).round().max(1.0) as u32;
            let nh = (h as f32 * scale).round().max(1.0) as u32;
            image::imageops::resize(&frame, nw, nh, image::imageops::FilterType::Triangle)
        } else {
            frame.to_rgba8()
        };
        let mut buf = std::io::Cursor::new(Vec::new());
        let encoder = image::codecs::png::PngEncoder::new(&mut buf);
        if rgb.write_with_encoder(encoder).is_err() {
            continue;
        }
        let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
        out.push(format!("data:image/png;base64,{}", b64));
    }
    out
}
