/**
 * @ai-context style-contract.test.ts — 原语层的**跨文件契约守卫**（批 0-D Task 14；node 环境，无 DOM）。
 *
 * Why（每条堵一个**实测出来**的洞；本文件与 `style-seams.test.ts` 的分工见彼处文件头）：
 *   ① **CSS 接线**：删掉 `Text.tsx` 顶部的 `import "./Text.css"` 后，其余用例**仍然全绿**（类名照旧
 *      产出、只是样式静默失效）—— 批 4 迁移时的表现是「原语上线了但界面什么都没变」（T3 评审 I-2）。
 *   ② **契约完整性锚**：既有两份测试的名单都是**手抄的**（`readonly TextTone[]` 只约束「成员属于
 *      联合」、不约束「联合成员都在」）⇒ 给联合加一档而忘改 CSS 或测试时全仓全绿（T3 评审 I-3）。
 *      本文件用 `Record<Union, …>` 全枚举（**编译期双向**）+ 档数冗余（**运行期**）钉住它。
 *   ③ **退场时长三方对拍**：JS 兜底窗口与 CSS 过渡时长漂移时不会有任何报错（T9 评审 I-3）。
 *
 * 副作用：只读磁盘（同目录），不修改任何文件。**只 import 类型**（`import type`）—— 运行时不加载任何
 * React 组件 / `.css`，故本文件留在 vitest 的默认 node 环境（无 DOM 也能跑）。
 *
 * 边界：① 判据只覆盖 `app/src/ui/primitives/` 一层（其余 `.ed-*` 名属既有代码，见 `style-seams.test.ts`
 * 的 `NON_PRIMITIVE_ED_NAMES`）；② 判据前**先剥注释**、先归一 EOL（本仓无 `.gitattributes` 且
 * `core.autocrlf=true`，逐字节断言会在别人机器上假阳性）；③ 这里**不重述** token 真源
 * （`tokens.drift.test.ts` / `contrast.test.ts`）与「零颜色字面量 / reduced-motion 覆盖」的职责。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ButtonSize, ButtonVariant } from "./Button";
import type { EmptyStateAlign } from "./EmptyState";
import type { ModalSize } from "./Modal";
import type { StatusKind } from "./StatusLine";
import type { SurfaceLevel, SurfaceRadius } from "./Surface";
import type { TextFont, TextSize, TextTone } from "./Text";
import type { ToastKind, ToastPlacement } from "./Toast";
import type { PresencePhase } from "./usePresence";

const HERE = dirname(fileURLToPath(import.meta.url));
const normalizeEol = (s: string): string => s.replace(/\r\n/g, "\n");
const read = (file: string): string => normalizeEol(readFileSync(join(HERE, file), "utf8"));
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");

const ENTRIES: readonly string[] = readdirSync(HERE);
const CSS_FILES: readonly string[] = ENTRIES.filter((f) => f.endsWith(".css"));
const MODULES: readonly string[] = ENTRIES.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

/** 样式表 → 其**宿主模块**：`motion.css` 没有同名组件，宿主是唯一导出面 barrel `index.ts` */
function ownerOf(css: string): string {
  const base = css.replace(/\.css$/, "");
  return base === "motion" ? "index.ts" : `${base}.tsx`;
}

describe("CSS 接线守卫：每个 primitives/*.css 必须被其同名模块 import（删掉那行 = 类名对、样式没了）", () => {
  it("逐个样式表被宿主模块 import（`index.ts` 是 `motion.css` 的宿主）", () => {
    expect(CSS_FILES.length, "primitives/ 下的样式表数量不应减少").toBeGreaterThanOrEqual(10);
    for (const css of CSS_FILES) {
      const owner = ownerOf(css);
      expect(MODULES, `${css} 没有同名宿主模块 ${owner}`).toContain(owner);
      expect(
        read(owner),
        `${owner} 缺 \`import "./${css}";\` —— 类名仍会产出，但样式静默失效（其余用例全绿，最难归因）`,
      ).toContain(`import "./${css}";`);
    }
  });

  it("反向：模块 import 的每个 `./x.css` 都必须真实存在（悬空 import 会被打包器静默放过）", () => {
    const dangling: string[] = [];
    for (const mod of MODULES) {
      for (const m of stripComments(read(mod)).matchAll(/import\s+"\.\/([A-Za-z0-9._-]+\.css)"/g)) {
        if (!CSS_FILES.includes(m[1])) dangling.push(`${mod} → ${m[1]}`);
      }
    }
    expect(dangling, `import 了不存在的样式表：\n${dangling.join("\n")}`).toEqual([]);
  });
});

