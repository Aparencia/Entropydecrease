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

// ────────────────────────────────────────────────
// v0.7.5（REQ-166）：视频页 UI（VideoPageUi）
// ────────────────────────────────────────────────

#[test]
fn video_page_ui_features_hit() {
    // Arrange：会话31 实证样本——页面框架文字
    let list = UiJunkList::defaults();
    // Act & Assert：standalone 词命中（点赞/收藏 已有 PlayerUi 子串条目——
    // 类别归属 PlayerUi 但同为垃圾，断言按 is_junk 口径）
    assert_eq!(list.classify("简介"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("标签"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("展开"), Some(JunkCategory::VideoPageUi));
    assert!(list.is_junk("点赞"));
    assert!(list.is_junk("收藏"));
    assert_eq!(list.classify("投币"), Some(JunkCategory::VideoPageUi));
    // 复合特征子串（评论数/播放量）
    assert_eq!(list.classify("评论区"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("播放量 1.3万"), Some(JunkCategory::VideoPageUi));
    // 评论后随数字（评论数）命中
    assert_eq!(list.classify("评论7"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("评论7？"), Some(JunkCategory::VideoPageUi));
}

#[test]
fn video_page_ui_not_block_teaching_text() {
    // Arrange：误杀保护——正文含同词短语不拦
    let list = UiJunkList::defaults();
    // Act & Assert：standalone 边界（后随/前随 CJK = 词内）
    // 注意：点赞/收藏 等词在 PlayerUi 有历史子串条目（v0.6.0 字幕兜底口径），
    // 教学句避开这些词——standalone 语义在 简介/标签/展开/粉丝 上验证
    assert!(!list.is_junk("这个方案值得大家肯定"));
    assert!(!list.is_junk("给数据打标签"), "标签前随汉字");
    assert!(!list.is_junk("展开公式"), "展开后随汉字");
    assert!(!list.is_junk("粉丝经济"), "粉丝后随汉字");
    assert!(!list.is_junk("项目简介"), "简介前随汉字");
    assert!(!list.is_junk("评论"), "评论单独出现不拦（语义短句）");
}

#[test]
fn number_quantity_tokens_hit() {
    // Arrange：会话31 实证——播放量/点赞数/视频号
    let list = UiJunkList::defaults();
    // Act & Assert
    assert_eq!(list.classify("1.3万"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("1.3万0"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("1.3万 0"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("18.0万423"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("48"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("178"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("451781112"), Some(JunkCategory::VideoPageUi));
    // 测试规格：数字量词正则边界
    assert!(!list.is_junk("3.14"), "小数正文不误杀");
    assert!(!list.is_junk("0.5"), "小数正文不误杀");
    assert!(!list.is_junk("2024年"), "年份带'年'不误杀");
    assert!(!list.is_junk("第 48 页"), "数字占比不足（40%）不拦");
    assert!(!list.is_junk("13800138000"), "11 位手机号不拦");
}

#[test]
fn qr_like_ids_hit() {
    // Arrange：会话31 实证——二维码/学习群号
    let list = UiJunkList::defaults();
    // Act & Assert
    assert_eq!(list.classify("qh202522"), Some(JunkCategory::VideoPageUi));
    // 保守边界：缩略词/模型名/短 ID 不误拦
    assert!(!list.is_junk("SGD"), "全大写缩略词");
    assert!(!list.is_junk("CNN"), "全大写缩略词");
    assert!(!list.is_junk("ResNet50"), "混合大小写模型名（大写开头）");
    assert!(!list.is_junk("win11"), "长度不足 6");
    assert!(!list.is_junk("python310"), "数字尾仅 3 位");
}

#[test]
fn video_page_junk_mergeable_via_json() {
    // Arrange：JSON 校准新增视频页特征（合并语义）
    let json = r#"{"patterns": [{"category": "video-page-ui", "text": "充电专属"}]}"#;
    let list = UiJunkList::from_json(json).unwrap();
    // Act & Assert
    assert_eq!(list.classify("充电专属"), Some(JunkCategory::VideoPageUi));
    assert_eq!(list.classify("简介"), Some(JunkCategory::VideoPageUi), "内置默认仍保留");
}
