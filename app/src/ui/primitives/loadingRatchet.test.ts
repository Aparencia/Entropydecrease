// @vitest-environment node
/**
 * @ai-context **加载态棘轮**（批 4 B11 裁决 + Task 14 的落点）：**只许减少，不许新增**。
 *
 * Why：B11 裁定五类重复走「切片 + 棘轮」——加载态 18 处里 14 处在切片内，批 4 迁不完；没有棘轮，
 * 「永远迁不完」就退化成「永远在迁」，而规格 §5.1 的病灶逐字是「全站 **0 骨架屏**，长任务只有一行
 * 灰字」。判据取「文件 → 行数」而非「逐行原文」（与 `zIndex.guard` 刻意不同）：逐行 key 会在拆件 /
 * 行号漂移时把命中变成新增 ⇒ 假红。
 *
 * ★ 牙齿（评审 M-1 的结清）：③ 用「迁移面(0) ∪ 残留面(1)」钉死冻结表每一格 + `TOTAL == RESIDUAL.length`
 *   独立校验和 ⇒「总数 + 某一残留格同时抬高」不再自洽。
 *
 * ★ 仪器已析出成 `./loadingScan`（收口评审 I-3：本文件贴 300 行硬限，加锚必须先析出）——
 *   域 / 剥注释 / 行口径 / 五事实一律在那里，本文件只留**断言**。
 *
 * 副作用：只读磁盘（`loadingScan` 模块加载时递归遍历 `app/src` 一次），不修改任何文件。边界：只管可见
 *   加载文案（不含布尔门控本身、不含 `busy` 状态机、不含已声明的 4 处例外）；基线随迁移**只降不升**。
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FROZEN_LOADING_RESIDUAL_COUNT,
  FROZEN_LOADING_TEXT_BY_FILE,
  FROZEN_LOADING_TEXT_TOTAL,
  FROZEN_MIGRATED_FILES_COUNT,
  MIGRATED_FILES,
  RESIDUAL,
  type ResidualKind,
} from "./loadingBaseline";
import { HITTING, RE_LOADING_TEXT, SCAN, TOTAL, isHandwritten, isIcons, isPrim, isTest, stripComments } from "./loadingScan";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `app/src` —— 基线的键就是相对这个目录的正斜杠路径。 */
const SRC = join(HERE, "..", "..");
const KINDS: readonly ResidualKind[] = ["exception", "button-busy", "backlog"];
const DECLARED = new Set(RESIDUAL.map((r) => r.file));
const FROZEN_HOT = new Set(Object.entries(FROZEN_LOADING_TEXT_BY_FILE).filter(([, n]) => n > 0).map(([k]) => k));

