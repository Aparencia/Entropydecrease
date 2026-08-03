/**
 * useConceptConflict — N6 概念冲突检测（笔记编辑页自动触发）
 *
 * @ai-context: 当前笔记内容足够后，自动取最近 5 篇其他笔记作为"历史理解"，
 * 调用 AI 比对新旧理解之间的矛盾冲突（错误概念转变：先破后立）。
 * 每个笔记会话仅检测一次；AI 失败或无历史时静默不打扰。
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Note } from '@/types/models';
import type { ConceptConflict } from '@/lib/ai/types';
import { useAIConflictDetect } from '@/lib/ai/hooks/useAIConflictDetect';

/** 触发检测的最少当前笔记字数 */
const MIN_NOTE_LEN = 100;
/** 内容稳定后的延迟触发时间（避免编辑中频繁调用） */
const SETTLE_DELAY_MS = 5000;
/** 参与比对的历史笔记数量 */
const HISTORY_NOTE_COUNT = 5;
/** 单篇历史笔记截取长度 */
const HISTORY_SLICE_LEN = 600;

/** 从 TipTap JSON 或纯文本中提取纯文本 */
function extractText(content: string): string {
  try {
    const json = JSON.parse(content);
    if (json?.content) {
      const walk = (nodes: unknown[]): string => nodes.map((n) => {
        const node = n as { text?: string; content?: unknown[] };
        return (node.text ?? '') + (node.content ? walk(node.content) : '');
      }).join('');
      return walk(json.content);
    }
    return '';
  } catch {
    return content;
  }
}

/**
 * 概念冲突自动检测 hook
 */
export function useConceptConflict(noteId: string | null, noteText: string, allNotes: Note[]) {
  const [conflicts, setConflicts] = useState<ConceptConflict[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const checkedRef = useRef<Set<string>>(new Set());
  const { detect } = useAIConflictDetect();

  useEffect(() => {
    if (!noteId || dismissed) return;
    if (checkedRef.current.has(noteId)) return;
    if (noteText.trim().length < MIN_NOTE_LEN) return;

    // 内容稳定后再检测，避免编辑过程中频繁调用
    const timer = setTimeout(async () => {
      if (checkedRef.current.has(noteId!)) return;
      checkedRef.current.add(noteId!);

      // 历史理解：最近更新的 5 篇其他笔记摘录
      const history = allNotes
        .filter((n) => n.id !== noteId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, HISTORY_NOTE_COUNT)
        .map((n) => `【${n.title || '未命名'}】\n${extractText(n.content).slice(0, HISTORY_SLICE_LEN)}`)
        .join('\n\n');
      if (history.trim().length < 30) return; // 无历史可比对

      const result = await detect(noteText, history);
      if (result && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
      }
    }, SETTLE_DELAY_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, noteText, allNotes, dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setConflicts([]);
  }, []);

  return { conflicts, dismiss };
}
