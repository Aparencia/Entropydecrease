# 单文件行数豁免登记（AGENTS.md §3：单文件 ≤300 行；300-600 行须登记本清单）

> 登记规则：文件超过 300 行时在此登记（文件 + 行数 + 豁免理由 + 拆分计划）。
> 超过 600 行必须硬拆（不允许豁免）。

| 文件 | 行数 | 豁免理由 | 拆分计划 |
|------|------|---------|---------|
| app/src/pages/ClassroomPage.tsx | ~440 | 装配层页面：左栏配置区（窗口选择/实时捕获/文件素材/视频导入）+ 右栏内容切换（活动面板/笔记预览/说明书）；实时活动面板已拆出 LiveActivityPanel，剩余为装配与状态接线 | v0.3.x 将左栏实时捕获面板拆出 LiveCaptureCard（状态与事件监听下沉） |
| app/src-tauri/src/live_session.rs | ~351 | v0.3.0 后：FusionTracker + 会话编排循环 + 后台融合线程 + 句起/句尾跟踪四职责内聚于会话生命周期模块；拆出需跨函数传递 stop/epoch/speech_active/db/app 上下文 | 若再增长：融合线程任务拆至 live_session_fusion.rs，编排循环拆至 live_session_loop.rs |
| app/src-tauri/src/capture/audio_loopback.rs | ~320 | ADR-007 重连机制（重试循环/退避/恢复回调）内聚于捕获线程实现，拆出需跨函数传递 COM 生命周期参数，内聚性优先 | 若再增长：将 run_capture_inner 拆至 audio_loopback_session.rs |
| app/src-tauri/src/live_session_frame.rs | ~313 | 屏幕 worker 编排（采样调度/强制 OCR 兜底/投票器/字幕落库）+ 融合重写内聚；上下文参数多（stop/epoch/speech_active/DB/引擎/事件/缓存） | 若再增长：帧处理与融合重写拆至 live_frame_process.rs |

> 已拆分：dxgi_capture.rs（原 ~333 行）于 v0.4.0 M0（TD-033，提交 2a88b25）将 DxgiState 拆至 dxgi_state.rs——现 dxgi_capture.rs ~176 行、dxgi_state.rs ~219 行，均回归 ≤300 行，无需登记。
