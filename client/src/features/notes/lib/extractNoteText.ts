/**
 * 笔记内容纯文本提取（共享工具）
 * Note content plain-text extractor (shared utility)
 *
 * @ai-context: note.content 存储格式为 TipTap JSON 字符串（JSON.stringify(editor.getJSON())），
 * 直接做 HTML 正则剥离无效。此工具优先按 TipTap JSON 递归提取 text 节点，
 * 解析失败回退为 HTML 标签剥离，供跨模块（笔记/闪卡恢复包等）复用。
 * @ai-context: note.content is a TipTap JSON string; recursively extract text
 * nodes with HTML-tag-strip fallback. Shared across features.
 */

/** 剥离 HTML 标签（回退路径） */
function stripHtmlTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ');
}

/** 递归遍历 TipTap JSON 节点收集 text */
function walkNodes(nodes: unknown[]): string {
  return nodes
    .map((n) => {
      const node = n as { text?: string; content?: unknown[] };
      const text = typeof node.text === 'string' ? node.text : '';
      const children = Array.isArray(node.content) ? walkNodes(node.content) : '';
      // 块级节点后补换行，保留段落结构
      return text + children + (children || text ? '\n' : '');
    })
    .join('');
}

/**
 * 从笔记 content（TipTap JSON 字符串 / HTML / 纯文本）提取纯文本
 *
 * @param content note.content 原始值
 * @returns 纯文本（可能含换行），提取失败返回原文剥标签结果
 */
export function extractNoteText(content: string | undefined | null): string {
  if (!content) return '';
  try {
    const json = JSON.parse(content) as { content?: unknown[] };
    if (json && Array.isArray(json.content)) {
      return walkNodes(json.content);
    }
    // 合法 JSON 但非 TipTap 结构（如纯字符串 JSON），回退剥标签
    return stripHtmlTags(content);
  } catch {
    // 非 JSON：视为 HTML 或纯文本
    return stripHtmlTags(content);
  }
}
