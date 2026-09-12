// @vitest-environment node
/**
 * @ai-context **弱化文本 / 字号越界 双棘轮**（批 4 T16-A 的落点；B11「切片 + 棘轮」）。
 *
 * Why：规格 §5.1 的两处病灶同源（「字号与两个灰手写组合，**对比度逐处失控**」）——
 *   ① 弱化灰 `#9ca3af` 白底 ≈2.54:1（远低于 4.5:1 正文线）· ② 字号越界 <12px（9/9.5/10/10.5/11/11.5）。
 *   两者都是**全站级存量**（迁移前 295 行 / 604 处）且**几乎没有测试面** ⇒ 按 R2 的切片原则，
 *   本批**只冻结不迁移**（迁移另派 T16-B；字号映射登记给批 5/6）。没有棘轮，「还没迁完」就会
 *   退化成「永远在迁」：新代码继续手写这个灰与这个字号，而没有任何判据说话。
 *
 * ★ T16-B 收紧（2026-09-12）：弱化灰 **249/100 → 63/44**（迁移 186 处；例外 63 处）。
 *   棘轮一因此**加一组附则牙**：`RESIDUAL` 逐文件理由（无理由的冻结 ⇒ 红）+ **僵尸豁免**
 *   （已迁走却还挂在豁免表里 ⇒ 红）+ 分类非空（分类表被清空 = 该判据空真）+ 键集双向相等。
 *   字号越界侧**未动**（558/120）：迁移时越界值按 R2 原样留在行内。
 *
 * ★ 计次口径（**口径本身是判据的一部分**；与 `textBaseline.ts` 的冻结值同源）
 *   域 = `app/src/**` 的 `.ts`/`.tsx` **减** `*.test.ts(x)` **减** `ui/primitives/**`
 *     （原语层是墨度与字阶的真源，不是待收敛的调用点 —— 同 `statusLineBaseline` / T1 的 `prod`）。
 *     ⚠️ **本单元不额外减 `ui/icons/**`**（移接口径只写了减 primitives）；已实测该目录对两条
 *     读数**贡献为 0**（`tmp/t16a/measure-head.json` 的 `oobExcluded.icons = 0`，弱化灰同为 0），
 *     故加不加这条都是同一个数字 —— 留在这里是为了让「口径差异不产生数字差异」可复核。
 *   一律**先剥注释**（复用 `./sliceScan` 的状态机，与探针同一份实现）。
 *   弱化灰取**行**口径（同行多次算 1；T1 的 295 同此）；字号越界取**处**口径（逐次命中；604 同此）。
 *   两口径在本域**恰好等值**（换算系数 **1.0000**，实测「同一行两次命中」的行数为 0）——
 *   见 `textBaseline.ts` 头注与 `tmp/t16a/unit-check.mjs`。
 *
 * ★ 两条棘轮**各自的用例分开**（便于单点失败定位），每条 6 个牙：
 *   ① 逐文件 ≤ 冻结值（**逐文件牙齿**）② 总数 ≤ 冻结总数 ③ `FROZEN_TOTAL === sum(entries)`
 *   ④ 锚（条目数 + 具名文件的值）⑤ 基线**未登记**的文件命中数必须为 0 ⑥ **防真空阳性对照**
 *   （证明仪器**确实看得见**该字面量 —— 仪器静默失效时判据必须红，不许绿）。
 *
 * ★ 变异体（T16-A 收口，**每个变异新解一棵导出树**；CONTROL 在冻结提交的新解树上取，脏树会假红）：
 *   M1 切片文件里恢复一处 `#9ca3af` ⇒ 棘轮一 ①/② 红；M2 新增一处 `fontSize: 11` ⇒ 棘轮二红；
 *   M3 把 `FROZEN_*_TOTAL` 改成与实际不符 ⇒ ③ 红；M4 反例守卫：新增一处**合法档** `fontSize: 12`
 *   ⇒ **不红**；M5 删掉基线里一行条目（模拟「表被换掉」）⇒ ④ 红。
 *
 * 副作用：只读磁盘（递归遍历 `app/src` 一次，复用同一份扫描结果）。边界：**文本级**判据、不做 AST
 *   ⇒「这行是否真是文本节点样式」不判（`background` / `border` / SVG `fill` 等图形用法也在计数里，
 *   这是**有意的**：棘轮管的是「这个字面量还剩多少」，语境分类在 `tmp/t16a/slice.md` 里逐处做）。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readLines, relOf, walkSources } from "./sliceScan";
import {
  ANCHOR_FONT_OOB,
  ANCHOR_MUTED_GRAY,
  FROZEN_FONT_OOB_BY_FILE,
  FROZEN_FONT_OOB_FILES,
  FROZEN_FONT_OOB_TOTAL,
  FROZEN_MUTED_GRAY_BY_FILE,
  FROZEN_MUTED_GRAY_FILES,
  FROZEN_MUTED_GRAY_TOTAL,
  RESIDUAL,
  type TextResidualKind,
} from "./textBaseline";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** 域 = 减测试 · 减 `ui/primitives/**`（见头注；`ui/icons/**` 实测贡献为 0，故未单列） */
const DOMAIN: readonly string[] = walkSources(SRC)
  .map((f) => relOf(SRC, f))
  .filter((r) => !/\.test\.tsx?$/.test(r) && !r.startsWith("ui/primitives/"))
  .sort();

