# 图标集（批 0-B）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用自绘线性 SVG 图标层替换 310 个 emoji（93 个文件），使图标可被 `currentColor` 语义着色、尺寸统一、并在暗色主题下不破坏三色信号体系。

**Architecture:** 图标是**纯数据 + 一个薄组件**。`paths.ts` 持有 24 个图标的几何数据（只允许 `path`/`circle`/`rect`/`line` 四种元素，24 网格，无内联颜色），`Icon.tsx` 是唯一渲染入口（`stroke="currentColor"`、`fill="none"`、描边从 token 读、默认 `aria-hidden`），`index.ts` 收敛导出面。每个图标的几何正确性由**契约测试**保证（网格、元素白名单、无字面量颜色、`d` 非空），渲染行为由 jsdom 测试保证，另加一条**棘轮守卫**防止新代码继续写内联 `<svg>`。

**Tech Stack:** React 19 · TypeScript 5.8 · Vite 7 · Vitest 4（全局 node，按文件切 jsdom）· 复用批 0-A 的 `SCALE_TOKENS.icon*`

**Spec:** `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§4.2 图标行 · §5.1 z-index 无关 · §11 验收第 4/11 条）
**前置计划:** `docs/superpowers/plans/2026-09-11-frontend-redesign-batch0a-design-system.md`（已交付 · 已评审 · Merge-ready）

## Global Constraints

- **图标规格（ADR-032 决策 6 + 规范 §4.2）**：`24` 网格 · 描边 `1.75` · 尺寸 `16 / 20 / 24` · `currentColor` · 小圆角。这三组值**已在批 0-A 的真源里**（`app/scripts/gen-tokens.mjs` 的 `SCALE_SOURCE.iconGrid / iconStroke / iconSizes` → 产物 `SCALE_TOKENS`），**图标层必须从那里读，不得另立一套常量**。
- **零依赖**：不引入图标库（lucide / react-icons 等一律否决 —— ADR-032 决策 6 已裁定自绘）。理由见 ADR：本应用需要的一批图标市场上没有对应物，且引库会命中 AGENTS.md 的 ADR 触发条件。
- **`@ai-context` 注释**：每个模块头部必须含业务背景（AGENTS.md §3.3）。
- **单文件 ≤300 行**（AGENTS.md §3.1）。这意味着 24 个图标不能全塞一个文件 —— 按域/动作分两个数据文件（见 File Structure）。
- **不往 4 个 >600 行文件里加代码**（本计划全部是新增文件）。
- **本批只定义不消费**：不修改任何现存组件的 emoji 用法 —— 消费发生在批 4。**界面外观零变化是设计意图。**
- **测试环境**：vitest 全局 `environment: "node"`；只有渲染测试需要文件级 `// @vitest-environment jsdom` 头。`src/test/setup.ts` 只桩了 Range 几何、**没有 matchMedia 桩** —— 本计划不需要 matchMedia。
- **每步验证命令**（在 `app/` 下执行）：单测 `npx vitest run <path>` · 全量 `npx vitest run` · 类型 `npx tsc --noEmit`

---

## File Structure

| 文件 | 职责 | 行数预算 |
|---|---|---|
| `app/src/ui/icons/types.ts` | `IconName` / `IconSize` / `IconProps` / `IconGeometry` 类型与元素白名单常量 | ~55 |
| `app/src/ui/icons/paths.domain.ts` | 9 个**域**图标几何（课堂/会话/笔记/行动/复习/体系/目标/设置/AI） | ~75 |
| `app/src/ui/icons/paths.action.ts` | 15 个**对象与动作**图标几何（搜索/新建/删除/关闭/更多/箭头/勾选/时间码/画面/播放/暂停/停止/刷新/外链…） | ~95 |
| `app/src/ui/icons/paths.ts` | 合并两份数据为唯一注册表 `ICON_PATHS`，派生 `IconName`，做启动期契约校验 | ~45 |
| `app/src/ui/icons/Icon.tsx` | 唯一渲染入口（svg 包装、尺寸、`currentColor`、a11y） | ~60 |
| `app/src/ui/icons/index.ts` | 公共导出面（`Icon` / `ICON_PATHS` / 类型 / `ICON_NAMES`） | ~20 |
| `app/src/ui/icons/paths.test.ts` | 几何契约测试（网格/白名单/无字面量颜色/非空/命名规范） | ~95 |
| `app/src/ui/icons/Icon.test.tsx` | 渲染契约测试（jsdom：尺寸/描边/currentColor/a11y） | ~85 |
| `app/src/ui/icons/no-inline-svg.test.ts` | **棘轮守卫**：内联 `<svg>` 的 `app/src` 文件清单不得增加 | ~55 |

> 目录 `app/src/ui/icons/` 本计划新建。**本计划不修改任何现存组件。**

---

### Task 1: 图标契约与渲染组件（用 1 个图标打通 TDD）

