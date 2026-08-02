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

/**
 * 内容长度检查：少于 min 字符抛出 AIError('content_too_short')
 *
 * v0.30: 差异化阈值——概念类（救援/追问主题）min=1 非空即可；
 * 讲解/回答类 min=5；生成类（摘要/闪卡/锚点）保持 min=10。
 * 错误码 'content_too_short' 为稳定契约，文案随阈值动态生成。
 */
export function ensureMinLength(content?: string, min = 10): void {
  if (content !== undefined && content.trim().length < min) {
    const message = min <= 1
      ? '请输入内容后再使用 AI 功能。'
      : `内容太短，无法进行 AI 分析。请至少输入 ${min} 个字符（当前 ${content.trim().length} 个）。`;
    throw new AIError(message, 'content_too_short', false);
  }
}
