/**
 * useTransientToast — 页面级 toast hook（批 4 T10：渲染交给 L1 的 `Toast` 原语）。
 *
 * @ai-context: 本 hook 保留「状态 + 自动消失计时 + 卸载清理」这套状态机与对外 API
 *              （`{ toast, showToast }`）不变——它是被复用的件（`NotesPage` 经
 *              `useNotesBatchActions` 消费、`SessionsPage` 直接消费），调用点只渲染返回的节点。
 *              批 4 T10 只换**渲染**：自绘的固定定位 JSX（`position/right/bottom`）、内联三档
 *              配色（`TOAST_STYLE`）与 `zIndex("popover")` 全部删除——定位/墨度/层级归原语
 *              （`.ed-toast` 基类 + `zIndex("toast")`）。
 * @ai-context: 计时权**仍在 hook**（`durationMs` 参数 → 本 hook 的 setTimeout），传给原语的是
 *              `durationMs={0}`（原语边界④「不自动消失」）⇒ 全链路**恰好一个**计时器；既有的
 *              计时器生命周期契约（`useTransientToast.test.tsx` 的 `vi.getTimerCount()`）逐条不变。
 *              若改由原语计时：钩子的 `toast` 状态会一直非 null（原语自己摘节点）⇒ 该契约当场失效，
 *              且与「单个计时器」冲突——这就是「渲染迁移」为什么不搬计时的原因。
 * @ai-context: 边界（如实登记）——`toast` 为 null 时返回 null（既有契约），故原语是**随状态挂载**的：
 *              `open` 在渲染期恒为 true，原语的 140ms 退场在本档**不会**触发（可见时长与迁移前
 *              逐字相同：到时即摘）。退出契约的真实消费者是 `App.tsx` 的 AI toast（常挂载 + 翻
 *              `open`，判据见 `components/toastMigration.test.tsx`）。
 * @ai-context: 文案通道：原语直接吃 `message` prop；本 hook 返回元素的**读取口径**随之从
 *              `element.props.children`（旧自绘 `<div>{msg}</div>` 的形态）机械搬到
 *              `element.props.message` —— 控制方 2026-09-12 按 B13/B15 先例**授权**改写
 *              `useTransientToast.test.tsx:56-57` 那两行（语义不变、强度不降、用例数不变、
 *              各带变异体；报告 §C1 逐条说明）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
// 批 4 T10：走 barrel（ADR-033 §1 的唯一公共入口）——深导入 `../ui/primitives/Toast` 会漏掉
// `motion.css` 的 reduced-motion 块，那是无障碍回归（B5）。
import { Toast } from "../ui/primitives";

export interface TransientToast {
  msg: string;
  kind: "ok" | "err";
}

/** toast（默认 3s 自动消失；返回 L1 `Toast` 节点 + 触发函数） */
export function useTransientToast(durationMs = 3000): {
  toast: ReactElement | null;
  showToast: (msg: string, kind: TransientToast["kind"]) => void;
} {
  const [toast, setToast] = useState<TransientToast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string, kind: TransientToast["kind"]) => {
      setToast({ msg, kind });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  // L2：卸载清理（防卸载后定时器触发 setState）——批 7 审查修复（P2-8）：
  // 原实现把 timerRef.current 快照在 effect 建立时（恒为 null——toast 尚未
  // 显示），卸载时清的是空快照=死守卫；改在 cleanup 执行时直接读 ref 取
  // 当前挂起的计时器，判空后清除。
  useEffect(() => {
    return () => {
      const timer = timerRef.current;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // `onDismiss` 是原语的**必填** prop（`ToastProps`）；本档 `durationMs={0}` ⇒ 原语永不自行退场
  // ⇒ 该回调不会被触发（计时到点的清理由上面的 `setTimeout` 负责，见文件头的计时权说明）。
  return {
    toast: toast ? (
      <Toast
        open
        message={toast.msg}
        kind={toast.kind}
        durationMs={0}
        testId="transient-toast"
        onDismiss={() => setToast(null)}
      />
    ) : null,
    showToast,
  };
}
