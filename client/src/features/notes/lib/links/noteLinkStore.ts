/**
 * 笔记链接索引存储（Dexie 适配）
 * Note link index store (Dexie adapter)
 *
 * @ai-context: 阶段二双向链接的派生索引层。noteLinks 表为本地派生索引
 * （由笔记内容 wiki-link 推导，不纳入 CRDT，可随时由 content 重建）。
 * recomputeLinks 幂等（先删该笔记出链再重写）；链接 id 用 `${from}->${to}`
 * 确定性主键防重。getBacklinks 按 toId 反查；removeLinks 清理删除笔记的关联。
 * @ai-context: Derived local index (not CRDT-synced; rebuildable from content).
 * recomputeLinks is idempotent; deterministic `${from}->${to}` key prevents dupes.
 */
import { db } from '@/lib/storage/database';
import type { NoteLink } from '@/types/models';
import { extractLinkTargets, extractLinkContexts } from './linkExtractor';

/**
 * 重算某笔记的出链：先删旧出链，再按内容提取写入新出链（幂等）。
 * Recompute outgoing links for a note (idempotent: delete-then-rewrite).
 */
export async function recomputeLinks(fromId: string, content: string): Promise<void> {
  // 排除自链 / exclude self-links
  const targets = extractLinkTargets(content).filter((id) => id !== fromId);
  // 提取上下文文本用于反向链接预览 / extract context for backlink preview
  const contexts = extractLinkContexts(content);
  const contextMap = new Map(contexts.map((c) => [c.id, c.contextText]));

  await db.transaction('rw', db.noteLinks, async () => {
    await db.noteLinks.where('fromId').equals(fromId).delete();
    const now = new Date();
    const rows: NoteLink[] = targets.map((toId) => ({
      id: `${fromId}->${toId}`,
      fromId,
      toId,
      createdAt: now,
      contextText: contextMap.get(toId) || undefined,
      relevanceScore: contextMap.has(toId) ? 0.7 : undefined,
    }));
    if (rows.length > 0) await db.noteLinks.bulkPut(rows);
  });
}

/** 反向链接：引用了 noteId 的所有链接 / Backlinks: links targeting noteId */
export async function getBacklinks(noteId: string): Promise<NoteLink[]> {
  return db.noteLinks.where('toId').equals(noteId).toArray();
}

/** 清理与 noteId 相关的所有链接（删除笔记时） / Remove all links touching noteId */
export async function removeLinks(noteId: string): Promise<void> {
  await db.transaction('rw', db.noteLinks, async () => {
    await db.noteLinks.where('fromId').equals(noteId).delete();
    await db.noteLinks.where('toId').equals(noteId).delete();
  });
}

/** 全量链接（供图视图组装；节点取自笔记 store） / All links (for graph view) */
export async function getAllLinks(): Promise<NoteLink[]> {
  return db.noteLinks.toArray();
}
