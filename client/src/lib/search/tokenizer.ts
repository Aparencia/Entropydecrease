/**
 * 中文分词与停用词过滤纯函数模块
 * v0.9.0: 全文搜索引擎基础分词工具
 *
 * 纯函数设计，无副作用，便于单元测试
 *
 * @ai-context: 中文保留完整连续串并追加 bigram 拆分提高召回、英文/数字按正则提词（无第三方分词库依赖）。
 * 修改分词策略必须同步重建搜索索引（dexieSearchIndexer.rebuildIndex），
 * 否则新查询 token 与旧索引 token 不匹配导致搜索失效。
 */

/**
 * 内置中文停用词表
 * 涵盖高频虚词、代词、助词、连词等
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  // 中文停用词
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她',
  '它', '们', '那', '些', '什么', '怎么', '为什么', '哪', '谁',
  '吗', '呢', '吧', '啊', '呀', '哦', '嗯', '哈', '喔', '嘿',
  '但', '而', '或', '如果', '因为', '所以', '虽然', '然而', '不过',
  '而且', '并且', '或者', '因此', '于是', '可以', '可能', '应该',
  '已经', '还', '又', '再', '才', '只', '非常', '比较', '更',
  '最', '这个', '那个', '这些', '那些', '这里', '那里', '哪里',
  '从', '向', '对', '于', '以', '把', '被', '给', '让', '用',
  '能', '与', '及', '等', '之', '将', '已', '其', '则', '如',
  // 英文停用词
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can',
  'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between',
  'under', 'again', 'further', 'then', 'once', 'and', 'but',
  'or', 'nor', 'not', 'so', 'if', 'than', 'too', 'very',
  'just', 'about', 'up', 'out', 'no', 'only', 'own', 'same',
  'also', 'that', 'this', 'these', 'those', 'it', 'its',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
  'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which',
  'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
]);

/**
 * 将文本拆分为 token 列表
 *
 * 策略（不依赖第三方库）：
 * 1. 将文本统一转小写
 * 2. 用正则将中文、英文单词、数字序列分别提取为 token
 * 3. 过滤空 token 和单字符英文/数字（保留单字符中文）
 *
 * @param text 输入文本
 * @returns token 数组（已去重，未过滤停用词）
 */
export function tokenize(text: string): string[] {
  if (!text || !text.trim()) return [];

  const lower = text.toLowerCase();

  // 匹配：连续中文字符（2字及以上）、连续英文单词、连续数字
  // 单个中文字符也保留（因中文里单字可能是有意义的词）
  const pattern = /[\u4e00-\u9fff]+|[a-z]+|[0-9]+/g;
  const rawTokens: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(lower)) !== null) {
    const token = match[0];
    // 对中文 token 做 bigram 拆分（连续两字词）
    if (/^[\u4e00-\u9fff]+$/.test(token)) {
      if (token.length <= 2) {
        rawTokens.push(token);
      } else {
        // 先保留完整 token，再拆 bigram 提高召回率
        rawTokens.push(token);
        for (let i = 0; i < token.length - 1; i++) {
          rawTokens.push(token.slice(i, i + 2));
        }
      }
    } else {
      rawTokens.push(token);
    }
  }

  // 去重
  return [...new Set(rawTokens)];
}

/**
 * 从 token 列表中移除停用词
 *
 * @param tokens 原始 token 数组
 * @returns 过滤后的 token 数组
 */
export function removeStopWords(tokens: string[]): string[] {
  return tokens.filter((t) => !STOP_WORDS.has(t));
}

/**
 * 一站式分词：tokenize + removeStopWords
 *
 * @param text 输入文本
 * @returns 过滤停用词后的 token 数组
 */
export function analyze(text: string): string[] {
  return removeStopWords(tokenize(text));
}
