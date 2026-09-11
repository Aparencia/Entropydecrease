// @vitest-environment jsdom
/**
 * @ai-context Modal.test.tsx —— 弹层唯一实现的契约测试（批 0-D Task 7；本批缺口最大的一类）。
 *
 * Why jsdom：Modal 走 `createPortal`（需要真容器）＋ 焦点陷阱（需要 `document.activeElement`）。
 * 本文件钉住**三条全仓 0 命中的契约**（`createPortal` / `role="dialog"` / `aria-modal="true"`——
 * 改造前实测 0/0/0，recon §10）＋ ESC 的「最内层唯一响应」＋ 焦点归还。时序判据读 CSS 文本而非
 * `getComputedStyle`：`vitest.config.ts` 的 `css` 默认 false ⇒ 测试环境不加载样式表，只能按范式 C
 * 直接读实现文件（同 `tokens.drift.test.ts`）；不用 jest-dom（本仓未装），一律原生属性断言。
 *
 * 副作用：无（只挂 React 树 + 读 1 个 CSS 文件）；假计时器只用在需要推进 presence 计时的 describe。
 * ⚠️ `usePresence` 的 `enter → entered` 要等**下一个宏任务**（`ENTER_TICK_MS = 0`，为的是让出一次
 * 绘制机会）⇒ jsdom + 假计时器下必须 `vi.advanceTimersByTime(0)`，否则 `phase` 永远停在 `enter`。
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Z_TIER } from "../zIndex";
import { Modal } from "./Modal";

const HERE = dirname(fileURLToPath(import.meta.url));
const readCss = (name: string): string => readFileSync(join(HERE, name), "utf8");
const noop = (): void => undefined;

interface HostProps {
  open: boolean;
  onClose?: () => void;
  closeOnEsc?: boolean;
  closeOnOverlay?: boolean;
  tier?: "modal" | "modalNested";
  footer?: boolean;
}

/** 宿主：一个触发按钮 + 一个受控 Modal（`open` 由测试 rerender 驱动） */
function Host({ open, onClose = noop, closeOnEsc = true, closeOnOverlay = true, tier = "modal", footer = false }: HostProps) {
  return (
    <div data-testid="host">
      <button data-testid="trigger">触发</button>
      <Modal
        open={open}
        onClose={onClose}
        title="标题文本"
        size="m"
        tier={tier}
        closeOnEsc={closeOnEsc}
        closeOnOverlay={closeOnOverlay}
        testId="m"
        footer={footer ? <button data-testid="ok">确定</button> : undefined}
      >
        正文内容
      </Modal>
    </div>
  );
}

const panel = (): HTMLElement => screen.getByRole("dialog");
const panelOrNull = (): Element | null => document.body.querySelector('[role="dialog"]');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("三条全仓 0→1 的契约", () => {
  it("createPortal：弹层离开原 React 容器，直挂 document.body（否则祖先的 overflow/z-index 会吃掉它）", () => {
    const { container } = render(<Host open />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByTestId("m-overlay").parentElement).toBe(document.body);
  });

  it('role="dialog" + aria-modal="true" 成对出现（改造前全仓 0 命中，recon §10）', () => {
    render(<Host open />);
    expect(panel().tagName).toBe("DIV");
    expect(panel().getAttribute("aria-modal")).toBe("true");
  });

  it("aria-labelledby 指向的节点文本 === title（不硬编码 useId 的值）", () => {
    render(<Host open />);
    const id = panel().getAttribute("aria-labelledby");
    expect(id, "缺 aria-labelledby ⇒ 读屏只会念「对话框」").toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toBe("标题文本");
  });

  it("不 open 时不渲染：queryByTestId 为 null 且 body 里没有 portal 节点", () => {
    render(<Host open={false} />);
    expect(screen.queryByTestId("m-overlay")).toBeNull();
    expect(panelOrNull()).toBeNull();
  });
});

