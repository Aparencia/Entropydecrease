// @vitest-environment node
/**
 * @ai-context **`<Surface>` 调用点的「新增调用点登记制」**（T15a · 控制方裁决的**判据修正**，不是放宽）。
 *
 * Why 有本件：批 5 之前，`surfaceBaseline.ts` 的 `FROZEN_SURFACE_TAG_TOTAL = 14` 配合
 *   `surfaceRatchet.test.ts` ⑦「标签数 == 冻结值」+ 本批「`*Baseline.ts` 只读、向下重同步」的纪律
 *   ⇒ **任何新视图只要用 `<Surface>` 就必然红**（T9 实测触发：它被迫改用 token 变量
 *   `var(--ed-bg-surface/…)` 绕开原语）。裁决：修正为登记制 —— **允许新文件把它们的 `<Surface>` 调用点
 *   登记进逐文件表**（登记即计数），从而在保留全部防漂移牙齿的前提下允许合法增长。
 *
 * ★ 五颗牙（**登记制不是「把表抬高就完事」**；牙号与任务书逐条对应）
 *   牙 1 **既有（legacy 档）面一格都不许涨**：逐文件 `实测 − 该文件 new 档登记值之和 ≤ legacy 档登记值`（主牙齿）；
 *   牙 2 **new 档必须 `实测 − 该文件 legacy 档登记值之和 == new 档登记值之和`**（不是 ≤）—— 防「先把表抬高再看」；
 *   牙 3 **总数三连通**：`FROZEN_SURFACE_TAG_TOTAL == Σ 登记值 == Σ 实测`，
 *        且 **legacy 档**（按 `tier` 筛，不按文件）的和恒等于 `SURFACE_TAG_FROZEN_LEGACY_COUNT`（堵「降 legacy 值腾地方」），
 *        锚（`SURFACE_TAG_ANCHOR`：条目数 + 一个具名文件的登记值与实测值）须同步；
 *   牙 4 **未登记文件的命中仍然 = 0**（`surfaceRatchet.test.ts` ⑤ 原样保留，本件再查一次）；
 *   牙 5 **登记必须带理由**（`reason` ≥ 12 字，写明哪个视图 / 为什么用 `<Surface>`）**且防僵尸登记**
 *        （登记的文件必须**真实存在**于扫描面内 ∧ **此刻仍命中 > 0**）。
 *
 * ★ T19（键 `file` → `(file, tier)`）：**同键（同文件 ∧ 同档）才 `REG_DUP` 红**，同一文件**可以两行**
 *   （`legacy` + `new` 各一行）⇒ 「legacy 文件内新增一处 `<Surface>`」有了合法路径：加一行 `tier:"new"`
 *   （值 = 新增处数）+ 抬 `FROZEN_SURFACE_TAG_TOTAL` + 同步 `SURFACE_TAG_ANCHOR.entries`；🔴 **不许**抬
 *   legacy 面（`SURFACE_TAG_FROZEN_LEGACY_COUNT` 之和锁当场顶红）。
 *   🔴 **不改窄任何牙**：牙 1/2 的分档算术是「同文件两行」下**唯一**能同时表达「legacy 只许降」与
 *   「new 恰等于实测」的口径；legacy 和锁**按档位**求和（旧写法 `LEGACY.has(file)` 在双行文件上会把
 *   new 档算进 legacy 面 ⇒ 那是改键后**必须**跟着改的一处口径，不是放宽）。
 *
 * ★ 仪器：与 `surfaceRatchet.test.ts` ⑦ **共用** `surfaceScan.ts` 与 `sliceScan.ts`
 *   （域谓词 / 剥注释 / 开标签提取都只有一份实现）—— 两件判据读的是同一把尺子。
 *
 * ★ 变异体（T0 harness · 每变异新解一棵树 · CONTROL 先 `ran===true` 再断言 `red`）：见
 *   `tmp/t15a/patches/` 与 `task-15a-report.md` 的 M1–M6 读数表。
 *
 * 副作用：只读磁盘（递归遍历 `app/src`）。边界：**文本级**判据、不做 AST；`reason` 的长短只判
 *   「非空且 ≥12 字」，**内容质量由人审**（机器判不了「理由是否真诚」）。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { relOf, walkSources } from "./sliceScan";
import { inDomain, scanSurfaceTags, textOf as textOfSrc } from "./surfaceScan";
import {
  FROZEN_SURFACE_TAG_TOTAL, SURFACE_TAG_ANCHOR, SURFACE_TAG_FROZEN_LEGACY_COUNT,
} from "./surfaceBaseline";
import { SURFACE_TAG_REGISTRY, type SurfaceTagRegistryEntry } from "./surfaceResidual";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `app/src` —— 登记表的键就是相对这个目录的正斜杠路径 */
const SRC = join(HERE, "..", "..");
const textOf = (rel: string): string => textOfSrc(SRC, rel);
/** 域内文件清单（与 ⑦ 同一个谓词 `inDomain`） */
const FILES: readonly string[] = walkSources(SRC).map((abs) => relOf(SRC, abs)).filter(inDomain);
/** 域内全部 `<Surface>` 开标签（逐文件） */
const SURFACE_TAGS = scanSurfaceTags(FILES, textOf);

