//! 字幕 UI 垃圾源头过滤（REQ-083 / v0.6.0 M1）。
//!
//! @ai-context: 播放器/编辑器/网页等界面文字（水印、选集、倍速、时间码、菜单栏等）
//!              会被 OCR 误识别为字幕——真实会话 8/11 实测：VSCode 状态栏、
//!              网页底部栏被抓入字幕投票器。本模块在**源头**拦截：文本特征命中
//!              黑名单 → 该帧文本不进字幕投票器（不落 OCR 块/不落段/不推事件）。
//! @ai-context: 与 REQ-059 水印过滤互补：本模块 = 文本特征（内容长什么样），
//!              watermark_filter = 区域特征（在哪出现/出现多久）。
//! @ai-context: 纯函数可单测；黑名单 JSON 可校准（数据目录 ui_junk.json 与内置
//!              默认表合并，无法用 JSON 删除默认项——删改用代码，防误删）。
//! @ai-context: standalone=true 的条目要求"独立成词"匹配（前后非字母/汉字边界），
//!              防 "Ln" 命中合法数学内容 "Ln(x)"、防 "文件" 命中正文"这个文件"。

use serde::{Deserialize, Serialize};

/// 垃圾类别（统计/调试用；与前端过滤统计口径一致）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum JunkCategory {
    /// 水印/台标/下载站广告（"学习资料/请勿外传/加微信…"）
    Watermark,
    /// 播放器 UI（"选集/弹幕/倍速/1080P/时间码…"）
    PlayerUi,
    /// 编辑器 UI（"UTF-8/Ln/Col/已选择…"）
    EditorUi,
    /// 应用 UI（"回到主界面/菜单栏…"）
    AppUi,
    /// v0.7.3（REQ-157）：直播互动 UI（"1人正在看/发送/下载/预约…"——
    /// 会话29 实证：直播平台观众数/互动按钮混入画面要点）
    LiveUi,
    /// v0.7.5（REQ-166）：视频页 UI（"简介/评论/点赞/收藏/投币/观看数/标签/
    /// 展开/二维码/推荐…"——会话31 实证：B站页面框架文字混入画面要点）
    VideoPageUi,
}

/// 黑名单条目。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JunkPattern {
    pub category: JunkCategory,
    /// 命中文本（子串匹配；standalone=true 时要求独立成词）
    pub text: String,
    /// 独立成词匹配（前后边界非字母/汉字）；默认子串匹配
    #[serde(default)]
    pub standalone: bool,
    /// 独立成词 + 后随（可含空格）数字才命中——编辑器状态栏
    /// "Ln 3, Col 5" 命中，而数学内容 "Ln(x)" 不误拦
    #[serde(default)]
    pub digit_after: bool,
}

/// UI 垃圾黑名单表（内置默认 + JSON 校准合并）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiJunkList {
    pub patterns: Vec<JunkPattern>,
    /// 时间码特征开关（"00:12"/"1:23:45" 类播放器时间码）
    #[serde(default = "default_true")]
    pub timecode_enabled: bool,
}

fn default_true() -> bool {
    true
}

