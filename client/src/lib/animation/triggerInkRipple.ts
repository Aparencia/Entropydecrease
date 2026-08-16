/**
 * 水墨涟漪触发工具（自 InkRipple.tsx 拆出）
 *
 * @ai-context: 全局自定义事件 'kb:ink-ripple' 触发函数——从组件文件移出
 * （react-refresh：组件文件只导出组件），InkRipple 组件保留在原文件。
 * 也可不传 x/y，默认使用屏幕中心。
 */
export function triggerInkRipple(x?: number, y?: number) {
  window.dispatchEvent(
    new CustomEvent('kb:ink-ripple', { detail: { x, y } }),
  );
}
