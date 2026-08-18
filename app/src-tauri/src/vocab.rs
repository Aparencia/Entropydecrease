//! 热词/替换词表（REQ-040 / v0.4.0 M5）。
//!
//! @ai-context: 技能自学场景专业术语是 ASR/OCR 主要错误源；词表纯本地持久化
//!              （JSON，应用数据目录）：热词注入 sherpa 流式识别（端点重建流生效）、
//!              替换词做 OCR 后纠错（"王者→主者"类错字）、OCR 高频词/课件文本生成
//!              建议候选（用户确认后加入——闭环）。
//! @ai-context: 全部为纯逻辑 + JSON IO（路径可注入，测试用 tempfile）；无网络依赖。
//! @ai-context: 建议/候选只是"提名人"，加入需用户确认（OCR 误识别词不得自动进热词）。

use serde::{Deserialize, Serialize};

/// 词表库（热词 + 替换词对）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct VocabStore {
    /// ASR 热词（sherpa hotwords；注入流式识别）
    pub hotwords: Vec<String>,
    /// 替换词对（OCR 后纠错：from → to）
    pub replacements: Vec<ReplacePair>,
}

/// 替换词对。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReplacePair {
    pub from: String,
    pub to: String,
}

impl VocabStore {
    /// 从磁盘加载；文件不存在/损坏 → 空词表（防御：不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        let Ok(raw) = std::fs::read_to_string(path) else { return Self::default() };
        serde_json::from_str(&raw).unwrap_or_default()
    }

    /// 原子写（先写 .tmp 再 rename，防写一半损坏词表）。
    pub fn save(&self, path: &std::path::Path) -> crate::error::Result<()> {
        let raw = serde_json::to_string_pretty(self)
            .map_err(|e| crate::error::AppError::Io(format!("序列化词表失败: {}", e)))?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, raw)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 加入热词（trim + 去重 + 忽略空）；返回实际新增数。
    pub fn add_hotwords(&mut self, words: &[String]) -> usize {
        let mut added = 0;
        for w in words {
            let t = w.trim();
            if !t.is_empty() && !self.hotwords.iter().any(|h| h == t) {
                self.hotwords.push(t.to_string());
                added += 1;
            }
        }
        added
    }

    /// 删除热词；返回是否命中。
    pub fn remove_hotword(&mut self, word: &str) -> bool {
        let before = self.hotwords.len();
        self.hotwords.retain(|h| h != word);
        self.hotwords.len() != before
    }

    /// 加入替换词对（trim + 防空 from + 防重复 from）；返回是否新增。
    pub fn add_replacement(&mut self, from: &str, to: &str) -> bool {
        let from = from.trim();
        let to = to.trim();
        if from.is_empty() {
            return false;
        }
        if self.replacements.iter().any(|p| p.from == from) {
            return false;
        }
        self.replacements.push(ReplacePair { from: from.to_string(), to: to.to_string() });
        true
    }

    /// 删除替换词对（按 from）；返回是否命中。
    pub fn remove_replacement(&mut self, from: &str) -> bool {
        let before = self.replacements.len();
        self.replacements.retain(|p| p.from != from);
        self.replacements.len() != before
    }

    /// ASR hotwords 字符串（sherpa 格式：空格分隔；空表 → None，走 create_stream）。
    pub fn hotwords_string(&self) -> Option<String> {
        let s = self.hotwords.join(" ");
        (!s.is_empty()).then_some(s)
    }
}

/// 替换纠错（纯函数）：按 from→to 逐个替换。
///
/// @ai-context: 长词优先（先替换长 from，防"主者"命中"王者"的子串先被替换）；
///              无匹配/空表原样返回。
pub fn apply_replacements(text: &str, pairs: &[ReplacePair]) -> String {
    if pairs.is_empty() {
        return text.to_string();
    }
    let mut sorted = pairs.to_vec();
    sorted.sort_by(|a, b| b.from.chars().count().cmp(&a.from.chars().count()));
    let mut out = text.to_string();
    for p in sorted {
        if !p.from.is_empty() {
            out = out.replace(&p.from, &p.to);
        }
    }
    out
}

