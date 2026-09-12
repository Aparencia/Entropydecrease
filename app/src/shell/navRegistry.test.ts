/**
 * @ai-context 导航注册表守卫 —— 规格 §10 批 3 行「9 页全走注册表」的**机器判据**。
 *
 * Why 用 vitest 而不是 `scripts/*.mjs`：`scripts/*.mjs` 不在 `line-limits` 扫描域
 *   （批 2 follow-up #16），而 `app/src/**` 在 ⇒ 守卫自己也被 300 行红线看着。
 *
 * 判据分五层，每层都能**独立变红**、报错各自点名（每层的红都有对应的变异体实测，见 T6 报告）：
 *   ① 键集：组件表键集 = 注册表键集（9）· 唯一 · `pages/` 下每个非测试 `.tsx` 都被注册
 *      （枚举目录、不靠手写清单；且注册表**实际 import 的页面模块路径**必须与目录枚举一致）；
 *   ② 接线：每个 key 在 `App.tsx` 里确有 `page === "key"` —— 且 `App.tsx` **不直接 import 任何
 *      页面模块**、组件一律经 `navComponent("key")` 取得（这是「全走注册表」的本体）；
 *   ③ 图标：9 个图标名都在 `ui/icons` 注册表里且互不相同（拼错必须报错，不许渲染成空白）；
 *   ④ 取值口：`navEntry` / `isPageKey` 的**正样本 + 阴性样本**；
 *   ⑤ 不变量：顶栏顺序与 label 逐字冻结（T6 不许有观感变化）· `mountedPages` **只增不减**
 *      （批 2 裁决 2 的保活硬要求：访问过的页面永不卸载）。
 *
 * 口径：页面文件枚举 = `pages/*.tsx` 去掉 `*.test.tsx`（今日恰好 9 个）。
 *   ⇒ 将来加第 10 个页面文件而没登记，① 当场红（这正是「全走注册表」的意思）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_ENTRIES, NAV_ENTRIES, PAGE_COMPONENTS, isPageKey, navComponent, navEntry, type PageKey } from "./navRegistry";
import { ICON_PATHS } from "../ui/icons";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_TSX = join(SRC, "App.tsx");
const REGISTRY_TS = join(SRC, "shell", "navRegistry.ts");
const PAGES = join(SRC, "pages");
const appSource = () => readFileSync(APP_TSX, "utf8");

/** 页面文件（不含测试）—— 从目录枚举，不手写清单 */
function pageFiles(): string[] {
  return readdirSync(PAGES)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => f.replace(/\.tsx$/, ""))
    .sort();
}

/** 顶栏 8 项的**冻结**顺序与 label（逐字抄自 T6 之前的 `NAV_ITEMS`；T7 切到 `e.label` 时同提交改这里） */
const FROZEN_TOP_BAR: readonly (readonly [PageKey, string])[] = [
  ["classroom", "📡 课堂助手"],
  ["sessions", "🗂 会话"],
  ["notes", "📝 笔记"],
  ["action", "✅ 行动"],
  ["review", "🔄 复习"],
  ["chat", "💬 AI 对话"],
  ["knowledge", "🧠 体系"],
  ["goals", "🎯 目标"],
];

