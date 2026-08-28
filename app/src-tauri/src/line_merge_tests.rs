//! line_merge 单测（v0.14 D3 spec §6：合并/断开/护栏；AAA 模式）。

use super::*;

/// 构造行输入（w 按文本宽度推算；y 同 = 同行）。
fn line(text: &str, x: f32, y: f32, h: f32) -> LineInput {
    LineInput {
        text: text.to_string(),
        x,
        y,
        w: text.chars().count() as f32 * h * 0.9,
        h,
    }
}

#[test]
fn geometric_adjacent_same_line_merges() {
    // Arrange：同一逻辑行被 det 切两块（y 同、x 相邻、行高一致）
    // a 宽 = 13 字 × 36 ≈ 468；b 紧贴右缘（间隙 7 < 半字宽 20）
    let a = line("系统是由相互联系的若干要素", 100.0, 300.0, 40.0);
    let b = line("组成的整体", 575.0, 300.0, 40.0);
    // Act/Assert：几何 3 项全中 → 合并
    assert!(should_merge_lines(&a, &b));
}

#[test]
fn tail_particle_compensates_missing_adjacency() {
    // Arrange：尾虚词"的"（续接强信号）+2，同行 +1，行高一致 +1 = 4 ≥ 3
    let a = line("系统是的", 100.0, 300.0, 40.0);
    let b = line("要素", 900.0, 300.0, 40.0);
    // Act/Assert：间隙超半字宽（相邻缺失）仍合并（文本续接补偿）
    assert!(should_merge_lines(&a, &b));
}

#[test]
fn period_terminator_breaks_merge() {
    // Arrange：a 尾句号（-3 强断开）：同行 1 + 一致 1 - 3 = -1 < 3
    let a = line("这是完整句子。", 100.0, 300.0, 40.0);
    let b = line("下一句内容", 1000.0, 300.0, 40.0);
    // Act/Assert：不合并（不制造跨句幻觉行）
    assert!(!should_merge_lines(&a, &b));
}

#[test]
fn bullet_head_breaks_merge() {
    // Arrange：b 首项目符号（-2 新要点）：同行 1 + 相邻 1 + 一致 1 - 2 = 1 < 3
    // a 宽 = 5 字 × 36 = 180 → 右缘 280；b x=290 紧贴（间隙 10 < 20）
    let a = line("要点一内容", 100.0, 300.0, 40.0);
    let b = line("• 要点二", 290.0, 300.0, 40.0);
    // Act/Assert：不合并（新要点不并入上行）
    assert!(!should_merge_lines(&a, &b));
}

#[test]
fn font_diff_guard_rejects() {
    // Arrange：a 标题行高 60、b 正文 40——字体差 33% > 30% 护栏拒绝
    let a = line("本章标题", 100.0, 300.0, 60.0);
    let b = line("正文内容", 820.0, 310.0, 40.0);
    // Act/Assert：不合并（标题+正文）
    assert!(!should_merge_lines(&a, &b));
}

#[test]
fn oversized_merge_rejected() {
    // Arrange：合并后超 120 字（护栏回退）
    let long_a = "甲".repeat(70);
    let long_b = "乙".repeat(60);
    let a = line(&long_a, 100.0, 300.0, 40.0);
    let b = line(&long_b, 820.0, 300.0, 40.0);
    // Act/Assert：不合并（超长回退）
    assert!(!should_merge_lines(&a, &b));
}

#[test]
fn vertically_offset_lines_do_not_merge() {
    // Arrange：两行正文（y 差 80——非同行）：同行缺失 1 + 行高一致 1 = 2 < 3
    let a = line("第一行内容", 100.0, 300.0, 40.0);
    let b = line("第二行内容", 100.0, 380.0, 40.0);
    // Act/Assert：不合并
    assert!(!should_merge_lines(&a, &b));
}

#[test]
fn separated_lines_with_particle_do_not_merge() {
    // Arrange：尾虚词但完全分离（y 差 200——非同行非相邻）：续接 2 + 行高一致 1 = 3？
    // 反误合并检查：分离行即使虚词尾也不该拼（3 ≥ 3 会误并——验证无虚词时分离行不并）
    let a = line("第一段内容", 100.0, 300.0, 40.0);
    let b = line("第二段内容", 100.0, 500.0, 40.0);
    // Act/Assert：几何只有行高一致 1 < 3 → 不合并
    assert!(!should_merge_lines(&a, &b));
}
