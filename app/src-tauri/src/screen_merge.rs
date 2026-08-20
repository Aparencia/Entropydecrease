//! 画面要点屏级聚合纯函数（v0.7.3 REQ-155/158，ADR-015）。
//!
//! @ai-context: 屏 = 翻页之间的静止画面（课堂记忆的天然单位）。本模块把"块流"
//!              组织为"屏流"：① 屏级相似合并（吸收 OCR 截断抖动——会话29 实证
//!              12 时间戳重复的根因，旧数据聚类兜底）；② 行合并（det 断行拼接，
//!              "若干要"+"素组成"→"若干要素组成"）；③ 版面角色（标题/正文/图注
//!              标签）。全部纯函数可单测；在线 ScreenTracker 与离线聚类共用
//!              同一套逻辑（单管线双出口，延续 REQ-081 原则）。

use crate::types::TextBox;

/// 屏聚类时间 gap 阈值（ms）：帧组间隔超过该值视为新屏（翻回旧页再出现=新屏）。
/// @ai-context: 按会话29 实测校准：OCR 帧间隔（强制兜底 15s + 事件驱动）可达
///              5-58s，初版 3s 会把同屏续帧误分屏；120s 覆盖同屏最长帧间隔，
///              同时区分"翻回旧页"（内容相似但间隔 >2 分钟=新屏）。
pub const CLUSTER_GAP_MS: u64 = 120_000;
/// 屏相似度阈值：帧组与累积文本集合相似 ≥ 该值 → 同屏。
/// @ai-context: 0.6 保守——持久元素（页眉/角标）共享少量块时正文变化仍主导翻页判定。
pub const SCREEN_SIM_THRESHOLD: f32 = 0.6;
/// 块匹配阈值：短文本对长文本的字符包含率 ≥ 该值视为同一块（截断变体吸收）。
pub const BLOCK_MATCH_THRESHOLD: f32 = 0.7;
/// 行合并 y 容差比例：y 中心差 ≤ 行高×该值 → 同行候选。
pub const LINE_Y_TOLERANCE_RATIO: f32 = 0.6;
/// 行合并 x 间隔比例：x 间隔 ≤ 字高×该值（字高≈字宽）→ 同行候选。
pub const LINE_X_GAP_RATIO: f32 = 0.5;
/// 标题判定：行高 ≥ 屏高×该值 → 标题候选（大字块）。
/// @ai-context: 按会话29 实测校准：全帧 1080p 版面区 ~626px 高，PPT 大标题
///              50px（8%）、页眉 36px（5.7%）、正文 30px（4.8%）、图注标签
///              26px（4.2%）——6% 只命中大标题，正文/标签不误判。
pub const TITLE_HEIGHT_RATIO: f32 = 0.06;
/// 标签判定：行 ≤ 该字数且不含虚词 → 图注短词。
pub const LABEL_MAX_CHARS: usize = 6;

/// 屏级聚合输入块（统一契约：DB 行 / OCR 结果 / 测试构造均可映射）。
#[derive(Debug, Clone, PartialEq)]
pub struct ScreenBlockInput {
    pub timestamp_ms: u64,
    pub text: String,
    pub score: f32,
    pub region_kind: Option<String>,
    pub bbox: Option<TextBox>,
}

/// 聚类产出的屏（成员块保留；时间区间由成员推导）。
#[derive(Debug, Clone, PartialEq)]
pub struct ScreenCluster {
    pub first_seen_ms: u64,
    pub last_seen_ms: u64,
    pub blocks: Vec<ScreenBlockInput>,
}

/// 行合并产出的行（bbox 为成员块包围盒；无 bbox 降级时全 0）。
#[derive(Debug, Clone, PartialEq)]
pub struct MergedLine {
    pub text: String,
    pub top: f32,
    pub bottom: f32,
    pub left: f32,
    pub right: f32,
    pub height: f32,
}

/// 版面角色分类结果。
#[derive(Debug, Clone, PartialEq)]
pub struct ScreenRoles {
    pub title: Option<String>,
    pub body: Vec<String>,
    pub labels: Vec<String>,
}

