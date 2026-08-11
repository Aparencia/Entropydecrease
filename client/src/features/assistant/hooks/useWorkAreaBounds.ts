/**
 * 工作区边界检测 Hook
 *
 * @ai-context: 查询 DOM 中带 data-work-area 属性的元素作为"工作区"，
 * 提供判断点是否在工作区内以及在工作区外随机选取目标点的能力。
 * 使用 ResizeObserver 监听工作区元素尺寸变化，每次查询时实时计算。
 * 水母避让策略：将视口划分为四个安全区（左、右、上、下），
 * 避开工作区矩形后随机选取目标点。
 */
import { useMemo } from 'react';

/** 工作区元素选择器 */
const WORK_AREA_SELECTOR = '[data-work-area]';

/** 水母与工作区边缘的最小间距（px） */
const MIN_MARGIN = 16;

/**
 * 获取当前所有工作区元素的边界矩形
 */
function getWorkAreaRects(): DOMRect[] {
  const elements = document.querySelectorAll(WORK_AREA_SELECTOR);
  const rects: DOMRect[] = [];
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      rects.push(rect);
    }
  }
  return rects;
}

/**
 * 判断一个矩形是否与任一工作区矩形重叠（含 margin 缓冲）
 */
function rectOverlapsWorkArea(
  left: number, top: number, right: number, bottom: number,
  workRects: DOMRect[],
): boolean {
  for (const wr of workRects) {
    const wrLeft = wr.left - MIN_MARGIN;
    const wrTop = wr.top - MIN_MARGIN;
    const wrRight = wr.right + MIN_MARGIN;
    const wrBottom = wr.bottom + MIN_MARGIN;
    // 标准矩形重叠检测（分离轴定理的否定形式）
    if (left < wrRight && right > wrLeft && top < wrBottom && bottom > wrTop) {
      return true;
    }
  }
  return false;
}

/**
 * 在工作区外随机选取一个目标点
 *
 * 策略：将视口划分为四个安全区（左、右、上、下），
 * 过滤掉与工作区重叠的区域后，随机选取一个安全区内的点。
 */
function getRandomTargetOutside(
  viewportW: number,
  viewportH: number,
  creatureSize: number,
  workRects: DOMRect[],
  margin: number = MIN_MARGIN,
): { x: number; y: number } {
  // 如果没有工作区，使用全屏范围
  if (workRects.length === 0) {
    return {
      x: margin + Math.random() * (viewportW - creatureSize - margin * 2),
      y: 60 + Math.random() * (viewportH - creatureSize - 60 - margin),
    };
  }

  // 收集所有工作区矩形的边界信息
  let minWorkLeft = viewportW;
  let maxWorkRight = 0;
  let minWorkTop = viewportH;
  let maxWorkBottom = 0;
  for (const wr of workRects) {
    minWorkLeft = Math.min(minWorkLeft, wr.left);
    maxWorkRight = Math.max(maxWorkRight, wr.right);
    minWorkTop = Math.min(minWorkTop, wr.top);
    maxWorkBottom = Math.max(maxWorkBottom, wr.bottom);
  }

  const topMargin = 60; // 避开标题栏区域
  const maxX = viewportW - creatureSize - margin;
  const maxY = viewportH - creatureSize - margin;

  /** 安全添加候选区域：左/右/上/下边界各自 clamp 后校验有效性 */
  function tryAddCandidate(l: number, t: number, r: number, b: number): void {
    const clampedL = Math.max(margin, l);
    const clampedR = Math.min(maxX, r);
    const clampedT = Math.max(topMargin, t);
    const clampedB = Math.min(maxY, b);
    if (clampedR > clampedL && clampedB > clampedT) {
      candidates.push([clampedL, clampedT, clampedR, clampedB]);
    }
  }

  // 定义候选安全区域：每个区域是 [left, top, right, bottom] 矩形
  const candidates: Array<[number, number, number, number]> = [];

  // 安全区 1: 左侧（工作区左侧到左边缘）
  if (minWorkLeft - margin > margin) {
    tryAddCandidate(margin, topMargin, minWorkLeft - margin, maxY);
  }

  // 安全区 2: 右侧（工作区右侧到右边缘）
  if (maxWorkRight + margin < maxX) {
    tryAddCandidate(maxWorkRight + margin, topMargin, maxX, maxY);
  }

  // 安全区 3: 上方（工作区上方到顶部）
  if (minWorkTop - margin > topMargin) {
    tryAddCandidate(margin, topMargin, maxX, minWorkTop - margin);
  }

  // 安全区 4: 下方（工作区下方到底部）
  if (maxWorkBottom + margin < maxY) {
    tryAddCandidate(margin, maxWorkBottom + margin, maxX, maxY);
  }

  // 如果没有候选区域（工作区几乎占满全屏），退回全屏随机位置
  if (candidates.length === 0) {
    return {
      x: margin + Math.random() * (maxX - margin),
      y: topMargin + Math.random() * (maxY - topMargin),
    };
  }

  // 随机选取一个候选区域，再在区域内随机取点
  const region = candidates[Math.floor(Math.random() * candidates.length)];
  const [l, t, r, b] = region;
  return {
    x: l + Math.random() * (r - l),
    y: t + Math.random() * (b - t),
  };
}

export function useWorkAreaBounds() {
  return useMemo(() => ({
    /**
     * 判断水母当前位置是否与工作区重叠
     * @param x 水母左上角 x
     * @param y 水母左上角 y
     * @param size 水母尺寸
     */
    isInWorkArea(x: number, y: number, size: number): boolean {
      const rects = getWorkAreaRects();
      if (rects.length === 0) return false;
      return rectOverlapsWorkArea(x, y, x + size, y + size, rects);
    },

    /**
     * 在工作区外随机选取目标点
     */
    getRandomTargetOutside(
      viewportW: number,
      viewportH: number,
      creatureSize: number,
    ): { x: number; y: number } {
      const rects = getWorkAreaRects();
      return getRandomTargetOutside(viewportW, viewportH, creatureSize, rects);
    },
  }), []);
}