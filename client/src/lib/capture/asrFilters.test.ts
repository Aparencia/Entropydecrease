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
  dedupeAcrossFinals,
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

  it('标点分隔的单字确认语不压缩（真实语言："对，对""好，好"）', () => {
    expect(collapseAdjacentDuplicates('对，对，你说得对')).toBe('对，对，你说得对');
    expect(collapseAdjacentDuplicates('好，好，我知道了')).toBe('好，好，我知道了');
  });

  it('形态 3（P0-4）：跨单个标点的两字词重复压缩（"就是，就是"→"就是"）', () => {
    expect(collapseAdjacentDuplicates('就是，就是')).toBe('就是');
    expect(collapseAdjacentDuplicates('就是，就是，那这样吧')).toBe('就是，那这样吧');
    expect(collapseAdjacentDuplicates('矩阵，矩阵的特征值')).toBe('矩阵的特征值');
  });

  it('形态 3 白名单：两字确认语不压缩（"是的，是的"是真实确认强调）', () => {
    expect(collapseAdjacentDuplicates('是的，是的')).toBe('是的，是的');
    expect(collapseAdjacentDuplicates('好的，好的')).toBe('好的，好的');
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

describe('dedupeAcrossFinals（P0-4 跨 final 重叠去重）', () => {
  it('完全一致的重复推送丢弃', () => {
    expect(dedupeAcrossFinals('今天讲矩阵', '今天讲矩阵')).toBe('');
  });

  it('后缀-前缀重叠截断（端点误断句："…矩阵"+"矩阵的特征值…"）', () => {
    expect(dedupeAcrossFinals('今天讲矩阵', '矩阵的特征值很重要')).toBe('的特征值很重要');
    expect(dedupeAcrossFinals('特征值', '特征值和特征向量')).toBe('和特征向量');
  });

  it('单字重叠（长度 1）不截断——避免误伤正常连接', () => {
    expect(dedupeAcrossFinals('我们开始', '始解这个问题')).toBe('始解这个问题');
  });

  it('截断后与前句高度相似视为整体重复丢弃', () => {
    expect(dedupeAcrossFinals('矩阵的特征值', '矩阵的特征值矩阵的特征值')).toBe('');
    expect(dedupeAcrossFinals('线性代数很重要', '线性代数很重要线性代数很重要')).toBe('');
  });

  it('无重叠时原样返回', () => {
    expect(dedupeAcrossFinals('今天讲矩阵', '接下来看特征值')).toBe('接下来看特征值');
    expect(dedupeAcrossFinals('', '新句子')).toBe('新句子');
    expect(dedupeAcrossFinals('前句', '')).toBe('');
  });
});
