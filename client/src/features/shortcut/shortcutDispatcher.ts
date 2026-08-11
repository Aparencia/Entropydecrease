/**
 * 全局快捷键分发器 — 按 id 路由到注册的 handler
 * Shortcut dispatcher — routes shortcut:triggered by id
 *
 * @ai-context: 渲染侧订阅 preload 的 onShortcutTriggered 后统一交由此分发。
 * handler 注册表模式：新快捷键只需 registerShortcutHandler(id, fn) 追加，
 * 与主进程 SHORTCUT_DEFS 声明一一对应。dispatchShortcut 无匹配 handler
 * 时静默忽略（主进程已登记但渲染层尚未接线的快捷键不报错）。
 * @ai-context: Renderer subscribes via preload then funnels events here.
 * Handlers register by id, mirroring SHORTCUT_DEFS; unknown ids are
 * silently ignored while the renderer wiring catches up.
 */

/** 快捷键触发 payload（与 preload onShortcutTriggered 同构） */
export interface ShortcutPayload {
  id: string;
  /** capture-clipboard 等收集类快捷键附带的主进程剪贴板文本 */
  text?: string;
}

const handlers = new Map<string, (payload: ShortcutPayload) => void>();

/** 注册快捷键 handler（按 id，重复注册覆盖） */
export function registerShortcutHandler(id: string, fn: (payload: ShortcutPayload) => void): void {
  handlers.set(id, fn);
}

/** 注销快捷键 handler */
export function unregisterShortcutHandler(id: string): void {
  handlers.delete(id);
}

/** 分发一次触发事件 */
export function dispatchShortcut(payload: ShortcutPayload): void {
  const fn = handlers.get(payload.id);
  if (fn) fn(payload);
}
