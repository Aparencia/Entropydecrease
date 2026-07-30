import { describe, it, expect } from 'vitest';
import { classifyRawError } from './errorClassifier';
import { AIError } from './types';

describe('classifyRawError', () => {
  it('should classify 422 as invalid_input', () => {
    const error = new Error('HTTP 422: Unprocessable Entity');
    const result = classifyRawError(error, 'ipc');
    expect(result).toBeInstanceOf(AIError);
    expect(result.code).toBe('invalid_input');
    expect(result.retryable).toBe(false);
  });

  it('should classify abort/timeout as timeout for ipc transport', () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const result = classifyRawError(abortError, 'ipc');
    expect(result.code).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('should classify 401 as auth_error', () => {
    const error = new Error('HTTP 401: Unauthorized');
    const result = classifyRawError(error, 'fetch');
    expect(result.code).toBe('auth_error');
    expect(result.retryable).toBe(false);
  });

  it('should pass through AIError unchanged', () => {
    const original = new AIError('custom', 'rate_limit', true);
    const result = classifyRawError(original, 'fetch');
    expect(result).toBe(original);
  });
});
