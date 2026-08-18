//! 词表管理 command（REQ-040 / v0.4.0 M5：热词/替换词闭环 + 课件预热）。
//!
//! @ai-context: 纯本地词表（JSON，应用数据目录）——CRUD 命令 + 前端词表管理 UI；
//!              热词注入流式 ASR（端点重建流生效）、替换词做 OCR 后纠错（worker 内）。
//! @ai-context: 课件预热最小版（A4）：支持 .pptx（zip+xml 文本层提取，无 OCR）与
//!              .txt/.md；.pdf 文本层提取留 v0.5 完整版（返回明确提示不阻断）。
//! @ai-context: 建议/候选仅为"提名人"，加入需用户确认（OCR 误识别词不得自动进热词）。

use tauri::State;

use crate::commands::AppState;
use crate::vocab::{extract_candidates, suggest_from_ocr_texts, ReplacePair};

/// 课件文本提取大小上限（50MB，防御大文件拖垮内存）。
const COURSEWARE_MAX_BYTES: u64 = 50 * 1024 * 1024;

/// 课件候选词上限。
const COURSEWARE_MAX_CANDIDATES: usize = 50;

/// OCR 建议最小出现次数。
const OCR_SUGGEST_MIN_COUNT: usize = 3;

/// OCR 建议来源会话数上限（最近 N 个会话的 ocr_blocks）。
const OCR_SUGGEST_SESSIONS: i64 = 3;

/// 词表全量（前端管理 UI 数据源）。
#[derive(Debug, Clone, serde::Serialize)]
pub struct VocabState {
    pub hotwords: Vec<String>,
    pub replacements: Vec<ReplacePair>,
}

/// 查询词表全量。
#[tauri::command]
pub fn vocab_get(state: State<'_, AppState>) -> Result<VocabState, String> {
    let store = state.vocab.lock().map_err(|_| "词表锁中毒".to_string())?;
    Ok(VocabState { hotwords: store.hotwords.clone(), replacements: store.replacements.clone() })
}

/// 加入热词（批量，去重；返回新增数）。
#[tauri::command]
pub fn vocab_add_hotwords(state: State<'_, AppState>, words: Vec<String>) -> Result<usize, String> {
    // 入参防御：单词长度上限 + 数量上限（防恶意大载荷）
    let words: Vec<String> = words
        .into_iter()
        .take(200)
        .map(|w| w.chars().take(50).collect())
        .collect();
    let mut store = state.vocab.lock().map_err(|_| "词表锁中毒".to_string())?;
    let added = store.add_hotwords(&words);
    store.save(&state.vocab_path).map_err(|e| e.to_string())?;
    Ok(added)
}

/// 删除热词。
#[tauri::command]
pub fn vocab_remove_hotword(state: State<'_, AppState>, word: String) -> Result<(), String> {
    let mut store = state.vocab.lock().map_err(|_| "词表锁中毒".to_string())?;
    store.remove_hotword(word.trim());
    store.save(&state.vocab_path).map_err(|e| e.to_string())
}

/// 加入替换词对（from → to；防空/防重复）。
#[tauri::command]
pub fn vocab_add_replacement(state: State<'_, AppState>, from: String, to: String) -> Result<(), String> {
    let mut store = state.vocab.lock().map_err(|_| "词表锁中毒".to_string())?;
    store.add_replacement(
        &from.chars().take(50).collect::<String>(),
        &to.chars().take(50).collect::<String>(),
    );
    store.save(&state.vocab_path).map_err(|e| e.to_string())
}

/// 删除替换词对（按 from）。
#[tauri::command]
pub fn vocab_remove_replacement(state: State<'_, AppState>, from: String) -> Result<(), String> {
    let mut store = state.vocab.lock().map_err(|_| "词表锁中毒".to_string())?;
    store.remove_replacement(from.trim());
    store.save(&state.vocab_path).map_err(|e| e.to_string())
}

