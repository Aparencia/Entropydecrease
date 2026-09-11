/**
 * @ai-context L1 原语：Toast —— **退出契约的建立者**（批 0-D Task 9；规格 §5.3 · §8.4 · §8.6.1 第 3 条）。
 *
 * Why：仓内现有 **4 套自绘 toast**（`App.tsx` 全局 3.5s · `SessionsPage.tsx` 页级 3s ·
 * `SessionScreenCards.tsx` 面板级 4s · `hooks/useTransientToast.tsx` hook 式 3s；recon §3.2），
 * 它们**全部只有"进"、没有"出"** —— 退出靠 `setTimeout` 直接 `setState(null)` 摘节点，于是
 * "淡出"这件事在仓内根本没有可挂载的时机。本原语先把**退出契约**建起来（谁淡出、什么时候真的
 * 摘掉、回调几次），批 4 才把 4 套替换过来（本批不迁移任何调用点）。
 *
 * 时机由 T6 的 `usePresence` 给（`transitionend` + 超时兜底 + `matchMedia` 守卫）；本组件只提供
 * **状态机**：把 `open && !closing` 交给它，把 `[data-phase]` 三态交给 CSS（`Toast.css`，180/140）。
 *
 * 副作用：`import "./Toast.css"`（首个引入本原语的模块会带上该样式表；类规则只作用于 `.ed-toast`
 * 元素，现存组件没有该类 ⇒ 批 0-D 期间**界面零变化**）；至多一个 `setTimeout`（自动消失计时），
 * 卸载时清理。组件不读 store、不发请求、不写磁盘、不建 Portal（`position: fixed` 由 CSS 承担，
 * 放在 React 树的哪一层都能浮起来；是否需要 portal 由调用点决定，规格未要求）。
 *
 * 边界（计划 Task 9 的 7 行状态机，逐条有测试）：
 * ① **进入 `entered` 才开始倒计时**：`phase !== "entered"` 时不排计时器 ⇒ `durationMs` 再小，
 *    也不会在进场动画里就把自己关掉。
 * ② **父级 `open=false` 不回调 `onDismiss`**：只有"计时到点引起的退场"才置位 `pendingDismissRef`
 *    —— 父级自己刚做的决定不该被回敬一次（父级已知情）。
 * ③ **可打断 / 可反向**（§8.6.1 第 3 条）：显示中 `message` / `kind` 变化 = **接管**，不是排队 ——
 *    取消待回调、`closing` 归位（退场中 ⇒ `usePresence` 直回 `"entered"`，**不重放进场**，否则闪一下）、
 *    重新计时。`restartTimer` 先清后排 ⇒ 任意时刻**至多一个计时器**（「不排队」是机器可判的）。
 * ④ `durationMs <= 0` = **不自动消失**（何时收起只由父级 `open` 决定）。
 * ⑤ `action.onClick` **不自动消失**（撤销场景要用户看见结果）：点完仍挂在屏上，是否收起由调用方的
 *    `open` 决定；本组件不消费这次动作，也不因此重置计时。
 * ⑥ `durationMs` 变化只在**显示中**重新计时；退场中改它不取消退场（能取消退场的输入是 ③ 的
 *    `message` / `kind`，不含 `durationMs` —— 计划表如此）。
 * ⑦ 无障碍（§8.6.1 第 4 条）：`role="status"`；**只有 `err` 用 `aria-live="assertive"`**（唯一有
 *    资格打断屏幕阅读器的档）；`reduced-motion` 由 `usePresence`（直跳终态、不依赖 `transitionend`）
 *    与 `motion.css`（`.ed-toast` 在该名单里）两侧共同兜住。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { zIndex } from "../zIndex";
import { Button } from "./Button";
import { Text } from "./Text";
import type { TextTone } from "./Text";
import { usePresence } from "./usePresence";
import "./Toast.css";

/** 三档语义：`info` 中性 · `ok` 成功回执 · `err` 失败（唯一 `aria-live="assertive"` 的档） */
export type ToastKind = "info" | "ok" | "err";

/**
 * 行动槽（规格 §5.3「撤销 toast 10s」的入口）。**本批只建槽位，不实现撤销栈**；
 * `label` 是用户可见文案（如「撤销」），点击语义完全由 `onClick` 决定。
 */
export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastProps {
  /** 受控开合；`false` 后仍会渲染到退场结束（出场 140ms），且**不回调** `onDismiss` */
  open: boolean;
  /** 提示正文（ReactNode：可含行内强调；中文文案由调用点给） */
  message: ReactNode;
  /** 语义档，默认 `info` */
  kind?: ToastKind;
  /** 自动消失时长，默认 `3000`；**`<= 0` = 不自动消失**（规格 §5.3 的撤销 toast 用 10_000） */
  durationMs?: number;
  /** 行动槽（撤销 / 重试）；不传则不渲染该按钮 */
  action?: ToastAction;
  /** **计时到点这类"自己消失"的退场**结束后的通知（恰好一次）；父级 `open=false` 不触发它 */
  onDismiss: () => void;
  /** 测试锚点：容器 `testId` · 行动按钮 `${testId}-action` */
  testId?: string;
}

