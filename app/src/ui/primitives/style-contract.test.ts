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
import type { ModalSize } from "./Modal";
import type { StatusKind } from "./StatusLine";
import type { SurfaceLevel, SurfaceRadius } from "./Surface";
import type { TextFont, TextSize, TextTone } from "./Text";
import type { ToastKind } from "./Toast";
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
  { union: "SurfaceRadius", css: "Surface.css", members: RADIUS_CLASS, expected: 4 },
  { union: "ButtonVariant", css: "Button.css", members: VARIANT_CLASS, expected: 3 },
  { union: "ButtonSize", css: "Button.css", members: BTN_SIZE_CLASS, expected: 3 },
  { union: "StatusKind", css: "StatusLine.css", members: STATUS_CLASS, expected: 4 },
  { union: "ToastKind", css: "Toast.css", members: TOAST_CLASS, expected: 3 },
  { union: "ModalSize", css: "Modal.css", members: MODAL_SIZE_CLASS, expected: 3 },
];

describe("契约完整性锚：类型联合 ↔ CSS 类规则（给联合加一档而忘改任一侧，必须变红）", () => {
  it("10 个联合的档数与契约表逐条一致", () => {
    expect(CONTRACTS).toHaveLength(10);
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
 * 「基类名单」= 每一类原语的**根类**（动效挂在它身上、必须被 `motion.css` 的媒体查询压住的选择器）。
 * ⚠️ 判据只到基类，**不含**修饰类与子元素类：`.ed-modal-head/body/foot`（T7 子元素）·
 * `.ed-confirm-seal/-impacts/-keep`（T8 子元素）· `.ed-empty__title`（BEM 子元素）·
 * `.ed-empty-enter` / `.ed-toast-action`（钩子与子元素）都不是独立元素 —— 它们与基类同在一个元素上，
 * 已被同一条规则覆盖。控制方 2026-09-11 拍定（`progress.md` §十五-3）：照「全类集合 ⊇」判会在这
 * 些**非 `--` 名**上假红。
 */
const BASE_CLASSES: ReadonlyArray<readonly [file: string, base: string]> = [
  ["Text.css", "ed-text"],
  ["Surface.css", "ed-surface"],
  ["Button.css", "ed-btn"],
  ["Modal.css", "ed-modal"],
  ["Modal.css", "ed-modal-overlay"],
  ["ConfirmDialog.css", "ed-confirm"],
  ["Toast.css", "ed-toast"],
  ["EmptyState.css", "ed-empty"],
  ["Loading.css", "ed-loading"],
  ["Loading.css", "ed-skeleton"],
  ["Loading.css", "ed-probe"],
  ["StatusLine.css", "ed-status"],
];

/**
 * 5 个**现存非原语**的 `.ed-*` 名（T3 评审 M-4 实测）。它们不是 CSS 类 —— 是既有标识符里的子串：
 * `ed-desc`←`"updated-desc"` · `ed-label`←`note-link-linked-label` · `ed-note`←`…saved-note` ·
 * `ed-milestone-note`←`data-testid="degraded-milestone-note"` · `ed-low-confidence`←`structuredBlocks.ts:58`
 * 产出的类名串（其 `App.css` 规则已随 Task 13 删除）。任何「全树裸扫 `.ed-*`」的写法都会在这 5 个上
 * 假红 ⇒ 它们进**判据链的第一道过滤**，把「判据域 = 样式选择器」这一口径写成可执行的形式。
 */
const NON_PRIMITIVE_ED_NAMES: readonly string[] = [
  "ed-desc",
  "ed-label",
  "ed-note",
  "ed-milestone-note",
  "ed-low-confidence",
];

describe("reduced-motion 覆盖率 100%：判据 = 基类名单，不是「全类集合 ⊇」（规格 §11 验收 5）", () => {
  const motionClean = stripComments(read("motion.css"));
  const motionBlock = motionClean.slice(motionClean.indexOf("@media (prefers-reduced-motion"));
  const motionNames = [...motionBlock.matchAll(/\.(ed-[a-z0-9-]+)/g)].map((m) => m[1]);
  /** 全部 `primitives/*.css` 里出现过的 `.ed-*` 选择器名（剥注释后；含跨文件引用的基类） */
  const selectorNames = [
    ...new Set(CSS_FILES.flatMap((f) => [...stripComments(read(f)).matchAll(/\.(ed-[A-Za-z0-9_-]+)/g)].map((m) => m[1]))),
  ];

  it("名单与 `motion.css` 的媒体查询**双向**一致（漏一个 = 那类原语在 reduced-motion 下照旧动；多一个 = 死名字）", () => {
    expect(BASE_CLASSES, "基类名单不该缩水").toHaveLength(12);
    expect([...motionNames].sort()).toEqual(BASE_CLASSES.map(([, base]) => base).sort());
  });

  it("每个基类都真有规则，且宿主文件与名单一致（改名漏改名单 = 静默失去 reduced-motion 覆盖）", () => {
    for (const [file, base] of BASE_CLASSES) {
      expect(stripComments(read(file)), `${file} 缺少基类 .${base} 的规则`).toContain(`.${base} {`);
    }
  });

  it("选择器域里没有未登记的基类（修饰类 `--` / BEM 子元素 `__` / `<基类>-…` 之外一律要进名单）", () => {
    const bases = new Set(BASE_CLASSES.map(([, base]) => base));
    const unregistered = selectorNames.filter(
      (name) =>
        !NON_PRIMITIVE_ED_NAMES.includes(name) &&
        !name.includes("--") &&
        !name.includes("__") &&
        ![...bases].some((base) => name.startsWith(`${base}-`)) &&
        !bases.has(name),
    );
    expect(unregistered, `新增基类必须同时加进 motion.css 的名单与上面的 BASE_CLASSES：\n${unregistered.join("\n")}`).toEqual([]);
  });

  it("口径锚：5 个非原语名不在选择器域里（它们在 TS 标识符里；真成了 CSS 类就该从排除名单摘掉）", () => {
    expect(NON_PRIMITIVE_ED_NAMES).toHaveLength(5);
    for (const name of NON_PRIMITIVE_ED_NAMES) expect(selectorNames).not.toContain(name);
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
