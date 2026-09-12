/**
 * PhaseChrome — 壳层相变 chrome 的**宿主与两态叠层**（批 6 T19；规格 §6.3 相变态表；§8.4 / R4.4）。
 *
 * @ai-context Why：§6.3 的三态要整体换 chrome（常态 = A′ 顶栏 / 采集态 = 58px LIVE 仪表 + 域导航隐藏 /
 *   复习态 = 零 chrome）。载体有两半：`<html data-shell-phase>` 的属性通道（T17 建）与 `motion.css` 的
 *   相位块（本任务落）。本件补上第三半 —— **两态叠层的 DOM**：同一个格子里放两层
 *   （`__idle` = 调用方传入的 A′ 顶栏，`__live` = LIVE 仪表），相位块用 `opacity` 交叉淡入
 *   ⇒ **高度不参与过渡**（§8.4 逐字「相变 chrome 用绝对定位交叉淡入，**不 animate height**」）。
 *   域导航不必单独规则：域 Tab 是 A′ 顶栏的子树，整层淡出即「域导航隐藏」（一条规则同时兑现两栏）。
 *
 * @ai-context `inert` 为什么必须有：`opacity: 0` 只是**看不见** —— 被隐藏那层的按钮仍然可 Tab 聚焦、
 *   仍进无障碍树 ⇒「零 chrome」对键盘/读屏用户就是假话。`inert`（React 19 的布尔属性）把整层移出
 *   交互与无障碍树，且**是 DOM 事实**（jsdom 判得到），不像 `opacity` 那样要等浏览器级联。
 *   ⚠️ 诚实边界：`inert` 在本仓只被断言「属性在位」，真实的焦点行为（Tab 是否真的跳过）**未在真机验证**。
 *
 * @ai-context 副作用：① 写 DOM（三层 div 的类名 / `data-phase` / `inert`）；② 挂载 `LiveBarHost`
 *   ⇒ 它订阅 `live:audio-level` 并在**采集中**起一个 1s tick（不采集时不起计时器）。不读 store、不发 IPC。
 * @ai-context 边界：① 本件**只做结构**——相位 CSS 全在 `motion.css` 的相位块里（本文件零行内定位样式）；
 *   ② `phase` 由调用方（`MainShell` 经 `useShellPhaseState`）注入，**本件不自己写属性**（单一写入方）；
 *   ③ 类名三件是**跨文件契约**：`shellPhase.guard.test.ts` 拿本文件的常量与相位块的选择器做**双向闭合**，
 *   改名只改一边必红。
 */
import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCaptureControl } from "../hooks/useLiveCaptureControl";
import LiveBar from "./LiveBar";
import type { ShellPhase } from "./shellPhase";

/** 叠层容器类名（相位块的两个选择器目标都在这里；改名必须同步 `motion.css`）。 */
export const PHASE_CHROME_CLASS = "shell-phase";
/** 常态层（A′ 顶栏）类名 —— 复习/采集态被淡出 + 浮起的那一层。 */
export const PHASE_IDLE_CLASS = "shell-phase__idle";
/** 采集层（LIVE 仪表）类名 —— 采集态回到流里、其余相位浮起并透明。 */
export const PHASE_LIVE_CLASS = "shell-phase__live";

export interface PhaseChromeProps {
  /** 当前相位（来自唯一写入方 `useShellPhaseState` 的返回值 —— 与写入 `<html>` 的值**同源同帧**） */
  readonly phase: ShellPhase;
  /** 常态 chrome（A′ 顶栏）—— 由 `MainShell` 传入，本件不 import `TopBar`（保持可替换） */
  readonly children: ReactNode;
}

/**
 * 渲染相变 chrome 的两态叠层。
 *
 * 返回 `ReactElement`（= 契约里的 `JSX.Element`）：React 19 把全局 `JSX` 命名空间收进 `React.JSX`
 * （同 `LiveBar.tsx` / `Text.tsx` 先例）。
 */
export default function PhaseChrome({ phase, children }: PhaseChromeProps): ReactElement {
  return (
    <div className={PHASE_CHROME_CLASS} data-testid="phase-chrome" data-phase={phase}>
      {/* 常态层：idle 之外一律 `inert`（不可聚焦、不进无障碍树） */}
      <div className={PHASE_IDLE_CLASS} data-testid="phase-idle" inert={phase !== "idle"}>
        {children}
      </div>
      {/* 采集层：**恒挂载**（两态叠在同一格才能交叉淡入；条件挂载会让淡出变成硬切） */}
      <div className={PHASE_LIVE_CLASS} data-testid="phase-live" inert={phase !== "capture"}>
        <LiveBarHost phase={phase} />
      </div>
    </div>
  );
}

/**
 * LIVE 仪表的**接线宿主**（T18 的 `LiveBar` 在 T18 结束时 0 生产调用点 ⇒ 由本件挂载；R46② / §四十六附 2）。
 *
 * @ai-context 五个 props 的来源**逐项**（`LiveBarProps` 是 T18 的冻结快照，本件只供值、不改快照）：
 *   · `paused` = `capture.pausedReason !== null`（采集单一状态源的既有语义：null = 未暂停）
 *   · `onTogglePause` = `paused ? capture.resume() : capture.pause()`（失败文案由 context 的
 *     `CaptureActionResult.message` 承担；本件**不**自造提示——自动暂停期的「物理无变化」说明在 context 里）
 *   · `onStop` = `capture.stop()`
 *   · `onMark` = `invoke("save_user_screenshot")` —— 与 `ClassroomCapturePanel.tsx:193` 的「⭐ 标记此刻」
 *     **同一条既有命令**（壳层复用，不新建命令、不动后端）；失败只 `console.warn`（本件没有提示面，
 *     采集本身不受影响），照 `App.tsx:337` 的既有口径「不吞异常」。
 *   · `elapsedMs` = 墙钟（`Date.now() - 本次 active 起点`），**只在采集中**起 1s tick
 *     —— 与 `LiveActivityPanel.tsx:130/154/161` 的既有范式同源。
 *     ⚠️ 登记：`live_session_status` 的载荷里**没有** `started_at`（`types/live.ts:36-48` 实测）⇒ 前端
 *     只能用「自己第一次看到 active 的时刻」，与后端会话起点的毫秒级误差属后端事件面（本任务不改后端）。
 *   · `phase`（T29 追加的**可选**槽）= 本宿主从 `PhaseChrome` 拿到的同一相位值 ⇒ 往下传给 `LiveBar` 的
 *     相变凝固编排（`usePhaseFreeze`）。缺省 `"capture"`：`LiveBarHost` 单测（T19 的 C4–C6）不传它 ⇒
 *     冻结进度 0、**不建任何时间线**（相位未变），既有判据零改动。
 */
export function LiveBarHost({ phase = "capture" }: { readonly phase?: ShellPhase }): ReactElement {
  const capture = useCaptureControl();
  const active = capture.active;
  const paused = capture.pausedReason !== null;
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    setElapsedMs(0);
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [active]);

  return (
    <LiveBar
      elapsedMs={elapsedMs}
      paused={paused}
      phase={phase}
      onTogglePause={() => {
        void (paused ? capture.resume() : capture.pause());
      }}
      onMark={() => {
        void invoke<string>("save_user_screenshot").catch((e: unknown) => {
          console.warn("[PhaseChrome] 标记此刻失败（采集不受影响）:", e);
        });
      }}
      onStop={() => {
        void capture.stop();
      }}
    />
  );
}