describe("导航注册表（规格 §10 批 3「9 页全走注册表」）", () => {
  it("① 注册表 9 项、键唯一", () => {
    expect(ALL_ENTRIES).toHaveLength(9);
    expect(new Set(ALL_ENTRIES.map((e) => e.key)).size).toBe(9);
  });

  it("① 组件表键集 = 注册表键集（两张表不许各自另立清单，双向都判）", () => {
    expect(ALL_ENTRIES.map((e) => e.key).slice().sort()).toEqual(Object.keys(PAGE_COMPONENTS).slice().sort());
  });

  it("① pages/ 下每个非测试 .tsx 都在注册表里（孤儿页面 = 没走注册表）", () => {
    const declared = new Set(ALL_ENTRIES.map((e) => `${e.key[0].toUpperCase()}${e.key.slice(1)}Page`));
    const orphans = pageFiles().filter((f) => !declared.has(f));
    expect(orphans, `这些页面文件没有登记进注册表：\n${orphans.join("\n")}`).toEqual([]);
  });

  it("① 注册表实际 import 的页面模块 = pages/ 目录枚举（第二判据：名字对不上也算没接线）", () => {
    const referenced = [...readFileSync(REGISTRY_TS, "utf8").matchAll(/["']\.\.\/pages\/([A-Za-z0-9_]+)["']/g)]
      .map((m) => m[1])
      .sort();
    // 枚举一侧非空（今日 9 个）⇒ 抽取器失效会以「差集非空」的形式变红，而不是静默判绿
    expect(pageFiles().length).toBe(9);
    expect(referenced).toEqual(pageFiles());
  });

  it("② 每个 key 都在 App.tsx 里被渲染（注册了但没接线 = 点不到）", () => {
    const app = appSource();
    const missing = ALL_ENTRIES.filter((e) => !app.includes(`page === "${e.key}"`)).map((e) => e.key);
    expect(missing, `这些 key 在 App.tsx 里没有对应的 page === 判断：\n${missing.join("\n")}`).toEqual([]);
  });

  it("② App.tsx 不直接 import 任何页面模块（页面只能经注册表到达）", () => {
    const direct = [...appSource().matchAll(/["']\.\.?\/pages\/[A-Za-z0-9_]+["']/g)].map((m) => m[0]);
    expect(direct, `App.tsx 仍在直连页面模块：\n${direct.join("\n")}`).toEqual([]);
  });

  it("② App.tsx 的 9 个页面组件标识符都取自 navComponent(key)", () => {
    const app = appSource();
    const missing = ALL_ENTRIES.filter((e) => !app.includes(`navComponent("${e.key}")`)).map((e) => e.key);
    expect(missing, `这些 key 没有从注册表取组件：\n${missing.join("\n")}`).toEqual([]);
    expect(app).toContain('type Page = PageKey;');
  });

  it("③ 图标名都在 ui/icons 注册表里，且 9 页各用一个（不重复）", () => {
    const unknown = ALL_ENTRIES.filter((e) => !(e.icon in ICON_PATHS)).map((e) => `${e.key} → ${e.icon}`);
    expect(unknown, `这些图标名没注册：\n${unknown.join("\n")}`).toEqual([]);
    expect(new Set(ALL_ENTRIES.map((e) => e.icon)).size).toBe(9);
  });

  it("④ navEntry / isPageKey：9 个 key 全是正样本，无意义串是阴性样本", () => {
    for (const e of ALL_ENTRIES) {
      expect(navEntry(e.key)).toBe(e);
      expect(isPageKey(e.key)).toBe(true);
      // 注册表条目持有的组件必须与取值口**同一个引用**（否则渲染路径与注册表脱钩、且每次渲染可能重挂载）
      expect(navComponent(e.key)).toBe(e.Component);
    }
    expect(isPageKey("not-a-page")).toBe(false);
    expect(isPageKey("")).toBe(false);
    expect(() => navEntry("not-a-page" as PageKey)).toThrow(/未注册的页面键/);
  });

  it("⑤ 顶栏 8 项顺序 + label 逐字冻结（T6 零观感变化），设置项只在注册表不在顶栏", () => {
    expect(NAV_ENTRIES.map((e) => [e.key, e.legacyLabel])).toEqual(FROZEN_TOP_BAR);
    expect(ALL_ENTRIES.map((e) => e.key)).toEqual([...FROZEN_TOP_BAR.map(([k]) => k), "settings"]);
    // 注：`NAV_ENTRIES` 的键是 8 个字面量，`e.key === "settings"` 会被 tsc 判为「无重叠比较」
    // （TS2367）⇒ 先宽成 string[] 再比（判据不变，仍能红）
    expect(NAV_ENTRIES.map((e) => e.key as string)).not.toContain("settings");
    expect(ALL_ENTRIES.map((e) => e.key as string)).toContain("settings");
  });

  it("⑤ 顶栏 label 不再在 App.tsx 里重复（同一事实不再写两遍）", () => {
    const app = appSource();
    // 判据必须是**引号定界的字面量**，不能用裸 `includes`：App.tsx 的注释里本来就有
    // 「笔记」「会话」这些词（批 1 实测 6 例子串误判），裸 includes 会把注释判成重复。
    const duplicated = ALL_ENTRIES.filter((e) => new RegExp(`["'\`]${e.legacyLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).test(app)).map(
      (e) => e.key,
    );
    expect(duplicated, `这些 label 仍在 App.tsx 里硬编码：\n${duplicated.join("\n")}`).toEqual([]);
  });

  it("⑤ 保活不变量：mountedPages 只增不减，PageSlot 用 display 门控而非卸载", () => {
    const app = appSource();
    // 只增的更新式（逐字）—— 换成「按当前页重建集合」即「切走即卸载」，是本仓禁止形态
    expect(app).toContain("prev.has(page) ? prev : new Set(prev).add(page)");
    expect(app).toContain("if (!mounted) return null;");
    expect(app).toContain('display: show ? "block" : "none"');
    expect(app).not.toMatch(/mountedPages\.delete\(/);
    expect(app).not.toMatch(/setMountedPages\(new Set\(\[page\]\)\)/);
    expect(app).not.toMatch(/setMountedPages\(\(\) =>/);
  });
});
