// @vitest-environment jsdom
/**
 * @ai-context EmptyState.test.tsx — L1 原语 `EmptyState` 的接口契约（批 0-D Task 10）。
 *
 * Why：本仓此前**没有空态组件** —— 等价物是散落在 **40 行 / 28 文件**的「暂无…」灰字
 * （recon §2.1：`暂无|还没有|尚无|空空|没有任何`），5 套空态并存、**首启路径无主行动按钮**
 * （规格 §5.1），且**无容器、无 `data-*` 锚点 ⇒ 无法挂入场动画**（recon §8.3）。⇒ 本文件钉的是
 * 「类名集合 + 三段槽位 + 主行动按钮走 `Button` + 入场接缝存在」，这四样是批 4 迁移 28 个文件
 * 与批 6 挂编排层动效的共同契约。
 *
 * 副作用：只读磁盘（同目录 `EmptyState.css` / `EmptyState.tsx` / `motion.css` 的文本），不修改任何文件。
 * 边界：① jsdom **不做样式级联** ⇒ `@keyframes` / `animation` 的效果无法行为级验证，只能守
 *       **CSS 文本**（同 `Button.test.tsx` 思路），**不假装验证了视觉**；可行为级判定的是
 *       「渲染出真实 `<button>` + 类名 + 点击语义 + `aria-hidden`」这一侧。
 *       ② 本仓未装 `jest-dom` / `user-event`（硬约束：不新增依赖）⇒ 断言用原生 DOM API。
 *       ③ 走 `./index` 导入面（同 Text/Surface/Button 先例），顺带证明导出面可用。
 *       ④ **内联 svg 探测串必须拼接**：批 0-B 的棘轮守卫对 `.tsx` 做**全文件文本扫描**
 *       （`includes("<" + "svg")` 即命中）⇒ 本文件里若原样写出该字面量，会把自己变成「新增内联
 *       svg 的文件」而让守卫红（同条纪律的另一面：jsdom 指令串也是全文件扫描，故只在首行出现）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./index";
import type { EmptyStateAction } from "./index";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 判据前先剥注释（同 `style-seams.test.ts`）：注释里提到 `infinite` / 颜色名不该让守卫误报 */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");
const readText = (file: string): string => readFileSync(join(HERE, file), "utf8").replace(/\r\n/g, "\n");

const EMPTY_CSS = stripComments(readText("EmptyState.css"));
const EMPTY_TSX = readText("EmptyState.tsx");
const MOTION_CSS = stripComments(readText("motion.css"));

/** 取一段**配对花括号**的块；缺块直接抛（比 `!` 更能定位「CSS 少写了哪条」）。
    必须是配对版而非「到第一个 `}`」：`@keyframes` 里嵌着 `from`/`to` 两个子块。 */
function block(selector: string): string {
  const start = EMPTY_CSS.indexOf(selector);
  if (start < 0) throw new Error(`EmptyState.css 缺少：${selector}`);
  const open = EMPTY_CSS.indexOf("{", start);
  if (open < 0) throw new Error(`EmptyState.css 的规则未闭合：${selector}`);
  let depth = 0;
  for (let i = open; i < EMPTY_CSS.length; i += 1) {
    if (EMPTY_CSS[i] === "{") depth += 1;
    else if (EMPTY_CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) return EMPTY_CSS.slice(start, i + 1);
    }
  }
  throw new Error(`EmptyState.css 的块未闭合：${selector}`);
}

/** 契约名单：与 `EmptyState.css` 的规则一一对应（改名单必须同时改 CSS 与实现） */
const CLASSES: readonly string[] = [
  "ed-empty",
  "ed-empty--compact",
  "ed-empty__icon",
  "ed-empty__title",
  "ed-empty__description",
  "ed-empty__secondary",
  "ed-empty-enter",
];

const root = (container: HTMLElement): HTMLElement => {
  const el = container.firstElementChild;
  if (!el) throw new Error("EmptyState 没有渲染出任何元素");
  return el as HTMLElement;
};
const classesOf = (container: HTMLElement): string[] => root(container).className.split(/\s+/);
const buttonOf = (container: HTMLElement): HTMLButtonElement | null => container.querySelector("button");

