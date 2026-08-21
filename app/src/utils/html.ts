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
