// @vitest-environment node
/**
 * @ai-context **`Surface` 三条棘轮**（批 4 B11「切片 + 棘轮」+ B17 裁决 · Task 17-A 的落点）：
 * 卡片边框 / 越界圆角 / 阴影字面量 —— **只许减少，不许新增**。
 *
 * Why：规格 §5.1 的病灶逐字「`1px solid #e5e7eb`，**radius 6/8/10/12 混用**」，§4.1 逐字
 *   「**批 4 迁移时不得临时硬编码阴影**」。T17-A **一个调用点也不迁**（迁移是 T17-B）⇒ 本文件把
 *   迁移前的实测值**冻结**：没有棘轮，"还没迁完"就退化成"永远在迁"。
 *
 * ★ 仪器与域（与 `tmp/t17a/measure.mjs` 同源；口径本身是判据的一部分）
 *   ① 域 = `app/src/**` 的 `.ts`/`.tsx` **减** `*.test.ts(x)` **减** `ui/primitives/**`（B17 逐字）；
 *   ② 剥注释 = **复用共享仪器 `sliceScan.ts`**（状态机 + 等长空白替换）—— 不另写一份，防两套口径漂移；
 *   ③ 「处」= 剥注释后**整段文本**上的匹配次数（同行两次算 2；`nativeButtonBaseline` 同口径）；
 *   ④ 三条字面量各自独立（`FAMILIES`），**每条 6 个用例**（①逐文件 ≤ ②总数 ≤ ③表自洽 ④锚
 *      ⑤未登记文件 = 0 ⑥防真空对照）—— `describe.each` 让三组用例**各自具名**，失败可单点定位。
 *
 * ★ 第 ⑦ 条（计划 M3/V4 点名必须补）：**调用点不得用行内 `style` 覆盖 `Surface` 的底/圆角/边框**
 *   （ADR-033 §4：`style` 是纯透传、**视觉权威在类**）。迁移前域内 `<Surface` 开标签 **0 个** ⇒ 该判据
 *   对真实代码**空真**；故它自带正反 fixture（正例必命中 / 布局反例必不命中 / 域外样本不在域内）。
 *   ⚠️ T15a 后本件**不再**断言「标签数 == `FROZEN_SURFACE_TAG_TOTAL`」（那会让任何新视图用 `<Surface>`
 *   必然红）—— 改由 `surfaceTagRegistry.test.ts` ⑪ 的**新增调用点登记制**判：登记即计数、总数 ==
 *   Σ登记值 == Σ实测。本件只保留「标签数 == Σ 登记值」这一条**交叉**自证（两件判据对同一把尺子）。
 *
 * ★ 变异体（`tmp/t17a/run-mutants.mjs`，**每个变异新解一棵导出树** · CONTROL 在冻结提交的新解树上取）：
 *   M1 恢复一处 `border: "1px solid #e5e7eb"` ⇒ ①红 · M2 调用点新增 `boxShadow:` 字面量 ⇒ 阴影组红
 *   （**阴影红线**）· M3 行内 `style` 覆盖 `Surface` 底色 ⇒ ⑦红 · M4 新增 `borderRadius: 6` ⇒ 圆角组红 ·
 *   M5 删基线一行 ⇒ ④/③红 · M6（反例守卫，**必须绿**）新增合法档 `borderRadius: 8` ⇒ 全绿。
 *   （T15a 的 M1–M6 是**另一组**：`<Surface>` 调用点登记制，见 `surfaceTagRegistry.test.ts`。）
 *
 * 副作用：只读磁盘（递归遍历 `app/src`）。边界：**文本级**判据、不做 AST；切片外余量（边框 28 · 圆角 28 · 阴影 3 文件）只冻结不迁移，去向见 `surfaceBaseline.ts` 与 `tmp/t17a/slice.md`。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BORDER_ANCHOR, FROZEN_BORDER_BY_FILE, FROZEN_BORDER_TOTAL,
  FROZEN_RADIUS_OUTLIER_BY_FILE, FROZEN_RADIUS_OUTLIER_TOTAL,
  FROZEN_SHADOW_BY_FILE, FROZEN_SHADOW_TOTAL,
  RADIUS_OUTLIER_ANCHOR, SHADOW_ANCHOR,
} from "./surfaceBaseline";
import { relOf, stripComments, walkSources } from "./sliceScan";
import {
  absOf as absOfSrc, inDomain, overridesSurface, scanSurfaceTags, surfaceTagsIn, textOf as textOfSrc,
} from "./surfaceScan";
import {
  BORDER_RESIDUAL, RADIUS_RESIDUAL, SHADOW_RESIDUAL, SURFACE_RESIDUAL_WHY,
  SURFACE_TAG_REGISTRY, type ShadowResidualKind,
} from "./surfaceResidual";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `app/src` —— 基线的键就是相对这个目录的正斜杠路径。 */
const SRC = join(HERE, "..", "..");