describe("EmptyState 默认契约（无 action / icon / description）", () => {
  it("默认 = div + `ed-empty ed-empty-enter`，类名与顺序逐字固定", () => {
    const { container } = render(<EmptyState title="还没有笔记" />);
    expect(root(container).tagName).toBe("DIV");
    expect(root(container).className).toBe("ed-empty ed-empty-enter");
    expect(root(container).textContent).toBe("还没有笔记");
  });

  it("标题落在 `__title` 槽且走 `Text`（墨度与字阶由 Text 的类承载，空态自己不写排版）", () => {
    const el = root(render(<EmptyState title="还没有笔记" />).container).querySelector(".ed-empty__title");
    expect(el).not.toBeNull();
    expect(el?.className).toBe("ed-text ed-text--s3 ed-text--ink-1 ed-text--font-ui ed-empty__title");
    expect(el?.tagName).toBe("P");
  });

  it("可选槽位缺省时**不产生**空壳（无 icon/description/secondary 元素，也不留空 div）", () => {
    const { container } = render(<EmptyState title="空空如也" />);
    expect(container.querySelector(".ed-empty__icon")).toBeNull();
    expect(container.querySelector(".ed-empty__description")).toBeNull();
    expect(container.querySelector(".ed-empty__secondary")).toBeNull();
    expect(root(container).children).toHaveLength(1);
  });

  it("无 action 时不渲染任何 button（现状 28 文件的形态：只有灰字、没有出路）", () => {
    const { container } = render(<EmptyState title="暂无会话" description="去「课堂助手」开始实时捕获" />);
    expect(buttonOf(container)).toBeNull();
  });
});

describe("EmptyState 描述走 Text（弱化墨度，ReactNode 原样渲染）", () => {
  it("description 落在 `__description` 槽：第 4 档字阶 + ink-3 墨度", () => {
    const el = root(render(<EmptyState title="t" description="d" />).container).querySelector(
      ".ed-empty__description",
    );
    expect(el?.className).toBe("ed-text ed-text--s4 ed-text--ink-3 ed-text--font-ui ed-empty__description");
    expect(el?.tagName).toBe("P");
  });

  it("description 是 ReactNode：嵌套元素不改写（引导语里的强调与快捷键提示都要能进来）", () => {
    const { container } = render(
      <EmptyState title="还没有对话" description={<>点 <strong>＋</strong> 开始</>} />,
    );
    expect(container.querySelector(".ed-empty__description")?.textContent).toBe("点 ＋ 开始");
  });
});

describe("EmptyState 图标走图标层（不内联 svg）", () => {
  it("icon 渲染出图标层的 svg 元素：装饰性 aria-hidden + 尺寸 24 + `__icon` 槽", () => {
    const svg = root(render(<EmptyState title="t" icon="goals" />).container).querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.getAttribute("class")).toBe("ed-empty__icon");
    expect(svg?.querySelectorAll("path, circle, rect").length).toBeGreaterThan(0);
  });

  it("实现从图标层 import（`../icons`），且源码里没有内联 svg 字面量", () => {
    expect(EMPTY_TSX).toContain('from "../icons"');
    expect(EMPTY_TSX.includes("<" + "svg")).toBe(false);
  });

  it("不 import 本层 barrel `./index`（组内互引用走相对文件路径，避免循环依赖）", () => {
    expect(EMPTY_TSX).not.toContain('from "./index"');
    expect(EMPTY_TSX).toContain('from "./Text"');
    expect(EMPTY_TSX).toContain('from "./Button"');
  });
});

