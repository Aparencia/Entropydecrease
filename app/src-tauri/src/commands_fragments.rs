//! 碎片捕获与功能开关 commands（v0.11.1；feed 进料口系统层）。
//!
//! @ai-context: v4 §11.3 裁决——feed 能力功能开关默认关：capture_fragment
//!              后端二次校验开关（不信前端隐藏）；碎片 DomainTag 自动归组
//!              复用 detect_domain 纯函数（领域粒度=契约一，拒绝大类）。
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；
//!              图片解码验证用 image crate（白名单格式，防任意字节落盘）。

use tauri::State;

use crate::commands::AppState;
use crate::db_fragments::NewFragment;
use crate::types::{Fragment, NewNoteGroup};
use crate::video_profile_domain::{detect_domain, DomainSignals};

/// 碎片文本最大长度（防超大 payload 拖垮 IPC/DB；几句话的碎片远用不到）。
const FRAGMENT_TEXT_MAX: usize = 2000;
/// 碎片图片最大字节数（示范画面截图级；超限拒绝可诊断）。
const FRAGMENT_IMAGE_MAX_BYTES: usize = 10 * 1024 * 1024;
/// 碎片列表单次上限（防无界查询）。
const FRAGMENT_LIST_LIMIT_MAX: usize = 500;

/// 读取功能开关集（前端据此显隐 feed 捕获面）。
#[tauri::command]
pub fn get_feature_flags(state: State<'_, AppState>) -> Result<crate::feature_flags::FeatureFlags, String> {
    let guard = state.feature_flags.lock().map_err(|e| format!("开关锁失败: {}", e))?;
    Ok(guard.clone())
}

/// 设置功能开关（白名单在 FeatureFlags::set 内；持久化失败回滚内存态）。
#[tauri::command]
pub fn set_feature_flag(
    state: State<'_, AppState>,
    name: String,
    value: bool,
) -> Result<bool, String> {
    let mut guard = state.feature_flags.lock().map_err(|e| format!("开关锁失败: {}", e))?;
    let mut next = guard.clone();
    if !next.set(&name, value) {
        return Err(format!("未知功能开关: {}", name));
    }
    // 先落盘再更新内存态（落盘失败不留半态）
    next.save(&state.feature_flags_path).map_err(|e| format!("开关持久化失败: {}", e))?;
    *guard = next;
    Ok(value)
}

/// 碎片快速捕获（feed 进料口；文本 + 可选 base64 图片）。
///
/// @ai-context: 流程——开关准入 → 文本/图片至少一项 → 图片解码验证落盘 →
///              DomainTag 检测 → feed 主题组查/建 → 碎片落库。
///              图片失败不阻断文本捕获（诚实降级：纯文本碎片）。
/// @ai-context: 审查修复（2026-08-22）：① 图片改 base64 传输——原 Vec<u8>
///              数字数组序列化 10MB 图≈35MB JSON，剪贴板捕获卡顿；② 纯图片
///              捕获不再被空文本检查拒绝（text 占位"（图片碎片）"保列表可读）。
#[tauri::command]
pub async fn capture_fragment(
    state: State<'_, AppState>,
    text: String,
    image_b64: Option<String>,
    source: Option<String>,
) -> Result<Fragment, String> {
    // 开关准入（后端不信前端隐藏——v4 §11.3 默认关纪律）
    {
        let guard = state.feature_flags.lock().map_err(|e| format!("开关锁失败: {}", e))?;
        if !guard.feed_capture {
            return Err("碎片捕获未启用（请在设置中开启 feed 捕获开关）".to_string());
        }
    }
    let text: String = text.trim().chars().take(FRAGMENT_TEXT_MAX).collect();
    let has_image = image_b64.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false);
    if text.is_empty() && !has_image {
        return Err("碎片内容不能为空（文本或图片至少一项）".to_string());
    }
    let source = match source.as_deref() {
        Some("clipboard") => "clipboard".to_string(),
        _ => "manual".to_string(),
    };
    // 图片：base64 解码 + 解码器验证 + 统一转 PNG 落盘（白名单格式由解码器把关）
    let image_path = match image_b64 {
        Some(b64) if !b64.trim().is_empty() => {
            match decode_and_save_fragment_image(&state.data_dir, &b64) {
                Ok(rel) => Some(rel),
                Err(e) => {
                    // 图片失败不阻断文本捕获（降级为纯文本碎片，留日志线索）
                    eprintln!("[fragments] 图片落盘失败（降级纯文本碎片）: {e}");
                    None
                }
            }
        }
        _ => None,
    };
    // 纯图片碎片：text 占位保列表/卡片可读（NOT NULL 约束 + UI 诚实呈现）
    let text = if text.is_empty() { "（图片碎片）".to_string() } else { text };
    // DomainTag 自动归组（detect_domain 标题词路径——碎片文本即判据源）
    let detection = detect_domain(&DomainSignals {
        title: Some(text.clone()),
        ..Default::default()
    });
    let (domain_tag, group_id) = match detection.kind {
        Some(kind) => {
            let tag = kind.as_str().to_string();
            let gid = resolve_feed_topic_group(&state.db, &tag, kind.label())?;
            (Some(tag), Some(gid))
        }
        None => (None, None), // 未命中 → 无组（结算面兜底归组，不硬塞大类）
    };
    let fragment = state
        .db
        .create_fragment(&NewFragment {
            text,
            image_path,
            domain_tag,
            group_id,
            source,
        })
        .map_err(|e| e.to_string())?;
    Ok(fragment)
}

