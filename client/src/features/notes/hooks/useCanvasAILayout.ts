/**
 * 自由画布 AI 排版引擎 hook
 * Free canvas AI layout engine hook
 *
 * @ai-context: 分析 FreeCanvas 的 blocks 文本内容关系，自动重新排列布局。
 * 支持树形/时间线/聚类三种模式。AI 不可用时降级为简单网格排列。
 * @ai-context: Analyzes FreeCanvas block text relationships to auto-arrange
 * layout. Supports tree/timeline/cluster modes. Falls back to grid layout.
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useToast } from '@/components/ui';
import type { FreeCanvasBlock } from '@/types/models';

export type LayoutMode = 'tree' | 'timeline' | 'cluster';

interface UseCanvasAILayoutReturn {
  loading: boolean;
  /** 执行 AI 排版，返回新坐标 */
  layout: (blocks: FreeCanvasBlock[], mode: LayoutMode) => Promise<FreeCanvasBlock[]>;
}

const GRID_PADDING = 120;
const GRID_COLS = 4;

/**
 * 降级方案：网格排列
 * Fallback: simple grid layout
 */
function gridLayout(blocks: FreeCanvasBlock[]): FreeCanvasBlock[] {
  return blocks.map((block, i) => ({
    ...block,
    position: {
      x: GRID_PADDING + (i % GRID_COLS) * 300,
      y: GRID_PADDING + Math.floor(i / GRID_COLS) * 200,
    },
  }));
}

export function useCanvasAILayout(): UseCanvasAILayoutReturn {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const layout = useCallback(async (blocks: FreeCanvasBlock[], mode: LayoutMode): Promise<FreeCanvasBlock[]> => {
    if (blocks.length === 0) return [];
    setLoading(true);

    try {
      const texts = blocks.map((b, i) => `[${i}] ${b.content.slice(0, 100)}`).join('\n');
      const modeLabels = { tree: '树形结构', timeline: '时间线', cluster: '聚类分组' };
      const prompt = `分析以下文本块之间的关系，以 ${modeLabels[mode]} 方式排列。
返回 JSON 数组（不要其他内容），每个元素格式：{index: 数字, x: 水平位置(0-1000), y: 垂直位置(0-1000)}

文本块列表：
${texts}`;

      const result = await aiPluginLoader.summarizeNote(prompt, { style: 'outline' });
      const summary = result?.summary || '';

      let positions: Array<{ index: number; x: number; y: number }> = [];
      try {
        const cleaned = summary.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const startIdx = cleaned.indexOf('[');
        const endIdx = cleaned.lastIndexOf(']');
        if (startIdx !== -1 && endIdx > startIdx) {
          positions = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
        }
      } catch { /* use fallback */ }

      if (positions.length === blocks.length) {
        toast({ type: 'success', message: `${modeLabels[mode]}排版完成`, silent: true });
        setLoading(false);
        return blocks.map((block, i) => {
          const pos = positions.find((p) => p.index === i);
          return {
            ...block,
            position: { x: pos?.x ?? block.position.x, y: pos?.y ?? block.position.y },
          };
        });
      }

      // 降级为网格布局
      toast({ type: 'info', message: 'AI 排版降级为网格布局', silent: true });
      setLoading(false);
      return gridLayout(blocks);
    } catch {
      toast({ type: 'info', message: 'AI 排版不可用，使用网格布局', silent: true });
      setLoading(false);
      return gridLayout(blocks);
    }
  }, [toast]);

  return { loading, layout };
}

export default useCanvasAILayout;