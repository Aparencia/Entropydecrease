// @vitest-environment jsdom
/**
 * @ai-context EmptyState.align.test.tsx —— `EmptyState` 的**对齐档**契约（批 4 Task 3；B6）。
 *
 * Why（这条判据为什么存在）：`EmptyStateProps` 逐字**不加** `className` / `style`（`EmptyState.tsx`
 * 边界①：空态是「一处的形态」），而现存 **44 处**空态普遍带内联排版 —— 其中 `textAlign` /
 * `alignItems` 是**基类形态（居中）表达不了**的那部分（实测：44 处里 `alignItems: flex-start`
 * 2 处、`textAlign: center` 2 处；见 T3 报告 §实测）。B6 因此只授权开**一个受控的排版档位/布局槽**
 * （`align`），**不许**放开裸 `className`（那会把「一处改对所有地方」重新打散）。
 *
 * 四条判据（对计划 Task 3 Step 1 的 ①–④ 逐条）：
 *   ① 默认 `center` 不产生修饰类 —— **精确类名断言**（先例 `EmptyState.test.tsx:79` 就是 `toBe`：
 *      默认档多一个字都会红）；
 *   ② `align="start"` ⇒ 类名精确为 `ed-empty ed-empty--start ed-empty-enter`；
 *   ③ 根元素在两种档位下都**没有** `style` 属性 —— 防"用行内 style 绕过类语义"（ADR-033 §4）；
 *   ④ 图标 / 标题 / 说明 / 动作四个槽在两种对齐下都渲染（对齐档不改变槽位结构）。
 *
 * ② 另判 `EmptyState.css` 的修饰类**内容**（`align-items` + `text-align`）并带反例样本：
 * `style-contract.test.ts` 的全枚举只判「规则存在」，一条空的 `{}` 也能过 —— 那正是"新档位忘了写
 * 排版"的静默失效面。
 *
 * 副作用：只挂 React 树 + 只读同目录 `EmptyState.css`。边界：本仓未装 jest-dom ⇒ 原生 DOM API。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import type { EmptyStateAlign } from "./EmptyState";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(HERE, file), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");

const CSS = stripComments(read("EmptyState.css"));
/** 取 `.ed-empty--start` 的规则体（`选择器 {` 到第一个 `}`）—— 防「写在别的规则里也算过」 */
const START_BODY = (() => {
  const at = CSS.indexOf(".ed-empty--start");
  return at < 0 ? "" : CSS.slice(at, CSS.indexOf("}", at));
})();

const ACTION = { label: "新建第一篇笔记", onClick: (): void => {} } as const;

function renderAt(align?: EmptyStateAlign): HTMLElement {
  const { container } = render(
    <EmptyState
      title="还没有笔记"
      description="去「课堂助手」开始实时捕获"
      icon="notes"
      action={ACTION}
      align={align}
    />,
  );
  const el = container.firstElementChild;
  if (!el) throw new Error("EmptyState 没有渲染出任何元素");
  return el as HTMLElement;
}

describe("① 默认档 center = 基类形态（不加修饰类）", () => {
  it("不传 align ⇒ `ed-empty ed-empty-enter`，且不含 `--start`", () => {
    const root = renderAt();
    expect(root.className).toBe("ed-empty ed-empty-enter");
    expect(root.className).not.toContain("ed-empty--start");
  });
});

describe("② align=\"start\" ⇒ 修饰类 + CSS 内容（带反例样本）", () => {
  it("类名精确为 `ed-empty ed-empty--start ed-empty-enter`（compact 之后、enter 之前）", () => {
    expect(renderAt("start").className).toBe("ed-empty ed-empty--start ed-empty-enter");
  });

  it("`.ed-empty--start` 的规则体给出两项对齐；反例样本证明这两条各自能红", () => {
    expect(START_BODY, "EmptyState.css 缺 `.ed-empty--start` 规则").not.toBe("");
    expect(START_BODY, "缺横向对齐（align-items）").toContain("align-items: flex-start");
    expect(START_BODY, "缺文本对齐（text-align）").toContain("text-align: start");
    // 反例守门：一条只写了 align-items 的规则必须**不满足**上面第二条（否则该断言是永真）
    const mutated = ".ed-empty--start {\n  align-items: flex-start;\n}";
    expect(mutated).toContain("align-items: flex-start");
    expect(mutated).not.toContain("text-align: start");
  });
});

describe("③ 视觉只走类：根元素两种档位下都没有 style 属性（ADR-033 §4）", () => {
  it("`getAttribute(\"style\")` 恒为 null（默认档与 start 档）", () => {
    expect(renderAt().getAttribute("style")).toBeNull();
    expect(renderAt("start").getAttribute("style")).toBeNull();
  });
});

describe("④ 四个槽位在两种对齐下都渲染（对齐档不改结构）", () => {
  it("icon / title / description / action 的锚点在 center 与 start 下都各出现一次", () => {
    for (const align of ["center", "start"] as const) {
      const root = renderAt(align);
      expect(root.querySelectorAll(".ed-empty__icon"), `${align}：图标槽`).toHaveLength(1);
      expect(root.querySelectorAll(".ed-empty__title"), `${align}：标题槽`).toHaveLength(1);
      expect(root.querySelectorAll(".ed-empty__description"), `${align}：说明槽`).toHaveLength(1);
      expect(root.querySelectorAll("button"), `${align}：主行动`).toHaveLength(1);
      expect(root.querySelector(".ed-empty__title")?.textContent).toBe("还没有笔记");
    }
  });
});
