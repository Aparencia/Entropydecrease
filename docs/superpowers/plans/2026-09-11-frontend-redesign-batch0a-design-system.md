# 前端设计系统基座（批 0-A）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为全站建立唯一真源的 token 变量层与 z-index 标尺，并写下授权它的 ADR —— 此后所有视觉改动都经由变量，不再逐文件改内联样式。

**Architecture:** 规范数据（色阶 / 字阶 / 间距 / 圆角）存放在 `app/scripts/gen-tokens.mjs` 的纯数据 + 纯渲染函数中，由它生成 `app/src/ui/tokens.css`（运行时）与 `app/src/ui/tokens.gen.ts`（类型化数据，供测试与 TS 消费）；`app/src/ui/tokens.ts` 是手写门面，提供 `cssVar()` 与再导出。漂移测试导入生成器的纯函数、与已提交的产物逐字节比对，手改 CSS/TS 一律判失败。z-index 标尺是独立纯模块，不含颜色。

**Tech Stack:** TypeScript 5.8 · React 19 · Vite 7 · Vitest 4（全局 node 环境，按文件切 jsdom）· Node 24（ESM `.mjs`）· Tauri 2

**Spec:** `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§4 视觉基座 · §5.1 z-index 标尺 · §11 验收口径）

## Global Constraints

- **颜色值只允许出现在 `app/scripts/gen-tokens.mjs`** —— 这是 `theme.md` 的既有纪律，也是本次唯一真源。任何组件内新增 hex 一律 review 驳回。
- **变量前缀统一 `--ed-`**：规范 §4.1/§4.2 的表格为可读性省略了前缀，**实际变量名一律带 `--ed-`**（沿用项目既有意图：`theme.md` 定义过 `--ed-primary`，审计确认全库 0 处定义）。Task 1 会把这一条补回规范。
- **四档墨度的对比度是硬约束**（规范 §4.3，数字均为实测）：基准是**阅读面** `--ed-bg-surface` —— `ink-2` ≥11:1（实测亮 11.42 / 暗 11.41）· `ink-3` ≥4.5:1（5.13 / 5.82）· `ink-4` 允许 3:1（3.22 / 3.22，**过渡态，不得承载唯一关键信息；任何交互即升档；审校模式升到墨 3**）。纸底 `--ed-bg-canvas` 更低一档（`ink-2` 10.95 / 12.21），故 canvas 侧断言放宽到 ≥10.5。
- **亮档强调色不可照搬暗档**：同一颜色在两档对比度差可达 4 倍，两档各给一值。
- **时长与缓动 token 不在本计划内** —— 按规范 §4.2 留到 L4 动效（批 6）落地。
- **不往 4 个 >600 行文件里加代码**（本计划全部是新增文件，不触碰它们）。
- **不引入任何新依赖**（本计划零 npm 安装；GSAP 在批 6 才引入）。
- **`@ai-context` 注释**：每个公共模块头部必须含业务背景（AGENTS.md §3.3）。
- **单文件 ≤300 行**（AGENTS.md §3.1）。
- **测试环境**：vitest 全局 `environment: "node"`；本计划全部为纯函数测试，**不需要** `@vitest-environment jsdom`，也不需要 matchMedia（若将来需要，必须自带 `typeof window !== "undefined" && window.matchMedia?.(...)` 守卫 —— `src/test/setup.ts` 未桩 matchMedia）。
- **每步验证命令**（在 `app/` 下执行）：
  - 单测：`npx vitest run <path>`
  - 类型：`npx tsc --noEmit`
  - 文档：在仓库根 `node docs/scripts/docs-check.mjs`

---

## File Structure

| 文件 | 职责 | 新建/修改 |
|---|---|---|
| `docs/adr/ADR-032-frontend-design-system-tokens.md` | 授权 token 层、图标语言、z-index 标尺、四档墨度可及性裁决 | 新建 |
| `docs/adr/README.md` | ADR 索引登记 | 修改 |
| `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` | §4.1 补「变量前缀 `--ed-`」一句 | 修改 |
| `app/src/ui/contrast.ts` | WCAG 对比度纯函数（相对亮度 / 对比度 / AA 判定 / hex 校验） | 新建 |
| `app/src/ui/contrast.test.ts` | 上者的单测（含空值、越界、非法 hex） | 新建 |
| `app/scripts/gen-tokens.mjs` | **规范数据单一来源** + 纯渲染函数 `renderAll()` + CLI 写盘 | 新建 |
| `app/scripts/gen-tokens.test.mjs` | 生成器纯函数单测（渲染幂等、覆盖完整） | 新建 |
| `app/src/ui/tokens.css` | **生成物**：`:root` 亮档 + `[data-theme="dark"]` 暗档 | 新建（生成） |
| `app/src/ui/tokens.gen.ts` | **生成物**：类型化 token 数据 | 新建（生成） |
| `app/src/ui/tokens.ts` | 手写门面：`cssVar()`、再导出、`THEMES` | 新建 |
| `app/src/ui/tokens.drift.test.ts` | 漂移守卫：产物 === 生成器输出 | 新建 |
| `app/src/ui/zIndex.ts` | z-index 六档标尺纯模块 | 新建 |
| `app/src/ui/zIndex.test.ts` | 上者的单测 | 新建 |

> 目录 `app/src/ui/` 在本计划中新建。**本计划不修改任何现存组件** —— 消费发生在批 4。

---

### Task 1: ADR-032 与规范前缀补注

**Files:**
- Create: `docs/adr/ADR-032-frontend-design-system-tokens.md`
- Modify: `docs/adr/README.md`（索引登记）
- Modify: `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§4.1 补前缀说明）

**Interfaces:**
- Consumes: 无
- Produces: 无代码接口；本任务是 Task 3/4 的**授权前置**（AGENTS.md §11：架构级变更先写 ADR）

- [ ] **Step 1: 复制 ADR 模板并填内容**

参考既有 ADR 的格式（如 `docs/adr/ADR-018-fsrs-scheduler-adoption.md` 的短格式）。写入以下内容：