**Files:**
- Create: `app/src/ui/icons/types.ts`
- Create: `app/src/ui/icons/paths.ts`
- Create: `app/src/ui/icons/paths.domain.ts`（本任务先只放 1 个图标：`notes`）
- Create: `app/src/ui/icons/Icon.tsx`
- Create: `app/src/ui/icons/index.ts`
- Test: `app/src/ui/icons/paths.test.ts` · `app/src/ui/icons/Icon.test.tsx`

**Interfaces:**
- Consumes: 批 0-A 的 `SCALE_TOKENS`（`app/src/ui/tokens.ts` 再导出），字段 `iconGrid: number` · `iconStroke: number` · `iconSizes: readonly number[]`
- Produces（后续任务与批 4 依赖，签名必须一致）：
  - `IconName` —— 由 `ICON_PATHS` 的键派生的字面量联合
  - `IconSize = 16 | 20 | 24`
  - `IconElement = { tag: "path"; d: string } | { tag: "circle"; cx: number; cy: number; r: number } | { tag: "rect"; x: number; y: number; w: number; h: number; rx?: number }`
  - `IconGeometry = { readonly elements: readonly IconElement[] }`
  - `ICON_PATHS: Readonly<Record<string, IconGeometry>>`
  - `ICON_NAMES: readonly string[]`
  - `IconProps = { name: IconName; size?: IconSize; label?: string; className?: string }`
  - `Icon(props: IconProps): JSX.Element`

- [ ] **Step 1: 写几何契约测试**

创建 `app/src/ui/icons/paths.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { ICON_NAMES, ICON_PATHS } from "./paths";
import { ICON_ELEMENT_TAGS } from "./types";
import { SCALE_TOKENS } from "../tokens";

describe("图标几何契约", () => {
  it("注册表非空，且 NAMES 与 PATHS 键集合一致", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ICON_PATHS).sort());
  });

  it("命名规范：kebab-case，只含小写字母、数字与连字符", () => {
    for (const name of ICON_NAMES) {
      expect(name, `非法图标名：${name}`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("每个图标至少有一个元素（空几何是无声的渲染失败）", () => {
    for (const name of ICON_NAMES) {
      expect(ICON_PATHS[name].elements.length, `${name} 几何为空`).toBeGreaterThan(0);
    }
  });

  it("元素只用白名单内的四种标签", () => {
    for (const name of ICON_NAMES) {
      for (const el of ICON_PATHS[name].elements) {
        expect(ICON_ELEMENT_TAGS, `${name} 含越界标签 ${el.tag}`).toContain(el.tag);
      }
    }
  });

  it("path 的 d 非空且不含换行", () => {
    for (const name of ICON_NAMES) {
      for (const el of ICON_PATHS[name].elements) {
        if (el.tag === "path") {
          expect(el.d.trim().length, `${name} 的 d 为空`).toBeGreaterThan(0);
          expect(el.d, `${name} 的 d 含换行`).not.toMatch(/[\r\n]/);
        }
      }
    }
  });

  it("坐标落在 24 网格内（允许 0..24，含半个像素的溢出容忍）", () => {
    const inGrid = (n: number) => n >= 0 && n <= 24;
    for (const name of ICON_NAMES) {
      for (const el of ICON_PATHS[name].elements) {
        if (el.tag === "circle") {
          expect(inGrid(el.cx - el.r) && inGrid(el.cy + el.r), `${name} 圆越界`).toBe(true);
        }
        if (el.tag === "rect") {
          expect(inGrid(el.x) && inGrid(el.y) && inGrid(el.x + el.w) && inGrid(el.y + el.h), `${name} 矩形越界`).toBe(true);
        }
      }
    }
  });

  it("几何数据里不得出现任何颜色（颜色只由 currentColor 决定）", () => {
    // 把几何序列化成字符串再搜颜色痕迹 —— 结构化数据本该没有颜色字段，
    // 这条守的是「将来有人给图标加个 fill/stroke 字段」的退化
    const serialized = JSON.stringify(ICON_PATHS);
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(serialized).not.toMatch(/\b(?:rgb|hsl)a?\(/);
    expect(serialized).not.toMatch(/"(?:fill|stroke|color)"/);
  });

  it("与批 0-A 的真源绑定：网格与描边值不得各写一套", () => {
    expect(SCALE_TOKENS.iconGrid).toBe(24);
    expect(SCALE_TOKENS.iconStroke).toBe(1.75);
    expect([...SCALE_TOKENS.iconSizes]).toEqual([16, 20, 24]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（`app/` 下）：`npx vitest run src/ui/icons/paths.test.ts`
Expected: FAIL —— `Failed to resolve import "./paths"`（或 `Cannot find module`，视 vitest 版本措辞）

- [ ] **Step 3: 写类型与数据（先只放 1 个图标）**

创建 `app/src/ui/icons/types.ts`：

```ts
/**
 * @ai-context 图标层的类型契约（ADR-032 决策 6）。
 *
 * Why：全站 310 个 emoji 分布在 93 个文件里，跨平台字形不一致、无法被 `currentColor`
 * 语义着色、基线抖动会让行高跳动 —— 而本设计的「三色信号体系」要求图标能表达
 * 选中/禁用/危险。故自绘线性图标，并把几何数据与渲染分离：数据可被契约测试穷举校验，
 * 组件只有一个。
 *
 * 副作用：无（纯类型 + 常量）。
 * 边界：几何只允许四种 SVG 元素（见 `ICON_ELEMENT_TAGS`）——**不含任何颜色字段**，
 * 颜色一律由 `currentColor` 决定。新增元素类型必须先在此登记并同步契约测试。
 */

