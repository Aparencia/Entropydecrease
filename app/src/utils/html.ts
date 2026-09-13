/**
 * HTML 转义工具（L11 契约去重：原在 NotePreviewView 与 structuredBlocks 各自实现）。
 *
 * @ai-context: OCR/ASR 文本来自视频字幕——恶意字幕可含 `<script>`/`<img onerror>`
 *              等 HTML；凡 dangerouslySetInnerHTML 渲染前必须转义（防存储型 XSS）。
 *              属性值拼接场景（如 `<img src="${...}">`）同样必须经本函数转义，
 *              否则 `" onerror="` 可逃逸属性注入事件。
 */

/** 转义 HTML 特殊字符（& < > " ' 五类——文本与属性值上下文均安全） */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 时间戳回链锚点 → 芯片 HTML（与 NoteMarkdown 的 a 组件同视觉；v0.12.0 补完成）。
 *
 * @ai-context: 轻量渲染器（NotePreviewView/RefineWorkbench）此前不识别锚点语
 *              法——`[⏱ 00:00]([[ts:233]])` 被 escapeHtml 后原样显示为文本
 *              （真机验收「笔记预览仍有 [⏱ 00:00]([[ts:233]])」即此）。本函数
 *              在**已转义文本**上做正则替换：锚点语法字符（`[ ] ( ) :` 数字）
 *              均未被 escapeHtml 转义，模式匹配安全；芯片内容只含数字化 mm:ss
 *              （无注入面——写入的是我们自己的 HTML）。
 * @ai-context: 两种形态：章节锚点 `## 标题 [[⏱ 00:09]([[ts:9000]])]`（外带
 *              `[...]` 包裹）先匹配，段落锚点 `[⏱ 00:00]([[ts:233]])` 兜底。
 * @ai-context: 批 7 T15（C10.2）—— 本函数是 `[[ts:ms]]` 芯片的**唯一实现**（两条手写链
 *              `NotePreviewView` 与 `refineDiff` 都经它）⇒ 修复只需做一次：① **正则补 ms 捕获组**
 *              （原实现把 `[[ts:ms]]` 的 ms 整个丢掉 ⇒ 芯片没有跳转目标）；② 芯片带
 *              `data-ts-ms`（毫秒整数，与 `NoteMarkdown` 的 `onOpenSessionAt(sessionId, ms)` 同口径）
 *              + `data-ts-chip`（定名选择器；`pages/NotesPage.test.tsx` 原按 `title*="跳转到会话"`
 *              选元素，唯一性会被稀释）。容器侧用**事件委托** `closest("[data-ts-ms]")` 取目标 ⇒
 *              保持串渲染、不需要 React 上下文。视觉样式与 `title` 文案**一字未改**。
 *              边界：定位精度受音频对齐的块粒度 **±200 ms** 限制（不得声称毫秒级定位）。
 */
export function renderTimestampAnchors(escaped: string): string {
  const chip = (_m: string, mm: string, ss: string, ms: string): string =>
    `<span data-ts-ms="${ms}" data-ts-chip style="color:#0d9488;border-bottom:1px dashed #14b8a6;background:#f0fdfa;border-radius:3px;padding:0 4px" title="⏱ ${mm}:${ss} 跳转到会话对应片段">⏱ ${mm}:${ss}</span>`;
  return escaped
    // 章节形态（含包裹括号）：`[[⏱ MM:SS]([[ts:ms]])]`
    .replace(/\[\[⏱ (\d+):(\d{2})\]\(\[\[ts:(\d+)\]\]\)\]/g, chip)
    // 段落形态：`[⏱ MM:SS]([[ts:ms]])`
    .replace(/\[⏱ (\d+):(\d{2})\]\(\[\[ts:(\d+)\]\]\)/g, chip);
}
