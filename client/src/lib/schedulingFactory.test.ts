/**
 * 调度策略工厂单元测试
 * Unit tests for the scheduling strategy factory
 *
 * @ai-context: 覆盖算法选择（默认 FSRS、切换 SM-2、实例缓存）、每日新卡/
 * 复习/会话上限的默认值与非法输入防御、读写 round-trip。副作用仅限
 * localStorage（jsdom），测试间清理。
 * @ai-context: Covers algorithm selection (FSRS default, SM-2 switch,
 * instance caching) and the new-card/review/session caps with invalid
 * input guards and round-trips. Side effects limited to localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getScheduler,
  setSchedulerAlgorithm,
  getCurrentAlgorithm,
  getMaxNewCardsPerDay,
  setMaxNewCardsPerDay,
  getMaxReviewsPerDay,
  setMaxReviewsPerDay,
  getMaxSessionCards,
  setMaxSessionCards,
  DEFAULT_MAX_NEW_CARDS,
  DEFAULT_MAX_REVIEWS,
  DEFAULT_MAX_SESSION_CARDS,
} from './schedulingFactory';

describe('scheduler algorithm selection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should default to FSRS', () => {
    expect(getScheduler().name).toBe('fsrs');
    expect(getCurrentAlgorithm()).toBe('fsrs');
  });

  it('should switch to SM-2 on demand', () => {
    // Act
    setSchedulerAlgorithm('sm2');
    // Assert
    expect(getCurrentAlgorithm()).toBe('sm2');
    expect(getScheduler().name).toBe('sm2');
  });

  it('should cache the strategy instance per algorithm', () => {
    // Act
    const first = getScheduler();
    const second = getScheduler();
    // Assert：同算法缓存命中返回同一实例
    expect(first).toBe(second);
  });

  it('should rebuild the instance after an algorithm change', () => {
    // Arrange
    const fsrsInstance = getScheduler();
    // Act
    setSchedulerAlgorithm('sm2');
    // Assert
    expect(getScheduler()).not.toBe(fsrsInstance);
    expect(getScheduler().name).toBe('sm2');
  });

  it('should read a manually stored algorithm from localStorage', () => {
    localStorage.setItem('kb-scheduler-algorithm', 'sm2');
    expect(getCurrentAlgorithm()).toBe('sm2');
    expect(getScheduler().name).toBe('sm2');
  });
});

describe('per-day card caps', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return defaults when unset', () => {
    expect(getMaxNewCardsPerDay()).toBe(DEFAULT_MAX_NEW_CARDS);
    expect(getMaxReviewsPerDay()).toBe(DEFAULT_MAX_REVIEWS);
    expect(getMaxSessionCards()).toBe(DEFAULT_MAX_SESSION_CARDS);
  });

  it('should round-trip configured values', () => {
    // Act
    setMaxNewCardsPerDay(30);
    setMaxReviewsPerDay(150);
    setMaxSessionCards(25);
    // Assert
    expect(getMaxNewCardsPerDay()).toBe(30);
    expect(getMaxReviewsPerDay()).toBe(150);
    expect(getMaxSessionCards()).toBe(25);
  });

  it('should reject non-positive and non-numeric stored values', () => {
    // Arrange：非法存量数据
    localStorage.setItem('kb-max-new-cards-per-day', '0');
    localStorage.setItem('kb-max-reviews-per-day', '-5');
    localStorage.setItem('kb-max-session-cards', 'abc');
    // Act/Assert：全部回退默认
    expect(getMaxNewCardsPerDay()).toBe(DEFAULT_MAX_NEW_CARDS);
    expect(getMaxReviewsPerDay()).toBe(DEFAULT_MAX_REVIEWS);
    expect(getMaxSessionCards()).toBe(DEFAULT_MAX_SESSION_CARDS);
  });

  it('should clamp setter input to at least 1', () => {
    // Act
    setMaxNewCardsPerDay(0);
    setMaxReviewsPerDay(-10);
    setMaxSessionCards(-3);
    // Assert
    expect(getMaxNewCardsPerDay()).toBe(1);
    expect(getMaxReviewsPerDay()).toBe(1);
    expect(getMaxSessionCards()).toBe(1);
  });
});