/** 域口径与读法**全部来自共享件** `surfaceScan.ts`（域谓词只有一份实现） */
const absOf = (rel: string): string => absOfSrc(SRC, rel);
const textOf = (rel: string): string => textOfSrc(SRC, rel);
const FILES: readonly string[] = walkSources(SRC).map((abs) => relOf(SRC, abs)).filter(inDomain);
/** 「处」口径：整段文本上的匹配次数（`g` 只用于统计） */
const countOcc = (text: string, re: RegExp): number =>
  (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)) ?? []).length;

interface Family {
  readonly key: string;
  readonly label: string;
  readonly re: RegExp;
  readonly total: number;
  readonly byFile: Readonly<Record<string, number>>;
  readonly anchor: { readonly entries: number; readonly file: string; readonly value: number };
  /** ⑥ 的合成样本：正例必命中 / 反例取"最像的**合法**写法"（M6 的守卫就在这） */
  readonly positive: string;
  readonly negative: string;
}

const FAMILIES: readonly Family[] = [
  {
    key: "border", label: "棘轮一 · 卡片边框 `1px solid #e5e7eb`", re: /1px solid #e5e7eb/gi,
    total: FROZEN_BORDER_TOTAL, byFile: FROZEN_BORDER_BY_FILE, anchor: BORDER_ANCHOR,
    positive: 'border: "1px solid #e5e7eb",', negative: 'border: "1px solid #d1d5db",',
  },
  {
    key: "radius", label: "棘轮二 · 越界圆角 `6|12|14|999|2`", re: /borderRadius:\s*(?:6|12|14|999|2)\b/g,
    total: FROZEN_RADIUS_OUTLIER_TOTAL, byFile: FROZEN_RADIUS_OUTLIER_BY_FILE, anchor: RADIUS_OUTLIER_ANCHOR,
    positive: "borderRadius: 6,",
    // M6 的反例守卫：`borderRadius: 8`（合法档，按 B17 映射表走 `radius="panel"`）**不许**被算成越界
    negative: "borderRadius: 8,",
  },
  {
    key: "shadow", label: "棘轮三 · 阴影 `boxShadow:`（规格 §4.1 红线）", re: /boxShadow:/g,
    total: FROZEN_SHADOW_TOTAL, byFile: FROZEN_SHADOW_BY_FILE, anchor: SHADOW_ANCHOR,
    positive: 'boxShadow: "0 4px 12px rgba(0,0,0,0.12)",', negative: 'textShadow: "0 4px 12px rgba(0,0,0,0.12)",',
  },
];

/** 逐文件命中（只保留 > 0 的键；键 = 相对 `app/src` 的正斜杠路径） */
function scanFamily(re: RegExp): Map<string, number> {
  const map = new Map<string, number>();
  for (const rel of FILES) {
    const n = countOcc(textOf(rel), re);
    if (n > 0) map.set(rel, n);
  }
  return map;
}
const COUNTS: Readonly<Record<string, Map<string, number>>> = {
  border: scanFamily(FAMILIES[0].re), radius: scanFamily(FAMILIES[1].re), shadow: scanFamily(FAMILIES[2].re),
};

