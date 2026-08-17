/**
 * 全局数字键快捷导航映射（0-9）
 *
 * @ai-context: 从 AppLayout 提取的纯映射层（可单测）。映射表：
 * 0 设置 / 1 首页 / 2 课堂助手 / 3 笔记 / 4 番茄钟 / 5 费曼 /
 * 6 闪卡 / 7 灵感库 / 8 知识星座 / 9 升级充值。
 * English: pure 0-9 hotkey→route mapping extracted from AppLayout
 * for testability; labels drive the 500ms visual feedback overlay.
 */

/** 数字键 → 路由映射（全量 0-9，无遗漏） */
export const HOTKEY_ROUTES: Record<string, string> = {
  '0': '/settings',
  '1': '/',
  '2': '/classroom',
  '3': '/notes',
  '4': '/pomodoro',
  '5': '/feynman',
  '6': '/flashcards',
  '7': '/inspiration',
  '8': '/constellation',
  '9': '/upgrade',
};

/** 数字键 → 模块标签（视觉反馈浮层文案） */
export const HOTKEY_LABELS: Record<string, string> = {
  '0': '设置',
  '1': '首页',
  '2': '课堂助手',
  '3': '笔记',
  '4': '番茄钟',
  '5': '费曼学习法',
  '6': '闪卡复习',
  '7': '灵感库',
  '8': '知识星座',
  '9': '升级充值',
};

/** 解析数字键 → 路由；未知键返回 null（调用方忽略） */
export function resolveHotkeyRoute(key: string): string | null {
  return HOTKEY_ROUTES[key] ?? null;
}

/** 解析数字键 → 模块标签；未知键返回空串 */
export function resolveHotkeyLabel(key: string): string {
  return HOTKEY_LABELS[key] ?? '';
}
