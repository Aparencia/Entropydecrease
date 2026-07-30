/**
 * Adaptive Engine Unit Tests
 * Tests for calculateLocalRecommendation()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateLocalRecommendation } from './adaptiveEngine';
import type { DurationHistoryData } from '@/lib/ai/types';

describe('calculateLocalRecommendation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 16)); // July 16, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('no completed sessions', () => {
    it('should return default 25 minutes with low confidence', () => {
      // Arrange
      const history: DurationHistoryData = {
        sessions: [
          { duration: 30, completed: false, date: '2026-07-15' },
        ],
      };

      // Act
      const result = calculateLocalRecommendation(history);

      // Assert
      expect(result.recommendedDuration).toBe(25);
      expect(result.breakMinutes).toBe(5);
      expect(result.confidence).toBe('low');
      expect(result.isLocalFallback).toBe(true);
      expect(result.source).toBe('local_rule');
    });

    it('should return default for empty sessions array', () => {
      // Arrange
      const history: DurationHistoryData = { sessions: [] };

      // Act
      const result = calculateLocalRecommendation(history);

      // Assert
      expect(result.recommendedDuration).toBe(25);
    });
  });

  describe('with completed sessions', () => {
    it('should compute weighted average for recent sessions', () => {
      // Arrange - 7 completed sessions within 7 days
      const now = new Date(2026, 6, 16);
      const sessions = Array.from({ length: 7 }, (_, i) => ({
        duration: 30,
        completed: true,
        date: new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString(),
      }));

      const history: DurationHistoryData = { sessions };

      // Act
      const result = calculateLocalRecommendation(history);

      // Assert - all 30min → weighted avg ~30
      expect(result.recommendedDuration).toBe(30);
      expect(result.confidence).toBe('high');
    });

    it('should give higher weight to more recent sessions', () => {
      // Arrange - mix of recent (long) and old (short) sessions
      const now = new Date(2026, 6, 16);
      const sessions = [
        // Recent: 3 sessions, 40 min each (within 3 days)
        { duration: 40, completed: true, date: new Date(now.getTime() - 1 * 24 * 3600000).toISOString() },
        { duration: 40, completed: true, date: new Date(now.getTime() - 2 * 24 * 3600000).toISOString() },
        { duration: 40, completed: true, date: new Date(now.getTime() - 3 * 24 * 3600000).toISOString() },
        // Old: 3 sessions, 20 min each (5-7 days ago)
        { duration: 20, completed: true, date: new Date(now.getTime() - 5 * 24 * 3600000).toISOString() },
        { duration: 20, completed: true, date: new Date(now.getTime() - 6 * 24 * 3600000).toISOString() },
        { duration: 20, completed: true, date: new Date(now.getTime() - 7 * 24 * 3600000).toISOString() },
      ];

      const history: DurationHistoryData = { sessions };

      // Act
      const result = calculateLocalRecommendation(history);

      // Assert - should be closer to 40 (recent) than 20 (old) due to weighting
      expect(result.recommendedDuration).toBeGreaterThan(30);
    });

    it('should set confidence based on session count', () => {
      // Arrange - 3 sessions → medium
      const now = new Date(2026, 6, 16);
      const sessions3 = Array.from({ length: 3 }, (_, i) => ({
        duration: 25,
        completed: true,
        date: new Date(now.getTime() - i * 24 * 3600000).toISOString(),
      }));

      const history3: DurationHistoryData = { sessions: sessions3 };

      // Act
      const result3 = calculateLocalRecommendation(history3);

      // Assert
      expect(result3.confidence).toBe('medium');
    });

    it('should set low confidence for fewer than 3 sessions', () => {
      // Arrange
      const history: DurationHistoryData = {
        sessions: [
          { duration: 25, completed: true, date: '2026-07-15' },
          { duration: 25, completed: true, date: '2026-07-14' },
        ],
      };

      // Act
      const result = calculateLocalRecommendation(history);

      // Assert
      expect(result.confidence).toBe('low');
    });

    it('should filter out non-completed sessions', () => {
      // Arrange
      const history: DurationHistoryData = {
        sessions: [
          { duration: 50, completed: true, date: '2026-07-15' },
          { duration: 10, completed: false, date: '2026-07-14' },
        ],
      };

      // Act
      const result = calculateLocalRecommendation(history);

      // Assert - only the 50min completed session counts
      expect(result.recommendedDuration).toBe(50);
    });
  });

  describe('reasoning text', () => {
    it('should include session count in reasoning', () => {
      // Arrange
      const history: DurationHistoryData = {
        sessions: [
          { duration: 25, completed: true, date: '2026-07-15' },
        ],
      };

      // Act
      const result = calculateLocalRecommendation(history);

      // Assert
      expect(result.reasoning).toContain('1');
      expect(result.reasoning).toContain('加权平均');
    });
  });
});
