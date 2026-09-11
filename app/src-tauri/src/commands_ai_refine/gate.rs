//! 成本硬拦截门禁（批 0-C3 Task 4 拆分，原 commands_ai_refine.rs 644–688 行）。
//!
//! @ai-context: 精修 / 补充 / 笔记精修 / 学习目标计划 **4 个模块共用**的启动前余额校验：
//!              按字符数预估费用（模型映射单价 + 输出 token）× 安全系数 1.2 < 余额才放行；
//!              免费档（预估 ¥0）与 Ollama 本地 Provider 恒放行；余额查询失败宽容放行
//!              （降级口径——费用风险由前端确认弹窗承担，不因余额接口抖动阻断功能）。
//! @ai-context: 副作用与边界：含**同步** HTTP 余额查询（ureq，max_retries = 0，不重试）；
//!              ai_settings / ai_providers 两条锁各自 .clone() 后立即释放，**不持锁做
//!              网络 IO** —— 搬运时不得改成持锁调用 adapter.fetch()。
//!              BALANCE_SAFETY_FACTOR 与错误文案里硬编码的 "×1.2" 重复是既有缺陷
//!              （分析 §R7），本批只搬不改。

use crate::ai_cost::estimate_for_content_model;
use crate::commands::AppState;

/// 成本硬拦截安全系数（预估费用 × 系数 < 余额才放行——防预估偏差导致
/// 中途余额耗尽；免费档 ¥0 预估恒放行）。
const BALANCE_SAFETY_FACTOR: f64 = 1.2;

/// 成本硬拦截（F3-D，2026-08-21）：启动前校验余额。
///
/// @ai-context: 流程：按字符数预估费用（模型映射单价 + 输出 token）→ 查余额
///              （复用 AiBalanceAdapter）→ 余额 < 预估×1.2 → 拒绝启动 + 三出口
///              引导（充值/切免费档模型/放弃）。免费档（预估 ¥0）→ 恒放行
///              （余额 0 也可精修——免费模型不扣费）；余额查询失败 → 放行
///              （不因余额接口抖动阻断功能——降级宽容，费用风险由确认弹窗
///              展示承担）。精修/补充共用（补充经 enrich 命令调用本函数）。
pub(crate) fn ensure_balance_for(st: &AppState, chars: usize, model: &str) -> Result<(), String> {
    let est = estimate_for_content_model(chars, model);
    if est.est_cost_yuan <= 0.0 {
        return Ok(()); // 免费档/单价 0——无扣费风险，不拦截
    }
    let required = est.est_cost_yuan * BALANCE_SAFETY_FACTOR;
    // 余额查询（短超时——余额接口抖动不阻断精修；失败放行宽容降级）
    // M1 统一门禁：Ollama 本地 Provider 无计费语义——跳过余额检查（m-7.3）
    if crate::commands_ai_providers::is_default_provider_local(st) {
        return Ok(());
    }
    if !crate::commands_ai_providers::default_provider_ready(st)? {
        return Err("未配置 API 密钥——请在设置页「AI 服务提供商」配置密钥（或使用 Ollama 本地）".to_string());
    }
    let api_key = crate::commands_ai_providers::resolve_default_provider_key(st)?.unwrap_or_default();
    let settings = st.ai_settings.lock().map_err(|e| format!("AI 设置锁中毒: {}", e))?.clone();
    let store = st.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?.clone();
    let cfg = crate::ai_client::AiClient::from_settings_with_store(&settings, Some(api_key), &store).config;
    let adapter = crate::ai_balance::AiBalanceAdapter {
        base_url: cfg.base_url,
        api_key: cfg.api_key,
        timeout_secs: cfg.timeout_secs,
        max_retries: 0, // 拦截是前置守卫——不重试，失败放行
    };
    match adapter.fetch() {
        Ok(balance) if balance.total_balance < required => Err(format!(
            "余额不足：当前 ¥{:.2}，本次预估 ¥{:.4}（安全系数 ×1.2）——请充值或切换免费档模型后重试",
            balance.total_balance, est.est_cost_yuan
        )),
        Ok(_) => Ok(()),
        Err(_) => Ok(()), // 余额查询失败 → 放行（宽容降级，费用由确认弹窗展示）
    }
}