/// 中文常见停用词（建议/候选过滤用——宽松即可，误滤无害，漏滤靠用户确认把关）。
const STOP_WORDS: &[&str] = &[
    "的", "了", "是", "在", "和", "与", "及", "有", "我", "你", "他", "她", "它", "这", "那", "一", "不",
    "都", "就", "很", "也", "上", "下", "中", "对", "为", "以", "之", "其", "或", "等", "并", "而", "但",
    "被", "把", "从", "到", "说", "看", "要", "会", "能", "可以", "这个", "那个", "我们", "你们", "他们",
    "老师", "同学", "大家", "请", "好", "嗯", "啊", "哦", "一个", "没有", "什么", "怎么", "这样", "那样",
];

/// 候选长度约束：中文 2-6 字、ASCII 单词 ≥3 字符（≤24）。
fn valid_candidate(token: &str) -> bool {
    let cjk_count = token.chars().filter(|c| is_cjk(*c)).count();
    let is_cjk_word = cjk_count == token.chars().count() && (2..=6).contains(&cjk_count);
    let ascii_count = token.chars().count();
    let is_ascii_word = cjk_count == 0 && (3..=24).contains(&ascii_count) && token.chars().all(|c| c.is_ascii_alphanumeric());
    if !(is_cjk_word || is_ascii_word) {
        return false;
    }
    // 纯数字不是术语
    if token.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    !STOP_WORDS.contains(&token)
}

/// 课件/OCR 文本 → 候选热词（纯函数）：分词（CJK 2-4 字滑窗 + ASCII 词）→ 过滤 →
/// 按频率降序（并列按长度降序、再字典序）取前 max。
pub fn extract_candidates(text: &str, max: usize) -> Vec<String> {
    let mut freq: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    collect_tokens(text, &mut freq);
    let mut list: Vec<(usize, usize, String)> = freq
        .into_iter()
        .map(|(t, n)| (n, t.chars().count(), t))
        .collect();
    // 频率降序 → 长度降序 → 字典序（尾键保证确定性：HashMap 迭代序随机）
    list.sort_by_key(|(n, len, text)| (std::cmp::Reverse(*n), std::cmp::Reverse(*len), text.clone()));
    list.into_iter().take(max).map(|(_, _, t)| t).collect()
}

/// OCR 文本流 → 高频词建议（纯函数）：候选 + 出现次数 ≥ min_count（字典序）。
pub fn suggest_from_ocr_texts(texts: &[&str], min_count: usize) -> Vec<String> {
    let mut freq: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for text in texts {
        // 每行文本内部去重（同一行重复出现的 gram 只计一次——防止长行刷频）
        let mut line: std::collections::HashSet<String> = std::collections::HashSet::new();
        collect_tokens(text, &mut line);
        for t in line {
            *freq.entry(t).or_insert(0) += 1;
        }
    }
    let mut list: Vec<String> = freq
        .into_iter()
        .filter(|(_, n)| *n >= min_count)
        .map(|(t, _)| t)
        .collect();
    list.sort();
    list
}

/// 分词并把候选 token 计入 sink（CJK 段滑窗 2-4 字 + ASCII 词）。
///
/// @ai-context: 中文无空格——整句 CJK 段不能当词（频率统计失效），
///              用 2-4 字滑窗近似分词：真实术语会跨句重复出现（多次滑窗命中），
///              噪声 gram 频率低被 min_count/排序压掉；仅作"提名人"足够。
fn collect_tokens(text: &str, sink: &mut dyn TokenSink) {
    for (run, is_cjk) in split_runs(text) {
        if is_cjk {
            let chars: Vec<char> = run.chars().collect();
            let limit = chars.len().min(80); // 超长段截断，防组合爆炸
            for len in 2..=4 {
                if len > limit {
                    break;
                }
                for start in 0..=(limit - len) {
                    let token: String = chars[start..start + len].iter().collect();
                    if valid_candidate(&token) {
                        sink.put(token);
                    }
                }
            }
        } else if valid_candidate(run) {
            sink.put(run.to_string());
        }
    }
}

