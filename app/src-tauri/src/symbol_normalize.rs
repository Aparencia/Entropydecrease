//! 口语数字/符号规范化（REQ-060 / v0.6.0 M1）。
//!
//! @ai-context: 口语发音 → 书面符号映射："三点一四"→3.14、"派"→π、
//!              "大于等于"→≥、"control c"→Ctrl+C。产物层加工、原料层不动
//!              （可逆契约与 verbal_normalize 一致——本模块只产出加工版）。
//! @ai-context: 上下文判定防误伤："派"→π 仅在后随非 CJK 时生效（"派别/派系"
//!              不转换）；单字数字不转换（"三番五次"不得变"3番五次"）；
//!              "等于"不映射（"等于说"是口语连词，误伤风险高——宁缺勿滥）。
//! @ai-context: 映射表 JSON 可校准（数据目录 symbol_map.json 与内置默认合并）；
//!              中文数字解析（含十百千万亿与小数"点"）为内置能力，JSON 只配
//!              字面规则（希腊字母/运算符/单位/快捷键）。
//! @ai-context: 纯函数无 IO；语料单测覆盖数字/希腊字母/运算符/上下文边界。

use serde::{Deserialize, Serialize};

/// 符号类别。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SymbolKind {
    /// 希腊字母（"阿尔法"→α）
    Greek,
    /// 运算符（"大于等于"→≥）
    Operator,
    /// 单位（"摄氏度"→℃）
    Unit,
    /// 快捷键组合（"control c"→Ctrl+C，大小写不敏感）
    Shortcut,
}

/// 上下文约束。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SymbolContext {
    /// 无条件替换
    #[default]
    Always,
    /// 后随非 CJK 才替换（旧守卫——单字常用字场景；逐步被 Guarded 取代）
    NoCjkAfter,
    /// 词边界守卫：前/后字符须为非 CJK 或命中该 spoken 的白名单
    /// （"派"→π："派别/学派"不转换，"派等于/等于派"转换）
    Guarded,
}

/// 字面映射规则（spoken → written）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SymbolRule {
    pub kind: SymbolKind,
    pub spoken: String,
    pub written: String,
    #[serde(default)]
    pub context: SymbolContext,
}

/// 符号映射配置（内置默认 + JSON 校准合并）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SymbolNormalizeConfig {
    pub rules: Vec<SymbolRule>,
}

/// 内置默认映射表。
///
/// @ai-context: 保守原则：只收录"教学语境下几乎必为符号"的发音；
///              单字常用字（加/乘/度/等于）不映射——误伤成本高于漏映射收益。
fn default_rules() -> Vec<SymbolRule> {
    let mut v = Vec::new();
    let mut push = |kind: SymbolKind, spoken: &str, written: &str, context: SymbolContext| {
        v.push(SymbolRule { kind, spoken: spoken.to_string(), written: written.to_string(), context });
    };
    // 希腊字母（多字转写无歧义 → Always）
    for (s, w) in [
        ("阿尔法", "α"), ("贝塔", "β"), ("伽马", "γ"), ("德尔塔", "δ"),
        ("艾普西龙", "ε"), ("泽塔", "ζ"), ("伊塔", "η"), ("西塔", "θ"),
        ("约塔", "ι"), ("卡帕", "κ"), ("兰布达", "λ"), ("缪", "μ"),
        ("纽", "ν"), ("克西", "ξ"), ("奥米克戎", "ο"), ("西格马", "σ"),
        ("乌普西龙", "υ"), ("普赛", "ψ"), ("欧米伽", "ω"),
    ] {
        push(SymbolKind::Greek, s, w, SymbolContext::Always);
    }
    // "派"→π 用词边界守卫（"派别/学派/一派"不转换；"派等于/等于派/派，"转换）；
    // 柔/套/斐 等单字常用字误伤风险过高（温柔/手套/斐然），默认不映射——
    // 需用时经 symbol_map.json 校准加入（context 选 guarded 或 no-cjk-after）
    push(SymbolKind::Greek, "派", "π", SymbolContext::Guarded);
    // 运算符（"远大于"必须先于"大于"替换——长 spoken 优先在 normalize 内保证）
    for (s, w) in [
        ("远大于", "≫"), ("远小于", "≪"), ("大于等于", "≥"), ("小于等于", "≤"),
        ("不等于", "≠"), ("约等于", "≈"), ("大于", ">"), ("小于", "<"),
        ("正无穷", "+∞"), ("负无穷", "-∞"), ("正负", "±"),
        ("乘以", "×"), ("除以", "÷"), ("根号", "√"),
    ] {
        push(SymbolKind::Operator, s, w, SymbolContext::Always);
    }
    // 单位
    for (s, w) in [("摄氏度", "℃"), ("华氏度", "℉"), ("百分号", "%"), ("千分号", "‰")] {
        push(SymbolKind::Unit, s, w, SymbolContext::Always);
    }
    // 快捷键（control + 单字母，大小写不敏感）
    for c in 'a'..='z' {
        push(
            SymbolKind::Shortcut,
            &format!("control {}", c),
            &format!("Ctrl+{}", c.to_ascii_uppercase()),
            SymbolContext::Always,
        );
    }
    v
}

