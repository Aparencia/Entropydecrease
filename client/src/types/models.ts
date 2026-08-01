/**
 * 数据模型统一出口（兼容层）
 *
 * @ai-context: 历史上本文件是 413 行的单体类型文件，2026-07 迁移重构时
 * 按领域拆分至 common/note/flashcard/pomodoro/feynman/sync/capture/inspiration。
 * 本文件保留为 re-export barrel，使全项目 25+ 处 `@/types/models` 导入
 * 无需改动。新代码建议直接从领域文件导入。
 * @ai-context: 纯类型文件，无运行时代码。
 */

export * from './common';
export * from './note';
export * from './mindmap';
export * from './flashcard';
export * from './pomodoro';
export * from './feynman';
export * from './sync';
export * from './capture';
export * from './inspiration';
export * from './ritual';