// 统一收集语义：suggest（Set 去重）与 extract（Map 计数）共用
trait TokenSink {
    fn put(&mut self, token: String);
}

impl TokenSink for std::collections::HashSet<String> {
    fn put(&mut self, token: String) {
        self.insert(token);
    }
}

impl TokenSink for std::collections::HashMap<String, usize> {
    fn put(&mut self, token: String) {
        *self.entry(token).or_insert(0) += 1;
    }
}

/// 分段：返回（段, 是否 CJK 连续段）；ASCII 字母数字为独立段。
fn split_runs(text: &str) -> Vec<(&str, bool)> {
    let mut runs = Vec::new();
    let mut start: Option<usize> = None;
    let mut is_cjk_run: Option<bool> = None;
    for (i, c) in text.char_indices() {
        let cjk = is_cjk(c);
        let word = cjk || c.is_ascii_alphanumeric();
        match (is_cjk_run, word) {
            (None, false) => {}
            (None, true) => {
                start = Some(i);
                is_cjk_run = Some(cjk);
            }
            (Some(_), false) => {
                if let Some(s) = start.take() {
                    runs.push((&text[s..i], is_cjk_run.unwrap()));
                }
                is_cjk_run = None;
            }
            (Some(prev), true) if prev == cjk => {}
            (Some(_), true) => {
                if let Some(s) = start.take() {
                    runs.push((&text[s..i], is_cjk_run.unwrap()));
                }
                start = Some(i);
                is_cjk_run = Some(cjk);
            }
        }
    }
    if let Some(s) = start {
        runs.push((&text[s..], is_cjk_run.unwrap()));
    }
    runs
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pair(from: &str, to: &str) -> ReplacePair {
        ReplacePair { from: from.to_string(), to: to.to_string() }
    }

    #[test]
    fn apply_replacement_basic() {
        assert_eq!(apply_replacements("这是主者讲解", &[pair("主者", "王者")]), "这是王者讲解");
    }

    #[test]
    fn apply_replacement_longest_first() {
        // 长词优先：先替换"王者荣耀"再替换"王者"
        let pairs = vec![pair("王者", "王哲"), pair("王者荣耀", "WZRY")];
        assert_eq!(apply_replacements("王者荣耀攻略", &pairs), "WZRY攻略");
    }

    #[test]
    fn apply_replacement_empty_pairs_returns_original() {
        assert_eq!(apply_replacements("原文", &[]), "原文");
    }

    #[test]
    fn apply_replacement_no_match_unchanged() {
        assert_eq!(apply_replacements("没有匹配词", &[pair("不存在", "X")]), "没有匹配词");
    }

    #[test]
    fn store_roundtrip_preserves_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vocab.json");
        let mut store = VocabStore::default();
        store.add_hotwords(&["术语甲".to_string(), "术语乙".to_string()]);
        store.add_replacement("主者", "王者");
        store.save(&path).unwrap();
        assert_eq!(VocabStore::load(&path), store);
    }

    #[test]
    fn store_load_missing_is_default() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(VocabStore::load(&dir.path().join("none.json")), VocabStore::default());
    }

    #[test]
    fn add_hotwords_dedupes_and_trims() {
        let mut store = VocabStore::default();
        assert_eq!(store.add_hotwords(&[" 术语 ".to_string(), "术语".to_string(), "".to_string()]), 1);
        assert_eq!(store.hotwords, vec!["术语".to_string()]);
    }

    #[test]
    fn remove_hotword_and_replacement() {
        let mut store = VocabStore::default();
        store.add_hotwords(&["A".to_string()]);
        assert!(store.remove_hotword("A"));
        assert!(!store.remove_hotword("A"));
        store.add_replacement("x", "y");
        assert!(store.remove_replacement("x"));
        assert!(!store.remove_replacement("x"));
    }

    #[test]
    fn hotwords_string_format() {
        let mut store = VocabStore::default();
        assert_eq!(store.hotwords_string(), None);
        store.add_hotwords(&["术语甲".to_string(), "术语乙".to_string()]);
        assert_eq!(store.hotwords_string().as_deref(), Some("术语甲 术语乙"));
    }

    #[test]
    fn extract_candidates_picks_cjk_and_ascii() {
        let text = "今天我们学习术语甲术语甲和 术语乙，还有 GPU 与 CPU 的区别。GPU 很重要。";
        let candidates = extract_candidates(text, 20);
        // ASCII 词独立成 token；GPU 出现 2 次 → 必然入选
        assert!(candidates.contains(&"GPU".to_string()));
        assert!(candidates.contains(&"CPU".to_string()));
        // 术语相关 gram 高频（滑窗多次命中）
        assert!(candidates.iter().any(|c| c.contains("术语")));
        // 停用词/单字不入选
        assert!(!candidates.iter().any(|c| c == "我们"));
        assert!(!candidates.iter().any(|c| c == "和" || c == "与" || c == "的"));
        // 频率降序：GPU(2) 排在 CPU(1) 前
        let pos_gpu = candidates.iter().position(|c| c == "GPU").unwrap();
        let pos_cpu = candidates.iter().position(|c| c == "CPU").unwrap();
        assert!(pos_gpu < pos_cpu, "高频词应排前");
    }

    #[test]
    fn extract_candidates_filters_numbers_and_short() {
        let text = "数字 12345 和 42，单字 字，英文 ok";
        let candidates = extract_candidates(text, 10);
        assert!(!candidates.iter().any(|c| c == "12345"));
        assert!(!candidates.iter().any(|c| c == "42"));
        assert!(!candidates.iter().any(|c| c == "字"));
        assert!(!candidates.iter().any(|c| c == "ok"));
    }

    #[test]
    fn suggest_from_ocr_texts_requires_min_count() {
        let texts = ["术语甲出现", "术语甲又出现", "术语甲第三次", "只出现一次的词", "一次一次"];
        let suggestions = suggest_from_ocr_texts(&texts, 3);
        // "出现" 3 次（每行去重后）、"术语" 3 次、"术语甲" 3 次 → 均 ≥3
        assert!(suggestions.contains(&"出现".to_string()));
        assert!(suggestions.contains(&"术语".to_string()));
        assert!(suggestions.contains(&"术语甲".to_string()));
        // 只出现 1 次的 gram（如"甲出"）不入选
        assert!(!suggestions.contains(&"甲出".to_string()));
        // min_count=2 时"一次"（2 次：第 4/5 行）也进入
        let s2 = suggest_from_ocr_texts(&texts, 2);
        assert!(s2.contains(&"一次".to_string()));
    }

    #[test]
    fn split_runs_mixed_content() {
        let runs = split_runs("中文ABC测试 混合 test-词");
        let (cjk_runs, ascii_runs): (Vec<_>, Vec<_>) =
            runs.iter().partition(|(_, is_cjk)| *is_cjk);
        // CJK 段：中文 / 测试 / 混合 / 词
        assert!(cjk_runs.iter().any(|(s, _)| *s == "中文"));
        assert!(cjk_runs.iter().any(|(s, _)| *s == "测试"));
        assert!(cjk_runs.iter().any(|(s, _)| *s == "混合"));
        assert!(cjk_runs.iter().any(|(s, _)| *s == "词"));
        // ASCII 段：ABC / test（连字符分隔）
        assert!(ascii_runs.iter().any(|(s, _)| *s == "ABC"));
        assert!(ascii_runs.iter().any(|(s, _)| *s == "test"));
    }
}