describe.each(FAMILIES)("$label（T17-A 冻结基线，只许降）", (f) => {
  const counts = COUNTS[f.key];
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  it("① 逐文件 ≤ 冻结值（**逐文件牙齿**：只看总数会漏掉「一处涨、一处降」）", () => {
    const grown = [...counts.entries()].filter(([file, n]) => n > (f.byFile[file] ?? 0))
      .map(([file, n]) => `${file}: ${f.byFile[file] ?? 0} → ${n}`);
    expect(grown, `这些文件的命中**涨了**（棘轮只许降；真迁走了请手工收紧 surfaceBaseline）：\n${grown.join("\n")}`).toEqual([]);
  });

  it("② 总数 ≤ 冻结总数", () => {
    expect(total, `实测 ${total} 处已超过冻结 ${f.total} 处`).toBeLessThanOrEqual(f.total);
  });

  it("③ 冻结表自洽：FROZEN_TOTAL === sum(entries)，且键按字典序（手改会打破）", () => {
    const keys = Object.keys(f.byFile);
    expect(Object.values(f.byFile).reduce((a, b) => a + b, 0), "逐文件之和 ≠ 冻结总数（改基线必须两处同改）").toBe(f.total);
    expect(keys, "基线的键必须按字典序（基线由 tmp/t17a/gen-baseline.mjs 生成，手改请重跑生成器）").toEqual([...keys].sort());
    expect(keys.length, "基线条目数不该缩水").toBeGreaterThanOrEqual(20);
  });

  it("④ 锚：条目数 + 一个具名文件的冻结值（防「仪器静默失效 ⇒ 全 0 ⇒ 总数判据仍绿」）", () => {
    expect(Object.keys(f.byFile)).toHaveLength(f.anchor.entries);
    expect(f.byFile[f.anchor.file], `锚文件 ${f.anchor.file} 在冻结表里没有条目`).toBe(f.anchor.value);
    expect(counts.get(f.anchor.file), `锚文件 ${f.anchor.file} 的实测值不等于冻结的 ${f.anchor.value}`).toBe(f.anchor.value);
    expect(f.anchor.value, "锚值不该是 0（那样它对「仪器静默返回 0」毫无牙齿）").toBeGreaterThan(0);
  });

  it("⑤ 基线**未登记**文件的命中 = 0（新写的字面量 ⇒ 这里红，不许靠「没登记就不管」空转）", () => {
    const unregistered = [...counts.keys()].filter((file) => !(file in f.byFile));
    expect(unregistered, `这些文件有命中却不在冻结表里（新写的请改用原语 / 档位）：\n${unregistered.join("\n")}`).toEqual([]);
    expect(Object.values(f.byFile).filter((n) => n > 0).length, "冻结表里一个值 > 0 的条目都没有 ⇒ 本棘轮空转").toBeGreaterThan(0);
  });

  it("⑥ 防真空阳性对照：仪器静默失效（返回 0）时本组必须红，不许绿", () => {
    const synth = (body: string): string => stripComments(`const s = {\n  ${body}\n};`);
    expect(countOcc(synth(f.positive), f.re), "阳性样本没被命中 ⇒ 仪器失效").toBe(1);
    expect(countOcc(synth(f.negative), f.re), "反例被误命中 ⇒ 正则过宽").toBe(0);
    expect(countOcc(stripComments(`// ${f.positive}\n`), f.re), "注释里的写法被当成了代码").toBe(0);
    // 真样本侧：域非空 ∧ 命中文件数 == 锚的条目数（仪器返回 0 时，这条与 ④ 一起红）
    expect(FILES.length, "扫描域为空 ⇒ 下面所有计数判据都会空真").toBeGreaterThan(200);
    expect(counts.size, "域内一个命中都没有 ⇒ 本组棘轮全是空真（仪器静默失效）").toBe(f.anchor.entries);
  });
});

/* ───────── ⑦ ADR-033 §4 的机器判据：调用点不得用行内 `style` 覆盖 `Surface`（计划 M3/V4） ───────── */
// 仪器在 `surfaceScan.ts`（T15a 析出：⑦ 与 ⑪ 的登记制共用同一把尺子，防两套口径漂移）
const SURFACE_TAGS = scanSurfaceTags(FILES, textOf);
const OVERRIDES = SURFACE_TAGS.filter((t) => overridesSurface(t.tag));

