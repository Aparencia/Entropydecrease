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

/// 图像优先档案模板族（讲义 / 实操步骤卡 / 跟练步骤图卡；≤300 行约束，AGENTS.md §3）。
#[path = "artifact_templates_visual.rs"]
mod visual;

/// 语音优先档案模板族（摘要文 / 叙事变体 / 访谈 / 会议；≤300 行约束，AGENTS.md §3）。
#[path = "artifact_templates_voice.rs"]
mod voice;

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
/// @ai-context: 审查 L8：_detail/_analysis 参数保留——与模板族统一签名
///              （build_artifact 分发按模板函数签名路由，未来代码块
///              需要会话上下文时免改签名；下划线前缀注明有意未用）。
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
        ProfileKind::Lecture => visual::lecture_blocks(detail, &analysis, keyframes),
        // v0.7.1：未知档案无专属模板——回退网课讲义（与 profile_by_kind 默认档同口径）
        ProfileKind::Unknown => visual::lecture_blocks(detail, &analysis, keyframes),
        ProfileKind::HandsOn => visual::hands_on_blocks(detail, keyframes, &analysis),
        ProfileKind::TalkingHead => voice::talking_head_blocks(detail, &analysis),
        ProfileKind::Interview => voice::interview_blocks(detail, &analysis),
        ProfileKind::Meeting => voice::meeting_blocks(detail, &analysis, keyframes),
        // v0.7.0 M2：播客/直播 = 摘要文（ASR-only；无画面信号消费）
        ProfileKind::Podcast | ProfileKind::Live => voice::talking_head_blocks(detail, &analysis),
        // 白板/题目讲解 = 讲义式（图像流档案，画面要点作关键图锚点）
        ProfileKind::Whiteboard | ProfileKind::Exercise => visual::lecture_blocks(detail, &analysis, keyframes),
        // 游戏教程 = 步骤卡（操作教程：关键帧步骤）
        ProfileKind::GameTutorial => visual::hands_on_blocks(detail, keyframes, &analysis),
        // 跟练 = 步骤图卡（步骤边界三信号产物；无边界回退关键帧步骤卡）
        ProfileKind::FollowAlong => visual::step_cards_blocks(detail, &analysis, keyframes),
        // 编程实战 = 讲义式 + 代码块（REQ-121；code_frames 为空时 code_blocks
        // 自然返回空——诚实降级，不产空代码块）
        ProfileKind::Coding => {
            let mut blocks = visual::lecture_blocks(detail, &analysis, keyframes);
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