describe("关闭路径", () => {
  it("ESC → onClose（监听挂在 document、冒泡相）", () => {
    const onClose = vi.fn();
    render(<Host open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closeOnEsc=false ⇒ 不关闭；长按 ESC（repeat）也不重复触发", () => {
    const off = vi.fn();
    const { unmount } = render(<Host open onClose={off} closeOnEsc={false} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(off).not.toHaveBeenCalled();
    unmount();

    const onClose = vi.fn();
    render(<Host open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape", repeat: true });
    expect(onClose, "自动重复的 keydown 不得连关多层").not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("遮罩 mouseDown → onClose；面板内 mouseDown 不触发（防「面板内按下、遮罩上松开」误关）", () => {
    const onClose = vi.fn();
    render(<Host open onClose={onClose} />);
    fireEvent.mouseDown(panel());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId("m-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closeOnOverlay=false ⇒ 点遮罩不关闭；关闭按钮 → onClose", () => {
    const onClose = vi.fn();
    render(<Host open onClose={onClose} closeOnOverlay={false} />);
    fireEvent.mouseDown(screen.getByTestId("m-overlay"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("m-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("最上层消费：拦住仍挂在 window 上的旧 ESC 监听（仓内 19 处手写弹层全在 window）", () => {
    const legacy = vi.fn();
    const onClose = vi.fn();
    window.addEventListener("keydown", legacy);
    render(<Host open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Tab" }); // 前提：jsdom 的事件确实从 document 冒到 window
    expect(legacy, "前提不成立则本用例空转（Tab 不被 Modal 消费）").toHaveBeenCalledTimes(1);
    legacy.mockClear();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(legacy, "弹层必须消费掉这一次 ESC，不能同时关掉下层的旧面板").not.toHaveBeenCalled();
    window.removeEventListener("keydown", legacy);
  });
});

describe("进出场（[data-phase] 三态 + 卸载时机）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const tick = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };

  it("打开：先 'enter'（CSS 起点），下一宏任务才转 'entered' 触发 transition", () => {
    render(<Host open />);
    expect(panel().getAttribute("data-phase")).toBe("enter");
    expect(screen.getByTestId("m-overlay").getAttribute("data-phase")).toBe("enter");
    tick(0);
    expect(panel().getAttribute("data-phase")).toBe("entered");
  });

  it("关闭：先 'exit' 且仍挂载；兜底窗口（160+80）到点才卸载 ——「关不掉的弹层」防线", () => {
    const { rerender } = render(<Host open />);
    tick(0);
    rerender(<Host open={false} />);
    expect(panel().getAttribute("data-phase")).toBe("exit");
    tick(239);
    expect(panelOrNull(), "兜底窗口未到不得卸载").not.toBeNull();
    tick(1);
    expect(panelOrNull()).toBeNull();
  });

  it("面板收到本节点 transitionend ⇒ 立即卸载（不等兜底）", () => {
    const { rerender } = render(<Host open />);
    tick(0);
    rerender(<Host open={false} />);
    const el = panel();
    fireEvent.transitionEnd(el, { target: el, currentTarget: el });
    expect(panelOrNull()).toBeNull();
  });

  it("可中断/可反向：出场期间 open 回 true ⇒ 不卸载且直回 'entered'（不重播进场）", () => {
    const { rerender } = render(<Host open />);
    tick(0);
    rerender(<Host open={false} />);
    rerender(<Host open />);
    expect(panel().getAttribute("data-phase")).toBe("entered");
    tick(10_000);
    expect(panelOrNull(), "退场兜底计时器必须已被接管").not.toBeNull();
  });
});

describe("焦点（无障碍优先于动效，§8.6.1 第 4 条）", () => {
  it("打开时焦点进入面板（首个可聚焦元素 = 关闭按钮）", () => {
    render(<Host open />);
    expect(document.activeElement).toBe(screen.getByTestId("m-close"));
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  it("关闭时焦点归还触发元素（§5.2 能力②）", () => {
    const { rerender } = render(<Host open={false} />);
    screen.getByTestId("trigger").focus();
    rerender(<Host open />);
    expect(document.activeElement).toBe(screen.getByTestId("m-close"));
    rerender(<Host open={false} />);
    expect(document.activeElement).toBe(screen.getByTestId("trigger"));
  });

  it("Tab 在面板内循环：末元素回卷首元素、Shift+Tab 反向回卷（jsdom 无原生 Tab 导航）", () => {
    render(<Host open footer />);
    const close = screen.getByTestId("m-close");
    const ok = screen.getByTestId("ok");
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(ok);
  });
});

describe("z-index（出生即用标尺，规格 §4.2①）", () => {
  it("tier 决定遮罩的 zIndex（modal / modalNested），不得写裸数字", () => {
    const first = render(<Host open tier="modal" />);
    expect(screen.getByTestId("m-overlay").style.zIndex).toBe(String(Z_TIER.modal));
    first.unmount();
    render(<Host open tier="modalNested" />);
    expect(screen.getByTestId("m-overlay").style.zIndex).toBe(String(Z_TIER.modalNested));
  });
});

describe("ESC 优先级：最内层唯一响应（与仓内「菜单优先」退出链同语义）", () => {
  /** 两层在**同一次提交**里挂载（最苛刻的情形：effect 自底向上跑，入栈序会把外层当栈顶） */
  function Nested({ inner, onOuter, onInner }: { inner: boolean; onOuter: () => void; onInner: () => void }) {
    return (
      <Modal open onClose={onOuter} title="外层" testId="outer" tier="modal">
        <Modal open={inner} onClose={onInner} title="内层" testId="inner" tier="modalNested">
          内层正文
        </Modal>
      </Modal>
    );
  }

  it("两层同开时一次 ESC 只关内层；内层关上后 ESC 才轮到外层", () => {
    const onOuter = vi.fn();
    const onInner = vi.fn();
    const { rerender } = render(<Nested inner onOuter={onOuter} onInner={onInner} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(onOuter, "一次 ESC 只许关一层（仓内退出链语义）").not.toHaveBeenCalled();
    rerender(<Nested inner={false} onOuter={onOuter} onInner={onInner} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOuter, "内层出栈后外层必须重新成为唯一响应者").toHaveBeenCalledTimes(1);
    expect(onInner, "已关闭的内层不得被再次触发").toHaveBeenCalledTimes(1);
  });
});

describe("进出场时序：出场比进场快（规格 §8.4「弹层 200/160」）", () => {
  /** 取一条 CSS 规则原文（到第一个 `}` 为止；transition 值里没有花括号） */
  const ruleText = (selector: string): string => {
    const css = readCss("Modal.css");
    const start = css.indexOf(selector);
    expect(start, `Modal.css 缺少规则「${selector}」`).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf("}", start) + 1);
  };

  it("遮罩与面板：进场用 in(200)、出场用 out(160)，兜底字面量与变量同名同值", () => {
    expect(ruleText(".ed-modal-overlay {")).toContain("var(--ed-dur-overlay-in, 200ms)");
    expect(ruleText('.ed-modal-overlay[data-phase="exit"]')).toContain(
      "transition-duration: var(--ed-dur-overlay-out, 160ms)",
    );
    expect(ruleText('.ed-modal[data-phase="exit"]')).toContain("transition-duration: var(--ed-dur-overlay-out, 160ms)");
  });

  it("fallback 字面量：出场 160 < 进场 200（「出场比进场快」的机器判据）", () => {
    const css = readCss("Modal.css");
    const inMs = Number(/var\(--ed-dur-overlay-in,\s*(\d+)ms\)/.exec(css)?.[1] ?? "0");
    const outMs = Number(/var\(--ed-dur-overlay-out,\s*(\d+)ms\)/.exec(css)?.[1] ?? "0");
    expect(inMs).toBe(200);
    expect(outMs).toBe(160);
    expect(outMs, "出场必须比进场快").toBeLessThan(inMs);
  });

  it("面板的 opacity 与 transform 等时长（presence 以首个 transitionend 收尾，不等长会提前摘掉）", () => {
    const base = ruleText(".ed-modal {");
    expect(base.match(/var\(--ed-dur-overlay-in, 200ms\)/g) ?? []).toHaveLength(2);
    expect(base, "退出时长只许出现在 [data-phase='exit'] 规则里").not.toContain("--ed-dur-overlay-out");
  });
});
