/**
 * Electron IPC 全局类型声明（渲染进程侧）
 *
 * @ai-context: 所有 IPC 返回类型均经 Electron 主进程 handler 源码
 * 逐字段核对（migration.check / importTable / complete、storage.changePath
 * 等）。修改任一签名前必须先核对主进程实现，禁止在调用方用局部断言
 * 绕过类型（根治优于局部断言）。
 * @ai-context: invoke/on/send 为通配逃生通道，新增 IPC 能力应优先
 * 定义精确的具名方法而非走通配 invoke。
 *
 * GW-3(X2): Window.electronAPI 的唯一权威声明已并入 src/env.d.ts
 *（该文件为超集：含 recording/ollama/audio_capture/ai_progress_narrate 等
 * 全部新 API）。本文件保留空壳仅维持旧导入路径兼容——双份声明曾多处
 * 类型冲突（必选/可选、返回类型不一致），被 skipLibCheck 掩盖。
 */

export {};