impl Default for SymbolNormalizeConfig {
    fn default() -> Self {
        Self { rules: default_rules() }.ensure_sorted()
    }
}

impl SymbolNormalizeConfig {
    /// 规则按 spoken 长度降序（长规则优先——"大于等于"先于"大于"，防止
    /// 部分替换吞掉长规则）。审查修复（2026-08-19）：排序移至构造期一次，
    /// normalize 是逐段热路径（大会话数千段），不再每段重复排序。
    fn ensure_sorted(mut self) -> Self {
        self.rules.sort_by_key(|r| std::cmp::Reverse(r.spoken.chars().count()));
        self
    }

    /// 从 JSON 构建（与内置默认合并，按 (kind, spoken) 去重）。
    pub fn from_json(json: &str) -> Result<Self, String> {
        let parsed: SymbolNormalizeConfig =
            serde_json::from_str(json).map_err(|e| format!("symbol_map.json 解析失败: {}", e))?;
        let mut rules = Self::default().rules;
        for r in parsed.rules {
            if !rules.iter().any(|x| x.kind == r.kind && x.spoken == r.spoken) {
                rules.push(r);
            }
        }
        Ok(Self { rules }.ensure_sorted())
    }

    /// 从数据目录 JSON 加载（文件缺失/损坏 → 内置默认，不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => Self::from_json(&raw).unwrap_or_else(|e| {
                eprintln!("[SymbolMap] 映射表加载失败，使用内置默认: {}", e);
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }
}

/// 口语文本 → 书面符号文本（纯规则）。
///
/// @ai-context: 流程：① 字面规则（构造期已按长 spoken 优先排序）；
///              ② 中文数字发音解析（含小数）。
pub fn normalize(text: &str, cfg: &SymbolNormalizeConfig) -> String {
    if text.trim().is_empty() {
        return String::new();
    }
    let mut out = text.to_string();
    for rule in &cfg.rules {
        out = apply_rule(&out, rule);
    }
    replace_number_runs(&out)
}

/// 单条规则应用（纯函数）。
fn apply_rule(text: &str, rule: &SymbolRule) -> String {
    match rule.kind {
        SymbolKind::Shortcut => replace_case_insensitive(text, &rule.spoken, &rule.written),
        _ if rule.context == SymbolContext::Guarded => {
            replace_guarded(text, &rule.spoken, &rule.written)
        }
        _ if rule.context == SymbolContext::NoCjkAfter => {
            replace_no_cjk_after(text, &rule.spoken, &rule.written)
        }
        _ => text.replace(&rule.spoken, &rule.written),
    }
}

