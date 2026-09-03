//! 检索索引·查询计划/RRF/snippet 纯函数（REQ-258，v0.19.0；设计 §5.4/§十一）。
//!
//! @ai-context: 中文 BM25 切词口径校准（M0 spike 定案，2026-09-03）：
//!              索引表用 FTS5 **trigram** tokenizer（SQLite ≥3.34，bundled
//!              已使能）——unicode61 把连续中文句整段当一个 token（无分词），
//!              整句/子串查询全部落空（LIKE 都不如）；trigram 以 3-gram 窗口
//!              索引并支持**子串**匹配，免分词器与 FFI 自定义 tokenizer。
//!              代价：token <3 字符无法入 MATCH → 查询侧做候选词规划：
//!              中文段经疑问/虚词停用字切分后取 3~6 字窗口短语（OR，防改述
//!              落空），恰 2 字的词（如"配色"）转 **kb_chunks LIKE 扫描**
//!              （个人库量级毫秒，纯派生表不触碰 notes 旧链）。
//! @ai-context: RRF 为 v0.19.3 embedding 合流的融合函数（当前 FTS-only 单列
//!              直通，函数先行 TDD）；snippet 复用全站 `==命中==` 高亮渲染协议。

use std::collections::HashMap;

use crate::db::escape_like;

/// RRF 常量 k（BM25/余弦两列合流标准口径 60）。
pub const RRF_K: usize = 60;
/// snippet 命中前上下文（字符）。
pub const SNIPPET_LEAD_CHARS: usize = 50;
/// snippet 总长上界（字符；命中词高亮窗口，防长块刷屏）。
pub const SNIPPET_MAX_CHARS: usize = 160;

/// CJK 连续段内的停用字（疑问/虚词/人称——切分后剩余即关键词候选；
/// 刻意不含"过/了/着"（"学过/练过"保持连续，召回更高））。
const CJK_STOP_CHARS: &str = "的了吗呢哪我怎什么你他她它这那与和或是又要就能会应可吧啊哦嗯在往从把被让给对问知道请告诉讲说聊谈关于为";

/// 查询计划（两引擎分工 + 高亮词）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KbQueryPlan {
    /// FTS5 MATCH 表达式（trigram 短语 OR；无候选 → None）
    pub fts: Option<String>,
    /// LIKE 补充词（2 字中文词——trigram 无法索引；逐条子串匹配）
    pub like_terms: Vec<String>,
    /// snippet/高亮用词（去重保序；含 fts 与 like 两侧）
    pub highlight_terms: Vec<String>,
}

/// 查询 → 候选规划（纯函数；空/全停用词 → 全空三件套——调用方按"无命中"
/// 处理，诚实明说不猜）。
pub fn plan_query(query: &str) -> KbQueryPlan {
    let mut fts_terms: Vec<String> = Vec::new();
    let mut like_terms: Vec<String> = Vec::new();
    let mut highlight: Vec<String> = Vec::new();
    for token in query.split_whitespace() {
        if contains_cjk(token) {
            for seg in split_cjk_stops(token) {
                if seg.chars().count() == 2 {
                    push_unique(&mut like_terms, &seg);
                    push_unique(&mut highlight, &seg);
                } else if seg.chars().count() >= 3 {
                    for win in cjk_windows(&seg) {
                        push_unique(&mut fts_terms, &win);
                    }
                    push_unique(&mut highlight, &seg);
                }
                // 1 字残段丢弃（trigram 与 LIKE 均无意义——诚实舍弃）
            }
        } else if token.chars().count() >= 3 {
            push_unique(&mut fts_terms, token);
            push_unique(&mut highlight, token);
        } else if token.chars().count() == 2 {
            push_unique(&mut like_terms, token);
            push_unique(&mut highlight, token);
        }
    }
    let fts = (!fts_terms.is_empty()).then(|| {
        fts_terms
            .iter()
            .map(|t| format!("\"{}\"", t.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" OR ")
    });
    KbQueryPlan { fts, like_terms, highlight_terms: highlight }
}

/// 段落含 CJK 判定（CJK 统一表意区含扩展——覆盖日常用语）。
fn contains_cjk(s: &str) -> bool {
    s.chars().any(|c| matches!(c as u32, 0x4E00..=0x9FFF | 0x3400..=0x4DBF))
}

/// CJK 连续段按停用字切分（保留段长 ≥2——结果供 fts/like 分工）。
fn split_cjk_stops(run: &str) -> Vec<String> {
    let mut segs = Vec::new();
    let mut cur = String::new();
    for c in run.chars() {
        if CJK_STOP_CHARS.contains(c) {
            if cur.chars().count() >= 2 {
                segs.push(std::mem::take(&mut cur));
            } else {
                cur.clear();
            }
        } else {
            cur.push(c);
        }
    }
    if cur.chars().count() >= 2 {
        segs.push(cur);
    }
    segs
}

/// 段 → 整段 + 3~6 字滑动窗口短语（>6 字时展开：防"学色彩搭配"式前缀粘连
/// 致整段短语落空——整段 verbatim 命中 + 滑窗 OR，bm25 自然把真关键词
/// 所在块排前）。
fn cjk_windows(seg: &str) -> Vec<String> {
    let chars: Vec<char> = seg.chars().collect();
    let n = chars.len();
    if n <= 6 {
        return vec![chars.iter().collect()];
    }
    let mut wins = vec![chars.iter().collect()];
    for k in 3..=6 {
        for start in 0..=n - k {
            wins.push(chars[start..start + k].iter().collect());
        }
    }
    wins
}

fn push_unique(v: &mut Vec<String>, s: &str) {
    if !v.iter().any(|x| x == s) {
        v.push(s.to_string());
    }
}

/// RRF 融合（多列候选 id 列表 → 单一有序去重列表；top_n 截断）。
///
/// @ai-context: score = Σ 1/(k + rank)；并列按先出现列序稳定。FTS-only 期
///              单列直通（返回原序去重）——embedding 列接入后双列融合即用；
///              dead_code 豁免：v0.19.3 语义批的合流接口（TDD 先行——本模块
///              单测已覆盖双列/并列/空集矩阵）。
#[allow(dead_code)]
pub fn rrf_merge<T>(ranked_lists: &[Vec<T>], top_n: usize) -> Vec<T>
where
    T: Eq + std::hash::Hash + Copy,
{
    let mut score: HashMap<T, f64> = HashMap::new();
    let mut first_seen: HashMap<T, usize> = HashMap::new();
    let mut order = 0usize;
    for list in ranked_lists {
        for (rank, id) in list.iter().enumerate() {
            if let std::collections::hash_map::Entry::Vacant(e) = first_seen.entry(*id) {
                e.insert(order);
                order += 1;
            }
            *score.entry(*id).or_insert(0.0) += 1.0 / (RRF_K + rank + 1) as f64;
        }
    }
    let mut entries: Vec<(T, f64, usize)> = score
        .into_iter()
        .map(|(id, s)| (id, s, first_seen[&id]))
        .collect();
    entries.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.2.cmp(&b.2))
    });
    entries.into_iter().take(top_n).map(|(id, _, _)| id).collect()
}

