/**
 * @ai-context: 自 `App.tsx` 抽出（批 7 T1，C9.2 腾行数）；签名与语义逐字不变。
 *   抽出原因：`App.tsx` 贴 600 硬限（599/600），而 R4/R9.1 两项还要往它加行。
 */
import { Suspense } from "react";
import { ShellFallback, SlotErrorBoundary } from "./ShellFallback";

/**
 * PageSlot — 页面容器：首访挂载 + 保活 + display 门控 + 独立 Suspense。
 *
 * @ai-context: 批 2 包体治理的挂载闸门，也是「保留挂载」语义的唯一实现点。
 *   · mounted=false ⇒ 整棵子树不渲染 ⇒ 该页的 lazy chunk **不会被请求**（首屏收益的来源）；
 *   · mounted=true 之后永不回到 false ⇒ 已访问页面常驻（TD-004 保活语义，状态与事件监听不重置）；
 *   · 每页一个独立 Suspense + **叶级** `SlotErrorBoundary`：只有**新挂载**的页会挂起，
 *     已经可见的页不会因为邻居加载而被替换成 fallback（避免可见的闪烁）。
 * @ai-context: 批 3 T13：fallback 从 `null` 换成 `ShellFallback`（首访加载态，静态无动效），并在
 *   ⚠️ Suspense 之外加了**叶级**边界：懒 chunk 失败原本会一路抛到最外层 AppErrorBoundary ⇒
 *   **整个 MainShell 被卸载**（已访问页状态一起丢，批 2 评审 M-1）。边界在本函数内 ⇒ 只卸载出错的
 *   那一页，兄弟槽位与壳层状态保留（证明见 `shell/ShellFallback.test.tsx` 的「叶级」用例）。
 * 副作用：无。边界：children 是懒组件元素，未 mounted 时不会被 React 渲染 ⇒ 不触发 dynamic import。
 */
export function PageSlot({ show, mounted, children }: { show: boolean; mounted: boolean; children: React.ReactNode }) {
  if (!mounted) return null;
  return (
    <div style={{ flex: 1, display: show ? "block" : "none", overflow: "hidden" }}>
      <SlotErrorBoundary>
        <Suspense fallback={<ShellFallback />}>{children}</Suspense>
      </SlotErrorBoundary>
    </div>
  );
}