/*
 * 联合 → (样式宿主, 成员 → 类名) 的全枚举表。**两层机制，缺一不成**：
 *   ① 编译期：`Record<TextTone, string>` **双向** —— 联合加档而不加键 = TS2739；加了联合里没有的键 = TS2353。
 *   ② 运行期：`vitest` 用 esbuild 剥类型、**不做类型检查** ⇒ 只靠 ① 时「加档 + 补键与 CSS」会全绿；
 *      表里的 `expected` 档数就是这个**故意的冗余**（它逼你回来确认一次契约：三处都改了才算完成）。
 */
const TONE_CLASS: Record<TextTone, string> = {
  "ink-1": "ed-text--ink-1",
  "ink-2": "ed-text--ink-2",
  "ink-3": "ed-text--ink-3",
  "ink-4": "ed-text--ink-4",
  stamp: "ed-text--stamp",
  ok: "ed-text--ok",
  due: "ed-text--due",
  link: "ed-text--link",
  inherit: "ed-text--inherit",
};
const SIZE_CLASS: Record<TextSize, string> = {
  1: "ed-text--s1",
  2: "ed-text--s2",
  3: "ed-text--s3",
  4: "ed-text--s4",
  5: "ed-text--s5",
  6: "ed-text--s6",
};
const FONT_CLASS: Record<TextFont, string> = {
  ui: "ed-text--font-ui",
  body: "ed-text--font-body",
  mono: "ed-text--font-mono",
};
const LEVEL_CLASS: Record<SurfaceLevel, string> = {
  sunken: "ed-surface--sunken",
  canvas: "ed-surface--canvas",
  surface: "ed-surface--surface",
  raised: "ed-surface--raised",
};
const RADIUS_CLASS: Record<SurfaceRadius, string> = {
  stamp: "ed-surface--r-stamp",
  control: "ed-surface--r-control",
  panel: "ed-surface--r-panel",
  overlay: "ed-surface--r-overlay",
  // 批 4 T17（B17 第 2 条）：切片内 `borderRadius: 999` 实测 3 处 ⇒ ≥3 ⇒ 加**药丸**档。
  // ⚠️ 这与规格 §4.2 的「四档圆角」不一致（新增第五档）⇒ 规范回写属 T18。
  pill: "ed-surface--r-pill",
};
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "ed-btn--primary",
  secondary: "ed-btn--secondary",
  ghost: "ed-btn--ghost",
};
const BTN_SIZE_CLASS: Record<ButtonSize, string> = { sm: "ed-btn--sm", md: "ed-btn--md", lg: "ed-btn--lg" };
const STATUS_CLASS: Record<StatusKind, string> = {
  error: "ed-status--error",
  warn: "ed-status--warn",
  info: "ed-status--info",
  ok: "ed-status--ok",
};
const TOAST_CLASS: Record<ToastKind, string> = { info: "ed-toast--info", ok: "ed-toast--ok", err: "ed-toast--err" };
/**
 * 批 4 Task 3（B6）：两档**位置**（`ToastPlacement`）。默认档 `viewport` 的承载类是**基类**
 * `.ed-toast` —— 组件对默认档**不渲染**修饰类（`Toast.placement.test.tsx` ①/⑤ 的精确类名断言
 * 要求默认形态与迁移前逐字相同）。本表判的是「**每个档位都有承载它的规则**」：默认档漏了基类规则
 * 仍是红，新增第三档而不给类则先红在 `Record<…>` 的编译期。`--below-nav` 的 `top` **消费
 * `var(--ed-nav-h…)`**（不许写死数值）由 `Toast.placement.test.tsx` ④ 单独判。
 */
