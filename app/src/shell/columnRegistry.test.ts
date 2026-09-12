/**
 * @ai-context 列注册表守卫 —— 规格 §6.2 的 13 行必须逐字可核。
 *
 * 断言分五层：
 *   ① 13 行全在，键唯一，顺序 = 规格表行序；
 *   ② **可拖拽行** min ≤ default ≤ max —— 不参与拖拽的行（flex / 单列 / 居中 860）**按键点名**
 *      豁免（计划 Step 2 的「`default:0` 行豁免」口径对不上它自己的 `settings-main`
 *      `{default:860, min:0, max:0}` ⇒ 按形状豁免会漏，改为按 `NON_DRAGGABLE` 键集豁免）；
 *   ③ 每个 `page` 都是导航注册表里的 PageKey（防止列挂在已删页上）；
 *   ④ 阈值只来自 `BREAKPOINTS`（注册表里不得出现裸阈值字面量，且用到的值必须在断点表里）；
 *   ⑤ **调用点判据**（规格 §6.2 :312「页面不再自建 hook」的机器判据）：扫描域
 *      `app/src/pages/**` + `app/src/components/**`（**只这两个域**——列一旦下沉到组件，
 *      判据必须跟着到组件；`ChatSidebar` 就在 `components/` 下，T9 接线后自动被覆盖）
 *      里任何 `useColumnLayout(...)` 行都必须走 `columnSpec(...)`，且代码里不得再出现
 *      `breakpointFor(...)` / `autoFoldBelow` —— 规格与阈值都住在注册表里。⑤ 按**目录发现**
 *      而非硬列文件名；判据只看**代码行**（丢注释行——注释里提到字段名不是「自建」，
 *      首版未丢被自己误伤过）。
 *
 * ⚠️ 仪器局限（诚实边界）：本文件**读不到**「组件实际渲染了多宽」—— 那是 jsdom 侧
 *   `components/notes/NotesReadingColumn.outline.test.tsx`（大纲列接线）与 T14 的像素探针的活。
 *   本文件跑在 vitest 全局 `node` 环境（**故意不加 jsdom 头**——注册表是纯数据，不需要 DOM）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLUMN_KEYS, COLUMN_SPECS, columnSpec, columnsOf, type ColumnSpec } from "./columnRegistry";
import { BREAKPOINTS } from "./breakpoints";
import { ALL_ENTRIES } from "./navRegistry";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");

/** ⑤ 的扫描域（相对 `app/src`）；`ui` / `hooks` / `utils` 不在域内——它们不是列消费者 */
const SCAN_DIRS = ["pages", "components"] as const;

/** 递归收集 `.tsx`（排除测试文件）——与 `ui/zIndex.guard.test.ts` 的 collectFiles 同款
 *  （本仓 `readdirSync(dir, { withFileTypes: true })` 的 withFileTypes 重载在 tsc 下不可用） */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

/** 两个域各自的文件清单（分域留存 ⇒ 自检能分别证明「两个域都读得到」） */
const DOMAINS = SCAN_DIRS.map((d) => ({ dir: d, files: tsxFiles(join(SRC, d)) }));

/** 不参与拖拽的行（§6.2 写「flex」/「页签内分区」/「—」/「居中 860」：无 min/max 语义）
 *  ⇒ 豁免 min ≤ default ≤ max。**逐键点名**而非按形状（`min===max===0`）豁免：
 *  形状豁免会静默放过「把可拖拽列写成 0/0」这类改错。 */
const NON_DRAGGABLE = ["classroom-right", "action-main", "review-main", "settings-main"];

/** 逐行扫扫描域内的**代码行**（丢注释行），收集命中 `hit` 的 `域路径:行 原文`。
 *  Why 丢注释：首版未丢 ⇒ 被本任务自己写的说明性注释（「…autoFoldBelow 1100…」）误伤
 *  —— 与 DISPATCH 记的「文本扫描型守卫被注释里的字面量误伤」同类。丢弃比逐条改述耐用：
 *  「页面/组件自建规格」的判据本就只该看代码，注释里提到字段名不是自建。 */
