// @vitest-environment jsdom
/**
 * @ai-context Toast.test.tsx —— Toast 的**渲染与计时契约**（批 0-D Task 9；规格 §5.3 · §8.4）。
 *
 * 语义边界：本文件管「一条 toast 的正常生命周期」—— 渲染与语义 → 自动消失 → 退场 → 卸载
 * （含 reduced-motion 直跳终态）。**接管与外部关闭**（出场中被新消息打断、父级 `open=false`
 * 的归属、多条并存）在同目录 `Toast.interrupt.test.tsx` —— 两份都留在「新文件 ≤300 行」红线内。
 * 样式文本判据（180/140 · 不 animate height）在 `Toast.style.test.ts`（node 环境）。
 *
 * Why jsdom + 假计时器：本原语的契约就是「什么时候还在 / 什么时候摘掉 / 回调几次」，三件事
 * 只在实际挂载 + 受控时钟下可判。★ 时序陷阱（T6 实测）：`usePresence` 的 `enter → entered` 走
 * `setTimeout(…, 0)`（ENTER_TICK_MS）⇒ **必须推一次 0ms**，否则永远停在 `enter`、现象酷似
 * hook 有 bug —— 本文件统一用 `settle()` 迈过它。
 *
 * 副作用：只挂 React 树（不写文件、不发请求、不读 store）。
 * 边界：本仓未装 jest-dom ⇒ 一律 `getAttribute` / `textContent` / `queryBy…`。
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Z_TIER } from "../zIndex";
import { Toast } from "./Toast";
import type { ToastProps } from "./Toast";

const noop = (): void => {};

/** 宿主 props：派生自原语契约（每个用例只关心其中几项 ⇒ `Partial` + 必需的 `open`） */
type HostProps = Partial<ToastProps> & { open: boolean };

