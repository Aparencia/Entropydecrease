//! AI 余额查询（REQ-139，v0.8.0 M1 使能层）。
//!
//! @ai-context: GET {base_url}/user/balance（Bearer 密钥）→ SiliconFlow 返回
//!              {total_balance, grants_balance, topped_up_balance, currency}。
//!              超时+重试沿用适配器模式（ai_text_filter 先例：429/5xx/传输
//!              错误指数退避，4xx 非瞬态不重试）。
//! @ai-context: 解析容错（防御性编程）：字段缺失/非法数值按 0 处理并记录
//!              缺失项（不 panic、不整单丢弃——余额展示尽力而为）；
//!              currency 缺失默认 "CNY"。
//! @ai-context: 本模块只做余额数据与查询，不 gate 授权（查询为读操作，
//!              不涉及内容上传——门控见 ai_settings.rs content_gate）。

use serde::{Deserialize, Serialize};

/// 余额快照（SiliconFlow /v1/user/balance 响应；字段缺失容错解析）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiBalance {
    pub total_balance: f64,
    pub grants_balance: f64,
    pub topped_up_balance: f64,
    pub currency: String,
}

/// 解析余额响应（纯函数；容错：字段缺失/非法 → 0，currency 缺失 → "CNY"）。
///
/// @ai-context: 返回 Err 仅当整体非 JSON 对象（无法尽力而为）；
///              字段缺失按 0 处理——SiliconFlow 分项字段可能因账户类型缺失。
pub fn parse_balance(body: &str) -> Result<AiBalance, String> {
    let v: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("余额响应 JSON 解析失败: {}", e))?;
    let obj = v
        .as_object()
        .ok_or_else(|| "余额响应不是 JSON 对象".to_string())?;
    let num = |k: &str| -> f64 {
        obj.get(k).and_then(|x| x.as_f64()).or_else(|| {
            obj.get(k).and_then(|x| x.as_str()).and_then(|s| s.parse().ok())
        }).unwrap_or(0.0)
    };
    let currency = obj
        .get("currency")
        .and_then(|c| c.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("CNY")
        .to_string();
    Ok(AiBalance {
        total_balance: num("total_balance"),
        grants_balance: num("grants_balance"),
        topped_up_balance: num("topped_up_balance"),
        currency,
    })
}

/// 低余额提醒（纯函数：total < 阈值 → Some 提示；负数余额也触发）。
pub fn low_balance_warning(balance: &AiBalance, threshold: f64) -> Option<String> {
    if balance.total_balance < threshold {
        Some(format!(
            "余额不足：当前 {:.2} {}（低于提醒阈值 {:.2}），AI 生成可能中断，请及时充值",
            balance.total_balance, balance.currency, threshold
        ))
    } else {
        None
    }
}

/// 余额查询适配器（阻塞调用——command 层 spawn_blocking 包裹）。
#[derive(Debug, Clone)]
pub struct AiBalanceAdapter {
    pub base_url: String,
    pub api_key: String,
    pub timeout_secs: u64,
    pub max_retries: u32,
}

impl AiBalanceAdapter {
    /// 查询余额（HTTP 429/5xx/传输错误指数退避重试；4xx 非瞬态不重试）。
    ///
    /// @ai-context: 401/403 → 明确"密钥无效"错误（REQ-138 一键连通性验证
    ///              复用本函数——错误密钥验证失败有明确提示）。
    pub fn fetch(&self) -> Result<AiBalance, String> {
        if self.api_key.trim().is_empty() {
            return Err("未配置 API 密钥（设置页保存密钥或配置环境变量 SILICONFLOW_API_KEY）".to_string());
        }
        // 审查修复（2026-08-21）：只修剪尾斜杠，不得 trim "/v1"（同 ai_client
        // ——base_url 含 /v1 是 OpenAI 兼容端点约定，删掉会 404）
        let url = format!(
            "{}/user/balance",
            self.base_url.trim_end_matches('/')
        );
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(self.timeout_secs.max(5)))
            .build();
        let mut last_err = "未发起请求".to_string();
        for attempt in 0..=self.max_retries {
            if attempt > 0 {
                let backoff = (500u64 << attempt.min(4)).min(8000);
                std::thread::sleep(std::time::Duration::from_millis(backoff));
            }
            match agent
                .get(&url)
                .set("Authorization", &format!("Bearer {}", self.api_key.trim()))
                .call()
            {
                Ok(resp) => {
                    let body = resp
                        .into_string()
                        .map_err(|e| format!("读取余额响应失败: {}", e))?;
                    return parse_balance(&body);
                }
                Err(ureq::Error::Status(401 | 403, _)) => {
                    return Err("API 密钥无效或无权限（请检查设置页密钥）".to_string());
                }
                Err(ureq::Error::Status(429, _)) => {
                    last_err = "请求过频（HTTP 429）".to_string();
                    if attempt == self.max_retries {
                        break;
                    }
                }
                Err(ureq::Error::Status(code, _)) if code >= 500 => {
                    last_err = format!("服务端错误 HTTP {}", code);
                    if attempt == self.max_retries {
                        break;
                    }
                }
                Err(ureq::Error::Status(code, _)) => {
                    return Err(format!("余额查询被拒绝 HTTP {}（不重试——4xx 非瞬态）", code));
                }
                Err(e) => {
                    last_err = format!("传输错误: {}", e);
                    if attempt == self.max_retries {
                        break;
                    }
                }
            }
        }
        Err(format!("重试 {} 次后仍失败: {}", self.max_retries, last_err))
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_balance_tests.rs"]
mod tests;
