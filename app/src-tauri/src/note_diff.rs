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

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "note_diff_tests.rs"]
mod tests;
