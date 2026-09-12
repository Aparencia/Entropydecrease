/**
 * @ai-context emptyStateRatchet.test.ts —— T13「空态切片迁移」的**棘轮 + 清单对拍**（B11）。
 *
 * Why：规格 §5.1 的空态账本是 **44 行 / 33 文件**，而批 4 走 **B11 的 (B) 切片 + 棘轮**
 * （全量约 330 文件次、无测试面 ⇒ 单批不可验收）。切片判据逐字 = ① 本批已触碰 ∪ ② `pages/**`
 * ∪ ③ 该文件有同名测试 ⇒ **28 文件**；余量 **5 文件**冻结给批 5/7。本文件钉住四件事：
 * ① 切片清单是**显式数组**（供 `tmp/t13/slice.mjs` 双向对拍）· ② 切片内非例外「未收口」命中 = 0 ·
 * ③ 余量文件逐文件冻结（只许减）+ 全仓总数 ≤ 44 · ④ 新增文件不得命中词表（白名单为空）。
 *
 * ★ 口径（**口径本身是判据的一部分**）：域 = `app/src/**` 的 `.ts`/`.tsx` 减 `*.test.ts(x)`
 * 减 `ui/primitives/**` 减 `ui/icons/**`（同探针 `prod`，故与 T14 的 `slice.mjs` 读数可直接对拍）。
 * **先剥注释**（状态机 `stripComments`）。词表 = 探针 `empty.re`，源码里写成 **Unicode 转义**
 * （免得「词表文件自己命中词表」= 自引用空真；⑤ 用解码断言防抄错码位）。
 * **`migrated`（已收口）** = 该命中行落在一次 `<EmptyState` / `empty(` 调用里（向上找最近的
 * **语法起点**行 —— JSX 属性常换行）。为什么需要这一档：迁移**保留用户可见文案原文** ⇒ 文案串
 * 必然还在文件里；判据的真身是「这句文案**是否走原语渲染**」，不是「字符串是否还存在」。
 *
 * 副作用：只读磁盘（遍历 `app/src` + 定点读例外行）。边界：文本级判据、不做 AST；
 * 例外 5 处的**行号**逐字冻结 —— 行号漂了或那一行不再命中词表即红。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 扫描仪器（状态机剥注释 / 递归遍历 / 行数组）—— T13 从本文件析出为共享模块，理由见 `./sliceScan`
import { readLines, relOf, stripComments, walkSources } from "./sliceScan";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const SELF = "ui/primitives/emptyStateRatchet.test.ts";

/**
 * 空态词表 —— 与探针 `tmp/t1/slice-manifest.mjs` 的 `empty.re` 的 **8 个词逐字等价**
 * （暂无 / 还没有 / 空空 / 没有任何 / 没有找到 / 尚未 / 无数据 / 无法找到），写成 Unicode 转义：
 * 域里可能含词表所在目录 ⇒ 字面量会让**本文件自己**命中词表（自引用空真）。⑤ 用解码断言防抄错码位。
 */
const EMPTY_RE =
  /\u6682\u65e0|\u8fd8\u6ca1\u6709|\u7a7a\u7a7a|\u6ca1\u6709\u4efb\u4f55|\u6ca1\u6709\u627e\u5230|\u5c1a\u672a|\u65e0\u6570\u636e|\u65e0\u6cd5\u627e\u5230/;


/**
 * 域 = 探针 `tmp/classify.mjs` 的 `prod` **逐字相同**：减测试、减 `ui/primitives/**`、减 `ui/icons/**`。
 * 原语层被排除是 T1 的口径（原语自身不是「待收敛的重复调用点」），且它与 T14 共用同一支 `slice.mjs`
 * ⇒ 两单元读数可直接对拍。本文件是 `.test.ts` ⇒ 无论哪条都已在域外；词表又写成 Unicode 转义。
 */
const PROD = walkSources(SRC).filter((f) => {
  const rel = relOf(SRC, f);
  return !/\.test\.tsx?$/.test(rel) && !rel.startsWith("ui/primitives/") && !rel.startsWith("ui/icons/");
});
interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly migrated: boolean;
}

