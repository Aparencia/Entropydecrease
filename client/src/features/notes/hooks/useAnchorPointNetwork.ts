/**
 * 锚点网络 hook——锚点之间建立关联关系
 * Anchor point network hook — build relationships between anchors
 *
 * @ai-context: 基于共享概念标签在锚点之间建立关联，生成锚点关系图谱。
 * 锚点 importance 根据用户后续编辑行为动态调整。
 * @ai-context: Builds relationships between anchor points based on shared
 * concept tags. Anchor importance dynamically adjusts based on user behavior.
 */
import { useMemo } from 'react';

interface AnchorNode {
  id: string;
  concept: string;
  importance: number;
  createdAt: string;
}

interface AnchorEdge {
  source: string;
  target: string;
  strength: number;
  label: string;
}

interface UseAnchorPointNetworkReturn {
  nodes: AnchorNode[];
  edges: AnchorEdge[];
}

/**
 * 从锚点列表构建关联网络
 * Build relationship network from anchor points list
 */
export function useAnchorPointNetwork(anchorPoints: AnchorNode[]): UseAnchorPointNetworkReturn {
  const edges = useMemo(() => {
    const result: AnchorEdge[] = [];

    for (let i = 0; i < anchorPoints.length; i++) {
      for (let j = i + 1; j < anchorPoints.length; j++) {
        const a = anchorPoints[i];
        const b = anchorPoints[j];
        const aWords = new Set(a.concept.split(/[\s,，、/\\\-_]+/).filter(Boolean));
        const bWords = new Set(b.concept.split(/[\s,，、/\\\-_]+/).filter(Boolean));

        // 计算概念重叠度
        let overlap = 0;
        for (const word of aWords) {
          if (bWords.has(word)) overlap++;
        }

        const maxWords = Math.max(aWords.size, bWords.size);
        if (maxWords === 0) continue;

        const strength = overlap / maxWords;
        if (strength > 0) {
          result.push({
            source: a.id,
            target: b.id,
            strength: Math.min(strength + 0.1, 1), // 保底关联
            label: strength >= 0.5 ? '强关联' : '弱关联',
          });
        }
      }
    }

    return result;
  }, [anchorPoints]);

  return { nodes: anchorPoints, edges };
}

export default useAnchorPointNetwork;