describe("⑦ 调用点不得用行内 `style` 覆盖 `Surface` 的底/圆角/边框（ADR-033 §4）", () => {
  it("域内 0 命中（命中即列出 `文件:行` 与整个开标签）", () => {
    const hits = OVERRIDES.map((o) => `${o.file}:${o.line} — ${o.tag.replace(/\s+/g, " ").slice(0, 140)}`);
    expect(hits, `行内 style 覆盖了 Surface 的视觉语义（视觉权威必须在类上）：\n${hits.join("\n")}`).toEqual([]);
  });

  it("启发式双侧自证 + 登记面自证：正例必命中 · 布局反例必不命中 · 域外样本不在域内 · 标签数 == Σ 登记值", () => {
    expect(overridesSurface('<Surface style={{ background: "#fff" }}>'), "底色覆盖没被命中").toBe(true);
    expect(overridesSurface('<Surface\n  className="card"\n  style={{ borderRadius: 8 }}\n>'), "跨行 + 圆角覆盖没被命中").toBe(true);
    expect(overridesSurface('<Surface style={{ border: "1px solid #e5e7eb" }}>'), "边框覆盖没被命中").toBe(true);
    expect(overridesSurface('<Surface className="card" style={{ padding: 12, marginTop: 4 }}>'), "布局口被误判成视觉覆盖").toBe(false);
    expect(surfaceTagsIn('<Button style={{ background: "#fff" }}>x</Button>'), "<Button> 被当成了 Surface").toHaveLength(0);
    // 域外样本：样本文件真实存在 ∧ 不在扫描面里（`inDomain` 与建 `FILES` 用的是同一个谓词）
    expect(existsSync(absOf("ui/primitives/Surface.test.tsx")), "域外样本文件不存在 ⇒ 排除自证无效").toBe(true);
    expect(inDomain("ui/primitives/Surface.test.tsx"), "原语层/测试文件掉进了域内").toBe(false);
    expect(inDomain("components/GoalCard.tsx"), "域内样本被误排除").toBe(true);
    // 空真登记：迁移前 0 个 `<Surface>` ⇒ 那条 0 命中是**空真**；T17-B 迁进 14 个后 ⑦ 第一次有真实输入。
    // T15a 修正：标签数不再钉死常数，而须**恰等于登记值之和**（登记即计数；增长走 ⑪ 的登记制通道）
    expect(SURFACE_TAGS.length, "调用点里的 `<Surface>` 数 ≠ 登记表之和 ⇒ 请走 ⑪ 的登记制（登记 + 抬高总数 + 同步锚）").toBe(
      SURFACE_TAG_REGISTRY.reduce((a, e) => a + e.count, 0),
    );
  });
});

/* ───────── ⑧ 阴影残留声明：逐条理由 + 防「僵尸豁免」 ───────── */
const KINDS: readonly ShadowResidualKind[] = ["exception", "anchored-menu", "backlog"];

describe("⑧ 阴影残留声明自洽（照 loadingBaseline 的 RESIDUAL 范式）", () => {
  it("每条带合法分类与非空理由，声明键集 == 「冻结表里值 > 0」的键集（漏一条/多一条都红）", () => {
    const bad: string[] = [];
    for (const r of SHADOW_RESIDUAL) {
      if (!KINDS.includes(r.kind)) bad.push(`${r.file}: 分类 ${String(r.kind)} 不在 ${KINDS.join("/")} 里`);
      if (r.reason.trim().length < 12) bad.push(`${r.file}: 理由为空或过短 —— 例外必须带理由，不许静默`);
      const base = FROZEN_SHADOW_BY_FILE[r.file];
      if (base === undefined) bad.push(`${r.file}: 不在冻结表里`);
      else if (base === 0) bad.push(`${r.file}: 冻结上限已是 0（已迁移）⇒ 请从 SHADOW_RESIDUAL 删除（僵尸豁免）`);
    }
    expect(bad, `残留声明表有误：\n${bad.join("\n")}`).toEqual([]);
    const declared = SHADOW_RESIDUAL.map((r) => r.file).sort();
    const hot = Object.entries(FROZEN_SHADOW_BY_FILE).filter(([, n]) => n > 0).map(([k]) => k).sort();
    expect(declared, "残留声明键集必须逐字等于「冻结表里值 > 0」的键集（漏一条 = 有命中没登记；多一条 = 僵尸豁免）").toEqual(hot);
  });

  it("防僵尸豁免：每条声明的文件**此刻仍然命中**；且三类各自非空（判据不是空枚举）", () => {
    const zombies = SHADOW_RESIDUAL.filter((r) => (COUNTS.shadow.get(r.file) ?? 0) === 0).map((r) => r.file);
    expect(zombies, `这些文件已不再有 boxShadow（豁免是僵尸，请删除）：\n${zombies.join("\n")}`).toEqual([]);
    for (const kind of KINDS) {
      expect(SHADOW_RESIDUAL.filter((r) => r.kind === kind).length, `分类 ${kind} 一条都没有`).toBeGreaterThan(0);
    }
    // 阳性对照：仪器在豁免文件上读得出命中（否则上面那条只是空扫）
    expect(COUNTS.shadow.get(SHADOW_RESIDUAL[0].file) ?? 0).toBeGreaterThan(0);
  });
});