/// 文本归一化（纯函数）：去空白/标点 + 全角→半角。
///
/// @ai-context: 相似度比较的输入——"为什么高手管" 与 "为什么高手管理者思路
///              特别清晰？" 的包含关系由 block_similarity 吸收（归一化只做
///              形态统一，不做截断）。
pub fn normalize(text: &str) -> String {
    text.chars()
        // 全角→半角（U+FF01..U+FF5E → U+0021..U+007E）
        .map(|c| {
            if ('！'..='～').contains(&c) {
                char::from_u32(c as u32 - 0xFEE0).unwrap_or(c)
            } else {
                c
            }
        })
        .filter(|c| !c.is_whitespace())
        .filter(|c| c.is_alphanumeric() || is_cjk(*c))
        .collect()
}

/// CJK 统一表意文字（含扩展 A；与 note_filter/outline 各自私有实现同口径）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

/// 块级字符包含相似（纯函数）：短文本在长文本中的字符包含率。
///
/// @ai-context: 截断变体（前缀子串）相似=1.0（"为什么高手管" ⊂ 标题）；
///              语义不同短词（"要素" vs "要素之间的联关系"）包含率低不匹配。
/// @ai-context: 单字符块仅与单字符块匹配（防"一"匹配任意长句的误配）；
///              ≤2 字块对 ≥4 字文本用长文本比例度量（"要素"2/9=0.22 不匹配，
///              防图注标签与正文误配——宁可漏配截断不可误配语义）。
pub fn block_similarity(a: &str, b: &str) -> f32 {
    let na = normalize(a);
    let nb = normalize(b);
    if na.is_empty() || nb.is_empty() {
        return 0.0;
    }
    let (short, long) = if na.chars().count() <= nb.chars().count() {
        (&na, &nb)
    } else {
        (&nb, &na)
    };
    let short_len = short.chars().count();
    let long_len = long.chars().count();
    if short_len == 1 && long_len > 1 {
        return 0.0; // 单字符防误配
    }
    let common = short.chars().filter(|c| long.contains(*c)).count();
    if short_len <= 2 && long_len >= 4 {
        common as f32 / long_len as f32
    } else {
        common as f32 / short_len as f32
    }
}

/// 文本集合相似度（纯函数）：贪心块匹配覆盖率。
///
/// @ai-context: 覆盖率 = 匹配块数 / max(|prev|, |next|)——持久元素（页眉/角标）
///              少量共享不影响翻页判定（正文变化主导）。
pub fn screen_similarity(prev: &[String], next: &[String]) -> f32 {
    if prev.is_empty() || next.is_empty() {
        return 0.0;
    }
    let mut matched = 0usize;
    let mut used = vec![false; next.len()];
    for a in prev {
        let mut best = 0.0f32;
        let mut best_j: Option<usize> = None;
        for (j, b) in next.iter().enumerate() {
            if used[j] {
                continue;
            }
            let s = block_similarity(a, b);
            if s > best {
                best = s;
                best_j = Some(j);
            }
        }
        if let Some(j) = best_j {
            if best >= BLOCK_MATCH_THRESHOLD {
                matched += 1;
                used[j] = true;
            }
        }
    }
    matched as f32 / prev.len().max(next.len()).max(1) as f32
}

/// 旧数据屏聚类（纯函数）：按时间戳分帧组 → 帧组间相似/时间 gap 判定屏边界。
///
/// @ai-context: 帧组（同时间戳块）为单位比较——同帧块必然同屏，且共享标题块
///              随帧组原子归属（防逐块聚类把新页共享块误并入旧屏）。
/// @ai-context: 累积集合维护"已见文本"（块匹配去重），同屏新块并入供后续比较；
///              翻回旧页（间隔>gap 再出现）= 新屏。
/// @ai-context: 输入须按时间升序（DB 查询已 ORDER BY timestamp_ms）。
pub fn cluster_blocks_into_screens(
    blocks: &[ScreenBlockInput],
    gap_ms: u64,
    sim_threshold: f32,
) -> Vec<ScreenCluster> {
    // ① 按时间戳分帧组（保持输入顺序；同时间戳块聚组）
    let mut groups: Vec<(u64, Vec<&ScreenBlockInput>)> = Vec::new();
    for block in blocks {
        if block.text.trim().is_empty() {
            continue;
        }
        match groups.last_mut() {
            Some((ts, members)) if *ts == block.timestamp_ms => members.push(block),
            _ => groups.push((block.timestamp_ms, vec![block])),
        }
    }
    // ② 帧组 → 屏（gap 或相似度判边界）
    let mut screens: Vec<ScreenCluster> = Vec::new();
    let mut accumulated: Vec<String> = Vec::new();
    let mut last_ts: Option<u64> = None;
    for (ts, members) in groups {
        let texts: Vec<String> = members.iter().map(|b| b.text.clone()).collect();
        let same_screen = match (screens.last(), last_ts) {
            (Some(_), Some(prev_ts)) => {
                let gap_ok = ts.saturating_sub(prev_ts) <= gap_ms;
                let sim_ok = screen_similarity(&accumulated, &texts) >= sim_threshold;
                gap_ok && sim_ok
            }
            _ => false,
        };
        if same_screen {
            let screen = screens.last_mut().unwrap();
            screen.last_seen_ms = ts;
            for b in members {
                screen.blocks.push(b.clone());
            }
        } else {
            screens.push(ScreenCluster {
                first_seen_ms: ts,
                last_seen_ms: ts,
                blocks: members.iter().map(|b| (*b).clone()).collect(),
            });
            // 新屏：累积集合重置为当前帧组文本（防跨屏文本稀释相似度——
            // 累积含旧屏全部文本时，同屏续帧的匹配比例被拉低 → 误分屏）
            accumulated = texts.clone();
            last_ts = Some(ts);
            continue;
        }
        // 同屏：累积集合去重并入（新块留作后续帧的比较基准）
        for t in texts {
            if !accumulated.iter().any(|a| block_similarity(a, &t) >= BLOCK_MATCH_THRESHOLD) {
                accumulated.push(t);
            }
        }
        last_ts = Some(ts);
    }
    screens
}