const TOAST_PLACEMENT_CLASS: Record<ToastPlacement, string> = {
  viewport: "ed-toast",
  belowNav: "ed-toast--below-nav",
};
/** 批 4 Task 3（B6）：两档**对齐**（`EmptyStateAlign`）。默认档 `center` 的承载类同样是基类
 *  `.ed-empty`（默认档不产生修饰类，理由同上）；`--start` 的两条声明由 `EmptyState.align.test.tsx` ② 判。 */
const EMPTY_ALIGN_CLASS: Record<EmptyStateAlign, string> = { center: "ed-empty", start: "ed-empty--start" };
const MODAL_SIZE_CLASS: Record<ModalSize, string> = { s: "ed-modal--s", m: "ed-modal--m", l: "ed-modal--l" };
/** 相位不是类名而是 `[data-phase]` 属性选择器（`usePresence` 的三态协议，Modal / Toast 共用） */
const PHASE_SELECTOR: Record<PresencePhase, string> = {
  enter: '[data-phase="enter"]',
  entered: '[data-phase="entered"]',
  exit: '[data-phase="exit"]',
};

interface UnionContract {
  /** 被锚定的取值联合（名字只用于报错信息 —— 类型层由 `Record<U, …>` 的声明处强制） */
  readonly union: string;
  /** 消费该联合的样式宿主 */
  readonly css: string;
  readonly members: Readonly<Record<string, string>>;
  /** 档数（故意的运行期冗余，见上） */
  readonly expected: number;
}

const CONTRACTS: readonly UnionContract[] = [
  { union: "TextTone", css: "Text.css", members: TONE_CLASS, expected: 9 },
  { union: "TextSize", css: "Text.css", members: SIZE_CLASS, expected: 6 },
  { union: "TextFont", css: "Text.css", members: FONT_CLASS, expected: 3 },
  { union: "SurfaceLevel", css: "Surface.css", members: LEVEL_CLASS, expected: 4 },
  { union: "SurfaceRadius", css: "Surface.css", members: RADIUS_CLASS, expected: 5 },
  { union: "ButtonVariant", css: "Button.css", members: VARIANT_CLASS, expected: 3 },
  { union: "ButtonSize", css: "Button.css", members: BTN_SIZE_CLASS, expected: 3 },
  { union: "StatusKind", css: "StatusLine.css", members: STATUS_CLASS, expected: 4 },
  { union: "ToastKind", css: "Toast.css", members: TOAST_CLASS, expected: 3 },
  { union: "ToastPlacement", css: "Toast.css", members: TOAST_PLACEMENT_CLASS, expected: 2 },
  { union: "EmptyStateAlign", css: "EmptyState.css", members: EMPTY_ALIGN_CLASS, expected: 2 },
  { union: "ModalSize", css: "Modal.css", members: MODAL_SIZE_CLASS, expected: 3 },
];

describe("契约完整性锚：类型联合 ↔ CSS 类规则（给联合加一档而忘改任一侧，必须变红）", () => {
  it("12 个联合的档数与契约表逐条一致", () => {
    // 档数 = 表格行数（10 → 12：批 4 Task 3 加入 `ToastPlacement` / `EmptyStateAlign` 两行）。
    // 这条冗余断言的作用是**逼人回来确认契约**：加行而不改它 ⇒ 红（同 `expected` 的道理）。
    expect(CONTRACTS).toHaveLength(12);
    for (const c of CONTRACTS) {
      expect(Object.keys(c.members), `${c.union} 档数变了：加档必须同时改这里与 ${c.css}`).toHaveLength(c.expected);
    }
  });

  it("每个成员都有对应规则（正则含 `\\s*\\{` —— `--primary   {` 的留白写法曾被坑过，T5 评审 M-1）", () => {
    for (const c of CONTRACTS) {
      const clean = stripComments(read(c.css));
      for (const [member, cls] of Object.entries(c.members)) {
        expect(clean, `${c.union} 的 ${member} 在 ${c.css} 里缺少 .${cls} 规则`).toMatch(new RegExp(`\\.${cls}\\s*\\{`));
      }
    }
  });

  it("PresencePhase 三态在 Modal 与 Toast 上各自齐全（少一个相位 = 该段动效没有终值）", () => {
    expect(Object.keys(PHASE_SELECTOR)).toHaveLength(3);
    for (const css of ["Modal.css", "Toast.css"]) {
      const clean = stripComments(read(css));
      for (const [phase, selector] of Object.entries(PHASE_SELECTOR)) {
        expect(clean, `${css} 缺少相位 ${phase} 的规则`).toContain(selector);
      }
    }
  });
});

