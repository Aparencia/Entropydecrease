//! AI 生成异步任务状态机（REQ-145，v0.8.0 M2）。
//!
//! @ai-context: 禁止同步阻塞（30s+ 长会话精修不卡 UI）——任务在后台线程
//!              执行（command 层 spawn_blocking），前端经任务句柄查询状态/
//!              接收事件；失败原因四类映射（未授权/网络/余额/配额）+ 服务端/
//!              非法响应补充 → 前端引导对应出口（REQ-145 验收：无"卡死"体验）。
//! @ai-context: 切片纯函数：长笔记按行/章节边界切（每片 ≤8000 字，超长行
//!              字符级硬切——char 迭代防 CJK 多字节切片 panic，参考
//!              6fb5d58 词汇表锚点教训）；M2 基础版串行执行按片上报进度
//!              （并发 2-3 留 M3 切片复用期按配额改造）。

use serde::{Deserialize, Serialize};

/// 每片最大字符数（REQ-145：≤8000 字/片）。
pub const SLICE_MAX_CHARS: usize = 8000;

/// 任务状态（前端任务卡片：进行中(按片进度)/成功/失败(原因)）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AiTaskState {
    Pending,
    Running {
        finished_slices: usize,
        total_slices: usize,
    },
    Succeeded,
    Failed {
        reason: AiTaskFailure,
    },
}

/// 任务失败原因（降级链可见——不静默降级；前端按类引导出口）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AiTaskFailure {
    /// 未授权（密钥缺失/无效——引导设置页配置密钥）
    Unauthorized(String),
    /// 网络错误（引导重试）
    Network(String),
    /// 余额不足（引导充值/切免费档）
    InsufficientBalance(String),
    /// 配额受限（引导明日再试）
    Quota(String),
    /// 服务端错误（引导稍后重试）
    Server(String),
    /// 响应非法（已丢弃回退——本地版保留，不丢不假）
    InvalidResponse(String),
    /// 其他
    Other(String),
}

impl AiTaskFailure {
    /// 失败类别标签（前端四类出口判断：unauthorized/network/balance/quota/other）。
    pub fn kind(&self) -> &'static str {
        match self {
            AiTaskFailure::Unauthorized(_) => "unauthorized",
            AiTaskFailure::Network(_) => "network",
            AiTaskFailure::InsufficientBalance(_) => "balance",
            AiTaskFailure::Quota(_) => "quota",
            AiTaskFailure::Server(_) => "server",
            AiTaskFailure::InvalidResponse(_) => "invalid",
            AiTaskFailure::Other(_) => "other",
        }
    }

    /// 展示文案（原因可见）。
    pub fn message(&self) -> &str {
        match self {
            AiTaskFailure::Unauthorized(m)
            | AiTaskFailure::Network(m)
            | AiTaskFailure::InsufficientBalance(m)
            | AiTaskFailure::Quota(m)
            | AiTaskFailure::Server(m)
            | AiTaskFailure::InvalidResponse(m)
            | AiTaskFailure::Other(m) => m,
        }
    }
}

/// 从共享 client 错误映射任务失败（REQ-145 失败原因四类 + 补充）。
impl From<crate::ai_client::AiClientError> for AiTaskFailure {
    fn from(e: crate::ai_client::AiClientError) -> Self {
        match e {
            crate::ai_client::AiClientError::Auth(m) => AiTaskFailure::Unauthorized(m),
            crate::ai_client::AiClientError::Network(m) => AiTaskFailure::Network(m),
            crate::ai_client::AiClientError::Balance(m) => AiTaskFailure::InsufficientBalance(m),
            crate::ai_client::AiClientError::Quota(m) => AiTaskFailure::Quota(m),
            crate::ai_client::AiClientError::Server(m) => AiTaskFailure::Server(m),
            crate::ai_client::AiClientError::Parse(m) => AiTaskFailure::InvalidResponse(m),
        }
    }
}

/// 切片纯函数：markdown 按行/章节边界切分（每片 ≤ max_chars）。
///
/// @ai-context: 边界策略：当前片加下一行会超限时先落片（`## ` 章节标题
///              因此天然成为新片起点——章节边界优先）；单行超限字符级硬切
///              （char 迭代防 CJK 多字节切片 panic）；空输入返回空向量。
pub fn slice_note(markdown: &str, max_chars: usize) -> Vec<String> {
    let max = max_chars.max(1);
    if markdown.trim().is_empty() {
        return Vec::new();
    }
    if markdown.chars().count() <= max {
        return vec![markdown.trim().to_string()];
    }
    let mut slices: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut cur_len = 0usize;
    for line in markdown.lines() {
        let line_len = line.chars().count();
        // 超限落片（当前片非空且加此行超限）——`## ` 章节标题随之成为新片起点
        if cur_len > 0 && cur_len + line_len + 1 > max {
            slices.push(current.trim_end().to_string());
            current.clear();
            cur_len = 0;
        }
        if line_len >= max {
            // 单行超限：字符级硬切（防多字节切片 panic）
            let mut buf = String::new();
            let mut buf_len = 0usize;
            for ch in line.chars() {
                if buf_len >= max {
                    slices.push(buf.clone());
                    buf.clear();
                    buf_len = 0;
                }
                buf.push(ch);
                buf_len += 1;
            }
            if buf_len > 0 {
                slices.push(buf.clone());
            }
            continue;
        }
        current.push_str(line);
        current.push('\n');
        cur_len += line_len + 1;
    }
    if cur_len > 0 {
        slices.push(current.trim_end().to_string());
    }
    slices
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_task_tests.rs"]
mod tests;