/// 行合并（纯函数）：bbox y 邻近 + x 相邻 → 同行拼接（det 断行修复）。
///
/// @ai-context: 按 (y 中心, x) 排序后贪心成行：y 中心差 ≤ 行高×LINE_Y_TOLERANCE_RATIO
///              且 x 间隔 ≤ 字高×LINE_X_GAP_RATIO → 同行（文本直接拼接，无空格——
///              中文字符天然连续）；否则换行。x 间隔为负（重叠）视为同行。
/// @ai-context: 无 bbox 块降级：每块一行（按时间序，全 0 包围盒）。
///              混合场景（部分块 bbox 缺失）时无 bbox 块按 y=0 排最前——
///              顺序不完美但不丢内容（诚实降级，注释说明已知局限）。
pub fn line_merge(blocks: &[ScreenBlockInput]) -> Vec<MergedLine> {
    let mut sorted: Vec<&ScreenBlockInput> = blocks.iter().collect();
    sorted.sort_by(|a, b| {
        let ay = a.bbox.map(|bb| bb.y + bb.h / 2.0).unwrap_or(0.0);
        let by = b.bbox.map(|bb| bb.y + bb.h / 2.0).unwrap_or(0.0);
        ay.partial_cmp(&by)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(
                a.bbox
                    .map(|bb| bb.x)
                    .unwrap_or(0.0)
                    .partial_cmp(&b.bbox.map(|bb| bb.x).unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal),
            )
    });
    let mut lines: Vec<MergedLine> = Vec::new();
    for b in sorted {
        let text = b.text.trim();
        if text.is_empty() {
            continue;
        }
        let Some(bb) = b.bbox else {
            // 降级：无 bbox 块每块一行（bbox 全 0，classify_roles 识别为无高度→正文）
            lines.push(MergedLine { text: text.to_string(), top: 0.0, bottom: 0.0, left: 0.0, right: 0.0, height: 0.0 });
            continue;
        };
        let center_y = bb.y + bb.h / 2.0;
        let merged = lines.last_mut().map(|last| {
            let line_h = last.height.max(bb.h);
            let y_ok = (center_y - (last.top + last.height / 2.0)).abs() <= line_h * LINE_Y_TOLERANCE_RATIO;
            let x_gap = bb.x - last.right;
            let x_ok = x_gap <= line_h * LINE_X_GAP_RATIO;
            (y_ok && x_ok, line_h)
        });
        if let Some((true, line_h)) = merged {
            let last = lines.last_mut().unwrap();
            last.text.push_str(text);
            last.right = last.right.max(bb.x + bb.w);
            last.bottom = last.bottom.max(bb.y + bb.h);
            last.height = line_h;
            continue;
        }
        lines.push(MergedLine {
            text: text.to_string(),
            top: bb.y,
            bottom: bb.y + bb.h,
            left: bb.x,
            right: bb.x + bb.w,
            height: bb.h,
        });
    }
    lines
}

