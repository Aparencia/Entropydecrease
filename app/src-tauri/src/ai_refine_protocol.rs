//! 会话→笔记 AI 精修协议（REQ-141，v0.8.0 M2；F3 协议 v2，2026-08-21）。
//!
//! @ai-context: 精修=整理不创作（与知识补充 REQ-142 严格区分）：去非知识
//!              内容（寒暄/废话/重复）+ 层级结构化 + 不增补课程外事实——
//!              提示词核心指令（prompts/note_refine.json 按档案分组模板）。
//! @ai-context: schema 强校验（防御性编程铁律）：非法响应丢弃回退纯规则
//!              （不丢不假）；anchor_ref 存在性跨片校验在 command 层
//!              （引用全局锚点 id 集）。
//! @ai-context: 输入=note_filter 规则草稿（markdown + 档案 + 术语表 + 章节
//!              边界）；输出=结构化块数组（paragraph/list/term/highlight/
//!              quote/image），to_markdown 供预览与落库（渲染器统一处理）。
//! @ai-context: F3 协议 v2（2026-08-21）：① schema_version（缺省=1，v2=2——
//!              向后兼容：旧任务结果/缓存无 version 字段仍按 v1 解析）；
//!              ② image 块类型（content=本地配图引用 session-images/ 相对
//!              路径——解决精修丢图，AI 显式保留配图行）；③ 片间上下文字段
//!              （slice_index/slice_total/prev_summary/next_summary——长笔记
//!              切片时模型知道自己是第几片，防章节标题重复/结构错乱）。

use serde::{Deserialize, Serialize};

/// 单节标题最大字符数（防超长标题污染层级）。
const HEADING_MAX_CHARS: usize = 200;
/// 单块内容最大字符数（防单块刷屏/超长响应）。
const BLOCK_MAX_CHARS: usize = 4000;
/// 响应总块数上限（防刷屏——非法大响应直接丢弃）。
const BLOCKS_TOTAL_MAX: usize = 200;
/// 单节 image 块数上限（防配图刷屏——F3 v2）。
const IMAGES_PER_SECTION_MAX: usize = 5;
/// 片间摘要长度上限（prev/next summary 截断——防超长上下文撑爆提示词）。
pub const SUMMARY_MAX_CHARS: usize = 200;

/// 协议版本（v2=1? 语义：缺省 1；本版响应显式写 2——见 AiRefineResponse）。
pub const SCHEMA_VERSION_V2: u32 = 2;

/// 合并各片精修输出 + 章节锚点回挂（spec 7️⃣，2026-08-22）。
///
/// @ai-context: 各片 to_markdown 以 "\n\n" 连接（原 run_refine_task_inner 合并
///              逻辑收口至协议层）；随后按 `## 标题` 行精确匹配回挂剥离的
///              章节锚点（大小写敏感——精修不改变标题大小写），未匹配不挂
///              （诚实降级：AI 合并/改名后宁缺勿错）。
pub fn merge_refine_slices(slices: &[String], anchors: &[(String, u64)]) -> String {
    let joined = slices.join("\n\n");
    crate::anchor_strip::reattach_chapter_anchors(&joined, anchors)
}

/// 精修输入（规则草稿上下文——提示词参考，AI 不得增补课程外事实）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRefineRequest {
    /// 规则草稿 markdown（去噪后基线——AI 在此基础上整理，不重写事实）
    pub content: String,
    /// 视频档案（kebab-case：网课/实操/口播/访谈/会议…——提示词模板分组）
    pub profile: String,
    /// 术语表（会话内已出现术语——AI 保留并结构化，不新增）
    pub glossary: Vec<String>,
    /// 章节边界标题（网课档案提供——AI 沿用层级，不自行发明章节）
    pub chapters: Vec<String>,
    /// F3 v2：本片序号（1 起）——模型据此知道自己是长笔记的第几片
    #[serde(default)]
    pub slice_index: usize,
    /// F3 v2：总片数（0=未知/单片——提示词按需说明）
    #[serde(default)]
    pub slice_total: usize,
    /// F3 v2：前片结尾摘要（衔接上下文——防片间断裂/重复开头）
    #[serde(default)]
    pub prev_summary: Option<String>,
    /// F3 v2：后片开头摘要（预告——防片尾截断感）
    #[serde(default)]
    pub next_summary: Option<String>,
}

/// 精修响应（结构强校验：sections 非空、heading/blocks content 非空）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRefineResponse {
    /// F3 v2：协议版本（缺省 1=旧响应；v2 显式=2——向后兼容解析）
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub sections: Vec<AiRefineSection>,
}

/// schema_version 缺省值（v1 响应无字段 → 1）。
fn default_schema_version() -> u32 {
    1
}

impl Default for AiRefineResponse {
    /// 旧构造路径默认 v1（兼容测试/旧调用方；适配器显式升级 v2）。
    fn default() -> Self {
        Self { schema_version: 1, sections: Vec::new() }
    }
}

/// 单节（标题 + 块序列）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRefineSection {
    pub heading: String,
    pub blocks: Vec<AiRefineBlock>,
}