/**
 * 登记表的**键** = `(file, tier)` 二元组（T19）—— `REG_DUP` / 形状断言 / 字典序断言共用**这一处**实现，
 * 故「键退回 `file`」这类变异会同时打到三条断言上（变异体 M1 的红点即在此）。
 */
const keyOf = (e: Pick<SurfaceTagRegistryEntry, "file" | "tier">): string => `${e.file}|${e.tier}`;
/** 登记表的逐**键**读出（同键只许一条 —— 重复键会让「Σ 登记值」与「逐文件比对」两套口径漂移） */
const REG = new Map<string, number>();
const REG_DUP: string[] = [];
for (const e of SURFACE_TAG_REGISTRY) {
  const k = keyOf(e);
  if (REG.has(k)) REG_DUP.push(k);
  REG.set(k, (REG.get(k) ?? 0) + e.count);
}
/**
 * 逐文件**按档位**聚合（T19：同一文件可以两行 ⇒ 逐文件比对必须先分档，不能只按文件求和）：
 * `legacy` = 该文件 legacy 档登记值之和（`≤` 上限）· `next` = new 档登记值之和（**恰等于**实测减去 legacy 面）。
 */
interface TierAgg { readonly legacy: number; readonly next: number }
const BY_FILE = new Map<string, TierAgg>();
for (const e of SURFACE_TAG_REGISTRY) {
  const cur = BY_FILE.get(e.file) ?? { legacy: 0, next: 0 };
  BY_FILE.set(e.file, e.tier === "legacy"
    ? { legacy: cur.legacy + e.count, next: cur.next }
    : { legacy: cur.legacy, next: cur.next + e.count });
}
/** legacy **档**的文件集（判定一律看 `e.tier`；此处只用于「legacy 集合非空」这条非真空自证） */
const LEGACY = new Set(SURFACE_TAG_REGISTRY.filter((e) => e.tier === "legacy").map((e) => e.file));
/** 实测逐文件读出（0 命中的文件不进 `SURFACE_TAGS` ⇒ 显式补 0，好让「表里有、实测无」被抓住） */
const hitsOf = (rel: string): number => SURFACE_TAGS.filter((t) => t.file === rel).length;

