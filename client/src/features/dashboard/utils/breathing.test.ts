/**
 * Breathing Phase Calculator Unit Tests
 * Tests for calculateBreathingPhase()
 */

import { describe, it, expect } from 'vitest';
import { calculateBreathingPhase } from './breathing';

describe('calculateBreathingPhase', () => {
  describe('first cycle (0-16000ms)', () => {
    it('should return inhale phase at t=0', () => {
      // Act
      const result = calculateBreathingPhase(0);

      // Assert
      expect(result.phase).toBe('inhale');
      expect(result.phaseProgress).toBe(0);
      expect(result.cycleCount).toBe(0);
      expect(result.phaseLabel).toBe('吸气');
    });

    it('should return inhale at midpoint of first phase (t=2000)', () => {
      // Act
      const result = calculateBreathingPhase(2000);

      // Assert
      expect(result.phase).toBe('inhale');
      expect(result.phaseProgress).toBeCloseTo(0.5, 1);
      expect(result.cycleCount).toBe(0);
    });

    it('should return hold1 at t=4000', () => {
      // Act
      const result = calculateBreathingPhase(4000);

      // Assert
      expect(result.phase).toBe('hold1');
      expect(result.phaseProgress).toBeCloseTo(0, 1);
      expect(result.phaseLabel).toBe('屏息');
    });

    it('should return exhale at t=8000', () => {
      // Act
      const result = calculateBreathingPhase(8000);

      // Assert
      expect(result.phase).toBe('exhale');
      expect(result.phaseProgress).toBeCloseTo(0, 1);
      expect(result.phaseLabel).toBe('呼气');
    });

    it('should return hold2 at t=12000', () => {
      // Act
      const result = calculateBreathingPhase(12000);

      // Assert
      expect(result.phase).toBe('hold2');
      expect(result.phaseProgress).toBeCloseTo(0, 1);
    });

    it('should return hold2 near end of first cycle (t=15999)', () => {
      // Act
      const result = calculateBreathingPhase(15999);

      // Assert
      expect(result.phase).toBe('hold2');
      expect(result.phaseProgress).toBeGreaterThan(0.99);
      expect(result.cycleCount).toBe(0);
    });
  });

  describe('second cycle (16000-32000ms)', () => {
    it('should restart at inhale with cycleCount=1', () => {
      // Act
      const result = calculateBreathingPhase(16000);

      // Assert
      expect(result.phase).toBe('inhale');
      expect(result.phaseProgress).toBe(0);
      expect(result.cycleCount).toBe(1);
    });

    it('should correctly compute midpoint of second cycle', () => {
      // Act
      const result = calculateBreathingPhase(24000);

      // Assert
      expect(result.phase).toBe('exhale');
      expect(result.cycleCount).toBe(1);
    });
  });

  describe('boundary values', () => {
    it('should handle very large elapsedMs without overflow', () => {
      // Arrange - 1000 cycles = 16,000,000ms
      const elapsedMs = 16_000_000;

      // Act
      const result = calculateBreathingPhase(elapsedMs);

      // Assert
      expect(result.phase).toBe('inhale');
      expect(result.cycleCount).toBe(1000);
      expect(result.phaseProgress).toBe(0);
    });

    it('should handle phaseProgress capped at 1', () => {
      // Act - exactly at phase boundary
      const result = calculateBreathingPhase(3999);

      // Assert
      expect(result.phaseProgress).toBeLessThanOrEqual(1);
    });
  });

  describe('phase labels', () => {
    it('should return correct Chinese labels for each phase', () => {
      // Arrange
      const phases = [
        { ms: 0, expected: '吸气' },
        { ms: 4000, expected: '屏息' },
        { ms: 8000, expected: '呼气' },
        { ms: 12000, expected: '屏息' },
      ];

      // Act & Assert
      for (const { ms, expected } of phases) {
        const result = calculateBreathingPhase(ms);
        expect(result.phaseLabel).toBe(expected);
      }
    });
  });
});
