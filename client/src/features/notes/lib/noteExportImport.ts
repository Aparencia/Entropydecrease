/**
 * 笔记导出/导入工具
 * Note export/import utilities
 *
 * @ai-context: 从 NoteEditPage 拆出。阶段四导出当前笔记为 Markdown（导图笔记
 * 降级为大纲，见 lib/markdown/noteMarkdown）。P1-1 内存为投影：导出前从库取
 * 解密全文（用户显式操作，成本可接受）。文件名清洗非法字符并截断至 200 字符。
 * 纯副作用函数（触发浏览器下载），无状态、可安全重构。
 * @ai-context: Extracted from NoteEditPage. Phase-4 export of a note as
 * Markdown (mindmap notes degrade to outline via lib/markdown/noteMarkdown).
 * P1-1 store holds only projections: full decrypted content is fetched from
 * the DB before export (explicit user action, acceptable cost). Filename is
 * sanitized of illegal chars and truncated to 200 chars. Side-effect-only
 * function (triggers browser download), stateless and safe to refactor.
 */
import { noteStore } from '@/lib/storage';
import { noteToMarkdown } from './markdown/noteMarkdown';

/**
 * 导出笔记为 Markdown 文件（触发浏览器下载）。
 * Export a note as a Markdown file (triggers a browser download).
 *
 * @param note - 笔记（仅需 id 与 title；title 用于生成文件名）
 * @param fullContent - 当前内存中的全文快照（undefined 时回退读库）
 * @returns Promise<void> 下载完成后 resolve
 */
export async function exportNoteAsMarkdown(
  note: { id: string; title: string },
  fullContent: string | undefined,
): Promise<void> {
  const full = fullContent ?? (await noteStore.getById(note.id))?.content ?? '';
  const md = noteToMarkdown(full);
  const rawName = (note.title || '未命名笔记').replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').slice(0, 200).trim() || '未命名笔记';
  const filename = `${rawName}.md`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
