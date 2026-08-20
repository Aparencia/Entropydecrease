//! 笔记净化阈值配置（REQ-173 / v0.7.5）。
//!
//! @ai-context: 净化管线散落常量（120字/60s/0.5/0.6 等）集中于此——现场调参
//!              走数据目录 purify_config.json 校准（ui_junk.json 先例），
//!              无需改码重编译；文件缺失/损坏回退内置默认，不阻断启动。
//! @ai-context: 默认值 = v0.7.5 裁决口径：段落 120字/60s、低置信 0.6、
//!              碎片 ≤2字/500ms、口头禅 ≤8字、OCR 块低分 0.5→0.7（REQ-167
//!              配黄金语料回归验证不误杀）、边缘条带 顶8%/底8%/左右4%。

use serde::{Deserialize, Serialize};

/// 净化阈值配置（serde default = 内置默认，JSON 只写需覆盖的字段）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PurifyConfig {
    // ── 段落切分（concat 口径，原散落常量）──
    /// 单个转写段落最大字符数（超过切段）
    pub paragraph_max_chars: usize,
    /// 单个转写段落最大时间跨度（ms，超过切段）
    pub paragraph_max_span_ms: u64,
    // ── 转写段过滤 ──
    /// 低置信丢弃阈值（confidence < 该值丢弃；None 不判）
    pub low_confidence_threshold: f32,
    /// 碎片段最大字符数（≤ 丢弃）
    pub fragment_max_chars: usize,
    /// 碎片段最小时长（ms，< 丢弃）
    pub fragment_min_duration_ms: u64,
    /// 口头禅短段最大字符数（REQ-163：≤ 且全由口头禅词组成 → 删除）
    pub filler_max_chars: usize,
    /// 纯过渡短句删除（v0.7.5 扩展：整句 ∈ 精确表才删——零误杀低召回）
    pub transition_delete: bool,
    /// 纯过渡短句最大字符数（整句去标点后 ≤ 且 ∈ 精确表 → 删除）
    pub transition_max_chars: usize,
    /// 修辞问句删除（v0.7.5 扩展：自问自答——核心词在紧邻段复现才删）
    pub rhetorical_delete: bool,
    /// 修辞问句最大字符数（> 该值不删——复杂问句多为真问题）
    pub rhetorical_max_chars: usize,
    // ── OCR 块过滤（画面要点）──
    /// 块最低置信（REQ-167：0.5→0.7 校准）
    pub min_block_score: f32,
    /// 单字符碎片块丢弃（非表格/公式/代码上下文；REQ-167）
    pub single_char_drop: bool,
    /// 边缘条带 bbox 黑名单：y 比例 < 该值（顶部条带）
    pub edge_strip_top_ratio: f32,
    /// 边缘条带 bbox 黑名单：y+h 比例 > 该值（底部条带）
    pub edge_strip_bottom_ratio: f32,
    /// 边缘条带 bbox 黑名单：x 比例 < 或 x+w 比例 > 该值（左右条带）
    pub edge_strip_side_ratio: f32,
    /// 视频页 UI 共现判定：同帧 VideoPageUi 命中 ≥ 该值 → 丢弃同帧标签形短块
    /// （作者名/图标垃圾共现规则，REQ-166——清晖加油站/若凡娃娃类）
    pub frame_junk_min_hits: usize,
    // ── 净化开关（REQ-162/163/164/168）──
    /// 口语书面化接线（保守档 Light——与实时分析路径同档）
    pub verbal_normalize: bool,
    /// 口语数字/符号规范化接线
    pub symbol_normalize: bool,
    /// 结巴/叠字折叠（甲甲甲→甲；白名单保护合法叠词）
    pub stutter_fold: bool,
    /// 术语替换（项目班→项目班子 类种子表）
    pub term_replace: bool,
    /// 口头禅短段规则级删除（免 AI）
    pub filler_delete: bool,
    /// OCR 错字纠错（种子映射 + 转写共现校验，无映射不猜）
    pub ocr_correct: bool,
    /// 段落时间戳锚点 [MM:SS] 前缀（REQ-165，可开关）
    pub anchor_timestamps: bool,
    /// v0.7.6（REQ-179）：结构渲染配置（章节标题/词汇表块——嵌套 JSON 可校准）
    pub structure: crate::structure_note::NoteStructureConfig,
}

impl Default for PurifyConfig {
    fn default() -> Self {
        Self {
            paragraph_max_chars: 120,
            paragraph_max_span_ms: 60_000,
            low_confidence_threshold: 0.6,
            fragment_max_chars: 2,
            fragment_min_duration_ms: 500,
            filler_max_chars: 8,
            transition_delete: true,
            transition_max_chars: 8,
            rhetorical_delete: true,
            rhetorical_max_chars: 15,
            min_block_score: 0.7,
            single_char_drop: true,
            edge_strip_top_ratio: 0.08,
            edge_strip_bottom_ratio: 0.92,
            edge_strip_side_ratio: 0.04,
            frame_junk_min_hits: 3,
            verbal_normalize: true,
            symbol_normalize: true,
            stutter_fold: true,
            term_replace: true,
            filler_delete: true,
            ocr_correct: true,
            anchor_timestamps: true,
            structure: crate::structure_note::NoteStructureConfig::default(),
        }
    }
}

impl PurifyConfig {
    /// 从 JSON 构建（缺失字段 = 内置默认——partial 覆盖语义）。
    pub fn from_json(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("purify_config.json 解析失败: {}", e))
    }

    /// 从数据目录 JSON 加载（缺失/损坏 → 内置默认，不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => Self::from_json(&raw).unwrap_or_else(|e| {
                eprintln!("[PurifyConfig] 配置加载失败，使用内置默认: {}", e);
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "purify_config_tests.rs"]
mod tests;
