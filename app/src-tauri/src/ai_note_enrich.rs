//! AI 知识补充适配器（REQ-142，v0.8.0 M3）。
//!
//! @ai-context: 输入=笔记正文（切片）+章节目录+勾选子项+档案 → 云端一次批量
//!              返回块数组 → 逐块审查（2026-09 修复：enrich_salvage 取代协议层
//!              全有或全无的 validate——坏块隔离、好块照落，丢弃原因随回执返回
//!              供 UI 明示；全批无一可落才失败（原语义"失败不落任何补充内容"
//!              保留——补充是增量能力，失败不破坏原笔记）。
//! @ai-context: 提示词模板 prompts/note_enrich.json 编译期捆绑（include_str），
//!              勾选子项说明动态注入 system；章节目录/无章节说明注入 user
//!              （anchor_ref 白名单——模型不得自造或省略锚点）；网络/解析走
//!              共享 AiClient。

use serde::{Deserialize, Serialize};

use crate::ai_client::{AiClient, AiClientError};
use crate::ai_enrich_protocol::{AiEnrichKind, AiEnrichRequest, AiEnrichResponse};
use crate::enrich_salvage::salvage_blocks;

/// 单次补充结果：可落响应（已剔除违规块）+ 丢弃原因（UI 明示"哪些块为何未落"）。
#[derive(Debug, Clone)]
pub struct EnrichOutcome {
    pub response: AiEnrichResponse,
    pub dropped_reasons: Vec<String>,
}

/// 提示词模板（prompts/note_enrich.json 结构）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NoteEnrichPrompt {
    pub version: u32,
    pub system: String,
    /// 九子项说明（kebab-case 键）
    pub kinds: std::collections::HashMap<String, String>,
    pub output_format: String,
}

impl NoteEnrichPrompt {
    /// 编译期捆绑模板（改 prompts/note_enrich.json 重建即生效）。
    pub fn bundled() -> Self {
        let raw = include_str!("../prompts/note_enrich.json");
        serde_json::from_str(raw).unwrap_or_else(|e| {
            eprintln!("[NoteEnrich] 提示词模板解析失败，使用内置兜底: {}", e);
            Self::fallback()
        })
    }

    /// 内置最小提示词（模板损坏时的兜底；不阻断补充功能）。
    fn fallback() -> Self {
        let mut kinds = std::collections::HashMap::new();
        for k in AiEnrichKind::all() {
            kinds.insert(k.label().to_string(), k.label().to_string());
        }
        Self {
            version: 1,
            system: "你是课堂笔记的知识补充助手：只补充勾选子项，深度类带章节锚点（无章节时 anchor_ref=null），B6 不输出链接。"
                .to_string(),
            kinds,
            output_format: "只输出 JSON：{\"blocks\":[{\"kind\":\"d1|..|b6\",\"anchor_ref\":\"..|null\",\"heading\":\"..\",\"content\":\"..\",\"confidence\":0.9}]}"
                .to_string(),
        }
    }

    /// 组装 system 提示词（基础指令 + 勾选子项说明 + 输出约束）。
    ///
    /// @ai-context: 只注入勾选子项的说明（提示词精简——未勾选子项不占
    ///              token 且降低误产出）。
    pub fn build_system(&self, selected: &[AiEnrichKind]) -> String {
        let mut s = self.system.clone();
        for k in selected {
            let desc = self
                .kinds
                .get(k.as_str())
                .cloned()
                .unwrap_or_else(|| k.label().to_string());
            s.push_str(&format!("\n- {}: {}", k.as_str(), desc));
        }
        s.push_str(&format!("\n{}", self.output_format));
        s
    }
}

impl AiEnrichKind {
    /// serde kebab-case 标识（提示词 kinds 键与协议契约同口径）。
    pub fn as_str(self) -> &'static str {
        match self {
            AiEnrichKind::D1 => "d1",
            AiEnrichKind::D2 => "d2",
            AiEnrichKind::D3 => "d3",
            AiEnrichKind::B1 => "b1",
            AiEnrichKind::B2 => "b2",
            AiEnrichKind::B3 => "b3",
            AiEnrichKind::B4 => "b4",
            AiEnrichKind::B5 => "b5",
            AiEnrichKind::B6 => "b6",
        }
    }
}

/// 补充适配器（阻塞调用——command 层 spawn_blocking 包裹；网络走共享 AiClient）。
#[derive(Debug, Clone)]
pub struct AiNoteEnrichAdapter {
    pub client: AiClient,
    pub prompt: NoteEnrichPrompt,
}

impl AiNoteEnrichAdapter {
    pub fn new(client: AiClient) -> Self {
        Self { client, prompt: NoteEnrichPrompt::bundled() }
    }

    /// 单次批量补充（一请求=全部勾选子项；长笔记切片由 command 层任务编排）。
    ///
    /// @ai-context: 2026-09 修复：逐块审查在此层做（salvage_blocks）——单块违规
    ///              只丢该块（原因随 EnrichOutcome 返回），全批无一可落才 Err
    ///              （调用方不落任何补充内容——非法响应不得进入笔记管线）。
    pub fn enrich(
        &self,
        request: &AiEnrichRequest,
        selected: &[AiEnrichKind],
    ) -> Result<EnrichOutcome, AiClientError> {
        let system = self.prompt.build_system(selected);
        // 章节目录注入 user 消息（2026-09 修复）：目录=anchor_ref 白名单——
        // 切片正文可能不含任何章节标题（长笔记跨片），不给目录模型只能省略
        // 锚点或自造标题；无章节时显式要求 null（防模型省略字段导致整批失败）
        let mut user_text = String::new();
        if request.chapter_directory.is_empty() {
            user_text.push_str(
                "说明：本笔记没有章节标题（章节目录为空）。深度类块（d1~d3）的 anchor_ref 必须为 null——系统会把这类块安放在笔记尾部。\n\n",
            );
        } else {
            user_text.push_str("笔记章节目录（深度类块 anchor_ref 必须逐字取自以下某一项，不得自造、不得省略；广度类仍为 null）：\n");
            for c in &request.chapter_directory {
                user_text.push_str(&format!("- {}\n", c));
            }
            user_text.push('\n');
        }
        let user_json = serde_json::to_string(request)
            .map_err(|e| AiClientError::Parse(format!("补充请求序列化失败: {}", e)))?;
        user_text.push_str(&user_json);
        let v = self.client.chat_json(&system, &user_text)?;
        let resp: AiEnrichResponse = serde_json::from_value(v)
            .map_err(|e| AiClientError::Parse(format!("补充响应结构非法: {}", e)))?;
        let out = salvage_blocks(resp, selected, &request.chapter_directory)
            .map_err(|e| AiClientError::Parse(format!("补充响应校验失败（已丢弃）: {}", e)))?;
        Ok(EnrichOutcome {
            response: AiEnrichResponse { blocks: out.kept },
            dropped_reasons: out.dropped_reasons,
        })
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_note_enrich_tests.rs"]
mod tests;
