//! 会话→笔记 AI 精修 commands（REQ-141/145 + REQ-143 基础版，v0.8.0 M2）。
//!
//! @ai-context: 流程：成本预估（estimate，本地快）→ 确认（前端：首次必显 +
//!              内联余额 ai_get_balance 复用 + 记住选择）→ 异步任务
//!              （start：规则草稿 → 切片 → 逐片精修 → 合并 → diff）→
//!              状态查询/事件 → 采纳落库（apply）/放弃（不调 apply）。
//! @ai-context: 授权红线：start 走 content_gate（enabled+authorized 双条件）+
//!              本次上传确认；降级链：无密钥/网络/余额/配额/非法响应 → 任务
//!              失败原因四类可见，本地规则版保留（不丢不假）；mock 模式
//!              （AI_REFINE_MOCK=1）供测试/离线开发。任务注册表在 AppState，
//!              进度经 "ai:task-update" 事件 + ai_refine_status 查询双通道，
//!              网络调用在 spawn_blocking（不阻塞异步运行时）。

//! @ai-context: 目录模块（批 0-C3 Task 4 拆分，2026-09-11，原 751 行 → 外壳 ≤300）。
//!              子模块职责（D6，按域划分，逐条列出）：
//!              · apply.rs      —— 采纳落库 + 任务历史
//!              · dto.rs        —— IPC 契约类型（4 个 serde 结构体；字段序 = JSON 键序）
//!              · gate.rs       —— 成本硬拦截（免费档/本地 Provider 跳过；查询失败宽容放行）
//!              · registry.rs   —— 任务注册表 + id 序列 + 容量守卫 + 状态写入口
//!              · session.rs    —— 会话生命周期 6 命令（预估/启动/策略元数据/预览/状态/结果）
//!              · workbench.rs  —— 精修工作台（三级数据源 + 章节 diff 统计 + 内联契约测试）
//!              @ai-context: 本外壳只留「跨域共享的命令 + 重导出门面」；外部 10 文件
//!              20 处 crate::commands_ai_refine::X 引用**零改动**（逐项重导出在下方）；
//!              #[tauri::command] 定义随域下沉后，注册路径同步改成
//!              crate::commands_ai_refine::<子模块>::<cmd>（IPC 名 = 路径末段，逐字不变）。

pub(crate) mod apply;
mod dto;
mod gate;
mod registry;
pub(crate) mod session;
pub(crate) mod workbench;

pub use dto::{AiRefineResult, AiTaskHandle, RefineEstimateView, RefineStrategyInfo};
pub use registry::{claim_task_id, task_registry, task_seq, task_seq_lower_bound, AiTaskEntry};
pub(crate) use gate::ensure_balance_for;
pub(crate) use registry::{set_task, trim_tasks};
