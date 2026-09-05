//! AI 精修策略层（REQ-245，v0.17.0；复活 v0.11.6 M2 策略层设计）。
//!
//! @ai-context: 维度/档位/意图声明在 prompts/note_refine.json v3（单一事实源，
//!              include_str 编译期捆绑，golden 测试防漂移）；本模块=纯函数
//!              （解析/合并/回退/指令拼装）——策略只改提示词，协议与校验
//!              零改动（ADR-026-1）。
//! @ai-context: 零变化保证：standard 档（全默认）解析出空指令段落 →
//!              build_system 不追加任何内容 → 与 v0.16.1 现状逐字节一致
//!              （golden 快照守护——精修升级不扰动既有行为）。
//! @ai-context: 解析次序：任务覆盖 > 全局默认（AiSettings.refine_strategy）>
//!              内置 standard；非法档位/未知维度/非法值一律回退声明默认
//!              （防御性编程铁律——策略层永不阻断精修主链路）。

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::ai_note_refine::NoteRefinePrompt;

/// 策略维度声明（一个旋钮：key/label/若干档位/默认档）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDim {
    pub key: String,
    pub label: String,
    pub options: Vec<DimOption>,
    pub default: String,
}

/// 维度档位（value 为协议值；instruction 为注入提示词的指令文案——
/// 走 JSON 声明可校准，不进代码）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DimOption {
    pub value: String,
    pub label: String,
    pub instruction: String,
}

/// 档位预设（阶梯 = 维度值预设组合 + 档级总体指令；standard=空组合=现状）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LadderPreset {
    pub id: String,
    pub name: String,
    pub desc: String,
    /// 档级总体指令（空 = 不追加——L2 标准精修零变化保证）
    #[serde(default)]
    pub instruction: String,
    pub dim_values: HashMap<String, String>,
}

/// 目标意图预设（chips + 自由输入关键词映射；未命中 = None，诚实提示）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentPreset {
    pub id: String,
    pub label: String,
    pub keywords: Vec<String>,
    #[serde(default)]
    pub instruction: String,
    pub dim_values: HashMap<String, String>,
}

/// 策略声明元数据（meta 命令载荷——前端渲染 chips/档位/旋钮，
/// 后端单一事实源，前端零硬编码）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineStrategyMeta {
    pub strategy_dims: Vec<StrategyDim>,
    pub ladder_presets: Vec<LadderPreset>,
    pub intents: Vec<IntentPreset>,
}

/// 全局偏好（AiSettings.refine_strategy——设置页默认档位 + 逐维覆盖；
/// serde default：旧 ai_settings.json 零迁移，自动回填标准档）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RefineStrategyPrefs {
    /// 默认档位 id（空 = standard——现状行为）
    #[serde(default)]
    pub default_ladder: String,
    /// 逐维覆盖（key=维度 key；仅覆盖非空值）
    #[serde(default)]
    pub dim_overrides: HashMap<String, String>,
}

/// 任务级覆盖（发起点传参：预设档位 id + 逐维覆盖 + 自定义档自由文本——
/// 可整体换档/单维微调/自定义描述；custom_text 仅 preset=自定义 时生效）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StrategyOverride {
    pub preset_id: Option<String>,
    #[serde(default)]
    pub dims: HashMap<String, String>,
    /// 自定义档的自由文本（REQ-279；空/None=未启用——后端回退 standard）
    #[serde(default)]
    pub custom_text: Option<String>,
}

/// 自定义档自由文本上限（字符；防御性边界——防提示词膨胀）
pub const MAX_CUSTOM_TEXT_CHARS: usize = 500;

/// 解析结果（每维最终值——Send+Clone，可跨任务线程；instruction=档级总体
/// 指令，空=不追加）。
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ResolvedDims {
    pub preset_id: String,
    pub instruction: String,
    pub dims: HashMap<String, String>,
    /// 自定义档自由文本（仅 preset=custom 且非空时非空——溯源展示/重生成沿用）
    pub custom_text: String,
}

