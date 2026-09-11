// @vitest-environment jsdom
/**
 * @ai-context Button.test.tsx — L1 原语 `Button` 的接口契约（批 0-D Task 5）。
 *
 * Why：本仓此前**没有按钮原语** —— `<button>` 510 行/121 文件全是各自内联样式、`const *Btn*`
 * 86 行/60 文件（recon §3.3），而 CSS `:hover` / `:active` 在活代码里 **0 处**、`:focus*` /
 * `:disabled` **各 0**、`aria-disabled` **0**、禁用视觉降级**全站 1 处**（recon §8.2）⇒ 本文件钉的
 * 是**从零建立的按钮契约**：类名集合 + 两种不可用态的语义差别 + 键盘可达性 + 四态 CSS 接缝。
 *
 * 副作用：只读磁盘（同目录 `Button.css` / `motion.css` 的文本），不修改任何文件。
 * 边界：① jsdom **不做样式级联**：`:hover` / `:active` / `:focus-visible` **无法**在此行为级验证
 *       ⇒ 用「CSS 文本判据」守它们（同 `style-seams.test.ts` 思路），**不假装验证了视觉**；jsdom
 *       **可**判定的是 `disabled` / `busy` 的属性与点击语义（`tabIndex` 不行 —— 见对应用例）。
 *       ② 本仓未装 `jest-dom` / `user-event`（硬约束：不新增依赖）⇒ 断言用原生 DOM API。
 *       ③ 走 `./index` 导入面（同 Text/Surface 先例），顺带证明导出面可用。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./index";
import type { ButtonSize, ButtonVariant } from "./index";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 判据前先剥注释（同 `style-seams.test.ts`）：注释里提到 `:hover` / `opacity` 不该让守卫误报 */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\r\n/g, "\n");
const readCss = (file: string): string => stripComments(readFileSync(join(HERE, file), "utf8"));

const BUTTON_CSS = readCss("Button.css");
const MOTION_CSS = readCss("motion.css");

/** 取一条规则块的声明体；缺规则直接抛（比 `!` 更能定位「CSS 少写了哪条」） */
function rule(selector: string): string {
  const start = BUTTON_CSS.indexOf(selector);
  if (start < 0) throw new Error(`Button.css 缺少规则：${selector}`);
  const end = BUTTON_CSS.indexOf("}", start);
  if (end < 0) throw new Error(`Button.css 的规则未闭合：${selector}`);
  return BUTTON_CSS.slice(start, end);
}

/** 契约名单：与 `Button.css` 的规则一一对应（改名单必须同时改 CSS 与实现） */
const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost"];
const SIZES: readonly ButtonSize[] = ["sm", "md", "lg"];

const root = (container: HTMLElement): HTMLButtonElement => {
  const el = container.firstElementChild;
  if (!el) throw new Error("Button 没有渲染出任何元素");
  return el as HTMLButtonElement;
};
const classesOf = (container: HTMLElement): string[] => root(container).className.split(/\s+/);

describe("Button 默认契约", () => {
  it("默认 = 原生 button + type=button + secondary + md，类名与顺序逐字固定", () => {
    const { container } = render(<Button>保存</Button>);
    expect(root(container).tagName).toBe("BUTTON");
    // type 默认值必须显式写死：`<button>` 在表单里的隐含默认是 submit（回车即误提交）
    expect(root(container).getAttribute("type")).toBe("button");
    expect(root(container).className).toBe("ed-btn ed-btn--secondary ed-btn--md");
    expect(root(container).textContent).toBe("保存");
  });

  it("type 可显式覆盖为 submit / reset（只改属性，不改类名契约）", () => {
    for (const t of ["submit", "reset"] as const) {
      const { container } = render(<Button type={t}>x</Button>);
      expect(root(container).getAttribute("type"), `type=${t}`).toBe(t);
      expect(classesOf(container)).toContain("ed-btn");
    }
  });
});

describe("Button 三档 variant × 三档 size 映射到类", () => {
  it("3 档 variant 各有对应类（primary 墨底 / secondary 纸底 / ghost 透明）", () => {
    for (const variant of VARIANTS) {
      const cls = classesOf(render(<Button variant={variant}>x</Button>).container);
      expect(cls, `档位 ${variant}`).toContain(`ed-btn--${variant}`);
    }
  });

  it("3 档 size 各有对应类（字号走 --ed-type-{4,5,6}-* 三档字阶）", () => {
    for (const size of SIZES) {
      const cls = classesOf(render(<Button size={size}>x</Button>).container);
      expect(cls, `尺寸 ${size}`).toContain(`ed-btn--${size}`);
    }
  });

  it("结构不变量：variant 类与 size 类各恰好一个（不产生两档叠加态）", () => {
    const cls = classesOf(render(<Button variant="ghost" size="lg">x</Button>).container);
    expect(cls.filter((c) => VARIANTS.some((v) => c === `ed-btn--${v}`))).toHaveLength(1);
    expect(cls.filter((c) => SIZES.some((s) => c === `ed-btn--${s}`))).toHaveLength(1);
  });

  it("三轴组合出的类名集合可枚举（顺序固定，便于 grep 与批次迁移）", () => {
    const { container } = render(
      <Button variant="primary" size="lg" block className="slot">x</Button>,
    );
    expect(root(container).className).toBe("ed-btn ed-btn--primary ed-btn--lg ed-btn--block slot");
  });

  it("block 默认 false（宽度由调用点决定）；开启后加 --block（撑满容器）", () => {
    expect(classesOf(render(<Button>x</Button>).container)).not.toContain("ed-btn--block");
    expect(classesOf(render(<Button block>x</Button>).container)).toContain("ed-btn--block");
  });

  it("反例守门：没有 danger 变体（危险语义靠 ConfirmDialog 的印章标记，按钮保持中性）", () => {
    expect(VARIANTS as readonly string[]).not.toContain("danger");
    expect(BUTTON_CSS).not.toContain("ed-btn--danger");
  });
});

