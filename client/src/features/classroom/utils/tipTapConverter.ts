/**
 * Markdown → TipTap JSON 转换工具
 *
 * 课堂助手生成的分析结果是 Markdown 文本，而 Note.content 字段存储的是
 * TipTap JSON（NoteEditPage 仅识别 type === 'doc' 的 JSON，否则编辑器为空）。
 * 此模块负责将 Markdown 转为合法的 TipTap JSON 文档，保证笔记可正常打开编辑。
 *
 * @ai-context: classroom 功能模块：tipTapConverter。
 */

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

function textNode(text: string): TipTapNode {
  return { type: 'text', text };
}

function paragraphNode(text: string): TipTapNode {
  return text ? { type: 'paragraph', content: [textNode(text)] } : { type: 'paragraph' };
}

/** 去除行内 Markdown 标记（**粗体**、*斜体*、`code`、列表前缀） */
function stripInlineMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/**
 * 将 Markdown 文本转换为 TipTap JSON 文档字符串
 * 支持：标题（#~######）、分隔线（---）、无序列表（- / *）、图片（![alt](src)）、普通段落
 */
export function markdownToTipTapJson(md: string): string {
  const lines = md.split('\n');
  const nodes: TipTapNode[] = [];
  let listBuffer: TipTapNode[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      nodes.push({ type: 'bulletList', content: listBuffer });
      listBuffer = [];
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    // 空行：结束当前列表
    if (!trimmed) {
      flushList();
      continue;
    }

    // 标题
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushList();
      nodes.push({
        type: 'heading',
        attrs: { level: h[1].length },
        content: [textNode(stripInlineMd(h[2]))],
      });
      continue;
    }

    // 分隔线
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushList();
      nodes.push({ type: 'horizontalRule' });
      continue;
    }

    // 图片：独立一行的 ![alt](src)
    // 编辑器 Image 扩展为 inline 模式，image 节点需包裹在 paragraph 内
    const img = trimmed.match(/^!\[([^\]]*)\]\(([^()\s]+)\)$/);
    if (img) {
      flushList();
      nodes.push({
        type: 'paragraph',
        content: [{ type: 'image', attrs: { src: img[2], alt: img[1] } }],
      });
      continue;
    }

    // 无序列表项
    const li = trimmed.match(/^[-*]\s+(.*)$/);
    if (li) {
      listBuffer.push({ type: 'listItem', content: [paragraphNode(stripInlineMd(li[1]))] });
      continue;
    }

    // 普通段落
    flushList();
    nodes.push(paragraphNode(stripInlineMd(trimmed)));
  }
  flushList();

  if (nodes.length === 0) nodes.push(paragraphNode(''));
  return JSON.stringify({ type: 'doc', content: nodes });
}

/**
 * 将新的 Markdown 内容追加到已有 TipTap JSON 文档末尾
 * 以「分隔线 + 二级标题（sessionLabel）」作为分段标记
 *
 * @param existingContent 已有笔记的 content（TipTap JSON 字符串，可能为空或非法）
 * @param sessionLabel    分段标题，如 "2026/7/28 第2次采集"
 * @param newMarkdown     本次采集生成的 Markdown 内容
 */
export function appendMarkdownToTipTapJson(
  existingContent: string,
  sessionLabel: string,
  newMarkdown: string,
): string {
  // 解析新内容为节点数组
  const newNodes = (JSON.parse(markdownToTipTapJson(newMarkdown)) as { content: TipTapNode[] }).content;

  // 分段标记：分隔线 + 二级标题
  const separator: TipTapNode[] = [
    { type: 'horizontalRule' },
    { type: 'heading', attrs: { level: 2 }, content: [textNode(sessionLabel)] },
  ];

  // 解析已有文档；非法时降级为纯文本段落，保证不丢数据
  let base: TipTapNode[];
  try {
    const parsed = JSON.parse(existingContent) as { type?: string; content?: TipTapNode[] };
    if (parsed && parsed.type === 'doc' && Array.isArray(parsed.content)) {
      base = parsed.content;
    } else {
      base = existingContent.trim() ? [paragraphNode(existingContent)] : [];
    }
  } catch {
    base = existingContent.trim() ? [paragraphNode(existingContent)] : [];
  }

  return JSON.stringify({ type: 'doc', content: [...base, ...separator, ...newNodes] });
}
