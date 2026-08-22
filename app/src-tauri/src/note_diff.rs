//! Markdown 段级 diff（REQ-141 diff 预览 / REQ-144 版本对比共用内核，v0.8.0 M2）。
//!
//! @ai-context: 纯函数：按行（块）比较 before/after，三态标记 unchanged/
//!              added/removed——前端高亮 AI 变化点（本地规则版为基线）；
//!              M4 版本管理（任意两版段级 diff）复用本函数，接口不变。
//! @ai-context: 行级 LCS（最长公共子序列）——AI 精修语义是"整理"（删除+
//!              重组），LCS 能保住未变行、只标真实变化；同内容行顺序变化
//!              诚实展示为 removed+added（不做移动检测——YAGNI）。
//! @ai-context: 规模守卫：行数乘积超上限时回退前缀/后缀朴素 diff
//!              （防 O(n²) 内存爆炸；超长笔记极少见）。

/// diff 操作（三态；serde 小写 tag 供前端渲染/回传）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiffOp {
    /// 两版共有（基线）
    Unchanged(String),
    /// 仅在 after（AI 新增）
    Added(String),
    /// 仅在 before（AI 删除）
    Removed(String),
}

/// LCS 规模上限（行数乘积；超限回退朴素 diff 防内存爆炸）。
const LCS_CELLS_MAX: usize = 4_000_000;

/// 段级 diff（纯函数）：before=本地规则版（基线），after=AI 精修版。
pub fn diff_markdown(before: &str, after: &str) -> Vec<DiffOp> {
    let a: Vec<&str> = before.lines().map(|l| l.trim_end()).collect();
    let b: Vec<&str> = after.lines().map(|l| l.trim_end()).collect();
    if a.is_empty() && b.is_empty() {
        return Vec::new();
    }
    let pairs = if a.len().saturating_mul(b.len()) <= LCS_CELLS_MAX {
        lcs_indices(&a, &b)
    } else {
        naive_common(&a, &b)
    };
    let mut out = Vec::with_capacity(a.len() + b.len());
    let (mut i, mut j) = (0usize, 0usize);
    for &(ai, bj) in &pairs {
        while i < ai {
            out.push(DiffOp::Removed(a[i].to_string()));
            i += 1;
        }
        while j < bj {
            out.push(DiffOp::Added(b[j].to_string()));
            j += 1;
        }
        out.push(DiffOp::Unchanged(a[ai].to_string()));
        i = ai + 1;
        j = bj + 1;
    }
    while i < a.len() {
        out.push(DiffOp::Removed(a[i].to_string()));
        i += 1;
    }
    while j < b.len() {
        out.push(DiffOp::Added(b[j].to_string()));
        j += 1;
    }
    out
}

/// diff 统计（预览徽标：新增/删除/未变行数）。
pub fn diff_stats(ops: &[DiffOp]) -> (usize, usize, usize) {
    let (mut added, mut removed, mut unchanged) = (0, 0, 0);
    for op in ops {
        match op {
            DiffOp::Added(_) => added += 1,
            DiffOp::Removed(_) => removed += 1,
            DiffOp::Unchanged(_) => unchanged += 1,
        }
    }
    (added, removed, unchanged)
}

/// LCS 下标对（全表 DP + 回溯；a/b 行等值判定）。
fn lcs_indices(a: &[&str], b: &[&str]) -> Vec<(usize, usize)> {
    let (n, m) = (a.len(), b.len());
    // dp[i][j] = a[i..n] 与 b[j..m] 的 LCS 长度
    let mut dp = vec![vec![0usize; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[i][j] = if a[i] == b[j] {
                dp[i + 1][j + 1] + 1
            } else {
                dp[i + 1][j].max(dp[i][j + 1])
            };
        }
    }
    let mut result = Vec::new();
    let (mut i, mut j) = (0usize, 0usize);
    while i < n && j < m {
        if a[i] == b[j] {
            result.push((i, j));
            i += 1;
            j += 1;
        } else if dp[i + 1][j] >= dp[i][j + 1] {
            i += 1;
        } else {
            j += 1;
        }
    }
    result
}

/// 朴素公共序列（前缀 + 后缀相同行；中间全部标变化——规模守卫回退路径）。
fn naive_common(a: &[&str], b: &[&str]) -> Vec<(usize, usize)> {
    let mut pairs = Vec::new();
    let mut lo = 0usize;
    while lo < a.len() && lo < b.len() && a[lo] == b[lo] {
        pairs.push((lo, lo));
        lo += 1;
    }
    let mut pa = a.len();
    let mut pb = b.len();
    // 后缀对先收集再逆序入列（保持 (ai,bj) 升序——diff 主循环按序消费）
    let mut suffix = Vec::new();
    while pa > lo && pb > lo && a[pa - 1] == b[pb - 1] {
        pa -= 1;
        pb -= 1;
        suffix.push((pa, pb));
    }
    suffix.reverse();
    pairs.extend(suffix);
    pairs
}

// ────────────────────────────────────────────────────────────
// 章节级分组 diff（Task 11 / spec 6️⃣——工作台并排展示数据源）
// ────────────────────────────────────────────────────────────

/// 章节 diff 状态（四态；serde 小写 tag）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiffStatus {
    Modified,
    Added,
    Removed,
    Unchanged,
}

/// 章节级 diff 分组结果。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SectionDiff {
    pub heading: String,
    pub status: DiffStatus,
    pub removed_lines: Vec<String>,
    pub added_lines: Vec<String>,
}

