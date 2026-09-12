/**
 * @ai-context 壳层的两个失败/等待态（批 2 §瓶颈清单转交批 3 的三条：Task 6 评审 M-1 · Task 7 风险 1 · 未做 #6）。
 *
 * Why 自足内联、**不** import L1 原语层（`Loading` / `ErrorState`）：批 3 非目标 2 明令不许 import
 *   原语层 —— 那会把 `motion.css` 与整层 CSS 拉回首屏，吃掉批 2 挣来的余量。
 *   ⇒ 🔴 **本文件是批 4 的迁移点**：`ShellFallback` → `Loading`、失败卡片 → `StatusLine`（批 4 计划
 *   必须收编这两个组件，否则永远漏在这里）。
 *
 * 覆盖的三条：
 *   ① `SlotErrorBoundary` 是**叶级**错误边界：它包**一页 / 一个面板**，不是整壳。此前 `PageSlot`
 *      之上只有全局 `AppErrorBoundary` ⇒ 懒 chunk 加载失败会卸载**整个 MainShell**
 *      （已访问页状态、`mountedPages` 保活集合一起丢）。兄弟槽位与壳层状态在本边界之外。
 *   ② 两个窗口变体（`?float=1` / `?overlay=1`）此前无边界 ⇒ chunk 失败 = 全窗口空白。
 *   ③ 首访加载态：`Suspense fallback={null}` ⇒ 改用 `ShellFallback`（**静态**、无动效 —— 动效属批 6）。
 *
 * 副作用：无（`SlotErrorBoundary` 只读 `getDerivedStateFromError`；不发日志、不上报 —— 本地优先）。
 * 边界：**不做重试按钮**（重试语义要与 Tauri 的 chunk 缓存一起设计，登记给批 4/8）；失败卡片
 *   只给静态文案，不回显 error 细节（细节仍由最外层 `AppErrorBoundary` 承担）。
 */
import { Component, type ReactNode } from "react";

/** 首访加载态：懒 chunk 到达前的一行静态占位（无动效、无图标 —— 批 3 非目标 4）。 */
export function ShellFallback() {
  return (
    <div
      role="status"
      data-testid="shell-fallback"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80, padding: 24, fontSize: 12, color: "#6b7280" }}
    >
      正在载入…
    </div>
  );
}

/**
 * 叶级错误边界：只卸载出错的那一棵子树（一页 / 一个面板），兄弟槽位与壳层状态保留。
 * @ai-context 状态只有 `failed` 一个布尔位，且**不提供复位入口**（见文件头「边界」）。
 */
export class SlotErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state: { failed: boolean } = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          role="alert"
          data-testid="slot-error"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80, padding: 24, fontSize: 12, color: "#b91c1c" }}
        >
          此处加载失败——可切换页面继续使用；重启应用可恢复。
        </div>
      );
    }
    return this.props.children;
  }
}
