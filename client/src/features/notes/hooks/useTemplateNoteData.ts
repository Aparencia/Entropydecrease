/**
 * 模板笔记数据适配 hook（自由画布 / 思维导图）
 * Template note data adapter hook (free canvas / mindmap)
 *
 * @ai-context: 从 NoteEditPage 拆出。free 模板：JSON.parse 全文得 blocks 与
 * 画布尺寸（损坏/非 free 返回 null）；mindmap 模板：parseMindmapData 解析，
 * 损坏/空时回退默认导图。两份变更回调均序列化整份数据走防抖保存管线
 * （稳定引用，避免每次渲染重建）。仅文件切分，逻辑原样迁移。
 * @ai-context: Extracted from NoteEditPage. Free template: JSON.parse of full
 * content yields blocks and canvas size (corrupt/non-free → null); mindmap
 * template: parseMindmapData with default-map fallback on corrupt/empty.
 * Both change callbacks serialize the whole payload through the debounced
 * save pipeline (stable refs, no per-render rebuilds). Split only, logic
 * moved verbatim.
 */
import { useMemo, useCallback } from 'react';
import type { Note, FreeCanvasData, MindmapData } from '@/types/models';
import { parseMindmapData, createDefaultMindmap } from '../lib/mindmap/mindmapOps';

interface UseTemplateNoteDataOptions {
  note: Note | null;
  fullContent: string | undefined;
  noteId: string | null;
  debouncedSave: (getContent: () => string) => void;
}

/**
 * 返回 free/mindmap 模板的数据与变更回调。
 * Returns free/mindmap template data and change callbacks.
 */
export function useTemplateNoteData({ note, fullContent, noteId, debouncedSave }: UseTemplateNoteDataOptions) {
  // 解析自由画布数据（全文惰性加载后可得）
  const freeCanvasData = useMemo<FreeCanvasData | null>(() => {
    if (!fullContent || note?.template !== 'free') return null;
    try {
      const parsed = JSON.parse(fullContent);
      if (parsed && parsed.blocks) return {
        blocks: parsed.blocks,
        canvasWidth: parsed.canvasWidth ?? 3000,
        canvasHeight: parsed.canvasHeight ?? 3000,
      };
      return null;
    } catch { return null; }
  }, [fullContent, note?.template]);

  // 自由画布变更回调（稳定引用，避免每次渲染重建）
  const handleFreeCanvasChange = useCallback(
    (data: FreeCanvasData) => {
      if (noteId) debouncedSave(() => JSON.stringify(data));
    },
    [noteId, debouncedSave],
  );

  // 思维导图数据解析（模板笔记提供合法 JSON；损坏/空时回退默认导图）
  const mindmapData = useMemo<MindmapData>(() => {
    if (note?.template === 'mindmap' && fullContent) {
      const parsed = parseMindmapData(fullContent);
      if (parsed) return parsed;
    }
    return createDefaultMindmap();
  }, [fullContent, note?.template]);

  // 思维导图变更回调（序列化整棵树防抖保存）
  const handleMindmapChange = useCallback(
    (data: MindmapData) => {
      if (noteId) debouncedSave(() => JSON.stringify(data));
    },
    [noteId, debouncedSave],
  );

  return { freeCanvasData, handleFreeCanvasChange, mindmapData, handleMindmapChange };
}