/** 一次 `<EmptyState` / `empty(` 调用的语法起点（`<EmptyState` 可跨行） */
const START_RE = /<EmptyState\b|\bempty\(/;

function scan(files: readonly string[]): Hit[] {
  const hits: Hit[] = [];
  for (const f of files) {
    const { raw, stripped } = readLines(f);
    stripped.forEach((line, i) => {
      if (!EMPTY_RE.test(line)) return;
      // 向上找最近的**语法起点**行：命中 START_RE ⇒ 已收口；先撞到 `/>` / `;` / `})` 这类
      // 「上一处已经结束」的行 ⇒ 本行不属于任何原语调用（窗口 12 行足够覆盖 JSX 属性换行）。
      let migrated = false;
      for (let k = i; k >= 0 && i - k <= 12; k--) {
        if (START_RE.test(stripped[k])) { migrated = true; break; }
        if (k < i && /\/>|;\s*$|\}\)\s*$/.test(stripped[k])) break;
      }
      hits.push({ file: relOf(SRC, f), line: i + 1, text: (raw[i] ?? "").trim(), migrated });
    });
  }
  return hits;
}

const ALL_HITS = scan(PROD);

/**
 * 每条的判据来源（B11 逐字三条：① 本批已触碰 · ② `pages/**` · ③ 有同名测试）。
 * 三个集合而不是一张 `Record`：**三行读完**；① 里 `①∧③` 的 8 个、`②∧③` 的 2 个单列，其余组合见 ①。
 */
const R1: readonly string[] = [
  "components/AiConversationDock.tsx", "components/AiProviderSettings.tsx", "components/AiServicePanel.tsx",
  "components/AiTaskPanel.tsx", "components/AsrConfusionPanel.tsx", "components/GoalDetail.tsx",
  "components/ImageGallery.tsx", "components/LinkEntityPicker.tsx", "components/PracticeQuestionsOverlays.tsx",
  "components/ProofreadPanel.tsx", "components/SecondPassPanel.tsx", "components/StructureImageSection.tsx",
  "components/VocabManager.tsx",
];
const R2: readonly string[] = ["pages/KnowledgePage.tsx", "pages/ReviewPage.tsx"];
const R3: readonly string[] = [
  "components/ChatSidebar.tsx", "components/DiscoverySuggestSection.tsx", "components/GroupSidebar.tsx",
  "components/KnowledgeDecisionLog.tsx", "components/KnowledgeLinkSection.tsx",
];
/** 每条的判据串（`1`/`2`/`3` 的组合，与探针的 `why` 逐字对拍） */
const SLICE_REASONS: Readonly<Record<string, string>> = Object.fromEntries([
  ...R1.map((f) => [f, "1"] as const),
  ...R2.map((f) => [f, "2"] as const),
  ...R3.map((f) => [f, "3"] as const),
  ...["components/KnowledgeDecisionForm.tsx", "components/KnowledgeSystemWizard.tsx",
    "components/NoteLinkToSystem.tsx", "components/NoteMoveToGroupMenu.tsx",
    "components/NoteRowContextMenu.tsx", "components/TaskLaunchDialog.tsx",
    "components/RefineWorkbench.tsx", "components/action-center/ActionCenterPanel.tsx"].map((f) => [f, "13"] as const),
  ...R2.map((f) => [f, "23"] as const),
]);

/**
 * **切片清单**（B11 判据 ①∪②∪③ 算出的 28 文件）—— 由上面四个集合**导出**（字典序）。
 * 为什么导出而不是再抄一份字面量数组：两份清单会各自漂移；「显式」的意图由 ⑥ 与 gitignored 探针
 * `tmp/t13/slice.json` 的**双向对拍**兜住（比字符串字面量更硬的真源），长度/唯一性/字典序/盘上确有命中
 * 四条在 ① 里逐条断言。
 */
const SLICE: readonly string[] = Object.keys(SLICE_REASONS).sort();

