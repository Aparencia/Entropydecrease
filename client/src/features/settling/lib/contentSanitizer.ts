/**
 * 提取内容清理纯函数
 * Content sanitizer (pure)
 *
 * @ai-context: 阶段 A 原子层。清理 PDF/网页提取的文本噪音：
 * 1) 合并被换行打断的句子（行尾无句读且下一行非空 → 连接）；
 * 2) 丢弃疑似页眉/页脚/页码的孤立短行（≤SHORT_LINE_MAX 字符且无句读）；
 * 3) 压缩连续空白与多余空行。
 * 不改变语义，只提升后续切块与 AI 概念化的输入质量。
 * 纯函数、无副作用。
 *
 * @ai-context: Pure sanitizer for PDF/URL extracted text. Merges broken
 * lines, drops header/footer-like short lines, collapses whitespace.
 *
 * @param raw - 提取到的原始文本（可为空）
 * @returns 清理后的文本（空输入返回 ''）
 */
/** 孤立短行判定阈值（无句读且过短 → 疑似页眉页脚） / Short-line threshold */
export const SHORT_LINE_MAX = 12;

/** 句子边界字符（行尾有句读 → 不合并下行） / Line-ending punctuation */
const SENTENCE_END_RE = /[。！？.!?…]$/;

/** 疑似页码/装饰行（纯数字、纯符号、空格夹杂） / Page-number-like lines */
const JUNK_LINE_RE = /^[\d\s\-—–·•*|/\\]+$/;

/**
 * 单行清理：压缩内部连续空白 / Collapse inner whitespace of a line
 */
function collapseSpaces(line: string): string {
  return line.replace(/[ \t]+/g, ' ').trim();
}

/**
 * 主入口：按行级策略清理 / Main entry: line-wise sanitization
 *
 * @ai-context 处理顺序：行拆分 → 逐行判定（丢弃/合并/保留）→ 重组。
 * 合并规则：上行非空、上行末尾无句读、上行非短行 → 与下行连接（中间无空格，
 * 英文句子的断行还原）。中文/英文混排场景均适用。
 */
export function sanitizeExtractedText(raw: string): string {
  if (!raw) return '';

  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  let pending = ''; // 等待合并的上行残留 / Line awaiting merge

  for (let i = 0; i < lines.length; i++) {
    const collapsed = collapseSpaces(lines[i]);
    if (!collapsed) {
      // 空行：固化 pending，保留段落结构（最多连续 1 个空行）
      if (pending) {
        kept.push(pending);
        pending = '';
      } else if (kept.length > 0 && kept[kept.length - 1] !== '') {
        kept.push('');
      }
      continue;
    }

    // 丢弃疑似页码/装饰行
    if (JUNK_LINE_RE.test(collapsed)) continue;

    // 无句读短行：仅当独立成段（后随空行或文件结尾）才判定为页眉页脚丢弃；
    // 后随非空行 → 是断行句子片段，参与合并（PDF 断行第一行常短于阈值）
    const isShort = collapsed.length <= SHORT_LINE_MAX && !SENTENCE_END_RE.test(collapsed);
    const looksLikeHeading = /^第[\s\S]{0,8}[章节部分]/.test(collapsed) || /^\d+\.\s*\S/.test(collapsed);
    if (isShort && !looksLikeHeading) {
      const next = lines[i + 1];
      const nextIsBlankOrEnd = next === undefined || collapseSpaces(next) === '';
      if (nextIsBlankOrEnd) continue;
    }

    // 上行末尾无句读 → 与当前行合并（断行还原）
    if (pending && !SENTENCE_END_RE.test(pending)) {
      pending = `${pending}${collapsed}`;
      continue;
    }

    if (pending) {
      kept.push(pending);
    }
    pending = collapsed;
  }

  if (pending) kept.push(pending);

  // 重组：压缩连续空行为单个、整体 trim
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
