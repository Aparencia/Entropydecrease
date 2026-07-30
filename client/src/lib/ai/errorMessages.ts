/**
 * AI 错误文案单一数据源
 *
 * 统一管理所有 AI 错误的用户可见文案，
 * 取代分散在 aiServiceFallback.ts / hooks/types.ts 中的硬编码字符串。
 *
 * @ai-context: AIErrorCode→用户可读文案映射，新增错误码必须在此补充文案否则 UI 显示原始码。
 */

import type { AIErrorCode } from './types';

/** AI 错误文案映射表 */
export const AI_ERROR_MESSAGES: Record<AIErrorCode, string> = {
  timeout: 'AI 服务响应超时，请稍后重试',
  rate_limit: 'AI 请求过于频繁，请稍后再试',
  service_unavailable: 'AI 服务暂时不可用，请稍后重试',
  auth_error: 'AI 服务认证失败，请检查 API Key 是否有效',
  cors_error: '跨域请求被拒绝，请检查网关 CORS 配置',
  content_filter: '内容未通过安全审核，请修改后重试',
  invalid_response: 'AI 返回了无效的结果',
  invalid_input: '输入内容格式不正确，请检查后重试',
  content_too_short: '输入内容太短，请补充后再试',
  no_api_key: '请先配置 API Key 后使用 AI 功能',
  offline: '此功能需要联网，请检查网络连接后重试',
};

/** 需要配置 API Key 时的提示 */
export const NEEDS_CONFIG_MESSAGE = '当前还没有配置 API Key 呢，请前往设置页面配置';

/** 网关未启动专用提示 */
export const GATEWAY_NOT_RUNNING_MESSAGE = 'AI 网关服务未启动，请确保 ai-gateway 正在运行';

/** 获取错误文案（传入未知 code 时返回兜底文案） */
export function getErrorMessage(code: string): string {
  return (AI_ERROR_MESSAGES as Record<string, string>)[code] ?? 'AI 服务出现异常，请稍后重试';
}