/// diff 统计（新增/删除/未变行数）。
#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub struct DiffStats {
    pub added: usize,
    pub removed: usize,
    pub unchanged: usize,
}

/// 章节级分组 diff：按 heading 分块 → 块级行 diff → hunk 汇总。
///
/// 章节先按 `heading` 文本精确匹配（相同标题配对）；未匹配章节（标题变更/
/// 重排）按顺序一一配对为单个 Modified hunk——spec 6️⃣：一个逻辑改动=一个
/// hunk，重命名=修改而非 Removed+Added 噪声；剩余未配对按 删除/新增 处理。
pub fn diff_sections(old: &str, new: &str) -> Vec<SectionDiff> {
    let old_secs = parse_sections(old);
    let new_secs = parse_sections(new);

    // 新版本 heading → index 映射（首次出现，处理同名章节）
    use std::collections::HashMap;
    let mut new_by_heading: HashMap<&str, usize> = HashMap::new();
    for (i, sec) in new_secs.iter().enumerate() {
        new_by_heading.entry(sec.heading.as_str()).or_insert(i);
    }

    let mut result = Vec::with_capacity(old_secs.len().max(new_secs.len()));
    let mut new_used = vec![false; new_secs.len()];
    // 未精确匹配的旧章节下标（原顺序）——待与新版未匹配章节顺序配对
    let mut old_unmatched: Vec<usize> = Vec::new();

    for (oi, old_sec) in old_secs.iter().enumerate() {
        if let Some(&ni) = new_by_heading.get(old_sec.heading.as_str()) {
            if !new_used[ni] {
                new_used[ni] = true;
                result.push(compare_blocks(old_sec, &new_secs[ni], old_sec.heading.clone()));
                continue;
            }
        }
        old_unmatched.push(oi);
    }

    // 未匹配章节顺序配对（第 N 个旧未匹配 ↔ 第 N 个新未匹配）→ Modified
    let new_unmatched: Vec<usize> = (0..new_secs.len()).filter(|&i| !new_used[i]).collect();
    let paired = old_unmatched.len().min(new_unmatched.len());
    for k in 0..paired {
        let old_sec = &old_secs[old_unmatched[k]];
        let new_sec = &new_secs[new_unmatched[k]];
        result.push(compare_blocks(old_sec, new_sec, new_sec.heading.clone()));
    }
    // 剩余旧章节（无新版对应）→ 删除
    for &oi in &old_unmatched[paired..] {
        let old_sec = &old_secs[oi];
        result.push(SectionDiff {
            heading: old_sec.heading.clone(),
            status: DiffStatus::Removed,
            removed_lines: old_sec.body.lines().map(String::from).collect(),
            added_lines: vec![],
        });
    }
    // 剩余新章节（无旧版对应）→ 新增
    for &ni in &new_unmatched[paired..] {
        let ns = &new_secs[ni];
        result.push(SectionDiff {
            heading: ns.heading.clone(),
            status: DiffStatus::Added,
            removed_lines: vec![],
            added_lines: ns.body.lines().map(String::from).collect(),
        });
    }

    result
}

/// 两块章节行级 diff → SectionDiff（heading 由调用方决定：精确匹配取原标题，
/// 重命名配对取新版标题——同逻辑一处实现，避免两处重复）。
fn compare_blocks(old: &SectionBlock, new: &SectionBlock, heading: String) -> SectionDiff {
    let ops = diff_markdown(&old.body, &new.body);
    let (added, removed, _) = diff_stats(&ops);
    SectionDiff {
        heading,
        status: if added == 0 && removed == 0 {
            DiffStatus::Unchanged
        } else {
            DiffStatus::Modified
        },
        removed_lines: ops.iter().filter_map(|o| match o {
            DiffOp::Removed(s) => Some(s.clone()),
            _ => None,
        }).collect(),
        added_lines: ops.iter().filter_map(|o| match o {
            DiffOp::Added(s) => Some(s.clone()),
            _ => None,
        }).collect(),
    }
}

/// 内部章节块（解析中间表示）。
struct SectionBlock {
    heading: String,
    body: String,
}

/// 按 `^#{1,6} ` 切分 markdown 为章节块。
fn parse_sections(text: &str) -> Vec<SectionBlock> {
    let lines: Vec<&str> = text.lines().collect();
    let mut sections: Vec<SectionBlock> = Vec::new();
    let mut cur_h = String::new();
    let mut cur_b: Vec<&str> = Vec::new();

    fn flush(
        sections: &mut Vec<SectionBlock>,
        heading: &mut String,
        body: &mut Vec<&str>,
    ) {
        if !heading.is_empty() || !body.is_empty() {
            sections.push(SectionBlock {
                heading: std::mem::take(heading),
                body: body.join("\n"),
            });
            body.clear();
        }
    }

    for line in &lines {
        // 检测 `^#{1,6} ` 开头的 heading 行
        let trimmed = line.trim_start();
        let is_heading = {
            let bytes = trimmed.as_bytes();
            if bytes.first() != Some(&b'#') {
                false
            } else {
                let h_count = bytes.iter().take_while(|&&b| b == b'#').count();
                (1..=6).contains(&h_count) && bytes.get(h_count) == Some(&b' ')
            }
        };

        if is_heading {
            flush(&mut sections, &mut cur_h, &mut cur_b);
            // 提取纯文字标题（去掉 # 前缀和空格）
            cur_h = trimmed.trim_start_matches('#').trim().to_string();
        } else {
            cur_b.push(line);
        }
    }
    flush(&mut sections, &mut cur_h, &mut cur_b);

    sections
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "note_diff_tests.rs"]
mod tests;
