/**
 * 课堂分析错误细分单测（P0-1 验收红线：错误态可操作率 100%）
 *
 * @ai-context: 覆盖 4 类错误映射（gateway_config/network/timeout/
 * quota_or_server）与未知错误兜底——每个分类都必须产出非空文案与
 * 明确的操作建议（retry/settings/both）。
 * @ai-context: Verifies all 4 error kinds + fallback remain actionable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifyAnalysisError } from './analysisErrors';
import type { AnalysisErrorAction } from './analysisErrors';
import { AI_ERROR_MESSAGES } from '@/lib/ai/errorMessages';
import { AI_CONFIG_STORAGE_KEY } from '@/lib/ai/config';

const ALL_ACTIONS: AnalysisErrorAction[] = ['retry', 'settings', 'both'];

describe('classifyAnalysisError', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('gateway_config：错误匹配 requireGatewayUrl() 抛出的固定文案', () => {
    const err = new Error('[熵减] AI Gateway URL 未配置。请在 AI 设置中填写网关地址，或在 .env 中设置 VITE_AI_GATEWAY_URL');
    const info = classifyAnalysisError(err);
    expect(info.kind).toBe('gateway_config');
    expect(info.action).toBe('settings');
    expect(info.message.length).toBeGreaterThan(0);
  });

  it('gateway_config：设置中网关 URL 为空（即使错误消息无关）', () => {
    // 清空环境变量，避免 DEV 模式下 env 覆盖 localStorage 的空值
    vi.stubEnv('VITE_AI_GATEWAY_URL', '');
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify({ gatewayUrl: '' }));
    const info = classifyAnalysisError(new Error('某个与分析无关的异常'));
    expect(info.kind).toBe('gateway_config');
    expect(info.action).toBe('settings');
  });

  it('network：fetch 连接失败映射为可重试的网络类', () => {
    const info = classifyAnalysisError(new TypeError('Failed to fetch'));
    expect(info.kind).toBe('network');
    expect(info.action).toBe('retry');
    expect(info.message.length).toBeGreaterThan(0);
  });

  it('timeout：AbortError 映射为超时类（消费 errorMessages 文案）', () => {
    const info = classifyAnalysisError(new DOMException('The operation was aborted', 'AbortError'));
    expect(info.kind).toBe('timeout');
    expect(info.action).toBe('retry');
    expect(info.message).toBe(AI_ERROR_MESSAGES.timeout);
  });

  it('quota_or_server：429 限流可同时重试或检查设置', () => {
    const info = classifyAnalysisError(new Error('HTTP 429 Too Many Requests'));
    expect(info.kind).toBe('quota_or_server');
    expect(info.action).toBe('both');
    expect(info.message).toBe(AI_ERROR_MESSAGES.rate_limit);
  });

  it('quota_or_server：认证失败引导去设置页', () => {
    const info = classifyAnalysisError(new Error('HTTP 401 Unauthorized'));
    expect(info.kind).toBe('quota_or_server');
    expect(info.action).toBe('settings');
  });

  it('兜底：完全未知的错误依然可操作（有文案 + 有操作建议）', () => {
    const info = classifyAnalysisError(new Error('前所未见的奇怪错误 xyz'));
    expect(info.message.length).toBeGreaterThan(0);
    expect(ALL_ACTIONS).toContain(info.action);
  });

  it('非 Error 输入（字符串/null）也能安全分类', () => {
    expect(classifyAnalysisError('timeout exceeded').kind).toBe('timeout');
    const info = classifyAnalysisError(null);
    expect(info.message.length).toBeGreaterThan(0);
    expect(ALL_ACTIONS).toContain(info.action);
  });
});