describe("EmptyState 主行动按钮（规格 §5.1：首启路径的落点）", () => {
  const ACTION: EmptyStateAction = { label: "新建第一篇笔记", onClick: () => undefined };

  it("render 出**真实** `<button type=\"button\">`，且走 Button 的类（四态自动继承）", () => {
    const { container } = render(<EmptyState title="还没有笔记" action={ACTION} />);
    const btn = buttonOf(container);
    expect(btn?.tagName).toBe("BUTTON");
    expect(btn?.getAttribute("type")).toBe("button");
    expect(btn?.textContent).toBe("新建第一篇笔记");
    expect(btn?.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["ed-btn", "ed-btn--primary", "ed-btn--md"]),
    );
  });

  it("点击调用 action.onClick（恰好一次）", () => {
    const onClick = vi.fn();
    const { container } = render(<EmptyState title="t" action={{ label: "开始", onClick }} />);
    fireEvent.click(buttonOf(container) as HTMLButtonElement);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("variant 透传给 Button（工具型空态可退到 ghost）；缺省是 primary（空态的唯一出路）", () => {
    const ghost = buttonOf(
      render(<EmptyState title="t" action={{ ...ACTION, variant: "ghost" }} />).container,
    ) as HTMLButtonElement;
    expect(ghost.className).toContain("ed-btn--ghost");
    expect(ghost.className).not.toContain("ed-btn--primary");
    expect(buttonOf(render(<EmptyState title="t" action={ACTION} />).container)?.className).toContain(
      "ed-btn--primary",
    );
  });

  it("disabled 透传：原生 disabled 属性 + 点击不派发 onClick（不可逆动作进行中的空态）", () => {
    const onClick = vi.fn();
    const btn = buttonOf(
      render(<EmptyState title="t" action={{ label: "开始", onClick, disabled: true }} />).container,
    ) as HTMLButtonElement;
    expect(btn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("EmptyState compact 与透传", () => {
  it("compact 缺省 false；开启后类集合精确为 `ed-empty ed-empty--compact ed-empty-enter`", () => {
    expect(classesOf(render(<EmptyState title="t" />).container)).not.toContain("ed-empty--compact");
    const { container } = render(<EmptyState title="t" compact />);
    expect(root(container).className).toBe("ed-empty ed-empty--compact ed-empty-enter");
  });

  it("secondary ReactNode 落在 `__secondary` 槽（次要行动/说明与主行动按钮分开）", () => {
    const { container } = render(<EmptyState title="t" secondary={<span>按 ⌘K 搜索</span>} />);
    const slot = container.querySelector(".ed-empty__secondary");
    expect(slot?.textContent).toBe("按 ⌘K 搜索");
  });

  it("testId 落到 data-testid；不传时不产生该属性（不留 `data-testid=\"undefined\"`）", () => {
    expect(root(render(<EmptyState title="t" testId="empty-notes" />).container).getAttribute("data-testid")).toBe(
      "empty-notes",
    );
    expect(root(render(<EmptyState title="t" />).container).hasAttribute("data-testid")).toBe(false);
  });

  it("结构不变量：三段槽位各至多一个（不产生两档叠加态）", () => {
    const { container } = render(
      <EmptyState title="t" description="d" icon="notes" action={{ label: "a", onClick: () => undefined }} />,
    );
    for (const cls of ["ed-empty__icon", "ed-empty__title", "ed-empty__description"]) {
      expect(container.querySelectorAll(`.${cls}`), cls).toHaveLength(1);
    }
  });
});

describe("EmptyState 反例守门（批 6 要一处改对所有地方）", () => {
  it("视觉**只走类**：根元素与按钮都不落内联 style", () => {
    const { container } = render(
      <EmptyState title="t" description="d" icon="notes" compact action={{ label: "a", onClick: () => undefined }} />,
    );
    expect(root(container).getAttribute("style")).toBeNull();
    expect(buttonOf(container)?.getAttribute("style")).toBeNull();
  });

  it("渲染结果不含任何颜色字面量（墨度全部来自 --ed-* 变量）", () => {
    const { container } = render(<EmptyState title="t" icon="goals" action={{ label: "a", onClick: () => undefined }} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(container.innerHTML).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });

  it("CSS 零颜色字面量、无 z-index、不写媒体查询（reduced-motion 只由 motion.css 的唯一块覆盖）", () => {
    expect(EMPTY_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/);
    expect(EMPTY_CSS).not.toMatch(/z-index/);
    expect(EMPTY_CSS).not.toContain("@media");
    expect(MOTION_CSS.slice(MOTION_CSS.indexOf("@media (prefers-reduced-motion"))).toContain(".ed-empty");
  });

  it("盒模型口径由基类自带且只声明一次（本仓无全局 CSS reset，空态不声明就没人声明）", () => {
    expect(block(".ed-empty {")).toContain("box-sizing: border-box");
    expect(EMPTY_CSS.match(/box-sizing\s*:/g)).toHaveLength(1);
  });
});

describe("EmptyState 入场接缝（批 6 换编排层动效的唯一挂点）", () => {
  it("`.ed-empty-enter` 提供一次性的透明度入场，时长取 `--ed-dur-micro`（不新造时长）", () => {
    const enter = block(".ed-empty-enter {");
    expect(enter).toContain("animation:");
    expect(enter).toContain("ed-empty-in");
    expect(enter).toContain("var(--ed-dur-micro, 120ms)");
    // `both`：批 6 给编排层加 stagger 延迟时，元素在延迟期仍是「先隐后现」而不是闪一下
    expect(enter).toContain("both");
  });

  it("`@keyframes ed-empty-in` 只做透明度 0 → 1（不做位移，环境层不抢注意力）", () => {
    const kf = block("@keyframes ed-empty-in");
    expect(kf).toMatch(/from\s*\{\s*opacity:\s*0;\s*\}/);
    expect(kf).toMatch(/to\s*\{\s*opacity:\s*1;\s*\}/);
    expect(EMPTY_CSS).not.toMatch(/translate/);
  });

  it("空态自身**不做循环动画**（§8.6.1 第 1 条：环境层永远不抢注意力；循环留给 Loading/Probe）", () => {
    expect(EMPTY_CSS).not.toContain("infinite");
  });

  it("本文件不定义任何 `--ed-*` 变量（时长/缓动的真源在 motion.css，批 6 一整块接管）", () => {
    expect(EMPTY_CSS.match(/--ed-[a-z0-9-]+\s*:/g)).toBeNull();
  });

  it("实现产出的每个类在 CSS 里都有规则（类名拼错 = 静默无样式，编译期全绿）", () => {
    for (const cls of CLASSES) {
      expect(EMPTY_CSS, `EmptyState.css 缺少 .${cls} 的规则`).toContain(`.${cls} {`);
    }
  });
});