/// 命中 snippet（取首个命中词为中心窗口，全命中词包 `==词==` 标记——
/// 与全站 remark 高亮渲染协议同构；无命中 → 头部截断文本）。
///
/// @ai-context: 大小写不敏感（ASCII）；中文按字面匹配；返回 None 仅当
///              text 为空——调用方直接给空 snippet。
pub fn build_snippet(text: &str, terms: &[String]) -> Option<String> {
    let chars: Vec<char> = text.chars().collect();
    if chars.is_empty() {
        return None;
    }
    let n = chars.len();
    let terms: Vec<Vec<char>> = terms
        .iter()
        .filter(|t| !t.is_empty())
        // 统一小写（ASCII 大小写不敏感；中文不受 to_ascii_lowercase 影响）
        .map(|t| t.chars().map(ci_lower).collect())
        .collect();
    // 找首个命中（含大小写不敏感比对）
    let mut hit = None;
    'outer: for i in 0..n {
        for term in &terms {
            if i + term.len() <= n
                && (0..term.len()).all(|k| ci_lower(chars[i + k]) == term[k])
            {
                hit = Some(i);
                break 'outer;
            }
        }
    }
    // 以命中为中心取窗（前缀省略加 …）
    let (start, end, prefix_ellipsis, suffix_ellipsis) = match hit {
        Some(h) => {
            let start = h.saturating_sub(SNIPPET_LEAD_CHARS);
            let end = (h + (SNIPPET_MAX_CHARS - SNIPPET_LEAD_CHARS)).min(n);
            (start, end, start > 0, end < n)
        }
        None => (0, n.min(SNIPPET_MAX_CHARS), false, n > SNIPPET_MAX_CHARS),
    };
    let window: Vec<char> = chars[start..end].to_vec();
    // 窗口内标记命中（==…==）；标记仅作用于窗口内完整命中的词
    let mut marked = String::new();
    if prefix_ellipsis {
        marked.push('…');
    }
    let mut i = 0usize;
    while i < window.len() {
        let mut matched = false;
        for term in &terms {
            if i + term.len() <= window.len()
                && (0..term.len()).all(|k| ci_lower(window[i + k]) == term[k])
            {
                matched = true;
                marked.push_str("==");
                for c in &window[i..i + term.len()] {
                    marked.push(*c);
                }
                marked.push_str("==");
                i += term.len();
                break;
            }
        }
        if !matched {
            marked.push(window[i]);
            i += 1;
        }
    }
    if suffix_ellipsis {
        marked.push('…');
    }
    Some(marked)
}

/// ASCII 大小写归一（非 ASCII 原样——中文按字面比）。
fn ci_lower(c: char) -> char {
    c.to_ascii_lowercase()
}

/// LIKE 扫描模式（escape_like 防注入通配符——与旧 LIKE 链同口径）。
pub fn like_pattern(term: &str) -> String {
    format!("%{}%", escape_like(term))
}

/// FTS MATCH 失败兜底模式（语法意外 → 整句逐词 LIKE——防御性编程红线）。
pub fn raw_like_pattern(query: &str) -> String {
    format!("%{}%", escape_like(query))
}

#[cfg(test)]
#[path = "kb_fts_tests.rs"]
mod tests;