/// 版面角色分类（纯函数）：标题 = 字高最大的大字块；标签 = ≤6 字短词；其余正文。
///
/// @ai-context: 屏高 = 行分布范围（max bottom - min top）；标题判定 = 行高 ≥
///              屏高×TITLE_HEIGHT_RATIO（会话29 "系统思维"页眉大字命中）；
///              多个标题候选取字高最大者（同高取首个），其余候选回落正文
///              （"系统思维"页眉与主标题并存时主标题胜出、页眉进正文）。
/// @ai-context: 无 bbox 行（height=0）→ 全部正文（旧数据诚实降级，不猜标题）。
pub fn classify_roles(lines: &[MergedLine]) -> ScreenRoles {
    let sized: Vec<&MergedLine> = lines.iter().filter(|l| l.height > 0.0).collect();
    if sized.is_empty() {
        return ScreenRoles {
            title: None,
            body: lines.iter().map(|l| l.text.clone()).collect(),
            labels: Vec::new(),
        };
    }
    let screen_top = sized.iter().map(|l| l.top).fold(f32::INFINITY, f32::min);
    let screen_bottom = sized.iter().map(|l| l.bottom).fold(f32::NEG_INFINITY, f32::max);
    let screen_h = (screen_bottom - screen_top).max(1.0);
    let mut title: Option<String> = None;
    let mut title_h = 0.0f32;
    let mut body = Vec::new();
    let mut labels = Vec::new();
    for l in lines {
        if l.height > 0.0 && l.height >= screen_h * TITLE_HEIGHT_RATIO {
            if l.height > title_h {
                title_h = l.height;
                title = Some(l.text.clone());
            } else {
                body.push(l.text.clone()); // 未被选中的标题候选回落正文（不丢内容）
            }
            continue;
        }
        if is_label(&l.text) {
            labels.push(l.text.clone());
        } else {
            body.push(l.text.clone());
        }
    }
    ScreenRoles { title, body, labels }
}

/// 标签判定（纯函数）：≤LABEL_MAX_CHARS 字且不含虚词（图注短词启发式）。
///
/// @ai-context: "要素/连接/功能/目标"（图注标签）命中；含"的/是/与"等虚词的
///              短句（"系统是实现…"）不误判——虚词是句法证据。
/// @ai-context: 虚词表排除名词高频字（"要/等"——"要素/要点/等级"是常见
///              图注标签词，不能因含虚词误伤）。
/// @ai-context: pub(crate)（v0.7.5）：screens.rs 视频页共现判定复用（标签形
///              短块 = 作者名/图标垃圾候选）。
pub(crate) fn is_label(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed.chars().count() > LABEL_MAX_CHARS {
        return false;
    }
    const FUNCTION_WORDS: &[char] = &[
        '的', '是', '与', '和', '为', '了', '在', '有', '这', '那', '其', '之', '由', '从', '到',
        '于', '即', '就', '都', '也', '还', '不', '对', '把', '被', '而', '但', '并', '或',
        '及', '中', '上', '下', '向', '将', '使', '会', '让', '给', '以', '可', '应',
        '该',
    ];
    !trimmed.chars().any(|c| FUNCTION_WORDS.contains(&c))
}

/// 跨帧块去重（纯函数）：同位置（bbox 重叠）且文本相似 → 保留首次。
///
/// @ai-context: 同一屏多帧重复识别同位置内容（截断变体）——不清理会被
///              line_merge 误拼（"标题"+"标题截断"→ 拼接成重复文本）；
///              时间序输入，首次出现者保留（内容完整版本优先）。
/// @ai-context: 无 bbox 块按文本相似去重（旧数据降级路径）。
pub fn dedupe_blocks(blocks: &[ScreenBlockInput]) -> Vec<ScreenBlockInput> {
    let mut kept: Vec<&ScreenBlockInput> = Vec::new();
    for b in blocks {
        let dup = kept.iter().any(|k| match (k.bbox, b.bbox) {
            (Some(kb), Some(bb)) => {
                boxes_overlap(kb, bb) && block_similarity(&k.text, &b.text) >= BLOCK_MATCH_THRESHOLD
            }
            _ => block_similarity(&k.text, &b.text) >= BLOCK_MATCH_THRESHOLD,
        });
        if !dup {
            kept.push(b);
        }
    }
    kept.into_iter().cloned().collect()
}

