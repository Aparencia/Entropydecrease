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
        for p in &self.patterns {
            let hit = if p.standalone {
                match standalone_match_pos(trimmed, &p.text) {
                    Some(pos) => !p.digit_after || next_non_space_is_digit(trimmed, pos + p.text.chars().count()),
                    None => false,
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
