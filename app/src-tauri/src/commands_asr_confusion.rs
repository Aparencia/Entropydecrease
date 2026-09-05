//! ASR 混淆画像闭环命令面（v0.20.2 / REQ-269）。
//!
//! @ai-context: 画像采集=REQ-268 采纳流（second_pass_decide 内嵌记录，本模块只做
//!              候选/确认/忽略/规则管理）；确认即「反哺 hotwords」（正确词 to
//!              进 vocab 热词——下次流式会话自带正确词先验）并落 asr_confusion.json；
//!              纠错应用（共现才替换）在产物文本组装面（commands_session_note）。
//! @ai-context: 全部 JSON 可校准（asr_confusion.json 直接编辑亦生效——启动加载）。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::asr_confusion::{AsrPair, AsrRule, AsrConfusionStore};
use crate::commands::AppState;

/// 候选视图（画像 top-N + 已确认规则 + 已忽略键——设置页校准用）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsrConfusionView {
    pub candidates: Vec<AsrPair>,
    pub rules: Vec<AsrRule>,
    pub dismissed_count: usize,
}

fn with_store<T>(
    state: &AppState,
    f: impl FnOnce(&mut AsrConfusionStore) -> T,
) -> Result<T, String> {
    let mut store = state
        .asr_confusion
        .lock()
        .map_err(|_| "混淆表锁中毒".to_string())?;
    let out = f(&mut store);
    store
        .save(&state.asr_confusion_path)
        .map_err(|e| format!("保存混淆表失败: {e}"))?;
    Ok(out)
}

/// 混淆画像与候选（次数≥门槛、未确认/忽略；规则表一并返回供管理）。
#[tauri::command]
pub fn asr_confusion_get(state: State<'_, AppState>) -> Result<AsrConfusionView, String> {
    let store = state
        .asr_confusion
        .lock()
        .map_err(|_| "混淆表锁中毒".to_string())?;
    Ok(AsrConfusionView {
        candidates: store.candidates(30).into_iter().cloned().collect(),
        rules: store.rules.clone(),
        dismissed_count: store.dismissed.len(),
    })
}

/// 确认候选 → 纠错规则（from=wrong→to=right）+ 反哺热词（to 入 vocab）。
#[tauri::command]
pub fn asr_confusion_confirm(
    state: State<'_, AppState>,
    wrong: String,
    right: String,
) -> Result<(), String> {
    let wrong = wrong.trim().to_string();
    let right = right.trim().to_string();
    if wrong.is_empty() || right.is_empty() {
        return Err("候选词对不能为空".to_string());
    }
    let added_rule = with_store(&state, |s| s.confirm(&wrong, &right))?;
    if !added_rule {
        return Err("候选词对无效（空/同词）".to_string());
    }
    // 反哺 hotwords：正确词进流式热词（sherpa 注入，下次会话生效）——
    // 词表变更经既有 vocab 命令路径同款锁内 read-modify-write + 原子写
    {
        let mut vocab = state.vocab.lock().map_err(|_| "词表锁中毒".to_string())?;
        vocab.add_hotwords(&[right.clone()]);
        vocab.save(&state.vocab_path).map_err(|e| format!("保存词表失败: {e}"))?;
    }
    Ok(())
}

/// 忽略候选（不再推荐；画像计数历史保留在 JSON dismissed 键——可人工复原）。
#[tauri::command]
pub fn asr_confusion_dismiss(
    state: State<'_, AppState>,
    wrong: String,
    right: String,
) -> Result<(), String> {
    with_store(&state, |s| s.dismiss(&wrong, &right))
}

/// 删除规则（纠错与热词各自独立——删规则不回滚热词，避免意外移除用户词）。
#[tauri::command]
pub fn asr_confusion_remove_rule(
    state: State<'_, AppState>,
    from: String,
) -> Result<(), String> {
    let removed = with_store(&state, |s| s.remove_rule(&from))?;
    if !removed {
        return Err("规则不存在".to_string());
    }
    Ok(())
}
