/**
 * inkGeometry 单测：墨迹几何纯函数
 * Unit tests for ink geometry utilities
 */
import { describe, it, expect } from 'vitest';
import { pointsToSvgPath, distanceToStroke, strokesInRegion } from './inkGeometry';
import type { InkStroke } from '@/types/models';

function stroke(id: string, points: Array<[number, number]>): InkStroke {
  return { id, tool: 'pen', color: '#000', width: 2, points: points.map(([x, y]) => ({ x, y })) };
}

describe('pointsToSvgPath', () => {
  it('空点返回空字符串', () => {
    expect(pointsToSvgPath([])).toBe('');
  });

  it('单点返回极短线段', () => {
    const d = pointsToSvgPath([{ x: 5, y: 5 }]);
    expect(d).toContain('M 5 5');
    expect(d).toContain('L');
  });

  it('多点生成 M/Q/L 平滑路径', () => {
    const d = pointsToSvgPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('Q');
    expect(d).toContain('L 20 0');
  });
});

describe('distanceToStroke', () => {
  it('空笔画返回 Infinity', () => {
    expect(distanceToStroke({ x: 0, y: 0 }, stroke('s', []))).toBe(Infinity);
  });

  it('点到水平线段距离', () => {
    const s = stroke('s', [[0, 0], [10, 0]]);
    expect(distanceToStroke({ x: 5, y: 3 }, s)).toBeCloseTo(3);
  });

  it('点在线段上距离为 0', () => {
    const s = stroke('s', [[0, 0], [10, 0]]);
    expect(distanceToStroke({ x: 5, y: 0 }, s)).toBeCloseTo(0);
  });

  it('取各线段最小距离', () => {
    const s = stroke('s', [[0, 0], [10, 0], [10, 10]]);
    expect(distanceToStroke({ x: 10, y: 5 }, s)).toBeCloseTo(0);
  });
});

describe('strokesInRegion', () => {
  it('选中点在区域内的笔画', () => {
    const strokes = [stroke('in', [[5, 5]]), stroke('out', [[50, 50]])];
    const ids = strokesInRegion(strokes, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(ids).toEqual(['in']);
  });

  it('笔画任意点在区域内即选中', () => {
    const strokes = [stroke('cross', [[-5, 5], [5, 5]])];
    const ids = strokesInRegion(strokes, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(ids).toEqual(['cross']);
  });

  it('无命中返回空', () => {
    const strokes = [stroke('out', [[50, 50]])];
    expect(strokesInRegion(strokes, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toEqual([]);
  });
});