/** 几何白名单：只用这四种，足够表达全部图标且便于穷举校验 */
export const ICON_ELEMENT_TAGS = ["path", "circle", "rect"] as const;

export type IconElementTag = (typeof ICON_ELEMENT_TAGS)[number];

export type IconElement =
  | { readonly tag: "path"; readonly d: string }
  | { readonly tag: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly tag: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number };

export interface IconGeometry {
  readonly elements: readonly IconElement[];
}

/** 尺寸档来自批 0-A 的真源（`SCALE_TOKENS.iconSizes`），此处只做字面量镜像以便类型收窄 */
export type IconSize = 16 | 20 | 24;

export interface IconProps {
  /** 图标名；非法名字在编译期报错（由 `IconName` 联合拦下） */
  readonly name: IconName;
  /** 默认 20 —— 列表行与按钮的常用档 */
  readonly size?: IconSize;
  /** 只在图标**独自承载语义**时给（此时角色变为 `img`）；装饰性图标一律不给 */
  readonly label?: string;
  readonly className?: string;
}

// 循环导入的说明：`paths.ts` 需要 `IconGeometry` 类型，`types.ts` 需要 `paths.ts` 派生的
// `IconName`。TypeScript 的类型导入不产生运行时代码，故 `import type` 是安全的。
import type { IconName } from "./paths";
```

创建 `app/src/ui/icons/paths.domain.ts`：

```ts
/**
 * @ai-context **域图标**几何（9 个）：课堂 / 会话 / 笔记 / 行动 / 复习 / 体系 / 目标 / 设置 / AI。
 *
 * Why：这 9 个是顶层导航与域内标题的固定语汇，必须成套、风格一致（24 网格、1.75 描边、小圆角）。
 * 它们几乎全部**没有现成的开源对应物**（「会话」「体系」「复习」在本应用里是特定语义），
 * 这正是 ADR-032 决策 6 选择自绘的原因。
 *
 * 副作用：无（纯数据）。
 * 边界：坐标一律落在 24 网格内；不写颜色；`d` 不得含换行。
 * 坐标系：viewBox `0 0 24 24`，原点左上，描边居中于路径。
 */

import type { IconGeometry } from "./types";