describe("⑪ `<Surface>` 新增调用点登记制（T15a 判据修正：允许合法增长，但只走登记通道）", () => {
  it("牙 5a 登记表形状：文件真实存在 · count 是正整数 · 理由 ≥12 字 · 键唯一 · 键按字典序 · 表非空", () => {
    const bad: string[] = [];
    for (const e of SURFACE_TAG_REGISTRY) {
      if (!FILES.includes(e.file)) bad.push(`${e.file}: 不在扫描面里（登记了不存在的文件 · 防僵尸登记）`);
      if (!Number.isInteger(e.count) || e.count < 1) bad.push(`${e.file}: count=${e.count}（登记值必须是 ≥1 的整数）`);
      if (e.reason.trim().length < 12) bad.push(`${e.file}: 理由为空或 <12 字 —— 登记必须写明哪个视图 / 为什么用 <Surface>`);
    }
    expect(bad, `登记表有误：\n${bad.join("\n")}`).toEqual([]);
    expect(REG_DUP, `登记表里有重复键（同 \`(file, tier)\` 只许一条）：\n${REG_DUP.join("\n")}`).toEqual([]);
    const keys = SURFACE_TAG_REGISTRY.map(keyOf);
    expect(keys, "登记表的键（`file|tier`）必须按字典序（与 FROZEN_*_BY_FILE 同范式）").toEqual([...keys].sort());
    expect(SURFACE_TAG_REGISTRY.length, "登记表空了 ⇒ 本组判据空真").toBeGreaterThan(0);
    expect(LEGACY.size, "legacy 集合为空 ⇒ 牙 1 与 legacy 和锁都会空真").toBeGreaterThan(0);
    // 🅿️ 正控（防真空）：键**确实是二元组** —— 同 `file` 不同 `tier` 必须给出**两个**不同的键。
    //   把 `keyOf` 变异回 `e.file` ⇒ 这两行折叠成 1 ⇒ 本行红 ⇒ 钉住「`REG_DUP` 的语义跟着键走」
    //   （改键前 `REG_DUP` 判的是同 `file`；改键后判的是同 `(file, tier)`）。
    expect(
      new Set([
        keyOf({ file: "views/zz-key-probe.tsx", tier: "legacy" }),
        keyOf({ file: "views/zz-key-probe.tsx", tier: "new" }),
      ]).size,
      "同 file 不同 tier 被折叠成同一个键 ⇒ 键退回了 `file`（改键失效）",
    ).toBe(2);
  });

  it("牙 1/4/5b：既有文件不许涨 · 未登记文件的命中 = 0 · 登记过的防僵尸（实测 > 登记 与 实测 = 0 都报错）", () => {
    const measured = new Map<string, number>();
    for (const t of SURFACE_TAGS) measured.set(t.file, (measured.get(t.file) ?? 0) + 1);
    expect(measured.size, "域内一个 `<Surface>` 都没有 ⇒ 本组判据空真（仪器静默失效？）").toBeGreaterThan(0);
    const zombie: string[] = [];
    const overflow: string[] = [];
    for (const [file, n] of measured) {
      const agg = BY_FILE.get(file);
      // 牙 4：未登记文件的命中仍为 0
      if (agg === undefined) { zombie.push(`${file}: 实测 ${n} 处，**未登记**（新调用点请登记：登记 + 抬高总数 + 同步锚）`); continue; }
      // 牙 1：**两档之和**是实测的紧上界（新登记行由下一用例的「恰等于实测」管）
      if (agg.legacy + agg.next < n) {
        overflow.push(`${file}: 登记 ${agg.legacy + agg.next} 处，实测 ${n} 处 ⇒ 登记值被超（legacy 只许降 / 新登记必须恰等于实测）`);
      }
    }
    // 牙 5b：登记的文件此刻必须仍命中（防僵尸登记）
    for (const [file, agg] of BY_FILE) {
      const n = hitsOf(file);
      if (n === 0) zombie.push(`${file}: 登记 ${agg.legacy + agg.next} 处，实测 0 处 ⇒ 僵尸登记（迁走了却还挂着）`);
    }
    expect(zombie, `未登记 / 僵尸：\n${zombie.join("\n")}`).toEqual([]);
    expect(overflow, `登记值被超：\n${overflow.join("\n")}`).toEqual([]);
  });

  it("牙 2/3：新登记须恰等于实测 · 总数 == Σ登记 == Σ实测 · legacy 和锁死", () => {
    const regSum = SURFACE_TAG_REGISTRY.reduce((a, e) => a + e.count, 0);
    expect(regSum, `Σ 登记值 ${regSum} ≠ FROZEN_SURFACE_TAG_TOTAL ${FROZEN_SURFACE_TAG_TOTAL}（改总数必须同步登记表）`).toBe(
      FROZEN_SURFACE_TAG_TOTAL,
    );
    // 登记制不是「把表抬高就完事」：凭空抬高总数 ⇒ 实测跟不上 ⇒ 红
    expect(SURFACE_TAGS.length, `域内实测 ${SURFACE_TAGS.length} 个 <Surface> ≠ FROZEN_SURFACE_TAG_TOTAL ${FROZEN_SURFACE_TAG_TOTAL}`).toBe(
      FROZEN_SURFACE_TAG_TOTAL,
    );
    // legacy 面锁死：**按档位**筛（T19 起同一文件可有两行 ⇒ `LEGACY.has(file)` 会把 new 档算进 legacy 面）
    const legacySum = SURFACE_TAG_REGISTRY.filter((e) => e.tier === "legacy").reduce((a, e) => a + e.count, 0);
    expect(legacySum, `legacy 登记值之和 ${legacySum} ≠ ${SURFACE_TAG_FROZEN_LEGACY_COUNT}（T17-B 迁移面只许收紧，不许腾挪）`).toBe(
      SURFACE_TAG_FROZEN_LEGACY_COUNT,
    );
    const bad: string[] = [];
    for (const [file, agg] of BY_FILE) {
      const n = hitsOf(file);
      if (agg.legacy > 0) {
        // 牙 1：legacy 面 = 实测**减去**该文件 new 档登记值之和 ⇒ `≤` 上限（只许降）
        const legacyPart = n - agg.next;
        if (legacyPart > agg.legacy) bad.push(`${file}: legacy 实测 ${legacyPart} > 登记 ${agg.legacy} ⇒ 既有文件不许涨（牙 1）`);
        if (legacyPart === 0) bad.push(`${file}: legacy 实测 0 ⇒ 已迁空，请从登记表收紧（legacy 行只许降，降完手工同步总和）`);
      }
      if (agg.next > 0 && n - agg.legacy !== agg.next) {
        // 牙 2：new 档 = **恰等于**实测减去 legacy 档登记值之和（不是 ≤）
        bad.push(`${file}: 新登记 ${agg.next}，实测 ${n} ⇒ 新登记必须**恰等于**实测（防「先把表抬高再看」）`);
      }
    }
    expect(bad, `登记表与实测不符：\n${bad.join("\n")}`).toEqual([]);
  });

  it("牙 3（锚同步）：条目数 + 一个具名登记的登记值与实测值 + 锚非零", () => {
    expect(SURFACE_TAG_REGISTRY, "登记表条目数 ≠ 锚（新登记必须同步 SURFACE_TAG_ANCHOR.entries）").toHaveLength(
      SURFACE_TAG_ANCHOR.entries,
    );
    const anchorEntry = SURFACE_TAG_REGISTRY.find((e) => e.file === SURFACE_TAG_ANCHOR.file);
    expect(anchorEntry, `锚文件 ${SURFACE_TAG_ANCHOR.file} 不在登记表里`).toBeDefined();
    expect(anchorEntry?.count, `锚文件 ${SURFACE_TAG_ANCHOR.file} 的登记值 ≠ 锚`).toBe(SURFACE_TAG_ANCHOR.value);
    expect(hitsOf(SURFACE_TAG_ANCHOR.file), `锚文件 ${SURFACE_TAG_ANCHOR.file} 的**实测**值 ≠ 锚`).toBe(SURFACE_TAG_ANCHOR.value);
    expect(SURFACE_TAG_ANCHOR.value, "锚值不该是 0（那样它对「仪器静默返回 0」毫无牙齿）").toBeGreaterThan(0);
  });

  it("防真空阳性对照：`hitsOf` 对未登记文件返回 0、对锚文件 > 0；域非空", () => {
    expect(FILES.length, "扫描域为空 ⇒ 本组全部判据空真").toBeGreaterThan(200);
    expect(hitsOf("components/GoalCard.tsx"), "域内一个没登记的普通文件被读成有 <Surface>（仪器过宽）").toBe(0);
    expect(hitsOf(SURFACE_TAG_ANCHOR.file), "锚文件的实测读数 ≤ 0 ⇒ 上面那条对照是空扫").toBeGreaterThan(0);
    expect(SURFACE_TAG_REGISTRY.some((e) => e.count > 0), "登记表里一个正数都没有 ⇒ 登记制空转").toBe(true);
  });
});
