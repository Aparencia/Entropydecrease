//! 口语数字/符号规范化单测（REQ-060 / v0.6.0 M1）。
//!
//! @ai-context: AAA 模式；覆盖数字发音（整数/小数/大数）、希腊字母上下文
//!              （"派"→π vs "派别"）、运算符、快捷键、JSON 校准、误伤保护。

use super::*;

fn cfg() -> SymbolNormalizeConfig {
    SymbolNormalizeConfig::default()
}

#[test]
fn decimal_spoken_number_converted() {
    // Arrange & Act：规划验收样本
    assert_eq!(normalize("三点一四", &cfg()), "3.14");
    assert_eq!(normalize("派", &cfg()), "π");
    assert_eq!(normalize("大于等于", &cfg()), "≥");
}

#[test]
fn integer_spoken_numbers_converted() {
    let c = cfg();
    assert_eq!(normalize("二百五十六", &c), "256");
    assert_eq!(normalize("两万三千", &c), "23000");
    assert_eq!(normalize("一百零五", &c), "105");
    assert_eq!(normalize("十三", &c), "13");
    assert_eq!(normalize("一千零一夜", &c), "1001夜"); // "夜"非数字字符，保留
    assert_eq!(normalize("二零二四年", &c), "2024年");
    assert_eq!(normalize("三点一四零", &c), "3.14");
}

#[test]
fn number_in_sentence_converted() {
    // Act：数字在句中（上下文数字发音）；"约等于"→"≈"（运算符映射生效）
    assert_eq!(normalize("圆周率约等于三点一四一五", &cfg()), "圆周率≈3.1415");
    assert_eq!(normalize("答案是负三点五", &cfg()), "答案是负3.5");
}

#[test]
fn single_digit_not_converted() {
    // 误伤保护：单字数字词不转换（"三番五次"不得变"3番五次"）
    let c = cfg();
    assert_eq!(normalize("三番五次", &c), "三番五次");
    assert_eq!(normalize("三、内容", &c), "三、内容");
    // "三点"无小数位不转换（"三点钟"语境）
    assert_eq!(normalize("三点见面", &c), "三点见面");
}

#[test]
fn greek_letters_converted() {
    let c = cfg();
    assert_eq!(normalize("阿尔法波", &c), "α波");
    assert_eq!(normalize("贝塔分布", &c), "β分布");
    assert_eq!(normalize("欧米伽系数", &c), "ω系数");
    assert_eq!(normalize("西格马求和", &c), "σ求和");
    // 派 → π（后随非 CJK）
    assert_eq!(normalize("派等于三点一四", &c), "π等于3.14");
    assert_eq!(normalize("派，", &c), "π，");
    assert_eq!(normalize("y等于派", &c), "y等于π");
}

#[test]
fn greek_context_guard_prevents_false_positives() {
    // 误伤保护：后随 CJK 的常用字不转换
    let c = cfg();
    assert_eq!(normalize("派别之争", &c), "派别之争");
    assert_eq!(normalize("派生类", &c), "派生类");
    assert_eq!(normalize("派遣任务", &c), "派遣任务");
    assert_eq!(normalize("温柔以待", &c), "温柔以待");
    assert_eq!(normalize("手套", &c), "手套");
    assert_eq!(normalize("斐波那契数列", &c), "斐波那契数列");
}

#[test]
fn operators_converted() {
    let c = cfg();
    assert_eq!(normalize("a大于等于b", &c), "a≥b");
    assert_eq!(normalize("x小于等于y", &c), "x≤y");
    assert_eq!(normalize("a不等于b", &c), "a≠b");
    assert_eq!(normalize("a约等于b", &c), "a≈b");
    assert_eq!(normalize("a远大于b", &c), "a≫b");
    assert_eq!(normalize("2乘以3", &c), "2×3");
    assert_eq!(normalize("6除以2", &c), "6÷2");
    assert_eq!(normalize("根号2", &c), "√2");
    assert_eq!(normalize("正无穷", &c), "+∞");
    assert_eq!(normalize("负无穷", &c), "-∞");
    assert_eq!(normalize("正负5", &c), "±5");
}

#[test]
fn units_converted() {
    let c = cfg();
    assert_eq!(normalize("37摄氏度", &c), "37℃");
    assert_eq!(normalize("100华氏度", &c), "100℉");
    assert_eq!(normalize("百分号", &c), "%");
}

#[test]
fn shortcuts_converted_case_insensitive() {
    let c = cfg();
    assert_eq!(normalize("control c", &c), "Ctrl+C");
    assert_eq!(normalize("Control V 粘贴", &c), "Ctrl+V 粘贴");
    assert_eq!(normalize("先按 CONTROL Z 撤销", &c), "先按 Ctrl+Z 撤销");
}

#[test]
fn empty_text_safe() {
    let c = cfg();
    assert_eq!(normalize("", &c), "");
    assert_eq!(normalize("   ", &c), "");
}

#[test]
fn normal_teaching_text_untouched() {
    // 误杀保护：正常教学长句只发生预期转换，不破坏结构
    let c = cfg();
    let out = normalize("接下来我们看梯度下降，学习率大于等于零点一", &c);
    assert_eq!(out, "接下来我们看梯度下降，学习率≥0.1");
}

#[test]
fn json_merge_adds_rules() {
    // Arrange：JSON 校准新增规则（与内置合并）
    let json = r#"{
        "rules": [
            {"kind": "operator", "spoken": "左箭头", "written": "←"},
            {"kind": "operator", "spoken": "大于", "written": ">"}
        ]
    }"#;
    // Act
    let c = SymbolNormalizeConfig::from_json(json).unwrap();
    // Assert：新增生效；默认保留；同 (kind,spoken) 去重
    assert_eq!(normalize("a左箭头b", &c), "a←b");
    assert_eq!(normalize("a大于b", &c), "a>b");
    assert_eq!(normalize("三点一四", &c), "3.14");
    assert_eq!(c.rules.iter().filter(|r| r.spoken == "大于").count(), 1);
}

#[test]
fn invalid_json_errors() {
    assert!(SymbolNormalizeConfig::from_json("{bad").is_err());
}

#[test]
fn parse_chinese_number_unit_cases() {
    // 解析边界：单位前无数字（十三=13）、万级跨节（十万=100000）
    assert_eq!(parse_chinese_number("十三"), Some(13.0));
    assert_eq!(parse_chinese_number("十万"), Some(100_000.0));
    assert_eq!(parse_chinese_number("点五"), None, "点前无内容非法");
    assert_eq!(parse_chinese_number(""), None);
}
