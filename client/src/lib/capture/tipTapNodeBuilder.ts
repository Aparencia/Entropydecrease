/**
 * TipTap 节点构建（纯函数层）
 *
 * @ai-context: 从 NoteGenerator 拆出——FusionSegment → TipTap JSON 的
 * 节点结构（时间戳段落/主文本/latex codeBlock/分隔线）是编辑器渲染契约，
 * attrs.class 引用设计系统 token（text-text-tertiary/text-c2）。
 * @ai-context: extractLatexFormulas 支持 $...$、$$...$$、\[...\] 三种
 * 定界符并按首次出现去重；全部纯函数。
 */
import type { FusionSegment } from './crossFusion';

/** TipTap JSON 节点（简化类型，避免使用 any） */
export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNodeContent[];
  marks?: TipTapMark[];
}

/** TipTap 节点内容 */
export interface TipTapNodeContent {
  type: string;
  text?: string;
  marks?: TipTapMark[];
}

/** TipTap 文本标记 */
export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** LaTeX 公式正则：匹配 $...$ 或 $$...$$ 或 \[...\] */
const LATEX_INLINE_RE = /\$\$?([^$]+?)\$\$?/g;
const LATEX_BRACKET_RE = /\\\[([\s\S]+?)\\\]/g;

/**
 * 格式化时间戳为 HH:MM:SS（不足 1 小时省略小时段）
 */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * 从文本中提取 LaTeX 公式
 * 支持 $...$、$$...$$、\[...\] 三种格式
 */
export function extractLatexFormulas(text: string): string[] {
  const formulas: string[] = [];
  const seen = new Set<string>();

  // 匹配 $$...$$ 和 $...$
  for (const match of text.matchAll(LATEX_INLINE_RE)) {
    const formula = match[1].trim();
    if (formula && !seen.has(formula)) {
      seen.add(formula);
      formulas.push(formula);
    }
  }

  // 匹配 \[...\]
  for (const match of text.matchAll(LATEX_BRACKET_RE)) {
    const formula = match[1].trim();
    if (formula && !seen.has(formula)) {
      seen.add(formula);
      formulas.push(formula);
    }
  }

  return formulas;
}

/**
 * 将 FusionSegment 转换为 TipTap JSON 节点数组
 * 包含时间戳标记、主文本、公式（如有）、分隔线
 */
export function segmentToTipTapNodes(segment: FusionSegment): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  // 1. 时间戳标记（灰色小字）
  nodes.push({
    type: 'paragraph',
    attrs: { class: 'text-text-tertiary text-c2' },
    content: [
      {
        type: 'text',
        text: `[${formatTimestamp(segment.startTime)}]`,
      },
    ],
  });

  // 2. 主文本内容
  if (segment.mergedText) {
    nodes.push({
      type: 'paragraph',
      content: [
        { type: 'text', text: segment.mergedText },
      ],
    });
  }

  // 3. 公式提取（视觉文本中的 LaTeX）
  if (segment.hasFormula && segment.visionText) {
    const formulas = extractLatexFormulas(segment.visionText);
    for (const formula of formulas) {
      nodes.push({
        type: 'codeBlock',
        attrs: { language: 'latex' },
        content: [
          { type: 'text', text: formula },
        ],
      });
    }
  }

  // 4. 分隔线
  nodes.push({ type: 'horizontalRule' });

  return nodes;
}