function hits(hit: RegExp): string[] {
  const out: string[] = [];
  for (const { files } of DOMAINS) {
    for (const f of files) {
      readFileSync(f, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
          if (hit.test(line)) out.push(`${relative(SRC, f).replace(/\\/g, "/")}:${i + 1}  ${t}`);
        });
    }
  }
  return out;
}

describe("列注册表（规格 §6.2）", () => {
  it("① 13 行、键唯一、顺序稳定", () => {
    expect(COLUMN_SPECS).toHaveLength(13);
    expect(new Set(COLUMN_SPECS.map((c) => c.key)).size).toBe(13);
    expect(COLUMN_KEYS[0]).toBe("classroom-left");
    expect(COLUMN_KEYS[COLUMN_KEYS.length - 1]).toBe("settings-main");
  });

  it("② 可拖拽行 min ≤ default ≤ max（不参与拖拽的行按**键**豁免）", () => {
    const draggable = COLUMN_SPECS.filter((c) => !NON_DRAGGABLE.includes(c.key));
    // 仪器自检：可拖拽行非空，否则②是空判据（改一行就红）
    expect(draggable.length).toBeGreaterThan(5);
    const bad = draggable
      .filter((c) => !(c.min <= c.default && c.default <= c.max))
      .map((c) => `${c.key}（min ${c.min} / 默认 ${c.default} / max ${c.max}）`);
    expect(bad, "这些列的三元组不合法").toEqual([]);
  });

  it("③ 每个 page 都在导航注册表里", () => {
    const pages = new Set(ALL_ENTRIES.map((e) => e.key as string));
    const bad = COLUMN_SPECS.filter((c) => !pages.has(c.page)).map((c) => `${c.key} → ${c.page}`);
    expect(bad, `这些列挂在不存在的页上：\n${bad.join("\n")}`).toEqual([]);
  });

  it("④ 阈值只来自 BREAKPOINTS（注册表里不得出现裸阈值字面量）", () => {
    const src = readFileSync(join(HERE, "columnRegistry.ts"), "utf8");
    const loose = [...src.matchAll(/autoFoldBelow:\s*(\d+)/g)].map((m) => m[1]);
    expect(loose, `这些 autoFoldBelow 是裸数字（应写 breakpointFor(...)）：${loose.join(", ")}`).toEqual([]);
    // `as const` 后无 autoFoldBelow 的行**没有**该属性 ⇒ 按 `ColumnSpec` 读（联合类型上直读会 TS2339）
    const used = new Set(
      COLUMN_SPECS.map((c: ColumnSpec) => c.autoFoldBelow).filter((v): v is number => v != null),
    );
    expect(used.size, "13 行里应当有自动化折叠阈值（否则④是空判据）").toBeGreaterThan(0);
    for (const v of used) expect(Object.values(BREAKPOINTS)).toContain(v);
  });

  it("④ columnSpec 正样本 / 阴性样本 + columnsOf", () => {
    expect(columnSpec("notes-list").default).toBe(320);
    expect(() => columnSpec("nope")).toThrow(/未注册的列键/);
    expect(columnsOf("notes")).toHaveLength(3);
    expect(columnsOf("action")).toHaveLength(1);
  });

  it("④ 八处可折叠行的 autoFoldBelow 与规格 §6.2 逐行一致（行↔档位的映射不许错配）", () => {
    // Why 单列这一条：只判「值 ∈ BREAKPOINTS」判不出「这一行用错了档位」
    // （把 notes-list 从 threeCol 写成 twoCol，值仍是合法断点 ⇒ 静默错配）。
    // 期望值写 `BREAKPOINTS.<kind>`——档位数字本身由 breakpoints.test.ts 的三条逐字锚点冻结，
    // 本条的职责是**行与档位的对应关系**，不是再冻结一次数字。
    const want: Record<string, number> = {
      "classroom-left": BREAKPOINTS.twoCol,
      "sessions-list": BREAKPOINTS.twoCol,
      "notes-groups": BREAKPOINTS.threeCol,
      "notes-list": BREAKPOINTS.threeCol,
      "notes-outline": BREAKPOINTS.outlineCol,
      "chat-sidebar": BREAKPOINTS.twoCol,
      "knowledge-left": BREAKPOINTS.twoCol,
      "goals-left": BREAKPOINTS.twoCol,
    };
    const got = Object.fromEntries(
      COLUMN_SPECS.map((c: ColumnSpec) => c)
        .filter((c) => c.autoFoldBelow != null)
        .map((c) => [c.key, c.autoFoldBelow]),
    );
    expect(got, "可折叠行的档位映射与规格 §6.2 不一致").toEqual(want);
    // 阴性样本：§6.2 写「不折叠」的详情列与四条单列行不得混进来
    expect(got["knowledge-detail"]).toBeUndefined();
    expect(got["settings-main"]).toBeUndefined();
  });

  it("① 与规格 §6.2 的九个数字逐字一致（抽样锚点，防整表被改错）", () => {
    expect(columnSpec("classroom-left").default).toBe(320);
    expect(columnSpec("notes-groups").default).toBe(240);
    expect(columnSpec("notes-outline").default).toBe(180);
    expect(columnSpec("chat-sidebar").default).toBe(260);
    expect(columnSpec("knowledge-left").default).toBe(260);
    expect(columnSpec("goals-left").default).toBe(320);
    expect(columnSpec("settings-main").default).toBe(860);
    expect(columnSpec("knowledge-detail").autoFoldBelow).toBeUndefined();
  });
});