/// 词边界守卫替换（Guarded）：前后字符均须"安全"才替换。
///
/// @ai-context: 前字符安全 = 非 CJK 或命中 prev 白名单（"等于派"的"于"）；
///              后字符安全 = 非 CJK 或命中 next 白名单（"派等于"的"等"）。
///              白名单按 spoken 查表（当前仅"派"——数学口语高频组合）。
fn replace_guarded(text: &str, needle: &str, replacement: &str) -> String {
    let (prev_allow, next_allow) = guarded_allowlists(needle);
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find(needle) {
        let (before, after) = rest.split_at(pos);
        out.push_str(before);
        let after_needle = &after[needle.len()..];
        let prev = before.chars().next_back();
        let next = after_needle.chars().next();
        let prev_ok = match prev {
            None => true,
            Some(c) if !is_cjk(c) => true,
            Some(c) => prev_allow.contains(&c),
        };
        let next_ok = match next {
            None => true,
            Some(c) if !is_cjk(c) => true,
            Some(c) => next_allow.contains(&c),
        };
        if prev_ok && next_ok {
            out.push_str(replacement);
        } else {
            out.push_str(needle);
        }
        rest = after_needle;
    }
    out.push_str(rest);
    out
}

/// Guarded 白名单（按 spoken 查表；未登记 → 前后均须非 CJK）。
fn guarded_allowlists(spoken: &str) -> (&'static [char], &'static [char]) {
    match spoken {
        // "派"：前可接 等于约是乘除加减与和比；后可接 等于约是的了值数乘除加减比则即为就号变函
        "派" => (
            &['等', '于', '约', '是', '乘', '除', '加', '减', '与', '和', '比'],
            &['等', '约', '是', '的', '了', '值', '数', '乘', '除', '加', '减', '比', '则', '即', '为', '就', '号', '变', '函'],
        ),
        _ => (&[], &[]),
    }
}

