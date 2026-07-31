/**
 * @ai-context: asrFilters 单元测试——静音门控（RMS）与 ASR 幻觉文本过滤。
 * 用例源自内测真实故障：静音段幻觉输出"嗯嗯嗯""。""是是是"及短句脏话。
 */
import { describe, it, expect } from 'vitest';
import {
  computeRms,
  isSilentChunk,
  isLikelyHallucination,
  SILENCE_RMS_THRESHOLD,
} from './asrFilters';

/** 构造固定幅值的 Float32 PCM 块 */
function pcm(amplitude: number, length = 4800): ArrayBuffer {
  return new Float32Array(length).fill(amplitude).buffer;
}

describe('computeRms / isSilentChunk', () => {
  it('全零样本 RMS 为 0，判定为静音', () => {
    expect(computeRms(pcm(0))).toBe(0);
    expect(isSilentChunk(pcm(0))).toBe(true);
  });

  it('低于阈值的底噪判定为静音', () => {
    expect(isSilentChunk(pcm(SILENCE_RMS_THRESHOLD / 2))).toBe(true);
  });

  it('正常语音能量不判定为静音', () => {
    expect(isSilentChunk(pcm(0.1))).toBe(false);
  });

  it('空 buffer 判定为静音', () => {
    expect(isSilentChunk(new ArrayBuffer(0))).toBe(true);
  });
});

describe('isLikelyHallucination', () => {
  it('过滤纯标点与空白（内测症状："。"）', () => {
    expect(isLikelyHallucination('。')).toBe(true);
    expect(isLikelyHallucination('   ')).toBe(true);
    expect(isLikelyHallucination('，。，。')).toBe(true);
  });

  it('过滤重复字符灌水（内测症状："嗯嗯嗯…""是是是…"）', () => {
    expect(isLikelyHallucination('嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯嗯')).toBe(true);
    expect(isLikelyHallucination('是是是是是是是是是是')).toBe(true);
    expect(isLikelyHallucination('嗯嗯，嗯嗯嗯。')).toBe(true);
  });

  it('过滤静音段短句脏话幻觉', () => {
    expect(isLikelyHallucination('我操你妈的。')).toBe(true);
  });

  it('保留正常教学语音转写', () => {
    expect(isLikelyHallucination('打鼾的根本原因是气道在睡眠中变窄')).toBe(false);
    expect(isLikelyHallucination('软腭和咽部肌肉松弛导致气流受阻')).toBe(false);
    expect(isLikelyHallucination('嗯，这个知识点我们再讲一遍')).toBe(false);
  });

  it('长句即使包含敏感词也不误杀（可能是课程内容引述）', () => {
    expect(
      isLikelyHallucination('有些人骂人时会说畜生，这在语言学上属于詈语范畴，本节课我们分析其构词'),
    ).toBe(false);
  });
});
