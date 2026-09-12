// @vitest-environment jsdom
/**
 * @ai-context Toast.placement.test.tsx —— `Toast` 的**位置档**契约（批 4 Task 3；B6 特殊条款）。
 *
 * Why（这条判据为什么存在）：`App.tsx:509` 的 AI toast 需要 `top: "calc(var(--ed-nav-h) + 8px)"`，
 * 而 `--ed-nav-h` 是**壳层 token**（`ui/tokens.css:73`），L1 原语**结构上读不到**它 ⇒ 迁移时唯一
 * 「改调用点」的走法是行内 `style` 覆盖类语义，而 ADR-033 §4 **逐字禁止**。B6 因此给了特殊条款：
 * 允许改原语，**只许加一个具名、有文档的 prop**（`placement`），且实现**走类**不走行内 `style`。
 *
 * 五条判据（对计划 Task 3 Step 1 的 ①–⑤ 逐条）：
 *   ① 默认档（`viewport`）**不产生**修饰类 —— 精确类名断言：默认档多一个类会立刻红
 *      （先例 `EmptyState.test.tsx:79` 的 `toBe` 形态）；
 *   ② `placement="belowNav"` ⇒ 类名含 `ed-toast--below-nav`；
 *   ③ **容器上没有行内 `top`**（两种档位都判）—— 防"用行内 style 绕过类语义"（ADR-033 §4）；
 *   ④ `Toast.css` 里该修饰类的 `top` **消费 `var(--ed-nav-h…)`**，且 `bottom: auto` 一并落位
 *      —— **读文件判，不是读 DOM**（jsdom 不排版，DOM 侧永远看不到"其实没生效"）；
 *   ⑤ 三档 `kind` × 两档 `placement` 的**笛卡尔积**类名逐字固定。
 *
 * 副作用：只挂 React 树 + 只读同目录 `Toast.css`（不写文件、不发请求）。
 * 边界：本仓未装 jest-dom ⇒ 一律 `getAttribute` / `className` / `style.top`；
 * ④ 判的是**文本**（`var()` 的真值解析在浏览器里，jsdom 不做）—— 故 ④ 额外带一个**反例样本**，
 * 证明该正则抓得到"写死 64px"的回归（否则它只是一条永真的字符串包含）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";
import type { ToastKind, ToastPlacement } from "./Toast";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(HERE, file), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** 取 `.ed-toast--below-nav` 规则体（`选择器 {` 到第一个 `}`）—— 防「写在别的规则里也算过」 */
const CSS = stripComments(read("Toast.css"));
const BELOW_NAV_BODY = (() => {
  const at = CSS.indexOf(".ed-toast--below-nav");
  return at < 0 ? "" : CSS.slice(at, CSS.indexOf("}", at));
})();

/** 位置档的 `top` 判据本体（抽成常量：反例样本要用**同一条**正则，否则证明不了它有区分度） */
const TOKEN_TOP = /top:\s*calc\(\s*var\(--ed-nav-h/;

const noop = (): void => {};

function Host({ kind, placement }: { kind?: ToastKind; placement?: ToastPlacement }) {
  return (
    <Toast open message="已保存" kind={kind} placement={placement} onDismiss={noop} testId="toast" />
  );
}

const toast = (): HTMLElement => screen.getByTestId("toast");
const cls = (el: Element): string => el.getAttribute("class") ?? "";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("① 默认档不产生修饰类（精确类名断言）", () => {
  it("不传 placement ⇒ `ed-toast ed-toast--info`，且不含 below-nav", () => {
    render(<Host />);
    expect(cls(toast())).toBe("ed-toast ed-toast--info");
    expect(cls(toast())).not.toContain("below-nav");
  });
});

describe("② belowNav 档 ⇒ 修饰类", () => {
  it("placement=\"belowNav\" ⇒ 类名含 `ed-toast--below-nav`（基类与 kind 档仍在）", () => {
    render(<Host placement="belowNav" />);
    expect(cls(toast())).toContain("ed-toast--below-nav");
    expect(cls(toast())).toContain("ed-toast ed-toast--info");
  });
});

describe("③ 不许用行内 style 绕过（ADR-033 §4）", () => {
  it("两种档位的容器都没有行内 `top`（jsdom 的 style.top 为空串）", () => {
    for (const placement of ["viewport", "belowNav"] as const) {
      render(<Host placement={placement} />);
      expect(toast().style.top, `${placement} 档写了行内 top ⇒ 位置语义脱离类`).toBe("");
      expect(toast().getAttribute("style") ?? "").not.toContain("top");
      cleanup();
    }
  });
});

describe("④ 位置档的 top 消费壳层 token（读文件判；带反例样本）", () => {
  it("`.ed-toast--below-nav` 的 top 取 `var(--ed-nav-h…)`，且 bottom 归 auto（防固定定位被拉伸）", () => {
    expect(BELOW_NAV_BODY, "Toast.css 缺 `.ed-toast--below-nav` 规则").not.toBe("");
    expect(BELOW_NAV_BODY, "位置档的 top 必须消费壳层 token `--ed-nav-h`，不许写死数值").toMatch(TOKEN_TOP);
    expect(
      BELOW_NAV_BODY,
      "基类有 `bottom` ⇒ 本档不写 `bottom: auto` 时固定定位元素会被上下拉伸（观感全错）",
    ).toContain("bottom: auto");
  });

  it("判据有区分度（反例守门）：写死 `top: 64px` 的样本必须被同一条正则判否", () => {
    const mutated = ".ed-toast--below-nav {\n  top: 64px;\n  bottom: auto;\n}";
    expect(mutated).not.toMatch(TOKEN_TOP);
    expect(mutated).toContain("bottom: auto"); // 反例只在 top 上变异 ⇒ 证明 ④ 的两条各自能红
  });
});

describe("⑤ 三档 kind × 两档 placement 的笛卡尔积", () => {
  it("6 种组合的类名逐字固定（默认档不附加类，belowNav 只在末位多一个）", () => {
    for (const kind of ["info", "ok", "err"] as const) {
      for (const placement of ["viewport", "belowNav"] as const) {
        render(<Host kind={kind} placement={placement} />);
        const expected = ["ed-toast", `ed-toast--${kind}`, placement === "belowNav" ? "ed-toast--below-nav" : ""]
          .filter(Boolean)
          .join(" ");
        expect(cls(toast())).toBe(expected);
        cleanup();
      }
    }
  });
});