/**
 * **例外表**（切片内**不迁**的 5 处）。锚点 = 该行**原文里的独特片段**（不是行号）。
 *
 * 为什么用片段而不是行号：这 5 处里有 2 个文件同时落在 T14（加载态切片）的改动面上 ⇒ 行号会随
 * 别人的提交漂移（`ReviewPage` 实测 147 → 148），写死行号会在无关改动上假红。片段必须**恰好命中
 * 1 行**且该行命中词表；片段被删改即红（防腐烂），行号漂移不再误伤。
 */
const EXCEPTIONS: readonly { readonly file: string; readonly anchor: string; readonly why: string }[] = [
  { file: "components/KnowledgeDecisionForm.tsx", anchor: "{title}：暂无", why: "内联字段的复选列表标签（随表单字段就地渲染，不是独立空态块；迁原语会引入整块空气与居中，破坏表单行）" },
  { file: "components/KnowledgeSystemWizard.tsx", anchor: "向导内容尚未创建", why: "确认对话框正文（`confirm()` 的实参），不是渲染出来的空态占位" },
  { file: "components/TaskLaunchDialog.tsx", anchor: "if (rows.length === 0) setStatus(", why: "落进 `setStatus(...)` 的状态行（对话框内联提示），不是被渲染的空态块；改渲染面要动 dialog 结构" },
  { file: "components/VocabManager.tsx", anchor: "需先有会话 OCR 记录", why: "`setMessage(...)` 的消息串（显示在消息行），不是空态块" },
  { file: "pages/ReviewPage.tsx", anchor: "`共 ${totalDue} 张到期`", why: "头部统计行的三元分支（`review-total-due` 那一行），是计数标签不是空态" },
];

/** **余量文件**（批 4 不迁，冻结给批 5/7）—— 逐文件区间 `[min, max]`，**只许减**（同探针的 5 文件） */
const FROZEN_REST: Readonly<Record<string, readonly [number, number]>> = {
  "components/InterviewSteps.tsx": [1, 1],
  "components/LiveActivityPanel.tsx": [1, 1],
  "components/NoteListBody.tsx": [1, 1],
  "components/ProofreadToggle.tsx": [1, 1],
  "components/SessionListBody.tsx": [1, 1],
};

/**
 * 允许命中词表的新增文件。域**已经**排除了 `ui/primitives/**`（T1 口径），故这里只做**显式声明**：
 * `sliceScan.ts` 是本任务析出的共享扫描仪器（新增件），它逐字带着那张词表 ⇒ 把「域外 + 新件」
 * 这件事写成一条记录，而不是靠域过滤静默放行。
 */
const NEW_FILES_ALLOWLIST: readonly string[] = ["ui/primitives/sliceScan.ts"];

/** 例外锚点解析出的行号（解析一次、全程复用；找不到或多命中都返回原样 ⇒ ② 会红，这正是我们要的） */
const exceptionLines = new Map<string, number[]>(
  [...new Set(EXCEPTIONS.map((x) => x.file))].map((file) => {
    const src = readFileSync(join(SRC, ...file.split("/")), "utf8").split(/\r?\n/);
    return [file, EXCEPTIONS.filter((x) => x.file === file).flatMap((x) =>
      src.map((l, i) => (l.includes(x.anchor) ? i + 1 : 0)).filter((n) => n > 0))];
  }),
);

const hitsOf = (file: string): Hit[] => ALL_HITS.filter((h) => h.file === file);
const unmigratedOf = (file: string): Hit[] => {
  const skip = exceptionLines.get(file) ?? [];
  return hitsOf(file).filter((h) => !h.migrated && !skip.includes(h.line));
};
const describeHits = (hits: readonly Hit[]): string => hits.map((h) => `${h.file}:${h.line}  ${h.text}`).join("\n");

