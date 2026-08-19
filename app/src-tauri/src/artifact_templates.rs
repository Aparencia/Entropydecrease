//! 五档案产物模板（REQ-052 / v0.5.0 M7，头脑风暴轮 5）。
//!
//! @ai-context: 一种原料，五种模板——`build_artifact(profile, detail, keyframes)`
//!              → 有序 ArtifactBlock[]。模板为纯函数（注入原料 SessionDetail +
//!              关键图候选 + 会话图片列表），可 golden 单测。
//! @ai-context: 块引用原料不复制（refs 携带 segment/ocr 标识）；原料可回看可重算。
//! @ai-context: 复用 M2 机制输出（章节/书面化/重点/术语/讲者）——
//!              analyze_session 是各模板的原料加工前置。

use crate::analysis::{analyze_session, SessionAnalysis};
use crate::artifact::{
    ArtifactBlock, ArtifactKind, BlockPayload, BlockRefs, BlockSource, SessionArtifact,
};
use crate::frame_cluster::KeyFrameCandidate;
use crate::types::SessionDetail;
use crate::video_profile::ProfileKind;

/// 讲义式（网课）：C1 章节 + C3 术语 + 段落（B5 书面化）+ 关键图 + 表格/公式块 + 小结
fn lecture_blocks(detail: &SessionDetail, analysis: &SessionAnalysis, keyframes: &[KeyFrameCandidate]) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    // 标题段落（会话标题）
    blocks.push(ArtifactBlock::new(
        ArtifactKind::Summary,
        order,
        BlockPayload::Text(format!("# {}", detail.session.title)),
    ));
    order += 1;
    // 章节边界 → 小结占位 + 段落
    for chapter in &analysis.chapters {
        blocks.push(ArtifactBlock::new(
            ArtifactKind::Summary,
            order,
            BlockPayload::Text(format!("本章小结 @ {}ms", chapter.time_ms)),
        ));
        order += 1;
        // 该章节时间范围内的转写段 → 书面化段落
        for seg in detail.segments.iter().filter(|s| {
            s.start_ms >= chapter.time_ms
                && analysis
                    .chapters
                    .iter()
                    .find(|c| c.time_ms > chapter.time_ms)
                    .map(|next| s.end_ms <= next.time_ms)
                    .unwrap_or(true)
        }) {
            let text = analysis
                .normalized_segments
                .iter()
                .find(|n| n.segment_id == seg.id)
                .map(|n| n.text.clone())
                .unwrap_or_else(|| seg.text.clone());
            if text.trim().is_empty() {
                continue;
            }
            blocks.push(ArtifactBlock {
                kind: ArtifactKind::Paragraph,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(text),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    // 无章节时兜底：全部段 → 段落
    if analysis.chapters.is_empty() {
        for seg in &detail.segments {
            let text = analysis
                .normalized_segments
                .iter()
                .find(|n| n.segment_id == seg.id)
                .map(|n| n.text.clone())
                .unwrap_or_else(|| seg.text.clone());
            if text.trim().is_empty() {
                continue;
            }
            blocks.push(ArtifactBlock {
                kind: ArtifactKind::Paragraph,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(text),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    // 术语表 → TermAnchor
    for g in &analysis.glossary {
        blocks.push(ArtifactBlock::new(
            ArtifactKind::TermAnchor,
            order,
            BlockPayload::Term { term: g.term.clone(), definition: None },
        ));
        order += 1;
    }
    // 关键图（≤3 张内嵌正文）
    for kf in keyframes.iter().take(3) {
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::KeyImage,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(kf.timestamp_ms) },
            payload: BlockPayload::Image(format!("full/{}.webp", kf.timestamp_ms)),
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    blocks
}

/// 步骤卡（实操）：B6 簇 × 语音段 → StepCard（帧 + 说明 + 时间范围）
///
/// @ai-context: analysis 参数保留（统一模板签名；实操模板暂不消费，
///              登记豁免——后续步骤说明可结合重点标注）。
fn hands_on_blocks(
    detail: &SessionDetail,
    keyframes: &[KeyFrameCandidate],
    _analysis: &SessionAnalysis,
) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    for (i, kf) in keyframes.iter().enumerate() {
        // 关键帧后的首个转写段作为步骤说明
        let desc_seg = detail
            .segments
            .iter()
            .find(|s| s.start_ms >= kf.timestamp_ms)
            .map(|s| s.text.clone())
            .unwrap_or_else(|| format!("步骤 {}", i + 1));
        let range = detail
            .segments
            .iter()
            .find(|s| s.start_ms >= kf.timestamp_ms)
            .map(|s| (kf.timestamp_ms, s.end_ms))
            .unwrap_or((kf.timestamp_ms, kf.timestamp_ms + 5000));
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::StepCard,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(kf.timestamp_ms) },
            payload: BlockPayload::Step {
                image: format!("full/{}.webp", kf.timestamp_ms),
                description: desc_seg,
                start_ms: range.0,
                end_ms: range.1,
                // REQ-123：标签/理由为跟练档案步骤边界专用（实操关键帧步骤卡无标签）
                label: None,
                reason: None,
            },
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    if blocks.is_empty() {
        // 无关键帧兜底：段落直出
        for seg in &detail.segments {
            blocks.push(ArtifactBlock {
                kind: ArtifactKind::Paragraph,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(seg.text.clone()),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    blocks
}

/// 摘要文（口播）：C2 重点 → Claim 排序 + Quote 金句 + 关键词索引
fn talking_head_blocks(detail: &SessionDetail, analysis: &SessionAnalysis) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    // 重点候选 → Claim
    for h in &analysis.highlights {
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::Claim,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(h.time_ms) },
            payload: BlockPayload::Text(h.text.clone()),
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    // 无重点兜底：全部段 → Quote（金句引用）
    if analysis.highlights.is_empty() {
        for seg in &detail.segments {
            let text = analysis
                .normalized_segments
                .iter()
                .find(|n| n.segment_id == seg.id)
                .map(|n| n.text.clone())
                .unwrap_or_else(|| seg.text.clone());
            if text.trim().is_empty() {
                continue;
            }
            blocks.push(ArtifactBlock {
                kind: ArtifactKind::Quote,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(text),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    blocks
}

/// 对话纪要（访谈）：QAPair 结构 + Highlight（A3 讲者标注为可选字段）
fn interview_blocks(detail: &SessionDetail, analysis: &SessionAnalysis) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    // 交替段 → QAPair（奇偶配对近似问答结构；A3 讲者切换点作为分组边界）
    let mut i = 0;
    while i + 1 < detail.segments.len() {
        let q = &detail.segments[i];
        let a = &detail.segments[i + 1];
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::QAPair,
            refs: BlockRefs {
                segment_id: Some(q.id),
                ocr_block_id: None,
                frame_ms: Some(q.start_ms),
            },
            payload: BlockPayload::QA { question: q.text.clone(), answer: a.text.clone() },
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
        i += 2;
    }
    // 重点 → Highlight
    for h in &analysis.highlights {
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::Highlight,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(h.time_ms) },
            payload: BlockPayload::Text(h.text.clone()),
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    blocks
}

/// 会议纪要（会议）：触发词规则 → Decision/Todo + AgendaSection + 投屏截图归档
///
/// @ai-context: analysis 参数保留（统一模板签名；会议模板暂不消费，
///              登记豁免——后续可结合重点标注排序决议）。
fn meeting_blocks(
    detail: &SessionDetail,
    _analysis: &SessionAnalysis,
    keyframes: &[KeyFrameCandidate],
) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    // 触发词规则（"我们决定/下一步/麻烦你/截止"）→ Decision/Todo
    for seg in &detail.segments {
        let text = seg.text.trim();
        if text.is_empty() {
            continue;
        }
        let kind = if text.contains("我们决定") || text.contains("决议") || text.contains("拍板") {
            Some(ArtifactKind::Decision)
        } else if text.contains("下一步") || text.contains("麻烦你") || text.contains("请负责")
            || text.contains("截止") || text.contains("TODO") || text.contains("待办")
        {
            Some(ArtifactKind::Todo)
        } else {
            None
        };
        if let Some(k) = kind {
            blocks.push(ArtifactBlock {
                kind: k,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(text.to_string()),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    // 无触发词兜底：段落直出
    if blocks.is_empty() {
        for seg in &detail.segments {
            blocks.push(ArtifactBlock {
                kind: ArtifactKind::Paragraph,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(seg.text.clone()),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    // 投屏截图归档（关键图）
    for kf in keyframes.iter().take(3) {
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::ScreenShot,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(kf.timestamp_ms) },
            payload: BlockPayload::Image(format!("full/{}.webp", kf.timestamp_ms)),
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    blocks
}

/// 代码帧（REQ-121 T3 编程实战：code 版面区域 OCR 输出的时间戳+文本）。
///
/// @ai-context: 消费 T3 代码提取模块（另一代理）的产出形态；本版从
///              detail.ocr_blocks 按 region_kind=="code" 过滤构造（自包含）。
#[derive(Debug, Clone)]
pub struct CodeFrame {
    pub timestamp_ms: u64,
    pub text: String,
}

/// 同一代码展示段判定窗口（ms）：相邻 code 帧 gap ≤ 该值视为同一段
/// （代码画面停留期间 OCR 每 2s 采样一帧；10s 无新帧 = 切段）。
const CODE_RUN_GAP_MS: u64 = 10_000;

/// 代码块模板（REQ-121 / v0.7.0 M2）：相邻 code 区 OCR 帧文本合并
/// （跨帧相邻重复行去重）+ 时间范围（首帧-末帧）→ CodeBlock 产物
/// （REQ-053 围栏代码块 Markdown 渲染已在 v0.5.0 实现，直接复用）。
///
/// @ai-context: code_frames 为空时返回空（诚实降级——不产空代码块）；
///              语言启发式探测（关键字签名），未知留 None 不猜测。
pub fn code_blocks(
    _detail: &SessionDetail,
    _analysis: &SessionAnalysis,
    code_frames: &[CodeFrame],
) -> Vec<ArtifactBlock> {
    let mut frames: Vec<&CodeFrame> = code_frames.iter().collect();
    // 防御：按时间排序（落库顺序不保证时序）
    frames.sort_by_key(|f| f.timestamp_ms);
    let mut blocks = Vec::new();
    let mut order = 0u32;
    for run in group_runs(&frames) {
        let code = merge_lines(&run);
        if code.trim().is_empty() {
            continue;
        }
        let language = detect_language(&code);
        let first = run[0].timestamp_ms;
        let last = run[run.len() - 1].timestamp_ms;
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::CodeBlock,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(first) },
            payload: BlockPayload::Code {
                code,
                language,
                time_ms: Some(first),
                end_ms: Some(last),
            },
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    blocks
}

/// code 帧 → 连续展示段分组（纯函数）：gap ≤ CODE_RUN_GAP_MS 的相邻帧同一段。
fn group_runs<'a>(frames: &[&'a CodeFrame]) -> Vec<Vec<&'a CodeFrame>> {
    let mut runs: Vec<Vec<&CodeFrame>> = Vec::new();
    for f in frames {
        let continue_run = runs
            .last()
            .is_some_and(|run| f.timestamp_ms.saturating_sub(run.last().unwrap().timestamp_ms) <= CODE_RUN_GAP_MS);
        if continue_run {
            runs.last_mut().unwrap().push(f);
        } else {
            runs.push(vec![f]);
        }
    }
    runs
}

/// 代码段文本合并（纯函数）：逐帧逐行拼接，**跨帧**相邻重复行去重
/// （同一静态代码画面被反复 OCR——共享边界行不重复；帧内重复保留——
/// 真实代码相邻相同语句不被误删）。
fn merge_lines(run: &[&CodeFrame]) -> String {
    let mut out: Vec<(usize, String)> = Vec::new(); // (帧序, 行)
    for (fi, f) in run.iter().enumerate() {
        for line in f.text.lines() {
            let line = line.trim_end().to_string();
            let dup = out
                .last()
                .is_some_and(|(pf, l)| *pf != fi && *l == line);
            if dup {
                continue;
            }
            out.push((fi, line));
        }
    }
    let mut lines: Vec<String> = out.into_iter().map(|(_, l)| l).collect();
    // 去首尾空行（OCR 截断残留）
    while lines.first().is_some_and(|l| l.trim().is_empty()) {
        lines.remove(0);
    }
    while lines.last().is_some_and(|l| l.trim().is_empty()) {
        lines.pop();
    }
    lines.join("\n")
}

/// 代码语言启发式（纯函数；仅前 12 行签名探测，未知返回 None——不猜测）。
/// @ai-context: 审查 M1 修复（v0.7.0 新增代码审查）：原实现 `import ` 排在
///              python 分支首位——Java/JS/TS 的 `import`（模块导入语法）被
///              全部误判为 python。修复：按语言特异签名判定（python 用
///              `def `/`print(`；JS/TS 的 `import ... from` 归 javascript；
///              java 的 `import ...;` 分号结尾归 java——判定顺序改为
///              先特异后通用）。
fn detect_language(code: &str) -> Option<String> {
    let head: Vec<&str> = code.lines().take(12).collect();
    let head = head.join("\n");
    if head.contains("pub fn ") || head.contains("fn ") || head.contains("let mut ")
        || head.contains("impl ")
    {
        Some("rust".into())
    } else if head.contains("def ") || head.contains("print(") {
        // python 特异签名（`import` 不判——多语言共有）
        Some("python".into())
    } else if head.contains("public static") || head.contains("public class")
        || (head.contains("class ") && head.contains("void "))
    {
        Some("java".into())
    } else if head.contains("import ") && head.contains(" from ")
        || head.contains("function ") || head.contains("const ") || head.contains("=>")
        || head.contains("console.") || head.contains("interface ")
    {
        // JS/TS：`import ... from`（ESM）或函数/箭头/接口签名
        Some("javascript".into())
    } else if head.contains("import ") && head.contains(';') {
        // Java/Go 风格 import（分号结尾）——java 已在上面捕获，此处兜底
        Some("java".into())
    } else {
        None
    }
}

/// 步骤图卡（跟练档案 REQ-123 / v0.7.0 M2）：step_boundaries → StepCard。
///
/// @ai-context: 每个 StepBoundary 产出一个 StepCard 块（payload 含
///              time_ms=start_ms/end_ms + label + reason；refs.frame_ms=time_ms
///              供时间轴定位）；**本版有卡无图**（image 空串——配图在 M3
///              REQ-088 图注后完善）；无边界时回退关键帧步骤卡（同实操模板语义）。
fn step_cards_blocks(
    detail: &SessionDetail,
    analysis: &SessionAnalysis,
    keyframes: &[KeyFrameCandidate],
) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    for (order, boundary) in analysis.step_boundaries.iter().enumerate() {
        let label = boundary.label.clone().unwrap_or_else(|| "步骤".to_string());
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::StepCard,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(boundary.time_ms) },
            payload: BlockPayload::Step {
                // 本版有卡无图：配图在 M3 REQ-088 图注后完善
                image: String::new(),
                description: format!("{}（{}）", label, boundary.reason),
                start_ms: boundary.time_ms,
                end_ms: boundary.time_ms,
                label: boundary.label.clone(),
                reason: Some(boundary.reason.clone()),
            },
            order: order as u32,
            source: BlockSource::Local,
            id: 0,
        });
    }
    if blocks.is_empty() {
        // 无步骤边界兜底：关键帧步骤卡（跟练为图像优先档，关键帧丰富）
        return hands_on_blocks(detail, keyframes, analysis);
    }
    blocks
}

/// 构建会话产物（纯函数）：档案模板 → 有序块。
///
/// @ai-context: keyframes 为 M6 投票产出的关键图候选（外部注入）；
///              无关键帧时模板自然降级（不产生图片块，不阻断产物生成）。
pub fn build_artifact(
    profile: ProfileKind,
    detail: &SessionDetail,
    keyframes: &[KeyFrameCandidate],
) -> SessionArtifact {
    let analysis = analyze_session(detail, profile);
    let blocks = match profile {
        ProfileKind::Lecture => lecture_blocks(detail, &analysis, keyframes),
        ProfileKind::HandsOn => hands_on_blocks(detail, keyframes, &analysis),
        ProfileKind::TalkingHead => talking_head_blocks(detail, &analysis),
        ProfileKind::Interview => interview_blocks(detail, &analysis),
        ProfileKind::Meeting => meeting_blocks(detail, &analysis, keyframes),
        // v0.7.0 M2：播客/直播 = 摘要文（ASR-only；无画面信号消费）
        ProfileKind::Podcast | ProfileKind::Live => talking_head_blocks(detail, &analysis),
        // 白板/题目讲解 = 讲义式（图像流档案，画面要点作关键图锚点）
        ProfileKind::Whiteboard | ProfileKind::Exercise => lecture_blocks(detail, &analysis, keyframes),
        // 游戏教程 = 步骤卡（操作教程：关键帧步骤）
        ProfileKind::GameTutorial => hands_on_blocks(detail, keyframes, &analysis),
        // 跟练 = 步骤图卡（步骤边界三信号产物；无边界回退关键帧步骤卡）
        ProfileKind::FollowAlong => step_cards_blocks(detail, &analysis, keyframes),
        // 编程实战 = 讲义式 + 代码块（REQ-121；code_frames 为空时 code_blocks
        // 自然返回空——诚实降级，不产空代码块）
        ProfileKind::Coding => {
            let mut blocks = lecture_blocks(detail, &analysis, keyframes);
            // 审查 M4 修复（v0.7.0 新增代码审查）：code_blocks 内部 order 从 0
            // 起始，extend 后与 lecture_blocks 的 order 冲突（DB 按 block_order
            // 排序读取 → 重复 order 顺序不确定）——此处偏移到 lecture 块数之后。
            let offset = blocks.len() as u32;
            let code_frames: Vec<CodeFrame> = detail
                .ocr_blocks
                .iter()
                .filter(|b| b.region_kind.as_deref() == Some("code"))
                .map(|b| CodeFrame { timestamp_ms: b.timestamp_ms, text: b.text.clone() })
                .collect();
            let mut code_blocks_out = code_blocks(detail, &analysis, &code_frames);
            for b in &mut code_blocks_out {
                b.order += offset;
            }
            blocks.extend(code_blocks_out);
            blocks
        }
    };
    SessionArtifact {
        session_id: detail.session.id,
        profile: profile.as_str().to_string(),
        blocks,
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "artifact_templates_tests.rs"]
mod tests;
