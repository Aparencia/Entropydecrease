/**
 * ASR 前置静音门控、幻觉过滤与重复抑制
 *
 * @ai-context: Path A（精细采集）音频链无 VAD，固定切片直送 ASR 会让
 * 静音/背景噪声段触发 ASR 幻觉（重复语气词"嗯嗯嗯"、纯标点、短句脏话）。
 * 本模块提供防线：送 ASR 前的 RMS 静音门控 + ASR 返回后的幻觉文本过滤。
 * RMS 阈值与 vadMarker 的 loopback 预设阈值保持一致（0.008），修改需同步。
 * @ai-context: 2026-08 扩展——新增相邻重复压缩（collapseAdjacentDuplicates）与
 * 统一输出清洗（cleanAsrResult）：流式 ASR（Paraformer）在静音段存在重复输出
 * 最后词/短句的已知行为（"就是就是"），课堂 smart 流式 final/partial 与
 * 按段转写输出均须经 cleanAsrResult 后再上屏（见 streamingAsr.ts /
 * useClassroomEvents.ts）。
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

/** 纯中文连续字符（重复单元必须是纯词——"对，对"这类"词+标点"单元是真实语言确认语，不压缩） */
const PURE_CJK_RE = /^[\u4e00-\u9fff]+$/;

/**
 * 压缩相邻重复片段——流式 ASR 静音段重复输出的高频形态
 *
 * 形态 1（整句幂等重复）："就是就是" → "就是"，"就是这样就是这样" → "就是这样"
 * 形态 2（句中相邻重复）："我就是就是这样的" → "我就是这样的"
 *
 * 保守策略：仅压缩完全相邻、无标点分隔的重复（"对，对"这类标点分隔的
 * 真实语言重叠不压缩）；句中单字重复不压缩（"人人""天天"是真实语言）。
 * 优先压缩最长重复片段，再迭代处理嵌套，避免漏压长重复。
 */
export function collapseAdjacentDuplicates(text: string): string {
  const t = text.trim();
  if (t.length < 4) return t;

  // 形态 1：整句幂等重复——单位长从 1 递增，命中即返回最短重复单位
  for (let unitLen = 1; unitLen <= t.length / 2; unitLen++) {
    if (t.length % unitLen !== 0) continue;
    const unit = t.slice(0, unitLen);
    if (!PURE_CJK_RE.test(unit)) continue;
    if (unit.repeat(t.length / unitLen) === t) {
      return unit;
    }
  }

  // 形态 2：句中相邻重复——最长窗口优先，命中后压缩并重启扫描
  let result = t;
  let changed = true;
  while (changed) {
    changed = false;
    for (let half = Math.floor(result.length / 2); half >= 2; half--) {
      for (let i = 0; i + half * 2 <= result.length; i++) {
        const a = result.slice(i, i + half);
        if (!PURE_CJK_RE.test(a)) continue;
        if (a === result.slice(i + half, i + half * 2)) {
          result = result.slice(0, i + half) + result.slice(i + half * 2);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return result;
}

/**
 * ASR 输出统一清洗：trim → 相邻重复压缩 → 幻觉过滤。
 *
 * 流式 final/partial、按段转写结果上屏前均须经过本函数；
 * 返回空串表示该段被判为幻觉/重复灌水，调用方应丢弃不上屏。
 */
export function cleanAsrResult(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const deduped = collapseAdjacentDuplicates(trimmed);
  return isLikelyHallucination(deduped) ? '' : deduped;
}
