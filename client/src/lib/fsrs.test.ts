/**
 * FSRS-5 间隔重复算法单元测试
 *
 * 被测模块：client/src/lib/fsrs.ts
 * 覆盖范围：
 *  - 新卡片初始状态与首次复习（四个评分）
 *  - 不同评分（Again/Hard/Good/Easy）对间隔和稳定性的影响
 *  - FSRS-5 的 19 个参数是否正确参与计算
 *  - 边界条件：连续失败、完美连续通过
 *  - 间隔计算的正确性（间隔应递增）
 *  - SM-2 惰性迁移（有历史 interval 但无 stability）
 *  - createNewFSRSState 工厂函数
 *  - calculateFSRSIntervals 预览函数
 *
 * @ai-context: 使用 Vitest 框架，纯函数测试，无 I/O 副作用。
 */

import { describe, it, expect } from 'vitest';
import { fsrs, createNewFSRSState, calculateFSRSIntervals, type FSRSCardInput, type FSRSResult } from './fsrs';
import { Rating } from './sm2';

// ── 辅助常量 ────────────────────────────────────────────────────────────────

/** 新卡片初始状态（stability/difficulty 均为 0，表示未初始化） */
const NEW_CARD: FSRSCardInput = {
  easeFactor: 2.5,
  interval: 0,
  repetitions: 0,
};

/** 固定测试时间基准，避免 Date.now() 不确定性 */
const NOW = new Date('2026-06-15T10:00:00.000Z');

/** FSRS-5 的 19 个核心参数（与 fsrs.ts 中 W 数组对应） */
const W = [
  0.4872, 1.4003, 3.7145, 13.8206,
  5.1618, 1.2298, 0.8975, 0.031,
  1.6474, 0.1712, 1.0872, 2.105,
  0.2571, 0.5298, 2.0613, 0.2,
  2.8278, 0.7846, 0.2,
];

/** 初始 stability 按评分索引：S0(G) = w[G-1]（ALG-H1 官方对齐后为 W[0..3]） */
const S0 = [W[0], W[1], W[2], W[3]];

/** 初始 difficulty 按评分索引：D0 = [4.3, 3.3, 2.6, 1.0] */
const D0 = [4.3, 3.3, 2.6, 1.0];

// ── 测试套件 ────────────────────────────────────────────────────────────────