```markdown
# ADR-032：前端设计系统与 token 层落地

> 状态：已接受（2026-09-11）
> 关联：[前端重设计规格](../superpowers/specs/2026-09-11-frontend-redesign-design.md) · [theme.md](../product/theme.md) · [ui-ux-system.md](../product/ui-ux-system.md)

## 背景

前端 131 个非测试组件全部使用内联 style：实测 **2,256 处 `style={{`、仅 3 处 `className`、0 个 CSS 变量、88 个不同 hex**。
后果是**不逐文件改组件代码就无法调整任何样式** —— 布局重排与动效落地都被这一条前置阻塞。
同时 `docs/product/theme.md` 规定的「颜色值只出现在 token 定义处」全库 0 处遵守。

## 决策

1. **建立 token 变量层**，前缀统一 `--ed-`，单一真源为 `app/scripts/gen-tokens.mjs`，产物 `app/src/ui/tokens.css` 与 `app/src/ui/tokens.gen.ts` 均为生成物，手改由漂移测试判失败。
2. **色阶采用「纸 + 墨」双档体系**（视觉方向 C 活页）：亮为主档、暗为「夜读」第二档，两档各给一值 —— 因同一颜色两档对比度差可达 4 倍。
3. **四档墨度编码确定度**（材质语言 D 显影）：`ink-4` 未确认 / `ink-3` 已重打分 / `ink-2` 已确认 / `ink-1` 已改写。
4. **可及性裁决**：以阅读面 `--ed-bg-surface` 为基准 —— `ink-2` ≥11:1、`ink-3` ≥4.5:1、`ink-4` 允许 3:1（实测：亮 11.42/5.13/3.22，暗 11.41/5.82/3.22）。`ink-4` 的例外**仅限过渡态**，且必须满足：不得承载唯一关键信息、任何交互即升到 `ink-2`、进入审校模式时全体升到 ≥4.5:1。
5. **z-index 六档标尺**（t1=10 吸顶 / t2=100 常驻面板 / t3=200 锚定弹层 / t4=300 Modal+遮罩 / t5=400 Modal 内嵌 / t6=500 Toast），替代现状 32 文件 45 处硬编码的 17 个不同值。
6. **图标语言为自绘线性 SVG**（24 网格 / 描边 1.75 / 小圆角 / `currentColor`），替代 310 个 emoji（跨平台字形不一致、无法语义着色、基线抖动）。

## 后果

- 正面：样式首次可集中调校；对比度可被测试守护；图标可语义着色；后续批次不必逐文件改内联对象。
- 负面：存量 2,256 处内联 style 需按域逐步迁移（批 4），迁移期两套写法并存。
- 风险：`ink-4` 的 3:1 例外可能被误用 —— 由本 ADR 第 4 条三条约束 + review 检查兜底。
- **实证**：色阶初稿中 `--due` 亮档取 `#B26A12`，实测对纸底仅 **4.06:1**、对面 4.23:1，**低于正文 4.5:1 线**，而它要承载「记忆语义」文字（如「3 天后」）。已修正为 `#A05F10`（4.86 / 5.07）。该错误由本 ADR 要求的对比度测试在写测试阶段捕获 —— 这正是把纪律机器化的价值。

## 替代方案与否决理由

- **继续用内联 style + 约定色板**：否决。约定无法被测试守护，且 88 个 hex 已证明约定会漂移。
- **引入 Tailwind 或 CSS-in-JS**：否决。需要新依赖与构建改造，而本项目已有「脚本生成 CSS」的既有模式（`gen-mark-css.mjs`）可直接复用，成本更低。
- **只建 CSS 变量、不做生成器**：否决。无漂移守卫时 CSS 与 TS 两份数据必然分叉（现状 md/TS 双写已有先例问题）。
```

- [ ] **Step 2: 在 ADR 索引登记**

在 `docs/adr/README.md` 的 ADR 列表中，按既有格式补一行（编号紧接现有最大编号，当前最大为 ADR-031）：

```markdown
| [ADR-032](./ADR-032-frontend-design-system-tokens.md) | 前端设计系统与 token 层落地（`--ed-` 前缀单源生成 · 纸墨双档色阶 · 四档墨度的可及性裁决 · z-index 六档 · 自绘线性图标） | 已接受 |
```

- [ ] **Step 3: 规范补前缀说明**

在规格 `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` 的 §4.1 表格下方（`--link` 行之后、「对比度纪律」引用块之前）插入：

```markdown
> **变量前缀**：上表为可读性省略了前缀，**实际变量名一律带 `--ed-`**（如 `--ed-bg-canvas`、`--ed-ink-2`）。前缀沿用 `theme.md` 既有意图，并避免与第三方 CSS（katex / `@xyflow/react`）的变量碰撞。
```

- [ ] **Step 4: 校验文档**

Run（仓库根）：`node docs/scripts/docs-check.mjs`
Expected: `✅ docs-check 通过`（exit 0）。若报「失效相对链接」，检查 ADR 中的层级 —— ADR 位于 `docs/adr/`（**一层深**），因此到 `docs/superpowers/specs/` 只需**一个** `../`：`../superpowers/specs/2026-09-11-frontend-redesign-design.md`；到 `docs/product/` 同理是 `../product/…`。
> **反例（勿用）**：`../../superpowers/specs/…` 会解析到仓库根的 `superpowers/`，该目录不存在 —— docs-check 直接判失败。两个 `../` 是**规格文件自己**（位于 `docs/superpowers/specs/`，两层深）引用 `docs/Foresight/` 时才需要的层级，两者不可混用。

- [ ] **Step 5: 提交**

```bash
git add docs/adr/ADR-032-frontend-design-system-tokens.md docs/adr/README.md docs/superpowers/specs/2026-09-11-frontend-redesign-design.md
git commit -m "docs(adr): ADR-032 前端设计系统与 token 层落地"
```

---

### Task 2: WCAG 对比度纯函数

**Files:**
- Create: `app/src/ui/contrast.ts`
- Test: `app/src/ui/contrast.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `parseHex(hex: string): { r: number; g: number; b: number }` —— 支持 `#RGB` / `#RRGGBB`，非法输入抛 `Error`
  - `relativeLuminance(hex: string): number` —— 返回 0..1
  - `contrastRatio(a: string, b: string): number` —— 返回 1..21
  - `meetsAA(ratio: number, opts?: { large?: boolean }): boolean` —— 默认阈值 4.5，`large` 时 3

> Task 3 的生成器会用同一套公式（在 `.mjs` 内自带实现 —— `.mjs` 不能 import `.ts`）；本 Task 的实现是给**测试与运行时**用的权威版本，两者由 `tokens.drift.test.ts` 的策略性断言保持等价（见 Task 3 Step 6）。

- [ ] **Step 1: 写失败的测试**

创建 `app/src/ui/contrast.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { contrastRatio, meetsAA, parseHex, relativeLuminance } from "./contrast";

describe("parseHex", () => {
  it("解析 6 位 hex", () => {
    expect(parseHex("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("解析 3 位缩写 hex 并按位翻倍", () => {
    expect(parseHex("#0AF")).toEqual({ r: 0, g: 170, b: 255 });
  });

  it("大小写不敏感", () => {
    expect(parseHex("#aabbcc")).toEqual(parseHex("#AABBCC"));
  });

  it("缺 # 前缀抛错", () => {
    expect(() => parseHex("FFFFFF")).toThrow(/hex/i);
  });

  it("长度非法抛错", () => {
    expect(() => parseHex("#FFFF")).toThrow(/hex/i);
  });

  it("含非 hex 字符抛错", () => {
    expect(() => parseHex("#GGGGGG")).toThrow(/hex/i);
  });

  it("空值抛错", () => {
    expect(() => parseHex("")).toThrow(/hex/i);
  });
});

describe("relativeLuminance", () => {
  it("纯黑为 0", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });

  it("纯白为 1", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("处于 0..1 之间", () => {
    const l = relativeLuminance("#3A3A36");
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThan(1);
  });
});

describe("contrastRatio", () => {
  it("黑白对比为 21:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("同色对比为 1:1", () => {
    expect(contrastRatio("#3A3A36", "#3A3A36")).toBeCloseTo(1, 5);
  });

  it("参数顺序不影响结果", () => {
    expect(contrastRatio("#3A3A36", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#FFFFFF", "#3A3A36"),
      10,
    );
  });

  // 规范 §4.1 的四个硬数字 —— 这四个断言就是验收口径的机器化
  it("规范：ink-2 对阅读面 >= 11:1", () => {
    expect(contrastRatio("#3A3A36", "#FFFFFF")).toBeGreaterThanOrEqual(11);
  });

  it("规范：ink-2 对纸底 >= 10.5:1（纸底比面低一档，实测 10.95）", () => {
    expect(contrastRatio("#3A3A36", "#FBFAF8")).toBeGreaterThanOrEqual(10.5);
  });

  it("规范：ink-3 对纸底 >= 4.5:1", () => {
    expect(contrastRatio("#6E6E68", "#FBFAF8")).toBeGreaterThanOrEqual(4.5);
  });

  it("规范：due 亮档达标（原 #B26A12 仅 4.06:1，低于正文线，已改 #A05F10）", () => {
    expect(contrastRatio("#A05F10", "#FBFAF8")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#A05F10", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    // 反例守门：旧值不得回归
    expect(contrastRatio("#B26A12", "#FBFAF8")).toBeLessThan(4.5);
  });

  it("规范：ink-4 对纸底允许低于 4.5 但不低于 3:1", () => {
    const r = contrastRatio("#909088", "#FBFAF8");
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThan(4.5);
  });

  it("规范：暗档 ink-4 对暗面 >= 3:1", () => {
    expect(contrastRatio("#6E6A62", "#1C1A18")).toBeGreaterThanOrEqual(3);
  });

  it("规范：暗档 ink-2 对暗面 >= 11:1", () => {
    expect(contrastRatio("#D6D1C8", "#1C1A18")).toBeGreaterThanOrEqual(11);
  });

  it("亮档强调色若照搬暗档会不合格（反例守门）", () => {
    // 规范 §4.1：同一颜色两档差异可达 4 倍 —— 此断言防止有人把两档合并成一个值
    expect(contrastRatio("#17C3B2", "#FFFFFF")).toBeLessThan(3);
  });
});

describe("meetsAA", () => {
  it("正文阈值 4.5", () => {
    expect(meetsAA(4.5)).toBe(true);
    expect(meetsAA(4.49)).toBe(false);
  });

  it("大字阈值 3", () => {
    expect(meetsAA(3, { large: true })).toBe(true);
    expect(meetsAA(2.99, { large: true })).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（`app/` 下）：`npx vitest run src/ui/contrast.test.ts`
Expected: FAIL —— `Failed to resolve import "./contrast"`

- [ ] **Step 3: 写最小实现**

创建 `app/src/ui/contrast.ts`：

```ts
/**
 * @ai-context 前端设计系统的对比度纯函数（ADR-032）。
 *
 * Why：规范 §4.3 允许「未确认档 3.1:1」这一有意识的 AA 例外，例外必须可被机器守护 ——
 * 否则它会在后续批次里悄悄扩散成「随便用淡色」。本模块是那一守护的度量基础。
 *
 * 副作用：无（纯函数，不触 DOM、不读环境）。
 * 边界：仅接受 `#RGB` / `#RRGGBB`；不接受 rgb()/hsl()/具名色 —— 让非法输入尽早炸掉，
 * 而不是静默返回一个错误的对比度（防御性优先于宽容）。
 */

/** 6 位 hex 的最小/最大合法长度（含 `#`） */
const HEX_LENGTHS = new Set([4, 7]);

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * 解析 hex 颜色。非法输入抛错而**不**回退默认值 —— 静默回退会让对比度断言失去意义。
 * @throws Error 当输入不是 `#RGB` / `#RRGGBB` 形式时
 */
export function parseHex(hex: string): Rgb {
  if (typeof hex !== "string" || !hex.startsWith("#") || !HEX_LENGTHS.has(hex.length)) {
    throw new Error(`无效 hex 颜色：${JSON.stringify(hex)}（需 #RGB 或 #RRGGBB）`);
  }
  const raw = hex.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(`无效 hex 颜色：${JSON.stringify(hex)}（含非 hex 字符）`);
  }
  // 3 位缩写的语义是「每位翻倍」（#0AF → #00AAFF），不是左侧补零
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** sRGB 分量线性化（WCAG 2.1 定义，阈值 0.03928） */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 相对亮度，返回 0（黑）..1（白） */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 对比度，返回 1..21；参数顺序不影响结果 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA 判定：正文 4.5:1，大字（≥18.66px 粗体或 ≥24px）3:1 */
export function meetsAA(ratio: number, opts: { large?: boolean } = {}): boolean {
  return ratio >= (opts.large ? 3 : 4.5);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run：`npx vitest run src/ui/contrast.test.ts`
Expected: PASS（全部 20 个断言）。若某个「规范」断言失败，说明规范表格里的数字与实现不符 —— **改实现前先回查规范**。

- [ ] **Step 5: 类型检查**

Run：`npx tsc --noEmit`
Expected: 0 错

- [ ] **Step 6: 提交**

```bash
git add app/src/ui/contrast.ts app/src/ui/contrast.test.ts
git commit -m "feat(ui): 对比度纯函数（WCAG 相对亮度/对比度/AA 判定）"
```

---

### Task 3: token 单一真源与生成产物

**Files:**
- Create: `app/scripts/gen-tokens.mjs`（规范数据 + 纯渲染 + CLI）
- Create: `app/scripts/gen-tokens.test.mjs`
- Create（由脚本生成后提交）: `app/src/ui/tokens.css` · `app/src/ui/tokens.gen.ts`
- Create: `app/src/ui/tokens.ts`（手写门面）
- Create: `app/src/ui/tokens.drift.test.ts`

**Interfaces:**
- Consumes: Task 2 的对比度公式（**在 `.mjs` 内自带等价实现** —— `.mjs` 无法 import `.ts`）
- Produces:
  - `renderAll(): { css: string; ts: string }` —— 从 `scripts/gen-tokens.mjs` 具名导出（供漂移测试 import）
  - `COLOR_TOKENS: readonly ColorToken[]` · `ColorToken = { name: string; light: string; dark: string; usage: string }` —— 从 `src/ui/tokens.gen.ts` 导出，`name` **不含** `--ed-` 前缀
  - `SCALE_TOKENS: { readonly fontFamilyBody: string; readonly fontFamilyUi: string; readonly fontFamilyMono: string; readonly typeScale: readonly string[]; readonly spaceScale: readonly number[]; readonly radiusScale: readonly { name: string; px: number }[] }`
  - `cssVar(name: string): string` —— 返回 `` `--ed-${name}` ``，从 `src/ui/tokens.ts` 导出
  - `THEMES: readonly ["light", "dark"]`

- [ ] **Step 1: 写生成器的失败测试**

创建 `app/scripts/gen-tokens.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, renderAll, SCALE_SOURCE } from "./gen-tokens.mjs";
import { contrastRatio } from "../src/ui/contrast.ts";

describe("gen-tokens 规范数据", () => {
  it("每个 token 名唯一", () => {
    const names = COLOR_TOKENS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("两档值齐全且为合法 hex", () => {
    for (const t of COLOR_TOKENS) {
      expect(t.light, `${t.name}.light`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.dark, `${t.name}.dark`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.usage.length, `${t.name}.usage 不得为空`).toBeGreaterThan(0);
    }
  });

  it("规范 §4.1 的 16 个颜色 token 一个不少", () => {
    expect(COLOR_TOKENS.map((t) => t.name).sort()).toEqual([
      "bg-canvas", "bg-raised", "bg-sunken", "bg-surface",
      "border", "border-strong",
      "due", "ink-1", "ink-2", "ink-3", "ink-4",
      "link", "mark-clip", "ok", "overlay", "stamp",
    ]);
  });

  it("四档墨度在两档下都满足规范对比度（面为正文基准，纸放宽半档）", () => {
    const by = (n) => COLOR_TOKENS.find((t) => t.name === n);
    const base = CONTRAST_BASELINE;
    for (const theme of ["light", "dark"]) {
      expect(contrastRatio(by("ink-2")[theme], base[theme].surface), `${theme} ink-2/面`).toBeGreaterThanOrEqual(11);
      expect(contrastRatio(by("ink-3")[theme], base[theme].surface), `${theme} ink-3/面`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(by("ink-4")[theme], base[theme].surface), `${theme} ink-4/面`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(by("ink-2")[theme], base[theme].canvas), `${theme} ink-2/纸`).toBeGreaterThanOrEqual(10.5);
      expect(contrastRatio(by("ink-4")[theme], base[theme].canvas), `${theme} ink-4/纸`).toBeGreaterThanOrEqual(3);
    }
  });

  it("语义色在两档下都达 AA 正文线（修掉现状 #9CA3AF 的 2.54:1）", () => {
    const by = (n) => COLOR_TOKENS.find((t) => t.name === n);
    const base = CONTRAST_BASELINE;
    for (const theme of ["light", "dark"]) {
      for (const name of ["link", "stamp", "ok", "due"]) {
        expect(contrastRatio(by(name)[theme], base[theme].surface), `${theme} ${name}/面`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(by(name)[theme], base[theme].canvas), `${theme} ${name}/纸`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("renderAll", () => {
  it("是纯函数：两次调用结果逐字节相同", () => {
    expect(renderAll()).toEqual(renderAll());
  });

  it("CSS 含 :root 亮档与 [data-theme=\"dark\"] 暗档", () => {
    const { css } = renderAll();
    expect(css).toContain(":root");
    expect(css).toContain('[data-theme="dark"]');
  });

  it("每个颜色 token 在两档各出现一次，且带 --ed- 前缀", () => {
    const { css } = renderAll();
    for (const t of COLOR_TOKENS) {
      const varName = `--ed-${t.name}`;
      const hits = css.split(varName).length - 1;
      // 亮档 1 次 + 暗档 1 次；overlay 两档同值仍各写一次（可读性优先于去重）
      expect(hits, `${varName} 出现次数`).toBe(2);
    }
  });

  it("CSS 不含未加前缀的裸底色变量（防碰撞）", () => {
    const { css } = renderAll();
    expect(css).not.toMatch(/^\s*--bg-/m);
    expect(css).not.toMatch(/^\s*--ink-/m);
  });

  it("TS 产物导出 COLOR_TOKENS 与 SCALE_TOKENS", () => {
    const { ts } = renderAll();
    expect(ts).toContain("export const COLOR_TOKENS");
    expect(ts).toContain("export const SCALE_TOKENS");
    expect(ts).toContain("此文件由 scripts/gen-tokens.mjs 生成");
  });

  it("SCALE_SOURCE 覆盖三组字族、字阶、间距、圆角", () => {
    expect(SCALE_SOURCE.fontFamilyBody).toContain("Source Han Serif SC");
    expect(SCALE_SOURCE.fontFamilyMono).toContain("JetBrains Mono");
    expect(SCALE_SOURCE.spaceScale).toEqual([4, 8, 12, 16, 24, 32, 48]);
    expect(SCALE_SOURCE.radiusScale.map((r) => r.px)).toEqual([3, 5, 8, 10]);
    expect(SCALE_SOURCE.typeScale.length).toBeGreaterThanOrEqual(6);
  });

  it("字阶下界为 12px（规范：消灭 10px/11px）", () => {
    const sizes = SCALE_SOURCE.typeScale.map((s) => Number.parseFloat(s));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（`app/` 下）：`npx vitest run scripts/gen-tokens.test.mjs`
Expected: FAIL —— `Failed to resolve import "./gen-tokens.mjs"`

> 注：`vitest.config.ts` 的 `include` 只匹配 `src/**/*.test.ts(x)`，故本文件需显式路径运行；同时把它加进 include 见 Step 7。

- [ ] **Step 3: 写生成器**

创建 `app/scripts/gen-tokens.mjs`：

```js
#!/usr/bin/env node
/**
 * @ai-context 前端设计系统 token 的**单一真源**（ADR-032）。
 *
 * Why：全站原有 88 个硬编码 hex、0 个 CSS 变量，样式无法治理。本脚本持有规范数据
 * （色阶/字阶/间距/圆角），并生成两个产物供运行时与测试消费 ——
 * 手改产物会被 src/ui/tokens.drift.test.ts 判失败。
 *
 * 用法：
 *   node scripts/gen-tokens.mjs          # 写盘（覆盖产物）
 *   node scripts/gen-tokens.mjs --check  # 只校验，不写盘；有漂移则 exit 1
 *
 * 副作用：无参数时写 app/src/ui/tokens.css 与 app/src/ui/tokens.gen.ts 两个文件。
 * 边界：颜色值**只允许出现在本文件**（theme.md 纪律）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_CSS = join(HERE, "..", "src", "ui", "tokens.css");
const OUT_TS = join(HERE, "..", "src", "ui", "tokens.gen.ts");

/**
 * 对比度基准（规范 §4.1）：「面」是正文实际所在的底，「纸」是窗口底。
 * 两者相差约半档（ink-2 面对面 11.42、对纸 10.95），故断言按底分别设阈值。
 */
export const CONTRAST_BASELINE = {
  light: { canvas: "#FBFAF8", surface: "#FFFFFF" },
  dark: { canvas: "#141312", surface: "#1C1A18" },
};

/** 颜色 token：name 不带 --ed- 前缀；两档各一值（规范 §4.1） */
export const COLOR_TOKENS = [
  { name: "bg-sunken", light: "#F1EEE7", dark: "#100F0E", usage: "输入槽 / 骨架 / 内嵌" },
  { name: "bg-canvas", light: "#FBFAF8", dark: "#141312", usage: "窗口底（纸）" },
  { name: "bg-surface", light: "#FFFFFF", dark: "#1C1A18", usage: "卡片 / 列 / 阅读面" },
  { name: "bg-raised", light: "#FFFFFF", dark: "#24211E", usage: "弹层 / 菜单 / 浮窗（亮档另加 --ed-shadow-1）" },
  { name: "border", light: "#EAE7E0", dark: "#2E2A26", usage: "横格 / 分隔" },
  { name: "border-strong", light: "#C9C4B8", dark: "#423C36", usage: "输入框 / 刻度底 / 引线" },
  { name: "ink-4", light: "#909088", dark: "#6E6A62", usage: "未确认（过渡态，3.1:1，见 ADR-032 第 4 条）" },
  { name: "ink-3", light: "#6E6E68", dark: "#9A958B", usage: "已重打分（≥4.5:1）" },
  { name: "ink-2", light: "#3A3A36", dark: "#D6D1C8", usage: "已确认 · 正文基准（≥11:1）" },
  { name: "ink-1", light: "#1A1A1A", dark: "#F5F1E8", usage: "已改写 · 唯一使用字重 +1 档的档位" },
  { name: "mark-clip", light: "#F4F1E9", dark: "#221F1B", usage: "剪报底纹（默认开，仅背景色不加边框）" },
  { name: "stamp", light: "#B3271E", dark: "#E0604F", usage: "状态戳 —— 全站唯一非中性色，绝不用于按钮" },
  { name: "ok", light: "#2F7A4F", dark: "#4FAE74", usage: "掌握 / 已毕业 / 成功回执" },
  { name: "due", light: "#A05F10", dark: "#E0A44B", usage: "到期刻度 / 低置信点线 / 记忆语义文字（亮档原 #B26A12 实测仅 4.06:1，不合格，已改）" },
  { name: "link", light: "#1F5FBF", dark: "#6E9BE8", usage: "链接 / 时间码 / 引用" },
  { name: "overlay", light: "#1A1A1A", dark: "#1A1A1A", usage: "遮罩基色（配 --ed-overlay-alpha 使用）" },
];

/** 非颜色 token：两档共用（规范 §4.2） */
export const SCALE_SOURCE = {
  fontFamilyBody: '"Source Han Serif SC", "Songti SC", SimSun, serif',
  fontFamilyUi: '"Inter", "Segoe UI Variable", "Microsoft YaHei UI", system-ui, sans-serif',
  fontFamilyMono: '"JetBrains Mono", Consolas, ui-monospace, monospace',
  /** 字阶：字号/行高·字重（规范 §4.2，下界 12px） */
  typeScale: ["25px/34px·600", "17px/24px·600", "15.5px/1.9·400", "13px/20px·400", "12px/18px·500", "11.5px/16px·500"],
  /** 间距：4 为半档，其余落 8px 网格 */
  spaceScale: [4, 8, 12, 16, 24, 32, 48],
  /** 圆角：3 印章 · 5 控件与卡 · 8 面板 · 10 浮层 */
  radiusScale: [
    { name: "stamp", px: 3 },
    { name: "control", px: 5 },
    { name: "panel", px: 8 },
    { name: "overlay", px: 10 },
  ],
  /** 遮罩透明度（配 overlay 基色） */
  overlayAlpha: 0.34,
  /** 图标规格（ADR-032 第 6 条） */
  iconGrid: 24,
  iconStroke: 1.75,
  iconSizes: [16, 20, 24],
};

const CSS_HEADER = `/*
 * tokens.css — 由 scripts/gen-tokens.mjs 生成，请勿手改。
 * 手改会被 src/ui/tokens.drift.test.ts 判失败。
 * 依据：ADR-032 · docs/superpowers/specs/2026-09-11-frontend-redesign-design.md §4
 */
`;

const TS_HEADER = `/**
 * @ai-context tokens.gen.ts — 此文件由 scripts/gen-tokens.mjs 生成，请勿手改。
 * 手改会被 src/ui/tokens.drift.test.ts 判失败。
 *
 * Why：规范数据（色阶/字阶/间距/圆角）需要同时供运行时（CSS）与测试（TS）消费。
 * 生成而非手写，是为了让两份数据不可能分叉。
 */

`;

function renderCss() {
  const light = COLOR_TOKENS.map((t) => `  --ed-${t.name}: ${t.light}; /* ${t.usage} */`).join("\n");
  const dark = COLOR_TOKENS.map((t) => `  --ed-${t.name}: ${t.dark};`).join("\n");
  return `${CSS_HEADER}
:root {
${light}

  /* 字族（界面用黑体，正文用中文衬线 —— 衬线只给正文） */
  --ed-font-body: ${SCALE_SOURCE.fontFamilyBody};
  --ed-font-ui: ${SCALE_SOURCE.fontFamilyUi};
  --ed-font-mono: ${SCALE_SOURCE.fontFamilyMono};

  /* 间距（4 为半档，仅图标内边距） */
${SCALE_SOURCE.spaceScale.map((n) => `  --ed-space-${n}: ${n}px;`).join("\n")}

  /* 圆角 */
${SCALE_SOURCE.radiusScale.map((r) => `  --ed-radius-${r.name}: ${r.px}px;`).join("\n")}

  /* 遮罩 */
  --ed-overlay-alpha: ${SCALE_SOURCE.overlayAlpha};

  /* 图标 */
  --ed-icon-stroke: ${SCALE_SOURCE.iconStroke};
}

[data-theme="dark"] {
${dark}
}
`;
}

function renderTs() {
  const colorRows = COLOR_TOKENS.map(
    (t) => `  { name: ${JSON.stringify(t.name)}, light: ${JSON.stringify(t.light)}, dark: ${JSON.stringify(t.dark)}, usage: ${JSON.stringify(t.usage)} },`,
  ).join("\n");
  return `${TS_HEADER}export interface ColorToken {
  /** 不含 \`--ed-\` 前缀；完整变量名用 \`cssVar(name)\` 组装 */
  readonly name: string;
  readonly light: string;
  readonly dark: string;
  readonly usage: string;
}

export const COLOR_TOKENS: readonly ColorToken[] = [
${colorRows}
];

export const SCALE_TOKENS = {
  fontFamilyBody: ${JSON.stringify(SCALE_SOURCE.fontFamilyBody)},
  fontFamilyUi: ${JSON.stringify(SCALE_SOURCE.fontFamilyUi)},
  fontFamilyMono: ${JSON.stringify(SCALE_SOURCE.fontFamilyMono)},
  typeScale: ${JSON.stringify(SCALE_SOURCE.typeScale)},
  spaceScale: ${JSON.stringify(SCALE_SOURCE.spaceScale)},
  radiusScale: ${JSON.stringify(SCALE_SOURCE.radiusScale)},
  overlayAlpha: ${SCALE_SOURCE.overlayAlpha},
  iconGrid: ${SCALE_SOURCE.iconGrid},
  iconStroke: ${SCALE_SOURCE.iconStroke},
  iconSizes: ${JSON.stringify(SCALE_SOURCE.iconSizes)},
} as const;

export const THEMES = ["light", "dark"] as const;
export type ThemeName = (typeof THEMES)[number];
`;
}

/** 纯渲染：返回两份产物的完整文本，不触磁盘 */
export function renderAll() {
  return { css: renderCss(), ts: renderTs() };
}

function main() {
  const check = process.argv.includes("--check");
  const { css, ts } = renderAll();
  if (check) {
    let drifted = false;
    for (const [path, want] of [[OUT_CSS, css], [OUT_TS, ts]]) {
      let have = "";
      try {
        have = readFileSync(path, "utf8");
      } catch {
        have = "";
      }
      if (have !== want) {
        console.error(`✗ 漂移：${path}（跑 node scripts/gen-tokens.mjs 重新生成）`);
        drifted = true;
      }
    }
    process.exit(drifted ? 1 : 0);
  }
  writeFileSync(OUT_CSS, css);
  writeFileSync(OUT_TS, ts);
  console.log(`✓ 已生成 ${OUT_CSS}\n✓ 已生成 ${OUT_TS}`);
}

if (process.argv[1] && process.argv[1].endsWith("gen-tokens.mjs")) main();
```

- [ ] **Step 4: 生成产物**

Run（`app/` 下）：`node scripts/gen-tokens.mjs`
Expected:
```
✓ 已生成 ...\app\src\ui\tokens.css
✓ 已生成 ...\app\src\ui\tokens.gen.ts
```

- [ ] **Step 5: 写手写门面**

创建 `app/src/ui/tokens.ts`：

```ts
/**
 * @ai-context 设计系统 token 的公共入口（ADR-032）。
 *
 * Why：产物 `tokens.gen.ts` 是生成物，直接 import 会把「生成」这一实现细节
 * 泄漏到 131 个组件里。本门面是组件唯一应 import 的入口，也是将来若要换生成策略时的
 * 唯一改动点（组件不动）。
 *
 * 副作用：无。样式变量的注入需要在 app 入口 import "./ui/tokens.css"（批 4 接线）。
 * 边界：本模块**不含颜色字面量** —— 颜色只在 scripts/gen-tokens.mjs。
 */

export { COLOR_TOKENS, SCALE_TOKENS, THEMES } from "./tokens.gen";
export type { ColorToken, ThemeName } from "./tokens.gen";

/** 组装 CSS 变量名。`cssVar("bg-canvas")` → `"--ed-bg-canvas"` */
export function cssVar(name: string): string {
  return `--ed-${name}`;
}

/** 读取 CSS 变量的引用写法，供内联 style 过渡期使用。`varRef("ink-2")` → `"var(--ed-ink-2)"` */
export function varRef(name: string): string {
  return `var(--ed-${name})`;
}
```

- [ ] **Step 6: 写漂移守卫测试**

创建 `app/src/ui/tokens.drift.test.ts`：

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, SCALE_TOKENS, THEMES, cssVar, varRef } from "./tokens";
import { renderAll, CONTRAST_BASELINE } from "../../scripts/gen-tokens.mjs";
import { contrastRatio } from "./contrast";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("token 产物漂移守卫", () => {
  it("tokens.css 与生成器输出逐字节一致（手改即失败）", () => {
    const onDisk = readFileSync(join(HERE, "tokens.css"), "utf8");
    expect(onDisk).toBe(renderAll().css);
  });

  it("tokens.gen.ts 与生成器输出逐字节一致（手改即失败）", () => {
    const onDisk = readFileSync(join(HERE, "tokens.gen.ts"), "utf8");
    expect(onDisk).toBe(renderAll().ts);
  });
});

describe("token 门面一致性", () => {
  it("COLOR_TOKENS 经由门面可见且非空", () => {
    expect(COLOR_TOKENS.length).toBe(16);
  });

  it("cssVar / varRef 加 --ed- 前缀", () => {
    expect(cssVar("ink-2")).toBe("--ed-ink-2");
    expect(varRef("ink-2")).toBe("var(--ed-ink-2)");
  });

  it("两档主题常量完整", () => {
    expect([...THEMES]).toEqual(["light", "dark"]);
  });

  it("SCALE_TOKENS 的间距与圆角与规范一致", () => {
    expect([...SCALE_TOKENS.spaceScale]).toEqual([4, 8, 12, 16, 24, 32, 48]);
    expect(SCALE_TOKENS.radiusScale.map((r) => r.px)).toEqual([3, 5, 8, 10]);
  });

  // .mjs 生成器自带对比度公式（不能 import .ts）；此处用权威实现复核它的数据，
  // 防止两套公式悄悄分叉 —— 这是「两份实现」的代价，用断言买回来。
  it("生成器数据经权威对比度实现复核仍达标", () => {
    const by = (n: string) => COLOR_TOKENS.find((t) => t.name === n);
    for (const theme of THEMES) {
      const { canvas, surface } = CONTRAST_BASELINE[theme];
      expect(contrastRatio(by("ink-2")![theme], surface), `${theme} ink-2/面`).toBeGreaterThanOrEqual(11);
      expect(contrastRatio(by("ink-3")![theme], surface), `${theme} ink-3/面`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(by("ink-4")![theme], surface), `${theme} ink-4/面`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(by("ink-2")![theme], canvas), `${theme} ink-2/纸`).toBeGreaterThanOrEqual(10.5);
      expect(contrastRatio(by("due")![theme], canvas), `${theme} due/纸`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
```

- [ ] **Step 7: 把生成器测试纳入 vitest include**

修改 `app/vitest.config.ts` 的 `include`，把 `scripts/` 纳入：

```ts
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
```

- [ ] **Step 8: 运行全部单测**

Run（`app/` 下）：`npx vitest run`
Expected: 全绿（含既有测试与新增 3 个文件）。若既有测试因 `include` 变更被重复收集，检查是否有同名文件。

- [ ] **Step 9: 类型检查**

Run：`npx tsc --noEmit`
Expected: 0 错。若 `scripts/gen-tokens.mjs` 的 import 报类型错，确认 `app/tsconfig.json` 的 `include` 是否覆盖 `scripts/`；若不覆盖则无需处理（`.mjs` 不参与类型检查，测试文件通过 vitest 的 esbuild 转译）。

- [ ] **Step 10: 验证 --check 模式可用**

Run：`node scripts/gen-tokens.mjs --check`
Expected: 无输出、exit 0。
再手动制造漂移验证守卫有效：在 `app/src/ui/tokens.css` 末尾加一行 `/* test */`，重跑 —— 应输出 `✗ 漂移：...tokens.css` 且 exit 1；**然后撤销该改动**并重跑确认 exit 0。

- [ ] **Step 11: 提交**

```bash
git add app/scripts/gen-tokens.mjs app/scripts/gen-tokens.test.mjs app/src/ui/tokens.css app/src/ui/tokens.gen.ts app/src/ui/tokens.ts app/src/ui/tokens.drift.test.ts app/vitest.config.ts
git commit -m "feat(ui): token 单一真源与生成产物（--ed- 前缀）"
```

---

### Task 4: z-index 六档标尺

**Files:**
- Create: `app/src/ui/zIndex.ts`
- Test: `app/src/ui/zIndex.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `Z_TIER: { readonly raised: 10; readonly panel: 100; readonly popover: 200; readonly modal: 300; readonly modalNested: 400; readonly toast: 500 }`
  - `zIndex(tier: ZTierName): number`，`ZTierName = keyof typeof Z_TIER`
  - `TIER_PURPOSE: Readonly<Record<ZTierName, string>>`
  - 供给批 4 的 `Modal` / 菜单 / Toast 直接 import

- [ ] **Step 1: 写失败的测试**

创建 `app/src/ui/zIndex.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { TIER_PURPOSE, Z_TIER, zIndex } from "./zIndex";
import type { ZTierName } from "./zIndex";

describe("z-index 标尺", () => {
  it("恰好六档（规范 §5.1：17 个不同值收敛到 6）", () => {
    expect(Object.keys(Z_TIER)).toHaveLength(6);
  });

  it("档位值与规范逐条一致", () => {
    expect(Z_TIER).toEqual({
      raised: 10,
      panel: 100,
      popover: 200,
      modal: 300,
      modalNested: 400,
      toast: 500,
    });
  });

  it("严格递增（顺序即语义，乱序会让叠放重新变成涌现的）", () => {
    const values = Object.values(Z_TIER);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i], `第 ${i} 档`).toBeGreaterThan(values[i - 1]);
    }
  });

  it("zIndex() 取值与常量一致", () => {
    const names = Object.keys(Z_TIER) as ZTierName[];
    for (const n of names) {
      expect(zIndex(n)).toBe(Z_TIER[n]);
    }
  });

  it("每一档都有用途说明（否则分档无法被遵循）", () => {
    for (const n of Object.keys(Z_TIER) as ZTierName[]) {
      expect(TIER_PURPOSE[n]?.length ?? 0, `${n} 缺用途说明`).toBeGreaterThan(0);
    }
  });

  it("模态档高于锚定弹层档（防菜单盖住 Modal）", () => {
    expect(Z_TIER.modal).toBeGreaterThan(Z_TIER.popover);
  });

  it("Toast 高于所有档（必须在最上层）", () => {
    const max = Math.max(...Object.values(Z_TIER));
    expect(Z_TIER.toast).toBe(max);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run：`npx vitest run src/ui/zIndex.test.ts`
Expected: FAIL —— `Failed to resolve import "./zIndex"`

- [ ] **Step 3: 写实现**

创建 `app/src/ui/zIndex.ts`：

```ts
/**
 * @ai-context 全站 z-index 六档标尺（ADR-032 决策 5）。
 *
 * Why：现状 32 个文件、45 处硬编码，出现 17 个各不相同的值，且分裂成两个不相交的段
 * （50/51/60/61 与 900/1000/1100/1150）—— 叠放顺序是**涌现的**而不是被设计的。
 * 本模块把叠放变回一个可以讨论、可以 review 的显式决策。
 *
 * 副作用：无（纯数据 + 纯函数）。
 * 边界：组件**不得**再写裸数字 z-index；新增层级必须先在此加档并说明用途。
 * 批次：消费发生在批 4（原语迁移），本批只定义不消费。
 */

export const Z_TIER = {
  /** 吸顶头 / 粘性列头 / 粘性工具栏 */
  raised: 10,
  /** 常驻面板 / AI 对话 dock / 采集浮窗 */
  panel: 100,
  /** 锚定弹层 / 右键菜单 / 颜色板 / 下拉 */
  popover: 200,
  /** Modal + 遮罩（一次只允许一个） */
  modal: 300,
  /** Modal 内再开 Modal（如弹层里选日期） */
  modalNested: 400,
  /** Toast / 全局错误 / 拖拽幽灵 */
  toast: 500,
} as const;

export type ZTierName = keyof typeof Z_TIER;

export const TIER_PURPOSE: Readonly<Record<ZTierName, string>> = {
  raised: "吸顶头 / 粘性列头 / 粘性工具栏",
  panel: "常驻面板 / AI 对话 dock / 采集浮窗",
  popover: "锚定弹层 / 右键菜单 / 颜色板 / 下拉",
  modal: "Modal + 遮罩（一次只允许一个）",
  modalNested: "Modal 内再开 Modal（如弹层里选日期）",
  toast: "Toast / 全局错误 / 拖拽幽灵",
} as const;

/** 取档位数值。用函数而非直接读常量，是为了让 Consumer 侧一眼看出「这里有层级决策」 */
export function zIndex(tier: ZTierName): number {
  return Z_TIER[tier];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run：`npx vitest run src/ui/zIndex.test.ts`
Expected: PASS（7 个断言）

- [ ] **Step 5: 全量回归**

Run（`app/` 下）：`npx vitest run`
Expected: 全绿。

Run（`app/src-tauri/` 下）：`cargo test`
Expected: 全绿（本计划未触碰 Rust，此步是「每批全绿」纪律的确认，非本计划的验证重点）。

- [ ] **Step 6: 提交**

```bash
git add app/src/ui/zIndex.ts app/src/ui/zIndex.test.ts
git commit -m "feat(ui): z-index 六档标尺（17 个散值收敛为 6 档）"
```

---

## 完成本计划后的状态

- `app/src/ui/` 下有：`contrast.ts` · `tokens.ts` · `tokens.gen.ts` · `tokens.css` · `zIndex.ts` + 3 个测试文件
- ADR-032 已合入 `docs/adr/` 并登记索引；规范 §4.1 已补前缀说明
- **界面外观零变化** —— 本计划只定义不消费，`tokens.css` 尚未被任何入口 import。这是设计意图。
- 未做（属后续计划）：图标集（0B）· 拆 4 个超限文件 + 豁免表纠偏（0C）· 原语三层 + ADR-033/034/035 + 修订 ADR-010（0D）

## 自审记录

**规范覆盖**：本计划对应规范 §4（视觉基座，除图标与动效 token 外全部）· §5.1（z-index 标尺）· §14（ADR-032 与规范回写）；§11 验收第 4 条（CSS 变量覆盖语义色/字阶/间距/圆角）在本计划达成一半 —— **时长与缓动留给批 6**；第 11 条（tsc/vitest/cargo 全绿）在每 Task 末尾验证。

**写计划过程中实测发现并修正的规范错误（3 处，已回写规格与本文档代码）**

| # | 规范原写法 | 实测 | 处置 |
|---|---|---|---|
| 1 | `ink-2` = 11.6:1 / 暗 11.5:1 | **面对 11.42 / 暗 11.41**；纸底仅 **10.95** | 规格数字按实测修正；**断言基准改为阅读面**，纸底放宽到 ≥10.5（否则 `≥11` 断言会失败） |
| 2 | `ink-3` = 5.0 / 5.9 · `ink-4` = 3.1 / 3.2 | 4.92–5.13 · 3.08–3.45 | 规格数字按实测修正（结论不变，均在阈值内） |
| 3 | `--due` 亮档 `#B26A12` 未标比值 | **4.06（纸）/ 4.23（面）—— 低于正文 4.5:1 线** | **改值为 `#A05F10`（4.86 / 5.07）**，并加「旧值不得回归」的反例断言 |

> 根因：这三个数字在规格里是**估算**的，不是实测的。已按实测回写，且把度量固化成测试（Task 2/3）—— 规格里不允许再出现未实测的对比度数字。

**占位符扫描**：无 TBD / TODO / 「类似 Task N」；所有代码块均为可运行内容；每步含具体命令与预期输出。

**类型一致性**：`ColorToken.name` 不含前缀 ↔ `cssVar()` 加 `--ed-`（唯一约定，两处注释均写明）· `CONTRAST_BASELINE` 为 `{ light: { canvas, surface }, dark: { canvas, surface } }`，Task 3 的生成器与两个测试文件的取用方式一致 · `ZTierName = keyof typeof Z_TIER` 与 `TIER_PURPOSE: Record<ZTierName, string>` 对齐 · `renderAll()` 返回 `{ css, ts }`，漂移测试按该形状解构。

**遗留到其他计划**：图标语言（规范 §4.2 图标行 → 0B）· `--ed-shadow-1/2` 的具体值（规范 §4.2「分层」行只写了「亮档补 shadow」而未给数值 —— **0D 写 Modal 时必须定值**，属已知缺口）· 字阶的 CSS 变量（本计划只把 `typeScale` 作为数据导出，未生成 `--ed-text-*` 变量，因字阶消费方是原语层，0D 一并落地）· `--ed-mark-clip` 的**前景色**未定义（剪报底纹是背景色，但其上的文字用什么墨度需在 0D 定）。
