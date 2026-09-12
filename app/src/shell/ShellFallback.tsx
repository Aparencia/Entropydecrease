/**
 * @ai-context 壳层的两个失败/等待态（批 2 §瓶颈清单转交批 3 的三条：Task 6 评审 M-1 · Task 7 风险 1 · 未做 #6）。
 *
 * 批 4 T9：两个态**改为 L1 原语** —— 首访加载态 → `Loading`（`role="status"` + 探针 + 文案）、
 *   叶级失败卡片 → `StatusLine kind="error"`（`role="alert"`，`--ed-stamp` 文字色由原语给）。
 *   原先那段自足内联 `<div style=…>` **整块删除**：它是批 3 非目标 2（不许 import 原语层）的产物，
 *   批 4 起 barrel 是唯一公共入口（ADR-033 §1）⇒ `motion.css` 与原语层 CSS 随之进首屏，
 *   代价与机理见 `task-9-report.md` §首屏。本文件因此**不再自带任何排版与色值**（也不写行内 `style`）。
 *   ⚠️ 文案**一字未改**：那句失败卡是**四处共用**的（PageSlot / overlay / float / dock），批 3 T13
 *   评审 Minor-3 刚把它从「可切换页面」改成现在这句（**假陈述修正**的成果），迁移不得回退。
 *
 * 覆盖的三条：
 *   ① `SlotErrorBoundary` 是**叶级**错误边界：它包**一页 / 一个面板**，不是整壳。此前 `PageSlot`
 *      之上只有全局 `AppErrorBoundary` ⇒ 懒 chunk 加载失败会卸载**整个 MainShell**
 *      （已访问页状态、`mountedPages` 保活集合一起丢）。兄弟槽位与壳层状态在本边界之外。
 *   ② 两个窗口变体（`?float=1` / `?overlay=1`）此前无边界 ⇒ chunk 失败 = 全窗口空白。
 *   ③ 首访加载态：`Suspense fallback={null}` ⇒ 改用 `ShellFallback`。
 *
 * 副作用：仅 `Loading` 自带的循环 CSS 动效（`ed-probe-swing`，纯 CSS、不占 JS 主线程）——
 *   批 4 的动效纲领（三档强度 / 双基调 / GSAP）**未交付**，此处只是原语自带的接缝：
 *   **只有接缝、没有纲领**（B9）。
 * 边界：**不做重试按钮**（重试语义要与 Tauri 的 chunk 缓存一起设计，登记给批 8）；失败卡片
 *   只给静态文案，不回显 error 细节（细节仍由最外层 `AppErrorBoundary` 承担）。
 * 等价性锚点（T9 逐条核对）：`role="status"` / `role="alert"` 由两个原语分别提供；`data-testid`
 *   `shell-fallback` / `slot-error` 逐字保留；文案逐字保留；失败卡片仍**不是**加载态。
 */
import { Component, type ReactNode } from "react";
import { Loading, StatusLine } from "../ui/primitives";

/** 首访加载态：懒 chunk 到达前的一行静态占位（文案 + 探针；语义与排版全在原语里）。 */
export function ShellFallback() {
  return <Loading label="正在载入…" testId="shell-fallback" />;
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
        <StatusLine kind="error" testId="slot-error">
          此处加载失败——其余区域仍可使用；重启应用可恢复。
        </StatusLine>
      );
    }
    return this.props.children;
  }
}
