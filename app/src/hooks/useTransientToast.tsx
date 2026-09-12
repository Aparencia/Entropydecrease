/**
 * useTransientToast — 页面级自绘 toast hook（批 7 REQ-316 空组清理留痕消费端）。
 *
 * @ai-context: 会话页（批 4）先例是页内自绘 toast 组件；本 hook 把「状态 +
 *              自动消失计时 + 固定定位 JSX」收敛成可复用件——NotesPage 等多处
 *              消费统一观感，不重复计时器/卸载清理代码。Why 自绘而非 UI 库：
 *              项目零 toast 依赖（全站自绘先例），最小改动不引新依赖。
 * @ai-context: 自动消失计时器入 ref 并在卸载清理（L2 纪律：防卸载后 setState）。
 *              连续 toast 重置计时（新消息覆盖旧消息——与 App.tsx AI toast 同规）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { zIndex } from "../ui/zIndex";

export interface TransientToast {
  msg: string;
  kind: "ok" | "err";
}

const TOAST_STYLE: Record<"ok" | "err", React.CSSProperties> = {
  ok: { color: "#065f46", background: "#ecfdf5", border: "1px solid #6ee7b7" },
  err: { color: "#991b1b", background: "#fef2f2", border: "1px solid #fca5a5" },
};

/** 自绘 toast（默认 3s 自动消失；返回固定定位节点 + 触发函数） */
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

  return {
    toast: toast ? (
      <div
        role="status"
        data-testid="transient-toast"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: zIndex("popover"),
          maxWidth: 420,
          padding: "8px 14px",
          borderRadius: 8,
          fontSize: 12.5,
          boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
          ...TOAST_STYLE[toast.kind],
        }}
      >
        {toast.msg}
      </div>
    ) : null,
    showToast,
  };
}