describe("Button 四态 · disabled（原生 disabled，移出 Tab 序）", () => {
  it("disabled：原生属性 + aria-disabled 同步，且点击（含连点）不派发 onClick", () => {
    const onClick = vi.fn();
    const el = root(render(<Button disabled onClick={onClick}>保存</Button>).container);
    expect(el.hasAttribute("disabled")).toBe(true);
    expect(el.disabled).toBe(true);
    expect(el.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(el);
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(0);
  });
});

describe("Button 四态 · busy（保留焦点与 Tab 顺序）", () => {
  it("busy：aria-busy + aria-disabled，但**不设**原生 disabled；非 busy 时不留假值", () => {
    const el = root(render(<Button busy>保存中</Button>).container);
    expect(el.getAttribute("aria-busy")).toBe("true");
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.hasAttribute("disabled")).toBe(false);
    const idle = root(render(<Button>保存</Button>).container);
    expect(idle.hasAttribute("aria-busy")).toBe(false);
    expect(idle.hasAttribute("aria-disabled")).toBe(false);
  });

  it("busy 点击不派发 onClick（没有原生 disabled 替我们拦：它仍会派发 click）", () => {
    const onClick = vi.fn();
    const el = root(render(<Button busy onClick={onClick}>保存中</Button>).container);
    fireEvent.click(el);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("不被任何默认参数污染：可用态点击恰好派发一次 onClick（四态里唯一会触发的路径）", () => {
    const onClick = vi.fn();
    fireEvent.click(root(render(<Button onClick={onClick}>保存</Button>).container));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Button 键盘可达性（§8.6.1 第 4 条：键盘路径优先于「活」）", () => {
  it("是真实 <button> 且不覆写 tabIndex / role（Enter/Space 激活与 Tab 到达由浏览器免费提供）", () => {
    const el = root(render(<Button>确定</Button>).container);
    expect(el.tagName).toBe("BUTTON");
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.getAttribute("role")).toBeNull();
    expect(el.tabIndex).toBe(0);
  });

  it("disabled 不可聚焦、busy 可聚焦 —— 两种不可用态的唯一结构差别是原生属性", () => {
    const disabled = root(render(<Button disabled>x</Button>).container);
    const busy = root(render(<Button busy>x</Button>).container);
    // 用可聚焦性实测而非 `tabIndex`：jsdom 未实现「disabled ⇒ tabIndex 默认 -1」（实测恒为 0），
    // 而浏览器里「不可聚焦」正是「不在 Tab 序」的同源判据。
    busy.focus();
    expect(document.activeElement).toBe(busy);
    disabled.focus();
    expect(document.activeElement).not.toBe(disabled);
    expect(disabled.hasAttribute("disabled")).toBe(true);
    expect(busy.hasAttribute("disabled")).toBe(false);
  });
});

describe("Button 透传与内容", () => {
  it("icon 槽渲染在文案前，且不额外包裹 DOM 层（间距由 .ed-btn 的 flex gap 承载）", () => {
    const el = root(
      render(<Button icon={<i data-icon="pen" />}>改名</Button>).container,
    );
    expect(el.children).toHaveLength(1);
    expect(el.firstElementChild?.getAttribute("data-icon")).toBe("pen");
    expect(el.innerHTML.indexOf('data-icon="pen"')).toBeLessThan(el.innerHTML.indexOf("改名"));
    expect(el.textContent).toBe("改名");
  });

  it("title / testId 透传；不传时不产生该属性（不留 title=\"undefined\"）", () => {
    const both = root(render(<Button title="保存更改" testId="save">保存</Button>).container);
    expect(both.getAttribute("title")).toBe("保存更改");
    expect(both.getAttribute("data-testid")).toBe("save");
    const bare = root(render(<Button>保存</Button>).container);
    expect(bare.hasAttribute("title")).toBe(false);
    expect(bare.hasAttribute("data-testid")).toBe(false);
  });

  it("children 原样渲染：中文与嵌套元素都不改写", () => {
    const el = root(render(<Button>中文与 <strong>嵌套</strong> 元素</Button>).container);
    expect(el.textContent).toBe("中文与 嵌套 元素");
  });

  it("className 追加在契约类之后（调用点只做定位，不参与按钮的视觉权威）", () => {
    const cls = classesOf(render(<Button className="my-slot">x</Button>).container);
    expect(cls).toContain("my-slot");
    expect(cls).toContain("ed-btn");
  });

  it("style 纯透传且不影响类名顺序（与 Text/Surface 同一写法；视觉权威仍在类）", () => {
    const { container } = render(<Button className="my-slot" style={{ marginTop: 4 }}>x</Button>);
    expect(root(container).style.marginTop).toBe("4px");
    expect(root(container).className).toBe("ed-btn ed-btn--secondary ed-btn--md my-slot");
  });
});

describe("Button 反例守门（批 6 要一处改对所有地方）", () => {
  it("四态与位移**只走类**：不传 style 时不产生任何内联样式", () => {
    const el = root(
      render(<Button variant="primary" size="lg" block disabled>x</Button>).container,
    );
    expect(el.style.background).toBe("");
    expect(el.style.transform).toBe("");
    expect(el.style.cursor).toBe("");
    expect(el.style.opacity).toBe("");
    expect(el.style.outline).toBe("");
    expect(el.style.boxSizing).toBe("");
  });

  it("渲染结果不含任何颜色字面量（底色 / 边框 / 墨度全部来自 --ed-* 变量）", () => {
    const { container } = render(<Button variant="primary" icon={<i />}>保存</Button>);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(container.innerHTML).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });
});

describe("Button 四态 CSS 接缝（jsdom 不做样式级联 ⇒ 只能守 CSS 文本）", () => {
  it("① hover：三档各有一条 :hover 规则，且都排除不可用态（否则禁用按钮像可点的）", () => {
    for (const v of VARIANTS) {
      expect(BUTTON_CSS, `variant ${v} 缺 hover 规则`).toContain(
        `.ed-btn--${v}:hover:not(:disabled):not([aria-disabled="true"])`,
      );
    }
    // 反例守门：不带 `:not(...)` 的裸 hover 会给不可用按钮假回执
    expect(BUTTON_CSS).not.toMatch(/\.ed-btn--\w+:hover\s*\{/);
  });

  it("② active：按下微陷 translateY(1px)，且位移 ≪ 规格 §8.4 的 8px 上限", () => {
    const active = rule(".ed-btn:active");
    expect(active).toContain("translateY(1px)");
    const px = Number(/translateY\((-?\d+(?:\.\d+)?)px\)/.exec(active)?.[1] ?? Number.NaN);
    expect(px).toBeLessThanOrEqual(8);
  });

  it("③ focus-visible：2px --ed-ink-1 焦点环 + 2px offset；不得写裸 :focus（鼠标点击不该留环）", () => {
    const fv = rule(".ed-btn:focus-visible");
    expect(fv).toContain("outline: 2px solid var(--ed-ink-1)");
    expect(fv).toContain("outline-offset: 2px");
    expect(BUTTON_CSS).not.toMatch(/\.ed-btn:focus\s*\{/);
  });

  it("④ disabled / busy：同一条规则给出视觉降级（not-allowed 光标 + opacity）", () => {
    const un = rule('.ed-btn:disabled, .ed-btn[aria-disabled="true"]');
    expect(un).toContain("cursor: not-allowed");
    expect(un).toContain("opacity: .55");
  });

  it("§8.2 判据：交互反馈一律单属性 ≤200ms 的 transition，且不写 @keyframes", () => {
    const base = rule(".ed-btn {");
    const durations = [...base.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) expect(d, "单属性 transition 不得超过 200ms").toBeLessThanOrEqual(200);
    expect(base).toContain("var(--ed-dur-micro, 120ms)");
    expect(base).not.toContain("transition: all");
    expect(BUTTON_CSS).not.toContain("@keyframes");
  });

  it("基类自带 box-sizing: border-box（--block 的 width:100% 在 content-box 下会溢出 padding+border）", () => {
    expect(rule(".ed-btn {")).toContain("box-sizing: border-box");
  });

  it("CSS 零颜色字面量、无 z-index、不出现 --ed-stamp（规格 §4.1：危险色绝不用于按钮）", () => {
    expect(BUTTON_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/);
    expect(BUTTON_CSS).not.toMatch(/z-index/);
    expect(BUTTON_CSS).not.toContain("--ed-stamp");
  });

  it("reduced-motion 由 motion.css 的 .ed-btn 覆盖；原语不重复写媒体查询", () => {
    const motion = MOTION_CSS.slice(MOTION_CSS.indexOf("@media (prefers-reduced-motion"));
    expect(motion).toContain(".ed-btn");
    expect(BUTTON_CSS).not.toContain("@media");
  });
});
