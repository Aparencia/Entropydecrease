// @vitest-environment jsdom
/**
 * @ai-context Toast.interrupt.test.tsx —— Toast 的**接管与关闭权归属**（批 0-D Task 9；规格 §8.6.1 第 3 条）。
 *
 * 语义边界：本文件管「一条 toast 的非常规路径」——
 *   ① **出场中被新消息打断** ⇒ 取消出场、回到 `entered`（不重放进场）、旧退场不再卸载；
 *   ② **不排队**：连续改 message 时至多一个计时器、DOM 里始终只有一条（§8.6.1 第 3 条
 *      「下一个输入要能接管当前动效，不排队」的机器判据）；
 *   ③ **关闭权归属**：父级 `open=false` 是父级已知情的决定 ⇒ 退场结束后**不得**回调 `onDismiss`；
 *   ④ **多条并存**：彼此独立、不共用模块级状态（本原语不做队列/堆栈 —— 堆叠偏移是批 6 的 CSS 接缝）。
 * 「正常生命周期」（渲染/计时/卸载/reduced-motion）在同目录 `Toast.test.tsx`，两份都 ≤300 行；
 * 样式文本判据在 `Toast.style.test.ts`（node 环境）。
 *
 * 副作用：只挂 React 树（不写文件、不发请求、不读 store）。
 * 边界：本仓未装 jest-dom ⇒ 一律 `getAttribute` / `textContent` / `queryBy…`；假计时器下
 * `usePresence` 的 `enter → entered` 需要**推一次 0ms**（`settle()`），否则永远停在 `enter`。
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";
import type { ToastProps } from "./Toast";

const noop = (): void => {};

/** 宿主 props：派生自原语契约（每个用例只关心其中几项 ⇒ `Partial` + 必需的 `open`） */
type HostProps = Partial<ToastProps> & { open: boolean };

/** 宿主：受控形态（`open` 由测试 rerender 驱动，与真实调用点一致） */
function Host(props: HostProps) {
  return (
    <Toast
      {...props}
      message={props.message ?? "已保存"}
      onDismiss={props.onDismiss ?? noop}
      testId={props.testId ?? "toast"}
    />
  );
}

const toast = (): HTMLElement => screen.getByTestId("toast");
const toastOrNull = (): Element | null => document.body.querySelector(".ed-toast");
const phase = (): string | null => toastOrNull()?.getAttribute("data-phase") ?? null;
const cls = (el: Element): string => el.getAttribute("class") ?? "";

/** 推进受控时钟（包 act：React 的状态更新必须 flush 后才可断言） */
const tick = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
/** 走完 `usePresence` 的 enter → entered（0ms 宏任务） */
const settle = (): void => tick(0);
/** 派发一次「本节点的过渡结束」（usePresence 判 `target === currentTarget` 且 `phase === "exit"`） */
const endTransition = (el: Element = toast()): void => {
  fireEvent.transitionEnd(el, { target: el, currentTarget: el });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("① 出场中被打断 ⇒ 接管（不排队、不新开一条）", () => {
  it("出场期间改 message ⇒ 回 entered、仍挂载、旧退场不再卸载（越过兜底窗口仍活着）", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Host open message="第一条" onDismiss={onDismiss} />);
    settle();
    tick(3000); // 默认 3000 到点 ⇒ exit
    expect(phase()).toBe("exit");
    rerender(<Host open message="第二条" onDismiss={onDismiss} />);
    expect(phase(), "回 entered 而不是重新进场（不闪一下）").toBe("entered");
    tick(300); // 越过退场兜底窗口（140+80）：旧退场若未被接管，此点已卸载
    expect(toastOrNull()).not.toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
    tick(2700); // t=6000 = 接管点 + 3000 ⇒ 只退场、仍不回调
    expect(phase()).toBe("exit");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("显示中改 message ⇒ 重新计时（旧排期到点不消失）", () => {
    const { rerender } = render(<Host open message="A" durationMs={3000} />);
    settle();
    tick(2000);
    rerender(<Host open message="B" durationMs={3000} />);
    tick(2000); // t=4000：旧排期（t=3000）若未重排，此刻应已 exit
    expect(phase()).toBe("entered");
    tick(1000); // t=5000 = 接管点 + 3000
    expect(phase()).toBe("exit");
  });

  it("改 kind ⇒ 同一条被接管（类名与 aria-live 随之更新，不新开）", () => {
    const { rerender } = render(<Host open kind="info" message="A" />);
    settle();
    rerender(<Host open kind="err" message="A" />);
    expect(cls(toast())).toContain("ed-toast--err");
    expect(toast().getAttribute("aria-live")).toBe("assertive");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("连续改 3 次 message：至多一个计时器、DOM 里始终只有一条 toast（不排队）", () => {
    const { rerender } = render(<Host open message="0" />);
    settle();
    expect(vi.getTimerCount(), "显示期只有自动消失这一个计时器").toBe(1);
    for (const m of ["1", "2", "3"]) {
      rerender(<Host open message={m} />);
      expect(toast().textContent).toBe(m);
      expect(vi.getTimerCount(), "接管 = 重排一个，不是排队两个").toBe(1);
    }
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("② 关闭权归属：父级 open=false 是父级已知情的决定 ⇒ 不回调", () => {
  it("直接走出场且不调 onDismiss；transitionend 后卸载", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Host open onDismiss={onDismiss} />);
    settle();
    rerender(<Host open={false} onDismiss={onDismiss} />);
    expect(phase()).toBe("exit");
    expect(toastOrNull()).not.toBeNull();
    endTransition();
    expect(toastOrNull()).toBeNull();
    tick(10_000);
    expect(onDismiss, "父级主动关闭不该收到自己刚做的决定").not.toHaveBeenCalled();
  });

  it("退场中反向 open=true ⇒ 不卸载、回 entered、零回调（可反向）", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Host open onDismiss={onDismiss} />);
    settle();
    rerender(<Host open={false} onDismiss={onDismiss} />);
    expect(phase()).toBe("exit");
    rerender(<Host open onDismiss={onDismiss} />);
    expect(phase()).toBe("entered");
    tick(300); // 越过退场兜底窗口
    expect(toastOrNull()).not.toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("③ 多条并存（堆叠的确定行为：彼此独立、不共用模块级状态）", () => {
  it("两条各自计时、各自回调：一条到点不影响另一条", () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <>
        <Toast open message="A" durationMs={1000} onDismiss={a} testId="ta" />
        <Toast open message="B" durationMs={5000} onDismiss={b} testId="tb" />
      </>,
    );
    settle();
    expect(screen.getAllByRole("status")).toHaveLength(2);
    tick(1000);
    const first = screen.getByTestId("ta");
    expect(first.getAttribute("data-phase")).toBe("exit");
    expect(screen.getByTestId("tb").getAttribute("data-phase")).toBe("entered");
    endTransition(first);
    expect(screen.queryByTestId("ta")).toBeNull();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(screen.getByTestId("tb").textContent).toBe("B");
  });
});
