/**
 * AI 概念提取 hook
 * AI concept extraction hook
 *
 * @ai-context: 从笔记正文中提取核心概念实体，存入 conceptStore 供全局查询。
 * 复用 aiPluginLoader 的 summarizeNote 方法，通过 prompt 引导 AI 返回结构化
 * 概念列表。AI 不可用时降级为本地规则提取。
 * @ai-context: Extracts core concept entities from note text, persists to
 * conceptStore for global query. Uses summarizeNote with structured prompt.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { extractNoteText } from '../lib/extractNoteText';
import { saveConcepts } from '../lib/conceptStore';

export interface ExtractedConcept {
  name: string;
  relevance: number;
  context: string;
}

interface UseConceptExtractorReturn {
  /** 正在提取 */
  loading: boolean;
  /** 提取结果 */
  concepts: ExtractedConcept[];
  /** 提取概念 */
  extract: (noteId: string, content: string, noteTitle: string) => Promise<ExtractedConcept[]>;
  /** 清除缓存 */
  clear: (noteId: string) => Promise<void>;
}

/**
 * 从笔记内容中提取概念实体的纯客户端逻辑（非 AI 依赖）。
 * 当 AI 不可用时用作降级方案。
 */
function extractConceptsLocal(content: string, noteTitle: string): ExtractedConcept[] {
  const text = typeof content === 'string' && content.startsWith('{')
    ? extractNoteText(content)
    : content || '';
  const displayText = text || noteTitle;
  if (!displayText.trim()) return [];

  const results: ExtractedConcept[] = [];
  const seen = new Set<string>();

  if (noteTitle && noteTitle !== '无标题' && !seen.has(noteTitle)) {
    seen.add(noteTitle);
    results.push({
      name: noteTitle.slice(0, 30),
      relevance: 0.9,
      context: displayText.slice(0, 100),
    });
  }

  const firstLine = displayText.split('\n').map((l) => l.trim()).find((l) => l.length > 5);
  if (firstLine && !seen.has(firstLine.slice(0, 30))) {
    seen.add(firstLine.slice(0, 30));
    results.push({
      name: firstLine.slice(0, 30),
      relevance: 0.6,
      context: firstLine.slice(0, 100),
    });
  }

  return results;
}

/**
 * 从 AI 摘要文本中解析概念实体。
 * 预期格式：每行一个概念，格式为 "概念名 (相关度) — 上下文"
 */
function parseConceptsFromSummary(summary: string): ExtractedConcept[] {
  const concepts: ExtractedConcept[] = [];
  const lines = summary.split('\n');

  for (const line of lines) {
    const trimmed = line.replace(/^[-*•·\d+.)\s]+/, '').trim();
    if (!trimmed || trimmed.length < 2) continue;

    // 尝试匹配 "概念名 (0.X) — 上下文" 格式
    const match = trimmed.match(/^(.+?)\s*\((\d+\.?\d*)\)\s*[—–-]\s*(.+)$/);
    if (match) {
      concepts.push({
        name: match[1].trim().slice(0, 30),
        relevance: Math.min(1, Math.max(0, parseFloat(match[2]) || 0.5)),
        context: match[3].trim().slice(0, 100),
      });
    } else {
      // 回退：整行作为概念名
      concepts.push({
        name: trimmed.slice(0, 30),
        relevance: 0.5,
        context: trimmed.slice(0, 100),
      });
    }
  }

  return concepts;
}

export function useConceptExtractor(): UseConceptExtractorReturn {
  const [loading, setLoading] = useState(false);
  const [concepts, setConcepts] = useState<ExtractedConcept[]>([]);
  const cancelRef = useRef(false);

  useEffect(() => {
    return () => { cancelRef.current = true; };
  }, []);

  const extract = useCallback(async (
    noteId: string,
    content: string,
    noteTitle: string,
  ): Promise<ExtractedConcept[]> => {
    setLoading(true);
    cancelRef.current = false;

    try {
      // 尝试 AI 提取：使用 summarizeNote 方法，通过 prompt 引导返回结构化概念列表
      const text = typeof content === 'string' && content.startsWith('{')
        ? extractNoteText(content)
        : content || '';
      const sourceText = (text || noteTitle).slice(0, 2000);

      const result = await aiPluginLoader.summarizeNote(
        `请从以下笔记中提取核心概念实体，以每行一个的格式返回：\n"概念名 (相关度0-1) — 上下文描述"\n\n笔记文本：\n\n${sourceText}`,
        { style: 'bullet' },
      );

      let parsed: ExtractedConcept[] = [];
      if (result?.summary) {
        parsed = parseConceptsFromSummary(result.summary);
      }

      if (parsed.length === 0) {
        parsed = extractConceptsLocal(content, noteTitle);
      }

      const enriched = parsed.map((c) => ({
        ...c,
        context: c.context || (text || noteTitle).slice(0, 100),
      }));

      if (!cancelRef.current) {
        setConcepts(enriched);
        await saveConcepts(noteId, enriched);
      }

      setLoading(false);
      return enriched;
    } catch {
      if (!cancelRef.current) {
        const local = extractConceptsLocal(content, noteTitle);
        setConcepts(local);
        await saveConcepts(noteId, local);
        setLoading(false);
        return local;
      }
      setLoading(false);
      return [];
    }
  }, []);

  const clear = useCallback(async (noteId: string) => {
    setConcepts([]);
    const { removeConcepts } = await import('../lib/conceptStore');
    await removeConcepts(noteId);
  }, []);

  return { loading, concepts, extract, clear };
}

export default useConceptExtractor;