/** 出场名义时长 = `motion.css` 的 `--ed-dur-toast-out`（140）；`usePresence` 的兜底窗口 = 它 + 80ms */
const EXIT_MS = 140;

/** 默认自动消失时长（现状 4 套分别是 3s/3.5s/4s/3s，取最常见的 3000 作原语默认值） */
const DEFAULT_DURATION_MS = 3000;

/**
 * `kind` → 墨度。色**只作文字色**（`--ed-stamp` 绝不进任何 `background` 声明 —— 规格 §4.1
 * 「绝不用于按钮」；左边框的 3px 强调色由 `Toast.css` 的三档类给，同样只作边框色）。
 * 写成 `Record<ToastKind, …>` 而非内联三元：**新增一档 kind 而忘了配色会成为编译错误**
 * （批 0-D Task 3 评审的「契约完整性锚」教训）。
 */
const TONE_BY_KIND: Readonly<Record<ToastKind, TextTone>> = {
  info: "ink-2",
  ok: "ok",
  err: "stamp",
};

/**
 * 渲染一条 toast。未挂载时返回 `null`。
 *
 * 返回 `ReactElement | null`（= 契约里的 `JSX.Element | null`）：React 19 把全局 `JSX` 命名空间
 * 收进 `React.JSX`，直接写 `JSX.Element` 在 `@types/react@19` 下取不到（同 `Modal.tsx` 先例）。
 */
export function Toast({
  open,
  message,
  kind = "info",
  durationMs = DEFAULT_DURATION_MS,
  action,
  onDismiss,
  testId,
}: ToastProps): ReactElement | null {
  /** 内部出场触发：计时到点 ⇒ `true`。父级 `open=false` **不经过它**（见 @ai-context 边界②） */
  const [closing, setClosing] = useState(false);
  /** 「退场结束后要不要回调」：计时到点那一刻**置位**、回调时**消费掉** ⇒ 恰好一次 */
  const pendingDismissRef = useRef(false);
  /** 自动消失计时器（显示期至多一个；见边界③「不排队」） */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 上一帧的 `message` / `kind`：显示中变化 = 接管（见边界③） */
  const shownRef = useRef<{ message: ReactNode; kind: ToastKind }>({ message, kind });

  const presence = usePresence(open && !closing, { exitMs: EXIT_MS });

  const clearTimer = useCallback((): void => {
    const timer = timerRef.current;
    if (timer !== null) {
      clearTimeout(timer);
      timerRef.current = null;
    }
  }, []);

  /** 重新计时（幂等：先清再排 ⇒ 接管不会留下堆积的定时器） */
  const restartTimer = useCallback((): void => {
    clearTimer();
    if (durationMs <= 0) return; // 见边界④：不自动消失
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingDismissRef.current = true; // 这次退场由计时引起 ⇒ 结束后要回调
      setClosing(true);
    }, durationMs);
  }, [clearTimer, durationMs]);

  // ① 新会话复位（`open` 变 true）：清走上一轮的退场触发、待回调，并重取 message/kind 基线
  //    —— 故意不依赖 message/kind：与 open 同时变化的 message 是新会话的内容，不是"接管"。
  useEffect(() => {
    if (!open) return;
    shownRef.current = { message, kind };
    pendingDismissRef.current = false;
    setClosing(false);
  }, [open]);

  // ② 显示中 message / kind 变化 ⇒ 接管：作废待回调、取消出场（退场中 ⇒ 回 entered）、重新计时
  useEffect(() => {
    if (!open) return;
    const shown = shownRef.current;
    if (shown.message === message && shown.kind === kind) return;
    shownRef.current = { message, kind };
    pendingDismissRef.current = false;
    setClosing(false);
    restartTimer();
  }, [open, message, kind, restartTimer]);

  // ③ 进入 entered 才开始计时（边界①）；离开 entered（退场）时清掉显示期计时器
  useEffect(() => {
    if (presence.phase !== "entered") return;
    restartTimer();
    return clearTimer;
  }, [presence.phase, restartTimer, clearTimer]);

  // ④ 退场结束 ⇒ 回调**恰好一次**（父级 open=false 的退场没有置位 ⇒ 不回调）
  useEffect(() => {
    if (presence.mounted || !pendingDismissRef.current) return;
    pendingDismissRef.current = false;
    onDismiss();
  }, [presence.mounted, onDismiss]);

  // ⑤ 卸载清理：cleanup 里**直接读 ref**（快照 ref = 死守卫，先例 useTransientToast.tsx:45-50）
  useEffect(
    () => () => {
      const timer = timerRef.current;
      if (timer !== null) clearTimeout(timer);
    },
    [],
  );

  if (!presence.mounted) return null;

  return (
    <div
      className={`ed-toast ed-toast--${kind}`}
      role="status"
      aria-live={kind === "err" ? "assertive" : "polite"}
      data-phase={presence.phase}
      data-kind={kind}
      style={{ zIndex: zIndex("toast") }}
      data-testid={testId}
      onTransitionEnd={presence.onTransitionEnd}
    >
      <Text size={4} tone={TONE_BY_KIND[kind]}>
        {message}
      </Text>
      {action ? (
        <Button
          variant="ghost"
          size="sm"
          className="ed-toast-action"
          onClick={action.onClick}
          testId={testId ? `${testId}-action` : undefined}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
