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
use crate::types::{Fragment, NewNoteGroup, Note};
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
    require_feed_enabled(&state)?;
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

/// 移动碎片到组（None=移出组；用户纠错/重新归组——REQ-201 消费闭环）。
///
/// @ai-context: 与 capture_fragment 同开关准入（feed 能力默认关纪律对称——
///              后端不信前端隐藏）；目标组存在性校验（不写孤儿引用）。
#[tauri::command]
pub fn update_fragment_group(
    state: State<'_, AppState>,
    fragment_id: i64,
    group_id: Option<i64>,
) -> Result<bool, String> {
    require_feed_enabled(&state)?;
    if fragment_id <= 0 {
        return Err("无效的碎片 id".to_string());
    }
    if state.db.get_fragment(fragment_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("碎片不存在: {}", fragment_id));
    }
    if let Some(gid) = group_id {
        if gid <= 0 {
            return Err("无效的组 id".to_string());
        }
        if state.db.get_group(gid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("笔记组不存在: {}", gid));
        }
    }
    state
        .db
        .update_fragment_group(fragment_id, group_id)
        .map_err(|e| e.to_string())
}

/// 删除碎片（REQ-201 用户主动删除——真删；绑定卡自动解绑保留）。
///
/// @ai-context: 开关准入同 capture_fragment（feed 能力对称纪律）；存在性校验
///              前置（删不存在的碎片返回明确错误而非静默 false）。
#[tauri::command]
pub fn delete_fragment(state: State<'_, AppState>, fragment_id: i64) -> Result<bool, String> {
    require_feed_enabled(&state)?;
    if fragment_id <= 0 {
        return Err("无效的碎片 id".to_string());
    }
    if state.db.get_fragment(fragment_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("碎片不存在: {}", fragment_id));
    }
    state.db.delete_fragment(fragment_id).map_err(|e| e.to_string())
}

/// 碎片升为笔记（v0.12.2 收件箱动线：原料→沉淀；REQ-201 补升级出口）。
///
/// @ai-context: 事务在数据层（建笔记+删碎片原子——promote_fragment_to_note）；
///              本层只做入参校验：标题必填（前端预填首句可改，后端拒绝空串）、
///              组存在性校验、开关准入（升笔记是碎片生命周期操作，feed 能力
///              对称纪律）。图随碎片搬运进 notes-images/（失败降级纯文本）。
#[tauri::command]
pub fn promote_fragment_to_note(
    state: State<'_, AppState>,
    fragment_id: i64,
    title: String,
    group_id: Option<i64>,
) -> Result<Note, String> {
    require_feed_enabled(&state)?;
    if fragment_id <= 0 {
        return Err("无效的碎片 id".to_string());
    }
    // 标题必填（二元论裁决：升笔记需要标题——前端预填首句，后端兜底拒绝）
    let title_trim = title.trim();
    if title_trim.is_empty() {
        return Err("笔记标题不能为空".to_string());
    }
    let title = crate::commands::normalize_title(title, "碎片笔记");
    if state.db.get_fragment(fragment_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("碎片不存在: {}", fragment_id));
    }
    if let Some(gid) = group_id {
        if gid <= 0 {
            return Err("无效的组 id".to_string());
        }
        if state.db.get_group(gid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("笔记组不存在: {}", gid));
        }
    }
    state
        .db
        .promote_fragment_to_note(&state.data_dir, fragment_id, &title, group_id)
        .map_err(|e| e.to_string())
}

/// 碎片图片 → 本地绝对路径（前端 convertFileSrc 消费；REQ-201 缩略图）。
///
/// @ai-context: resolve 先例同 resolve_note_image——WebView 不能直接读本地文件；
///              本命令从库读 image_path 而非信任前端传参（防任意路径穿越），
///              只放行 fragments/ 前缀；无图 → None（UI 降级文本预览）。
#[tauri::command]
pub fn resolve_fragment_image(
    state: State<'_, AppState>,
    fragment_id: i64,
) -> Result<Option<String>, String> {
    // 开关准入（与 delete/移组对称——feed 能力默认关纪律，防绕过 UI 直调）
    require_feed_enabled(&state)?;
    if fragment_id <= 0 {
        return Err("无效的碎片 id".to_string());
    }
    let frag = state
        .db
        .get_fragment(fragment_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("碎片不存在: {}", fragment_id))?;
    let Some(rel) = frag.image_path else { return Ok(None) };
    // 只放行 fragments/ 前缀 + 防穿越（落盘时的白名单格式已由 image crate 把关）
    let rel_trim = rel.trim_start_matches(['/', '\\']);
    if !rel_trim.starts_with("fragments/") || rel_trim.split(['/', '\\']).any(|seg| seg == "..") {
        eprintln!("[fragments] 异常图片路径被拒: {}", rel);
        return Ok(None);
    }
    let abs = state.data_dir.join(rel_trim);
    Ok(Some(abs.to_string_lossy().into_owned()))
}

/// feed 能力开关准入（capture/delete/升笔记共用——后端不信前端隐藏）。
/// @ai-context: pub(crate) 供 commands_flashcards::promote_fragment_to_card 复用
///              （碎片生命周期操作对称纪律）。
pub(crate) fn require_feed_enabled(state: &AppState) -> Result<(), String> {
    let guard = state
        .feature_flags
        .lock()
        .map_err(|e| format!("开关锁失败: {}", e))?;
    if !guard.feed_capture {
        return Err("feed 能力未启用（请在设置中开启 feed 捕获开关）".to_string());
    }
    Ok(())
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
