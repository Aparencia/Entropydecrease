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
 */
export function renderTimestampAnchors(escaped: string): string {
  const chip = (_m: string, mm: string, ss: string): string =>
    `<span style="color:#0d9488;border-bottom:1px dashed #14b8a6;background:#f0fdfa;border-radius:3px;padding:0 4px" title="⏱ ${mm}:${ss} 跳转到会话对应片段">⏱ ${mm}:${ss}</span>`;
  return escaped
    // 章节形态（含包裹括号）：`[[⏱ MM:SS]([[ts:ms]])]`
    .replace(/\[\[⏱ (\d+):(\d{2})\]\(\[\[ts:\d+\]\]\)\]/g, chip)
    // 段落形态：`[⏱ MM:SS]([[ts:ms]])`
    .replace(/\[⏱ (\d+):(\d{2})\]\(\[\[ts:\d+\]\]\)/g, chip);
}
