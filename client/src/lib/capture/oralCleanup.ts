/**
 * 口语书面化工具 — 去除课堂笔记中的语气词/废话/口语句式
 * Oral-to-written cleanup for classroom notes.
 *
 * @ai-context: P1-4 口语书面化——在笔记生成链路的最后一步对 Markdown 笔记
 * 做后处理：去除语气词、过滤口头禅、简化冗余句式。不修改原始转写，
 * 仅在笔记展示与持久化层生效。离线可用（纯规则，无 AI 依赖）。
 * @ai-context: EN: Rule-based oral cleanup for Chinese classroom notes.
 * Removes filler words, disfluencies, and redundant patterns. Pure function,
 * no AI dependency, works offline. Original transcript is never modified.
 */

// ================================================================
// 语气词/口头禅模式（匹配中文口语常见废话）
// ================================================================

/** 句首废话：老师/学生开头常带的语气词和口头禅 */
const LEADING_FILLER_RE = /^(嗯|啊|呃|哦|哎|唉|嘛|呗|啦|哦对|哦好|好的|好吧|好了|那么|然后|所以说|也就是说|就是说|也就是说呢|所以说呢|然后呢|那么呢|这个这个|那个那个)\s*[，,、]?\s*/g;

/** 句中/句尾的语气词尾巴 */
const TRAILING_FILLER_RE = /\s*[，,]\s*(嗯|啊|呃|哦|哎|嘛|呗|对吧|是吧|是不是|对不对|好不好|行不行|可以吗|知道吗|明白吗|懂了吗|懂不懂|understand|ok|OK)\s*[？?。.!！]?\s*$/g;

/** 纯废话段落：整段都是无信息量的内容 */
const FILLER_ONLY_RE = /^[\s嗯啊呃哦哎嘛呗啦哦好好吧好的]*(这个|那个|就是|然后|所以说|也就是说|反正|其实|基本上|说白了|说白了就是|简单来说|总的来说|总而言之|换句话说|也就是说)[\s嗯啊呃哦哎嘛呗啦哦好好吧好的]*$/;

/** 独立成段的废话短句 */
const FILLER_SENTENCE_RE = /^[\s]*[嗯啊呃哦哎嘛呗啦](好的|好吧|行吧|可以|对|是的|没错|明白|懂了|知道)[\s\S。！]*$/;

/** 冗余重复句式：口语句式的典型特征 */
const WORDY_PATTERNS: [RegExp, string][] = [
  // "我们来看到这个" → "这个"
  [/(我们)?来(看到|看一下|看看|看|讲一下|讲|说|说一下|讨论一下|分析一下|思考一下|想想|想一下)/g, ''],
  // "我可以告诉大家" → ""
  [/我(可以|想)?(告诉|跟大家说|给大家介绍|给大家分享|给大家讲解|给大家展示)/g, ''],
  // "这个地方" → "这里"（但保留"这个"）
  [/这个地方/g, '这里'],
  // "就是说" → 删除（保留"即"）
  [/也就是说/g, '即'],
  // "比如说" → "例如"
  [/比如说/g, '例如'],
  // "那么" 在句首 → 删除（句中保留）
  [/(^|[\n。！？])那么([，,])/g, '$1'],
  // "然后" 在句首 → 删除（句中保留）
  [/(^|[\n。！？])然后([，,])/g, '$1'],
  // "所以说" → 删除
  [/所以说/g, ''],
  // "反正" → 删除
  [/反正/g, ''],
  // "其实" → 删除
  [/其实/g, ''],
  // "基本上" → 删除
  [/基本上/g, ''],
  // "说白了" → 删除
  [/说白了/g, ''],
  // "就是" 在句首 → 删除（句中保留判断义）
  [/(^|[\n。！？])就是([，,])/g, '$1'],
  // "对不对" → 删除
  [/对不对/g, ''],
  // "是不是" → 删除（句中判断义保留）
  [/(^|[\n。！？])是不是([，,])/g, '$1'],
  // "意味着" → "意味"
  [/意味着/g, '意味'],
  // "叫做" → "称"
  [/叫做/g, '称'],
  // "一个" 冗余 → "一个"（保留数量义，压缩量词冗余）
  [/(\d+)\s*个\s*/g, '$1个'],
];

// ================================================================
// 公共 API
// ================================================================

/**
 * 口语书面化主函数：对 Markdown 笔记文本做后处理。
 *
 * 策略：
 * 1. 按行分割（保留 Markdown 结构）
 * 2. 每行去除句首/句中/句尾的语气词
 * 3. 过滤纯废话段落
 * 4. 应用冗余句式替换
 * 5. 合并多余空行
 *
 * @param text - 原始 Markdown 笔记文本
 * @returns 书面化后的文本
 */
export function oralCleanup(text: string): string {
  if (!text) return text;

  const lines = text.split('\n');
  const cleanedLines = lines.map((line) => {
    const trimmed = line.trim();
    // 跳过 Markdown 标题、列表、代码块等结构语法
    if (/^#{1,6}\s|^[-*+]\s|^>\s|^```|^\d+[.、]\s/.test(trimmed)) return line;

    let cleaned = trimmed;

    // 1. 去除句尾语气词（"...，对吧？" → "..."）
    cleaned = cleaned.replace(TRAILING_FILLER_RE, '');

    // 2. 去除句首语气词和口头禅
    cleaned = cleaned.replace(LEADING_FILLER_RE, '');

    // 3. 应用冗余句式替换
    for (const [pattern, replacement] of WORDY_PATTERNS) {
      cleaned = cleaned.replace(pattern, replacement);
    }

    // 4. 纯废话段落 → 空行
    if (FILLER_ONLY_RE.test(cleaned) || FILLER_SENTENCE_RE.test(cleaned)) {
      return '';
    }

    // 5. 清理多余空格和标点
    cleaned = cleaned
      .replace(/\s{2,}/g, ' ')           // 多空格→单空格
      .replace(/[，,]{2,}/g, '，')        // 多逗号→单逗号
      .replace(/^[，,、。.！!？?]+/, '')  // 行首标点→删除
      .replace(/[，,、。.！!？?]{2,}$/, '。')  // 行尾多标点→句号
      .trim();

    return cleaned;
  });

  // 过滤空行（连续空行保留最多一个）
  let result = cleanedLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * 轻量版：仅去除语气词，不做句式改写（适合实时场景）
 */
export function lightOralCleanup(text: string): string {
  if (!text) return text;
  return text
    .replace(LEADING_FILLER_RE, '')
    .replace(TRAILING_FILLER_RE, '')
    .trim();
}