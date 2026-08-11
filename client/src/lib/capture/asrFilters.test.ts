/**
 * @ai-context: asrFilters 单元测试——静音门控（RMS）、ASR 幻觉文本过滤与
 * 相邻重复压缩。幻觉用例源自内测真实故障：静音段幻觉输出"嗯嗯嗯""。""是是是"
 * 及短句脏话；重复压缩用例源自流式 ASR 静音段重复输出（"就是就是"）。
 */
import { describe, it, expect } from 'vitest';
import {
  computeRms,
  isSilentChunk,
  isLikelyHallucination,
  collapseAdjacentDuplicates,
  cleanAsrResult,
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

describe('collapseAdjacentDuplicates', () => {
  it('形态 1：整句幂等重复压缩为最短单位（"就是就是"→"就是"）', () => {
    expect(collapseAdjacentDuplicates('就是就是')).toBe('就是');
    expect(collapseAdjacentDuplicates('就是这样就是这样')).toBe('就是这样');
    expect(collapseAdjacentDuplicates('嗯嗯嗯嗯')).toBe('嗯');
  });

  it('形态 2：句中相邻重复仅保留一份（"我就是就是这样的"→"我就是这样的"）', () => {
    expect(collapseAdjacentDuplicates('我就是就是这样的')).toBe('我就是这样的');
    expect(collapseAdjacentDuplicates('这个知识点知识点很重要')).toBe('这个知识点很重要');
  });

  it('标点分隔的重复不压缩（真实语言确认语："对，对""好，好"）', () => {
    expect(collapseAdjacentDuplicates('对，对，你说得对')).toBe('对，对，你说得对');
    expect(collapseAdjacentDuplicates('好，好，我知道了')).toBe('好，好，我知道了');
    expect(collapseAdjacentDuplicates('就是，就是，那这样吧')).toBe('就是，就是，那这样吧');
  });

  it('正常文本不受影响', () => {
    expect(collapseAdjacentDuplicates('打鼾的根本原因是气道在睡眠中变窄')).toBe('打鼾的根本原因是气道在睡眠中变窄');
    expect(collapseAdjacentDuplicates('人人平等天天向上')).toBe('人人平等天天向上');
    expect(collapseAdjacentDuplicates('好好学习')).toBe('好好学习');
  });

  it('短文本（<4 字）与空串原样返回', () => {
    expect(collapseAdjacentDuplicates('就是')).toBe('就是');
    expect(collapseAdjacentDuplicates('')).toBe('');
    expect(collapseAdjacentDuplicates('   ')).toBe('');
  });

  it('非中文整句重复不压缩（避免误伤英文/数字串）', () => {
    expect(collapseAdjacentDuplicates('ABCABC')).toBe('ABCABC');
    expect(collapseAdjacentDuplicates('123123')).toBe('123123');
  });
});

describe('cleanAsrResult', () => {
  it('重复词压缩后保留（"就是就是"→"就是"，不再被幻觉规则误杀）', () => {
    expect(cleanAsrResult('就是就是')).toBe('就是');
  });

  it('纯重复灌水压缩为单字后保留（"嗯"是合理语气词，宁放过不误杀）', () => {
    expect(cleanAsrResult('嗯嗯嗯嗯嗯嗯嗯嗯')).toBe('嗯');
  });

  it('带标点的重复灌水整段丢弃（压缩不命中时由幻觉规则兜底）', () => {
    expect(cleanAsrResult('嗯嗯，嗯嗯嗯。')).toBe('');
  });

  it('空串/纯标点返回空串', () => {
    expect(cleanAsrResult('')).toBe('');
    expect(cleanAsrResult('。。，。')).toBe('');
  });

  it('正常文本原样保留', () => {
    expect(cleanAsrResult('软腭和咽部肌肉松弛导致气流受阻')).toBe('软腭和咽部肌肉松弛导致气流受阻');
  });
});
