# 单文件行数豁免登记（AGENTS.md §3：单文件 ≤300 行；300-600 行须登记本清单）

> 登记规则：文件超过 300 行时在此登记（文件 + 行数 + 豁免理由 + 拆分计划）。
> 超过 600 行必须硬拆（不允许豁免）。

| 文件 | 行数 | 豁免理由 | 拆分计划 |
|------|------|---------|---------|
| app/src/pages/ClassroomPage.tsx | ~357 | 装配层页面：窗口选择 + 实时捕获 + 文件流水线三块 UI 状态与事件监听内聚，拆组件需额外引入 props 契约（实时捕获面板 LiveCaptureCard 为 v0.2.1 拆分项） | v0.2.1 拆分 LiveCaptureCard 子组件（状态与事件监听下沉） |
| app/src-tauri/src/live_session.rs | ~240 | （无需豁免，登记备忘：随功能增长将编排循环拆至 live_session_loop.rs） | — |
| app/src-tauri/src/capture/audio_loopback.rs | ~320 | ADR-007 重连机制（重试循环/退避/恢复回调）内聚于捕获线程实现，拆出需跨函数传递 COM 生命周期参数，内聚性优先 | 若再增长：将 run_capture_inner 拆至 audio_loopback_session.rs |
| app/src-tauri/src/capture/dxgi_capture.rs | ~333 | ADR-007 自愈（窗口矩形刷新/周期重建/事件）+ ADR-002 既有捕获逻辑内聚；拆出需引入状态对象（SamplerState）跨文件共享 | 若再增长：将 DxgiState 拆至 dxgi_state.rs |