/// 内置默认黑名单（真实会话 8/11 垃圾字幕样本 + 常见平台特征）。
///
/// @ai-context: 保守原则：只收录"几乎不可能出现在教学讲述中"的界面特征；
///              有歧义的通用词（如"合并/运行"）不收录——宁可漏拦不可误拦
///              （误拦 = 内容丢失，漏拦有 note_filter 兜底 + 预览对照可复查）。
fn default_patterns() -> Vec<JunkPattern> {
    let mut p = Vec::new();
    // 水印/台标/下载站（子串匹配；出现即界面特征）
    for t in [
        "学习资料", "网课资料", "课程资料", "请勿外传", "仅供学习", "仅供内部", "禁止转载",
        "盗版必究", "侵权必究", "加微信", "加V", "公众号", "扫码", "免费领取", "领取资料",
        "下载资料", "课程推广", "广告", "温馨提示",
    ] {
        push_pattern(&mut p, JunkCategory::Watermark, t, false);
    }
    // 播放器 UI（子串匹配；"选集/弹幕/倍速"等不可能是教学正文）
    for t in [
        "选集", "弹幕", "倍速", "1080P", "720P", "4K超清", "超清", "标清", "流畅",
        "自动播放", "暂停", "静音", "全屏", "退出全屏", "下一集", "上一集", "重播",
        "缓存", "跳过", "会员", "开通", "投屏", "点赞", "收藏", "关注", "转发",
        "下载中", "加载中", "缓冲中", "播放中", "已暂停", "音量",
    ] {
        push_pattern(&mut p, JunkCategory::PlayerUi, t, false);
    }
    // 编辑器 UI（"UTF-8/LF" 等子串；"Ln/Col" 走 digit_after——见下）
    for t in ["UTF-8", "UTF8", "CRLF", "LF", "已选择", "制表符", "只读", "另存为", "撤销", "重做", "调试", "编译", "终端", "资源管理器", "版本控制"] {
        push_pattern(&mut p, JunkCategory::EditorUi, t, false);
    }
    // 编辑器状态栏数字坐标（"Ln 3, Col 5"——digit_after 精确定位，
    // 数学内容 "Ln(x)/Col 变量" 不误拦）
    for t in ["Ln", "Col"] {
        p.push(JunkPattern {
            category: JunkCategory::EditorUi,
            text: t.to_string(),
            standalone: true,
            digit_after: true,
        });
    }
    // 应用 UI（短菜单项独立成词——"文件"在正文"这个文件"中不拦）
    for t in ["回到主界面", "主界面", "检查更新", "关于我们", "退出登录", "登录", "注册", "设置", "帮助", "菜单"] {
        push_pattern(&mut p, JunkCategory::AppUi, t, false);
    }
    for t in ["文件", "编辑", "视图", "工具", "窗口"] {
        push_pattern(&mut p, JunkCategory::AppUi, t, true);
    }
    // v0.7.3（REQ-157）：直播互动 UI（会话29 实证：观众数/互动按钮/预约回放）。
    // 观众数子串（"1人正在看/N人在看/N人看过"不可能出现在教学讲述中）；
    // 按钮类用 standalone（"发送请求/下载文件/分享经验/直播课"等正文不误拦）
    for t in ["正在看", "人在看", "人看过"] {
        push_pattern(&mut p, JunkCategory::LiveUi, t, false);
    }
    for t in ["发送", "下载", "预约", "回放", "分享", "直播"] {
        push_pattern(&mut p, JunkCategory::LiveUi, t, true);
    }
    // v0.7.5（REQ-166）：视频页 UI（会话31 实证：B站页面框架——简介/评论/
    // 点赞/收藏/投币/观看数/标签/展开/推荐卡片/二维码/作者信息区）。
    // 交互按钮（点赞/收藏/投币/转发/观看/标签/展开/简介/举报）用 standalone——
    // 教学正文"这个方案值得点赞"（点赞后随 CJK）不误拦；"评论"后随数字
    // （评论7=评论数）才拦（digit_after）——"评论"单独出现多为正文短句；
    // "粉丝"独立成词（B站作者区"粉丝 1.3万"），正文"粉丝经济"（后随 CJK）不拦
    for t in [
        "简介", "点赞", "收藏", "投币", "观看", "标签", "展开", "二维码", "举报",
        "稍后再看", "追番", "充电", "三连", "一键三连", "合集", "剧集", "分P",
        "预告", "花絮", "热门", "排行榜", "投稿", "创作中心", "大会员", "粉丝", "获赞",
    ] {
        push_pattern(&mut p, JunkCategory::VideoPageUi, t, true);
    }
    p.push(JunkPattern {
        category: JunkCategory::VideoPageUi,
        text: "评论".to_string(),
        standalone: true,
        digit_after: true,
    });
    // 复合特征子串（独特性高、无歧义——"评论区/视频简介/播放量"不可能是
    // 教学正文短语）；"相关推荐/推荐视频"为推荐卡片区标题
    for t in [
        "评论区", "视频简介", "相关推荐", "推荐视频", "播放列表", "视频详情",
        "播放量", "观看数", "点赞数", "收藏数", "投币数", "评论数", "弹幕数",
        "充电专属", "会员专享", "一键三连",
    ] {
        push_pattern(&mut p, JunkCategory::VideoPageUi, t, false);
    }
    p
}

/// 追加普通条目（standalone 语义，digit_after 恒 false）。
fn push_pattern(p: &mut Vec<JunkPattern>, category: JunkCategory, text: &str, standalone: bool) {
    p.push(JunkPattern { category, text: text.to_string(), standalone, digit_after: false });
}

impl UiJunkList {
    /// 内置默认表（无外部 JSON 时的行为）。
    pub fn defaults() -> Self {
        Self { patterns: default_patterns(), timecode_enabled: true }
    }

    /// 从 JSON 构建（与内置默认合并，去重）。
    pub fn from_json(json: &str) -> Result<Self, String> {
        let parsed: UiJunkList =
            serde_json::from_str(json).map_err(|e| format!("ui_junk.json 解析失败: {}", e))?;
        Ok(Self::defaults().merge(parsed))
    }

