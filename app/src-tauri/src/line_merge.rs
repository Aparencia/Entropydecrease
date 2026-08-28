//! 行合并评分器（v0.14 D3 line_merge；纯函数——识别后文本级合并）。
//!
//! @ai-context: spec §4.3——增强既有 screen_merge::line_merge（纯几何）：
//!              几何信号（垂直重叠/水平间隙/行高一致）+ 文本信号（尾虚词续接/
//!              句号断开/项目符号新要点）+ 护栏（超长回退/字体差）。
//! @ai-context: 反误合并原则（spec §4.3）：宁可少合并（损失完整性）不可错合并
//!              （制造幻觉句子）——文本断开信号权重高于续接信号。

/// 合并判定阈值（几何 3 项全中或文本续接补偿缺项——≥3 合并）
const MERGE_THRESHOLD: i32 = 3;
/// 尾虚词（续接强信号——中文句内连接词）
const TAIL_PARTICLES: [&str; 12] = ["的", "了", "是", "在", "与", "和", "及", "或", "而", "则", "之", "着"];
/// 尾句号类（强断开——句子边界）
const TAIL_TERMINATORS: [char; 4] = ['。', '？', '！', '…'];
/// 首项目符号（新要点——断开）
const HEAD_BULLETS: [&str; 8] = ["•", "·", "-", "—", "1.", "2.", "①", "第"];
/// 合并后最大长度（护栏：超长回退——避免一条行吞掉整屏）
const MERGE_MAX_CHARS: usize = 120;
/// 字体差上限（护栏：h 差 > 30% 不合并——标题+正文）
const FONT_DIFF_RATIO: f32 = 0.3;
/// 半字宽近似（水平间隙 < 行高 × 0.5 视为相邻）
const HALF_CHAR_RATIO: f32 = 0.5;

/// 行输入（合并候选；bbox 必填——无 bbox 场景调用方走旧路径）。
#[derive(Debug, Clone, PartialEq)]
pub struct LineInput {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// 文本尾字是否虚词（续接信号）。
fn tail_is_particle(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    TAIL_PARTICLES.iter().any(|p| t.ends_with(p))
}

/// 文本尾字是否句号类（断开信号）。
fn tail_is_terminator(text: &str) -> bool {
    text.trim().chars().last().is_some_and(|c| TAIL_TERMINATORS.contains(&c))
}

/// 文本首部是否项目符号（新要点断开信号）。
fn head_is_bullet(text: &str) -> bool {
    let t = text.trim();
    HEAD_BULLETS.iter().any(|b| t.starts_with(b))
}

/// 行合并评分决策（spec §4.3）：
/// 几何：同行 +1 / 相邻 +1 / 行高一致 +1；文本：尾虚词 +2、句号 -3、项目符号 -2。
/// 护栏：合并超长 / 字体差 > 30% → 直接拒绝。
pub fn should_merge_lines(a: &LineInput, b: &LineInput) -> bool {
    // 护栏 1：合并超长回退
    if a.text.chars().count() + b.text.chars().count() > MERGE_MAX_CHARS {
        return false;
    }
    // 护栏 2：字体差 > 30% 不合并（标题+正文——行高作字体近似）
    let max_h = a.h.max(b.h);
    if max_h > 0.0 && (a.h - b.h).abs() / max_h > FONT_DIFF_RATIO {
        return false;
    }
    // 几何信号：垂直重叠 > 50%（同行）
    let ay = a.y + a.h / 2.0;
    let by = b.y + b.h / 2.0;
    let same_line = (ay - by).abs() <= max_h * HALF_CHAR_RATIO;
    // 几何信号：水平间隙 < 半字宽（相邻）
    let gap = b.x - (a.x + a.w);
    let adjacent = gap >= 0.0 && gap < max_h * HALF_CHAR_RATIO;
    // 几何信号：行高一致（差 ≤ 30%——与护栏同口径，护栏已挡超差）
    let h_consistent = max_h > 0.0 && (a.h - b.h).abs() / max_h <= FONT_DIFF_RATIO;

    let mut score = 0;
    if same_line { score += 1; }
    if adjacent { score += 1; }
    if h_consistent { score += 1; }
    if tail_is_particle(&a.text) { score += 2; }
    if tail_is_terminator(&a.text) { score -= 3; } // 强断开
    if head_is_bullet(&b.text) { score -= 2; } // 新要点

    score >= MERGE_THRESHOLD
}

#[cfg(test)]
#[path = "line_merge_tests.rs"]
mod tests;