/* ───────── ⑩ 边框/圆角残留登记：逐条理由 + 防「僵尸豁免」（与 ⑧ 同范式；T17-B 新增） ───────── */
const RESIDUAL_FAMILIES = [
  { key: "border", label: "边框族", rows: BORDER_RESIDUAL, frozen: FROZEN_BORDER_BY_FILE },
  { key: "radius", label: "圆角族", rows: RADIUS_RESIDUAL, frozen: FROZEN_RADIUS_OUTLIER_BY_FILE },
] as const;

describe.each(RESIDUAL_FAMILIES)("⑩ $label残留登记自洽（T17-B）", ({ key, rows, frozen }) => {
  it("分类合法 · 理由非空 · 文件在冻结表里 · 防僵尸：声明的残留此刻仍须命中 ≥ count", () => {
    const counts = COUNTS[key];
    const bad: string[] = [];
    for (const r of rows) {
      const why = SURFACE_RESIDUAL_WHY[r.kind];
      if (!why || why.trim().length < 12) bad.push(`${r.file}: 类别 ${r.kind} 没有非空理由（豁免必须带理由，不许静默）`);
      if (!(r.file in frozen)) bad.push(`${r.file}: 不在冻结表里（登记了不存在的文件）`);
      if (r.count < 1) bad.push(`${r.file}: count=${r.count}（残留处数必须 ≥ 1）`);
      if ((counts.get(r.file) ?? 0) < r.count) bad.push(`${r.file}: 声明残留 ${r.count} 处，实测只剩 ${counts.get(r.file) ?? 0} ⇒ 僵尸豁免（迁走了却还挂着）`);
    }
    expect(bad, `残留登记表有误：\n${bad.join("\n")}`).toEqual([]);
    expect(new Set(rows.map((r) => r.kind)).size, "一条都没分类 ⇒ 登记是空枚举").toBeGreaterThan(0);
    expect(rows.length, "登记表空了 ⇒ 本组判据空真").toBeGreaterThan(0);
    expect(Object.values(SURFACE_RESIDUAL_WHY).filter((w) => w.trim().length >= 12).length, "理由表里有类别缺非空理由").toBe(
      Object.keys(SURFACE_RESIDUAL_WHY).length,
    );
  });
});

/* ───────── ⑨ 域口径与字面量边界（防「口径漂了但全绿」） ───────── */
describe("⑨ 域口径与字面量边界", () => {
  it("域双侧 + 三条字面量互斥 + M6 反例守卫", () => {
    expect(FILES.some((r) => r.startsWith("ui/primitives/")), "原语层没有从域里排除").toBe(false);
    expect(FILES.some((r) => /\.test\.tsx?$/.test(r)), "测试文件掉进了域内").toBe(false);
    for (const rel of ["ui/primitives/Surface.tsx", "ui/primitives/Surface.css"]) {
      expect(existsSync(absOf(rel)), `排除域样本 ${rel} 不存在 ⇒ 自证无效`).toBe(true);
    }
    // 域外样本的真实形态：`Surface.css` 里那处 `boxShadow:` **只出现在注释里** ⇒ 剥注释后 0
    // （这一条同时自证「剥注释生效」与「原语层不在域内」两件事）
    expect(
      countOcc(stripComments(readFileSync(absOf("ui/primitives/Surface.css"), "utf8")), FAMILIES[2].re),
      "原语层 CSS 剥注释后仍有 boxShadow: 命中 ⇒ 域口径或剥注释有问题",
    ).toBe(0);
    // 三条字面量互斥：同一个写法不会被两族重复计数
    for (const [i, s] of FAMILIES.map((f) => f.positive).entries()) {
      for (const o of FAMILIES.filter((_, j) => j !== i)) {
        expect(countOcc(s, o.re), `样本 \`${s}\` 同时被 ${o.key} 命中 ⇒ 重复计数`).toBe(0);
      }
    }
    // M6 反例守卫：合法档 `borderRadius: 8` 不入棘轮 ⇒ 新增它**必须绿**
    expect(countOcc("borderRadius: 8,", FAMILIES[1].re)).toBe(0);
  });
});
