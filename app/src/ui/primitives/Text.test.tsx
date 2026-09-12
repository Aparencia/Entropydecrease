// @vitest-environment jsdom
/**
 * @ai-context Text.test.tsx — L1 原语 `Text` 的接口契约（批 0-D Task 3）。
 *
 * Why：`Text` 是「墨度 × 字阶」的**唯一出口**，它产出的类名（`.ed-text--s4` / `.ed-text--ink-2` …）
 * 是**跨批次的公共契约** —— 批 4 的迁移与批 6 的动效都按这些类名挂接。所以本文件钉的是
 * 「标签语义 + 类名集合」，而不是 HTML 快照（快照会把无意义的 DOM 细节也变成契约）。
 * 类名与 CSS 的一致性由同目录 `style-seams.test.ts` 从另一侧守住（契约名单 ⊆ Text.css）。
 *
 * 副作用：无（纯展示组件，不读 store、不发请求、不写磁盘）。
 * 边界：本仓**未装** `@testing-library/jest-dom` / `user-event`（硬约束：不新增依赖）⇒
 * 断言一律用原生 DOM API（`tagName` / `getAttribute` / `style`），交互用 `fireEvent`。
 * 另一处边界：本文件走 `./index` 导入面（同 `ui/icons/Icon.test.tsx` 先例），因此
 * `index.ts` 的 `import "./motion.css"` 也会被执行 —— 这也是「导出面可用」的证据。
 */
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Text } from "./index";
import type { TextFont, TextSize, TextTag, TextTone } from "./index";

/** 契约名单：与 `Text.css` 的规则一一对应（由 style-seams.test.ts 从 CSS 侧复核） */
const SIZES: readonly TextSize[] = [1, 2, 3, 4, 5, 6];
const TONES: readonly TextTone[] = [
  "ink-1", "ink-2", "ink-3", "ink-4", "stamp", "ok", "due", "link", "inherit",
];
const FONTS: readonly TextFont[] = ["ui", "body", "mono"];
const TAGS: ReadonlyArray<readonly [TextTag, string]> = [
  ["span", "SPAN"], ["p", "P"], ["div", "DIV"], ["label", "LABEL"], ["strong", "STRONG"],
  ["em", "EM"], ["h1", "H1"], ["h2", "H2"], ["h3", "H3"],
];

const root = (container: HTMLElement): HTMLElement => {
  const el = container.firstElementChild;
  if (!el) throw new Error("Text 没有渲染出任何元素");
  return el as HTMLElement;
};
const classesOf = (container: HTMLElement): string[] => root(container).className.split(/\s+/);

describe("Text 默认契约", () => {
  it("默认 = span + s4 + ink-2 + font-ui，类名与顺序逐字固定", () => {
    const { container } = render(<Text>正文</Text>);
    expect(root(container).tagName).toBe("SPAN");
    expect(root(container).className).toBe("ed-text ed-text--s4 ed-text--ink-2 ed-text--font-ui");
    expect(root(container).textContent).toBe("正文");
  });

  it("默认不带 truncate（截断是逐处显式选择，不是默认排版）", () => {
    const { container } = render(<Text>正文</Text>);
    expect(classesOf(container)).not.toContain("ed-text--truncate");
  });
});

describe("Text 字阶 / 墨度 / 字族三轴映射到类", () => {
  it("6 档字阶各有对应类", () => {
    for (const size of SIZES) {
      const { container } = render(<Text size={size}>x</Text>);
      expect(classesOf(container), `第 ${size} 档`).toContain(`ed-text--s${size}`);
    }
  });

  it("9 档墨度各有对应类（含 inherit —— 供继承父级墨度的内联片段）", () => {
    for (const tone of TONES) {
      const { container } = render(<Text tone={tone}>x</Text>);
      expect(classesOf(container), `墨度 ${tone}`).toContain(`ed-text--${tone}`);
    }
  });

  it("3 档字族各有对应类（`mono` = 数字对齐，非等宽装饰）", () => {
    for (const font of FONTS) {
      const { container } = render(<Text font={font}>x</Text>);
      expect(classesOf(container), `字族 ${font}`).toContain(`ed-text--font-${font}`);
    }
  });

  it("三轴组合出的类名集合可枚举（顺序固定，便于 grep 与批次迁移）", () => {
    const { container } = render(
      <Text size={1} tone="stamp" font="mono" truncate className="slot">x</Text>,
    );
    expect(root(container).className).toBe(
      "ed-text ed-text--s1 ed-text--stamp ed-text--font-mono ed-text--truncate slot",
    );
  });
});

