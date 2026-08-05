/**
 * 多感官复习模式 — 类型与工具
 *
 * @ai-context: 3.5 多感官复习——五种复习通道（阅读/听力/书写/讲解/情境）。
 * 模式选择持久化到 localStorage（ed_review_mode），缺失/损坏回退阅读模式。
 */
export type ReviewMode = 'reading' | 'listening' | 'writing' | 'speaking' | 'situational';

export const REVIEW_MODES: ReviewMode[] = [
  'reading',
  'listening',
  'writing',
  'speaking',
  'situational',
];

export const REVIEW_MODE_LABELS: Record<ReviewMode, string> = {
  reading: '阅读',
  listening: '听力',
  writing: '书写',
  speaking: '讲解',
  situational: '情境',
};

export const REVIEW_MODE_HINTS: Record<ReviewMode, string> = {
  reading: '翻转卡片，回忆答案',
  listening: '听语音回想答案',
  writing: '默写答案后自检',
  speaking: '开口讲解检验理解',
  situational: '在情境中运用知识',
};

const REVIEW_MODE_STORAGE_KEY = 'ed_review_mode';

/** 从 localStorage 读取复习模式；缺失/损坏回退默认阅读模式 */
export function loadReviewMode(): ReviewMode {
  try {
    const raw = localStorage.getItem(REVIEW_MODE_STORAGE_KEY);
    if (raw && (REVIEW_MODES as string[]).includes(raw)) return raw as ReviewMode;
  } catch {
    /* localStorage 不可用时回退默认 */
  }
  return 'reading';
}

/** 持久化复习模式选择（localStorage 不可用时静默降级） */
export function saveReviewMode(mode: ReviewMode): void {
  try {
    localStorage.setItem(REVIEW_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** 将可能含 HTML/Markdown 的卡片正面提取为纯文本（TTS/书写/情境模式用） */
export function extractPlainText(input: string): string {
  if (!input) return '';
  const withoutTags = input.replace(/<[^>]*>/g, ' ');
  return withoutTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
