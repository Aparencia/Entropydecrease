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
 *   牙 1 **既有文件一格都不许涨**：表里既有的 9 个文件逐文件 `实测 ≤ 登记值`（主牙齿）；
 *   牙 2 **新条目只许给「原本不在表里」的文件 ∧ `实测 == 登记值`（不是 ≤）** —— 防「先把表抬高再看」；
 *   牙 3 **总数三连通**：`FROZEN_SURFACE_TAG_TOTAL == Σ 登记值 == Σ 实测`，
 *        且 legacy 9 行的和恒等于 `SURFACE_TAG_FROZEN_LEGACY_COUNT`（堵「降 legacy 值腾地方」），
 *        锚（`SURFACE_TAG_ANCHOR`：条目数 + 一个具名文件的登记值与实测值）须同步；
 *   牙 4 **未登记文件的命中仍然 = 0**（`surfaceRatchet.test.ts` ⑤ 原样保留，本件再查一次）；
 *   牙 5 **登记必须带理由**（`reason` ≥ 12 字，写明哪个视图 / 为什么用 `<Surface>`）**且防僵尸登记**
 *        （登记的文件必须**真实存在**于扫描面内 ∧ **此刻仍命中 == count**）。
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
import { SURFACE_TAG_REGISTRY } from "./surfaceResidual";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `app/src` —— 登记表的键就是相对这个目录的正斜杠路径 */
const SRC = join(HERE, "..", "..");
const textOf = (rel: string): string => textOfSrc(SRC, rel);
/** 域内文件清单（与 ⑦ 同一个谓词 `inDomain`） */
const FILES: readonly string[] = walkSources(SRC).map((abs) => relOf(SRC, abs)).filter(inDomain);
/** 域内全部 `<Surface>` 开标签（逐文件） */
const SURFACE_TAGS = scanSurfaceTags(FILES, textOf);

/** 登记表的逐文件读出（同键只许一条 —— 重复键会让「Σ 登记值」与「逐文件比对」两套口径漂移） */
const REG = new Map<string, number>();
const REG_DUP: string[] = [];
for (const e of SURFACE_TAG_REGISTRY) {
  if (REG.has(e.file)) REG_DUP.push(e.file);
  REG.set(e.file, (REG.get(e.file) ?? 0) + e.count);
}
/** legacy 行 = T17-B 迁移快照的既有文件（`legacy: true` 标记；其和受冻结常数锁） */
const LEGACY = new Set(SURFACE_TAG_REGISTRY.filter((e) => e.legacy === true).map((e) => e.file));
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
    expect(REG_DUP, `登记表里有重复键（同键只许一条）：\n${REG_DUP.join("\n")}`).toEqual([]);
    const keys = SURFACE_TAG_REGISTRY.map((e) => e.file);
    expect(keys, "登记表的键必须按字典序（与 FROZEN_*_BY_FILE 同范式）").toEqual([...keys].sort());
    expect(SURFACE_TAG_REGISTRY.length, "登记表空了 ⇒ 本组判据空真").toBeGreaterThan(0);
    expect(LEGACY.size, "legacy 集合为空 ⇒ 牙 1 与 legacy 和锁都会空真").toBeGreaterThan(0);
  });

  it("牙 1/4/5b：既有文件不许涨 · 未登记文件的命中 = 0 · 登记过的防僵尸（实测 > 登记 与 实测 = 0 都报错）", () => {
    const measured = new Map<string, number>();
    for (const t of SURFACE_TAGS) measured.set(t.file, (measured.get(t.file) ?? 0) + 1);
    expect(measured.size, "域内一个 `<Surface>` 都没有 ⇒ 本组判据空真（仪器静默失效？）").toBeGreaterThan(0);
    const zombie: string[] = [];
    const overflow: string[] = [];
    for (const [file, n] of measured) {
      const reg = REG.get(file);
      // 牙 4：未登记文件的命中仍为 0
      if (reg === undefined) { zombie.push(`${file}: 实测 ${n} 处，**未登记**（新调用点请登记：登记 + 抬高总数 + 同步锚）`); continue; }
      // 牙 1：既有文件一格都不许涨（新登记行由下一用例的「恰等于实测」管）
      if (reg < n) overflow.push(`${file}: 登记 ${reg} 处，实测 ${n} 处 ⇒ 登记值被超（legacy 只许降 / 新登记必须恰等于实测）`);
    }
    // 牙 5b：登记的文件此刻必须仍命中（防僵尸登记）
    for (const [file, reg] of REG) {
      const n = hitsOf(file);
      if (n === 0) zombie.push(`${file}: 登记 ${reg} 处，实测 0 处 ⇒ 僵尸登记（迁走了却还挂着）`);
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
    // legacy 面锁死：9 个迁移快照文件的和恒为 FROZEN_LEGACY_COUNT ⇒ 不许「降一个 legacy 值去腾地方放行新条目」
    const legacySum = SURFACE_TAG_REGISTRY.filter((e) => LEGACY.has(e.file)).reduce((a, e) => a + e.count, 0);
    expect(legacySum, `legacy 登记值之和 ${legacySum} ≠ ${SURFACE_TAG_FROZEN_LEGACY_COUNT}（T17-B 迁移面只许收紧，不许腾挪）`).toBe(
      SURFACE_TAG_FROZEN_LEGACY_COUNT,
    );
    const bad: string[] = [];
    for (const e of SURFACE_TAG_REGISTRY) {
      const n = hitsOf(e.file);
      if (LEGACY.has(e.file)) {
        // 牙 1：legacy 行 = ≤ 上限（只许降）
        if (n > e.count) bad.push(`${e.file}: legacy 实测 ${n} > 登记 ${e.count} ⇒ 既有文件不许涨（牙 1）`);
        if (n === 0) bad.push(`${e.file}: legacy 实测 0 ⇒ 已迁空，请从登记表收紧（legacy 行只许降，降完手工同步总和）`);
      } else if (n !== e.count) {
        // 牙 2：新登记行 = **恰等于**实测（不是 ≤）
        bad.push(`${e.file}: 新登记 ${e.count}，实测 ${n} ⇒ 新登记必须**恰等于**实测（防「先把表抬高再看」）`);
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
