/**
 * 全局快捷键静态定义表
 *
 * 所有系统级快捷键的唯一登记处：未来新增全局快捷键只需在
 * SHORTCUT_DEFS 中追加一行，注册/触发/释放逻辑由 shortcutManager.ts
 * 统一驱动，无需再触碰 main.ts / preload.ts。
 *
 * @ai-context: 全局快捷键声明表（id / accelerator / description），
 * shortcutManager 遍历本表执行 globalShortcut.register；id 同时作为
 * 'shortcut:triggered' 事件 payload 的分发键，渲染侧
 * shortcutDispatcher.ts 按 id 路由处理。
 * @ai-context: Single source of truth for system-level shortcut
 * declarations. Adding a new global shortcut = append one entry here;
 * registration, dispatch and disposal are fully driven by
 * shortcutManager.ts, so main.ts/preload.ts stay untouched.
 */

/** 单条全局快捷键定义 */
export interface ShortcutDef {
  /** 唯一标识，作为 'shortcut:triggered' payload.id 的分发键 */
  id: string;
  /** Electron Accelerator 字符串（如 'CommandOrControl+Shift+B'） */
  accelerator: string;
  /** 人类可读描述（供设置页/命令面板展示） */
  description: string;
  /** 触发时由主进程附带剪贴板文本（capture-clipboard 等收集类快捷键） */
  withClipboardText?: boolean;
}

/**
 * 首批快捷键清单
 *
 * capture-clipboard：收藏剪贴板文本到统一收件箱（inbox_items 表）。
 * 主进程 clipboard.readText() 在窗口失焦时同样可用，故注册在系统级。
 */
export const SHORTCUT_DEFS: ShortcutDef[] = [
  {
    id: 'capture-clipboard',
    accelerator: 'CommandOrControl+Shift+B',
    description: '收藏剪贴板内容到收件箱',
    withClipboardText: true,
  },
];
