//! AI 笔记精修适配器（REQ-141，v0.8.0 M2）。
//!
//! @ai-context: 输入=note_filter 规则草稿（markdown+档案+术语表+章节）→
//!              按档案提示词模板（prompts/note_refine.json 编译期捆绑）→
//!              云端结构化精修 → 强校验（AiRefineResponse::validate）→
//!              失败回退纯规则（不丢不假，本地优先铁律；错误经 AiClientError
//!              归一为任务失败四类原因）。
//! @ai-context: 档案分组：网课=讲义式/实操=步骤式/口播=摘要式/访谈=问答式/
//!              会议=纪要式 + 扩展类（直播/白板/题目/跟练/编程…）回退讲义式
//!              ——profile_style 映射表可校准；模型切换零代码改动。

use serde::{Deserialize, Serialize};

use crate::ai_client::{AiClient, AiClientError};
use crate::ai_refine_protocol::{AiRefineRequest, AiRefineResponse};

/// 提示词模板（prompts/note_refine.json 结构）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NoteRefinePrompt {
    pub version: u32,
    /// 核心指令（精修=整理不创作——所有档案共享）
    pub core_instruction: String,
    /// 五种风格模板（讲义/步骤/摘要/问答/纪要）
    pub styles: std::collections::HashMap<String, NoteRefineStyle>,
    /// 档案 → 风格映射（扩展类回退讲义式）
    pub profile_style: std::collections::HashMap<String, String>,
    pub fallback_style: String,
    pub few_shot: Vec<PromptExample>,
    pub output_format: String,
}

/// 单风格模板（style 名 + system 提示词）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NoteRefineStyle {
    pub name: String,
    pub system: String,
}

/// few-shot 样本（输入 → 期望输出 JSON 字符串）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PromptExample {
    pub input: String,
    pub output: String,
}

impl NoteRefinePrompt {
    /// 编译期捆绑模板（改 prompts/note_refine.json 重建即生效）。
    ///
    /// @ai-context: 解析失败视为开发期错误——回退内置最小提示词（保可用不崩，
    ///              与 ai_text_filter bundled 同模式）。
    pub fn bundled() -> Self {
        let raw = include_str!("../prompts/note_refine.json");
        serde_json::from_str(raw).unwrap_or_else(|e| {
            eprintln!("[NoteRefine] 提示词模板解析失败，使用内置兜底: {}", e);
            Self::fallback()
        })
    }

    /// 内置最小提示词（模板损坏时的兜底；不阻断精修功能）。
    fn fallback() -> Self {
        let mut styles = std::collections::HashMap::new();
        styles.insert(
            "lecture".to_string(),
            NoteRefineStyle {
                name: "讲义式".to_string(),
                system: "你是课堂笔记整理助手：去除非知识内容，按层级组织，不增补事实。"
                    .to_string(),
            },
        );
        let mut profile_style = std::collections::HashMap::new();
        profile_style.insert("lecture".to_string(), "lecture".to_string());
        Self {
            version: 1,
            core_instruction: "精修=整理不创作：去噪 + 结构化，不增补课程外事实。".to_string(),
            styles,
            profile_style,
            fallback_style: "lecture".to_string(),
            few_shot: Vec::new(),
            output_format: "只输出 JSON：{\"sections\":[{\"heading\":\"..\",\"blocks\":[{\"type\":\"paragraph|list|term|highlight|quote\",\"content\":\"..\",\"anchor_ref\":null}]}]}"
                .to_string(),
        }
    }

    /// 按档案解析 style system 提示词（缺省/未知档案回退 fallback_style）。
    pub fn style_system(&self, profile: &str) -> String {
        let key = self
            .profile_style
            .get(profile)
            .map(|s| s.as_str())
            .unwrap_or(self.fallback_style.as_str());
        self.styles
            .get(key)
            .or_else(|| self.styles.get(self.fallback_style.as_str()))
            .map(|s| s.system.clone())
            .unwrap_or_else(|| "你是课堂笔记整理助手。".to_string())
    }

    /// 组装 system 提示词（核心指令 + 档案风格 + few-shot + 输出约束）。
    pub fn build_system(&self, profile: &str) -> String {
        let mut s = format!("{}\n{}", self.core_instruction, self.style_system(profile));
        for ex in &self.few_shot {
            s.push_str(&format!("\n示例输入: {}\n示例输出: {}", ex.input, ex.output));
        }
        s.push_str(&format!("\n{}", self.output_format));
        s
    }
}

/// 精修适配器（阻塞调用——command 层 spawn_blocking 包裹；网络走共享 AiClient）。
#[derive(Debug, Clone)]
pub struct AiNoteRefineAdapter {
    pub client: AiClient,
    pub prompt: NoteRefinePrompt,
}

impl AiNoteRefineAdapter {
    pub fn new(client: AiClient) -> Self {
        Self { client, prompt: NoteRefinePrompt::bundled() }
    }

    /// 单次精修（一请求=一切片；长笔记切片由 command 层任务编排）。
    ///
    /// @ai-context: 强校验在此层做（validate 失败 → Parse 错误 → 调用方
    ///              回退纯规则，非法响应不进入笔记管线——防御性编程铁律）。
    pub fn refine(&self, request: &AiRefineRequest) -> Result<AiRefineResponse, AiClientError> {
        let system = self.prompt.build_system(&request.profile);
        let user = serde_json::to_string(request)
            .map_err(|e| AiClientError::Parse(format!("精修请求序列化失败: {}", e)))?;
        let v = self.client.chat_json(&system, &user)?;
        let resp: AiRefineResponse = serde_json::from_value(v)
            .map_err(|e| AiClientError::Parse(format!("精修响应结构非法: {}", e)))?;
        resp.validate()
            .map_err(|e| AiClientError::Parse(format!("精修响应校验失败（已丢弃回退）: {}", e)))?;
        Ok(resp)
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_note_refine_tests.rs"]
mod tests;