/** 弱化灰字面量（棘轮一的词表）。**本文件在域外**（`.test.ts`）⇒ 这里出现它不会自命中。 */
const MUTED_GRAY = "#9ca3af";

/** 字号越界档：`9/9.5/10/10.5/11/11.5`（规格 §4.2 的下界是 12px；11.5 仅在 `font="mono"` 时合法） */
const OOB_SIZES: readonly number[] = [9, 9.5, 10, 10.5, 11, 11.5];

/**
 * `fontSize` 取值的**数字形态**（`fontSize: 11` / `fontSize={11}`）与**字符串形态**（`fontSize: "11px"`）。
 * 两种都要数：字符串形态是本仓真实存在的写法（漏掉它等于给棘轮开后门）。
 */
const FONT_SIZE = /\bfontSize\s*[:=]\s*\{?\s*["']?(\d+(?:\.\d+)?)/g;

/** 逐文件计数（只含命中 > 0 的文件）。导出供变异体与控制实验直接调用同一支仪器。 */
export function scanMutedGrayByFile(): Map<string, number> {
  const map = new Map<string, number>();
  for (const rel of DOMAIN) {
    const { stripped } = readLines(join(SRC, ...rel.split("/")));
    // 行口径：同一行多次命中只算 1（与 T1 的 295 行同口径）
    const n = stripped.filter((line) => line.includes(MUTED_GRAY)).length;
    if (n > 0) map.set(rel, n);
  }
  return map;
}

/** 逐文件**字号越界处数**（处口径：逐次命中；同一行两次命中算 2） */
export function scanFontOobByFile(): Map<string, number> {
  const map = new Map<string, number>();
  for (const rel of DOMAIN) {
    const { stripped } = readLines(join(SRC, ...rel.split("/")));
    let n = 0;
    for (const line of stripped) {
      FONT_SIZE.lastIndex = 0;
      for (const m of line.matchAll(FONT_SIZE)) if (OOB_SIZES.includes(Number(m[1]))) n += 1;
    }
    if (n > 0) map.set(rel, n);
  }
  return map;
}

const GRAY = scanMutedGrayByFile();
const OOB = scanFontOobByFile();
const sumOf = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
/** 逐文件「实际 > 冻结」的回潮清单（键不在基线里 ⇒ 冻结值按 0 算） */
const regressions = (m: Map<string, number>, frozen: Readonly<Record<string, number>>): string[] =>
  [...m.entries()].filter(([f, n]) => n > (frozen[f] ?? 0)).map(([f, n]) => `${f}: ${frozen[f] ?? 0} → ${n}`);

describe("棘轮一 · 弱化灰 #9ca3af（只许减 · 迁移后本表须手工收紧）", () => {
  it("① 逐文件 ≤ 冻结值（回潮就是这里红）", () => {
    expect(
      regressions(GRAY, FROZEN_MUTED_GRAY_BY_FILE),
      "以下文件的弱化灰行数**涨了**（棘轮只许降；真迁移了请手工收紧 textBaseline）",
    ).toEqual([]);
  });

  it("② 总数 ≤ 冻结总数", () => {
    const total = sumOf(GRAY);
    expect(total, `全仓 #9ca3af 已从基线 ${FROZEN_MUTED_GRAY_TOTAL} 涨到 ${total}`)
      .toBeLessThanOrEqual(FROZEN_MUTED_GRAY_TOTAL);
  });

  it("③ FROZEN_MUTED_GRAY_TOTAL 恰等于逐文件之和（常数不许手工改到自洽）", () => {
    const sum = sumOf(new Map(Object.entries(FROZEN_MUTED_GRAY_BY_FILE)));
    expect(sum, "冻结表的逐文件之和 ≠ 冻结总数（表被局部改动过）").toBe(FROZEN_MUTED_GRAY_TOTAL);
    expect(Object.keys(FROZEN_MUTED_GRAY_BY_FILE)).toHaveLength(FROZEN_MUTED_GRAY_FILES);
  });

  it("④ 锚：条目数 + 具名文件的冻结值（防「整表被换掉」）", () => {
    expect(Object.keys(FROZEN_MUTED_GRAY_BY_FILE).length).toBe(ANCHOR_MUTED_GRAY.files);
    expect(GRAY.get(ANCHOR_MUTED_GRAY.file), `锚文件 ${ANCHOR_MUTED_GRAY.file} 的实测值变了`).toBe(ANCHOR_MUTED_GRAY.count);
    expect(FROZEN_MUTED_GRAY_BY_FILE[ANCHOR_MUTED_GRAY.file]).toBe(ANCHOR_MUTED_GRAY.count);
    expect(ANCHOR_MUTED_GRAY.files).toBe(FROZEN_MUTED_GRAY_FILES);
  });

  it("⑤ 基线未登记的文件命中数必须为 0（新增文件不得引入该字面量）", () => {
    const unregistered = [...GRAY.keys()].filter((f) => !(f in FROZEN_MUTED_GRAY_BY_FILE));
    expect(unregistered, `这些文件有 #9ca3af 但不在冻结表里（新增灰字）：\n${unregistered.join("\n")}`).toEqual([]);
  });

  it("⑥ 防真空阳性对照：仪器**确实看得见** #9ca3af（静默失效时本判据必须红）", () => {
    // 正样本（**真实文件** + 同一支仪器）：域内一个**仍有残余命中**的文件确实被数到 —— 若仪器静默
    // 返回全 0，这里立刻红，而不是让 ①–⑤ 一起变成「空真绿」。
    // ⚠️ T16-B 收紧时换过正样本：原来的 `components/action-center/ActionCenterPanel.tsx`（12 处）
    // 已被本批**整文件迁走**（12 → 0）⇒ 拿它当正样本会变成「要求已迁文件仍有灰字」的怪判据。
    // 新正样本 = 锚文件（5 处全是登记例外，B1 硬守卫 + 品牌青三元 ⇒ 不可能合法归零）。
    const positive = ANCHOR_MUTED_GRAY.file;
    expect(GRAY.get(positive) ?? 0, `仪器在 ${positive} 上看不见 #9ca3af ⇒ 扫描静默失效`).toBeGreaterThan(0);
    expect(FROZEN_MUTED_GRAY_BY_FILE[positive]).toBe(GRAY.get(positive));
    // 词表自证：字面量确实是 `#9ca3af`（不是抄错的码位 ⇒ 词表静默变窄）
    expect(MUTED_GRAY).toBe("#" + "9ca3af");
    expect(MUTED_GRAY).toHaveLength(7);
    // 域内**确实还有命中**（否则下面的棘轮是空真）；域本身非空
    expect(GRAY.size, "域内一处弱化灰都没有 ⇒ 基线表是空真").toBeGreaterThan(0);
    expect(sumOf(GRAY), "域内实测总数与冻结总数不符（读数与基线被同时改过）").toBe(FROZEN_MUTED_GRAY_TOTAL);
    // 域边界：测试文件与原语层都在域外（口径同 T1 的 prod）
    expect(DOMAIN.some((r) => /\.test\.tsx?$/.test(r)), "测试文件掉进了域内").toBe(false);
    expect(DOMAIN.some((r) => r.startsWith("ui/primitives/")), "原语层没有被排除出域").toBe(false);
    expect(DOMAIN.includes("ui/tokens.css"), "域口径漂了：CSS 不该进来").toBe(false);
    // 本文件在域外（否则 ⑥ 自己的字面量会自命中）
    expect(DOMAIN.includes("ui/primitives/textRatchet.test.ts")).toBe(false);
  });
});

describe("棘轮一附则 · RESIDUAL 例外声明（照 loadingBaseline 范式 —— 例外必须**带理由**且**此刻仍命中**）", () => {
  it("① 冻结表每个键都有一条例外声明，且理由非空（不许「无理由的冻结」）", () => {
    const declared = new Set(RESIDUAL.map((r) => r.file));
    const unexplained = Object.keys(FROZEN_MUTED_GRAY_BY_FILE).filter((f) => !declared.has(f));
    expect(unexplained, `这些文件被冻结却没有 RESIDUAL 理由：\n${unexplained.join("\n")}`).toEqual([]);
    const thin = RESIDUAL.filter((r) => typeof r.reason !== "string" || r.reason.trim().length < 20).map((r) => r.file);
    expect(thin, `例外理由过短（等于没写）：\n${thin.join("\n")}`).toEqual([]);
    expect(RESIDUAL, "冻结文件数 ≠ 例外条目数（每个冻结文件恰一条）").toHaveLength(FROZEN_MUTED_GRAY_FILES);
  });

  it("② 僵尸豁免：豁免条目此刻必须**仍然命中**（已迁走却还挂在豁免表里 ⇒ 红）", () => {
    const zombies = RESIDUAL.filter((r) => (GRAY.get(r.file) ?? 0) === 0).map((r) => r.file);
    expect(zombies, `这些文件已无弱化灰命中，却仍挂在 RESIDUAL 里（僵尸豁免）：\n${zombies.join("\n")}`).toEqual([]);
    // 反向：豁免条目必须指向**冻结表里的**文件（否则它是一张脱离棘轮的自述表）
    const stray = RESIDUAL.filter((r) => !(r.file in FROZEN_MUTED_GRAY_BY_FILE)).map((r) => r.file);
    expect(stray, `RESIDUAL 指向不在冻结表里的文件：\n${stray.join("\n")}`).toEqual([]);
  });

  it("③ 分类表不许被清空：每类至少一条（否则该分类判据是空真）", () => {
    const kinds: readonly TextResidualKind[] = [
      "interactive",
      "ternary-no-equivalent",
      "interactive-no-equivalent",
      "nontext",
      "tag",
      "colorMap",
      "b1-non-migrated",
    ];
    for (const k of kinds) {
      expect(RESIDUAL.filter((r) => r.kind === k).length, `分类 ${k} 一条都没有（＝该类判据空真）`).toBeGreaterThan(0);
    }
    // 锚文件必须在豁免表里：它是「不可能合法下降」的那个文件（防锚被顺手换掉）
    expect(RESIDUAL.map((r) => r.file)).toContain(ANCHOR_MUTED_GRAY.file);
  });

  it("④ 非弱化文本（background/border/stroke）在例外表里有落点（B19 第 5 条：登记而非消失）", () => {
    const nontext = RESIDUAL.filter((r) => r.kind === "nontext").map((r) => r.file);
    expect(nontext.length, "非弱化文本的例外登记被清空").toBeGreaterThanOrEqual(4);
    for (const f of nontext) expect(FROZEN_MUTED_GRAY_BY_FILE[f], `${f} 不在冻结表里`).toBeGreaterThan(0);
  });
});

describe("棘轮二 · 字号越界（<12px · 本批只冻结不迁移）", () => {
  it("① 逐文件 ≤ 冻结值（回潮就是这里红）", () => {
    expect(
      regressions(OOB, FROZEN_FONT_OOB_BY_FILE),
      "以下文件的字号越界处数**涨了**（棘轮只许降；真改了请手工收紧 textBaseline）",
    ).toEqual([]);
  });

  it("② 总数 ≤ 冻结总数", () => {
    const total = sumOf(OOB);
    expect(total, `全仓 <12px 字号已从基线 ${FROZEN_FONT_OOB_TOTAL} 涨到 ${total}`)
      .toBeLessThanOrEqual(FROZEN_FONT_OOB_TOTAL);
  });

  it("③ FROZEN_FONT_OOB_TOTAL 恰等于逐文件之和（常数不许手工改到自洽）", () => {
    const sum = sumOf(new Map(Object.entries(FROZEN_FONT_OOB_BY_FILE)));
    expect(sum, "冻结表的逐文件之和 ≠ 冻结总数（表被局部改动过）").toBe(FROZEN_FONT_OOB_TOTAL);
    expect(Object.keys(FROZEN_FONT_OOB_BY_FILE)).toHaveLength(FROZEN_FONT_OOB_FILES);
  });

  it("④ 锚：条目数 + 具名文件的冻结值（防「整表被换掉」）", () => {
    expect(Object.keys(FROZEN_FONT_OOB_BY_FILE).length).toBe(ANCHOR_FONT_OOB.files);
    expect(OOB.get(ANCHOR_FONT_OOB.file), `锚文件 ${ANCHOR_FONT_OOB.file} 的实测值变了`).toBe(ANCHOR_FONT_OOB.count);
    expect(FROZEN_FONT_OOB_BY_FILE[ANCHOR_FONT_OOB.file]).toBe(ANCHOR_FONT_OOB.count);
    expect(ANCHOR_FONT_OOB.files).toBe(FROZEN_FONT_OOB_FILES);
  });

  it("⑤ 基线未登记的文件命中数必须为 0（新增文件不得引入越界字号）", () => {
    const unregistered = [...OOB.keys()].filter((f) => !(f in FROZEN_FONT_OOB_BY_FILE));
    expect(unregistered, `这些文件有 <12px 字号但不在冻结表里（新增越界字号）：\n${unregistered.join("\n")}`).toEqual([]);
  });

  it("⑥ 防真空阳性对照 + 域过滤**双侧**自证（域内 fixture 必须被数到 · 域外同样字面量必须不被数到）", () => {
    // 仪器自证：`FONT_SIZE` 能读出**数字形态**与**字符串形态**，且合法档不被判为越界
    const vals = (s: string): number[] => {
      FONT_SIZE.lastIndex = 0;
      return [...s.matchAll(FONT_SIZE)].map((m) => Number(m[1]));
    };
    expect(vals("const a = { fontSize: 11 };")).toEqual([11]);
    expect(vals('const a = { fontSize: "11px" };')).toEqual([11]);
    expect(vals("const a = <Text style={{ fontSize: 10.5 }} />;")).toEqual([10.5]);
    expect(vals("const a = { fontSize: 12 };"), "合法档 12 不该被读到越界集").toEqual([12]);
    expect(OOB_SIZES.includes(vals("const a = { fontSize: 12 };")[0])).toBe(false);
    expect(OOB_SIZES, "越界集漏值（棘轮会静默变松）").toEqual([9, 9.5, 10, 10.5, 11, 11.5]);
    // **域过滤双侧**：域内 fixture 必须被数到（正侧）——用真实的域内文件把它证出来
    expect(OOB.size, "域内一处越界字号都没有 ⇒ 基线表是空真").toBeGreaterThan(0);
    expect(sumOf(OOB), "域内实测总数与冻结总数不符").toBe(FROZEN_FONT_OOB_TOTAL);
    expect(DOMAIN.length, "域是空的（路径分隔符口径漂了 ⇒ 过滤静默失效）").toBeGreaterThan(200);
    // 负侧：域外（测试 / 原语层）的同名字面量**不得**进 OOB。用真实文件证：本文件与 `Text.tsx`
    // 都不在域内，且 `Text.tsx` 的注释里恰好有 `fontSize:` 字样（域过滤失效时它会漏进来）。
    expect(DOMAIN.includes("ui/primitives/Text.tsx"), "原语层掉进了域内（域过滤失效）").toBe(false);
    expect(DOMAIN.includes("ui/primitives/textRatchet.test.ts")).toBe(false);
    // 域内**确实**存在越界字号（否则「不被数到」的负侧无法与「域是空的」区分）
    expect(OOB.get(ANCHOR_FONT_OOB.file), "锚文件在域内没有命中 ⇒ 域过滤把真命中滤掉了").toBeGreaterThan(0);
  });
});