    /// 从数据目录 JSON 加载（文件缺失/损坏 → 内置默认，不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => Self::from_json(&raw).unwrap_or_else(|e| {
                eprintln!("[UiJunk] 黑名单加载失败，使用内置默认: {}", e);
                Self::defaults()
            }),
            Err(_) => Self::defaults(),
        }
    }

    /// 合并另一份表（条目按 (category,text,standalone) 去重）。
    ///
    /// @ai-context: 时间码开关取 AND——内置默认 true，JSON 显式 false 可关闭
    ///              （serde default 保证缺失字段解析为 true，不会误关）。
    pub fn merge(mut self, other: UiJunkList) -> Self {
        for p in other.patterns {
            if !self.patterns.contains(&p) {
                self.patterns.push(p);
            }
        }
        self.timecode_enabled = self.timecode_enabled && other.timecode_enabled;
        self
    }

    /// 分类判定（纯函数）：命中返回类别，未命中 None。
    pub fn classify(&self, text: &str) -> Option<JunkCategory> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return None;
        }
        if self.timecode_enabled && has_timecode(trimmed) {
            return Some(JunkCategory::PlayerUi);
        }
        // v0.7.5（REQ-166）：数字量词短串（"1.3万/48/178/451781112"——播放量/
        // 点赞数/视频号）与二维码/群号（"qh202522"）——整块判定（正文数字不误杀）
        if is_video_page_number(trimmed) || is_qr_like_id(trimmed) {
            return Some(JunkCategory::VideoPageUi);
        }
        for p in &self.patterns {
            let hit = if p.standalone {
                match standalone_match_pos(trimmed, &p.text) {
                    Some(pos) => !p.digit_after || next_non_space_is_digit(trimmed, pos + p.text.chars().count()),
                    None => p.digit_after && digit_after_match_pos(trimmed, &p.text).is_some(),
                }
            } else {
                trimmed.contains(&p.text)
            };
            if hit {
                return Some(p.category);
            }
        }
        None
    }

    /// 是否 UI 垃圾（源头过滤入口）。
    pub fn is_junk(&self, text: &str) -> bool {
        self.classify(text).is_some()
    }
}

/// 时间码检测（纯函数）："00:12" / "1:23" / "1:23:45"（播放器时间码特征）。
///
/// @ai-context: 冒号后必须恰好 2 位数字（"12:345" 不是时间码）；
///              "1:23:45" 走第二段冒号判定；不含分号的纯数字串不命中
///              （年份/数值是合法内容）。
pub fn has_timecode(text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let mut j = i;
            while j < chars.len() && chars[j].is_ascii_digit() {
                j += 1;
            }
            // 数字段后跟 ':' → 检查冒号后格式
            if j < chars.len() && chars[j] == ':' {
                let has_two = j + 3 <= chars.len()
                    && chars[j + 1].is_ascii_digit()
                    && chars[j + 2].is_ascii_digit();
                if has_two {
                    match chars.get(j + 3).copied() {
                        // 第三位仍是数字 → "12:345" 非时间码
                        Some(c) if c.is_ascii_digit() => {}
                        // 第三位是 ':' → "1:23:45"，再查末两位
                        Some(':') => {
                            let last2 = chars.get(j + 4..j + 6);
                            if last2.is_some_and(|s| {
                                s.len() == 2 && s.iter().all(|c| c.is_ascii_digit())
                            }) {
                                return true;
                            }
                        }
                        // 冒号后恰好 2 位且后随非数字/结束 → 时间码
                        _ => return true,
                    }
                }
            }
            i = j; // 跳过该数字段（防 "12:345" 内层 3/4/5 重复判定）
        } else {
            i += 1;
        }
    }
    false
}

/// 视频页数字量词短串判定（纯函数，REQ-166）。
///
/// @ai-context: 播放量/点赞数/评论数/视频号特征："48/178/1.3万/18.0万423/
///              451781112"（会话31 实证）。防误杀设计：
///  - 整块 ≤12 字符且数字系字符占比 ≥60%（"第 48 页"=40% 不拦；正文含数字的长句超长不拦）
///  - 按空白切 token 匹配：纯数字 2-10 位（"2024"年份孤块拦——正文年份几乎
///    必带"年"字，纯数字块是计数特征）；"3.14"含小数点不匹配纯数字；
///    万量词 `^\d+(\.\d+)?万\d*$`（"1.3万/18.0万423"——OCR 常把 万 后数字粘连）；
///    "2024年"含"年"非纯数字不拦
fn is_video_page_number(text: &str) -> bool {
    let total = text.chars().count();
    if total == 0 || total > 12 {
        return false;
    }
    let digitish = text
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '万')
        .count();
    if digitish * 100 / total < 60 {
        return false;
    }
    text.split_whitespace().any(|tok| {
        is_pure_digits(tok) || is_wan_quantity(tok)
    })
}