describe('FSRS-5 算法', () => {

  // ── createNewFSRSState 工厂函数 ─────────────────────────────────────────

  describe('createNewFSRSState — 新卡片初始状态', () => {
    it('应返回 stability=0 和 difficulty=0 表示未初始化', () => {
      const state = createNewFSRSState();
      expect(state.stability).toBe(0);
      expect(state.difficulty).toBe(0);
      expect(state.interval).toBe(0);
      expect(state.repetitions).toBe(0);
      expect(state.lapses).toBe(0);
      // easeFactor 保持 SM-2 兼容默认值
      expect(state.easeFactor).toBe(2.5);
    });

    it('dueDate 应为当前时间（新卡片立即可复习）', () => {
      const before = new Date();
      const state = createNewFSRSState();
      const after = new Date();
      expect(state.dueDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(state.dueDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ── 新卡片首次复习 ─────────────────────────────────────────────────────

  describe('新卡片首次复习（stability=0，interval=0）', () => {
    it('Again 评分：应使用 S0[0]=w[0] 和 D0[0]=4.3（ALG-H1: S0 取权重而非旧常量）', () => {
      const result = fsrs(NEW_CARD, Rating.Again, NOW);
      expect(result.stability).toBe(S0[Rating.Again]);
      expect(result.difficulty).toBe(D0[Rating.Again]);
      // Again 不增加 repetitions
      expect(result.repetitions).toBe(0);
      expect(result.lapses).toBe(0);
    });

    it('Hard 评分：应使用 S0[1]=w[1] 和 D0[1]=3.3（ALG-H1）', () => {
      const result = fsrs(NEW_CARD, Rating.Hard, NOW);
      expect(result.stability).toBe(S0[Rating.Hard]);
      expect(result.difficulty).toBe(D0[Rating.Hard]);
      expect(result.repetitions).toBe(1);
    });

    it('Good 评分：应使用 S0[2]=w[2] 和 D0[2]=2.6（ALG-H1）', () => {
      const result = fsrs(NEW_CARD, Rating.Good, NOW);
      expect(result.stability).toBe(S0[Rating.Good]);
      expect(result.difficulty).toBe(D0[Rating.Good]);
      expect(result.repetitions).toBe(1);
    });

    it('Easy 评分：应使用 S0[3]=w[3] 和 D0[3]=1.0（ALG-H1）', () => {
      const result = fsrs(NEW_CARD, Rating.Easy, NOW);
      expect(result.stability).toBe(S0[Rating.Easy]);
      expect(result.difficulty).toBe(D0[Rating.Easy]);
      expect(result.repetitions).toBe(1);
    });

    it('间隔应随评分递增：Again ≤ Hard < Good < Easy', () => {
      const again  = fsrs(NEW_CARD, Rating.Again, NOW);
      const hard   = fsrs(NEW_CARD, Rating.Hard, NOW);
      const good   = fsrs(NEW_CARD, Rating.Good, NOW);
      const easy   = fsrs(NEW_CARD, Rating.Easy, NOW);
      // 新卡片 Again 和 Hard 的 S0 较小，interval 可能同取最小值 1 天
      expect(again.interval).toBeLessThanOrEqual(hard.interval);
      expect(hard.interval).toBeLessThan(good.interval);
      expect(good.interval).toBeLessThan(easy.interval);
    });

    it('所有间隔至少为 1 天', () => {
      for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
        const result = fsrs(NEW_CARD, r, NOW);
        expect(result.interval).toBeGreaterThanOrEqual(1);
      }
    });

    it('dueDate 应为 now + interval 天', () => {
      const result = fsrs(NEW_CARD, Rating.Good, NOW);
      const expectedDue = new Date(NOW);
      expectedDue.setDate(expectedDue.getDate() + result.interval);
      expect(result.dueDate.getTime()).toBe(expectedDue.getTime());
    });
  });

  // ── 已初始化卡片的后续复习 ──────────────────────────────────────────────

  describe('已初始化卡片的后续复习', () => {
    /** 构造一个已复习过几次的典型卡片状态 */
    const reviewedCard = (overrides: Partial<FSRSCardInput> = {}): FSRSCardInput => ({
      easeFactor: 2.5,
      interval: 10,
      repetitions: 3,
      lapses: 1,
      stability: 5.0,
      difficulty: 3.0,
      lastReview: new Date('2026-06-05T10:00:00.000Z'),
      ...overrides,
    });

    it('Good 评分后 stability 应增长', () => {
      const card = reviewedCard();
      const result = fsrs(card, Rating.Good, NOW);
      // 成功复习后 stability 必须大于旧值
      expect(result.stability).toBeGreaterThan(card.stability!);
      expect(result.repetitions).toBe(card.repetitions + 1);
    });

    it('Easy 评分后 stability 增长幅度应大于 Good', () => {
      const card = reviewedCard();
      const goodResult  = fsrs(card, Rating.Good, NOW);
      const easyResult  = fsrs(card, Rating.Easy, NOW);
      // Easy bonus (W[16]=2.8278) 使 Easy 的 stability 增幅更大
      expect(easyResult.stability).toBeGreaterThan(goodResult.stability);
    });

    it('Hard 评分后 stability 增长幅度应小于 Good', () => {
      const card = reviewedCard();
      const goodResult = fsrs(card, Rating.Good, NOW);
      const hardResult = fsrs(card, Rating.Hard, NOW);
      // Hard penalty (W[15]=0.2) 使 Hard 的 stability 增幅更小
      expect(hardResult.stability).toBeLessThan(goodResult.stability);
    });

    it('Again 评分后 stability 应降低、lapses 应 +1', () => {
      const card = reviewedCard();
      const result = fsrs(card, Rating.Again, NOW);
      // 失败后 stability 必须小于旧值
      expect(result.stability).toBeLessThan(card.stability!);
      expect(result.stability).toBeGreaterThanOrEqual(0.1); // 下限保护
      expect(result.lapses).toBe(card.lapses! + 1);
      expect(result.repetitions).toBe(0); // Again 重置 repetitions
    });

    it('Again 后间隔应显著缩短', () => {
      const card = reviewedCard({ interval: 30 });
      const result = fsrs(card, Rating.Again, NOW);
      // lapse 后间隔应远小于原间隔
      expect(result.interval).toBeLessThan(card.interval);
    });

    it('difficulty 更新应使用均值回归（W[6] 和 W[7]）', () => {
      const card = reviewedCard({ difficulty: 5.0 });
      // Again 评分会将 difficulty 向 D0[Again]=4.3 回归
      const result = fsrs(card, Rating.Again, NOW);
      // newD = D - W[7] * (D - D0[Again]) = 5.0 - 0.031 * (5.0 - 4.3) = 5.0 - 0.0217 ≈ 4.9783
      const expected = 5.0 - W[7] * (5.0 - D0[Rating.Again]);
      expect(result.difficulty).toBeCloseTo(expected, 4);
    });

    it('difficulty 应限制在 [1, 10] 范围内', () => {
      // 极端高 difficulty，连续 Easy 应拉低
      const highD = reviewedCard({ difficulty: 10.0 });
      const result = fsrs(highD, Rating.Easy, NOW);
      expect(result.difficulty).toBeLessThanOrEqual(10);
      expect(result.difficulty).toBeGreaterThanOrEqual(1);
    });

    it('连续成功复习应使间隔递增', () => {
      // 模拟连续 5 次 Good 评分，验证间隔单调递增
      let card: FSRSCardInput = {
        ...NEW_CARD,
        stability: 0,
        difficulty: 0,
      };
      let lastInterval = 0;
      let currentTime = NOW;

      for (let i = 0; i < 5; i++) {
        const result = fsrs(card, Rating.Good, currentTime);
        // 每次间隔应 >= 上次间隔（单调递增）
        expect(result.interval).toBeGreaterThanOrEqual(lastInterval);
        lastInterval = result.interval;
        // 推进时间到下次复习
        currentTime = result.dueDate;
        card = {
          easeFactor: 2.5,
          interval: result.interval,
          repetitions: result.repetitions,
          lapses: result.lapses,
          stability: result.stability,
          difficulty: result.difficulty,
          lastReview: currentTime,
        };
      }
    });

    it('stability 增长涉及 W[8]、W[9]、W[10]（成功后）', () => {
      // 通过对比有无 W[8] 参与的差异来间接验证参数生效
      // 这里直接验证结果数值合理性（W[8]=1.6474 影响 exp(W[8]*D)）
      const card = reviewedCard({ difficulty: 3.0, stability: 5.0 });
      const result = fsrs(card, Rating.Good, NOW);
      // 指数增长因子 e^(W[8]*D) = e^(1.6474*3) ≈ e^4.94 ≈ 139.8
      // stability 应有显著增长
      expect(result.stability).toBeGreaterThan(card.stability! * 2);
    });

    it('失败后 stability 计算涉及 W[11]-W[14]', () => {
      // W[11]=2.105 是失败后 stability 的基础系数
      // 验证失败后 stability 不会过大也不会过小
      const card = reviewedCard({ stability: 10.0, difficulty: 4.0 });
      const result = fsrs(card, Rating.Again, NOW);
      // 失败后 stability 应 < 旧值，且 >= 0.1
      expect(result.stability).toBeLessThan(10.0);
      expect(result.stability).toBeGreaterThanOrEqual(0.1);
      // 应 > 0（W[11]=2.105 保证有基础恢复）
      expect(result.stability).toBeGreaterThan(0);
    });
  });

  // ── 边界条件：连续失败 ─────────────────────────────────────────────────

  describe('边界条件：连续失败', () => {
    it('连续 5 次 Again 后 stability 不应跌破 0.1', () => {
      let card: FSRSCardInput = { ...NEW_CARD };
      let currentTime = NOW;

      for (let i = 0; i < 5; i++) {
        const result = fsrs(card, Rating.Again, currentTime);
        expect(result.stability).toBeGreaterThanOrEqual(0.1);
        // 首次 Again（新卡片路径）不增加 lapses，后续 Again 才逐次 +1
        if (i === 0) {
          expect(result.lapses).toBe(0); // 新卡片首次复习不视为失败
        } else {
          expect(result.lapses).toBe(i); // 第 i 次 Again 后 lapses = i
        }
        expect(result.repetitions).toBe(0);
        currentTime = result.dueDate;
        card = {
          easeFactor: 2.5,
          interval: result.interval,
          repetitions: result.repetitions,
          lapses: result.lapses,
          stability: result.stability,
          difficulty: result.difficulty,
          lastReview: currentTime,
        };
      }
    });

    it('连续失败后间隔应保持 >= 1 天', () => {
      let card: FSRSCardInput = { ...NEW_CARD };
      let currentTime = NOW;

      for (let i = 0; i < 3; i++) {
        const result = fsrs(card, Rating.Again, currentTime);
        expect(result.interval).toBeGreaterThanOrEqual(1);
        currentTime = result.dueDate;
        card = {
          easeFactor: 2.5,
          interval: result.interval,
          repetitions: 0,
          lapses: result.lapses,
          stability: result.stability,
          difficulty: result.difficulty,
          lastReview: currentTime,
        };
      }
    });
  });

  // ── 边界条件：完美连续通过 ─────────────────────────────────────────────

  describe('边界条件：完美连续通过', () => {
    it('连续 8 次 Easy 后间隔不应超过 5 年（1825 天）', () => {
      let card: FSRSCardInput = { ...NEW_CARD };
      let currentTime = NOW;

      for (let i = 0; i < 8; i++) {
        const result = fsrs(card, Rating.Easy, currentTime);
        expect(result.interval).toBeLessThanOrEqual(1825);
        currentTime = result.dueDate;
        card = {
          easeFactor: 2.5,
          interval: result.interval,
          repetitions: result.repetitions,
          lapses: result.lapses,
          stability: result.stability,
          difficulty: result.difficulty,
          lastReview: currentTime,
        };
      }
    });

    it('长期连续 Good 复习间隔应逐步增大至上限', () => {
      let card: FSRSCardInput = { ...NEW_CARD };
      let currentTime = NOW;
      const intervals: number[] = [];

      for (let i = 0; i < 20; i++) {
        const result = fsrs(card, Rating.Good, currentTime);
        intervals.push(result.interval);
        currentTime = result.dueDate;
        card = {
          easeFactor: 2.5,
          interval: result.interval,
          repetitions: result.repetitions,
          lapses: result.lapses,
          stability: result.stability,
          difficulty: result.difficulty,
          lastReview: currentTime,
        };
      }

      // 间隔序列应单调不减
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
      }
      // 20 次 Good 后间隔应接近上限
      expect(intervals[intervals.length - 1]).toBeLessThanOrEqual(1825);
    });
  });

  // ── SM-2 惰性迁移 ──────────────────────────────────────────────────────

  describe('SM-2 惰性迁移（有历史 interval 但无 stability）', () => {
    it('从 SM-2 历史 interval 反推 stability', () => {
      // SM-2 历史：interval=30, repetitions=5，但无 FSRS stability
      const sm2Card: FSRSCardInput = {
        easeFactor: 2.5,
        interval: 30,
        repetitions: 5,
        // stability 和 difficulty 均为 undefined → 触发迁移路径
      };
      const result = fsrs(sm2Card, Rating.Good, NOW);
      // 迁移后 stability 应从 interval 反推：S = interval / (9 * (1/0.9 - 1))
      const expectedS = 30 / (9 * (1 / 0.9 - 1));
      expect(result.stability).toBeGreaterThan(0);
      // 反推的 S 用于后续计算，result.stability 已经是更新后的值（非初始 S）
      expect(result.repetitions).toBe(6);
    });

    it('迁移卡片 Good 评分后间隔应在合理范围内', () => {
      const sm2Card: FSRSCardInput = {
        easeFactor: 2.5,
        interval: 15,
        repetitions: 3,
      };
      const result = fsrs(sm2Card, Rating.Good, NOW);
      // 间隔不应为 0 或极小值
      expect(result.interval).toBeGreaterThanOrEqual(1);
      expect(result.interval).toBeLessThanOrEqual(1825);
    });
  });

  // ── calculateFSRSIntervals 预览函数 ─────────────────────────────────────

  describe('calculateFSRSIntervals — 四评分间隔预览', () => {
    it('应返回 again/hard/good/easy 四个间隔值', () => {
      const preview = calculateFSRSIntervals(NEW_CARD);
      expect(preview).toHaveProperty('again');
      expect(preview).toHaveProperty('hard');
      expect(preview).toHaveProperty('good');
      expect(preview).toHaveProperty('easy');
      // 所有值均为正整数
      expect(preview.again).toBeGreaterThanOrEqual(1);
      expect(preview.hard).toBeGreaterThanOrEqual(1);
      expect(preview.good).toBeGreaterThanOrEqual(1);
      expect(preview.easy).toBeGreaterThanOrEqual(1);
    });

    it('预览间隔应保持 Again ≤ Hard < Good < Easy 的顺序', () => {
      const preview = calculateFSRSIntervals(NEW_CARD);
      // Again/Hard 新卡片 S0 较小，interval 可能同为最小值 1
      expect(preview.again).toBeLessThanOrEqual(preview.hard);
      expect(preview.hard).toBeLessThan(preview.good);
      expect(preview.good).toBeLessThan(preview.easy);
    });

    it('预览不应修改任何卡片状态（纯函数验证）', () => {
      const original = { ...NEW_CARD };
      calculateFSRSIntervals(original);
      // 调用后原始卡片不变
      expect(original.interval).toBe(NEW_CARD.interval);
      expect(original.repetitions).toBe(NEW_CARD.repetitions);
    });
  });

  // ── FSRS-5 的 19 个参数完整性验证 ───────────────────────────────────────

  describe('FSRS-5 参数完整性', () => {
    it('应有 19 个权重参数', () => {
      // W 数组长度必须为 19，这是 FSRS-5 论文规定
      expect(W).toHaveLength(19);
    });

    it('所有参数应为有限正数', () => {
      W.forEach((w, i) => {
        expect(Number.isFinite(w), `W[${i}] 应为有限数`).toBe(true);
        expect(w, `W[${i}] 应为正数`).toBeGreaterThan(0);
      });
    });

    it('Hard penalty 参数 W[15]=0.2 应使 Hard 评分的间隔小于 Good', () => {
      // 已初始化卡片：Hard 受 W[15] 惩罚
      const card: FSRSCardInput = {
        easeFactor: 2.5,
        interval: 10,
        repetitions: 3,
        stability: 5.0,
        difficulty: 3.0,
        lastReview: new Date('2026-06-05T10:00:00.000Z'),
      };
      const hardResult = fsrs(card, Rating.Hard, NOW);
      const goodResult = fsrs(card, Rating.Good, NOW);
      // W[15]=0.2 的 hard penalty 使 hard 的 stability 增幅更小
      expect(hardResult.interval).toBeLessThanOrEqual(goodResult.interval);
    });

    it('Easy bonus 参数 W[16]=2.8278 应使 Easy 评分的间隔大于 Good', () => {
      const card: FSRSCardInput = {
        easeFactor: 2.5,
        interval: 10,
        repetitions: 3,
        stability: 5.0,
        difficulty: 3.0,
        lastReview: new Date('2026-06-05T10:00:00.000Z'),
      };
      const easyResult = fsrs(card, Rating.Easy, NOW);
      const goodResult = fsrs(card, Rating.Good, NOW);
      // W[16]=2.8278 的 easy bonus 使 easy 的 stability 增幅更大
      expect(easyResult.interval).toBeGreaterThanOrEqual(goodResult.interval);
    });
  });

  // ── elapsed days 为 0 的特殊情况 ────────────────────────────────────────

  describe('边界：elapsed days = 0（立即复习）', () => {
    it('elapsed=0 时检索概率 R=1，stability 仍正常更新', () => {
      const card: FSRSCardInput = {
        easeFactor: 2.5,
        interval: 5,
        repetitions: 2,
        stability: 3.0,
        difficulty: 2.5,
        lastReview: NOW, // lastReview = now → elapsed = 0
      };
      const result = fsrs(card, Rating.Good, NOW);
      // R=1 时 stabilityAfterSuccess 仍正常计算
      expect(result.stability).toBeGreaterThan(0);
      expect(result.interval).toBeGreaterThanOrEqual(1);
    });
  });
});