describe("空态切片棘轮（B11）", () => {
  it("① 切片清单是显式 28 文件，判据来源逐条合法", () => {
    expect(SLICE).toHaveLength(28);
    expect(new Set(SLICE).size, "切片清单有重复项").toBe(28);
    expect([...SLICE].sort(), "切片清单未按字典序（对拍会假红）").toEqual([...SLICE]);
    expect(SLICE.filter((f) => hitsOf(f).length === 0), "这些文件已无命中，请从清单删除").toEqual([]);
    expect(Object.keys(SLICE_REASONS).sort()).toEqual([...SLICE].sort());
    for (const f of SLICE) expect(/^[123]+$/.test(SLICE_REASONS[f]), `${f} 的判据来源不合法`).toBe(true);
  });

  it("② 切片内**非例外**未收口命中 = 0（迁了但没删干净 ⇒ 红）", () => {
    expect(describeHits(SLICE.flatMap((f) => unmigratedOf(f))), "切片内仍有未走 EmptyState 的空态").toEqual("");
  });

  it("③ 例外 5 处：锚点片段恰好命中 1 行、该行确实命中词表、理由非空、且尚未走原语", () => {
    expect(EXCEPTIONS).toHaveLength(5);
    for (const e of EXCEPTIONS) {
      const lines = readFileSync(join(SRC, ...e.file.split("/")), "utf8").split(/\r?\n/);
      const idx = lines.map((l, i) => (l.includes(e.anchor) ? i + 1 : 0)).filter((n) => n > 0);
      expect(idx.length, `${e.file}：锚点「${e.anchor}」命中 ${idx.length} 行（必须恰好 1 行，否则豁免面不可判）`).toBe(1);
      expect(EMPTY_RE.test(lines[idx[0] - 1] ?? ""), `${e.file}:${idx[0]} 已不命中词表（例外表过期，请删条）`).toBe(true);
      expect(e.why.length, `${e.file} 的例外理由太短`).toBeGreaterThan(20);
      const hit = hitsOf(e.file).find((h) => h.line === idx[0]);
      expect(hit, `例外表 ${e.file} 的锚点行不在扫描结果里（行内容与词表口径不一致）`).toBeTruthy();
      expect(hit?.migrated, `${e.file}:${idx[0]} 已走原语 ⇒ 应删条（免得 ② 被例外掩盖）`).toBe(false);
    }
  });

  it("④ 余量文件逐文件冻结（只许减）+ 全仓总数 ≤ 44 + 无未登记的新命中文件", () => {
    const restFiles = [...new Set(ALL_HITS.map((h) => h.file))].filter((f) => !SLICE.includes(f)).sort();
    expect(restFiles, "余量集变了（新增未登记的命中文件，或余量被悄悄迁移）").toEqual(Object.keys(FROZEN_REST).sort());
    for (const [f, [min, max]] of Object.entries(FROZEN_REST)) {
      const n = hitsOf(f).length;
      expect(n, `${f} 的命中数 ${n} 越出冻结区间 [${min}, ${max}]`).toBeGreaterThanOrEqual(min);
      expect(n, `${f} 的命中数 ${n} 越出冻结区间 [${min}, ${max}]`).toBeLessThanOrEqual(max);
    }
    expect(ALL_HITS.length, "全仓命中总数超过基线 44").toBeLessThanOrEqual(44);
    const unexpected = [...new Set(ALL_HITS.map((h) => h.file))].filter(
      (f) => !SLICE.includes(f) && !(f in FROZEN_REST) && !NEW_FILES_ALLOWLIST.includes(f),
    );
    expect(describeHits(ALL_HITS.filter((h) => unexpected.includes(h.file))), "新增文件里出现了词表命中").toEqual("");
  });

  it("⑤ 仪器自检：词表解码、正/负样本、域边界、剥注释三向", () => {
    // 词表自证：转义写法**解码后**必须与探针的字面量逐字相等（防抄错码位 ⇒ 词表静默变窄）
    const literal = ["\u6682\u65e0", "\u8fd8\u6ca1\u6709", "\u7a7a\u7a7a", "\u6ca1\u6709\u4efb\u4f55",
      "\u6ca1\u6709\u627e\u5230", "\u5c1a\u672a", "\u65e0\u6570\u636e", "\u65e0\u6cd5\u627e\u5230"];
    expect(literal).toHaveLength(8);
    for (const w of literal) expect(EMPTY_RE.test(w), `词表漏了「${w}」`).toBe(true);
    // 正样本：盘上已知命中 ≥1，且**全部**被判为「已走原语」（migrated 判定失效时 ② 会假红）
    const pos = hitsOf("components/AiConversationDock.tsx");
    expect(pos.length).toBeGreaterThan(0);
    expect(pos.every((h) => h.migrated), "正样本未被判为「已走原语」—— migrated 判定失效").toBe(true);
    // 负样本：`ui/zIndex.ts` 不命中，但它在域内（证明域不是空的）
    expect(hitsOf("ui/zIndex.ts").length, "负样本控件失效").toBe(0);
    expect(PROD.some((f) => relOf(SRC, f) === "ui/zIndex.ts")).toBe(true);
    // 域边界：测试文件与原语/图标层都在域外（口径同 T1 的 `prod`）
    const rels = PROD.map((f) => relOf(SRC, f));
    expect(rels.some((r) => /\.test\.tsx?$/.test(r)), "测试文件掉进了域内").toBe(false);
    expect(rels.some((r) => r.startsWith("ui/icons/")), "图标层掉进了域内").toBe(false);
    expect(PROD.some((f) => relOf(SRC, f) === "ui/primitives/EmptyState.tsx"), "原语层未被排除（口径漂了）").toBe(false);
    expect(walkSources(SRC).some((f) => relOf(SRC, f) === SELF), "仪器自检：本文件必须真的在盘上被 walk 到").toBe(true);
    // 剥注释三向：块注释 / 行注释必须剥净，模板串里的裸词必须保留（那是真文案）
    expect(stripComments("/* \u6682\u65e0 */\nconst a = 1; // \u5c1a\u672a\n").match(EMPTY_RE), "注释没被剥净").toBeNull();
    expect(stripComments("const b = `\u6682\u65e0`;").match(EMPTY_RE), "真文案被误剥").not.toBeNull();
  });

  it("⑥ 与 gitignored 探针 `tmp/t13/slice.json` 双向对拍（探针不在场 ⇒ 明说未跑到）", () => {
    const probe = join(
      SRC, "..", "..",
      ".superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/t13/slice.json",
    );
    let payload: { slice: { rel: string; why: string }[]; rest: { rel: string }[] } | null = null;
    try {
      const parsed: { slice: { rel: string; why: string }[]; rest: { rel: string }[] } = JSON.parse(
        readFileSync(probe, "utf8"),
      );
      payload = parsed;
    } catch {
      payload = null;
    }
    if (payload === null) {
      // 干净克隆 / 导出树没有 `.superpowers/`（gitignored）⇒ **不假装有牙**：用一条必然失败的哨兵
      // 把「今天这条对拍没跑到」显形，而不是静默通过。唯一例外：变异体实验的导出树显式设
      // `T13_NO_PROBE=1`（那些树里没有探针，但 ①–⑤ 仍逐条在跑）——那是**登记过的跳过**，不是默认值。
      expect(
        process.env.T13_NO_PROBE === "1" || readdirSync(SRC).includes("__t13_probe_absent__"),
        "探针缺失 ⇒ 清单对拍未跑到（本判据今日未验证；请在有 .superpowers/ 的工作树里跑）",
      ).toBe(true);
      return;
    }
    const probeSlice: { rel: string; why: string }[] = payload.slice;
    const probeRest: { rel: string }[] = payload.rest;
    expect([...SLICE].sort(), "切片集与探针不一致（双向差集必须为空）").toEqual(probeSlice.map((s) => s.rel).sort());
    expect(Object.keys(FROZEN_REST).sort(), "冻结余量集与探针的余量集不一致").toEqual(probeRest.map((r) => r.rel).sort());
    const why: Record<string, string> = {};
    for (const s of probeSlice) why[s.rel] = s.why;
    for (const f of SLICE) expect(why[f], `${f} 的判据来源与探针不一致`).toBe(SLICE_REASONS[f]);
  });
});