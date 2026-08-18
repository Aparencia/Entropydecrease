//! 字幕 UI 垃圾黑名单单测（REQ-083 / v0.6.0 M1）。
//!
//! @ai-context: AAA 模式；覆盖四类垃圾特征矩阵（真实会话 8/11 垃圾字幕样本）、
//!              standalone 独立成词边界、时间码判定、JSON 校准合并、误杀保护
//!              （正常教学长句/数学内容不误拦）。

use super::*;

#[test]
fn watermark_features_hit() {
    // Arrange：水印/台标特征（真实会话样本）
    let list = UiJunkList::defaults();
    // Act & Assert：各特征命中对应类别
    assert_eq!(list.classify("学习资料"), Some(JunkCategory::Watermark));
    assert_eq!(list.classify("请勿外传 请勿外传"), Some(JunkCategory::Watermark));
    assert_eq!(list.classify("加微信领取资料"), Some(JunkCategory::Watermark));
}

#[test]
fn player_ui_features_hit() {
    let list = UiJunkList::defaults();
    assert_eq!(list.classify("选集 01 弹幕 倍速"), Some(JunkCategory::PlayerUi));
    assert_eq!(list.classify("1080P 高清"), Some(JunkCategory::PlayerUi));
    assert_eq!(list.classify("下一集 自动播放"), Some(JunkCategory::PlayerUi));
}

#[test]
fn editor_ui_features_hit() {
    let list = UiJunkList::defaults();
    assert_eq!(list.classify("UTF-8 LF"), Some(JunkCategory::EditorUi));
    assert_eq!(list.classify("已选择 1 个"), Some(JunkCategory::EditorUi));
    // standalone 独立成词："Ln 3, Col 5" 命中
    assert_eq!(list.classify("Ln 3, Col 5"), Some(JunkCategory::EditorUi));
}

#[test]
fn app_ui_features_hit() {
    let list = UiJunkList::defaults();
    assert_eq!(list.classify("回到主界面"), Some(JunkCategory::AppUi));
    // 菜单栏整行（standalone 词组合）
    assert_eq!(list.classify("文件 编辑 视图 工具 帮助"), Some(JunkCategory::AppUi));
}

#[test]
fn timecode_detection() {
    let list = UiJunkList::defaults();
    // 播放器时间码命中
    assert_eq!(list.classify("00:12"), Some(JunkCategory::PlayerUi));
    assert_eq!(list.classify("1:23:45"), Some(JunkCategory::PlayerUi));
    assert_eq!(list.classify("进度 12:30 / 45:00"), Some(JunkCategory::PlayerUi));
    // 非时间码不命中
    assert!(!has_timecode("12:345"));
    assert!(!has_timecode("3.14"));
    assert!(!has_timecode("2024"));
    assert!(!has_timecode(""));
}

#[test]
fn legit_teaching_content_not_blocked() {
    // Arrange：真实教学正文（误杀保护——正常长句/数学内容不误拦）
    let list = UiJunkList::defaults();
    // Act & Assert
    assert!(!list.is_junk("今天我们来学习卷积神经网络的梯度下降"));
    assert!(!list.is_junk("Ln(x) 是自然对数函数，注意底数为 e"));
    assert!(!list.is_junk("这个文件里记录了实验数据"));
    assert!(!list.is_junk("三点一四乘以二的平方约等于十二点五六"));
    assert!(!list.is_junk("第一章 变量与数据类型"));
    // standalone 边界：正文"文件"不拦（子串在词内）
    assert_eq!(list.classify("这个文件", ), None);
}

#[test]
fn standalone_boundary_semantics() {
    // Arrange：standalone=true 的 "文件" 独立成词才命中
    let mut list = UiJunkList::defaults();
    list.patterns = vec![JunkPattern {
        category: JunkCategory::AppUi,
        text: "文件".into(),
        standalone: true,
        digit_after: false,
    }];
    // Act & Assert
    assert_eq!(list.classify("文件"), Some(JunkCategory::AppUi));
    assert_eq!(list.classify("文件 编辑"), Some(JunkCategory::AppUi));
    assert_eq!(list.classify("这个文件"), None, "词内子串不得命中");
    assert_eq!(list.classify("文件类型"), None, "后随汉字视为词内");
    assert_eq!(list.classify("pdf文件"), None, "前随字母视为词内");
}

#[test]
fn empty_text_safe() {
    let list = UiJunkList::defaults();
    assert_eq!(list.classify(""), None);
    assert_eq!(list.classify("   "), None);
    assert!(!list.is_junk(""));
}

#[test]
fn json_merge_adds_patterns() {
    // Arrange：JSON 校准新增条目（与内置合并）
    let json = r#"{
        "timecodeEnabled": false,
        "patterns": [
            {"category": "watermark", "text": "内部课程专用"},
            {"category": "player-ui", "text": "倍速"}
        ]
    }"#;
    // Act
    let list = UiJunkList::from_json(json).unwrap();
    // Assert：新增条目生效；内置默认仍保留（合并语义）；去重后 "倍速" 只一份
    assert_eq!(list.classify("内部课程专用"), Some(JunkCategory::Watermark));
    assert_eq!(list.classify("倍速 1.25"), Some(JunkCategory::PlayerUi));
    assert_eq!(list.patterns.iter().filter(|p| p.text == "倍速").count(), 1);
}

#[test]
fn invalid_json_falls_back_to_defaults() {
    // Act & Assert：损坏 JSON → Err（调用方 load 已兜底默认）
    assert!(UiJunkList::from_json("{not json").is_err());
}

#[test]
fn timecode_disabled_skips_timecode_rule() {
    // Arrange：JSON 关闭时间码
    let json = r#"{"timecodeEnabled": false, "patterns": []}"#;
    let list = UiJunkList::from_json(json).unwrap();
    // Act & Assert：时间码不命中；其他特征不受影响
    assert!(!list.is_junk("00:12"));
    assert!(list.is_junk("回到主界面"));
}
