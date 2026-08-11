/**
 * MODULE_POSITIONS 布局测试 — BDD 风格、AAA 模式
 *
 * 心智地图护栏：3D 模块空间布局按「语义分组 + 内外环」设计（行动组右/产出组左/扩展组上下），
 * 位置可预测性直接决定空间认知效果，本测试防止未来误改破坏分组结构。
 *
 * @ai-context: 覆盖 3D 模块坐标的唯一性、z 范围约束、语义分组对称性与快照保护。
 */
import { describe, it, expect } from 'vitest';
import { MODULE_POSITIONS, type ModuleId } from './OrbitalStore';

/** 语义分组断言：行动组（右侧核心动作）/ 产出组（左侧知识沉淀）/ 扩展组（上下氛围工具） */
const ACTION_GROUP: ModuleId[] = ['pomodoro', 'flashcards', 'feynman'];
const OUTPUT_GROUP: ModuleId[] = ['notes', 'sop', 'constellation'];
const EXTEND_GROUP: ModuleId[] = ['inspiration', 'classroom'];

function positionOf(id: ModuleId): [number, number, number] {
  const m = MODULE_POSITIONS.find((x) => x.id === id);
  if (!m) throw new Error(`module not found: ${id}`);
  return m.position;
}

describe('MODULE_POSITIONS（3D 模块空间布局）', () => {
  describe('唯一性', () => {
    it('每个模块 id 唯一', () => {
      const ids = MODULE_POSITIONS.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('每个模块 route 唯一', () => {
      const routes = MODULE_POSITIONS.map((m) => m.route);
      expect(new Set(routes).size).toBe(routes.length);
    });

    it('没有两个模块共用同一坐标', () => {
      const positions = MODULE_POSITIONS.map((m) => m.position.join(','));
      expect(new Set(positions).size).toBe(positions.length);
    });
  });

  describe('z 范围约束（相机 [0,0,10] 前向视野内）', () => {
    it('dashboard 固定于中心原点', () => {
      expect(positionOf('dashboard')).toEqual([0, 0, 0]);
    });

    it('外围模块 z 落在 [-3.0, -1.8] 区间', () => {
      for (const m of MODULE_POSITIONS) {
        if (m.id === 'dashboard') continue;
        const z = m.position[2];
        expect(z, `${m.id} z=${z}`).toBeGreaterThanOrEqual(-3.0);
        expect(z, `${m.id} z=${z}`).toBeLessThanOrEqual(-1.8);
      }
    });
  });

  describe('语义分组（格式塔对称 + 邻近）', () => {
    it('行动组位于右侧（x > 0）', () => {
      for (const id of ACTION_GROUP) {
        expect(positionOf(id)[0], id).toBeGreaterThan(0);
      }
    });

    it('产出组位于左侧（x < 0）', () => {
      for (const id of OUTPUT_GROUP) {
        expect(positionOf(id)[0], id).toBeLessThan(0);
      }
    });

    it('扩展组位于中轴上下（x 接近 0）', () => {
      for (const id of EXTEND_GROUP) {
        expect(Math.abs(positionOf(id)[0]), id).toBeLessThan(0.1);
      }
      // 上下分布：灵感在上（y>0）、课堂在下（y<0）
      expect(positionOf('inspiration')[1]).toBeGreaterThan(0);
      expect(positionOf('classroom')[1]).toBeLessThan(0);
    });

    it('行动组与产出组左右对称（y 与 z 镜像一致）', () => {
      const pairs: Array<[ModuleId, ModuleId]> = [
        ['pomodoro', 'notes'],
        ['flashcards', 'sop'],
        ['feynman', 'constellation'],
      ];
      for (const [right, left] of pairs) {
        const r = positionOf(right);
        const l = positionOf(left);
        expect(l[0], `${right}/${left} x`).toBeCloseTo(-r[0], 5);
        expect(l[1], `${right}/${left} y`).toBeCloseTo(r[1], 5);
        expect(l[2], `${right}/${left} z`).toBeCloseTo(r[2], 5);
      }
    });
  });

  describe('快照保护（防止无意改动破坏心智地图）', () => {
    it('全部模块坐标与当前批准布局一致', () => {
      expect(MODULE_POSITIONS.map((m) => `${m.id}:${m.position.join(',')}`)).toEqual([
        'dashboard:0,0,0',
        'pomodoro:3.4,1.3,-1.8',
        'flashcards:3.4,-1.3,-1.8',
        'feynman:4.4,0,-3',
        'notes:-3.4,1.3,-1.8',
        'sop:-3.4,-1.3,-1.8',
        'constellation:-4.4,0,-3',
        'inspiration:0,2.7,-2.6',
        'classroom:0,-2.7,-2.6',
      ]);
    });
  });
});
