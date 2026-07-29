/**
 * AI Error Messages Unit Tests
 * Tests for getErrorMessage()
 */

import { describe, it, expect } from 'vitest';
import { getErrorMessage, AI_ERROR_MESSAGES, NEEDS_CONFIG_MESSAGE, GATEWAY_NOT_RUNNING_MESSAGE } from './errorMessages';

describe('getErrorMessage', () => {
  describe('known error codes', () => {
    it('should return correct message for "timeout"', () => {
      // Act
      const result = getErrorMessage('timeout');

      // Assert
      expect(result).toBe(AI_ERROR_MESSAGES.timeout);
      expect(result).toContain('超时');
    });

    it('should return correct message for "rate_limit"', () => {
      // Act
      const result = getErrorMessage('rate_limit');

      // Assert
      expect(result).toBe(AI_ERROR_MESSAGES.rate_limit);
    });

    it('should return correct message for "offline"', () => {
      // Act
      const result = getErrorMessage('offline');

      // Assert
      expect(result).toBe(AI_ERROR_MESSAGES.offline);
      expect(result).toContain('联网');
    });

    it('should return correct message for all defined error codes', () => {
      // Arrange
      const codes = Object.keys(AI_ERROR_MESSAGES);

      // Act & Assert
      for (const code of codes) {
        const result = getErrorMessage(code);
        expect(result).toBe((AI_ERROR_MESSAGES as Record<string, string>)[code]);
      }
    });
  });

  describe('unknown error codes', () => {
    it('should return fallback message for unknown code', () => {
      // Act
      const result = getErrorMessage('unknown_code');

      // Assert
      expect(result).toBe('AI 服务出现异常，请稍后重试');
    });

    it('should return fallback message for empty string', () => {
      // Act
      const result = getErrorMessage('');

      // Assert
      expect(result).toBe('AI 服务出现异常，请稍后重试');
    });
  });

  describe('exported constants', () => {
    it('should export NEEDS_CONFIG_MESSAGE with API Key hint', () => {
      // Assert
      expect(NEEDS_CONFIG_MESSAGE).toContain('API Key');
    });

    it('should export GATEWAY_NOT_RUNNING_MESSAGE', () => {
      // Assert
      expect(GATEWAY_NOT_RUNNING_MESSAGE).toContain('网关');
    });
  });
});
