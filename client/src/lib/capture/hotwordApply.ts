/**
 * 热词/替换词转写后处理（纯函数）
 * Hotword replacement post-processing for ASR transcripts (pure functions).
 *
 * @ai-context: 讯飞式「替换词后处理」本地纠正，作用于 final 转写文本。
 * 防误伤策略：①词条按 term 长度降序应用——长词（"机器学习"）命中后其原文
 * 被替换出字符串，嵌套的短词（"机器"）自然不再命中，等效"已替换区间跳过"；
 * ②英文词边界保护——term 首/尾字符为英文字母时，若匹配位置紧邻英文字母，
 * 视为英文单词内部子串（如 "education" 中的 "cat"）跳过；中文 term 与相邻
 * 英文字母属正常中英混合（"machine学习"），不跳过。
 * @ai-context: EN: longer terms apply first so nested shorter terms cannot
 * misfire; matches embedded inside English words are skipped; empty rule
 * list or empty text returns input unchanged. Never mutates inputs.
 */

/** 单条替换规则（对应 hotwordStore 中 kind='replace' 的启用词条） */
export interface ReplaceRule {
  /** 待匹配的源词（错误转写形态） */
  term: string;
  /** 替换目标（空字符串 = 直接删除误词） */
  target: string;
}

/** 英文字母判定（charCode 范围，避免逐字符正则开销） */
function isAsciiLetter(ch: string | undefined): boolean {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/**
 * 匹配位置是否嵌在英文单词内部。
 * 仅当 term 自身首/尾是英文字母时才检查同侧相邻字符——
 * 中文 term 紧邻英文字母属合法中英混合，不应跳过。
 */
function embeddedInWord(text: string, start: number, end: number, term: string): boolean {
  if (isAsciiLetter(term[0]) && isAsciiLetter(text[start - 1])) return true;
  if (isAsciiLetter(term[term.length - 1]) && isAsciiLetter(text[end])) return true;
  return false;
}

/**
 * 对转写文本应用替换词条（不修改入参，返回新文本）
 *
 * @param text  原始 final 转写（存储层保真的那份文本）
 * @param rules 启用的替换规则（空表直接原样返回）
 */
export function applyReplaceTerms(text: string, rules: ReplaceRule[]): string {
  if (!text || rules.length === 0) return text;

  // 按 term 长度降序：长词先生效，其原文被物理移除后，
  // 嵌套短词（"机器" ⊂ "机器学习"）与跨边界重叠自然失配
  const sorted = rules.filter((r) => r.term).sort((a, b) => b.term.length - a.term.length);

  let current = text;
  for (const { term, target } of sorted) {
    if (!current.includes(term)) continue;
    let result = '';
    let cursor = 0;
    let idx = current.indexOf(term);
    while (idx !== -1) {
      const end = idx + term.length;
      if (embeddedInWord(current, idx, end, term)) {
        idx = current.indexOf(term, idx + 1); // 英文词内部子串：跳过不替换
        continue;
      }
      result += current.slice(cursor, idx) + target;
      cursor = end;
      idx = current.indexOf(term, end);
    }
    result += current.slice(cursor);
    current = result;
  }
  return current;
}
