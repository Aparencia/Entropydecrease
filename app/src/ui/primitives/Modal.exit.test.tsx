// @vitest-environment jsdom
/**
 * @ai-context Modal.exit.test.tsx —— **退场窗口的可点性契约**（批 0-D Task 7 追加；T8 评审 I-1 的
 * 系统级修法）。
 *
 * Why：`open=false` 之后弹层仍会挂载 160ms（`[data-phase="exit"]`，`usePresence` 的出场窗口）。
 * T8 的探针实测：这个窗口里面板与遮罩**仍然可点** ⇒ 消费者（`ConfirmDialog`）的「确认 / 删除」
 * 在退场中会再触发一次回调；批 4 把 28 个手写弹层迁过来之后，这就是**删除类操作的误触面**。
 * 解法：退场相位统一 `pointer-events: none`（进场相位不动，也不用 `!important`）。
 *
 * Why 另开一个文件：`Modal.test.tsx` 已 296/300 行，而 ≤300 是硬红线（`line-limits.mjs` 扫 `app/src`）。
 *
 * Why 判据读 CSS 文本 + DOM 相位：`vitest.config.ts` 的 `css` 默认 false ⇒ 测试环境不加载样式表
 * （jsdom 也不做命中测试）⇒ `getComputedStyle` 永远读不到 `pointer-events`。故拆成两条互补断言：
 * ① 退场相位**真的**带 `data-phase="exit"` 且面板内容仍在 DOM（= 因果关系的前件）；
 * ② `[data-phase="exit"]` 规则**真的**声明了 `pointer-events: none`（= 后件）。两者缺一，本契约即断。
 *
 * 副作用：无（只挂 React 树 + 读 1 个 CSS 文件）；假计时器只在本文件的第一个用例里用。
 * 边界：不重述 `Modal.test.tsx` 已覆盖的进出场时序（`enter → entered`、兜底 240ms、可反向）。
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

const HERE = dirname(fileURLToPath(import.meta.url));
const noop = (): void => undefined;
/** 剥注释后再判据：文件头的注释里就写着"不使用 !important"（同 `style-seams.test.ts` 的口径） */
const CSS = readFileSync(join(HERE, "Modal.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** 取一条 CSS 规则的原文（到第一个 `}` 为止；transition 值里没有花括号） */
function rule(selector: string): string {
  const start = CSS.indexOf(selector);
  expect(start, `Modal.css 缺少规则「${selector}」`).toBeGreaterThanOrEqual(0);
  return CSS.slice(start, CSS.indexOf("}", start) + 1);
}

function Host({ open }: { open: boolean }) {
  return (
    <Modal open={open} onClose={noop} title="标题文本" testId="m" footer={<button data-testid="ok">确认</button>}>
      正文内容
    </Modal>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("退场窗口：相位前件（没有它，下面那组 CSS 断言就是空转）", () => {
  it("open=false 后 160ms 内面板与遮罩都带 data-phase='exit'，且面板内容仍在 DOM 里", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Host open />);
    act(() => {
      vi.advanceTimersByTime(0); // enter → entered 要等一个宏任务（见 usePresence 的 ENTER_TICK_MS）
    });
    expect(screen.getByRole("dialog").getAttribute("data-phase")).toBe("entered");
    rerender(<Host open={false} />);

    expect(screen.getByRole("dialog").getAttribute("data-phase")).toBe("exit");
    expect(screen.getByTestId("m-overlay").getAttribute("data-phase"), "遮罩是另一条规则的锚点").toBe("exit");
    expect(screen.getByTestId("ok"), "按钮仍在 DOM 里 ⇒ 没禁指针事件时它真的可点").not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(239); // 兜底窗口未到 ⇒ 仍在退场相位
    });
    expect(screen.getByRole("dialog").getAttribute("data-phase")).toBe("exit");
  });
});

describe("退场相位禁指针事件（面板 + 遮罩各一条，进场相位不动）", () => {
  it("两条 exit 规则都声明 pointer-events: none", () => {
    expect(rule('.ed-modal-overlay[data-phase="exit"]')).toContain("pointer-events: none;");
    expect(rule('.ed-modal[data-phase="exit"]')).toContain("pointer-events: none;");
  });

  it("反例守门：进场相位（enter / entered）不得出现 pointer-events（否则弹层一开始就点不动）", () => {
    expect(rule('.ed-modal-overlay[data-phase="enter"]')).not.toContain("pointer-events");
    expect(rule('.ed-modal[data-phase="enter"]')).not.toContain("pointer-events");
    expect(rule('.ed-modal[data-phase="entered"]')).not.toContain("pointer-events");
    expect(rule(".ed-modal-overlay {")).not.toContain("pointer-events");
    expect(rule(".ed-modal {")).not.toContain("pointer-events");
  });

  it("Modal.css 里 pointer-events 恰好出现 2 次（只在两条 exit 规则里），且全文件无 !important", () => {
    expect(CSS.match(/pointer-events/g) ?? []).toHaveLength(2);
    expect(CSS).not.toContain("!important");
  });
});
