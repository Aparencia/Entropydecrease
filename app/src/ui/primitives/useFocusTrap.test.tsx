// @vitest-environment jsdom
/**
 * @ai-context useFocusTrap.test.tsx —— 焦点陷阱的契约测试（批 0-D Task 7；T8 `ConfirmDialog` 复用）。
 *
 * Why jsdom：契约本体就是 `document.activeElement` 的搬移与 `keydown` 拦截，必须有真 DOM 与焦点模型。
 * ⚠️ jsdom **不实现 Tab 导航**（没有任何"浏览器默认行为"），所以"Tab 循环"只能靠我们自己
 * `preventDefault()` + `.focus()` —— 这既是实现方式也是本文件能把契约钉死的原因。
 *
 * 副作用：无（不装假计时器：焦点搬移是同步的）。每个用例后 `cleanup()` —— 本仓 vitest 未开
 * `globals`，`@testing-library/react` 的自动清理不会注册（同 `usePresence.test.tsx` 的写法）。
 * 边界：只断言「焦点在谁身上」与「Tab 是否被拦截」；不做 `offsetParent` 布局断言（jsdom 无布局引擎，
 * 见 `useFocusTrap.ts` 的 `hasLayoutEngine` 探针注释）。
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FOCUSABLE_SELECTOR, focusablesIn, useFocusTrap } from "./useFocusTrap";

/** 被测面板：真实 `<div tabIndex={-1}>`（与 `Modal` 的面板同形） */
function Panel({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(active, ref);
  return (
    <div data-testid="panel" tabIndex={-1} ref={ref}>
      {children}
    </div>
  );
}

/** 派发一个可取消的 Tab（返回值 = 是否被 `preventDefault()` 吃掉） */
function dispatchTab(shiftKey = false): boolean {
  const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}

const activeId = (): string | null => document.activeElement?.getAttribute("data-testid") ?? null;

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("FOCUSABLE_SELECTOR / focusablesIn（T8 也会消费的契约）", () => {
  it("选择器串逐字固定：真实可聚焦元素 + 非 -1 的 tabindex", () => {
    expect(FOCUSABLE_SELECTOR).toContain("a[href]");
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });

  it("按文档序返回，且排除 disabled / tabindex=-1 / hidden / aria-hidden / input[type=hidden]", () => {
    render(
      <div data-testid="root">
        <button data-testid="a">A</button>
        <button data-testid="b" disabled>
          B
        </button>
        <input data-testid="c" type="hidden" />
        <a data-testid="d" href="#x">
          D
        </a>
        <span data-testid="e" tabIndex={0}>
          E
        </span>
        <span data-testid="f" tabIndex={-1}>
          F
        </span>
        <button data-testid="g" hidden>
          G
        </button>
        <button data-testid="h" aria-hidden="true">
          H
        </button>
      </div>,
    );
    expect(focusablesIn(screen.getByTestId("root")).map((el) => el.getAttribute("data-testid"))).toEqual([
      "a",
      "d",
      "e",
    ]);
  });

  it("内联 display:none 的元素被排除（jsdom 能读到内联样式；样式表内的规则读不到，见报告）", () => {
    render(
      <div data-testid="root">
        <button data-testid="a">A</button>
        <button data-testid="b" style={{ display: "none" }}>
          B
        </button>
        <button data-testid="c" style={{ visibility: "hidden" }}>
          C
        </button>
      </div>,
    );
    expect(focusablesIn(screen.getByTestId("root")).map((el) => el.getAttribute("data-testid"))).toEqual(["a"]);
  });
});

describe("打开聚焦 / 关闭归还", () => {
  it("active=true：焦点给面板内第一个可聚焦元素", () => {
    render(
      <Panel active>
        <button data-testid="a">A</button>
        <button data-testid="b">B</button>
      </Panel>,
    );
    expect(activeId()).toBe("a");
  });

  it("面板内没有可聚焦元素：焦点给面板本身（面板 tabIndex=-1）", () => {
    render(
      <Panel active>
        <span>纯文本</span>
      </Panel>,
    );
    expect(document.activeElement).toBe(screen.getByTestId("panel"));
  });

  it("active=false：焦点归还打开前的元素（document.contains 守卫）", () => {
    const { rerender } = render(
      <>
        <button data-testid="out">外部</button>
        <Panel active={false}>
          <button data-testid="a">A</button>
        </Panel>
      </>,
    );
    screen.getByTestId("out").focus();
    rerender(
      <>
        <button data-testid="out">外部</button>
        <Panel active>
          <button data-testid="a">A</button>
        </Panel>
      </>,
    );
    expect(activeId()).toBe("a");
    rerender(
      <>
        <button data-testid="out">外部</button>
        <Panel active={false}>
          <button data-testid="a">A</button>
        </Panel>
      </>,
    );
    expect(activeId(), "关闭必须把焦点还给触发元素（§5.2 能力②）").toBe("out");
  });

  it("原元素已不在文档：归还被跳过（不把焦点硬塞给已摘除的节点）且不抛错", () => {
    const { rerender } = render(
      <>
        <button data-testid="out">外部</button>
        <Panel active={false}>
          <button data-testid="a">A</button>
        </Panel>
      </>,
    );
    const out = screen.getByTestId("out");
    out.focus();
    rerender(
      <>
        <button data-testid="out">外部</button>
        <Panel active>
          <button data-testid="a">A</button>
        </Panel>
      </>,
    );
    rerender(
      <Panel active={false}>
        <button data-testid="a">A</button>
      </Panel>,
    );
    expect(document.activeElement).not.toBe(out);
    expect(activeId()).not.toBe("out");
  });
});

describe("Tab 循环（jsdom 无原生 Tab 导航 ⇒ 一律 preventDefault + 手动 focus）", () => {
  it("前进 / 末元素回卷 / Shift+Tab 反向回卷，且都被 preventDefault 吃掉", () => {
    render(
      <Panel active>
        <button data-testid="a">A</button>
        <button data-testid="b">B</button>
        <button data-testid="c">C</button>
      </Panel>,
    );
    expect(activeId()).toBe("a");
    expect(dispatchTab(), "Tab 必须被拦截（否则焦点会离开弹层）").toBe(true);
    expect(activeId()).toBe("b");
    expect(dispatchTab()).toBe(true);
    expect(activeId()).toBe("c");
    expect(dispatchTab(), "末元素 Tab 回卷到首元素").toBe(true);
    expect(activeId()).toBe("a");
    expect(dispatchTab(true), "首元素 Shift+Tab 回卷到末元素").toBe(true);
    expect(activeId()).toBe("c");
    expect(dispatchTab(true)).toBe(true);
    expect(activeId()).toBe("b");
  });

  it("active=false 后监听器已摘除：Tab 不再被拦截（cleanup 生效）", () => {
    const { rerender } = render(
      <Panel active>
        <button data-testid="a">A</button>
      </Panel>,
    );
    expect(dispatchTab()).toBe(true);
    rerender(
      <Panel active={false}>
        <button data-testid="a">A</button>
      </Panel>,
    );
    expect(dispatchTab(), "卸载/关闭后不得再吃 Tab").toBe(false);
  });

  it("嵌套：焦点在另一个陷阱内时本层不抢 Tab（只由持焦点的那层管）", () => {
    render(
      <>
        <Panel active>
          <button data-testid="outer-a">OA</button>
          <button data-testid="outer-b">OB</button>
        </Panel>
        <Panel active>
          <button data-testid="inner-a">IA</button>
          <button data-testid="inner-b">IB</button>
        </Panel>
      </>,
    );
    // 后激活的陷阱持焦点（= 更内层）
    expect(activeId()).toBe("inner-a");
    dispatchTab();
    expect(activeId(), "外层陷阱不得把焦点抢回外层面板").toBe("inner-b");
    dispatchTab();
    expect(activeId()).toBe("inner-a");
  });
});
