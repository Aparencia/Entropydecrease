/**
 * 呼吸寄语语料与选取 / Breathing whisper corpus & picker
 *
 * @ai-context: RIT-20 呼气寄语——纯本地语料，仅在呼气相位淡入，与首页
 * atmosphereQuote 体系同调（零压力、纯意境）。纯函数，无副作用。
 * @ai-context: RIT-20 exhale whispers: local corpus, shown only on the
 * exhale phase, tonally aligned with the home atmosphere quotes.
 */

/** 呼气寄语池（短句，≤14 字，收敛、放松取向） */
export const BREATH_WHISPERS: string[] = [
  '把杂念随这口气呼出去',
  '此刻，只需要专注当下',
  '慢下来，你已经在路上',
  '让呼吸带走紧绷',
  '一次一件事，就好',
  '你不需要一次做完所有',
  '安静下来，答案会浮现',
  '给自己一点耐心',
];

/**
 * 按索引取一条寄语（循环取用，调用方用递增计数保证不重复）。
 * @param seed 递增序号
 */
export function pickWhisper(seed: number): string {
  return BREATH_WHISPERS[Math.abs(seed) % BREATH_WHISPERS.length];
}