/// 课件文本提取 → 候选热词（pptx/txt/md；pdf 明确提示留 v0.5）。
#[tauri::command]
pub fn vocab_extract_courseware(path: String) -> Result<Vec<String>, String> {
    let p = std::path::Path::new(&path);
    if !p.is_file() {
        return Err("文件不存在".to_string());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let text = match ext.as_str() {
        "pptx" => extract_pptx_text(p).map_err(|e| format!("PPTX 文本提取失败: {}", e))?,
        "txt" | "md" => {
            let meta = std::fs::metadata(p).map_err(|e| format!("读取文件失败: {}", e))?;
            if meta.len() > COURSEWARE_MAX_BYTES {
                return Err(format!("文件超过大小上限（{}MB）", COURSEWARE_MAX_BYTES / 1024 / 1024));
            }
            std::fs::read_to_string(p).map_err(|e| format!("读取文件失败: {}", e))?
        }
        "pdf" => return Err("PDF 文本提取为 v0.5 完整版；请用 .pptx/.txt/.md 导入".to_string()),
        other => return Err(format!("不支持的课件格式: .{}（支持 .pptx/.txt/.md）", other)),
    };
    Ok(extract_candidates(&text, COURSEWARE_MAX_CANDIDATES))
}

/// 最近会话 OCR 文本 → 高频词建议（用户确认后 vocab_add_hotwords 加入闭环）。
#[tauri::command]
pub fn vocab_suggest_from_ocr(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let texts = state
        .db
        .recent_ocr_texts(OCR_SUGGEST_SESSIONS)
        .map_err(|e| format!("读取 OCR 记录失败: {}", e))?;
    let refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    Ok(suggest_from_ocr_texts(&refs, OCR_SUGGEST_MIN_COUNT))
}

/// PPTX 文本层提取：zip 内 ppt/slides/slide*.xml 的 <a:t> 文本（无 OCR，纯规则）。
///
/// @ai-context: 防御：文件大小上限、zip 内路径仅匹配 slide*.xml、单文件大小上限；
///              提取失败（加密/损坏）返回 Err 不阻断。
fn extract_pptx_text(path: &std::path::Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
    let meta = file.metadata().map_err(|e| format!("读取元数据失败: {}", e))?;
    if meta.len() > COURSEWARE_MAX_BYTES {
        return Err(format!("文件超过大小上限（{}MB）", COURSEWARE_MAX_BYTES / 1024 / 1024));
    }
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("PPTX 不是有效 zip: {}", e))?;
    let mut out = String::new();
    let mut slide_count = 0usize;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("读取 zip 条目失败: {}", e))?;
        let name = entry.name().to_string();
        // 仅取幻灯片正文（slideN.xml），跳过备注/母版/媒体
        if !name.starts_with("ppt/slides/slide") || !name.ends_with(".xml") {
            continue;
        }
        slide_count += 1;
        if slide_count > 200 {
            break; // 防御：异常文件滑片爆炸
        }
        let mut buf = Vec::with_capacity(entry.size() as usize);
        std::io::Read::read_to_end(&mut entry, &mut buf)
            .map_err(|e| format!("读取 {} 失败: {}", name, e))?;
        if buf.len() > 10 * 1024 * 1024 {
            continue; // 单页过大跳过（防御）
        }
        let xml = String::from_utf8_lossy(&buf);
        // <a:t>...</a:t> 文本节点提取（PPTX 标准文本容器）
        for segment in xml.split("<a:t>").skip(1) {
            if let Some(end) = segment.find("</a:t>") {
                let text = &segment[..end];
                // XML 实体解码（最小集）
                let decoded = text
                    .replace("&amp;", "&")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&quot;", "\"")
                    .replace("&apos;", "'");
                out.push_str(decoded.trim());
                out.push('\n');
            }
        }
    }
    if slide_count == 0 {
        return Err("PPTX 未找到幻灯片正文（文件可能损坏或为旧版格式）".to_string());
    }
    Ok(out)
}
