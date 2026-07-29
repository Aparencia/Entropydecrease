/**
 * Environment Detection Unit Tests
 * Tests for isProduction(), isDevelopment(), isTest(), getEnvName(), degradedLog()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isProduction, isDevelopment, isTest, getEnvName, degradedLog } from './env';

describe('isTest', () => {
  it('should return true when MODE is "test"', () => {
    // In vitest, MODE is 'test' by default
    // Act
    const result = isTest();

    // Assert
    expect(result).toBe(true);
  });
});

describe('isDevelopment', () => {
  it('should return true in test environment (DEV=true)', () => {
    // In vitest, DEV is true
    // Act
    const result = isDevelopment();

    // Assert
    expect(result).toBe(true);
  });
});

describe('isProduction', () => {
  it('should return false in test environment (PROD=false)', () => {
    // In vitest, PROD is false
    // Act
    const result = isProduction();

    // Assert
    expect(result).toBe(false);
  });
});

describe('getEnvName', () => {
  it('should return "test" in test environment', () => {
    // Act
    const result = getEnvName();

    // Assert
    expect(result).toBe('test');
  });

  it('should return a valid environment name', () => {
    // Act
    const result = getEnvName();

    // Assert
    expect(['production', 'development', 'test']).toContain(result);
  });
});

describe('degradedLog', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('should output warning in non-production environment', () => {
    // Act - in test env, isProduction() returns false
    degradedLog('test context');

    // Assert
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[DEGRADED]'), expect.anything());
  });

  it('should include context string in warning', () => {
    // Act
    degradedLog('AI service failed');

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('AI service failed'),
      expect.anything(),
    );
  });

  it('should include error object when provided', () => {
    // Arrange
    const error = new Error('test error');

    // Act
    degradedLog('context', error);

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(expect.any(String), error);
  });

  it('should use empty string when error is not provided', () => {
    // Act
    degradedLog('context');

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(expect.any(String), '');
  });
});
