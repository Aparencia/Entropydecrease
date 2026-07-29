/**
 * 融合段落构建（纯计算）
 *
 * @ai-context: 从 CrossFusionEngine.fuseByTimeWindow 拆出的纯函数——
 * 给定窗口内的视觉/音频结果，产出 FusionSegment（文本合并→去重→公式
 * 校正→置信度平均）。重复文本时保留通道平均置信度更高的版本。
 * 无副作用，输入相同输出相同（id 由调用方传入）。
 */
import type { FusionSegment, VisionResult, AudioResult } from './fusionTypes';
import { deduplicateText, extractFormulas, crossValidateFormulas } from './fusionTextUtils';

/**
 * 由窗口内结果构建融合段落
 */
export function buildFusionSegment(
  id: string,
  visionInWindow: VisionResult[],
  audioInWindow: AudioResult[],
): FusionSegment {
  // 时间范围
  const allTimestamps = [
    ...visionInWindow.map(r => r.timestamp),
    ...audioInWindow.map(r => r.timestamp),
  ];
  const startTime = Math.min(...allTimestamps);
  const endTime = Math.max(...allTimestamps);

  // 合并视觉文本
  const visionText = visionInWindow
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(r => r.text)
    .join('\n');

  // 合并音频文本
  const audioText = audioInWindow
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(r => r.text)
    .join('\n');

  // 文本去重
  const dedup = deduplicateText(visionText, audioText);

  // 公式检测与校正
  const visionFormulas = extractFormulas(visionInWindow);
  const correctedFormulas = visionFormulas.length > 0
    ? crossValidateFormulas(visionFormulas, audioText)
    : [];

  const hasFormula = correctedFormulas.length > 0 || visionFormulas.length > 0;

  // 融合文本
  let mergedText: string;
  if (dedup.isDuplicate) {
    // 重复时保留置信度更高的版本
    const visionConfAvg = visionInWindow.length > 0
      ? visionInWindow.reduce((s, r) => s + r.confidence, 0) / visionInWindow.length
      : 0;
    const audioConfAvg = audioInWindow.length > 0
      ? audioInWindow.reduce((s, r) => s + r.confidence, 0) / audioInWindow.length
      : 0;
    mergedText = visionConfAvg >= audioConfAvg ? visionText : audioText;
  } else {
    mergedText = dedup.merged;
  }

  // 如果有校正后的公式，追加到合并文本
  if (correctedFormulas.length > 0) {
    mergedText += '\n\n公式校正结果：\n' + correctedFormulas.join('\n');
  }

  // 综合置信度
  const allConfidences = [
    ...visionInWindow.map(r => r.confidence),
    ...audioInWindow.map(r => r.confidence),
  ];
  const confidence = allConfidences.length > 0
    ? allConfidences.reduce((s, c) => s + c, 0) / allConfidences.length
    : 0;

  // 来源
  const sources: ('vision' | 'audio')[] = [];
  if (visionInWindow.length > 0) sources.push('vision');
  if (audioInWindow.length > 0) sources.push('audio');

  return {
    id,
    startTime,
    endTime,
    visionText,
    audioText,
    mergedText,
    confidence: Math.round(confidence * 1000) / 1000,
    hasFormula,
    sources,
  };
}