describe("Text 语义与透传", () => {
  it("as 的 9 个取值各自渲染出对应标签，且携带同一组类", () => {
    for (const [tag, tagName] of TAGS) {
      const { container } = render(<Text as={tag}>x</Text>);
      expect(root(container).tagName, `as=${tag}`).toBe(tagName);
      expect(classesOf(container), `as=${tag} 的类`).toContain("ed-text");
      expect(classesOf(container), `as=${tag} 的字阶`).toContain("ed-text--s4");
    }
  });

  it("children 原样渲染：中文与嵌套元素都不改写", () => {
    const { container } = render(
      <Text as="p" tone="ink-3">
        中文与 <strong>嵌套</strong> 元素
      </Text>,
    );
    expect(container.textContent).toBe("中文与 嵌套 元素");
    expect(within(container).getByText("嵌套").tagName).toBe("STRONG");
  });

  it("className 追加在契约类之后（调用点只做定位，不参与排版权威）", () => {
    const { container } = render(<Text className="my-slot">x</Text>);
    expect(classesOf(container)).toContain("my-slot");
    expect(classesOf(container)).toContain("ed-text");
  });

  it("style 原样透传（批 6 的「记忆浮现」按此注入 letterSpacing / color 而无需改原语）", () => {
    const { container } = render(<Text style={{ letterSpacing: "0.02em" }}>x</Text>);
    expect(root(container).style.letterSpacing).toBe("0.02em");
  });

  it("排版与墨度**只走类**，绝不落内联 style（否则批 6 无法一处改对所有地方）", () => {
    const { container } = render(<Text size={1} tone="stamp">x</Text>);
    const el = root(container);
    expect(el.style.color).toBe("");
    expect(el.style.fontSize).toBe("");
    expect(el.style.fontWeight).toBe("");
    expect(el.style.lineHeight).toBe("");
  });

  it("渲染结果不含任何颜色字面量（墨度全部来自 --ed-ink-* 变量）", () => {
    const { container } = render(<Text tone="ink-1">x</Text>);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(container.innerHTML).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });
});

/**
 * 两个**属性级**受控槽（批 4 T16-A 裁决：切片内 `data-testid` 与 `title` 各 ≥3 处缺口，
 * 按 B6 阈值回来改原语）。每槽**正反两向**都要钉：传了就落属性、**不传时不得出现该属性** ——
 * 只钉正向会让「原语偷偷给所有文本加一个空 title」这种回潮静默通过（空 title 会吃掉子元素的
 * tooltip 继承，是真实可观测的行为差异）。
 */
describe("Text 属性级受控槽（testId / title）", () => {
  it("testId ⇒ 渲染 data-testid；**不传 ⇒ 属性根本不出现**", () => {
    const on = render(<Text testId="notes-empty-hint">x</Text>);
    expect(root(on.container).getAttribute("data-testid")).toBe("notes-empty-hint");
    const off = render(<Text>x</Text>);
    expect(root(off.container).hasAttribute("data-testid")).toBe(false);
    // 反向：`title` 也在场时不得顺带产出 testid（两槽互不牵连）
    const onlyTitle = render(<Text title="提示">x</Text>);
    expect(root(onlyTitle.container).hasAttribute("data-testid")).toBe(false);
  });

  it("title ⇒ 渲染原生 tooltip；**不传 ⇒ 属性根本不出现**", () => {
    const on = render(<Text title="共 12 条，只显示前 5">x</Text>);
    expect(root(on.container).getAttribute("title")).toBe("共 12 条，只显示前 5");
    const off = render(<Text>x</Text>);
    expect(root(off.container).hasAttribute("title")).toBe(false);
    expect(root(off.container).getAttribute("title")).toBeNull();
  });

  it("两槽是**属性级**：不改变标签、类名序列，也不落任何排版内联 style", () => {
    const { container } = render(<Text testId="t" title="p" as="p" tone="ink-3">x</Text>);
    const el = root(container);
    expect(el.tagName).toBe("P");
    expect(el.className).toBe("ed-text ed-text--s4 ed-text--ink-3 ed-text--font-ui");
    expect(el.style.color).toBe("");
    expect(el.style.fontSize).toBe("");
  });

  it("空串是**显式传入**而不是缺席：`testId=\"\"` 仍落一个空属性（契约是 undefined 才算未传）", () => {
    const { container } = render(<Text testId="">x</Text>);
    expect(root(container).hasAttribute("data-testid")).toBe(true);
    expect(root(container).getAttribute("data-testid")).toBe("");
  });
});
