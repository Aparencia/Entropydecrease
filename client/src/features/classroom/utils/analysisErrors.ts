/**
 * 课堂分析错误细分（P0-1 错误态可操作化）
 *
 * @ai-context: 复用统一分类器 classifyRawError 与 errorMessages 文案体系，
 * 将分析链路错误映射为 4 类可操作结果（network/gateway_config/timeout/
 * quota_or_server），各类带专属文案与操作建议（重试/打开设置），
 * 取代旧固定文案「请在设置中检查AI网关配置」的死胡同。
 * @ai-context: Maps raw analysis errors into 4 actionable kinds via the
 * shared classifier + errorMessages single source of copy. No new copy dict.
 */
import { classifyRawError } from '@/lib/ai/errorClassifier';
import { AI_ERROR_MESSAGES } from '@/lib/ai/errorMessages';
import { requireGatewayUrl } from '@/lib/ai/config';

export type AnalysisErrorKind = 'network' | 'gateway_config' | 'timeout' | 'quota_or_server';
export type AnalysisErrorAction = 'retry' | 'settings' | 'both';

export interface AnalysisErrorInfo {
  kind: AnalysisErrorKind;
  /** 用户可读文案（消费 errorMessages 体系 / 分类器文案） */
  message: string;
  /** 建议操作：retry=重试；settings=打开设置；both=两者皆可 */
  action: AnalysisErrorAction;
}

/** requireGatewayUrl() 抛出的固定文案标记（见 lib/ai/config.ts，改动需同步） */
const GATEWAY_URL_MISSING_MARKER = 'AI Gateway URL 未配置';
/** 网关未配置提示（errorMessages 体系无此错误码，唯一点状文案不另建字典） */
const GATEWAY_CONFIG_MESSAGE = 'AI 网关地址未配置，请在设置中填写后重试';

/**
 * 判定是否网关配置问题：与 requireGatewayUrl 同口径（marker 短路保留）——
 * 只要 requireGatewayUrl() 能解析出 URL 就不算配置问题，避免分类口径
 * 与实际请求入口漂移
 */
function isGatewayConfigIssue(errorMessage: string): boolean {
  if (errorMessage.includes(GATEWAY_URL_MISSING_MARKER)) return true;
  try {
    requireGatewayUrl();
    return false;
  } catch {
    return true;
  }
}

/** 将分析链路的任意错误分类为可操作结构体 */
export function classifyAnalysisError(err: unknown): AnalysisErrorInfo {
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  if (isGatewayConfigIssue(rawMessage)) {
    return { kind: 'gateway_config', message: GATEWAY_CONFIG_MESSAGE, action: 'settings' };
  }
  const aiError = classifyRawError(err, 'ipc');
  switch (aiError.code) {
    case 'timeout':
      return { kind: 'timeout', message: AI_ERROR_MESSAGES.timeout, action: 'retry' };
    case 'offline':
    case 'service_unavailable':
      return { kind: 'network', message: aiError.message, action: 'retry' };
    case 'auth_error':
    case 'no_api_key':
      return { kind: 'quota_or_server', message: aiError.message, action: 'settings' };
    default:
      // rate_limit / 输入类 / 兜底：可重试也可检查设置
      return { kind: 'quota_or_server', message: aiError.message, action: 'both' };
  }
}
