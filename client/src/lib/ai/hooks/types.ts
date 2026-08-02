/**
 * AI Hook 共享类型与工具函数
 *
 * 所有 useAI* hooks 共用的状态类型、初始状态和错误处理逻辑
 *
 * @ai-context: AI hooks 公共类型（加载/错误状态契约），供全部 useAI* Hook 共享。
 */

import { AIError } from '../types';
import { hasUserKeys } from '../apiKeyManager';
import { getCachedGatewayStatus } from '@/hooks/useAIGatewayHealth';
import { getAIConfig } from '../config';

/** AI Hook 统一状态 */
export interface AIState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isFallback: boolean;
  /** 当后端 503 且用户未配置 API Key 时为 true，UI 可展示跳转设置页引导 */
  needsConfig: boolean;
}

export const INITIAL_STATE: AIState<never> = {
  data: null, loading: false, error: null, isFallback: false, needsConfig: false,
};

/**
 * 统一处理 service_unavailable 错误：
 * - 网关在线/降级 + 用户无自配 Key → 服务端 Provider 问题，提示稍后重试
 * - 网关离线 + 网关 URL 已配置 → 网关服务未启动，提示检查网关
 * - 网关离线/未知 + 网关 URL 未配置 + 用户无自配 Key → 引导用户配置
 * - 用户有自配 Key → 正常网络/服务错误提示
 */
export function handleServiceUnavailable(): { error: string; needsConfig: boolean } {
  const gatewayStatus = getCachedGatewayStatus();
  const gatewayReachable = gatewayStatus === 'online' || gatewayStatus === 'degraded';

  if (!hasUserKeys()) {
    if (gatewayReachable) {
      // 网关可达但服务不可用 → 服务端 Provider 问题（如 API Key 未配置/过期）
      return {
        error: 'AI 服务暂时不可用，可能是服务端模型配置问题，请稍后重试',
        needsConfig: false,
      };
    }
    // 网关不可达时，区分「URL 已配置但服务未运行」和「完全未配置」
    const gatewayUrl = getAIConfig().gatewayUrl?.trim();
    if (gatewayUrl) {
      // 缓存为空（预检未完成）时不应急于判定“未连接”，给更中性的提示
      if (gatewayStatus === null) {
        return {
          error: 'AI 服务暂时不可用，正在检测网关连接，请稍后重试',
          needsConfig: false,
        };
      }
      // 网关 URL 已配置但服务不可达 → 提示检查网关服务
      return {
        error: 'AI 网关未连接，请检查网关服务是否正在运行',
        needsConfig: false,
      };
    }
    // 网关 URL 未配置 + 用户无自配 Key → 引导用户配置
    return {
      error: '当前还没有配置 AI 网关地址呢，请前往设置页面配置',
      needsConfig: true,
    };
  }
  return {
    error: 'AI 服务暂时不可用，请稍后重试',
    needsConfig: false,
  };
}

/**
 * 统一 AI 错误处理 — 根据错误码设置对应状态
 * @returns 处理后的状态片段，供 setState 使用
 */
export function resolveAIErrorState(
  error: unknown,
  fallbackMessage?: { message: string; suggestion: string },
): Pick<AIState<never>, 'data' | 'loading' | 'error' | 'isFallback' | 'needsConfig'> {
  const aiError = error instanceof AIError ? error : null;

  if (aiError?.code === 'content_too_short') {
    return { data: null, loading: false, error: aiError.message, isFallback: false, needsConfig: false };
  }
  if (aiError?.code === 'offline') {
    return { data: null, loading: false, error: aiError.message, isFallback: false, needsConfig: false };
  }
  if (aiError?.code === 'timeout') {
    return { data: null, loading: false, error: 'AI 服务响应超时，请稍后重试', isFallback: false, needsConfig: false };
  }
  if (aiError?.code === 'service_unavailable') {
    const svc = handleServiceUnavailable();
    return { data: null, loading: false, error: svc.error, isFallback: false, needsConfig: svc.needsConfig };
  }

  // 通用降级
  if (fallbackMessage) {
    return {
      data: null, loading: false,
      error: fallbackMessage.message + '。' + fallbackMessage.suggestion,
      isFallback: true, needsConfig: false,
    };
  }

  const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'AI 操作失败');
  return { data: null, loading: false, error: msg, isFallback: true, needsConfig: false };
}
