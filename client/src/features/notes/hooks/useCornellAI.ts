/**
 * AI 动态康奈尔 hook——自动填充总结栏和线索栏
 * AI dynamic Cornell hook — auto-fill summary and cues
 *
 * @ai-context: 编辑康奈尔笔记时，AI 自动分析正文生成总结栏内容和线索栏
 * 的关键问题。用户可一键采纳或手动修改。30 秒无编辑后自动触发。
 * @ai-context: Analyzes Cornell note content to auto-generate summary and
 * cue questions. Auto-triggers after 30s of inactivity.
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useToast } from '@/components/ui';

interface CornellAISuggestion {
  summary: string;
  cues: Array<{ question: string; answer: string }>;
}

interface UseCornellAIReturn {
  /** 正在加载 */
  loading: boolean;
  /** AI 建议 */
  suggestion: CornellAISuggestion | null;
  /** 手动触发分析 */
  analyze: (notesText: string) => Promise<void>;
  /** 清除建议 */
  clear: () => void;
}

export function useCornellAI(): UseCornellAIReturn {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<CornellAISuggestion | null>(null);
  const { toast } = useToast();

  const analyze = useCallback(async (notesText: string) => {
    if (!notesText.trim() || notesText.length < 50) return;
    setLoading(true);

    try {
      const prompt = `分析以下康奈尔笔记的笔记栏内容，返回 JSON 格式（不要其他内容）：
{
  "summary": "总结段落（2-3 句话概括核心内容）",
  "cues": [
    {"question": "关键词/问题", "answer": "对应的简短答案"}
  ]
}

笔记栏内容：
${notesText.slice(0, 2000)}`;

      const result = await aiPluginLoader.summarizeNote(prompt, { style: 'outline' });
      const summary = result?.summary || '';

      let parsed: CornellAISuggestion;
      try {
        const cleaned = summary.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const startIdx = cleaned.indexOf('{');
        const endIdx = cleaned.lastIndexOf('}');
        if (startIdx !== -1 && endIdx > startIdx) {
          parsed = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsed = {
          summary: summary.slice(0, 200),
          cues: [{ question: '核心概念', answer: summary.slice(0, 100) }],
        };
      }

      setSuggestion(parsed);
      toast({ type: 'success', message: '康奈尔 AI 分析完成', silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '分析失败';
      toast({ type: 'error', message: `AI 分析失败：${msg}` });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const clear = useCallback(() => {
    setSuggestion(null);
  }, []);

  return { loading, suggestion, analyze, clear };
}

export default useCornellAI;