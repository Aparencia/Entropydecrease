/**
 * 统一错误分类器 — 将原始错误映射为结构化 AIError
 *
 * 提取自 ElectronAIPlugin.handleError 和 RemoteAIPlugin.handleError 的公共逻辑，
 * 供两种传输方式（IPC / Fetch）共用。
 *
 * @ai-context: 原始错误→AIError 分类器（fetch/ipc 双来源），错误码字典见 ai-errors.ts，三处需同步。
 */

import { AIError } from './types';

/**
 * 将任意原始错误分类为 AIError
 * @param error 原始错误对象
 * @param transport 传输方式：'ipc'（Electron 主进程）或 'fetch'（浏览器/渲染进程）
 */
export function classifyRawError(error: unknown, transport: 'ipc' | 'fetch'): AIError {
  // 已经是 AIError 则直接透传
  if (error instanceof AIError) return error;

  // 1. navigator.onLine 检查
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return new AIError('当前网络已断开，请检查网络连接后重试', 'offline', true);
  }

  const msg = getErrorMessage(error);
  const lowerMsg = msg.toLowerCase();

  // 2. 超时检测（fetch 与 IPC 均可能触发超时/AbortError）
  if ((transport === 'fetch' && error instanceof DOMException && error.name === 'AbortError') ||
      lowerMsg.includes('abort') ||
      lowerMsg.includes('timeout') ||
      lowerMsg.includes('timed out') ||
      lowerMsg.includes('etimedout')) {
    return new AIError('AI 服务响应超时，请稍后重试', 'timeout', true);
  }

  // 3. 429 限流
  if (lowerMsg.includes('429') || lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests')) {
    return new AIError('AI 请求过于频繁，请稍后再试', 'rate_limit', true);
  }

  // 4. 401/403 认证失败
  if (lowerMsg.includes('401') || lowerMsg.includes('403') || lowerMsg.includes('unauthorized') || lowerMsg.includes('forbidden')) {
    return new AIError('AI 服务认证失败，请检查 API Key 是否有效', 'auth_error', false);
  }

  // 5. 422 输入校验失败
  if (lowerMsg.includes('422') || lowerMsg.includes('unprocessable entity')) {
    return new AIError('AI 服务无法理解当前请求内容，请检查输入后重试', 'invalid_input', false);
  }

  // 5. 连接拒绝 / 服务不可用
  if (
    lowerMsg.includes('connection refused') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('os error 10061') ||
    lowerMsg.includes('os error 111')
  ) {
    return new AIError('AI 网关服务未启动，请确保 ai-gateway 正在运行', 'service_unavailable', true);
  }

  // 6. 503 服务不可用
  if (lowerMsg.includes('503') || lowerMsg.includes('service unavailable')) {
    return new AIError('AI 服务暂时不可用，请稍后重试', 'service_unavailable', true);
  }

  // 7. CORS 错误
  if (lowerMsg.includes('cors') || lowerMsg.includes('cross-origin')) {
    return new AIError('跨域请求被拒绝，请检查网关 CORS 配置', 'cors_error', false);
  }

  // 8. 网络错误兜底（fetch TypeError / IPC 网络关键字）
  if (error instanceof TypeError && (lowerMsg.includes('fetch') || lowerMsg.includes('network'))) {
    return new AIError('无法连接到 AI 网关，请检查网络或网关地址', 'service_unavailable', true);
  }
  if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror')) {
    return new AIError('无法连接到 AI 网关，请检查网络或网关地址', 'service_unavailable', true);
  }

  // 9. 内容审核
  if (lowerMsg.includes('content filter') || lowerMsg.includes('content_filter') || lowerMsg.includes('安全审核')) {
    return new AIError('内容未通过安全审核，请修改后重试', 'content_filter', false);
  }

  // 10. 兜底
  return new AIError('AI 服务出现异常，请稍后重试', 'service_unavailable', false);
}

/** 从未知错误中提取文本消息 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}
