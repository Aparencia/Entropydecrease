// @vitest-environment jsdom
/**
 * @ai-context Surface.test.tsx — L1 原语 `Surface` 的接口契约（批 0-D Task 4）。
 *
 * Why：`Surface` 是「面（底 / 边框 / 圆角 / 阴影）」的**唯一出口**，它产出的类名
 * （`.ed-surface--raised` / `.ed-surface--r-panel` / `.ed-surface--interactive` …）是**跨批次
 * 公共契约** —— 批 4 的迁移与批 6 的动效都按这些类名挂接（hover 升起 / 边框墨度落在
 * `Surface.css` 的 `.ed-surface--interactive` 一族规则上）。所以本文件钉的是「标签语义 +
 * 类名集合 + 参数不外溢成内联样式」，而不是 HTML 快照（快照会把无意义的 DOM 细节变成契约）。
 *
 * 副作用：无（纯展示组件，不读 store、不发请求、不写磁盘）。
 * 边界：① 本仓**未装** `@testing-library/jest-dom` / `user-event`（硬约束：不新增依赖）⇒
 *       断言一律用原生 DOM API（`tagName` / `getAttribute` / `className` / `style`）；
 *       ② `:hover` / `:active` / `:focus-visible` 是 CSS 伪类，jsdom **不做样式级联** ⇒ 三条
 *       交互态只能由 `Surface.css` 的文本守卫（Task 14 的 `style-contract.test.ts`）与人工
 *       核对承接，本文件守的是「类名契约」这一侧，**不假装验证了视觉**；
 *       ③ 本文件走 `./index` 导入面（同 `Text.test.tsx` 先例），因此 `index.ts` 的
 *       `import "./motion.css"` 也会被执行 —— 这也是「导出面可用」的证据。
 */
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Surface } from "./index";
import type { SurfaceLevel, SurfaceRadius, SurfaceTag } from "./index";

/** 契约名单：与 `Surface.css` 的规则一一对应（改名单必须同时改 CSS 与测试） */
const LEVELS: readonly SurfaceLevel[] = ["sunken", "canvas", "surface", "raised"];
const RADIUS: readonly SurfaceRadius[] = ["stamp", "control", "panel", "overlay", "pill"];
const TAGS: ReadonlyArray<readonly [SurfaceTag, string]> = [
  ["div", "DIV"], ["section", "SECTION"], ["article", "ARTICLE"], ["aside", "ASIDE"], ["li", "LI"],
];

const root = (container: HTMLElement): HTMLElement => {
  const el = container.firstElementChild;
  if (!el) throw new Error("Surface 没有渲染出任何元素");
  return el as HTMLElement;
};
const classesOf = (container: HTMLElement): string[] => root(container).className.split(/\s+/);

describe("Surface 默认契约", () => {
  it("默认 = div + surface + r-panel + bordered，类名与顺序逐字固定", () => {
    const { container } = render(<Surface>内容</Surface>);
    expect(root(container).tagName).toBe("DIV");
    expect(root(container).className).toBe("ed-surface ed-surface--surface ed-surface--r-panel ed-surface--bordered");
    expect(root(container).textContent).toBe("内容");
  });

  it("默认不带 interactive / padded（可点与内边距都是逐处显式选择，不是面的默认形态）", () => {
    const cls = classesOf(render(<Surface>x</Surface>).container);
    expect(cls).not.toContain("ed-surface--interactive");
    expect(cls).not.toContain("ed-surface--padded");
  });

  it("六轴全开时的类名集合可枚举（顺序固定，便于 grep 与批次迁移）", () => {
    const { container } = render(
      <Surface level="raised" radius="overlay" interactive padded className="slot">x</Surface>,
    );
    expect(root(container).className).toBe(
      "ed-surface ed-surface--raised ed-surface--r-overlay ed-surface--bordered ed-surface--interactive ed-surface--padded slot",
    );
  });
});

describe("Surface 四档底 / 五档圆角映射到类", () => {
  it("4 档 level 各有对应类（sunken 输入槽 · canvas 纸 · surface 卡面 · raised 弹层）", () => {
    for (const level of LEVELS) {
      const cls = classesOf(render(<Surface level={level}>x</Surface>).container);
      expect(cls, `档位 ${level}`).toContain(`ed-surface--${level}`);
    }
  });

  it("5 档 radius 各有对应类（3/5/8/10px 由 token 决定，原语只出档名）", () => {
    for (const radius of RADIUS) {
      const cls = classesOf(render(<Surface radius={radius}>x</Surface>).container);
      expect(cls, `圆角 ${radius}`).toContain(`ed-surface--r-${radius}`);
    }
  });

  it("第五档 `pill`（批 4 T17 的药丸裁决）：类名与档名一致，且**不**落内联 style（值由 CSS 的 var 兜底给）", () => {
    const { container } = render(<Surface radius="pill">x</Surface>);
    expect(classesOf(container)).toContain("ed-surface--r-pill");
    // 原语只出档名、值只在 CSS：这条守住「token 真源补 pill 之前也不许把 999px 内联进来」
    expect(root(container).style.borderRadius).toBe("");
  });

  it("结构不变量：level 类与 radius 类各至多一个（不产生两档叠加态）", () => {
    const cls = classesOf(render(<Surface level="raised" radius="overlay">x</Surface>).container);
    expect(cls.filter((c) => LEVELS.some((l) => c === `ed-surface--${l}`))).toHaveLength(1);
    expect(cls.filter((c) => c.startsWith("ed-surface--r-"))).toHaveLength(1);
  });

  it("反例守门：radius 类必须带 `r-` 前缀（`ed-surface--panel` 是最易漏写的形态，CSS 里没有该规则）", () => {
    const cls = classesOf(render(<Surface radius="panel">x</Surface>).container);
    expect(cls).toContain("ed-surface--r-panel");
    expect(cls).not.toContain("ed-surface--panel");
  });
});

