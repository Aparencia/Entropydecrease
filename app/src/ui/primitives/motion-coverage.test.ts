/**
 * @ai-context motion-coverage.test.ts — **`motion.css` 的 reduced-motion 覆盖守卫**（批 0-D Task 14；node 环境，无 DOM）。
 *
 * Why（两条判据，第二条堵的是 T11 评审用**真浏览器**实测出来的 Critical）：
 *   ① **基类覆盖率**（规格 §11 验收 5）：每一类原语的**根类**必须在 `motion.css` 的媒体查询名单里，
 *      且名单**双向一致** —— 漏一个 = 那类原语在 reduced-motion 下照旧动；多一个 = 死名字。
 *      判据 = **基类名单，不是「全类集合 ⊇」**：修饰类（`--`）与子元素/钩子类
 *      （`.ed-modal-head/body/foot` · `.ed-confirm-seal/-impacts/-keep` · `.ed-empty__title`）与基类同在一个
 *      元素上，已被同一条规则覆盖，逐字枚举只会假红（控制方 2026-09-11 拍定，`progress.md` §十五-3）。
 *   ② **`animation` 声明的选择器原文必须逐字进名单**：`animation-duration` / `animation-iteration-count`
 *      **不是可继承属性** ⇒ 覆盖写在宿主元素上，**伪元素拿不到**。T11 评审用 headless Chromium
 *      （`--force-prefers-reduced-motion`）实测坐实：`.ed-skeleton` 元素是 `0.001s/1` ✅，
 *      而 **`.ed-skeleton::after` 仍是 `1.2s / infinite / ed-skeleton-shimmer`** ❌ ——
 *      「让两者都静止」的计划验收当时未达成，而文本包含式断言抓不到。⇒ 判据从「基类在名单里」
 *      升级为「**每一处动画的落点**（元素或伪元素）都在名单里」。
 *
 * 副作用：只读磁盘（同目录），不修改任何文件。
 * 边界：① 判据只覆盖 `app/src/ui/primitives/` 一层；② 判据前先归一 EOL、先剥注释（本仓无 `.gitattributes`
 * 且 `core.autocrlf=true`）；③ 抽取按**规则块**做（`选择器 { 规则体 }`），不是通用 CSS parser —— 本层 CSS
 * 全部扁平、无嵌套规则、无 `@supports` 内层规则（真 parser 需要新依赖，违反「零新增依赖」）；
 * ④ 这里不重述「零颜色字面量 / 接线 / 联合契约 / 时长三方对拍」（`style-seams.test.ts` 与 `style-contract.test.ts`）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const normalizeEol = (s: string): string => s.replace(/\r\n/g, "\n");
const read = (file: string): string => normalizeEol(readFileSync(join(HERE, file), "utf8"));
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");

const CSS_FILES: readonly string[] = readdirSync(HERE).filter((f) => f.endsWith(".css"));

/** 媒体查询里列出的条目（**含伪元素原文**，如 `ed-skeleton::after`） */
const MOTION_ENTRIES: readonly string[] = (() => {
  const clean = stripComments(read("motion.css"));
  const block = clean.slice(clean.indexOf("@media (prefers-reduced-motion"));
  return [...block.matchAll(/\.([A-Za-z0-9_-]+(?:::?[A-Za-z-]+)?)/g)].map((m) => m[1]);
})();

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
 * 产出的类名串（其 `App.css` 规则已随 Task 13 删除）。任何「全树裸扫 `.ed-*`」的写法都会在这 5 个上假红。
 */
const NON_PRIMITIVE_ED_NAMES: readonly string[] = [
  "ed-desc",
  "ed-label",
  "ed-note",
  "ed-milestone-note",
  "ed-low-confidence",
];

/** 全部 `primitives/*.css` 的选择器里出现过的 `.ed-*` 类名（剥注释后；含跨文件引用的基类） */
const SELECTOR_NAMES: readonly string[] = [
  ...new Set(CSS_FILES.flatMap((f) => [...stripComments(read(f)).matchAll(/\.(ed-[A-Za-z0-9_-]+)/g)].map((m) => m[1]))),
];

