//! note_image_merge.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：提取（宽松匹配/空输入/非配图行排除）、精修版已含图
//!              跳过、已有画面要点章节插入、无章节文末追加、降级不动输入。
//! @ai-context: v0.11.5（spec 8️⃣）：真实管线规则版不再产出"## 画面要点"段
//!              （配图行随段消失，merge 自动跳过）——本文件为函数级契约测试，
//!              用手工构造的旧格式夹具验证 merge 对旧输入仍保留配图能力
//!              （AI 精修 image 块 + NoteImage 渲染路径不变），故断言保留。

use crate::note_image_merge::{extract_image_lines, has_image_lines, merge_rule_images};

const RULE_MD: &str = "# 课程标题\n\n正文内容\n\n## 画面要点\n\n- **画面 1**\n  - ![画面 1](session-images/5/full/30000.webp)\n";

#[test]
fn extract_picks_list_item_image_lines() {
    // Act
    let imgs = extract_image_lines(RULE_MD);
    // Assert：只提取配图行（画面要点标题/正文行不含 session-images/ 不提取）
    assert_eq!(imgs.len(), 1);
    assert!(imgs[0].contains("session-images/5/full/30000.webp"));
}

#[test]
fn extract_empty_input_returns_empty() {
    assert!(extract_image_lines("").is_empty());
    assert!(extract_image_lines("   \n  ").is_empty());
}

#[test]
fn extract_excludes_non_list_image_forms() {
    // 正文内嵌 markdown 图（非列表项）不在规则版生成范围——不提取
    let md = "正文 ![内嵌](session-images/5/full/a.webp) 继续\n- ![画面 1](session-images/5/full/b.webp)";
    let imgs = extract_image_lines(md);
    assert_eq!(imgs.len(), 1);
    assert!(imgs[0].contains("b.webp"));
}

#[test]
fn merge_skips_when_rule_has_no_images() {
    // Arrange：规则版无配图
    let base = "# 标题\n\n正文";
    let refined = "## 精修\n\n内容";
    // Act
    let out = merge_rule_images(base, refined);
    // Assert：原样返回精修版
    assert_eq!(out, refined);
}

#[test]
fn merge_skips_when_refined_already_has_images() {
    // Arrange：精修版已有配图（AI 保留/image 块渲染）→ 不干预
    let base = "# 标题\n\n## 画面要点\n\n- ![画面 1](session-images/5/full/30000.webp)";
    let refined = "## 精修\n\n内容\n\n- ![画面 1](session-images/5/full/30000.webp)";
    // Act
    let out = merge_rule_images(base, refined);
    // Assert：原样（不重复追加）
    assert_eq!(out, refined);
}

#[test]
fn merge_appends_new_section_when_refined_has_no_heading() {
    // Arrange：精修版无画面要点章节
    let refined = "## 精修\n\n正文内容";
    // Act
    let out = merge_rule_images(RULE_MD, refined);
    // Assert：文末追加画面要点章节 + 配图行
    assert!(out.contains("## 画面要点"));
    assert!(out.contains("session-images/5/full/30000.webp"));
    // 配图行在文末（追加语义——不破坏精修结构）
    assert!(out.trim_end().ends_with("30000.webp)"));
}

#[test]
fn merge_inserts_after_existing_heading() {
    // Arrange：精修版已有画面要点章节（空——AI 没保留配图）
    let refined = "## 精修\n\n正文\n\n## 画面要点\n";
    // Act
    let out = merge_rule_images(RULE_MD, refined);
    // Assert：配图行插入画面要点标题之后
    let pos_title = out.find("## 画面要点").unwrap();
    let pos_img = out.find("session-images/5/full/30000.webp").unwrap();
    assert!(pos_img > pos_title, "配图行应在画面要点标题之后");
}

#[test]
fn merge_does_not_mutate_inputs() {
    // Arrange
    let base = RULE_MD.to_string();
    let refined = "## 精修\n\n正文".to_string();
    // Act
    let _ = merge_rule_images(&base, &refined);
    // Assert：输入不变（纯函数）
    assert!(base.contains("session-images/5/full/30000.webp"));
    assert_eq!(refined, "## 精修\n\n正文");
}

#[test]
fn has_images_detects_any_session_images_ref() {
    assert!(has_image_lines("- ![画面 1](session-images/5/full/a.webp)"));
    assert!(!has_image_lines("纯文本无图"));
}
