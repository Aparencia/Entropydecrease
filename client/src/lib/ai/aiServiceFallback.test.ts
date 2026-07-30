/**
 * AI Service Fallback Cache Unit Tests
 * Tests for setAICache(), getAICache(), hasAICache(), clearAICache(), getCacheTTL()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setAICache,
  getAICache,
  hasAICache,
  clearAICache,
  getCacheTTL,
  CACHE_TTL_5MIN,
  CACHE_TTL_10MIN,
  CACHE_TTL_30MIN,
} from './aiServiceFallback';

describe('AI Cache', () => {
  beforeEach(() => {
    clearAICache();
  });

  describe('setAICache / getAICache', () => {
    it('should store and retrieve data', () => {
      // Arrange & Act
      setAICache('key1', { result: 'hello' });

      // Assert
      const result = getAICache<{ result: string }>('key1');
      expect(result).toEqual({ result: 'hello' });
    });

    it('should return undefined for non-existent key', () => {
      // Act
      const result = getAICache('nonexistent');

      // Assert
      expect(result).toBeUndefined();
    });

    it('should overwrite existing key', () => {
      // Arrange
      setAICache('key1', 'first');
      setAICache('key1', 'second');

      // Act
      const result = getAICache('key1');

      // Assert
      expect(result).toBe('second');
    });

    it('should handle various data types', () => {
      // Arrange
      setAICache('string', 'hello');
      setAICache('number', 42);
      setAICache('array', [1, 2, 3]);
      setAICache('null', null);

      // Assert
      expect(getAICache('string')).toBe('hello');
      expect(getAICache('number')).toBe(42);
      expect(getAICache('array')).toEqual([1, 2, 3]);
      expect(getAICache('null')).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('should return undefined for expired entries', () => {
      // Arrange
      vi.useFakeTimers();
      setAICache('key1', 'data', 1000); // 1 second TTL

      // Act - advance past TTL
      vi.advanceTimersByTime(1500);
      const result = getAICache('key1');

      // Assert
      expect(result).toBeUndefined();

      vi.useRealTimers();
    });

    it('should return data before TTL expires', () => {
      // Arrange
      vi.useFakeTimers();
      setAICache('key1', 'data', 5000);

      // Act - advance within TTL
      vi.advanceTimersByTime(3000);
      const result = getAICache('key1');

      // Assert
      expect(result).toBe('data');

      vi.useRealTimers();
    });
  });

  describe('hasAICache', () => {
    it('should return true for existing valid entry', () => {
      // Arrange
      setAICache('key1', 'data');

      // Act
      const result = hasAICache('key1');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-existent key', () => {
      // Act
      const result = hasAICache('missing');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for expired entry', () => {
      // Arrange
      vi.useFakeTimers();
      setAICache('key1', 'data', 100);
      vi.advanceTimersByTime(200);

      // Act
      const result = hasAICache('key1');

      // Assert
      expect(result).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('clearAICache', () => {
    it('should remove all entries', () => {
      // Arrange
      setAICache('key1', 'data1');
      setAICache('key2', 'data2');

      // Act
      clearAICache();

      // Assert
      expect(getAICache('key1')).toBeUndefined();
      expect(getAICache('key2')).toBeUndefined();
    });
  });

  describe('getCacheTTL', () => {
    it('should return -1 for non-existent key', () => {
      // Act
      const result = getCacheTTL('missing');

      // Assert
      expect(result).toBe(-1);
    });

    it('should return remaining TTL', () => {
      // Arrange
      vi.useFakeTimers();
      setAICache('key1', 'data', 5000);
      vi.advanceTimersByTime(2000);

      // Act
      const result = getCacheTTL('key1');

      // Assert - should be approximately 3000ms remaining
      expect(result).toBeGreaterThan(2500);
      expect(result).toBeLessThanOrEqual(3000);

      vi.useRealTimers();
    });

    it('should return 0 for expired entry', () => {
      // Arrange
      vi.useFakeTimers();
      setAICache('key1', 'data', 100);
      vi.advanceTimersByTime(200);

      // Act
      const result = getCacheTTL('key1');

      // Assert
      expect(result).toBe(0);

      vi.useRealTimers();
    });
  });

  describe('LRU behavior', () => {
    it('should evict oldest entry when cache is full', () => {
      // Arrange - fill cache beyond 50 entries
      for (let i = 0; i < 55; i++) {
        setAICache(`key${i}`, `data${i}`);
      }

      // Act - first entries should be evicted
      const firstResult = getAICache('key0');
      const lastResult = getAICache('key54');

      // Assert
      expect(firstResult).toBeUndefined();
      expect(lastResult).toBe('data54');
    });
  });

  describe('exported TTL constants', () => {
    it('should have correct values', () => {
      // Assert
      expect(CACHE_TTL_5MIN).toBe(5 * 60 * 1000);
      expect(CACHE_TTL_10MIN).toBe(10 * 60 * 1000);
      expect(CACHE_TTL_30MIN).toBe(30 * 60 * 1000);
    });
  });
});
