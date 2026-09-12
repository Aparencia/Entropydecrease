// @vitest-environment node
/**
 * @ai-context 批 5 **视图层架构守卫 · 图级**（Task 15；裁决 C1① / C14② / C15）。
 *
 * 把「依赖方向」与「三条硬约束的可断言部分」变成**整目录级的机器判据** —— 判据对象是
 * `app/src/views/**` 的**源码形态**，不是某个组件的单点 spy（那由 T7–T14 的行为判据承担）。
 * 三条硬约束（规格 §7.3）的**图级/结构级**那一半：
 *   ① 原文永远保留：默认视图是 `raw` ∧ 默认 spec **无 `load`**（不经惰性 ⇒ 必然常驻）。
 *   ② 非默认视图**模块级惰性**：每个非默认 spec 的 `load` 体内**恰一个 `import(`** ∧ 注册表顶部
 *      **零静态 value import**（`load` 目标集合 == 惰性目标集合 ⇒ 两边互为反向对照）。
 *   ③ C11 槽位跨两侧一致：`SessionViewHost.tsx` 与 `NotesReadingColumn.tsx` 各**恰 1 个**
 *      `data-view-error-slot`，且**位于切换器之后**（源码位置判据）。
 *
 * ★ 拆件（与 `registryResolution.test.ts` 拆 `registry.test.ts` 同因）：加 A6（props ⊇ slot 的
 *   类型级探针）后单文件 322 行 > 300 ⇒ **拆成 `architecture.guard.test.ts`（A1–A5）+**
 *   **`architecture.slots.test.ts`（A6）**，判据一条未删、零新增豁免登记。两件各自带仪器副本
 *   （本仓既有先例：拆件不建「只为测试存在的生产面 helper」）。
 * ★ A3 为什么不是「裸子串」（T8 实测的假阳性陷阱，台账 §十八 逐字）：生产文件的**注释里逐字
 *   写着**「零 `@tauri-apps` import」这条纪律，测试文件**必须** `vi.mock("@tauri-apps/api/core")`
 *   ⇒ 裸子串扫描在 `views/**` 上假红一大片。故：**先剥注释**（复用 `sliceScan.stripComments`，
 *   等长空白 ⇒ 行号不漂）→ **排除 `*.test.tsx`** → **只匹配 import/export 声明**；两个读数
 *   **并列报**。阳性对照 `components/session-detail/SessionScreenCards.tsx`（`convertFileSrc`）
 *   **必须命中**。
 * ★ A2 的口径（C10#11「`import type` 零运行时边」）：`views/registry.ts` 的**运行时**导入者
 *   **恰 2 个**（`pages/SessionsPage.tsx` / `pages/NotesPage.tsx`）；`SessionDetailPanel.tsx` /
 *   `NotesReadingColumn.tsx` / `SessionViewHost.tsx` 各 1 处 `import type` 取槽类型 ⇒ **不算导入者、
 *   也不写例外名单**（三处都是 type-only，见 ④ 的读数）。
 * ★ A2③ 的边界（**实测登记，不是判据放宽**）：`views/**` 对 `components/**` 有 4 条**真实**
 *   import（`NoteMarkdown` ×2 · `SessionScreenCard` · `NotePreviewView`）—— 前两条正是 C3/C8
 *   **要求**的复用（「复用 `NotePreviewView` 的**目标**是既定的」见 `registryResolution.test.ts:13-18`：
 *   **取数仍由 `NotePreviewView` 自己做**，适配器只是垫片）。那条「间接取数」由图级判据抓不到
 *   （本守卫的诚实边界②），去向 = A7（显式登记 + 单个具名例外）与批 6/7 的 `NotePreviewView` 处置。
 *   故 ③ 只钉**硬边**：`views/**` 不得 import `pages/**` / `shell/**`（今日读数 = 0）。
 *
 * 本守卫**不能**证明什么（诚实边界）：① 运行时是否不加载（产物级，见 T18）② 视图是否通过**间接**
 * 依赖取数（本件的 ③ 拦不住 `components/**` 那条路，见上）③ 不能替代每视图的 spy 判据（C14② 仍
 * 逐组件要求）④ A4 证的是「`load` 里有 `import(`」这个**形态**，不是「该 `import()` 只加载了一个模块」。
 * 副作用：只读源码。边界：路径全用 `fileURLToPath`（本仓路径含空格；`new URL().pathname` 不解 `%20`）。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readLines, relOf, stripComments, walkSources } from "../ui/primitives/sliceScan";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `app/src` —— 键一律是相对它的正斜杠路径（与五类棘轮同口径） */