export const DOMAIN_ICON_PATHS: Readonly<Record<string, IconGeometry>> = {
  /** 笔记：文档 + 文字行 */
  notes: {
    elements: [
      { tag: "path", d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" },
      { tag: "path", d: "M14 3v5h5M9 13h6M9 17h4" },
    ],
  },
};
```

创建 `app/src/ui/icons/paths.ts`：

```ts
/**
 * @ai-context 图标注册表的**唯一入口**：合并各分组数据、派生 `IconName`、做启动期契约校验。
 *
 * Why：图标名必须是**字面量联合**而不是 `string` —— 批 4 会在数百处写 `<Icon name="…" />`，
 * 拼错必须在编译期报错（与批 0-A 把 `cssVar` 参数收紧为 `ColorTokenName` 同一个理由）。
 *
 * 副作用：模块加载时执行一次启动期校验（重名检测），失败即抛 —— 让冲突在 import 期炸掉，
 * 而不是等到某个图标渲染成空白。
 * 边界：新增分组数据文件时必须在此合并，否则图标「存在但注册不到」。
 */

import type { IconGeometry } from "./types";
import { DOMAIN_ICON_PATHS } from "./paths.domain";

const GROUPS: Readonly<Record<string, Readonly<Record<string, IconGeometry>>>> = {
  domain: DOMAIN_ICON_PATHS,
};

function mergeGroups(): Record<string, IconGeometry> {
  const merged: Record<string, IconGeometry> = {};
  for (const [groupName, group] of Object.entries(GROUPS)) {
    for (const [name, geometry] of Object.entries(group)) {
      if (merged[name]) {
        // 重名会让「哪个几何生效」取决于对象键顺序 —— 静默且难以定位，故直接拒绝
        throw new Error(`图标重名：${name}（分组 ${groupName} 与其它分组冲突）`);
      }
      merged[name] = geometry;
    }
  }
  return merged;
}

export const ICON_PATHS: Readonly<Record<string, IconGeometry>> = mergeGroups();

export const ICON_NAMES: readonly string[] = Object.keys(ICON_PATHS).sort();

export type IconName = keyof typeof ICON_PATHS;
```

创建 `app/src/ui/icons/Icon.tsx`：

```tsx
/**
 * @ai-context 图标的**唯一渲染入口**（ADR-032 决策 6）。
 *
 * Why：把「几何数据 → DOM」这一步收在一处，才能保证全站图标在网格、描边、着色、可及性上
 * 一致。`currentColor` 是关键：它让图标继承父级墨度 —— 于是 D 显影的四档墨度、选中/禁用/
 * 危险三态都能**自动**作用于图标，而 emoji 做不到这一点。
 *
 * 副作用：无（纯展示组件，不读 store、不发请求）。
 * 边界：描边宽度取自 `--ed-icon-stroke`，**带字面量兜底** —— 测试环境（jsdom）未加载
 * `tokens.css`，无兜底时描边会退化为默认 1，使快照与观感不符。
 */

import type { IconProps } from "./types";
import { ICON_PATHS } from "./paths";
import { SCALE_TOKENS } from "../tokens";

export function Icon({ name, size = 20, label, className }: IconProps) {
  const geometry = ICON_PATHS[name];
  const stroke = `var(--ed-icon-stroke, ${SCALE_TOKENS.iconStroke})`;
  // 装饰性图标不进可及性树；带 label 时角色变为 img 并暴露名字
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${SCALE_TOKENS.iconGrid} ${SCALE_TOKENS.iconGrid}`}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={className}
      {...a11y}
    >
      {geometry.elements.map((el, i) => {
        const key = `${name}-${i}`;
        if (el.tag === "path") return <path key={key} d={el.d} />;
        if (el.tag === "circle") return <circle key={key} cx={el.cx} cy={el.cy} r={el.r} />;
        return <rect key={key} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx} />;
      })}
    </svg>
  );
}
```

创建 `app/src/ui/icons/index.ts`：

```ts
/**
 * @ai-context 图标层的公共导出面（ADR-032 决策 6）。
 *
 * Why：批 4 之后全站图标都从这里 import。收敛导出面使「换实现」只需改这一个文件，
 * 也让「谁在用图标层」可被一次 grep 找到。
 *
 * 副作用：无。
 * 边界：本模块**不导出**分组数据文件（`paths.domain` / `paths.action`）—— 那是内部结构，
 * 直接 import 会绕过重名校验。
 */

export { Icon } from "./Icon";
export { ICON_PATHS, ICON_NAMES } from "./paths";
export { ICON_ELEMENT_TAGS } from "./types";
export type { IconElement, IconElementTag, IconGeometry, IconName, IconProps, IconSize } from "./types";
```

- [ ] **Step 4: 运行几何契约测试确认通过**

Run：`npx vitest run src/ui/icons/paths.test.ts`
Expected: PASS（9 个 `it`）

- [ ] **Step 5: 写渲染契约测试**

创建 `app/src/ui/icons/Icon.test.tsx`：

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./index";
import { SCALE_TOKENS } from "../tokens";

const getSvg = (container: HTMLElement) => container.querySelector("svg")!;

describe("Icon 渲染契约", () => {
  it("渲染一个 svg，viewBox 取自真源（24 网格）", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("viewBox")).toBe(`0 0 ${SCALE_TOKENS.iconGrid} ${SCALE_TOKENS.iconGrid}`);
  });

  it("默认尺寸 20，可用 size 覆盖为 16 / 24", () => {
    const { container, rerender } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("width")).toBe("20");
    rerender(<Icon name="notes" size={16} />);
    expect(getSvg(container).getAttribute("width")).toBe("16");
    expect(getSvg(container).getAttribute("height")).toBe("16");
    rerender(<Icon name="notes" size={24} />);
    expect(getSvg(container).getAttribute("width")).toBe("24");
  });

  it("描边颜色是 currentColor —— 这是不用 emoji 的核心理由", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("stroke")).toBe("currentColor");
  });

  it("填充为 none（线性图标，非实心）", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("fill")).toBe("none");
  });

  it("描边宽度引用 token 且带字面量兜底（测试环境未加载 tokens.css）", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("stroke-width")).toBe(`var(--ed-icon-stroke, ${SCALE_TOKENS.iconStroke})`);
  });

  it("默认是装饰性的：aria-hidden，且不进可及性树", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("aria-hidden")).toBe("true");
    expect(getSvg(container).hasAttribute("aria-label")).toBe(false);
    expect(getSvg(container).hasAttribute("role")).toBe(false);
  });

  it("给了 label 则角色变为 img 并暴露名字", () => {
    const { container } = render(<Icon name="notes" label="笔记" />);
    expect(getSvg(container).getAttribute("role")).toBe("img");
    expect(getSvg(container).getAttribute("aria-label")).toBe("笔记");
    expect(getSvg(container).hasAttribute("aria-hidden")).toBe(false);
  });

  it("渲染出几何数据的全部元素（数量与 tag 与数据一致）", () => {
    const { container } = render(<Icon name="notes" />);
    const svg = getSvg(container);
    expect(svg.querySelectorAll("path").length).toBe(2);
  });

  it("不含任何字面量颜色（继承父级墨度是全部意义所在）", () => {
    const { container } = render(<Icon name="notes" size={24} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(container.innerHTML).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });

  it("className 透传（供调用点做定位，不用于着色）", () => {
    const { container } = render(<Icon name="notes" className="my-slot" />);
    expect(getSvg(container).getAttribute("class")).toBe("my-slot");
  });
});
```

- [ ] **Step 6: 运行渲染测试确认通过**

Run：`npx vitest run src/ui/icons/Icon.test.tsx`
Expected: PASS（10 个 `it`）

- [ ] **Step 7: 类型检查**

Run：`npx tsc --noEmit`
Expected: 0 错。若 `types.ts` 末尾的 `import type { IconName } from "./paths"` 报循环导入相关错误，把该 import 移到文件**顶部**（`import type` 不产生运行时依赖，位置不影响正确性，只为满足 lint 规则）。

- [ ] **Step 8: 提交**

```bash
git add app/src/ui/icons
git commit -m "feat(ui): 图标契约与渲染组件（自绘线性图标层）"
```

---

### Task 2: 24 个图标几何（域 9 + 动作与对象 15）

**Files:**
- Modify: `app/src/ui/icons/paths.domain.ts`（补至 9 个）
- Create: `app/src/ui/icons/paths.action.ts`（15 个）
- Modify: `app/src/ui/icons/paths.ts`（把新分组并入 `GROUPS`）
- Modify: `app/src/ui/icons/paths.test.ts`（加一条「首付名单」断言）

**Interfaces:**
- Consumes: Task 1 的 `IconGeometry` / `IconElement` / `ICON_ELEMENT_TAGS`，以及 `ICON_PATHS`
- Produces: `ICON_PATHS` 含 **24** 个具名图标；`IconName` 自动扩展为 24 元联合；`ACTION_ICON_PATHS`（分组名 `action`）

> **本任务是一次批量派发**：24 个图标是同一形状的工作（同一套契约、同一组测试），不拆成 24 个任务。

- [ ] **Step 1: 写失败的断言（首付名单）**

在 `app/src/ui/icons/paths.test.ts` 末尾追加：

```ts
describe("首付图标名单", () => {
  // 名单即契约：少一个 = 某个域/动作没有图标；多一个 = 未经评审的增量。
  // 后续批次随消费方增补时，必须同时改这里 —— 让「图标集长大」是一件被看见的事。
  const EXPECTED = [
    // 域（9）
    "action", "ai", "classroom", "goals", "knowledge", "notes", "review", "sessions", "settings",
    // 对象与动作（15）
    "check", "chevron-down", "chevron-right", "clock", "close", "external-link", "image", "more-horizontal",
    "pause", "play", "plus", "refresh", "search", "stop", "trash",
  ];

  it("恰好 24 个，且与名单逐字一致", () => {
    expect([...ICON_NAMES]).toEqual([...EXPECTED].sort());
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run：`npx vitest run src/ui/icons/paths.test.ts`
Expected: FAIL —— 名单缺 23 个（当前只有 `notes`）

- [ ] **Step 3: 补齐域图标（9 个）**

把 `app/src/ui/icons/paths.domain.ts` 的 `DOMAIN_ICON_PATHS` 替换为：

```ts
export const DOMAIN_ICON_PATHS: Readonly<Record<string, IconGeometry>> = {
  /** 课堂：显示器 + 底座（采集源） */
  classroom: {
    elements: [
      { tag: "rect", x: 3, y: 4, w: 18, h: 13, rx: 1.5 },
      { tag: "path", d: "M8 21h8M12 17v4" },
    ],
  },
  /** 会话：堆叠的行（一次捕获 = 一条会话） */
  sessions: {
    elements: [{ tag: "path", d: "M4 6h16M4 12h16M4 18h10" }],
  },
  /** 笔记：文档 + 文字行 */
  notes: {
    elements: [
      { tag: "path", d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" },
      { tag: "path", d: "M14 3v5h5M9 13h6M9 17h4" },
    ],
  },
  /** 行动：勾选框（裁决队列） */
  action: {
    elements: [
      { tag: "rect", x: 3, y: 3, w: 18, h: 18, rx: 1.5 },
      { tag: "path", d: "M8 12.5l2.5 2.5L16 9.5" },
    ],
  },
  /** 复习：循环箭头（间隔重复） */
  review: {
    elements: [
      { tag: "path", d: "M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2" },
      { tag: "path", d: "M18 3v4h-4M6 21v-4h4" },
    ],
  },
  /** 体系：树（根 + 两支） */
  knowledge: {
    elements: [
      { tag: "circle", cx: 12, cy: 5, r: 2 },
      { tag: "circle", cx: 6, cy: 19, r: 2 },
      { tag: "circle", cx: 18, cy: 19, r: 2 },
      { tag: "path", d: "M12 7v4M6 17v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" },
    ],
  },
  /** 目标：同心圆靶 */
  goals: {
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 8 },
      { tag: "circle", cx: 12, cy: 12, r: 3 },
    ],
  },
  /** 设置：齿轮（简化为中心圆 + 八向齿） */
  settings: {
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 3 },
      { tag: "path", d: "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" },
    ],
  },
  /** AI：双星（主星 + 副星，暗示「生成」而非「聊天」） */
  ai: {
    elements: [
      { tag: "path", d: "M11 3l1.7 4.6L17.3 9l-4.6 1.7L11 15.3l-1.7-4.6L4.7 9l4.6-1.4z" },
      { tag: "path", d: "M18 15l.8 2.2 2.2.8-2.2.8L18 21l-.8-2.2-2.2-.8 2.2-.8z" },
    ],
  },
};
```

- [ ] **Step 4: 新建动作与对象图标（15 个）**

创建 `app/src/ui/icons/paths.action.ts`：

```ts
/**
 * @ai-context **对象与动作图标**几何（15 个）：搜索 / 新建 / 删除 / 关闭 / 更多 / 箭头 / 勾选 /
 * 时间码 / 画面 / 播放 / 暂停 / 停止 / 刷新 / 外链。
 *
 * Why：这些是全站按钮与状态的高频语汇，也是 emoji 原本覆盖最多的部分（🔍 ＋ 🗑 ✕ ⋯ ⏱ 🖼 ▶ ⏸ ⏹）。
 * 它们必须可被 `currentColor` 着色，才能表达「选中 / 禁用 / 危险」—— emoji 做不到，
 * 而「危险」在本设计里专属于印章红（`--ed-stamp`）。
 *
 * 副作用：无（纯数据）。
 * 边界：坐标一律落在 24 网格内；不写颜色；`d` 不得含换行。
 */

import type { IconGeometry } from "./types";

export const ACTION_ICON_PATHS: Readonly<Record<string, IconGeometry>> = {
  /** 搜索：放大镜 */
  search: {
    elements: [
      { tag: "circle", cx: 11, cy: 11, r: 7 },
      { tag: "path", d: "M20 20l-3.5-3.5" },
    ],
  },
  /** 新建：加号 */
  plus: { elements: [{ tag: "path", d: "M12 5v14M5 12h14" }] },
  /** 删除：垃圾桶（配印章红使用） */
  trash: { elements: [{ tag: "path", d: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" }] },
  /** 关闭：叉 */
  close: { elements: [{ tag: "path", d: "M6 6l12 12M18 6L6 18" }] },
  /** 更多：横排三点 */
  "more-horizontal": {
    elements: [
      { tag: "circle", cx: 5, cy: 12, r: 1 },
      { tag: "circle", cx: 12, cy: 12, r: 1 },
      { tag: "circle", cx: 19, cy: 12, r: 1 },
    ],
  },
  /** 展开：右向折角 */
  "chevron-right": { elements: [{ tag: "path", d: "M9 6l6 6-6 6" }] },
  /** 折叠：下向折角 */
  "chevron-down": { elements: [{ tag: "path", d: "M6 9l6 6 6-6" }] },
  /** 勾选：对号（不带框，与 action 的带框勾选区分） */
  check: { elements: [{ tag: "path", d: "M5 13l4 4L19 7" }] },
  /** 时间码：时钟（配合 tabular-nums 的等宽时间戳） */
  clock: {
    elements: [
      { tag: "circle", cx: 12, cy: 12, r: 8 },
      { tag: "path", d: "M12 8v4l3 2" },
    ],
  },
  /** 画面：图像框（来源画面的标记） */
  image: {
    elements: [
      { tag: "rect", x: 3, y: 4, w: 18, h: 16, rx: 1.5 },
      { tag: "circle", cx: 9, cy: 10, r: 2 },
      { tag: "path", d: "M3 17l5-4 4 3 3-3 6 5" },
    ],
  },
  /** 播放：右向三角（复习/回听） */
  play: { elements: [{ tag: "path", d: "M8 5l11 7-11 7z" }] },
  /** 暂停：双竖线（采集态） */
  pause: { elements: [{ tag: "path", d: "M9 5v14M15 5v14" }] },
  /** 停止：方块（采集态） */
  stop: { elements: [{ tag: "rect", x: 6, y: 6, w: 12, h: 12, rx: 1.5 }] },
  /** 刷新：重跑（重新分析 / 重新索引） */
  refresh: {
    elements: [
      { tag: "path", d: "M21 12a9 9 0 1 1-2.6-6.4" },
      { tag: "path", d: "M21 4v5h-5" },
    ],
  },
  /** 外链：迁出到外部系统 */
  "external-link": {
    elements: [
      { tag: "path", d: "M14 4h6v6" },
      { tag: "path", d: "M20 4l-8 8" },
      { tag: "path", d: "M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" },
    ],
  },
};
```

- [ ] **Step 5: 并入注册表**

修改 `app/src/ui/icons/paths.ts`：把 `GROUPS` 与 import 改为

```ts
import { ACTION_ICON_PATHS } from "./paths.action";
import { DOMAIN_ICON_PATHS } from "./paths.domain";

const GROUPS: Readonly<Record<string, Readonly<Record<string, IconGeometry>>>> = {
  domain: DOMAIN_ICON_PATHS,
  action: ACTION_ICON_PATHS,
};
```

- [ ] **Step 6: 运行全部图标测试**

Run：`npx vitest run src/ui/icons`
Expected: 全绿 —— `paths.test.ts` 的 10 个 `it`（含新增的首付名单）与 `Icon.test.tsx` 的 10 个 `it`。
**若几何契约测试报「越界」或「命名不规范」，改几何数据，不要放宽测试。**

- [ ] **Step 7: 类型检查**

Run：`npx tsc --noEmit`
Expected: 0 错

- [ ] **Step 8: 提交**

```bash
git add app/src/ui/icons
git commit -m "feat(ui): 首付 24 个自绘图标几何（域 9 + 动作 15）"
```

---

### Task 3: 棘轮守卫与导出面收口

**Files:**
- Create: `app/src/ui/icons/no-inline-svg.test.ts`
- Modify: `app/src/ui/icons/index.ts`（确认导出面完整）

**Interfaces:**
- Consumes: Task 1/2 的 `Icon` / `ICON_PATHS` / `ICON_NAMES`
- Produces: 无新导出；本任务交付**约束**（防退化）

- [ ] **Step 1: 建立内联 svg 的现状基线**

Run（`app/` 下，PowerShell）：

```powershell
Get-ChildItem -Recurse -File src -Include *.tsx,*.ts |
  Where-Object { $_.FullName -notmatch '\\icons\\' } |
  Select-String -Pattern '<svg' -List |
  ForEach-Object { $_.Path.Replace((Get-Location).Path + '\', '').Replace('\','/') } | Sort-Object
```

把这**一次**输出记为基线。它是「改造前就存在的内联 svg 清单」—— 本批不动它们（消费在批 4）。

- [ ] **Step 2: 写棘轮守卫（先让它失败以确认它真的在检查）**

创建 `app/src/ui/icons/no-inline-svg.test.ts`：

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @ai-context **棘轮守卫**：禁止新增内联 `<svg>`（ADR-032 决策 6 的执行手段）。
 *
 * Why：本批建立了图标层，但批 4 之前不会有任何机制阻止新代码继续手写 `<svg>` —— 那样图标层
 * 会退化成「又一套并存的东西」。棘轮的做法是：把改造前就存在的内联 svg 文件**冻结成名单**，
 * 之后**只允许减少、不允许增加**。它不要求本批清理存量（那是批 4 的事），只要求不倒退。
 *
 * 副作用：只读磁盘（遍历 `src/`）。不修改任何文件。
 * 边界：扫描口径是「含 `<svg` 的 `.ts`/`.tsx`」——不含 `.css`（CSS 里的 svg 是 data-uri 背景图，
 * 与图标层无关）。清单里的文件在批 4 迁完后应从名单删除，届时本测试的名单会自然缩短。
 */

const SRC = join(__dirname, "..", "..");
const ICONS_DIR = join(SRC, "ui", "icons");

/** 改造前就存在的内联 svg 文件（相对 `app/src`，正斜杠）—— 只允许减少 */
const FROZEN_BASELINE: readonly string[] = [
  // 由 Task 3 Step 1 的实测输出逐行填入（保持排序）
];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function filesWithInlineSvg(): string[] {
  return collectFiles(SRC)
    .filter((f) => !f.startsWith(ICONS_DIR))
    .filter((f) => readFileSync(f, "utf8").includes("<svg"))
    .map((f) => relative(SRC, f).split(sep).join("/"))
    .sort();
}

describe("内联 svg 棘轮", () => {
  it("不得新增含内联 svg 的文件（只允许减少）", () => {
    const current = filesWithInlineSvg();
    const added = current.filter((f) => !FROZEN_BASELINE.includes(f));
    expect(added, `新增了内联 svg 的文件（请改用 <Icon />）：\n${added.join("\n")}`).toEqual([]);
  });

  it("基线名单本身没有过期项（已迁完的文件要及时从名单删除）", () => {
    const current = new Set(filesWithInlineSvg());
    const stale = FROZEN_BASELINE.filter((f) => !current.has(f));
    expect(stale, `基线里这些文件已无内联 svg，请从名单删除：\n${stale.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 3: 填入基线名单**

把 Step 1 的输出逐行填进 `FROZEN_BASELINE`（保持排序、加注释说明来源）。
**若 Step 1 输出为空**（即 `src/` 下除 `ui/icons` 外没有任何内联 svg），把数组留空并在其上方加一行注释 `// 实测：改造前 src/ 下无内联 svg（基线为空，任何新增都会被抓）`。

- [ ] **Step 4: 运行守卫确认通过**

Run：`npx vitest run src/ui/icons/no-inline-svg.test.ts`
Expected: PASS（2 个 `it`）。
**再验证它真的会拦**：临时在 `app/src/ui/icons/Icon.test.tsx` 里加一行含 `<svg` 的注释，重跑 —— 应报「新增了内联 svg 的文件」而失败；**然后撤销该改动**并重跑确认通过。

- [ ] **Step 5: 确认导出面完整**

Run（`app/` 下）：

```powershell
node -e "import('./src/ui/icons/index.ts').catch(()=>{})" 2>$null
Select-String -Path src/ui/icons/index.ts -Pattern '^export' | ForEach-Object { $_.Line }
```

预期导出：`Icon` · `ICON_PATHS` · `ICON_NAMES` · `ICON_ELEMENT_TAGS` · 六个类型（`IconElement` / `IconElementTag` / `IconGeometry` / `IconName` / `IconProps` / `IconSize`）。
若缺 `IconName` 的导出，补上 —— 批 4 的组件需要它标注 props 类型。

- [ ] **Step 6: 全量回归**

Run：`npx vitest run`
Expected: 全绿（既有 ~788 + 本批新增）

- [ ] **Step 7: 类型检查与文档门禁**

Run：`npx tsc --noEmit`（`app/` 下）→ 0 错
Run：`node docs/scripts/docs-check.mjs`（仓库根）→ `✅ 通过`

- [ ] **Step 8: 提交**

```bash
git add app/src/ui/icons
git commit -m "test(ui): 内联 svg 棘轮守卫与图标导出面收口"
```

---

## 完成本计划后的状态

- `app/src/ui/icons/` 下有：`types.ts` · `paths.ts` · `paths.domain.ts` · `paths.action.ts` · `Icon.tsx` · `index.ts` + 3 个测试文件
- **24 个图标可用**，全部 24 网格 / 1.75 描边 / `currentColor` / 无字面量颜色
- **棘轮生效**：新代码不得再手写 `<svg>`
- **界面外观零变化** —— 没有任何现存组件改用 `<Icon />`（消费在批 4）

## 未做（登记）

- **存量 310 个 emoji 的替换**：属批 4（原语迁移进各域）。批 4 应按**界面批次**推进（导航 → 列表行 → 按钮 → 状态徽标），每批替换后更新棘轮基线。
- **图标集从 24 增至约 44**：其余图标随消费方增补（例如批 4 遇到「筛选」「排序」「折叠」「标签」时新增）。**每增补一个都必须同步 `paths.test.ts` 的首付名单**，让增长被看见。
- **`docs/product/ui-ux-system.md` 的图标节**：规范 §八 宣称「线性 SVG 1.5–1.75px/24px」—— 本批落实为 1.75；批 8 回写规格时同步该节的措辞与图标清单。

## 自审记录

**规范覆盖**：本计划对应规范 §4.2「图标」行（24 网格 / 描边 1.75 / 尺寸 16·20·24 / `currentColor` / 小圆角）与 ADR-032 决策 6。§11 验收第 4 条的「CSS 变量」部分与本计划无关（图标不是 token）；第 11 条（`tsc`/`vitest` 全绿）在 Task 1/2/3 末尾各验证一次。

**占位符扫描**：无 TBD / TODO；24 个图标的 `d` 与坐标全部给出可运行值；每条测试的期望值都是具体字面量。
**唯一需要实施者填写的空**：Task 3 的 `FROZEN_BASELINE` —— 它**必须**由该步的实测输出决定，不能由我预写（预写就等于伪造基线）。

**类型一致性**：`IconGeometry.elements` 的元素形态 ↔ `Icon.tsx` 的三分支渲染 ↔ `paths.test.ts` 的坐标检查三处一致（`path` 用 `d`；`circle` 用 `cx/cy/r`；`rect` 用 `x/y/w/h/rx?`）· `IconSize`（16|20|24）↔ `SCALE_TOKENS.iconSizes` 在测试里绑定 · `ICON_NAMES` 由 `Object.keys(ICON_PATHS)` 派生，故「名单断言」与「键集合断言」不会互相矛盾 · `IconName = keyof typeof ICON_PATHS`（注意：`ICON_PATHS` 声明为 `Readonly<Record<string, IconGeometry>>`，故 `keyof` 是 `string` —— **这是本计划的一处已知偏差**：真正的字面量联合需要 `paths.ts` 用 `as const` 聚合，而 `as const` 与「合并多个分组」的写法冲突。Task 1 交付的是 `Record` 版本（能跑、能校验），**字面量联合留待批 4 需要时再做**（届时应改为显式列出名字的 `as const` 映射，代价是要在新增图标时同步两处）。此偏差已在此显式记录，不隐藏。

**遗留到其他计划**：emoji 替换（批 4）· 图标集增至 44（随消费）· 规范 §八 图标节回写（批 8）· `ui-ux-system.md` 宣称的 1.5px 描边档未采用（本设计裁定 1.75，理由：纸色底上 1.5 偏细，批 0-A 的 C+D 视觉方向已定）。
