/**
 * OfflineQueue Unit Tests
 * Tests for calculateBackoff()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateBackoff } from './OfflineQueue';

// Mock the database and dependencies to avoid import errors
vi.mock('@/lib/storage/database', () => ({
  db: { offlineQueue: { orderBy: vi.fn(), count: vi.fn(), add: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn(), bulkDelete: vi.fn(), clear: vi.fn(), toArray: vi.fn() } },
}));
vi.mock('@/lib/utils/uuid', () => ({ generateId: () => 'mock-id' }));
vi.mock('@/lib/storage/operationLog', () => ({ getDeviceId: () => 'mock-device' }));

describe('calculateBackoff', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return ~1000ms for first retry (retryCount=0)', () => {
    // Arrange: 1000 * 2^0 = 1000, jitter = 0
    // Act
    const result = calculateBackoff(0);

    // Assert
    expect(result).toBe(1000);
  });

  it('should return ~2000ms for second retry (retryCount=1)', () => {
    // Arrange: 1000 * 2^1 = 2000, jitter = 0
    // Act
    const result = calculateBackoff(1);

    // Assert
    expect(result).toBe(2000);
  });

  it('should return ~4000ms for third retry (retryCount=2)', () => {
    // Arrange: 1000 * 2^2 = 4000, jitter = 0
    // Act
    const result = calculateBackoff(2);

    // Assert
    expect(result).toBe(4000);
  });

  it('should cap at 60000ms maximum', () => {
    // Arrange: 1000 * 2^10 = 1,024,000 → capped at 60000
    // Act
    const result = calculateBackoff(10);

    // Assert
    expect(result).toBe(60000);
  });

  it('should add jitter when Math.random returns non-zero', () => {
    // Arrange
    vi.mocked(Math.random).mockReturnValue(0.5); // jitter = 500

    // Act: 1000 * 2^0 + 500 = 1500
    const result = calculateBackoff(0);

    // Assert
    expect(result).toBe(1500);
  });

  it('should include jitter within the cap', () => {
    // Arrange: high retry count with max jitter
    vi.mocked(Math.random).mockReturnValue(0.999);

    // Act
    const result = calculateBackoff(10);

    // Assert - still capped at 60000
    expect(result).toBe(60000);
  });

  it('should produce increasing delays for increasing retry counts', () => {
    // Arrange
    const results: number[] = [];

    // Act
    for (let i = 0; i < 6; i++) {
      results.push(calculateBackoff(i));
    }

    // Assert - each should be >= previous (with jitter=0)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThanOrEqual(results[i - 1]);
    }
  });
});