/**
 * 退场时长**三方对拍**（T9 评审 I-3 的通用化 —— 原来只有 Toast 一条无判据）：
 * JS 侧兜底窗口（`usePresence` 的 `exitMs`）与 CSS 侧过渡时长**必须是同一个数**，否则不会有任何报错：
 * JS 早了 = 过渡被截断（看不见出场）；JS 晚了 = 节点多残留一截（那段时间还能被点到，正是退场误触面）。
 * 三方 = 组件常量 `EXIT_MS` / 组件 CSS 的 `var(--ed-…, <n>ms)` 兜底字面量 / `motion.css` 的定值。
 * 新增原语时在表里加一行即可（表非空断言防"表被清空 = 守卫静默关掉"）。
 */
const DURATION_PAIRS: ReadonlyArray<readonly [module: string, css: string]> = [
  ["Modal.tsx", "Modal.css"],
  ["Toast.tsx", "Toast.css"],
];

describe("退场时长三方对拍：组件常量 == 组件 CSS 兜底字面量 == motion.css 定值", () => {
  const motion = stripComments(read("motion.css"));
  it("`const EXIT_MS` 与 `[data-phase=\"exit\"]` 的 `transition-duration` token 逐条相等", () => {
    expect(DURATION_PAIRS.length).toBeGreaterThanOrEqual(2);
    for (const [mod, css] of DURATION_PAIRS) {
      const constant = /const EXIT_MS = (\d+);/.exec(read(mod));
      expect(constant, `${mod} 里找不到 \`const EXIT_MS = <n>;\`（改名请同步本表）`).not.toBeNull();
      const clean = stripComments(read(css));
      const at = clean.indexOf('[data-phase="exit"]');
      expect(at, `${css} 缺少退场相位规则`).toBeGreaterThanOrEqual(0);
      const decl = /transition-duration:\s*var\(--(ed-dur-[a-z-]+),\s*(\d+)ms\)/.exec(clean.slice(at, clean.indexOf("}", at)));
      expect(decl, `${css} 的退场规则必须写 \`transition-duration: var(--ed-dur-…, <n>ms)\``).not.toBeNull();
      const jsMs = Number(constant?.[1]);
      expect(jsMs, `${mod} 的 EXIT_MS 与 ${css} 的兜底字面量不一致（漂移不报错，只表现为截断或残留）`).toBe(Number(decl?.[2]));
      expect(motion, `motion.css 的 --${decl?.[1]} 定值必须等于 ${jsMs}ms`).toContain(`--${decl?.[1]}: ${jsMs}ms;`);
    }
  });
});

/* ─────────────── 批 5 Task 5（C14①）**追加**：ViewSwitcher 的类名枚举 + 零行内 style ───────────────
 * 追加而非重写：**不动**上面 `CONTRACTS` 的 12 行、**不动**既有 6 个 `it`（R-2 裁决 ② 逐字）。
 * 为什么不进 `CONTRACTS`：那张表判的是「**取值联合** ↔ CSS 档位」（`Record<U, string>` 提供编译期
 * 双向约束）；`ViewSwitcher` 的类名**不是**从联合派生的 —— 它是 R-2 的**复用**（容器 + 段两类，基类
 * `ed-btn` 的规则属 `Button.css`）。塞进 `CONTRACTS` 就要把「12」这条既有数字改掉，正是 R-2 禁止的。
 * 类名空间的理由（段控件本质是成组的按钮 · 复用换来 0 处既有断言改动 · 诚实代价）写在
 * `ViewSwitcher.tsx` 与 `ViewSwitcher.css` 的文件头。
 */
