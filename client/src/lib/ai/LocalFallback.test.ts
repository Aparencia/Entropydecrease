/**
 * Local Fallback Unit Tests
 * Tests for getLocalFallbackMessage() and LocalDurationRecommender.recommend()
 */

import { describe, it, expect } from 'vitest';
import { getLocalFallbackMessage, LocalDurationRecommender } from './LocalFallback';
import type { DurationHistoryData } from './types';

describe('getLocalFallbackMessage', () => {
  it('should return unavailable message for "summarize" feature', () => {
    // Act
    const result = getLocalFallbackMessage('summarize');

    // Assert
    expect(result.available).toBe(false);
    expect(result.message).toContain('摘要');
    expect(result.suggestion).toBeTruthy();
  });

  it('should return unavailable message for "flashcard" feature', () => {
    // Act
    const result = getLocalFallbackMessage('flashcard');

    // Assert
    expect(result.available).toBe(false);
    expect(result.message).toContain('闪卡');
    expect(result.suggestion).toContain('手动');
  });

  it('should return unavailable message for "evaluate" feature', () => {
    // Act
    const result = getLocalFallbackMessage('evaluate');

    // Assert
    expect(result.available).toBe(false);
    expect(result.message).toContain('费曼');
  });

  it('should return unavailable message for "optimize_card" feature', () => {
    // Act
    const result = getLocalFallbackMessage('optimize_card');

    // Assert
    expect(result.available).toBe(false);
    expect(result.message).toContain('优化');
  });

  it('should always return available=false', () => {
    // Arrange
    const features = ['summarize', 'flashcard', 'evaluate', 'optimize_card'] as const;

    // Act & Assert
    for (const feature of features) {
      const result = getLocalFallbackMessage(feature);
      expect(result.available).toBe(false);
    }
  });
});

describe('LocalDurationRecommender', () => {
  const recommender = new LocalDurationRecommender();

  describe('recommend with no history', () => {
    it('should return default 25 minutes with low confidence', () => {
      // Arrange
      const history: DurationHistoryData = { sessions: [] };

      // Act
      const result = recommender.recommend(history);

      // Assert
      expect(result.recommendedDuration).toBe(25);
      expect(result.confidence).toBe('low');
      expect(result.isLocalFallback).toBe(true);
    });
  });

  describe('recommend with no completed sessions', () => {
    it('should return short duration when all sessions are incomplete', () => {
      // Arrange
      const history: DurationHistoryData = {
        sessions: [
          { duration: 30, completed: false, date: '2026-07-15' },
          { duration: 45, completed: false, date: '2026-07-14' },
        ],
      };

      // Act
      const result = recommender.recommend(history);

      // Assert
      expect(result.recommendedDuration).toBeLessThanOrEqual(20);
      expect(result.confidence).toBe('low');
    });

    it('should respect maxDuration option', () => {
      // Arrange
      const history: DurationHistoryData = {
        sessions: [
          { duration: 30, completed: false, date: '2026-07-15' },
        ],
      };

      // Act
      const result = recommender.recommend(history, { maxDuration: 15 });

      // Assert
      expect(result.recommendedDuration).toBeLessThanOrEqual(15);
    });
  });

  describe('recommend with high completion rate (>=80%)', () => {
    it('should recommend slightly increased duration', () => {
      // Arrange
      const history: DurationHistoryData = {
        sessions: [
          { duration: 25, completed: true, date: '2026-07-15' },
          { duration: 25, completed: true, date: '2026-07-14' },
          { duration: 25, completed: true, date: '2026-07-13' },
          { duration: 25, completed: true, date: '2026-07-12' },
          { duration: 25, completed: true, date: '2026-07-11' },
        ],
      };

      // Act
      const result = recommender.recommend(history);

      // Assert - avg=25, recommended = round(25 * 1.1) = 28
      expect(result.recommendedDuration).toBe(28);
      expect(result.confidence).toBe('medium');
      expect(result.reasoning).toContain('完成率');
    });
  });

  describe('recommend with medium completion rate (50-80%)', () => {
    it('should recommend average duration', () => {
      // Arrange - 3/5 = 60% completion
      const history: DurationHistoryData = {
        sessions: [
          { duration: 30, completed: true, date: '2026-07-15' },
          { duration: 30, completed: true, date: '2026-07-14' },
          { duration: 30, completed: true, date: '2026-07-13' },
          { duration: 30, completed: false, date: '2026-07-12' },
          { duration: 30, completed: false, date: '2026-07-11' },
        ],
      };

      // Act
      const result = recommender.recommend(history);

      // Assert - avg=30, recommended = round(30) = 30
      expect(result.recommendedDuration).toBe(30);
    });
  });

  describe('recommend with low completion rate (<50%)', () => {
    it('should recommend shorter duration', () => {
      // Arrange - 1/5 = 20% completion
      const history: DurationHistoryData = {
        sessions: [
          { duration: 40, completed: true, date: '2026-07-15' },
          { duration: 40, completed: false, date: '2026-07-14' },
          { duration: 40, completed: false, date: '2026-07-13' },
          { duration: 40, completed: false, date: '2026-07-12' },
          { duration: 40, completed: false, date: '2026-07-11' },
        ],
      };

      // Act
      const result = recommender.recommend(history);

      // Assert - avg=40, recommended = round(40 * 0.8) = 32
      expect(result.recommendedDuration).toBe(32);
    });

    it('should respect minDuration option', () => {
      // Arrange - very short avg, low completion
      const history: DurationHistoryData = {
        sessions: [
          { duration: 10, completed: true, date: '2026-07-15' },
          { duration: 10, completed: false, date: '2026-07-14' },
          { duration: 10, completed: false, date: '2026-07-13' },
        ],
      };

      // Act
      const result = recommender.recommend(history, { minDuration: 15 });

      // Assert
      expect(result.recommendedDuration).toBeGreaterThanOrEqual(15);
    });
  });

  describe('clamping', () => {
    it('should clamp result between minDuration and maxDuration', () => {
      // Arrange
      const history: DurationHistoryData = {
        sessions: [
          { duration: 120, completed: true, date: '2026-07-15' },
          { duration: 120, completed: true, date: '2026-07-14' },
        ],
      };

      // Act
      const result = recommender.recommend(history, { minDuration: 20, maxDuration: 60 });

      // Assert
      expect(result.recommendedDuration).toBeGreaterThanOrEqual(20);
      expect(result.recommendedDuration).toBeLessThanOrEqual(60);
    });
  });
});