const SRC = join(HERE, "..");

const read = (relPath: string): string => readFileSync(join(SRC, ...relPath.split("/")), "utf8");
/** 剥注释后的行数组（行号与原文一一对应 —— 顺序判据靠它） */
const stripped = (relPath: string): string[] => readLines(join(SRC, ...relPath.split("/"))).stripped;

/** 相对导入一律按「导入者所在目录」解析成 `app/src` 下的正斜杠相对路径。裸模块名 ⇒ `null`。 */
const resolveSpec = (fromRel: string, spec: string): string | null => {
  if (!spec.startsWith(".")) return null;
  const dir = dirname(fromRel).split("/").filter((s) => s !== "" && s !== ".");
  return relative(SRC, join(SRC, ...dir, ...spec.split("/"))).split(sep).join("/");
};

/**
 * 导入/导出**声明**级的说明符（仪器只有这一份实现；A1/A2/A3 与三处自证共用）。覆盖
 * `import/export … from "…"` · 副作用 `import "…"` · 动态 `import("…")`；**不匹配**注释或普通
 * 字符串里的路径 —— 这正是 A3 与「裸子串」口径的分野。行号与 `stripped` 对齐（自证要行号）。
 */
const SPECIFIER = /(?:\bfrom\s*|^\s*import\s*|\bimport\s*\(\s*)["']([^"']+)["']/;
const specifiersOf = (relPath: string): string[] =>
  stripped(relPath).map((l) => l.match(SPECIFIER)?.[1]).filter((s): s is string => s !== undefined);
const specifiersIn = (source: string): string[] =>
  stripComments(source).split(/\r?\n/).map((l) => l.match(SPECIFIER)?.[1]).filter((s): s is string => s !== undefined);
/** 已解析成 `app/src` 相对路径的判定：落在 `views/**` 子树里（`views` 本身也算） */
const isViewsRel = (resolved: string | null): boolean =>
  resolved !== null && (resolved === "views" || resolved.startsWith("views/"));
/** **某文件**里指向 `views/**` 的边（先解析再判 —— 原始写法形如 `../views/registry`） */
const viewsEdgesOf = (relPath: string): string[] =>
  specifiersOf(relPath).map((s) => resolveSpec(relPath, s)).filter(isViewsRel) as string[];

/** 域：某前缀子树下的源文件；默认只取**生产**件（测试是基建，不是被守卫的生产面）。 */
const prodUnder = (prefix: string, includeTests = false): string[] =>
  walkSources(SRC).map((abs) => relOf(SRC, abs)).filter((r) =>
    (prefix === "" || r === prefix || r.startsWith(`${prefix}/`)) && (includeTests || !/\.test\.tsx?$/.test(r)));

describe("A1 · 首屏可达面不得指向 `views/**`", () => {
  const FIRST_SCREEN = ["App.tsx", ...prodUnder("shell"), ...prodUnder("ui/primitives")];
  it("① 扫描器自证：声明级命中 / 无意义串 0 命中 / 测试文件不在域内", () => {
    const scan = (src: string): string[] =>
      specifiersIn(src).map((s) => resolveSpec("pages/X.tsx", s)).filter(isViewsRel) as string[];
    expect(scan('import { viewsFor } from "../views/registry";')).toEqual(["views/registry"]);
    expect(scan('const s = "views/registry";')).toEqual([]);
    expect(scan('// import { a } from "../views/registry";')).toEqual([]);
    expect(FIRST_SCREEN.length, "首屏域是空的（路径口径漂了 ⇒ 判据静默失效）").toBeGreaterThan(30);
    for (const anchor of ["App.tsx", "shell/ShellFallback.tsx", "ui/primitives/index.ts"]) {
      expect(FIRST_SCREEN.includes(anchor), `${anchor} 不在首屏域内 ⇒ 域过滤失效`).toBe(true);
    }
    expect(FIRST_SCREEN.some((r) => /\.test\.tsx?$/.test(r)), "测试文件掉进了域内").toBe(false);
  });
  it("② 阳性对照：同一支扫描器在 `pages/SessionsPage.tsx` 上必须命中", () => {
    expect(viewsEdgesOf("pages/SessionsPage.tsx")).toEqual(["views/registry"]);
  });
  it("③ 判据：`App.tsx` + `shell/**` + `ui/primitives/**` 零处指向 `views/**`", () => {
    const hits = FIRST_SCREEN.flatMap((r) => viewsEdgesOf(r).map((t) => `${r} -> ${t}`));
    expect(hits, `首屏可达面出现了指向 views/** 的静态/动态导入：\n${hits.join("\n")}`).toEqual([]);
  });
});

describe("A2 · 注册表的导入者集合（C1①）", () => {
  const ALL = prodUnder("");
  const touchesRegistry = (r: string): boolean =>
    specifiersOf(r).some((s) => resolveSpec(r, s) === "views/registry");
  it("① 运行时导入者**恰 2 个**：`pages/SessionsPage.tsx` 与 `pages/NotesPage.tsx`", () => {
    const runtime = ALL.filter((r) => stripped(r).some((l) =>
      /(^|[^.\w])import\s+(?!type\b)[^;]*?\bfrom\s*["'][^"']*views\/registry["']/.test(l)));
    expect([...runtime].sort()).toEqual(["pages/NotesPage.tsx", "pages/SessionsPage.tsx"]);
  });
  it("② `App.tsx` / `shell/**` / `ui/primitives/**` 零导入（**含 `import type`**）", () => {
    const firstScreen = ["App.tsx", ...prodUnder("shell"), ...prodUnder("ui/primitives")];
    expect(firstScreen.filter(touchesRegistry), "首屏面（含 type-only）不得触碰注册表").toEqual([]);
  });
  it("③ `views/**` 不导入 `pages/**` / `shell/**`（`components/**` 是复用面，读数见文件头）", () => {
    const views = prodUnder("views");
    expect(views.length, "views 域是空的 ⇒ 判据静默失效").toBeGreaterThan(6);
    const bad = views.flatMap((r) => specifiersOf(r)
      .map((s) => [r, resolveSpec(r, s)] as const)
      .filter(([, t]) => t !== null && /^(pages|shell)\//.test(t as string))
      .map(([f, t]) => `${f} -> ${t}`));
    expect(bad, `views/** 出现了向上层目录的导入：\n${bad.join("\n")}`).toEqual([]);
  });
  it("④ 反向对照（防空真）：非 views 导入者恰 5 个（其中恰 3 个是 `import type`）", () => {
    const outsiders = ALL.filter((r) => !r.startsWith("views/") && touchesRegistry(r)).sort();
    expect(outsiders, "注册表的非 views 导入者集合变了（C1① 只有那两个页面是运行时的）").toEqual([
      "components/SessionDetailPanel.tsx", "components/notes/NotesReadingColumn.tsx",
      "components/session-detail/SessionViewHost.tsx", "pages/NotesPage.tsx", "pages/SessionsPage.tsx",
    ]);
    // C10#11 的口径落到**边**上：type-only 取注册表的恰好那 3 处，且取的都是**槽类型**（不是 `viewsFor`）
    const typeEdges = outsiders.flatMap((r) => stripped(r)
      .filter((l) => /(^|[^.\w])import\s+type\b/.test(l) && /views\/registry["']/.test(l))
      .map((l) => `${r} :: ${l.match(/\{([^}]*)\}/)?.[1].replace(/\s+/g, " ").trim()}`));
    expect(typeEdges, "type-only 取注册表的边集合变了").toEqual([
      "components/SessionDetailPanel.tsx :: SessionViewSlot, ViewSpec",
      "components/notes/NotesReadingColumn.tsx :: NoteViewSlot, ViewSpec",
      "components/session-detail/SessionViewHost.tsx :: SessionViewSlot, ViewSpec",
    ]);
    expect(typeEdges.some((e) => e.includes("viewsFor")), "`viewsFor` 是运行时的，不许出现在 `import type` 里").toBe(false);
    const insiders = ALL.filter((r) => r.startsWith("views/") && r !== "views/registry.ts" && touchesRegistry(r));
    expect(insiders.length, "views 内部一个槽类型消费者都没有 ⇒ 上半段空真").toBeGreaterThan(3);
  });
});

describe("A3 · `views/**` 零 `@tauri-apps` 边（C14②的整目录形态）", () => {
  const VIEWS = prodUnder("views");
  const TESTS = prodUnder("views", true).filter((r) => /\.test\.tsx?$/.test(r));
  const isTauri = (s: string): boolean => s.startsWith("@tauri-apps/");
  it("① 扫描器自证：静态 / `import type` / 动态都命中；注释与无意义串 0 命中", () => {
    expect(specifiersIn('import { invoke } from "@tauri-apps/api/core";').filter(isTauri)).toHaveLength(1);
    expect(specifiersIn('import type { X } from "@tauri-apps/api/core";').filter(isTauri)).toHaveLength(1);
    expect(specifiersIn('void import("@tauri-apps/api/core");').filter(isTauri)).toHaveLength(1);
    expect(specifiersIn('// import { invoke } from "@tauri-apps/api/core";').filter(isTauri)).toEqual([]);
    expect(specifiersIn('/* import("@tauri-apps/api/core") */').filter(isTauri)).toEqual([]);
    expect(specifiersIn('import { a } from "@nowhere/nothing";').filter(isTauri)).toEqual([]);
    expect(VIEWS.some((r) => /\.test\.tsx?$/.test(r)), "测试文件掉进了生产域").toBe(false);
  });
  it("② 阳性对照：`SessionScreenCards.tsx`（有 `convertFileSrc`）必须命中", () => {
    expect(specifiersOf("components/session-detail/SessionScreenCards.tsx").filter(isTauri))
      .toEqual(["@tauri-apps/api/core"]);
  });
  it("③ 判据：`views/**` 生产文件**声明级 0 命中**", () => {
    const hits = VIEWS.flatMap((r) => specifiersOf(r).filter(isTauri).map((s) => `${r} -> ${s}`));
    expect(hits, `views/** 出现了 Tauri 边（含 import type）：\n${hits.join("\n")}`).toEqual([]);
  });
  it("④ 双读数并列（裸子串口径的假阳性有多大，看得见）", () => {
    const bare = (r: string): number => stripComments(read(r)).split("@tauri-apps").length - 1;
    const decl = (r: string): number => specifiersOf(r).filter(isTauri).length;
    const sum = (rs: readonly string[], f: (r: string) => number): number => rs.reduce((n, r) => n + f(r), 0);
    expect([sum(VIEWS, bare), sum(VIEWS, decl)], "生产域的裸子串 / 声明级两个读数").toEqual([0, 0]);
    expect(sum(TESTS, bare), "测试文件的裸子串命中（`vi.mock` 是基建，不判）").toBeGreaterThan(0);
    expect(sum(TESTS, decl), "测试文件的声明级命中").toBeGreaterThan(0);
  });
});

describe("A4 · 默认视图不经惰性 + 非默认视图模块级惰性（criterion ①②）", () => {
  const REG = "views/registry.ts";
  /** 解析 `const <listName> … ];` 里的每个成员：`key` 与 `load` 体（多行合并成一行） */
  function members(listName: string): { key: string; load: string | null }[] {
    const lines = stripped(REG);
    const start = lines.findIndex((l) => l.includes(`const ${listName}`));
    expect(start, `${listName} 不在注册表里（口径漂了）`).toBeGreaterThan(0);
    const out: { key: string; load: string | null }[] = [];
    let cur: { key: string; load: string | null } | null = null;
    for (let i = start; i < lines.length; i += 1) {
      if (/^\];/.test(lines[i])) break;
      const key = lines[i].match(/key:\s*"([^"]+)"/);
      if (key) {
        if (cur) out.push(cur);
        cur = { key: key[1], load: null };
      }
      if (cur && lines[i].includes("load:")) cur.load = (cur.load ?? "") + lines[i].slice(lines[i].indexOf("load:"));
    }
    if (cur) out.push(cur);
    return out;
  }
  const LISTS: readonly (readonly [string, { key: string; load: string | null }[]])[] =
    [["session", members("SESSION_VIEWS")], ["note", members("NOTE_VIEWS")]];
  it("① 扫描器自证：`[0]` 是 `raw` ∧ 无 `load`；其余每个恰 1 个 `import(`", () => {
    for (const [name, list] of LISTS) {
      expect(list.length, `${name} 视图表解析为空 ⇒ 判据静默失效`).toBeGreaterThan(1);
      expect(list[0].key, `${name} 的 [0] 必须是 raw（规格 §7.3①）`).toBe("raw");
      expect(list[0].load, `${name} 的默认视图**不得**有 load（不经惰性 ⇒ 必然常驻）`).toBeNull();
      for (const m of list.slice(1)) {
        expect((m.load?.match(/import\(/g) ?? []).length, `${name}/${m.key} 的 load 体内必须恰 1 个 import(`).toBe(1);
      }
    }
  });
  it("② 判据：无 `load` 的 spec 恰是两个默认视图；有 `load` 的每个都有惰性目标", () => {
    const loadless = LISTS.flatMap(([n, list]) => list.filter((m) => m.load === null).map((m) => `${n}/${m.key}`));
    const loaded = LISTS.flatMap(([n, list]) => list.filter((m) => m.load !== null).map((m) => `${n}/${m.key}`));
    expect(loadless, "无 load 的 spec 必须恰是两侧的默认视图").toEqual(["session/raw", "note/raw"]);
    expect(loaded.length, "非默认视图数为 0 ⇒ 惰性判据空真").toBeGreaterThan(2);
  });
  it("③ 注册表顶部零静态 value import；`load` 目标都在盘上", () => {
    const src = stripped(REG).join("\n");
    const targets = [...new Set([...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]))];
    expect(targets.length, "一个惰性目标都没有 ⇒ 判据空真").toBeGreaterThan(2);
    const staticValues = [...src.matchAll(/(^|\n)\s*import\s+(?!type\b)[^;\n]*?from\s*["']([^"']+)["']/g)].map((m) => m[2]);
    expect(staticValues, `注册表顶部出现了**静态 value** import（惰性破功）：\n${staticValues.join("\n")}`).toEqual([]);
    for (const t of targets) {
      const resolved = resolveSpec(REG, t);
      expect(resolved, `惰性目标不是相对路径：${t}`).not.toBeNull();
      const abs = join(SRC, ...resolved!.split("/"));
      expect(existsSync(abs) || existsSync(`${abs}.tsx`) || existsSync(`${abs}.ts`), `惰性目标不在盘上：${t}`).toBe(true);
    }
  });
});

describe("A5 · 三条硬约束的可断言部分（合取）", () => {
  const HOSTS = ["components/session-detail/SessionViewHost.tsx", "components/notes/NotesReadingColumn.tsx"];
  /** 剥注释后某 token 的出现行号（顺序判据与「恰 1 处」共用） */
  const hitLines = (h: string, token: string): number[] =>
    stripped(h).flatMap((l, i) => (l.includes(token) ? [i + 1] : []));
  it("① 默认视图 = `raw`（注册表 `[0]` ∧ 冻结清单 `[0]` 双向对拍）", () => {
    const frozen = stripped("views/registry.ts").join("\n").match(/FROZEN_VIEW_KEYS[\s\S]*?\n\};/)?.[0] ?? "";
    expect(frozen.includes('session: ["raw"'), "冻结清单 session 的 [0] 不是 raw").toBe(true);
    expect(frozen.includes('note: ["raw"'), "冻结清单 note 的 [0] 不是 raw").toBe(true);
  });
  it("② 两个宿主各有「默认视图常驻」的 `display` 三元渲染", () => {
    for (const h of HOSTS) {
      expect(stripped(h).join("\n").includes("isDefault"), `${h} 没有默认视图判定`).toBe(true);
      expect(/display:\s*isDefault\s*\?/.test(stripped(h).join("\n")), `${h} 没有常驻层的 display 三元`).toBe(true);
    }
  });
  it("③ C11 槽位：两侧各恰 1 个 `data-view-error-slot`，且**位于切换器之后**", () => {
    for (const h of HOSTS) {
      const slot = hitLines(h, "data-view-error-slot");
      const switcher = hitLines(h, "<ViewSwitcher");
      expect(slot, `${h} 的 C11 槽位不是恰 1 处`).toHaveLength(1);
      expect(switcher, `${h} 的切换器调用点不是恰 1 处`).toHaveLength(1);
      expect(slot[0], `${h} 的槽位必须在切换器**之后**（C11：正文列头部、切换器下方）`).toBeGreaterThan(switcher[0]);
      expect(hitLines(h, 'className="ed-view-error-slot"'), `${h} 的槽位缺类名钩子`).toHaveLength(1);
    }
  });
});