/// bbox 重叠判定（纯函数）：x 区间与 y 区间均重叠。
fn boxes_overlap(a: TextBox, b: TextBox) -> bool {
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

// ────────────────────────────────────────────────────────────
// v0.7.5（REQ-166/167/169）：OCR 净化与屏修复纯函数
// ────────────────────────────────────────────────────────────

/// 单字符碎片块判定（REQ-167）：1 字符且非表格/公式/代码上下文 → 噪声。
///
/// @ai-context: 会话31 实证 `X/?/o/不/三` 全高分通过 0.5 阈值——单字符无
///              上下文信息量不足；结构区域豁免（表格勾选框/公式符号/代码
///              单字符是真实内容）。
pub fn is_single_char_noise(text: &str, region_kind: Option<&str>) -> bool {
    if text.trim().chars().count() != 1 {
        return false;
    }
    !region_kind.is_some_and(|k| STRUCTURE_KINDS.contains(&k))
}

/// 结构区域类型（table/formula/code——与 screens.rs 同口径，集中防漂移）。
const STRUCTURE_KINDS: &[&str] = &["table", "formula", "code"];

/// 边缘条带判定（REQ-166）：bbox 落在帧边缘条带（顶/底 8%、左右 4%）→ 噪声。
///
/// @ai-context: 帧尺寸从同帧块分布推断（DB 不落帧宽高——诚实降级注释：
///              以 OCR 内容包围盒外扩为近似帧边界，比真实帧略小但条带判定
///              相对稳定）；无 bbox（旧数据）→ 不判（None 容忍契约）。
pub fn is_edge_strip(bbox: TextBox, frame_w: f32, frame_h: f32, top: f32, bottom: f32, side: f32) -> bool {
    if frame_w <= 0.0 || frame_h <= 0.0 {
        return false;
    }
    let (x, y, w, h) = (bbox.x, bbox.y, bbox.w, bbox.h);
    y < frame_h * top || y + h > frame_h * bottom || x < frame_w * side || x + w > frame_w * (1.0 - side)
}

/// 推断帧尺寸（纯函数）：同帧块集合 → 内容包围盒外扩 8% 作为近似帧边界。
///
/// @ai-context: 返回 None = 无 bbox 块（旧数据——边缘条带规则不可用，诚实跳过）。
/// @ai-context: 外扩 8% 必须 > 边缘条带侧边比例（4%）——否则最宽内容块
///              （x+w = 内容宽）会被自指判定为右边缘条带误杀（校准见测试）。
pub fn infer_frame_dims(blocks: &[ScreenBlockInput]) -> Option<(f32, f32)> {
    const MARGIN: f32 = 1.08;
    let mut max_w = 0.0f32;
    let mut max_h = 0.0f32;
    for b in blocks {
        let Some(bb) = b.bbox else { continue };
        max_w = max_w.max(bb.x + bb.w);
        max_h = max_h.max(bb.y + bb.h);
    }
    if max_w <= 0.0 || max_h <= 0.0 {
        return None;
    }
    Some((max_w * MARGIN, max_h * MARGIN))
}

/// 屏文本列表（标题+正文+标签——包含率比较的输入）。
fn screen_texts(s: &crate::types::SessionScreen) -> Vec<String> {
    let mut texts: Vec<String> = Vec::new();
    if let Some(t) = &s.title {
        texts.push(t.clone());
    }
    texts.extend(s.body.iter().cloned());
    texts.extend(s.labels.iter().cloned());
    texts
}

/// 方向包含率（纯函数）：cur 中 ≥BLOCK_MATCH_THRESHOLD 相似于 base 任一块的
/// 比例（matched / cur.len()）——"截断子集屏 ⊂ 完整屏"判定。
///
/// @ai-context: 与 screen_similarity 的区别：分母是 cur 自身长度（包含方向
///              度量）——会话31 画面1（6 块截断）⊂ 画面2（16 块完整）时
///              matched/max=6/16=0.375 误判不相似，matched/cur=0.83 正确判相似。
pub fn containment_ratio(cur: &[String], base: &[String]) -> f32 {
    if cur.is_empty() || base.is_empty() {
        return 0.0;
    }
    let matched = cur
        .iter()
        .filter(|c| base.iter().any(|b| block_similarity(c, b) >= BLOCK_MATCH_THRESHOLD))
        .count();
    matched as f32 / cur.len() as f32
}

/// 零跨度屏合并阈值（v0.7.5 REQ-169）：合并条低于聚类条（0.5 vs 0.6）——
/// 净化已滤侧边垃圾，剩余共享文本占比更高；二次机会只救"截断子集"屏。
pub const ZERO_SPAN_SIM_THRESHOLD: f32 = 0.5;
/// 零跨度屏合并时间窗（ms，v0.7.5）：会话31 校准——画面4(02:58)→画面3(00:48)
/// gap=130s 需合并；画面6(09:29) 距前屏 5min 属"翻回旧页=新屏"语义不合并。
pub const ZERO_SPAN_MERGE_GAP_MS: u64 = 180_000;

/// 零跨度屏修复（纯函数，REQ-169）：first=last 的屏并入相邻屏。
///
/// @ai-context: 并入条件双重要求：① 时间窗内（gap ≤ 180s——防"翻回旧页"
///              回看屏被误并）；② 方向包含率 ≥ 0.5（截断子集证据——同屏
///              多帧 OCR 截断被聚类拆成多屏的修复，会话31 画面1/4/5 实证）。
/// @ai-context: 首屏零跨度 → 与次屏比较合并（无前屏可依）；不满足条件的
///              零跨度屏保留（真·单帧快闪——诚实展示，不发明时间）。
pub fn merge_zero_span_screens(screens: Vec<crate::types::SessionScreen>) -> Vec<crate::types::SessionScreen> {
    let mut out: Vec<crate::types::SessionScreen> = Vec::with_capacity(screens.len());
    for s in screens {
        let zero = s.first_seen_ms == s.last_seen_ms;
        if zero {
            if let Some(prev) = out.last_mut() {
                let gap_ok = s.first_seen_ms.saturating_sub(prev.last_seen_ms) <= ZERO_SPAN_MERGE_GAP_MS;
                let cur_texts = screen_texts(&s);
                let prev_texts = screen_texts(prev);
                if gap_ok && containment_ratio(&cur_texts, &prev_texts) >= ZERO_SPAN_SIM_THRESHOLD {
                    merge_screen_into(prev, &s);
                    continue;
                }
            }
        }
        out.push(s);
    }
    // 首屏零跨度：与次屏比较（无前屏的兜底路径）
    if out.len() >= 2 {
        let first = &out[0];
        let zero = first.first_seen_ms == first.last_seen_ms;
        if zero {
            let gap_ok = out[1].first_seen_ms.saturating_sub(first.last_seen_ms) <= ZERO_SPAN_MERGE_GAP_MS;
            let cur_texts = screen_texts(first);
            let next_texts = screen_texts(&out[1]);
            if gap_ok && containment_ratio(&cur_texts, &next_texts) >= ZERO_SPAN_SIM_THRESHOLD {
                let first = out.remove(0);
                merge_screen_into(&mut out[0], &first);
            }
        }
    }
    out
}

/// 屏内容并入（纯函数）：目标屏吸收来源屏的正文/标签/结构（按文本去重）；
/// 时间区间取并集（first 取最小、last 取最大）；标题缺失时用来源标题兜底。
fn merge_screen_into(target: &mut crate::types::SessionScreen, src: &crate::types::SessionScreen) {
    target.first_seen_ms = target.first_seen_ms.min(src.first_seen_ms);
    target.last_seen_ms = target.last_seen_ms.max(src.last_seen_ms);
    if target.title.is_none() {
        target.title = src.title.clone();
    }
    for t in src.body.iter().chain(src.labels.iter()) {
        if !target.body.iter().any(|b| b == t) {
            target.body.push(t.clone());
        }
    }
    for st in &src.structure {
        if !target.structure.iter().any(|x| x == st) {
            target.structure.push(st.clone());
        }
    }
}

/// 重复图去重（纯函数，REQ-169）：相同 image_ref 只保留首个屏引用。
///
/// @ai-context: 归档 full 图按内容指纹去重存储（image_store 双指纹），
///              同一文件 = 同一画面——多屏匹配到同图（会话31 画面6/7/8 共用
///              569515.webp）说明屏间画面未实际变化，只留首个引用（不丢文本）。
pub fn dedupe_screen_images(screens: &mut [crate::types::SessionScreen]) {
    let mut seen: Vec<String> = Vec::new();
    for s in screens.iter_mut() {
        let Some(rel) = s.image_ref.clone() else { continue };
        if seen.contains(&rel) {
            s.image_ref = None;
        } else {
            seen.push(rel);
        }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "screen_merge_tests.rs"]
mod tests;
