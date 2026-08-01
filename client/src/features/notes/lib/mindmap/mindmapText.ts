/**
 * 导图纯文本提取 + 笔记内容统一提取器
 * Mindmap plain-text extraction + unified note content extractor
 *
 * @ai-context: 搜索索引与字数统计需要纯文本。TipTap JSON 由 searchScoring 的
 * extractPlainText 处理（仅识别 type==='doc'）；导图 JSON（type==='mindmap'）
 * 会落入其原样返回分支而污染索引，故 noteContentToPlainText 先判别导图走
 * mindmapToPlainText，其余复用 extractPlainText。
 * @ai-context: Search index & word count need plain text. TipTap is handled by
 * extractPlainText (type==='doc' only); mindmap JSON is routed to mindmapToPlainText.
 */
import type { MindmapNode } from '@/types/models';
import { extractPlainText } from '@/lib/search/searchScoring';
import { isMindmapData, parseMindmapData } from './mindmapOps';

/** 深度优先拼接导图节点文本（换行分隔） / DFS-join mindmap node texts */
export function mindmapToPlainText(root: MindmapNode): string {
  const parts: string[] = [];
  const walk = (node: MindmapNode): void => {
    const text = node.text.trim();
    if (text) parts.push(text);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return parts.join('\n');
}

/**
 * 笔记内容统一纯文本提取：导图走 mindmapToPlainText，其余复用 extractPlainText。
 * Unified extractor: mindmap -> mindmapToPlainText, otherwise extractPlainText.
 */
export function noteContentToPlainText(content: string): string {
  if (isMindmapData(content)) {
    const data = parseMindmapData(content);
    if (data) return mindmapToPlainText(data.root);
  }
  return extractPlainText(content);
}
