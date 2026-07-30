/**
 * AI 错误类型（运行时类，从纯类型文件中分离）
 *
 * @ai-context: AIErrorCode 是全链路错误分类字典（errorClassifier 产出、
 * errorMessages 消费、Fallback 链按 retryable 决策），新增错误码需三处同步。
 * @ai-context: 本文件含运行时类 AIError（types.ts 其余为纯类型），单独
 * 成文件以符合"纯类型文件零运行时副作用"约束。
 */

export type AIErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'service_unavailable'
  | 'content_filter'
  | 'invalid_response'
  | 'invalid_input'
  | 'content_too_short'
  | 'no_api_key'
  | 'offline'
  | 'auth_error'
  | 'cors_error';

export class AIError extends Error {
  constructor(
    message: string,
    public code: AIErrorCode,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'AIError';
  }
}