/// 内容块（渲染器按类型渲染；anchor_ref 溯源原章节/段）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRefineBlock {
    #[serde(rename = "type")]
    pub block_type: AiRefineBlockType,
    pub content: String,
    /// 锚点引用（可选：章节标题或原文段 id；存在性 command 层强校验）
    pub anchor_ref: Option<String>,
}

/// 块类型（渲染形态与语义）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiRefineBlockType {
    /// 普通段落
    Paragraph,
    /// 列表（content 每行一项）
    List,
    /// 术语条目（术语表结构化）
    Term,
    /// 重点（加粗强调）
    Highlight,
    /// 引用（原文摘录——精修=整理，引用不篡改）
    Quote,
    /// F3 v2：配图（content=本地配图引用 session-images/{sid}/{rel}——
    /// 精修保留规则版画面配图；校验路径前缀防注入）
    Image,
}

impl AiRefineResponse {
    /// schema 强校验（纯函数）：标题/内容非空、类型合法、总量上限。
    ///
    /// @ai-context: 校验失败 → 丢弃 AI 结果回退纯规则（防御性编程铁律——
    ///              非法响应不得进入笔记管线）；anchor_ref 存在性由
    ///              command 层带全局锚点集做（本层无输入上下文）。
    /// @ai-context: F3 v2：image 块 content 必须匹配 session-images/ 前缀
    ///              （本地路径引用——防注入任意路径/URL）；每节 image 块数
    ///              ≤5（防配图刷屏）；schema_version 不校验数值（1/2 均合法，
    ///              版本兼容由调用方处理）。
    pub fn validate(&self) -> Result<(), String> {
        if self.sections.is_empty() {
            return Err("精修响应缺少章节".to_string());
        }
        let mut total = 0usize;
        for sec in &self.sections {
            let heading = sec.heading.trim();
            if heading.is_empty() || heading.chars().count() > HEADING_MAX_CHARS {
                return Err(format!("章节标题为空或超长: {:?}", sec.heading));
            }
            if sec.blocks.is_empty() {
                return Err(format!("章节「{}」无内容块", heading));
            }
            let mut images_in_section = 0usize;
            for b in &sec.blocks {
                let content = b.content.trim();
                if content.is_empty() || content.chars().count() > BLOCK_MAX_CHARS {
                    return Err("内容块为空或超长".to_string());
                }
                if b.block_type == AiRefineBlockType::Image {
                    // F3 v2：配图必须引用本地会话图库（相对路径前缀校验）
                    if !content.starts_with("session-images/") {
                        return Err("image 块必须引用本地会话图库（session-images/ 前缀）".to_string());
                    }
                    images_in_section += 1;
                }
                if let Some(anchor) = &b.anchor_ref {
                    if anchor.trim().is_empty() || anchor.chars().count() > 100 {
                        return Err("锚点引用为空或超长".to_string());
                    }
                }
                total += 1;
            }
            if images_in_section > IMAGES_PER_SECTION_MAX {
                return Err(format!("章节「{}」配图块超上限（{} > {}）", heading, images_in_section, IMAGES_PER_SECTION_MAX));
            }
        }
        if total > BLOCKS_TOTAL_MAX {
            return Err(format!("精修响应块数超上限（{} > {}）", total, BLOCKS_TOTAL_MAX));
        }
        Ok(())
    }

    /// 渲染为 Markdown（纯函数：标题层级 + 块渲染——预览/落库统一出口）。
    ///
    /// @ai-context: 渲染规则：paragraph=正文段；list=每行 "- " 前缀；term=
    ///              "- **内容**"；highlight=加粗；quote=引用块"> "；
    ///              image=原样配图行 `- ![画面](path)`（F3 v2——与规则版
    ///              画面要点行同形态，前端渲染器统一处理）。
    pub fn to_markdown(&self) -> String {
        let mut out = String::new();
        for sec in &self.sections {
            out.push_str(&format!("## {}\n\n", sec.heading.trim()));
            for b in &sec.blocks {
                match b.block_type {
                    AiRefineBlockType::Paragraph => {
                        out.push_str(b.content.trim());
                        out.push_str("\n\n");
                    }
                    AiRefineBlockType::List => {
                        for line in b.content.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
                            out.push_str(&format!("- {}\n", line));
                        }
                        out.push('\n');
                    }
                    AiRefineBlockType::Term => {
                        out.push_str(&format!("- **{}**\n", b.content.trim()));
                    }
                    AiRefineBlockType::Highlight => {
                        out.push_str(&format!("**{}**\n\n", b.content.trim()));
                    }
                    AiRefineBlockType::Quote => {
                        for line in b.content.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
                            out.push_str(&format!("> {}\n", line));
                        }
                        out.push('\n');
                    }
                    AiRefineBlockType::Image => {
                        // F3 v2：配图行（content=session-images/{sid}/{rel}——
                        // 原样输出；与规则版画面要点行同形态供前端渲染）
                        out.push_str(&format!("- ![画面]({})\n", b.content.trim()));
                    }
                }
            }
        }
        out.trim().to_string()
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_refine_protocol_tests.rs"]
mod tests;

/// F3-E golden 结构回归（2026-08-21；REQ-147 扩展）——内置样本集 mock 全链路。
#[cfg(test)]
#[path = "refine_golden_tests.rs"]
mod golden_tests;
