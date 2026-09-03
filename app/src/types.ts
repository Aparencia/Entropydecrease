/**
 * 前端共享领域类型 barrel（与 Rust serde 契约对齐）。
 *
 * @ai-context: 2026-08 审查 H4 硬拆——原单文件 879 行破 600 硬上限，按领域
 *              归位至 types/ 子目录（notes/session/artifact/live/ai/system）。
 *              本文件只做 re-export：所有现有 `from "../types"` import 路径不变，
 *              新代码建议直接从域文件导入（barrel 仅为兼容保留）。
 * @ai-context: 命名契约总则：WindowInfo 对应 Rust CaptureWindow（camelCase）；
 *              Note 保持 snake_case（Rust 侧未 rename，勿改动以免破坏契约）。
 */

export * from "./types/notes";
export * from "./types/session";
export * from "./types/artifact";
export * from "./types/live";
export * from "./types/ai";
export * from "./types/chat";
// v0.19（REQ-258/260）：检索与发现层类型（索引统计/重建事件）
export * from "./types/kb";
export * from "./types/system";
