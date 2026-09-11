# 图标集（批 0-B）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用自绘线性 SVG 图标层替换 310 个 emoji（93 个文件），使图标可被 `currentColor` 语义着色、尺寸统一、并在暗色主题下不破坏三色信号体系。

**Architecture:** 图标是**纯数据 + 一个薄组件**。`paths.ts` 持有 24 个图标的几何数据（只允许 `path`/`circle`/`rect` **三种**元素，24 网格，无内联颜色），`Icon.tsx` 是唯一渲染入口（`stroke="currentColor"`、`fill="none"`、描边从 token 读、默认 `aria-hidden`），`index.ts` 收敛导出面。每个图标的几何正确性由**契约测试**保证（网格、元素白名单、无字面量颜色、`d` 非空），渲染行为由 jsdom 测试保证，另加一条**棘轮守卫**防止新代码继续写内联 `<svg>`。

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
  - `IconName` —— 由分组数据 `GROUPS` 的键派生的字面量联合（**不是**由 `ICON_PATHS` 派生：后者是宽类型查找表，从它派生会得到 `string`）
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

  it("元素只用白名单内的三种标签", () => {
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
 * 边界：几何只允许三种 SVG 元素（见 `ICON_ELEMENT_TAGS`）——**不含任何颜色字段**，
 * 颜色一律由 `currentColor` 决定。新增元素类型必须先在此登记并同步契约测试。
 */

/** 几何白名单：只用这三种，足够表达全部图标且便于穷举校验 */
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

export const DOMAIN_ICON_PATHS = {
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

// `as const` 保留各分组的**字面量键** —— 这是 `IconName` 能成为字面量联合的前提
const GROUPS = {
  domain: DOMAIN_ICON_PATHS,
} as const;

/** 供 `mergeGroups` 的 `Object.entries` 使用；宽别名不会污染上面的字面量键 */
const GROUPS_FOR_MERGE: Readonly<Record<string, Readonly<Record<string, IconGeometry>>>> = GROUPS;

function mergeGroups(): Record<string, IconGeometry> {
  const merged: Record<string, IconGeometry> = {};
  for (const [groupName, group] of Object.entries(GROUPS_FOR_MERGE)) {
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

/**
 * 由各分组的**字面量键**映射出的联合 —— **无需列出任何名字**，新增图标仍只改数据文件一处。
 * 这是本层「拼错必须在编译期报错」的执行手段：`const x: IconName = "notez"` 会报 TS2322。
 */
export type IconName = { [G in keyof typeof GROUPS]: keyof (typeof GROUPS)[G] }[keyof typeof GROUPS];
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
export type { IconElement, IconElementTag, IconGeometry, IconProps, IconSize } from "./types";
// `IconName` 由 `paths.ts` 派生（`types.ts` 只是 `import type` 它、并未导出），
// 故必须从 `./paths` 再导出 —— 从 `./types` 再导出会报 TS2459（实测）。
export type { IconName } from "./paths";
```

- [ ] **Step 4: 运行几何契约测试确认通过**

Run：`npx vitest run src/ui/icons/paths.test.ts`
Expected: PASS（8 个 `it`）

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

> **⚠️ 数据文件的注解规则（T1 修复轮实测得出 —— 违反会让 `IconName` 静默塌回 `string`，而运行时测试拦不住）**
>
> 每个分组数据导出**必须**写成：
> ```ts
> export const XXX_ICON_PATHS = { … } satisfies Record<string, IconGeometry>;
> ```
> - **不得写宽注解** `: Readonly<Record<string, IconGeometry>>` —— 它会把该分组的键退化为 `string`，而联合里混入 `string` 会让**整条 `IconName` 塌回 `string`**（T1 修复轮明确指出的风险）
> - **也不得加 `as const`** —— **此处理由已更正**：经 TS 5.8.3 实测，`as const satisfies Record<string, IconGeometry>` **并不报错**（`IconGeometry.elements` 本就是 `readonly IconElement[]`，只读性不冲突），原先「会 TS1360」的说法**是错的、已撤回**。禁用它的理由改为：**它不带来任何额外约束** —— `satisfies` 已保留字面量键并校验形状，`as const` 只是把同一份只读类型再推一遍；一份计划里并存两种写法会让人误以为二者有语义差别。**统一写不带 `as const` 的形式。**
> - `satisfies` 自身已保留字面量键 —— 这就是全部所需，不需要额外手法
>
> 并在 `paths.test.ts` 顶部加**类型层反向断言**（把「有人加回宽注解」从静默退化变成编译错）：
> ```ts
> // 类型层断言：若 IconName 塌回 string，本行编译失败（tsc --noEmit 覆盖测试文件）
> type _IconNameIsNarrow = string extends IconName ? never : true;
> const _iconNameIsNarrow: _IconNameIsNarrow = true;
> void _iconNameIsNarrow; // ⚠️ 必须读一次：本仓库开了 `noUnusedLocals`，TS 只豁免**参数**的下划线前缀，缺这行会变成 TS6133
> ```
> 注意 `paths.ts` 里的 `GROUPS` **照旧用 `as const`**（那里没有 `satisfies` 约束，不冲突）。

> **⚠️ 同时必须修掉 T1 遗留的「空转测试」缺陷（T1 任务评审的 Important 发现）**
>
> T1 交付的网格契约测试**对当时的数据完全空转**：坐标断言被 `el.tag === "circle"` / `"rect"` 守卫，而 T1 的注册表里只有 `path` 元素 ⇒ 两个分支**一次都没执行过**；且它**完全不检查 `path` 的 `d` 坐标**。本任务首次引入 circle/rect，必须把它改成真正有约束力的四条：
>
> 1. **圆四向校验**：`cx-r`、`cx+r`、`cy-r`、`cy+r` **全部**落在 `[0,24]`。原写法只查 `cx-r` 与 `cy+r`，漏掉**右溢出与上溢出**。
>    （**更正**：本计划早先举例说 `{cx:100, cy:12, r:10}` 会漏过 —— **该例举反了**，`cx-r = 90` 不在网格内、原写法会拦住；真实漏检方向是 `cx+r > 24` 与 `cy-r < 0`，例如 `{cx:20, cy:12, r:10}`。）
> 2. **`d` 必须以 `M x y` 起始，且起点落在 `[0,24]²`**
> 3. **`d` 中全部数值 token 的 `|n| ≤ 24`** —— ⚠️ **不得**写成「全部数值 ≥ 0」：相对命令（`a`/`l`/`v`/`h`）的负增量是合法语法，本批数据里实测有 **32 处**负数（如 `review` 的 `-15.5`、`refresh` 的 `-6.4`）。探针实测全部数值**最大绝对值 = 21**，故 `|n| ≤ 24` 可通过且非空转。
> 4. **各标签执行计数守卫**：累加 `path`/`circle`/`rect` 的实际访问次数并在末尾断言各自 > 0 —— 让「守卫把分支整条跳过」变成**可见的失败**，而不是一份永远全绿的空转测试。**这条是防复发的关键**，比前三条更重要。
>
> 上述四条**必须用变异探针逐条证伪过**才算完成：改坏数据 → 看测试确实失败 → 还原 → 确认 `git diff HEAD` 干净。

把 `app/src/ui/icons/paths.domain.ts` 的 `DOMAIN_ICON_PATHS` 替换为：

```ts
export const DOMAIN_ICON_PATHS = {
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
} satisfies Record<string, IconGeometry>;
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

export const ACTION_ICON_PATHS = {
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
} satisfies Record<string, IconGeometry>;
```

- [ ] **Step 5: 并入注册表**

修改 `app/src/ui/icons/paths.ts`：把 `GROUPS` 与 import 改为

```ts
import { ACTION_ICON_PATHS } from "./paths.action";
import { DOMAIN_ICON_PATHS } from "./paths.domain";

const GROUPS = {
  domain: DOMAIN_ICON_PATHS,
  action: ACTION_ICON_PATHS,
} as const;
```

- [ ] **Step 6: 运行全部图标测试**

Run：`npx vitest run src/ui/icons`
Expected: 全绿 —— `paths.test.ts` 的 **9** 个 `it`（含新增的首付名单）与 `Icon.test.tsx` 的 10 个 `it`。
（⚠️ 原写「`paths.test.ts` 的 10 个」**是我的计数错**，实为 9 —— T2 任务评审再次实测确认。实施者**没有为了凑数发明第 10 条**，处置正确。这是本计划第三次出现同类计数偏差。）
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
- Consumes: 无（本守卫只读磁盘，**不 import 图标模块** —— 它检查的是「有没有人绕开图标层」，不是图标本身）
- Produces: 无新导出；本任务交付**约束**（防退化）

> **行尾与 ESM 注意**：本仓库无 `.gitattributes` 且 `core.autocrlf=true` —— **不要用 `git stash`**，它会把源码变成 CRLF 并使 Vite 拒绝转换（批 0-A 实际踩到过）。测试文件是 ESM，**不得用 `__dirname`**（未定义），必须用 `dirname(fileURLToPath(import.meta.url))`（批 0-A 的 `tokens.drift.test.ts` 已是此写法）。

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
// ⚠️ 上面这几行 `node:*` import 需要 `app/src/node-builtins.d.ts` 里已有对应声明 ——
// 本仓库不装 `@types/node`（零新增依赖的硬约束），改由该文件内置「只声明实际用到的符号」的
// 最小环境声明。缺符号会报 **TS2305**（不是静默通过）；**正确处置是显式扩写那个声明文件**，
// 按 Node 官方签名如实书写、**不得用 `any`** —— 这正是该文件头注释自陈的边界约定。
// 原计划给出的这段代码在本仓 **`tsc` exit 2（4×TS2305：readdirSync/statSync/relative/sep）**，
// 即「Step 7 零错」在原始代码下**不可达**；批 0-B 实施者发现后按上述约定扩写了声明文件。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
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

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
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
**再验证它真的会拦** —— ⚠️ **探针必须放在 `src/ui/icons/` 之外**。原计划这里写的是「在 `Icon.test.tsx` 里加一行含 `<svg` 的注释」，**那是错的**（已修）：`Icon.test.tsx` 位于 `src/ui/icons/`，而守卫**设计性地排除**该目录（图标层的合法 svg 渲染器就在那里）⇒ 加 `<svg` **不会失败**，得到的是**假阴性**，还可能诱使实施者去删掉那条排除项。
正确做法：在 `app/src/` 下（例如新建 `src/__ratchet-probe.tsx`）写一个含 `<svg` 的临时文件 → 重跑应报「新增了内联 svg 的文件」而失败 → **删除临时文件** → 重跑确认通过 → 确认 `git status` 干净。

- [ ] **Step 5: 确认导出面完整**

Run（`app/` 下）：

```powershell
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

## 交接给批 3 / 批 4 的遗留项（0-B 交付后由控制方独立核实，2026-09-11）

> 这三项**不是**本批未完成的项 —— 本批的 4 条验收标准全部满足。它们影响的是**消费方**（批 3 壳层 / 批 4 原语迁移），故写在这里而不是留在线性任务列表里。

**1. ★ `circle` / `rect` 渲染分支零测试覆盖（缺口真实，但代码正确）**
`Icon.test.tsx` 的 10 个用例**全部只渲染 `name="notes"`**（其几何是 2 个 `path`，该文件第 57 行自己断言 `path` 数量为 2），因此 `Icon.tsx` 的 `circle` 分支、`rect` 分支、以及 **`w`→`width` / `h`→`height` 映射**没有任何断言。
- 规模（探针实测）：含 `circle` 的 **7** 个（`knowledge` `goals` `settings` `search` `more-horizontal` `clock` `image`）· 含 `rect` 的 **4** 个（`classroom` `action` `image` `stop`）⇒ **10 / 24（42%）个图标经由未覆盖的分支渲染**
- 已逐行核对 `Icon.tsx:41-42` 的映射**是正确的**，故**当前无缺陷**；风险在**将来**：改坏映射会让 10 个图标静默渲染错，而 21 个测试全绿
- ⚠️ **T1 任务评审曾预言「T2 引入 circle/rect 后自然闭合」—— 并未闭合**：T2 引入的是**数据**，`Icon.test.tsx` 自 T1 起从未被修改。**数据存在 ≠ 渲染被验。**
- ⇒ **批 3/4 补两条渲染用例**：各渲染一个 circle 图标与一个 rect 图标，**断言 DOM 属性名**（`width`/`height`/`cx`/`cy`/`r`），而不只是数 `path` 的个数。批 3 的第一个消费方就会用到 `settings`（齿轮，圆构成）与 `search`（⌘K 入口）。

**2. `Icon.tsx` 的末分支以 `return <rect>` 兜底**，而非穷尽 `switch` + `never`。
⚠️ **本节原先写的失败模式不成立，已更正**：原写「将来加入第 4 种元素时不会编译失败，而是静默渲染坐标全 `undefined` 的 rect」—— **终局评审实测证伪**：把第 4 种元素（`line`，带 `x1/y1/x2/y2`）加进 `IconElement` 联合后跑 `tsc`，兜底分支报 **5×TS2339，编译必然失败**。只有「新元素恰好也带 `x/y/w/h`」这一巧合才会静默。
⇒ **`switch` + `default: assertNever(el)` 是廉价的可读性收益，不是补洞**。**批 3/4 不必为它排期**；若顺手改，是锦上添花。（登记来源：T1 任务评审 Minor #4；失败模式由终局评审更正。）

**3. `paths.ts` 的 `mergeGroups()` 重名抛错无测试。**
⚠️ **控制方原裁定「不修改数据文件就无法构造该输入 ⇒ 接受现状」已被终局评审证伪，现撤回。** 评审者用 `vi.doMock("./paths.action") + vi.resetModules()` **在不动任何数据文件的前提下**复现了导入期抛错（真实重名 → `图标重名：notes`），且本仓**已有 46 个测试文件在用 `vi.mock`**。
⇒ **修正后的结论：可测，成本极低 —— 应补。** 二选一：① 补一条约 6 行的测试（`vi.doMock` + 动态 `import`，断言 `rejects/toThrow` 且消息含图标名）；② 按 AGENTS.md §3.1「显式依赖注入」把 `mergeGroups(groups)` 参数化（顺带让重名分支可被直接构造）。
（守卫本身是有效的：必抛、不静默 —— 问题只在「没人守这条守卫」。）

**5. `paths.ts` 的 `if (merged[name])` 走原型链（终局评审新发现，控制方已修）。**
名为 `constructor` 的图标（命名规范 `/^[a-z][a-z0-9-]*$/` **恰好放行**）即使**毫无重名**，也会因取到 `Object.prototype.constructor`（truthy）而抛「图标重名：constructor」——**误导性的启动期崩溃**，排查成本高。
⇒ **已修**：改为 `Object.prototype.hasOwnProperty.call(merged, name)`（不用 `Object.hasOwn`，它是 ES2022，而本仓 `lib` 为 ES2020）。

**6. 图标规模基数「310 个 emoji / 93 个文件」需复测。**
终局评审判用 `\p{Extended_Pictographic}` 复测为 **627 次 / 126 文件**（排除测试；含测试 694 / 146），与 `types.ts` 头注释及本计划 Goal 里写的 310 / 93 **差约 2 倍**（口径可能不同，评审者只计出现次数）。
⇒ **批 4 的规模基数须先复测再排期**；在口径确定前**不擅自改动该数字**（把一个未核实的数换成另一个未核实的数是更坏的处置）。

**4. `src/assets/react.svg` 是 Vite 模板遗留的死脚手架**（含 `<svg`，但**不在棘轮口径内** —— 守卫只扫 `.ts`/`.tsx`；看似无任何引用）。
⇒ **并入批 1（删除批）**：核实无引用后删除。此文件在建立本批基线时被发现，不是守卫的漏网。

**另记：棘轮守卫的两个已知边界**（均已登记，非缺陷）：
- 空基线（实测确实为空）下，第 2 个 `it`（基线过期项检查）**恒真休眠**，**不计入当前防护力**；批 4 迁完存量后若需特赦个别文件，它会立刻派上用场。
- 排除图标目录时**必须比较 `ICONS_DIR + sep`**（提交 `c22d2bda` 修正）：裸 `startsWith(ICONS_DIR)` 会把 `ui/icons-legacy/` 这类**同前缀兄弟目录静默豁免** —— 守卫看起来在守、实际有洞。

**批 3 可用性结论**：24 个图标**恰好覆盖壳层需求**，无缺口 —— 顶栏 8 项 = 7 域 + AI 对话（即 9 个域图标中的 8 个），第 9 个 `settings` 正是右上**齿轮**，⌘K 入口由 `search` 承担，溢出与采集态由 `chevron-*` / `play` `pause` `stop` 承担。其余约 20 个按规格「随消费方增补」。

## 自审记录

**规范覆盖**：本计划对应规范 §4.2「图标」行（24 网格 / 描边 1.75 / 尺寸 16·20·24 / `currentColor` / 小圆角）与 ADR-032 决策 6。§11 验收第 4 条的「CSS 变量」部分与本计划无关（图标不是 token）；第 11 条（`tsc`/`vitest` 全绿）在 Task 1/2/3 末尾各验证一次。

**占位符扫描**：无 TBD / TODO；24 个图标的 `d` 与坐标全部给出可运行值；每条测试的期望值都是具体字面量。
**唯一需要实施者填写的空**：Task 3 的 `FROZEN_BASELINE` —— 它**必须**由该步的实测输出决定，不能由我预写（预写就等于伪造基线）。

**类型一致性**：`IconGeometry.elements` 的元素形态 ↔ `Icon.tsx` 的三分支渲染 ↔ `paths.test.ts` 的坐标检查三处一致（`path` 用 `d`；`circle` 用 `cx/cy/r`；`rect` 用 `x/y/w/h/rx?`）· `IconSize`（16|20|24）↔ `SCALE_TOKENS.iconSizes` 在测试里绑定 · `ICON_NAMES` 由 `Object.keys(ICON_PATHS)` 派生，故「名单断言」与「键集合断言」不会互相矛盾。

**一处已被撤回的裁定（记录在案，勿重犯）**：初版计划把 `ICON_PATHS` 注解为 `Readonly<Record<string, IconGeometry>>`，导致 `IconName = keyof typeof ICON_PATHS` 实际是 **`string`**；我起初裁定「接受该偏差、留待批 4」，理由是「字面量联合需显式列出全部名字」。
**该理由已被 T1 任务评审用 `tsc` 探针证伪**：只要分组数据保留**字面量键**（`satisfies Record<string, IconGeometry>` —— 字面量键由 `satisfies` 自身保留，无需 `as const`，见 Task 2 Step 3 的注解规则），即可**零列名**地派生联合 ——
```ts
export type IconName = { [G in keyof typeof GROUPS]: keyof (typeof GROUPS)[G] }[keyof typeof GROUPS];
```
新增图标仍只改数据文件**一处**。故本计划已改为直接交付字面量联合（见 Task 1 Step 3 的 `paths.domain.ts` / `paths.ts`）。
**为什么不能留到批 4**：批 4 会写数百处 `<Icon name="…" />`，而 `name: string` 时拼错**编译期无错、现有测试也拦不住**（唯一硬编码名字在 `Icon.test.tsx`），只在运行期以 `TypeError` 白屏 —— 这正是该层 `@ai-context` 自称要防住的失败。修复窗口是 1 个图标 / 1 个分组 / **0 个调用点**。

**遗留到其他计划**：emoji 替换（批 4）· 图标集增至 44（随消费）· 规范 §八 图标节回写（批 8）· `ui-ux-system.md` 宣称的 1.5px 描边档未采用（本设计裁定 1.75，理由：纸色底上 1.5 偏细，批 0-A 的 C+D 视觉方向已定）。