/**
 * 抽取「声明了 `animation` 或 `animation-name` 的选择器**原文**」（含 `::after` 这类伪元素）。
 * 只看 `animation:` / `animation-name:` —— `animation-duration` / `animation-iteration-count` 是覆盖块
 * 自己写的属性，不是"动画落点"。
 */
function animationSelectors(): string[] {
  const out: string[] = [];
  for (const file of CSS_FILES) {
    for (const m of stripComments(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(?:^|[;\s])animation(?:-name)?\s*:/.test(m[2])) continue;
      for (const raw of m[1].split(",")) {
        const sel = raw.trim().replace(/\s+/g, " ");
        if (sel !== "" && !sel.startsWith("@")) out.push(sel);
      }
    }
  }
  return [...new Set(out)];
}

describe("reduced-motion 基类覆盖率 100%（规格 §11 验收 5：判据 = 基类名单，不是「全类集合 ⊇」）", () => {
  it("每个基类都真有规则，且都在 `motion.css` 的名单里（漏一个 = 那类原语照旧动）", () => {
    expect(BASE_CLASSES, "基类名单不该缩水").toHaveLength(12);
    for (const [file, base] of BASE_CLASSES) {
      expect(stripComments(read(file)), `${file} 缺少基类 .${base} 的规则`).toContain(`.${base} {`);
      expect(MOTION_ENTRIES, `motion.css 的 reduced-motion 名单缺基类 .${base}`).toContain(base);
    }
  });

  it("名单里没有死条目（每个条目要么是登记基类，要么是某处 `animation` 声明的选择器）", () => {
    const bases = new Set(BASE_CLASSES.map(([, base]) => base));
    const animated = new Set(animationSelectors());
    const dead = MOTION_ENTRIES.filter((entry) => !bases.has(entry) && !animated.has(`.${entry}`));
    expect(dead, `这些条目既不是基类、也不对应任何动画声明（删掉或改对名字）：\n${dead.join("\n")}`).toEqual([]);
  });

  it("选择器域里没有未登记的基类（修饰类 `--` / BEM 子元素 `__` / `<基类>-…` 之外一律要进名单）", () => {
    const bases = new Set(BASE_CLASSES.map(([, base]) => base));
    const unregistered = SELECTOR_NAMES.filter(
      (name) =>
        !NON_PRIMITIVE_ED_NAMES.includes(name) &&
        !name.includes("--") &&
        !name.includes("__") &&
        ![...bases].some((base) => name.startsWith(`${base}-`)) &&
        !bases.has(name),
    );
    expect(unregistered, `新增基类必须同时加进 motion.css 与上面的 BASE_CLASSES：\n${unregistered.join("\n")}`).toEqual([]);
  });

  it("口径锚：5 个非原语名不在选择器域里（它们在 TS 标识符里；真成了 CSS 类就该从排除名单摘掉）", () => {
    expect(NON_PRIMITIVE_ED_NAMES).toHaveLength(5);
    for (const name of NON_PRIMITIVE_ED_NAMES) expect(SELECTOR_NAMES).not.toContain(name);
  });
});

describe("★ 每一处 `animation` 声明的选择器都在名单里（`animation-*` 不可继承 ⇒ 伪元素必须逐字列）", () => {
  it("抽取本身非空（防选择器解析失效把守卫静默关掉）", () => {
    const animated = animationSelectors();
    expect(animated.length, `primitives/*.css 里应能抽到动画落点`).toBeGreaterThanOrEqual(3);
    expect(animated).toContain(".ed-skeleton::after");
  });

  it("逐条比对：缺一条即红（`.ed-skeleton::after` 被真浏览器实测打不到覆盖 —— T11 评审 Critical）", () => {
    const animated = animationSelectors();
    const uncovered = animated.filter((sel) => !MOTION_ENTRIES.includes(sel.slice(1)));
    expect(
      uncovered,
      `这些选择器声明了 animation 却不在 motion.css 的 reduced-motion 名单里（伪元素拿不到宿主元素的覆盖）：\n${uncovered.join("\n")}`,
    ).toEqual([]);
  });
});