/** 宿主：受控形态（与真实调用点一致，`open` 由测试 rerender 驱动） */
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
/** 走完 `usePresence` 的 enter → entered（0ms 宏任务）—— 不推它会永远停在 enter */
const settle = (): void => tick(0);
/** 派发一次「本节点的过渡结束」（usePresence 判 `target === currentTarget` 且 `phase === "exit"`） */
const endTransition = (el: Element = toast()): void => {
  fireEvent.transitionEnd(el, { target: el, currentTarget: el });
};
/** 造最小 `matchMedia`（本仓 jsdom 30 未实现该 API，同 `usePresence.test.tsx` 的做法） */
const reducedMotion = (): void => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    media: "",
    addEventListener: noop,
    removeEventListener: noop,
  }));
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("① 渲染与语义契约", () => {
  it("open=false 不渲染任何节点", () => {
    render(<Host open={false} />);
    expect(toastOrNull()).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("open=true：role=status + 起点 enter；推一次 0ms 后 entered（★ ENTER_TICK_MS=0）", () => {
    render(<Host open />);
    expect(toast().getAttribute("role")).toBe("status");
    expect(phase()).toBe("enter");
    settle();
    expect(phase()).toBe("entered");
  });

  it("kind=err ⇒ aria-live=assertive；info / ok ⇒ polite（唯一有资格打断屏幕阅读器的档）", () => {
    const { rerender } = render(<Host open kind="info" />);
    expect(toast().getAttribute("aria-live")).toBe("polite");
    rerender(<Host open kind="ok" />);
    expect(toast().getAttribute("aria-live")).toBe("polite");
    rerender(<Host open kind="err" />);
    expect(toast().getAttribute("aria-live")).toBe("assertive");
  });

  it("三档 kind 的类名；不传 kind 默认 info", () => {
    const { rerender } = render(<Host open />);
    expect(cls(toast())).toContain("ed-toast ed-toast--info");
    expect(toast().getAttribute("data-kind")).toBe("info");
    rerender(<Host open kind="ok" />);
    expect(cls(toast())).toContain("ed-toast--ok");
    rerender(<Host open kind="err" />);
    expect(cls(toast())).toContain("ed-toast--err");
  });

  it("层级取标尺的 toast 档（裸数字由 zIndex.guard 棘轮守）", () => {
    render(<Host open />);
    expect(toast().style.zIndex).toBe(String(Z_TIER.toast));
  });

  it("message 是 ReactNode：中文、数字与嵌套元素原样渲染", () => {
    render(
      <Host
        open
        message={
          <span>
            已删除 <b>3</b> 条
          </span>
        }
      />,
    );
    expect(toast().textContent).toBe("已删除 3 条");
    expect(toast().querySelector("b")?.textContent).toBe("3");
  });

  it("action：渲染真实 <button>，点击只调 onClick —— 不卸载、不回调 onDismiss（撤销 10s 的接缝）", () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(<Host open action={{ label: "撤销", onClick }} onDismiss={onDismiss} />);
    settle();
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDismiss, "行动槽不得自行摘掉 toast —— 由调用方的 open 决定").not.toHaveBeenCalled();
    expect(toastOrNull()).not.toBeNull();
  });

  it("无 action 时不渲染按钮", () => {
    render(<Host open />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("② 自动消失与「恰好一次 onDismiss」", () => {
  it("到点：先 exit 且仍挂载；transitionend 之后才卸载 + onDismiss 恰一次", () => {
    const onDismiss = vi.fn();
    render(<Host open durationMs={3000} onDismiss={onDismiss} />);
    settle();
    tick(2999);
    expect(phase()).toBe("entered");
    tick(1);
    expect(phase(), "到点先走出场，不直卸").toBe("exit");
    expect(toastOrNull()).not.toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
    endTransition();
    expect(toastOrNull()).toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("防重：回调只消费一次 —— 之后父级再渲染（连 onDismiss 换成新身份）也不复活", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Host open durationMs={1000} onDismiss={first} />);
    settle();
    tick(1000);
    endTransition();
    expect(first).toHaveBeenCalledTimes(1);
    rerender(<Host open durationMs={1000} onDismiss={second} />); // 新身份 ⇒ 该 effect 必然重跑
    tick(10_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second, "待回调标记是一次性的，换身份不得复活").not.toHaveBeenCalled();
  });

  it("兜底：没有 transitionend 时（reduced-motion / 属性未变化）exitMs+slack 到点强制卸载", () => {
    const onDismiss = vi.fn();
    render(<Host open durationMs={1000} onDismiss={onDismiss} />);
    settle();
    tick(1000);
    expect(phase()).toBe("exit");
    tick(140 + 80);
    expect(toastOrNull()).toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("durationMs<=0 ⇒ 不自动消失（不排计时器；推进 10s 仍挂载、零回调）", () => {
    const onDismiss = vi.fn();
    render(<Host open durationMs={0} onDismiss={onDismiss} />);
    settle();
    expect(vi.getTimerCount()).toBe(0);
    tick(10_000);
    expect(phase()).toBe("entered");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("durationMs 变化 ⇒ 重新计时（旧排期不再生效）", () => {
    const { rerender } = render(<Host open durationMs={5000} />);
    settle();
    tick(1000);
    rerender(<Host open durationMs={10_000} />);
    tick(5000); // t=6000：旧排期（t=5000）若还在，此刻应已 exit
    expect(phase(), "旧的 5000ms 排期必须已被接管").toBe("entered");
    tick(5000); // t=11000 = 接管点 + 新排期 10000
    expect(phase()).toBe("exit");
  });
});

describe("③ 卸载清理与 reduced-motion（§8.6.1 第 4 条：无障碍优先于「活」）", () => {
  it("卸载即清计时器（cleanup 里直接读 ref，不留死守卫）", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Host open durationMs={1000} onDismiss={onDismiss} />);
    settle();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount(), "cleanup 必须清掉挂起的自动消失计时器").toBe(0);
    tick(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("reduced-motion：关闭直跳终态（不靠 transitionend），onDismiss 仍恰好一次", () => {
    reducedMotion();
    const onDismiss = vi.fn();
    render(<Host open durationMs={500} onDismiss={onDismiss} />);
    tick(500);
    expect(toastOrNull(), "没有 transitionend 也必须能摘掉（「关不掉的 toast」防线）").toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
