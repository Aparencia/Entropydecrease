/**
 * ASR 前置静音门控与幻觉过滤
 *
 * @ai-context: Path A（精细采集）音频链无 VAD，固定切片直送 ASR 会让
 * 静音/背景噪声段触发 ASR 幻觉（重复语气词"嗯嗯嗯"、纯标点、短句脏话）。
 * 本模块提供两道防线：送 ASR 前的 RMS 静音门控 + ASR 返回后的幻觉文本过滤。
 * RMS 阈值与 vadMarker 的 loopback 预设阈值保持一致（0.008），修改需同步。
 */

/** RMS 静音阈值（Float32 PCM，与 vadMarker loopback 预设一致） */
export const SILENCE_RMS_THRESHOLD = 0.008;

/** 计算 Float32 PCM 块的 RMS 能量 */
export function computeRms(buffer: ArrayBuffer): number {
  const samples = new Float32Array(buffer);
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/** 判断音频块是否为静音（低于阈值不值得送 ASR，直接跳过） */
export function isSilentChunk(
  buffer: ArrayBuffer,
  threshold: number = SILENCE_RMS_THRESHOLD,
): boolean {
  return computeRms(buffer) < threshold;
}

/** 纯标点/空白检测 */
const PUNCT_ONLY_RE = /^[\s。，、．.,!？?！…~～·\-—]*$/;

/** 短句脏话模式：静音/噪声段 ASR 幻觉的高频形态，正常教学语音几乎不会独立出现 */
const PROFANITY_RE = /操你|草泥马|傻逼|妈的|畜生/;

/**
 * 判断 ASR 输出是否为幻觉文本（保守规则，宁放过不误杀）：
 * 1. 纯标点/空白（如"。"）
 * 2. 重复字符灌水：去标点后 unique 字符 ≤ 2 且长度 ≥ 4（"嗯嗯嗯嗯""是是是是"）
 * 3. 短句脏话（≤ 20 字符且命中模式）
 */
export function isLikelyHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (PUNCT_ONLY_RE.test(trimmed)) return true;

  const compact = trimmed.replace(/[\s。，、．.,!？?！…~～]/g, '');
  if (compact.length >= 4 && new Set(compact).size <= 2) return true;

  if (trimmed.length <= 20 && PROFANITY_RE.test(trimmed)) return true;

  return false;
}