/// 大小写不敏感替换（快捷键："Control C"→Ctrl+C）。
///
/// @ai-context: 字符级扫描（ASCII 小写化不改变字符长度，规避 Unicode
///              小写化长度变化导致的字节偏移错位）。
fn replace_case_insensitive(text: &str, needle: &str, replacement: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let n: Vec<char> = needle.chars().collect();
    if n.is_empty() || n.len() > chars.len() {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let matched = i + n.len() <= chars.len()
            && chars[i..i + n.len()]
                .iter()
                .zip(n.iter())
                .all(|(a, b)| a.eq_ignore_ascii_case(b));
        if matched {
            out.push_str(replacement);
            i += n.len();
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// 后随非 CJK 才替换（"派"→π 防"派别"）。
fn replace_no_cjk_after(text: &str, needle: &str, replacement: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find(needle) {
        let (before, after) = rest.split_at(pos);
        out.push_str(before);
        let after_needle = &after[needle.len()..];
        let next = after_needle.chars().next();
        if next.is_some_and(is_cjk) {
            // 后随 CJK：保留原文（"派别"）
            out.push_str(needle);
        } else {
            out.push_str(replacement);
        }
        rest = after_needle;
    }
    out.push_str(rest);
    out
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

// ────────────────────────────────────────────────────────────
// 中文数字解析（内置能力：零一二两三四五六七八九 + 十百千万亿 + 点）
// ────────────────────────────────────────────────────────────

/// 数字词 → 数值。
fn digit_of(c: char) -> Option<u32> {
    match c {
        '零' => Some(0),
        '一' => Some(1),
        '二' | '两' => Some(2),
        '三' => Some(3),
        '四' => Some(4),
        '五' => Some(5),
        '六' => Some(6),
        '七' => Some(7),
        '八' => Some(8),
        '九' => Some(9),
        _ => None,
    }
}

/// 小节单位（十百千）。
fn small_unit_of(c: char) -> Option<u32> {
    match c {
        '十' => Some(10),
        '百' => Some(100),
        '千' => Some(1000),
        _ => None,
    }
}

/// 是否为数字发音字符（数字词/单位/小数点/大节单位）。
fn is_number_char(c: char) -> bool {
    digit_of(c).is_some() || small_unit_of(c).is_some() || c == '万' || c == '亿' || c == '点'
}

/// 中文数字串 → 数值（"二百五十六"→256、"三点一四"→3.14）。
///
/// @ai-context: 经典分级算法：十/百/千 小节单位（"十三"=13）；万 与 亿 为
///              大节分隔（"十万"=100000、"一万亿"=10^12、"两亿三千万"=2.3e8）；
///              大节单位前无数字补 0（"十万"=10×10000 而非 11×10000）。
fn parse_chinese_number(s: &str) -> Option<f64> {
    let mut frac_digits = String::new();
    let mut seen_dot = false;
    let mut section: u64 = 0; // 当前小节值（万以下）
    let mut section_total: u64 = 0; // 万级累计
    let mut total: u64 = 0; // 亿级累计
    let mut last: Option<u64> = None;
    let mut prev_was_digit = false; // 连续数字位叠加（"二零二四"=2024 而非 4）
    let mut saw_any = false;
    for c in s.chars() {
        if seen_dot {
            let d = digit_of(c)?;
            frac_digits.push(char::from_digit(d, 10)?);
            continue;
        }
        if c == '点' {
            if !saw_any {
                return None; // 点前无内容（"点五"非法）
            }
            seen_dot = true;
            prev_was_digit = false;
            continue;
        }
        if let Some(d) = digit_of(c) {
            // 连续数字位：前位 ×10 叠加（年份式"二零二四"）；单位后新起一位
            last = Some(if prev_was_digit { last.unwrap_or(0) * 10 + d as u64 } else { d as u64 });
            prev_was_digit = true;
            saw_any = true;
        } else if let Some(u) = small_unit_of(c) {
            let d = last.take().unwrap_or(1); // "十三" 十前无数 → 1
            section += d * u as u64;
            prev_was_digit = false;
            saw_any = true;
        } else if c == '万' {
            // 万级：小节 ×1e4 入 section_total（"十万"=10×1e4）
            let d = last.take().unwrap_or(0);
            section += d;
            section_total += section * 10_000;
            section = 0;
            prev_was_digit = false;
            saw_any = true;
        } else if c == '亿' {
            // 亿级：万级累计 + 小节 ×1e8（"一万亿"=1e4×1e8）
            let d = last.take().unwrap_or(0);
            section += d;
            total += (section_total + section) * 100_000_000;
            section_total = 0;
            section = 0;
            prev_was_digit = false;
            saw_any = true;
        } else {
            return None;
        }
    }
    if let Some(d) = last {
        section += d;
    }
    total += section_total + section;
    if total == 0 && !saw_any {
        return None;
    }
    let int_part = total as f64;
    if frac_digits.is_empty() {
        Some(int_part)
    } else {
        let frac = format!("0.{}", frac_digits).parse::<f64>().ok()?;
        Some(int_part + frac)
    }
}

/// 数字发音串替换（纯函数）：连续数字字符段（≥2 字且不以"点"结尾）解析成功则替换。
///
/// @ai-context: 单字不转换（"三番五次"不得变"3番五次"）；"三点"结尾不转换
///              （"三点钟"口语语境，无小数位不算数字）。
fn replace_number_runs(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if is_number_char(chars[i]) {
            let start = i;
            while i < chars.len() && is_number_char(chars[i]) {
                i += 1;
            }
            let run: String = chars[start..i].iter().collect();
            let convertible = run.chars().count() >= 2 && !run.ends_with('点');
            if convertible {
                if let Some(v) = parse_chinese_number(&run) {
                    out.push_str(&format_number(v));
                    continue;
                }
            }
            out.push_str(&run);
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// 数值格式化：整数直出；小数去尾零（"三点一四零"→3.14）。
fn format_number(v: f64) -> String {
    if v.fract() == 0.0 && v.abs() < 1e15 {
        format!("{}", v as i64)
    } else {
        let mut s = format!("{}", v);
        // 去尾零（"3.140"→"3.14"）；整数尾（"3.0"→"3"）
        while s.ends_with('0') {
            s.pop();
        }
        if s.ends_with('.') {
            s.pop();
        }
        s
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "symbol_normalize_tests.rs"]
mod tests;
