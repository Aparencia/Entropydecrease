/**
 * 搜索评分与文本处理（纯函数层）
 *
 * @ai-context: BM25 简化版参数（K1=1.5, B=0.75）与 ENTITY_LENGTH_WEIGHT
 * 权重共同决定多实体混排的相对得分；调整任一权重会改变搜索结果排序，
 * 需用真实数据集回归验证。
 * @ai-context: extractPlainText 兼容 TipTap JSON 与纯文本双格式输入；
 * 全部为纯函数，无副作用，可安全重构。
 */
import type { SearchEntityType } from '@/types/models';

// ---------------------------------------------------------------------------
// BM25 参数（简化版，适合小规模多实体搜索）
// ---------------------------------------------------------------------------

export const BM25_K1 = 1.5;
export const BM25_B = 0.75;

/**
 * 各实体类型的文档长度归一化权重
 * 闪卡/灵感内容较短，费曼笔记/课堂笔记内容较长，
 * 通过权重调整 BM25 中的 docLen / avgDocLen 比值，
 * 使短内容（如闪卡）不至于因为长度短而得分偏高。
 */
export const ENTITY_LENGTH_WEIGHT: Record<SearchEntityType, number> = {
  note: 1.0,
  flashcard: 0.6,   // 闪卡内容短，降低长度影响
  feynman: 1.2,     // 费曼笔记偏长
  inspiration: 0.7, // 灵感较短
  classroom: 1.3,   // 课堂笔记较长
};

/**
 * 从 TipTap JSON 内容中提取纯文本
 * content 可能是 JSON 字符串（TipTap 文档结构）、也可能已经是纯文本
 */
export function extractPlainText(content: string): string {
  try {
    const doc = JSON.parse(content);
    if (doc?.type === 'doc' && Array.isArray(doc.content)) {
      const extract = (nodes: Array<Record<string, unknown>>): string => {
        const parts: string[] = [];
        for (const node of nodes) {
          // P0-4：跳过图片节点——其 src 内嵌 base64 不应进入纯文本/搜索索引，
          // 也避免未来 image 带 caption 子树时被误提取
          if (node.type === 'image') continue;
          if (node.type === 'text' && typeof node.text === 'string') {
            parts.push(node.text);
          }
          if (Array.isArray(node.content)) {
            parts.push(extract(node.content as Array<Record<string, unknown>>));
          }
        }
        return parts.join(' ');
      };
      return extract(doc.content);
    }
  } catch {
    // 非 JSON 或解析失败，当作纯文本处理
  }
  return content;
}

/**
 * 计算 IDF（逆文档频率）
 * IDF(t) = log((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
 */
export function computeIDF(totalDocs: number, docFreq: number): number {
  return Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
}

/**
 * 生成匹配上下文摘要（以首个命中 token 为中心截取 -30/+90 字符）
 */
export function buildSnippet(content: string, matchedTokens: string[]): string {
  if (!content) return '';
  const lowerContent = content.toLowerCase();

  let bestIndex = -1;
  for (const token of matchedTokens) {
    const idx = lowerContent.indexOf(token);
    if (idx !== -1 && (bestIndex === -1 || idx < bestIndex)) {
      bestIndex = idx;
    }
  }

  if (bestIndex === -1) {
    return content.slice(0, 120) + (content.length > 120 ? '...' : '');
  }

  const start = Math.max(0, bestIndex - 30);
  const end = Math.min(content.length, bestIndex + 90);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  return `${prefix}${content.slice(start, end)}${suffix}`;
}
