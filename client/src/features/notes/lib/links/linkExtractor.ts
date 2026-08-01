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
