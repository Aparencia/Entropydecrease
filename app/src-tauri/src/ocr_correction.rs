//! OCR 错字纠错（REQ-168 / v0.7.5）。
//!
//! @ai-context: 画面 OCR 错字（会话31 实证：「項灣启动是艺术」= 项目启动是艺术、
//!              「质灣交接」= 质量交接）——种子映射 + **转写共现校验**：
//!              纠错只在正确词在转写（讲述）中出现过才生效——画面词与讲述词
//!              互证（画面反复出现、讲者反复说），无映射/无共现一律不猜（保守）。
//! @ai-context: 可逆契约：只作用于产物层块文本（filter_usable_blocks 的消费
//!              副本），原料 ocr_blocks 表不动。
//! @ai-context: 种子表可经数据目录 ocr_correction.json 校准合并（ui_junk.json
//!              先例）——现场遇新错字无需改码。

use serde::{Deserialize, Serialize};

/// 纠错映射（from → to；from 为 OCR 常见错形，to 为正确词）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CorrectionRule {
    pub from: String,
    pub to: String,
}

/// 纠错表（内置种子 + JSON 校准合并）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrCorrectionTable {
    pub rules: Vec<CorrectionRule>,
}

/// 内置种子表（会话31 实证驱动；只收录"错形→正确词"关系明确的）。
///
/// @ai-context: 保守原则：错误字形五花八门，无共现证据的映射不收录——
///              宁可漏纠不可错纠（错纠 = 篡改画面内容，比漏纠危害大）。
fn default_rules() -> Vec<CorrectionRule> {
    let mut v = Vec::new();
    let mut push = |from: &str, to: &str| {
        v.push(CorrectionRule { from: from.to_string(), to: to.to_string() });
    };
    // 会话31：视频标题/幻灯片「项目」两处误识为 項灣（简体→异体字混淆）
    push("項灣", "项目");
    push("质灣", "质量");
    push("国录", "目录");
    push("产晶", "产品");
    push("实旅", "实施");
    push("页營", "页营");
    v
}

impl Default for OcrCorrectionTable {
    fn default() -> Self {
        Self { rules: default_rules() }
    }
}

impl OcrCorrectionTable {
    /// 从 JSON 构建（与内置种子合并，按 from 去重——JSON 可覆盖种子）。
    pub fn from_json(json: &str) -> Result<Self, String> {
        let parsed: OcrCorrectionTable =
            serde_json::from_str(json).map_err(|e| format!("ocr_correction.json 解析失败: {}", e))?;
        let mut rules = Self::default().rules;
        for r in parsed.rules {
            if let Some(slot) = rules.iter_mut().find(|x| x.from == r.from) {
                *slot = r;
            } else {
                rules.push(r);
            }
        }
        Ok(Self { rules })
    }

    /// 从数据目录 JSON 加载（缺失/损坏 → 内置种子，不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => Self::from_json(&raw).unwrap_or_else(|e| {
                eprintln!("[OcrCorrection] 纠错表加载失败，使用内置种子: {}", e);
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    /// 纠错（纯函数）：替换命中且正确词在转写中共现的错形；无共现不猜。
    ///
    /// @ai-context: transcript 为会话全部转写文本（讲述内容）；共现 = to 作为
    ///              子串出现（"项目"在讲述中出现过）——画面词与讲述词互证。
    /// @ai-context: 命中但共现缺失 → 原样返回（保守：OCR 孤例错形可能是
    ///              画面特有词，无讲述证据不篡改）。
    pub fn correct(&self, text: &str, transcript: &str) -> String {
        if text.is_empty() || transcript.is_empty() {
            return text.to_string();
        }
        let mut out = text.to_string();
        for r in &self.rules {
            if out.contains(&r.from) && transcript.contains(&r.to) {
                out = out.replace(&r.from, &r.to);
            }
        }
        out
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ocr_correction_tests.rs"]
mod tests;
