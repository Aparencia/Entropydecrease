/**
 * TTS 朗读文本规范化管道（Text Normalization）
 *
 * @ai-context: 将 AI 回复的 Markdown/富文本转换为"可朗读的干净文本"。
 * 这是生产级 TTS 系统（Azure/Google/Alexa）的标准前置阶段——
 * node-edge-tts 内部会 escapeXml 转义文本，无法注入 SSML 标签，
 * 因此用规则管道清洗内容、用中文标点控制停顿（神经语音在 ，。；： 处自然停顿）。
 *
 * 设计目标（用户诉求）：
 * 1. 回答与朗读尽量一致——保留全部正文 prose，只剥离不可读的装饰。
 * 2. 非必要内容不朗读——代码块、URL、emoji、表格线、Markdown 标记一律剔除。
 *
 * 纯函数、无副作用，可安全单测与并发复用。
 */

// ── 各阶段清洗规则（顺序敏感，勿随意调换） ──────────────────────

/** 围栏代码块 ```...``` / ~~~...~~~ —— 整块剔除（朗读代码体验极差） */
const RE_CODE_BLOCK = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

/** 图片 ![alt](url) —— 剔除（保留 alt 意义不大，直接去掉） */
const RE_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;

/** 链接 [text](url) —— 保留链接文字，丢弃 URL */
const RE_LINK = /\[([^\]]*)\]\([^)]*\)/g;

/** 标题标记 # / ## / ### ... */
const RE_HEADING = /^#{1,6}\s+/gm;

/** 粗体/斜体/删除线标记 ** __ * _ ~~ */
const RE_EMPHASIS = /(\*\*|__|\*|_|~~)/g;

/** 行内代码反引号 `code` —— 保留内容（通常是简短术语） */
const RE_INLINE_CODE = /`([^`]*)`/g;

/** 引用标记 > */
const RE_BLOCKQUOTE = /^\s{0,3}>\s?/gm;

/** 无序列表标记 - / * / + （行首） */
const RE_UL_ITEM = /^\s*[-*+]\s+/gm;

/** 有序列表标记 1. / 1) （行首） */
const RE_OL_ITEM = /^\s*\d+[.)]\s+/gm;

/** 水平分割线 --- / *** / ___ */
const RE_HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm;

/** 表格竖线 | —— 剔除（保留单元格文字） */
const RE_TABLE_PIPE = /\|/g;

/** 表格分隔行 |---|---|（整行剔除） */
const RE_TABLE_SEP = /^\s*\|?[\s:|-]+\|?\s*$/gm;

/**
 * emoji 与装饰符号（✅❌⚠️🧠🎧→ 等）。
 * 覆盖：杂项符号/表情/交通/补充符号/箭头/变体选择符/零宽连接符。
 */
// emoji 主区（单码点，不含变体选择符——组合序列用下方替代符单独剥离）
const RE_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

/** emoji 修饰符（变体选择符/零宽连接符/键帽组合符）。
 *  oxlint no-misleading-character-class 对组合字符入字符类误报（此处就是刻意
 *  要剥离这些组合字符本身，非匹配用户可见文本），抑制。 */
// oxlint-disable-next-line no-misleading-character-class
const RE_EMOJI_MODIFIERS = /[\u{FE0F}\u{200D}\u{20E3}]/gu;

/** 区域指示符（国旗等双码序列，U+1F1E6-U+1F1FF 区间） */
const RE_EMOJI_TAGS = /[\u{E0020}-\u{E007F}]/gu;

/** 常见 HTML 实体解码 */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
};
const RE_HTML_ENTITY = /&(amp|lt|gt|quot|apos|nbsp);/g;

// ── 主入口 ────────────────────────────────────────────────────

/**
 * 将富文本/Markdown 规范化为可朗读的纯文本。
 *
 * @param text - AI 回复原文（可含 Markdown、emoji、代码块等）
 * @returns 清洗后的朗读文本；若清洗后为空则返回空字符串
 */
export function normalizeForSpeech(text: string): string {
  if (!text) return '';

  let out = text;

  // 1. 结构性剔除（先于行内处理，避免误伤代码内容）
  out = out.replace(RE_CODE_BLOCK, ' ');
  out = out.replace(RE_IMAGE, ' ');
  out = out.replace(RE_LINK, '$1');

  // 2. 行级标记
  out = out.replace(RE_TABLE_SEP, ' ');
  out = out.replace(RE_HEADING, '');
  out = out.replace(RE_BLOCKQUOTE, '');
  out = out.replace(RE_UL_ITEM, '');
  out = out.replace(RE_OL_ITEM, '');
  out = out.replace(RE_HR, ' ');

  // 3. 行内标记
  out = out.replace(RE_EMPHASIS, '');
  out = out.replace(RE_INLINE_CODE, '$1');
  out = out.replace(RE_TABLE_PIPE, '，');

  // 4. emoji 与装饰符号（主区 + 修饰符 + 区域指示符组合序列）
  out = out
    .replace(RE_EMOJI, '')
    .replace(RE_EMOJI_MODIFIERS, '')
    .replace(RE_EMOJI_TAGS, '');

  // 5. HTML 实体解码
  out = out.replace(RE_HTML_ENTITY, (m) => HTML_ENTITIES[m] ?? m);

  // 6. 空白与标点归一（用中文标点制造自然停顿）
  out = out
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '。')   // 段落分隔 → 句号
    .replace(/\n/g, '，')        // 行内换行（列表项等）→ 逗号
    .replace(/[ \t]{2,}/g, ' ')  // 折叠连续空格
    .replace(/\s+([，。！？；：])/g, '$1') // 去掉标点前多余空格
    .replace(/，{2,}/g, '，')
    .replace(/。{2,}/g, '。')
    .replace(/([。！？；：])[，。]+/g, '$1') // "。，" → "。"
    .replace(/^[，。！？；：\s]+/, '')       // 去掉开头孤立标点
    .replace(/[，、\s]+$/, '')               // 去掉结尾悬挂逗号/顿号
    .trim();

  return out;
}
