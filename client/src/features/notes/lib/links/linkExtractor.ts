/**
 * 笔记链接提取（纯函数）
 * Extract wiki-link targets from note content (pure function)
 *
 * @ai-context: 阶段二双向链接。从笔记内容（TipTap JSON）中提取 wiki-link 节点
 * （type==='wikiLink'）的 attrs.id 作为出链目标。纯函数、可单测；损坏 JSON
 * 安全返回空数组。反向链接索引（noteLinkStore）据此在笔记保存时重建出链。
 * @ai-context: Extracts wiki-link node attrs.id (outgoing link targets) from
 * TipTap JSON content. Pure & testable; returns [] on malformed JSON.
 */

/**
 * 提取笔记内容中的 wiki-link 目标笔记 id（去重）。
 * Extract deduplicated wiki-link target note ids from note content.
 */
export function extractLinkTargets(content: string): string[] {
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    return [];
  }

  const targets = new Set<string>();

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: unknown; attrs?: unknown; content?: unknown };
    if (n.type === 'wikiLink') {
      const id = (n.attrs as { id?: unknown } | undefined)?.id;
      if (typeof id === 'string' && id) targets.add(id);
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
    }
  };

  walk(doc);
  return [...targets];
}

/**
 * 提取每个 wiki-link 的上下文文本（前后各 N 字符）。
 * Extract surrounding context text for each wiki-link target.
 */
export interface LinkTargetWithContext {
  id: string;
  contextText: string;
}

export function extractLinkContexts(content: string, contextChars = 60): LinkTargetWithContext[] {
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    return [];
  }

  const results: LinkTargetWithContext[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown, parentText: string): string => {
    if (!node || typeof node !== 'object') return '';
    const n = node as { type?: unknown; attrs?: unknown; content?: unknown; text?: string };

    if (n.type === 'wikiLink') {
      const id = (n.attrs as { id?: unknown } | undefined)?.id;
      if (typeof id === 'string' && id && !seen.has(id)) {
        seen.add(id);
        // 取前后各 N 字符作为上下文
        const start = Math.max(0, parentText.length - contextChars);
        const context = parentText.slice(start).trim();
        if (context) {
          results.push({ id, contextText: context.slice(0, contextChars * 2) });
        }
      }
      return '';
    }

    const text = typeof n.text === 'string' ? n.text : '';
    let accumulated = text;
    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        accumulated += walk(child, accumulated);
      }
    }
    return accumulated;
  };

  walk(doc, '');
  return results;
}