describe("Surface 三个布尔开关", () => {
  it("bordered 默认 true；bordered={false} 后类名集合精确收缩（不留空档或多余类）", () => {
    expect(classesOf(render(<Surface>x</Surface>).container)).toContain("ed-surface--bordered");
    const { container } = render(<Surface bordered={false}>x</Surface>);
    expect(root(container).className).toBe("ed-surface ed-surface--surface ed-surface--r-panel");
    expect(classesOf(container)).not.toContain("ed-surface--bordered");
  });

  it("interactive 默认 false；开启后加 `--interactive`（hover 升起 / 边框墨度 / 焦点环的挂点）", () => {
    expect(classesOf(render(<Surface>x</Surface>).container)).not.toContain("ed-surface--interactive");
    expect(classesOf(render(<Surface interactive>x</Surface>).container)).toContain("ed-surface--interactive");
  });

  it("padded 默认 false；开启后加 `--padded`（内边距走 `--ed-space-12`）", () => {
    expect(classesOf(render(<Surface padded>x</Surface>).container)).toContain("ed-surface--padded");
  });

  it("interactive 只加视觉：不设 tabIndex / role（键盘可达性由消费方用真实 button/a 承载，§8.6.1 第 4 条）", () => {
    const el = root(render(<Surface interactive>x</Surface>).container);
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.getAttribute("role")).toBeNull();
  });
});

describe("Surface 语义与透传", () => {
  it("as 的 5 个取值各自渲染出对应标签，且携带同一组类", () => {
    for (const [tag, tagName] of TAGS) {
      const { container } = render(<Surface as={tag}>x</Surface>);
      expect(root(container).tagName, `as=${tag}`).toBe(tagName);
      expect(classesOf(container), `as=${tag} 的基类`).toContain("ed-surface");
      expect(classesOf(container), `as=${tag} 的底`).toContain("ed-surface--surface");
    }
  });

  it("testId 落到 data-testid；不传时不产生该属性（不留 `data-testid=\"undefined\"`）", () => {
    expect(root(render(<Surface testId="card">x</Surface>).container).getAttribute("data-testid")).toBe("card");
    expect(root(render(<Surface>x</Surface>).container).hasAttribute("data-testid")).toBe(false);
  });

  it("children 原样渲染：中文与嵌套元素都不改写", () => {
    const { container } = render(
      <Surface as="section" level="canvas">
        阅读面 <strong>嵌套</strong> 元素
      </Surface>,
    );
    expect(container.textContent).toBe("阅读面 嵌套 元素");
    expect(within(container).getByText("嵌套").tagName).toBe("STRONG");
  });

  it("className 追加在契约类之后；style 原样透传（批 6 的动效按此注入 transform/boxShadow 而无需改原语）", () => {
    const { container } = render(
      <Surface className="my-slot" style={{ boxShadow: "var(--ed-shadow-2)" }}>x</Surface>,
    );
    expect(classesOf(container)).toContain("my-slot");
    expect(classesOf(container)).toContain("ed-surface");
    expect(root(container).style.boxShadow).toBe("var(--ed-shadow-2)");
  });
});

describe("Surface 反例守门（批 6 要一处改对所有地方）", () => {
  it("底 / 边框 / 圆角 / 阴影 / 内边距 / 位移**只走类**，绝不落内联 style", () => {
    const el = root(
      render(<Surface level="raised" radius="overlay" interactive padded>x</Surface>).container,
    );
    expect(el.style.background).toBe("");
    expect(el.style.borderRadius).toBe("");
    expect(el.style.boxShadow).toBe("");
    expect(el.style.padding).toBe("");
    expect(el.style.transform).toBe("");
    expect(el.style.cursor).toBe("");
  });

  it("渲染结果不含任何颜色字面量（底与边框全部来自 --ed-* 变量）", () => {
    const { container } = render(<Surface level="raised" bordered>x</Surface>);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(container.innerHTML).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });
});