/// 解析：任务覆盖 > 全局默认 > 内置 standard；非法值回退声明默认。
///
/// @ai-context: 防御性边界：未知档位 → 回退 standard 基准；未知维度 key →
///              丢弃；非法档值 → 该维回退声明 default。返回的 ResolvedDims
///              永远只含声明维度（每维必有值）。
/// @ai-context: REQ-279 净化规则（所见即所发 + 标准恒纯净）：
///              ① 任务显式给出档位时（含 standard/custom）一律不叠加全局逐维
///                 覆盖——草稿已把用户可见的全部维度值经 dims 传入，后端不得
///                 再隐式叠加任何残留；
///              ② 未给显式档位（走全局默认）时仅当 default_ladder 显式非空
///                 才折叠偏好覆盖——旧版意图基准污染形状（default_ladder=""
///                 + 全维 overrides）被跳过；
///              ③ custom 档无文本 → 整档回退 standard（零变化保证不破裂）。
pub fn resolve(
    decl: &NoteRefinePrompt,
    global: &RefineStrategyPrefs,
    over: Option<&StrategyOverride>,
) -> ResolvedDims {
    // 自定义文本先取先净化（首 500 字符——防膨胀）
    let custom_text: String = over
        .and_then(|o| o.custom_text.as_deref())
        .unwrap_or("")
        .trim()
        .chars()
        .take(MAX_CUSTOM_TEXT_CHARS)
        .collect();
    // ① 基准档位：任务 preset > 全局默认 > "standard"
    let base_id = over
        .and_then(|o| o.preset_id.as_ref().filter(|s| !s.is_empty()).cloned())
        .or_else(|| {
            let s = global.default_ladder.trim();
            if s.is_empty() { None } else { Some(s.to_string()) }
        })
        .unwrap_or_else(|| "standard".to_string());
    // custom 无文本 = 无效档（前端守卫 + 后端兜底统一口径：回退标准）
    let effective_id =
        if base_id == "custom" && custom_text.is_empty() { "standard" } else { base_id.as_str() };
    let base = decl.ladder_presets.iter().find(|p| p.id == effective_id);
    let (preset_id, mut dims, mut instruction) = match base {
        Some(p) => (p.id.clone(), p.dim_values.clone(), p.instruction.clone()),
        // 未知档位回退标准（零变化基准——不阻断）
        None => ("standard".to_string(), HashMap::new(), String::new()),
    };
    // ② 全局逐维覆盖：仅「无任务显式档位 + 全局默认档显式非空」时折叠——
    //    任务显式档位一律不叠（所见即所发）；""+overrides = 旧版意图基准
    //    污染形状（legacy），跳过（REQ-279 标准恒纯净后端兜底）
    let has_explicit_task_preset = over
        .and_then(|o| o.preset_id.as_ref().filter(|s| !s.is_empty()))
        .is_some();
    if !has_explicit_task_preset && !global.default_ladder.trim().is_empty() {
        for (k, v) in &global.dim_overrides {
            dims.insert(k.clone(), v.clone());
        }
    }
    // ③ 任务级逐维覆盖（任务优先）
    if let Some(o) = over {
        for (k, v) in &o.dims {
            dims.insert(k.clone(), v.clone());
        }
    }
    // custom 档：自由文本落为档级指令（dimValues 为空——无叠加维度指令）
    if preset_id == "custom" {
        instruction = format!("本次为自定义档：{}", custom_text);
    }
    let custom_text_owned = if preset_id == "custom" { custom_text } else { String::new() };
    ResolvedDims {
        preset_id,
        instruction,
        dims: validate_dims(decl, &dims),
        custom_text: custom_text_owned,
    }
}

/// 维度值干净化：仅保留声明维度；非法值/缺省 → 声明 default。
/// （纯函数——intent 解析/全局/任务三段共用同一口径）
fn validate_dims(decl: &NoteRefinePrompt, raw: &HashMap<String, String>) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for dim in &decl.strategy_dims {
        let v = raw.get(&dim.key).cloned().unwrap_or_else(|| dim.default.clone());
        let valid = dim.options.iter().any(|o| o.value == v);
        out.insert(dim.key.clone(), if valid { v } else { dim.default.clone() });
    }
    out
}

/// 策略指令段落（策略注入提示词的最终文本）。
///
/// @ai-context: 只输出「档级总体指令 + 偏离声明默认的维度指令」——全部默认
///              （standard 档）时返回空字符串，调用方不追加 → 零变化保证。
pub fn strategy_instructions(dims: &ResolvedDims, decl: &NoteRefinePrompt) -> String {
    let mut parts: Vec<&str> = Vec::new();
    if !dims.instruction.is_empty() {
        parts.push(dims.instruction.as_str());
    }
    for dim in &decl.strategy_dims {
        let sel = dims.dims.get(&dim.key);
        if let Some(sel) = sel {
            if *sel != dim.default {
                if let Some(o) = dim.options.iter().find(|o| &o.value == sel) {
                    parts.push(o.instruction.as_str());
                }
            }
        }
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!("本次产出策略：{}", parts.join(" "))
    }
}

/// 提示词组装预览（纯函数：与实发精修同一 build_system 代码路径——
/// 预览逐字节等于实发；命令层仅负责取 profile 与全局偏好）。
///
/// @ai-context: 全局偏好参与解析（预览含默认档 + 临时覆盖后的效果——
///              「所见即所发」）；返回完整 system 提示词。
pub fn preview_system(
    prompt: &NoteRefinePrompt,
    profile: &str,
    prefs: &RefineStrategyPrefs,
    over: Option<&StrategyOverride>,
) -> String {
    let dims = resolve(prompt, prefs, over);
    prompt.build_system(profile, Some(&dims))
}

// REQ-290 ② 输出预算化纯函数见 refine_budget.rs（AGENTS.md §3 行数纪律）

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_strategy_tests.rs"]
mod tests;
