/**
 * AI 调用前置守卫（纯校验函数）
 *
 * @ai-context: 从 AIPluginLoader 拆出的统一守卫。错误文案与错误码被
 * UI 层与测试断言依赖，修改文案属破坏性变更。
 * @ai-context: 离线判定基于 navigator.onLine（乐观值，可能误报在线），
 * 真正的网络失败由下游 fetch 超时兜底。
 */
import { AIError } from './ai-errors';

/** 离线检查：离线时抛出 AIError('offline') */
export function ensureOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new AIError('当前处于离线状态，无法使用 AI 功能', 'offline', false);
  }
}

/** 内容长度检查：少于 10 字符抛出 AIError('content_too_short') */
export function ensureMinLength(content?: string): void {
  if (content !== undefined && content.trim().length < 10) {
    throw new AIError(
      '内容太短，无法进行 AI 分析。请至少输入 10 个字符。',
      'content_too_short',
      false
    );
  }
}