const VIEW_SWITCHER_CLASSES: readonly string[] = ["ed-btn-group", "ed-btn--segment"];

describe("批 5（C14①）ViewSwitcher：类名枚举 ↔ CSS 规则 · 零行内 style", () => {
  const src = read("ViewSwitcher.tsx");
  // **先剥注释**：文件头大段解释类名空间与"为什么不写行内样式"，不剥会把解释算成产出/犯规
  const clean = stripComments(src);
  const css = stripComments(read("ViewSwitcher.css"));
  /** tsx 里出现的全部 `.ed-*` 名字（剥注释后）—— 它必须与枚举块**双向相等** */
  const produced: readonly string[] = [...new Set([...clean.matchAll(/\bed-[A-Za-z0-9_-]+/g)].map((m) => m[0]))].sort();

  it("枚举块与 tsx 产出的类双向相等（基类 `ed-btn` 是**复用**、不进枚举）", () => {
    expect(VIEW_SWITCHER_CLASSES, "枚举块被清空 = 本判据退化为空真").toHaveLength(2);
    // R-2 的前提：段元素必须仍带基类 `ed-btn` —— 掉了它，motion-coverage 的覆盖与四态一起失效
    expect(produced, "段元素不再带 `ed-btn` 基类（reduced-motion 覆盖会静默落空）").toContain("ed-btn");
    expect(produced.filter((c) => c !== "ed-btn"), "tsx 加了类而枚举块没跟 ⇒ 这条红").toEqual([...VIEW_SWITCHER_CLASSES].sort());
  });

  it("① 产出的每个类都有规则：新增两类在 ViewSwitcher.css，复用的基类在 Button.css", () => {
    for (const cls of VIEW_SWITCHER_CLASSES) {
      expect(css, `ViewSwitcher.css 缺少 .${cls} 的规则（类名拼错 = 静默无样式）`).toMatch(new RegExp(`\\.${cls}\\s*\\{`));
    }
    expect(stripComments(read("Button.css")), "复用的基类 `.ed-btn` 在 Button.css 里没有规则").toMatch(/\.ed-btn\s*\{/);
  });

  it('② 零行内 style（ADR-033 §4）+ `import "./ViewSwitcher.css";` 在位', () => {
    expect(clean.match(/style=\{/g) ?? [], "ViewSwitcher.tsx 出现行内 style（视觉权威必须留在类里）").toHaveLength(0);
    expect(src, '缺 `import "./ViewSwitcher.css";` —— 类名照旧产出、样式静默失效').toContain('import "./ViewSwitcher.css";');
  });

  it("③ barrel（ADR-033 §1 的唯一公共入口）：组件 + 两个类型都在 `index.ts` 的导出语句里", () => {
    const barrel = read("index.ts");
    // 三条正则各自只认**那条** `export … from "./ViewSwitcher"` 语句（不是文件里随便出现一次）
    expect(barrel, "`ViewSwitcher` 未从 barrel 导出（§1：调用点不得深导入 —— 深导入还不带 motion.css）").toMatch(
      /export \{ ViewSwitcher \} from "\.\/ViewSwitcher";/,
    );
    for (const name of ["ViewSwitcherOption", "ViewSwitcherProps"]) {
      expect(barrel, `\`${name}\` 未从 barrel 导出（漏导出 = 批 5 接线时才炸，今天还没有消费者）`).toMatch(
        new RegExp(`export type \\{[^}]*\\b${name}\\b[^}]*\\} from "\\./ViewSwitcher";`),
      );
    }
    // 阳性对照：同一批正则喂一条**不含** ViewSwitcher 的合成导出必须不命中 ⇒ 上面三条不是恒真
    const synthetic = 'export { Text } from "./Text";';
    expect(synthetic, "正则在错误样本上也命中 ⇒ 上面的断言空真").not.toMatch(/from "\.\/ViewSwitcher";/);
  });
});