/// 列出碎片（status 过滤 + 数量上限）。
#[tauri::command]
pub fn list_fragments(
    state: State<'_, AppState>,
    status: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Fragment>, String> {
    let status = status.as_deref().filter(|s| !s.trim().is_empty());
    if let Some(s) = status {
        if s != "active" && s != "archived" {
            return Err(format!("不支持的碎片状态: {}（支持: active/archived）", s));
        }
    }
    let limit = limit.unwrap_or(200).min(FRAGMENT_LIST_LIMIT_MAX);
    state.db.list_fragments(status, limit).map_err(|e| e.to_string())
}

/// 组内碎片列表（feed 组详情消费）。
#[tauri::command]
pub fn list_group_fragments(state: State<'_, AppState>, group_id: i64) -> Result<Vec<Fragment>, String> {
    if group_id <= 0 {
        return Err("无效的组 id".to_string());
    }
    state.db.list_fragments_by_group(group_id).map_err(|e| e.to_string())
}

/// base64 解码 + 解码验证并落盘碎片图片（返回 fragments/ 下相对路径）。
///
/// @ai-context: image::load_from_memory 把关格式白名单（png/jpeg/webp/gif/bmp…
///              解码器支持集）；统一转 PNG 存储（前端展示口径单一）；
///              base64 解码失败前置拒绝（可诊断错误，不落盘垃圾）。
fn decode_and_save_fragment_image(data_dir: &std::path::Path, b64: &str) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("图片 base64 解码失败: {}", e))?;
    save_fragment_image(data_dir, &bytes)
}

/// 解码验证并落盘碎片图片（字节入口；返回 fragments/ 下相对路径）。
///
/// @ai-context: 超限字节数前置拒绝（解码前，省 CPU）。
fn save_fragment_image(data_dir: &std::path::Path, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > FRAGMENT_IMAGE_MAX_BYTES {
        return Err(format!("图片超限（上限 {} MB）", FRAGMENT_IMAGE_MAX_BYTES / 1024 / 1024));
    }
    let img = image::load_from_memory(bytes).map_err(|e| format!("图片解码失败: {}", e))?;
    let dir = data_dir.join("fragments");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建碎片图目录失败: {}", e))?;
    // 文件名 = 毫秒时间戳 + 随机后缀（防同毫秒碰撞）
    let name = format!(
        "{}-{}.png",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        rand_suffix()
    );
    let path = dir.join(&name);
    img.save(&path).map_err(|e| format!("图片保存失败: {}", e))?;
    Ok(format!("fragments/{}", name))
}

/// 文件名随机后缀（4 位十六进制——无 rand crate 依赖，系统熵足够防碰撞）。
fn rand_suffix() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("{:04x}", now & 0xFFFF)
}

/// feed 主题组查/建（契约一：同领域同地形唯一）。
fn resolve_feed_topic_group(
    db: &crate::db::Db,
    domain_tag: &str,
    label: &str,
) -> Result<i64, String> {
    if let Some(existing) = db.find_topic_group(domain_tag, "feed").map_err(|e| e.to_string())? {
        return Ok(existing.id);
    }
    let group = db
        .create_group(&NewNoteGroup {
            name: label.to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some(domain_tag.to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: Some(
                serde_json::json!({"action":"topic","reasons":["碎片 DomainTag 自动归组"]}).to_string(),
            ),
        })
        .map_err(|e| e.to_string())?;
    Ok(group.id)
}