/// 纯数字短串（2-10 位；"48/178/451781112"；1 位交给单字符规则，11 位是手机号不拦）。
fn is_pure_digits(tok: &str) -> bool {
    let n = tok.chars().count();
    (2..=10).contains(&n) && tok.chars().all(|c| c.is_ascii_digit())
}

/// 万量词（"1.3万/18.0万423"；"3.14"无万不命中——测试规格 3.14 不误杀）。
fn is_wan_quantity(tok: &str) -> bool {
    let n = tok.chars().count();
    if !(2..=12).contains(&n) {
        return false;
    }
    let digits: String = tok.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let rest = &tok[digits.len()..];
    if !rest.starts_with('万') {
        return false;
    }
    // 万 前必须有数字（防"万"单字）；万 后只允许数字粘连（OCR 把计数粘连）。
    // chars().skip(1) 而非 rest[1..]——万 为 3 字节 UTF-8，字节切片会 panic
    !digits.is_empty()
        && digits.chars().all(|c| c.is_ascii_digit() || c == '.')
        && rest.chars().skip(1).all(|c| c.is_ascii_digit())
}

/// 二维码/群号判定（纯函数，REQ-166）：小写字母前缀 + ≥4 位数字尾（6-12 字符）。
///
/// @ai-context: 会话31 实证"qh202522"（二维码/学习群号）；保守边界：全大写
///              缩略词（SGD/CNN）与混合大小写模型名（ResNet50）不命中——
///              大写字母开头直接排除（"qh"小写前缀 + 长数字尾是群号特征）。
fn is_qr_like_id(text: &str) -> bool {
    let n = text.chars().count();
    if !(6..=12).contains(&n) {
        return false;
    }
    let letters: String = text.chars().take_while(|c| c.is_ascii_lowercase()).collect();
    if letters.is_empty() {
        return false;
    }
    let digits = &text[letters.len()..];
    digits.len() >= 4 && digits.chars().all(|c| c.is_ascii_digit())
}

/// 独立成词匹配（纯函数）：返回首个独立成词匹配的字符位置。
///
/// @ai-context: needle 在 hay 中且前后边界非字母/汉字/数字；
///              digit_after 场景据此位置查后随字符。
fn standalone_match_pos(hay: &str, needle: &str) -> Option<usize> {
    let chars: Vec<char> = hay.chars().collect();
    let n: Vec<char> = needle.chars().collect();
    if n.is_empty() || n.len() > chars.len() {
        return None;
    }
    let is_word = |c: char| c.is_alphanumeric() || is_cjk(c);
    for i in 0..=(chars.len() - n.len()) {
        if chars[i..i + n.len()] == n[..] {
            let left_ok = i == 0 || !is_word(chars[i - 1]);
            let right_ok = i + n.len() == chars.len() || !is_word(chars[i + n.len()]);
            if left_ok && right_ok {
                return Some(i);
            }
        }
    }
    None
}

/// 数字紧随匹配（纯函数，v0.7.5）：左边界独立成词 + 右边界为数字（可空格）
/// ——"评论7"（视频页评论数，无空格粘连）在 standalone_match_pos 下右边界
/// 数字被拒（is_word 含数字），digit_after 语义需此放宽路径。
///
/// @ai-context: 仅 digit_after 条目使用（当前：评论/Ln/Col）——"Ln3"（数字
///              紧随）也会命中，数学"Ln(3)"（右边界括号）不受影响（保守）。
fn digit_after_match_pos(hay: &str, needle: &str) -> Option<usize> {
    let chars: Vec<char> = hay.chars().collect();
    let n: Vec<char> = needle.chars().collect();
    if n.is_empty() || n.len() >= chars.len() {
        return None; // 需要右边界数字，长度相等时无后继
    }
    let is_word = |c: char| c.is_alphanumeric() || is_cjk(c);
    for i in 0..=(chars.len() - n.len()) {
        if chars[i..i + n.len()] == n[..] {
            let left_ok = i == 0 || !is_word(chars[i - 1]);
            let mut j = i + n.len();
            while j < chars.len() && (chars[j] == ' ' || chars[j] == '\t') {
                j += 1;
            }
            let right_digit = j < chars.len() && chars[j].is_ascii_digit();
            if left_ok && right_digit {
                return Some(i);
            }
        }
    }
    None
}

/// 匹配位置之后（跳过空格）的首个字符是否为数字（digit_after 判定）。
fn next_non_space_is_digit(hay: &str, after_chars: usize) -> bool {
    let chars: Vec<char> = hay.chars().collect();
    for c in chars.iter().skip(after_chars) {
        if *c == ' ' || *c == '\t' {
            continue;
        }
        return c.is_ascii_digit();
    }
    false
}

/// CJK 统一表意文字区段（含扩展 A）——独立成词边界判定用。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ui_junk_tests.rs"]
mod tests;
