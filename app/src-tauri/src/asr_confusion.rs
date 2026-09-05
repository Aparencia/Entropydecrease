//! ASR 同音混淆画像闭环（v0.20.2 / REQ-269）。
//!
//! @ai-context: 画像源——用户「采纳」的离线精修草稿（REQ-268 裁决流）：
//!              旧文本（被换掉）与精修文本（用户选中的更优面）做字符级对齐，
//!              连续错位段聚成词级对 (wrong, right)——采纳=有标注的弱参考，
//!              画像即真实产出，无人工标注成本。
//! @ai-context: 闭环三步——① 聚合画像（词级对 + 次数，JSON 可校准）；② 候选
//!              （次数 ≥ 门槛、未确认未忽略）经确认制进规则表（OCR ocr_confusion
//!              哲学迁移：共现才替换——from 只在「正确词 to 已出现在同文语料」时
//!              才替换，无共现不猜，防错纠）；③ 反哺 hotwords 由命令层完成
//!              （确认即把 to 加入热词注入流式 ASR，下次识别自带正确词先验）。
//! @ai-context: 只读消费面=产物文本组装（commands_session_note 转换/预览），
//!              原料 session_segments 永不变（与 REQ-268 同可逆契约）。
//! @ai-context: 纯逻辑 + JSON IO（路径注入，测试用内存/temp）；无网络依赖。

use serde::{Deserialize, Serialize};

/// 词级混淆对统计（wrong=被换掉的旧文本词段；right=用户采纳的新词段）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AsrPair {
    pub wrong: String,
    pub right: String,
    /// 出现次数（采纳流聚合）
    pub count: u64,
}

/// 已确认纠错规则（from → to；from 为待替换词形，to 为正确词）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AsrRule {
    pub from: String,
    pub to: String,
}

/// 画像 + 规则 + 忽略单（单文件 JSON 校准，data_dir/asr_confusion.json）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AsrConfusionStore {
    /// 词级画像（wrong→right 计数）
    #[serde(default)]
    pub pairs: Vec<AsrPair>,
    /// 已确认规则（用户裁决——机器不自动生效）
    #[serde(default)]
    pub rules: Vec<AsrRule>,
    /// 已忽略候选键（"wrong|right"——不再推荐）
    #[serde(default)]
    pub dismissed: Vec<String>,
}

/// 候选次数门槛（防单次噪声；与 OCR 画像 min_count 先例同哲学）。
pub const MIN_CANDIDATE_COUNT: u64 = 2;
/// 词级对最大长度（超长=对齐错位噪声，不提名——宁漏勿错）。
pub const MAX_RUN_CHARS: usize = 8;

impl AsrConfusionStore {
    /// 从磁盘加载（缺失/损坏 → 空画像与规则，不阻断启动——校准文件可删）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// 原子写（先 tmp 后 rename——防写一半损坏；vocab.json 同款）。
    pub fn save(&self, path: &std::path::Path) -> crate::error::Result<()> {
        let raw = serde_json::to_string_pretty(self)
            .map_err(|e| crate::error::AppError::Io(format!("序列化 ASR 混淆表失败: {}", e)))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, raw)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 记录一次采纳差异（old=被换旧文，new=采纳精修文——new 侧为弱参考）：
    /// 聚合词级对计数；返回新增对数。
    pub fn record_adoption(&mut self, old: &str, new: &str) -> usize {
        let mut added = 0;
        for (wrong, right) in word_pairs(old, new) {
            match self.pairs.iter_mut().find(|p| p.wrong == wrong && p.right == right) {
                Some(p) => p.count += 1,
                None => {
                    self.pairs.push(AsrPair { wrong, right, count: 1 });
                    added += 1;
                }
            }
        }
        added
    }

    /// 候选（次数达标、未被确认/忽略；按次数降序，最多 limit 条）。
    pub fn candidates(&self, limit: usize) -> Vec<&AsrPair> {
        let mut list: Vec<&AsrPair> = self
            .pairs
            .iter()
            .filter(|p| {
                p.count >= MIN_CANDIDATE_COUNT
                    && !self.rules.iter().any(|r| r.from == p.wrong)
                    && !self.dismissed.iter().any(|k| k == &pair_key(&p.wrong, &p.right))
            })
            .collect();
        list.sort_by_key(|p| std::cmp::Reverse(p.count));
        list.truncate(limit);
        list
    }

