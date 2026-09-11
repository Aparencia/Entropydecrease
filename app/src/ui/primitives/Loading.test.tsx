// @vitest-environment jsdom
/**
 * @ai-context Loading.test.tsx — L1 原语 `Loading` / `Skeleton` / `Probe` 的接口契约（批 0-D Task 11）。
 *
 * Why：三形态的价值全在**可判定的语义边界**（形状已知 → `Skeleton` · 要文字 → `Loading` ·
 * 无文字的最小单点 → `Probe`）。批 4 要把 83 行/31 文件的「加载中…」按这张表迁移，边界一旦漂移，
 * 三个词就会退化成今天那种逐处手写的灰字。故本文件钉的是「谁渲染什么 + 类名 + 无障碍角色」。
 *
 * ② 后半段（`describe("Loading.css …")`）是 **CSS 文本契约**，不是样式复述：本原语自带两条环境层
 * `@keyframes`，而**周期与 `infinite` 在 jsdom 里无从观测**（jsdom 既不跑动画也不解析样式表）
 * ⇒ 只能直接读 `Loading.css` 文本断言（计划 Step 1 明写「node 与 jsdom 都能跑」）。该段只读盘、不依赖 DOM。
 *
 * ③ **本文件的 reduced-motion 断言是「文本包含式」，不是「计算样式式」** —— 它只能证明
 * `motion.css` 的名单里**写了**三个基类，**证明不了真正带动画的那个选择器被覆盖**：`.ed-skeleton`
 * 的动画挂在伪元素 `::after` 上，而 `animation-*` 不可继承、伪元素也不在选择器匹配链上
 * （T11 评审 C-1 实测：计算样式里 `::after` 仍是 `infinite 1200ms`）。修法与机器守卫在 `motion.css`
 * 侧（控制方裁决交 T14），本文件**故意不加**该断言 —— 加了就会在 T14 修好之前常红。
 *
 * 副作用：无（纯展示组件；不读 store、不发请求、不写磁盘）。
 * 边界：本仓未装 `@testing-library/jest-dom` / `user-event`（硬约束：不新增依赖）⇒ 断言一律用
 * 原生 DOM API（`getAttribute` / `style` / `querySelector`）；`vitest.config.ts` 未开 `globals`
 * ⇒ RTL 的自动清理不生效，必须显式 `cleanup()`（先例 `ConfirmDialog.test.tsx:55`）。本文件从
 * `./index` 导入（同 `Text.test.tsx` 先例）⇒ 连 `index.ts` 的 `import "./motion.css"` 一并执行。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Loading, Probe, Skeleton } from "./index";

afterEach(() => cleanup());

const HERE = dirname(fileURLToPath(import.meta.url));
/** 归一 EOL 后读文本（本仓无 `.gitattributes` 且 `core.autocrlf=true` ⇒ 禁止逐字节换行断言） */
const readText = (file: string): string => readFileSync(join(HERE, file), "utf8").replace(/\r\n/g, "\n");
/** 判据前剥注释（注释里提到 `@media` / `translateX` 这类反例不该让守卫误报 —— 同 `style-seams.test.ts`） */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");
/** 取一条规则的规则体（不含选择器）；规则不存在时返回 null（让断言以「缺规则」而不是空串失败） */
const ruleBody = (css: string, selector: string): string | null => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? null : css.slice(at, css.indexOf("}", at));
};
const classesOf = (el: Element | null): string[] =>
  (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
const textOf = (el: Element): string[] =>
  Array.from(el.querySelectorAll(".ed-text")).map((n) => (n.getAttribute("class") ?? ""));

const CSS = stripComments(readText("Loading.css"));
const MOTION_CSS = stripComments(readText("motion.css"));

describe("Loading —— 不知道形状、但需要一句文字说明在等什么（判定顺序第 2 问）", () => {
  it("默认渲染可读文案「加载中…」并带 role=status（内容出现即被读到）", () => {
    const { container } = render(<Loading />);
    expect(container.textContent).toBe("加载中…");
    const root = screen.getByRole("status");
    expect(root.tagName).toBe("SPAN");
    expect(root.textContent).toBe("加载中…");
  });

  it("默认不是 inline 用法（独立占位是默认档，嵌进按钮/行内才显式声明）", () => {
    render(<Loading />);
    expect(classesOf(screen.getByRole("status"))).toEqual(["ed-loading"]);
  });

  it("inline 追加 ed-loading--inline（该档让标签跟随宿主字阶，见 CSS 规则）", () => {
    render(<Loading inline />);
    expect(classesOf(screen.getByRole("status"))).toEqual(["ed-loading", "ed-loading--inline"]);
  });

  it("标签排版交给 `Text`（本原语不写字号/颜色）：ink-3 + s4 档", () => {
    render(<Loading />);
    expect(textOf(screen.getByRole("status"))).toEqual(["ed-text ed-text--s4 ed-text--ink-3 ed-text--font-ui"]);
  });

  it("label 是 ReactNode 槽 —— 多行说明（模型下载进度等）可直接传入而不必改原语", () => {
    render(
      <Loading
        label={
          <>
            <span>⏳ 正在下载模型（~650MB）…</span>
            <span>encoder.onnx：12MB / 650MB</span>
          </>
        }
      />,
    );
    const root = screen.getByRole("status");
    expect(root.textContent).toContain("正在下载模型");
    expect(root.textContent).toContain("encoder.onnx：12MB / 650MB");
    expect(root.querySelectorAll("span")).toHaveLength(4); // 探针 + Text 外壳 + 两行说明
  });

  it("testId 落到根元素（批 4 的迁移靶子原样保留 data-testid）", () => {
    render(<Loading testId="group-delete-loading" />);
    expect(screen.getByTestId("group-delete-loading").getAttribute("role")).toBe("status");
  });

  it("内部复用 Probe，且圆点是装饰：可读语义由标签承载，不由圆点承载", () => {
    const { container } = render(<Loading />);
    const probe = container.querySelector(".ed-probe");
    expect(probe).not.toBeNull();
    expect(probe?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Skeleton —— 知道要出现什么形状（判定顺序第 1 问）", () => {
  it("默认 1 条 · 高 12px · 满宽（12px 与正文行高同量级 = 一行文字的形状）", () => {
    render(<Skeleton testId="sk" />);
    const bars = screen.getAllByTestId("sk-line");
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute("class")).toBe("ed-skeleton");
    expect(bars[0].style.height).toBe("12px");
    expect(bars[0].style.width).toBe("100%");
  });

  it("lines={3} 渲染 3 条骨架条（GoalDetail 的「加载中…」一行灰字 → 3 行骨架）", () => {
    render(<Skeleton lines={3} testId="sk" />);
    expect(screen.getAllByTestId("sk-line")).toHaveLength(3);
  });

  it("height / width 落到行内 style（number → px；string 原样，供百分比与 calc 用）", () => {
    render(<Skeleton height={20} width="60%" testId="sk" />);
    const bar = screen.getByTestId("sk-line");
    expect(bar.style.height).toBe("20px");
    expect(bar.style.width).toBe("60%");
  });

  it("边界：lines 为 0 / 负数 / 非数时夹到 1 条（夹不住的后果是**空白区** —— 看起来像加载完了）", () => {
    for (const bad of [0, -3, Number.NaN]) {
      const { unmount } = render(<Skeleton lines={bad} testId="sk" />);
      expect(screen.getAllByTestId("sk-line"), `lines=${String(bad)}`).toHaveLength(1);
      unmount();
    }
  });

  it("边界：小数 lines 向下取整（2.9 → 2 条，不产生半条）", () => {
    render(<Skeleton lines={2.9} testId="sk" />);
    expect(screen.getAllByTestId("sk-line")).toHaveLength(2);
  });

  it("装饰性：整组 aria-hidden（形状是纯视觉信息，可读语义由调用点的 role=status 提供）", () => {
    render(<Skeleton lines={2} testId="sk" />);
    expect(screen.getByTestId("sk").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Probe —— 不需要文字的最小单元（判定顺序第 3 问）", () => {
  it("渲染单个 .ed-probe，且是装饰（aria-hidden）", () => {
    const { container } = render(<Probe />);
    const probe = container.firstElementChild;
    expect(classesOf(probe)).toEqual(["ed-probe"]);
    expect(probe?.getAttribute("aria-hidden")).toBe("true");
  });

  it("label 只作鼠标悬停的原生 title（`aria-hidden` 元素上的可访问名是死属性 ⇒ 不写 aria-label）", () => {
    const { container } = render(<Probe label="加载中" />);
    expect(container.firstElementChild?.getAttribute("title")).toBe("加载中");
    expect(container.firstElementChild?.getAttribute("aria-label")).toBeNull();
  });

  it("无 label 时连 title 属性都不渲染（不产生空 tooltip）", () => {
    const { container } = render(<Probe />);
    expect(container.firstElementChild?.hasAttribute("title")).toBe(false);
  });

  it("没有包装层：testId 落在单点本身（嵌进按钮/行内时不多一层 DOM）", () => {
    const { container } = render(<Probe testId="p" />);
    expect(screen.getByTestId("p").getAttribute("class")).toBe("ed-probe");
    expect(container.childElementCount).toBe(1);
  });
});

describe("Loading.css —— 两条环境层 @keyframes（周期与 infinite 只能从 CSS 文本钉）", () => {
  it("恰好两个 @keyframes 各定义一次（骨架微光 + 探针摆动；均为循环环境动效）", () => {
    expect(CSS.match(/@keyframes ed-skeleton-shimmer/g)).toHaveLength(1);
    expect(CSS.match(/@keyframes ed-probe-swing/g)).toHaveLength(1);
    expect(CSS.match(/@keyframes/g)).toHaveLength(2);
  });

  it("周期钉住：骨架走 --ed-dur-skeleton（兜底 1200ms）· 探针 2.4s（环境层 2–6s，§8.1）", () => {
    expect(CSS).toContain("ed-skeleton-shimmer var(--ed-dur-skeleton, 1200ms)");
    expect(CSS).toContain("ed-probe-swing 2.4s");
  });

  it("两条都是 infinite（§8.6.1 第 1 条：环境层不得退为纯背景 —— 一次性动画等于没有生命感）", () => {
    expect(CSS.match(/infinite/g)).toHaveLength(2);
    expect(CSS).toContain("var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)) infinite");
  });

  it("探针幅度 ±2px（总 4px，不抢注意力；≤8px 上限由 style-seams.test.ts 扫本文件机器判定）", () => {
    expect(CSS.match(/translateX\(-2px\)/g)).toHaveLength(1);
    expect(CSS.match(/translateX\(2px\)/g)).toHaveLength(1);
  });

  it("微光只动 transform（合成层）· 亮带取 60% · 骨架不靠透明度闪烁（「不抢注意力」）", () => {
    expect(CSS).toContain("color-mix(in srgb, var(--ed-bg-surface) 60%, transparent)");
    const shimmerToSwing = CSS.slice(CSS.indexOf("@keyframes ed-skeleton-shimmer"), CSS.indexOf("@keyframes ed-probe-swing"));
    expect(shimmerToSwing).not.toContain("opacity");
    expect(CSS.match(/opacity/g)).toHaveLength(2); // 两处都在探针摆动里
  });
});

describe("reduced-motion：静态由 motion.css 的既有块承担（§8.2「一条媒体查询即静态」）", () => {
  it("本文件不得自带第二条媒体查询（app/src 内唯一的 reduced-motion 规则块在 motion.css）", () => {
    expect(CSS).not.toContain("@media");
  });

  it("motion.css 的块**列了**本文件三个基类，且 iteration-count: 1 让循环动画停住", () => {
    // ⚠️ 本条只证「名单里有这三个基类」，**不证**「真正带动画的选择器被覆盖」：
    // `.ed-skeleton` 的 animation 挂在伪元素 `::after` 上（`animation-*` 不可继承、伪元素不在
    // 选择器匹配链上）⇒ 实际被停住的只有 `.ed-probe`。这是 T11 评审 C-1，修在 `motion.css` 侧
    // （控制方裁决交 T14）；见文件头 ③ 与 `Loading.css` 边界⑦。
    const at = MOTION_CSS.indexOf("@media (prefers-reduced-motion");
    expect(at, "motion.css 缺少 reduced-motion 块").toBeGreaterThanOrEqual(0);
    const block = MOTION_CSS.slice(at);
    for (const cls of ["ed-loading", "ed-skeleton", "ed-probe"]) {
      expect(block, `reduced-motion 名单缺 .${cls}`).toContain(`.${cls}`);
    }
    expect(block).toContain("animation-iteration-count: 1 !important");
  });

  it("静止态不是空白：两者的可见性写在不依赖动画的基类规则里（停住后仍是灰条与实心圆点）", () => {
    expect(ruleBody(CSS, ".ed-skeleton")).toContain("background: var(--ed-bg-sunken)");
    expect(ruleBody(CSS, ".ed-probe")).toContain("background: var(--ed-ink-3)");
    expect(ruleBody(CSS, ".ed-probe")).not.toContain("opacity: 0");
  });
});

describe("消费纪律：颜色只经 var(--ed-*) · 层级不归本层", () => {
  it("零颜色字面量（色值只在 ui/tokens.css 与生成器里）", () => {
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });

  it("不写 z-index（层级是 ui/zIndex.ts 标尺的职责，规格 §4.2①）", () => {
    expect(CSS).not.toMatch(/z-index/);
  });
});
