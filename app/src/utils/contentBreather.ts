/**
 * 笔记正文滚动面统一底部留白 token（批 3 / 用户问题9）。
 *
 * @ai-context: 三个滚动面——NoteReadingView 阅读容器、RichEditorView
 *              CodeMirror 的 .cm-content、NoteEditView 降级 textarea——
 *              引用同一 padding-bottom 值。Why：滚动行程在内容末尾耗尽
 *              （无底部留白），末行贴住容器底边、无法上移至视区中央留出
 *              呼吸空间；三面同源避免改一处漏一处。
 * Why vh + max()：仓库 inline-style 为主（无共享 CSS 类基建）；flex 布局
 *              下各滚动容器高 ≈ 窗口高 − 固定页头，用窗口相对单位 vh 近似
 *              「视区高 × 1/3」无需 ResizeObserver 测量（CM 主题在模块
 *              作用域构造，也无法注入测量值）。max() 提供矮窗下限，防留白
 *              随视口收缩塌没；高窗按 1/3 等比放大，观感一致。
 * 边界：非精确的容器比例——页头/工具栏高度使实际留白比例略小于 1/3，
 *      符合授权口径「约视区高 1/3」，不做 JS 测量（YAGNI）。
 */

/** 留白下限（px）——滚动容器很矮（<288px）时 vh 项不足 1/3 也有呼吸空间 */
export const BOTTOM_BREATHER_MIN_PX = 96;

/** 留白与视口高之比（约 1/3——超出则末段滚动行程过长、浪费屏高） */
export const BOTTOM_BREATHER_VIEWPORT_RATIO = 1 / 3;

/** 统一底部留白 CSS 值（三滚动面 padding-bottom 唯一数据源） */
export const BOTTOM_BREATHER_CSS = `max(${BOTTOM_BREATHER_MIN_PX}px, ${Math.round(BOTTOM_BREATHER_VIEWPORT_RATIO * 100)}vh)`;
