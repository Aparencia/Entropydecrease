/**
 * ocrPipeline 纯函数单测（P2-1，PP-OCRv5 后处理层）
 *
 * @ai-context: 锁定 det/rec 后处理契约：缩放/归一化/膨胀/连通域/框检测
 * （阈值与 score 过滤）/CTC 解码（去重去 blank）。联调基准：
 * 「熵减学习助手」「本地OCR测试2026」识别置信度 >0.99。
 */
import { describe, it, expect } from 'vitest';
import {
  resizeRgb,
  normalizeChw,
  dilate2x2,
  connectedComponents,
  detectBoxes,
  ctcDecode,
  DET_THRESH,
  DET_BOX_THRESH,
  DET_LIMIT_SIDE,
  REC_IMG_HEIGHT,
} from '../../../electron/ai/local-ocr/ocrPipeline';

describe('resizeRgb / normalizeChw', () => {
  it('最近邻缩放保持尺寸与采样值', () => {
    const src = new Float32Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]); // 2x2
    const out = resizeRgb(src, 2, 2, 4, 4);
    expect(out.length).toBe(4 * 4 * 3);
    expect(out[0]).toBe(255); // 左上角 R
    expect(out[out.length - 1]).toBe(255); // 右下角 B（白色 255,255,255）
  });

  it('CHW 归一化 (x/255-0.5)/0.5', () => {
    const rgb = new Float32Array([255, 0, 128]);
    const out = normalizeChw(rgb, 1, 1);
    expect(out[0]).toBeCloseTo((1 - 0.5) / 0.5, 5); // R
    expect(out[1]).toBeCloseTo((0 - 0.5) / 0.5, 5); // G
    expect(out[2]).toBeCloseTo((128 / 255 - 0.5) / 0.5, 5); // B
  });
});

describe('dilate2x2 / connectedComponents', () => {
  it('2×2 膨胀把相邻点连成块', () => {
    const mask = new Uint8Array(4 * 4);
    mask[0] = 1;
    const out = dilate2x2(mask, 4, 4);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(1);
    expect(out[4]).toBe(1);
    expect(out[5]).toBe(1);
    expect(out[10]).toBe(0);
  });

  it('分离块各自成组件，8 邻域斜对角连通', () => {
    const mask = new Uint8Array(5 * 5);
    mask[0] = 1;        // 块 A：左上角 2×2（4 点）
    mask[1] = 1;
    mask[5] = 1;
    mask[6] = 1;
    mask[19] = 1;       // 块 B：(3,4)
    mask[23] = 1;       //     (4,3) 与 (3,4) 8 邻对角连通
    mask[24] = 1;       //     (4,4) 与 (4,3) 4 邻连通 → 3 点成组件
    const comps = connectedComponents(mask, 5, 5);
    expect(comps).toHaveLength(2);
    expect(comps[0]).toMatchObject({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(comps[1]).toMatchObject({ minX: 3, minY: 3, maxX: 4, maxY: 4 });
  });

  it('过小组件（count<3）被过滤', () => {
    const mask = new Uint8Array(3 * 3);
    mask[0] = 1;
    mask[1] = 1;
    expect(connectedComponents(mask, 3, 3)).toHaveLength(0);
  });
});

describe('detectBoxes（DB 后处理）', () => {
  /** 合成概率图：两条水平文本带（概率 0.9），背景 0.1 */
  function twoLineProb(w: number, h: number): Float32Array {
    const pred = new Float32Array(w * h).fill(0.1);
    for (let y = 10; y < 20; y++) {
      for (let x = 5; x < 60; x++) pred[y * w + x] = 0.9;
    }
    for (let y = 40; y < 50; y++) {
      for (let x = 5; x < 60; x++) pred[y * w + x] = 0.9;
    }
    return pred;
  }

  it('检测两条文本带并按自上而下排序', () => {
    const w = 80;
    const h = 64;
    const boxes = detectBoxes(twoLineProb(w, h), w, h, 800, 640);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    // 第一条在上方
    expect(boxes[0].y0).toBeLessThan(boxes[1].y0);
    // 坐标缩放到原图（×10）
    expect(boxes[0].x1).toBeGreaterThan(boxes[0].x0);
  });

  it('低概率区域不产框（score < box_thresh 过滤）', () => {
    const w = 32;
    const h = 32;
    const pred = new Float32Array(w * h).fill(0.05); // 全低概率
    const boxes = detectBoxes(pred, w, h, 320, 320);
    expect(boxes).toHaveLength(0);
  });

  it('阈值常量与联调口径一致（0.3 / 0.5 / 736 / 48）', () => {
    expect(DET_THRESH).toBe(0.3);
    expect(DET_BOX_THRESH).toBe(0.5);
    expect(DET_LIMIT_SIDE).toBe(736);
    expect(REC_IMG_HEIGHT).toBe(48);
  });
});

describe('ctcDecode（CTC greedy 解码）', () => {
  const character = ['blank', '熵', '减', '学', '习', ' '];

  /** 构造概率二维数组：仅给定 token 概率 1.0 */
  function probsOf(tokens: number[]): Float32Array[] {
    return tokens.map((t) => {
      const row = new Float32Array(character.length);
      row[t] = 1.0;
      return row;
    });
  }

  it('标准序列：去连续重复 + 去 blank', () => {
    // blank, 熵, 熵, blank, 减 → "熵减"
    const { text, confidence } = ctcDecode(probsOf([0, 1, 1, 0, 2]), character);
    expect(text).toBe('熵减');
    expect(confidence).toBe(1);
  });

  it('全 blank → 空文本', () => {
    const { text } = ctcDecode(probsOf([0, 0, 0]), character);
    expect(text).toBe('');
  });

  it('置信度为选中位概率均值', () => {
    const rows = probsOf([1, 0, 2]);
    rows[1][1] = 0.5; // 干扰：blank 位也有 0.5 概率（仍低于 1.0 的 token）
    rows[1][2] = 0.5;
    const { text, confidence } = ctcDecode(rows, character);
    expect(text).toBe('熵减');
    expect(confidence).toBe(1);
  });

  it('空输入返回空', () => {
    const { text, confidence } = ctcDecode([], character);
    expect(text).toBe('');
    expect(confidence).toBe(0);
  });
});
