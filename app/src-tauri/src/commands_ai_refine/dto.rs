//! AI 精修命令域的 IPC 契约类型（批 0-C3 Task 4 拆分，原 commands_ai_refine.rs 51–101 行）。
//!
//! @ai-context: 前端 diff 预览 / 任务面板 / 确认弹窗 / 策略溯源条的**唯一数据源**——
//!              4 个类型逐字搬运：derive 清单、#[serde(rename_all = "camelCase")]、
//!              字段声明顺序（= JSON 键序）、#[serde(default)] /
//!              skip_serializing_if 一律未动。字段重排或属性增删会静默改变序列化字节
//!              （旧任务结果反序列化、前端 undefined 崩溃的复现面）。
//! @ai-context: 边界：纯数据契约——无副作用、无 IO、无锁。AiTaskEntry **刻意不在此**
//!              （它无 serde derive，是进程内注册表条目 → registry.rs）；WorkbenchData
//!              也刻意不在此（它带工作台命令的内联契约测试 → workbench.rs）。

use crate::ai_cost::CostEstimate;
use crate::ai_task::AiTaskState;
use crate::note_diff::DiffOp;

/// 精修成功载荷（前端 diff 预览 + 采纳落库数据源）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRefineResult {
    pub title: String,
    /// 规则基线（本地规则版——采纳落库时作为首快照，版本链 [rule, ai-refine]）
    pub base_markdown: String,
    pub refined_markdown: String,
    /// 与规则版的段级 diff（本地版为基线，AI 变化点高亮）
    pub diff: Vec<DiffOp>,
    pub added_lines: usize,
    pub removed_lines: usize,
    pub slices: usize,
    /// F2-B4：失败片数（>0 = 部分成功——重试后仍失败保留已成功片）
    pub failed_slices: usize,
    pub model: String,
    /// v0.17.0：本次策略溯源（档位 + 每维最终值——工作台溯源条数据源；
    /// serde default 向前兼容：旧任务结果无此字段）
    #[serde(default)]
    pub strategy: Option<RefineStrategyInfo>,
}

/// 策略溯源信息（AI 产出按什么规则变的——工作台溯源条展示）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineStrategyInfo {
    /// 档位 id（standard/faithful/deep/minimal/custom 或 intent:xxx——名称由前端
    /// 按 meta 声明解析，未知 id 原样展示——诚实不猜）
    pub preset_id: String,
    /// 每维最终值（key → value；chips 渲染源）
    pub dims: std::collections::HashMap<String, String>,
    /// 自定义档自由文本（仅 preset=custom 时有值——溯源条/重生成沿用，REQ-279）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_text: Option<String>,
}

/// 任务句柄（前端轮询/事件对应用）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTaskHandle {
    pub task_id: u64,
    pub state: AiTaskState,
}

/// 成本预估视图（确认弹窗数据源；余额内联由前端复用 ai_get_balance）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineEstimateView {
    pub estimate: CostEstimate,
    pub remember_cost_choice: bool,
}