describe("加载态棘轮（B11）：基线随迁移只降不升（冻结 18 → T14 第一提交 13）", () => {
  it("① 仪器自证：能命中已知存在的串 · 对非加载串报 0 · 剥注释生效 · 域过滤双侧自证（#26）", () => {
    // 阳性：默认文案与"…"式文案都命中（手写占位）
    expect(isHandwritten("const a = <p>加载中…</p>;"), "手写默认文案没被算成占位").toBe(true);
    expect(isHandwritten("const a = <p>加载工作台数据…</p>;"), "手写长文案没被算成占位").toBe(true);
    // 阴性①：文案由**原语的 label** 承载 ⇒ 不算手写占位（迁移的终点形态）
    expect(isHandwritten('const a = <Loading label="加载中…" />;'), "原语 label 被误算成手写占位").toBe(false);
    expect(isHandwritten('const a = <Loading label={status || "加载预览中…"} />;'), "表达式 label 被误算").toBe(false);
    // 阴性①b（**判定收紧的夹具**，收口评审 I-2）：`aria-label=` 不是原语的 `label` ⇒ 仍算手写占位
    // （`\b` 在 `-` 后成立，原写法会把它当载体 ⇒ 一条 `aria-label` 就能让棘轮对手写文案失明）
    expect(isHandwritten('const a = <div aria-label="加载中…">加载中…</div>;'), "`aria-label=` 被误当成原语 label").toBe(true);
    // 阴性②：不是加载态的"加载"不算（错误文案 / 加载完成 / 超窗）
    expect(isHandwritten("setErr(`加载失败: ${e}`)"), "错误文案被误算成加载态").toBe(false);
    expect(isHandwritten("const done = 已加载;")).toBe(false);
    expect(isHandwritten("加载一二三四五六七八九十中"), "超窗文案被误算").toBe(false);
    // 剥注释：注释里的加载文案不算命中（仓内多处注释含"加载中"）
    expect(isHandwritten(stripComments("// 加载中…\n")), "行注释里的文案被当成了代码").toBe(false);
    expect(isHandwritten(stripComments("/* 加载中… */\n")), "块注释里的文案被当成了代码").toBe(false);
    // ★ 剥注释器**判定收紧**的回归夹具（收口评审 I-A1）：闭合标签 `</span>` 的 `/` 曾被 `regexStart`
    // 判成正则起点 ⇒ 夹在两个闭合标签之间的内容被抹掉（本文件原来逐字重写的那份状态机同样中招）。
    // 正侧：闭合标签**之后**的加载文案必须还在；反侧：正则体**含**该文案时必须被抹掉（只剩第二行）。
    expect(RE_LOADING_TEXT.test(stripComments('<span>a</span>加载中…<i /></span>\n')), "闭合标签后面的加载文案被剥注释器抹掉了").toBe(true);
    expect(RE_LOADING_TEXT.test(stripComments('const r = x < /加载中…/.test(y);\nconst s = "ok";\n')), "真正的正则体没有跳过（`<` 后带空白）").toBe(false);
    // 域过滤双侧自证：包含域样本（**余量文件** —— 不在任何并行单元的切片里，读数稳定）+
    // 排除域样本（原语/测试文件确实不在扫描面里，且该样本文件真实存在 ⇒ 自证不空转）
    expect(HITTING.length, "扫描面里一个命中都没有 ⇒ 下面所有计数判据都会空真").toBeGreaterThan(0);
    expect(SCAN.get("components/SessionListBody.tsx")?.hits ?? 0).toBeGreaterThan(0);
    expect(SCAN.has("ui/primitives/Loading.tsx"), "原语层被误纳入扫描域").toBe(false);
    expect(SCAN.has("ui/primitives/Loading.test.tsx"), "测试文件被误纳入扫描域").toBe(false);
    expect(existsSync(join(SRC, "ui", "primitives", "Loading.tsx")), "排除域样本文件不存在 ⇒ 自证无效").toBe(true);
  });

  it("② 总量与逐文件只减不增；命中文件必须都在冻结表里（新文件带加载词 = 这里红）", () => {
    const regressions: string[] = [];
    for (const [file, facts] of HITTING) {
      const v = facts.hits;
      const base = FROZEN_LOADING_TEXT_BY_FILE[file];
      if (base === undefined) {
        regressions.push(`${file}: ${v} 行，冻结表里没有这个键（新写的加载文案请用 \`Loading\`/\`Skeleton\`）`);
        continue;
      }
      if (v > base) regressions.push(`${file}: ${base} → ${v}（+${v - base}）`);
    }
    expect(regressions, `以下文件的可见加载文案超过冻结基线：\n${regressions.join("\n")}`).toEqual([]);
    expect(TOTAL, `全仓可见加载文案已从基线 ${FROZEN_LOADING_TEXT_TOTAL} 涨到 ${TOTAL}`).toBeLessThanOrEqual(
      FROZEN_LOADING_TEXT_TOTAL,
    );
  });

  it("③ 基线自洽：表被完全钉死（键集 == 迁移面 ∪ 残留面 · 总数 == 残留条目数）", () => {
    const sum = Object.values(FROZEN_LOADING_TEXT_BY_FILE).reduce((a, b) => a + b, 0);
    expect(sum, "冻结总数与逐文件之和不等（改基线必须两处同改，且只许往小改）").toBe(FROZEN_LOADING_TEXT_TOTAL);
    // 实测**低于**冻结是允许的（别的单元先迁走 / 本棘轮尚未收紧）：棘轮只保证"不升"。
    // 这里刻意**不**断言严格相等 —— 否则并行窗口里别人的提交（或本单元第二提交）会把本判据判红。
    expect(TOTAL, `实测总数 ${TOTAL} 已超过冻结 ${FROZEN_LOADING_TEXT_TOTAL}（迁移后请把基线一起收紧）`).toBeLessThanOrEqual(
      FROZEN_LOADING_TEXT_TOTAL,
    );
    // ★ 表的**每一格**都被两张声明表钉死（T13–T15 评审 M-1 的洞：原来只钉迁移面 ⇒「总数 + 某个残留格
    // 同时 +1」全绿）。三种 kind 的允许残留数一律是 1 处/文件（见 loadingBaseline 的键语义：0=已承载）。
    const expected: Record<string, number> = {};
    for (const f of MIGRATED_FILES) expected[f] = 0;
    for (const r of RESIDUAL) expected[r.file] = 1;
    expect(FROZEN_LOADING_TEXT_BY_FILE, "冻结表 ≠ 迁移面(0) ∪ 残留面(1)：多余键 / 漏键 / 某格上限被手改").toEqual(expected);
    expect(FROZEN_LOADING_TEXT_TOTAL, "冻结总数 ≠ 残留条目数（残留面每条恰 1 处 ⇒ 两者必须相等）").toBe(RESIDUAL.length);
    // ★ **迁移面只许增 / 残留面只许减**（收口评审 I-3）：上面那条「整表钉死」只挡单点篡改 ——
    // 把文件从迁移面**挪进**残留面时 `expected` 会跟着变（实测 `m2b` 全绿）⇒ 要靠这两条独立锚。
    expect(MIGRATED_FILES.length, "迁移面被缩小（有人把文件挪进残留面来放行新写的加载文案）")
      .toBeGreaterThanOrEqual(FROZEN_MIGRATED_FILES_COUNT);
    expect(RESIDUAL.length, "残留条目变多（自助豁免：新写文案 + 自登记一条 backlog 即可通过）")
      .toBeLessThanOrEqual(FROZEN_LOADING_RESIDUAL_COUNT);
    // 锚不许是僵尸：两条锚各自与实测贴住的方向自证（迁移面非空 ∧ 残留面非空 ⇒ 上面两条不空真）
    expect(FROZEN_MIGRATED_FILES_COUNT, "迁移面锚 ≤ 0 ⇒ 上一条空真").toBeGreaterThan(0);
    expect(FROZEN_LOADING_RESIDUAL_COUNT, "残留面锚 ≤ 0 ⇒ 残留面被清空（或锚失效）").toBeGreaterThan(0);
  });

  it("④ 残留声明自洽：每条带合法分类与非空理由，且声明键集 == 冻结表里值 > 0 的键集", () => {
    const bad: string[] = [];
    for (const r of RESIDUAL) {
      if (!KINDS.includes(r.kind)) bad.push(`${r.file}: 分类 ${String(r.kind)} 不在 ${KINDS.join("/")} 里`);
      if (r.reason.trim().length < 12) bad.push(`${r.file}: 理由为空或过短 —— 例外必须带理由，不许静默`);
      const base = FROZEN_LOADING_TEXT_BY_FILE[r.file];
      if (base === undefined) bad.push(`${r.file}: 不在冻结表里`);
      else if (base === 0) bad.push(`${r.file}: 冻结上限已是 0（已迁移）⇒ 请从 RESIDUAL 删除（僵尸豁免）`);
    }
    expect(bad, `残留声明表有误：\n${bad.join("\n")}`).toEqual([]);
    expect(
      [...DECLARED].sort(),
      "残留声明键集必须逐字等于「冻结表里值 > 0」的键集（漏一条 = 有命中没登记；多一条 = 僵尸豁免）",
    ).toEqual([...FROZEN_HOT].sort());
  });

  it("④b 按钮内忙碌文案的承载证据：`button-busy` 类残留必须真的走 `busy`（不是原生 disabled）", () => {
    const bad: string[] = [];
    for (const r of RESIDUAL) {
      if (r.kind !== "button-busy") continue;
      const v = SCAN.get(r.file);
      if (!v) bad.push(`${r.file}: 不在扫描域内`);
      else if (!v.hasBusy) bad.push(`${r.file}: 声明为「按钮内忙碌文案」，却没有 \`busy\` 承载（原生 disabled 不是忙碌态原语）`);
    }
    expect(bad, `按钮忙碌态的承载证据不足：\n${bad.join("\n")}`).toEqual([]);
    expect(RESIDUAL.filter((r) => r.kind === "button-busy").length, "button-busy 类声明为空 ⇒ 本判据空真").toBeGreaterThan(0);
    // 阳性对照：本批新迁的那处确实是 `Button busy`
    expect(SCAN.get("components/WindowSelectCard.tsx")?.hasBusy).toBe(true);
  });

  it("⑤ 迁移面证据：已迁移文件的加载态必须由原语承载（0 命中 ∧ 含 `<Loading`/`<Skeleton`）", () => {
    const bad: string[] = [];
    expect(MIGRATED_FILES.length, "迁移面为空 ⇒ 本判据空真").toBeGreaterThan(0);
    for (const file of MIGRATED_FILES) {
      const v = SCAN.get(file);
      if (!v) {
        bad.push(`${file}: 文件不在扫描域内（拆件/改名后请更新迁移面）`);
        continue;
      }
      if (v.hits > 0) bad.push(`${file}: 仍有 ${v.hits} 行手写加载文案`);
      if (!v.hasPrimitive) bad.push(`${file}: 迁移面里没有 \`<Loading\` / \`<Skeleton\`（加载态没有真的交给原语）`);
    }
    expect(bad, `迁移面证据不足：\n${bad.join("\n")}`).toEqual([]);
  });

  it("⑥ 冻结表无僵尸键（清单里的每个文件都还在扫描域内存在）", () => {
    const zombies: string[] = [];
    for (const file of Object.keys(FROZEN_LOADING_TEXT_BY_FILE)) {
      const abs = join(SRC, file);
      if (!existsSync(abs)) zombies.push(`${file}: 文件不存在`);
      else if (isTest(abs) || isPrim(abs) || isIcons(abs)) zombies.push(`${file}: 已移出扫描域`);
    }
    expect(zombies, `冻结表里的键已失效（拆件/改名后请更新基线）：\n${zombies.join("\n")}`).toEqual([]);
  });

  it("⑦ 骨架必须与可读文案成对：任何用 `<Skeleton` 的文件也必须用 `<Loading`（别只留骨架）", () => {
    const bad: string[] = [];
    for (const [file, v] of SCAN) {
      if (v.hasSkeleton && !v.hasLoading) bad.push(`${file}: 只有骨架没有 \`Loading\`（骨架整组 aria-hidden ⇒ 别只留骨架）`);
    }
    expect(bad, `骨架缺少可读语义：\n${bad.join("\n")}`).toEqual([]);
    // 阳性对照：本批的骨架落点确实成对（否则上面那条会退化成空真）
    expect(SCAN.get("components/WebArticleView.tsx")?.hasSkeleton).toBe(true);
    expect(SCAN.get("components/WebArticleView.tsx")?.hasLoading).toBe(true);
  });
});
