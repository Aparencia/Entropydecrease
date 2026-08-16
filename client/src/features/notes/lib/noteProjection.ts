/**
 * 笔记列表投影查询：content 解密后仅保留截断预览
 * Note list projection: decrypted content reduced to a truncated preview
 *
 * @ai-context: 从 useNoteStore 拆出的数据访问层。数百篇图片笔记下，若把全文
 * content（含内嵌 base64 图片串）常驻内存，内存峰值可达数百 MB；投影后仅保留
 * 卡片预览，全文按需走 noteStore.getById（解密路径）。decryptField 对明文旧数据
 * 优雅降级返回原文。
 * @ai-context: Extracted from useNoteStore. Keeps only truncated previews in memory;
 * full content is fetched on demand via the decrypted getById path.
 */
import { db } from '@/lib/storage/database';
import { cryptoManager } from '@/lib/crypto';
import type { Note } from '@/types/models';
import { noteContentToPlainText } from './mindmap/mindmapText';

/** 列表预览保留长度（字符）：卡片摘要/详情预览足够 */
const PREVIEW_CHARS = 300;
/** 内嵌 base64 图片串（预览/纯文本提取不需要图片数据） */
const BASE64_IMAGE_RE = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;

/**
 * 笔记列表投影查询：content 解密后仅保留截断预览（剥离内嵌 base64 图片串）。
 * @ai-context P1-1：全文按需走 noteStore.getById（解密路径）。
 */
export async function getAllNoteMeta(): Promise<Note[]> {
  const items = await db.notes.toArray();
  const metas: Note[] = [];
  for (const item of items) {
    const note = item as Note;
    // content 为密文（SENSITIVE_FIELDS.notes）或明文（加密未初始化/旧数据）：
    // decryptField 优雅降级返回原文；解密后立即剥离 base64 并截断，全文不常驻
    let preview = '';
    if (note.content) {
      try {
        // 统一纯文本提取（TipTap/导图；图片节点由 P0-4 跳过），
        // 双保险再剥离残留 base64 串，截断为卡片预览长度
        const raw = await cryptoManager.decryptField(note.content);
        preview = noteContentToPlainText(raw).replace(BASE64_IMAGE_RE, ' [图片] ').slice(0, PREVIEW_CHARS);
      } catch {
        preview = '';
      }
    }
    metas.push({ ...note, content: preview });
  }
  return metas;
}