    /// 确认候选 → 规则表（from=wrong，to=right；重复 from 覆盖——现场校准优先）；
    /// 返回 true=生效。
    pub fn confirm(&mut self, wrong: &str, right: &str) -> bool {
        if wrong.trim().is_empty() || right.trim().is_empty() || wrong == right {
            return false;
        }
        let from = wrong.trim();
        let to = right.trim();
        if let Some(r) = self.rules.iter_mut().find(|r| r.from == from) {
            r.to = to.to_string();
        } else {
            self.rules.push(AsrRule { from: from.to_string(), to: to.to_string() });
        }
        // 规则已生效的画像对不再推荐（候选过滤器同样拦截）
        self.pairs.retain(|p| p.wrong != from || p.right != to);
        true
    }

    /// 忽略候选（仅记录，不删历史画像——未来可再评估）。
    pub fn dismiss(&mut self, wrong: &str, right: &str) {
        let key = pair_key(wrong, right);
        if !self.dismissed.iter().any(|k| *k == key) {
            self.dismissed.push(key.clone());
        }
        self.pairs.retain(|p| pair_key(&p.wrong, &p.right) != key);
    }

    /// 删除规则（恢复画像原样——只回规则表，历史计数已在 confirm 时移除）。
    pub fn remove_rule(&mut self, from: &str) -> bool {
        let before = self.rules.len();
        self.rules.retain(|r| r.from != from);
        self.rules.len() != before
    }
}

fn pair_key(wrong: &str, right: &str) -> String {
    format!("{}|{}", wrong, right)
}

/// 纠错（纯函数）：长词优先顺序替换；**共现才替换**——正确词 to 未出现在
/// 语料（同会话全文）中不猜（OCR ocr_correction 哲学迁移：互证缺失=孤立词形，
/// 可能是特有词而非错词）。
pub fn apply_rules(text: &str, corpus: &str, rules: &[AsrRule]) -> String {
    if rules.is_empty() || text.is_empty() || corpus.is_empty() {
        return text.to_string();
    }
    let mut sorted = rules.to_vec();
    sorted.sort_by_key(|r| std::cmp::Reverse(r.from.chars().count()));
    let mut out = text.to_string();
    for r in sorted {
        if !r.from.is_empty() && out.contains(&r.from) && corpus.contains(&r.to) {
            out = out.replace(&r.from, &r.to);
        }
    }
    out
}

/// 词级对提取（纯函数）：两段采纳差异文本 → 连续错位段词对 (old 侧, new 侧)。
///
/// @ai-context: 复用 eval_confusion::diff_ops（字符级 DP 回溯，去标点口径同
///              CER/画像）——连续非匹配操作聚成段；**含单字对**（同音词常见
///              仅首字不同：概念/该念）——单字替换风险由「确认制 + 共现才
///              替换 + JSON 可删」三重把关（OCR 0/O 先例同哲学）；超长段
///              （> MAX_RUN_CHARS，插删错位）丢弃——宁漏勿错，候选只做提名人。
fn word_pairs(old: &str, new: &str) -> Vec<(String, String)> {
    use crate::asr_rescore::strip_punct;
    use crate::eval_confusion::{diff_ops, EditOp};
    let old_chars = strip_punct(old);
    let new_chars = strip_punct(new);
    if old_chars.len() > 2000 || new_chars.len() > 2000 {
        return Vec::new(); // 超长护栏（同 eval_confusion::MAX_DIFF_CHARS 精神）
    }
    let ops = diff_ops(&old_chars, &new_chars);
    let mut out = Vec::new();
    let mut run_old: Vec<char> = Vec::new();
    let mut run_new: Vec<char> = Vec::new();
    let mut flush = |run_old: &mut Vec<char>, run_new: &mut Vec<char>, out: &mut Vec<(String, String)>| {
        if !run_old.is_empty()
            && !run_new.is_empty()
            && run_old.len() == run_new.len()
            && run_old.len() <= MAX_RUN_CHARS
        {
            out.push((run_old.iter().collect::<String>(), run_new.iter().collect::<String>()));
        }
        run_old.clear();
        run_new.clear();
    };
    for op in ops {
        match op {
            EditOp::Match(_) => flush(&mut run_old, &mut run_new, &mut out),
            EditOp::Sub(a, b) => {
                run_old.push(a);
                run_new.push(b);
            }
            // 插/删不配对——仅计入两侧串影响长度不等，flush 时按规则丢弃
            EditOp::Ins(c) => run_new.push(c),
            EditOp::Del(c) => run_old.push(c),
        }
    }
    flush(&mut run_old, &mut run_new, &mut out);
    out
}

#[cfg(test)]
#[path = "asr_confusion_tests.rs"]
mod tests;
