/**
 * useConfirm — Promise 化应用内确认对话框状态管理
 *
 * @ai-context: askConfirm(req, opts?) 返回 Promise<boolean>，供异步流程
 * await（替代同步 window.confirm）。resolver 默认挂 60s 超时兜底（网关
 * down 等场景防 Promise 永久挂起）；opts.timeout = 0 表示不挂超时，
 * 供停止收尾等"入口不可丢"的决策使用。组件卸载时清理定时器并置空
 * resolver，防止悬空定时器触发已卸载组件的 setState。
 * @ai-context: Promise-based confirm flow. Default timeout (60s) resolves
 * false as a safety net; opts.timeout = 0 disables the timeout for
 * decisions whose entry must never silently expire. Unmount cleanup clears
 * the pending timer and drops the resolver.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
}

/** resolver 超时兜底（毫秒）：超时视为取消 */
const CONFIRM_TIMEOUT_MS = 60_000;

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  /** 结束当前对话框：resolve Promise 并清理超时定时器 */
  const settle = useCallback((ok: boolean) => {
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  /**
   * 请求确认，返回用户选择。
   * opts.timeout：超时毫秒数，缺省 60s 兜底（超时视为取消）；
   * 传 0 表示不挂超时（停止收尾决策等入口不可静默丢失的场景）。
   */
  const askConfirm = useCallback((req: ConfirmRequest, opts?: { timeout?: number }): Promise<boolean> => {
    // 已有未决请求时先视为取消，避免 resolver 泄漏
    if (resolverRef.current) settle(false);
    setRequest(req);
    const timeout = opts?.timeout ?? CONFIRM_TIMEOUT_MS;
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      timerRef.current = timeout > 0 ? window.setTimeout(() => settle(false), timeout) : null;
    });
  }, [settle]);

  // 卸载兜底：清理悬空超时定时器并置空 resolver，
  // 防止组件卸载后定时器仍触发 setState/resolve
  useEffect(() => () => {
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
    resolverRef.current = null;
  }, []);

  return {
    request,
    askConfirm,
    handleConfirm: useCallback(() => settle(true), [settle]),
    handleCancel: useCallback(() => settle(false), [settle]),
  };
}
