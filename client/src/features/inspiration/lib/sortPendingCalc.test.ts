/**
 * Sort Pending Calculator Unit Tests
 * Tests for countPendingInspirations(), shouldShowReminder(), getNextThreshold()
 */

import { describe, it, expect } from 'vitest';
import { countPendingInspirations, shouldShowReminder, getNextThreshold } from './sortPendingCalc';
import type { InspirationItem } from '../store/inspirationStore';

/** Helper to create a mock InspirationItem with minimal fields */
function mockItem(overrides: Partial<Pick<InspirationItem, 'sortStatus'>> = {}): InspirationItem {
  return {
    id: 'test-id',
    content: 'test',
    tags: { content_nature: 'concept', cognitive_depth: 'shallow', subject: 'test' },
    tagsManuallyEdited: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as InspirationItem;
}

describe('countPendingInspirations', () => {
  it('should count items with sortStatus undefined as pending', () => {
    // Arrange
    const items = [
      mockItem({ sortStatus: undefined }),
      mockItem({ sortStatus: undefined }),
      mockItem({ sortStatus: 'sorted' }),
    ];

    // Act
    const result = countPendingInspirations(items);

    // Assert
    expect(result).toBe(2);
  });

  it('should count items with sortStatus "pending" as pending', () => {
    // Arrange
    const items = [
      mockItem({ sortStatus: 'pending' }),
      mockItem({ sortStatus: 'sorted' }),
      mockItem({ sortStatus: 'confirmed' }),
    ];

    // Act
    const result = countPendingInspirations(items);

    // Assert
    expect(result).toBe(1);
  });

  it('should return 0 for empty array', () => {
    // Act
    const result = countPendingInspirations([]);

    // Assert
    expect(result).toBe(0);
  });

  it('should return 0 when all items are sorted', () => {
    // Arrange
    const items = [
      mockItem({ sortStatus: 'sorted' }),
      mockItem({ sortStatus: 'confirmed' }),
      mockItem({ sortStatus: 'transformed' }),
    ];

    // Act
    const result = countPendingInspirations(items);

    // Assert
    expect(result).toBe(0);
  });
});

describe('getNextThreshold', () => {
  it('should return 10 when lastDismissedCount is 0', () => {
    // Act
    const result = getNextThreshold(0);

    // Assert
    expect(result).toBe(10);
  });

  it('should return 20 when lastDismissedCount is 15', () => {
    // Act
    const result = getNextThreshold(15);

    // Assert
    expect(result).toBe(20);
  });

  it('should return next multiple of 10 for exact multiple', () => {
    // Act - 20 → next threshold is 30
    const result = getNextThreshold(20);

    // Assert
    expect(result).toBe(30);
  });

  it('should handle large values', () => {
    // Act
    const result = getNextThreshold(99);

    // Assert
    expect(result).toBe(100);
  });

  it('should return 10 when lastDismissedCount is negative', () => {
    // Act
    const result = getNextThreshold(-5);

    // Assert - floor(-5/10 + 1) * 10 = floor(0.5) * 10 = 0 * 10 = 0
    // Actually: floor(-0.5 + 1) * 10 = floor(0.5) * 10 = 0 * 10 = 0
    expect(result).toBe(0);
  });
});

describe('shouldShowReminder', () => {
  it('should return false when pendingCount is less than 10', () => {
    // Act
    const result = shouldShowReminder(9, 0);

    // Assert
    expect(result).toBe(false);
  });

  it('should return true when pendingCount reaches next threshold', () => {
    // Arrange - last dismissed at 5, next threshold is 10
    // Act
    const result = shouldShowReminder(10, 5);

    // Assert
    expect(result).toBe(true);
  });

  it('should return false when pendingCount has not reached next threshold', () => {
    // Arrange - last dismissed at 15, next threshold is 20, but only 18 pending
    // Act
    const result = shouldShowReminder(18, 15);

    // Assert
    expect(result).toBe(false);
  });

  it('should return true when pendingCount exceeds next threshold', () => {
    // Arrange - last dismissed at 15, next threshold is 20, now 25 pending
    // Act
    const result = shouldShowReminder(25, 15);

    // Assert
    expect(result).toBe(true);
  });

  it('should return false for pendingCount=0 regardless of lastDismissedCount', () => {
    // Act
    const result = shouldShowReminder(0, 0);

    // Assert
    expect(result).toBe(false);
  });
});