describe("调用点判据（规格 §6.2「页面不再自建 hook」）", () => {
  it("⑤ 扫描域内的 useColumnLayout 调用一律从注册表取规格", () => {
    const bad = hits(/useColumnLayout\(/).filter((d) => !/columnSpec\(/.test(d));
    expect(bad, `这些调用点仍在自建列规格（应写 columnSpec("<key>")）：\n${bad.join("\n")}`).toEqual([]);
  });

  it("⑤ 扫描域内不得再出现断点阈值（阈值住在注册表 / breakpoints）", () => {
    const bad = hits(/breakpointFor\(|autoFoldBelow/);
    expect(bad, `这些文件仍在自建阈值：\n${bad.join("\n")}`).toEqual([]);
  });

  it("⑤ 仪器自检：两个域都读得到（防路径写错 ⇒ 0 命中假绿）、能命中违规行、注释行不误伤", () => {
    // 两个域各自非空（2026-09-12 实测：pages 9 个文件 / components 142 个文件）——
    // 只在「合并后总数」上设下限会漏掉「某一域路径写错」的情况，故**分域**设下限
    for (const { dir, files } of DOMAINS) {
      expect(files.length, `域 ${dir} 读不到文件（路径写错？）`).toBeGreaterThan(dir === "pages" ? 5 : 50);
    }
    // 阳性样本：自建规格的调用形态；阴性样本：走注册表的形态
    expect(/useColumnLayout\(/.test('const c = useColumnLayout("notes-list", { default: 320 });')).toBe(true);
    expect(/columnSpec\(/.test('const c = useColumnLayout("notes-list", { default: 320 });')).toBe(false);
    expect(/columnSpec\(/.test('const c = useColumnLayout("notes-list", columnSpec("notes-list"));')).toBe(true);
    // 注释行被丢掉（首版实测被本任务自己的说明性注释误伤）：与 hits() 的丢弃规则同款
    const isComment = (l: string) => {
      const t = l.trim();
      return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
    };
    expect(isComment("  // 批 3：规格里的 autoFoldBelow 1100 住在注册表")).toBe(true);
    expect(isComment('  const c = useColumnLayout("x", { default: 1 });')).toBe(false);
  });
});
