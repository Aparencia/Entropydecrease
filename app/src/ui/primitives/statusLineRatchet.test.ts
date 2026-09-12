// @vitest-environment node
/**
 * @ai-context **状态行棘轮**（批 4 B11 裁决 + Task 15 的落点）：错误行的「三红归一」**只许减、只许进原语**。
 *
 * Why：规格 §5.1 的病灶逐字是「错误行 175 行 / 98 文件 · **三种红并存**」；B11 裁定五类重复走
 *   「切片 + 棘轮」—— 全量一次清零既无测试面也不可验收（存量里大量是品牌色 / 装饰 / 图表分支，
 *   **不该**染上语义色）。没有棘轮，「还没迁完」就退化成「永远在迁」。
 *
 * 四条判据：
 *   ① 迁移面**冻结**（49 文件，只许增不许减）+ **逐文件 `<StatusLine` 处数下界**（② 的牙齿，
 *      T13–T15 评审 M-7 的结清 —— 只判「出现过」时，把 5 处收敛成 1 处也照样绿）；
 *   ② 三红字面量**逐文件 ≤ 冻结值** + **总数 ≤ 114** + 新增文件里**不得出现**三红字面量；
 *      ⚠️ 计数**先剥注释**（`sliceScan.stripComments`，与三个兄弟棘轮同口径 —— 评审 M-2 的结清：
 *      原实现读原文，于是注释里列举色值的两处（`ClassroomBanners.tsx:13` / `utils/refineDiff.ts:13`）
 *      被算成命中，纯注释改动会假红）。
 *   ③ `error` 档必须走 `--ed-stamp` **文字色**（不是别的档、不是底色）—— `StatusLine.tsx` 的
 *      用色契约与控制方 2026-09-11 裁决③ 同源；`StatusLine.css` 里**连底色属性名都不出现**
 *      （「错误色绝不进按钮底色」因此是结构保证，不是纪律）；
 *   ④ 仪器自证：词表七值可读、正/负样本、域边界（原语层在域外）。
 *
 * ★ 变异体（T15 收口，**每个变异新解一棵导出树** · CONTROL 在冻结提交树上取 —— 脏树会给假红）：
 *   M1 把一处已迁的错误行还原成手写红字 ⇒ ② 红（三红计数涨了）；
 *   M2 把 `error → "alert"` 的角色映射改掉 ⇒ ③ 红（契约的唯一映射点）；
 *   M3 `StatusLine.css` 把 `--ed-stamp` 换成别的 token ⇒ ③ 红（档位断言）；
 *   M4 给 `StatusLine.css` 加一条 `background` 声明 ⇒ ③ 的**结构判据**红（错误色进底色）；
 *   M5 新增一个带三红字面量的文件 ⇒ ② 的「未登记文件」判据红；
 *   M6（反向对照，**必须绿**）只改 `StatusLine.tsx` 的一处**注释**措辞 ⇒ 全绿（判据读语义锚点，不绑文本）。
 *
 * 副作用：只读磁盘（遍历 `app/src` + 定点读 `StatusLine.css`）。边界：**文本级**判据、不做 AST；
 *   切片外（域内未迁移的 67 个文件）**只冻结不迁移** —— 与 T12 的「放弃 5 处」同款处置。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FROZEN_RED_BY_FILE, FROZEN_RED_TOTAL } from "./statusLineBaseline";
// 剥注释仪器：三个兄弟棘轮（loading / emptyState / confirm）都用它 ⇒ 口径必须同源，不许本地重写
import { stripComments } from "./sliceScan";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** 七个三红十六进制（与 T15 计划 Step 1 的词表逐字相同；三红 = 主红 / 深红 / 亮红） */
const RED_HEX: readonly string[] = ["#e11d48", "#dc2626", "#ef4444", "#b91c1c", "#d32f2f", "#c62828", "#f43f5e"];

/**
 * 迁移面 = T15 实际改动的 **49 个文件**（原始 55 减去因 B1/B2 守卫回退的 6 个）。
 * ⚠️ 这 6 个**不是遗漏**：它们是 `dialogMigration.e` 的 `NON_MIGRATED_14`，守卫禁止其 import 原语层
 * ⇒ 按控制方裁决 B1/B2 优先，**回退自绘**（T12 先例）。此处**逐字登记**以免它们静默消失。
 */
export const REVERTED_BY_B1_B2: readonly string[] = [
  "components/NoteLinkToSystem.tsx", "components/NoteMoveToGroupMenu.tsx",
  "components/NoteRowContextMenu.tsx", "components/RouteInfoPopover.tsx",
  "components/SessionRowContextMenu.tsx", "components/note-selection/SelectionActionMenu.tsx",
];

const MIGRATED: readonly string[] = [
  "components/AiProviderSettings.tsx", "components/AiRefineCard.tsx", "components/AiServicePanel.tsx",
  "components/AiTaskPanel.tsx", "components/AsrConfusionPanel.tsx", "components/BackupPanel.tsx",
  "components/BoxSelectOverlay.tsx", "components/ChatSaveNoteDialog.tsx", "components/EnrichPanel.tsx",
  "components/FeedFragmentList.tsx", "components/GoalDetail.tsx", "components/GoalPlanApprovalDialog.tsx",
  "components/GraduateDialog.tsx", "components/GroupCreateDialog.tsx", "components/GroupDeleteConfirm.tsx",
  "components/GroupSidebar.tsx", "components/ImageGallery.tsx", "components/InterviewDialog.tsx",
  "components/KnowledgeCanvasView.tsx", "components/KnowledgeConceptDialog.tsx",
  "components/KnowledgeDecisionForm.tsx", "components/KnowledgeDecisionLog.tsx",
  "components/KnowledgeDetailPanel.tsx", "components/KnowledgeGraphView.tsx",
  "components/KnowledgeLinkSection.tsx", "components/KnowledgeModelDialog.tsx",
  "components/KnowledgeSampleView.tsx", "components/KnowledgeSystemWizard.tsx",
  "components/KnowledgeTreeView.tsx", "components/LinkEntityPicker.tsx",
  "components/ModelCardCreateDialog.tsx", "components/ModelManagementPanel.tsx", "components/NoteAiDialog.tsx",
  "components/ProfileDetector.tsx", "components/PromoteCardButton.tsx", "components/ProofreadPanel.tsx",
  "components/RefineLaunchDialog.tsx", "components/RefineWorkbench.tsx", "components/SecondPassPanel.tsx",
  "components/StructureImageSection.tsx", "components/TaskLaunchDialog.tsx", "components/VersionPanel.tsx",
  "components/VideoImportPanel.tsx", "components/WebInboxPanel.tsx",
  "components/action-center/ActionCenterPanel.tsx", "components/review/ReviewSessionPanel.tsx",
  "pages/GoalsPage.tsx", "pages/KnowledgePage.tsx", "pages/ReviewPage.tsx",
];

/** 域 = `app/src/**` 的 `.ts`/`.tsx` 减测试**减 `ui/primitives/**`**（原语层是语义色真源，不是调用点） */
function walk(prefix = "", out: string[] = []): string[] {
  const dir = prefix === "" ? SRC : join(SRC, ...prefix.split("/"));
  for (const name of readdirSync(dir)) {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    if (statSync(join(SRC, ...rel.split("/"))).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const PROD = walk().filter((r) => !r.startsWith("ui/primitives/"));
const read = (rel: string): string => readFileSync(join(SRC, ...rel.split("/")), "utf8");

/**
 * 逐文件 `<StatusLine` 处数**下界**（① 的牙齿，评审 M-7 的结清）。只写 > 1 的 8 个，其余一律 1；
 * 下界是「迁移面真的把错误行交给了原语」的最小证据 —— 加处数不红（那不是回潮），掉到下界以下必红。
 */
const MIN_CALLS: Readonly<Record<string, number>> = {
  "components/GroupDeleteConfirm.tsx": 5,
  "components/EnrichPanel.tsx": 4,
  "components/AiRefineCard.tsx": 2, "components/AiServicePanel.tsx": 2, "components/GoalDetail.tsx": 2,
  "components/ModelManagementPanel.tsx": 2, "components/RefineLaunchDialog.tsx": 2,
  "components/RefineWorkbench.tsx": 2,
};

/** 一段文本里三红十六进制字面量的**出现次数**（同一行两次算 2 —— 与基线生成器同口径） */
const countIn = (text: string): number => RED_HEX.reduce((n, h) => n + (text.split(h).length - 1), 0);

/** 逐文件三红计数：**先剥注释**（M-2 —— 注释里列举色值不算命中，与三个兄弟棘轮同口径） */
function redCounts(): Map<string, number> {
  const map = new Map<string, number>();
  for (const rel of PROD) {
    const n = countIn(stripComments(read(rel)));
    if (n > 0) map.set(rel, n);
  }
  return map;
}
const COUNTS = redCounts();
const CSS = read("ui/primitives/StatusLine.css");
const TSX = read("ui/primitives/StatusLine.tsx");

describe("状态行棘轮（B11 · T15）", () => {
  it("① 迁移面 49 文件：逐条在盘上、`<StatusLine` 处数 ≥ 下界、且与回退账不重叠", () => {
    expect(MIGRATED).toHaveLength(49);
    expect(new Set(MIGRATED).size, "迁移面有重复项").toBe(49);
    expect([...MIGRATED].sort(), "迁移面未按字典序（对拍会假红）").toEqual([...MIGRATED]);
    const missing = MIGRATED.filter((rel) => !PROD.includes(rel));
    expect(missing, `迁移面里这些文件在盘上不存在（改名 / 迁移后本行先红）：\n${missing.join("\n")}`).toEqual([]);
    const thin = MIGRATED.map((rel) => [rel, (stripComments(read(rel)).match(/<StatusLine[\s/>]/g) ?? []).length] as const)
      .filter(([rel, n]) => n < (MIN_CALLS[rel] ?? 1))
      .map(([rel, n]) => `${rel}: 实测 ${n} < 下界 ${MIN_CALLS[rel] ?? 1}`);
    expect(thin, `登记为「已迁移」但 \`<StatusLine\` 处数掉到下界以下（迁移面是虚的）：\n${thin.join("\n")}`).toEqual([]);
    // 下界表不许有僵尸键 / 漏键（49 个迁移面文件里 > 1 的恰 8 个）
    const keys = Object.keys(MIN_CALLS);
    expect(keys.filter((k) => !MIGRATED.includes(k)), "下界表里有不在迁移面的键").toEqual([]);
    expect(keys.filter((k) => (MIN_CALLS[k] ?? 0) < 2), "下界表里的值必须 > 1（=1 是默认值）").toEqual([]);
    const overlap = MIGRATED.filter((rel) => REVERTED_BY_B1_B2.includes(rel));
    expect(overlap, `回退账里的文件不许同时算进迁移面（两个账本必须互斥）：\n${overlap.join("\n")}`).toEqual([]);
  });

  it("② 三红只许减：逐文件 ≤ 冻结值 · 总数 ≤ 114 · 新增文件里不得出现三红", () => {
    const grown = [...COUNTS.entries()].filter(([f, n]) => n > (FROZEN_RED_BY_FILE[f] ?? 0))
      .map(([f, n]) => `${f}: ${FROZEN_RED_BY_FILE[f] ?? 0} → ${n}`);
    expect(grown, `这些文件的三红字面量**涨了**（棘轮只许降；真迁移了请手工收紧 statusLineBaseline）：\n${grown.join("\n")}`).toEqual([]);
    const total = [...COUNTS.values()].reduce((a, b) => a + b, 0);
    expect(total, `三红总数 ${total} 超过冻结值 ${FROZEN_RED_TOTAL}`).toBeLessThanOrEqual(FROZEN_RED_TOTAL);
    // 独立校验和：逐文件之和必须恰等于冻结总数（防「悄悄抬高某个文件的冻结值」）
    const sum = Object.values(FROZEN_RED_BY_FILE).reduce((a, b) => a + b, 0);
    expect(sum, "冻结表的逐文件之和 ≠ 冻结总数（表被局部改动过）").toBe(FROZEN_RED_TOTAL);
    // 新增（或冻结表未登记）的文件里出现三红 ⇒ 红：棘轮不能靠「反正没登记就不管」空转
    const unregistered = [...COUNTS.keys()].filter((f) => !(f in FROZEN_RED_BY_FILE));
    expect(unregistered, `这些文件有三红字面量但不在冻结表里（新增红字）：\n${unregistered.join("\n")}`).toEqual([]);
  });

  it("③ `error` 档走 `--ed-stamp` 文字色，且 CSS 里连底色属性名都不出现（结构保证）", () => {
    // 档位断言：error 只许由 --ed-stamp 承载（不是 --ed-due / --ed-ok / --ed-ink-*）
    expect(CSS, "`.ed-status--error` 没有走 `--ed-stamp`").toMatch(/\.ed-status--error\s*\{\s*color:\s*var\(--ed-stamp\)/);
    for (const [kind, token] of [["warn", "--ed-due"], ["info", "--ed-ink-3"], ["ok", "--ed-ok"]] as const) {
      expect(CSS, `.ed-status--${kind} 的档位 token 变了（应走 ${token}）`).toMatch(
        new RegExp(`\\.ed-status--${kind}\\s*\\{\\s*color:\\s*var\\(${token}\\)`),
      );
    }
    // 结构判据：四档一律只写 color；文件里**不得出现**任何底色属性名（「绝不用于按钮」的结构保证）
    // ⚠️ 判据必须**先剥注释**：`StatusLine.css` 的注释里逐字写着这些属性名（说明它们为什么不出现）
    // ⇒ 不剥注释会把「解释为什么没有」误判成「有」（T15 实测的第一版就是这个假红）。
    const NEEDLES = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const BG = /\b(background|background-color|backgroundColor)\b/;
    expect(BG.test(NEEDLES), "StatusLine.css 里出现了底色声明（错误色绝不进底色）").toBe(false);
    expect(NEEDLES.includes("@keyframes"), "StatusLine.css 出现了 @keyframes（状态行不做循环动画）").toBe(false);
    // 语义档 → 无障碍角色的映射是契约的唯一一处，测试指它（error 立即播报）
    expect(TSX, "`error` 未映射成 role=\"alert\"").toMatch(/kind\s*===\s*"error"\s*\?\s*"alert"\s*:\s*"status"/);
    // 判据取 **JSX 属性形态**（`aria-live=` / `aria-live={`）而不是裸词：契约注释里逐字写着
    // 「两者都不额外声明 aria-live」⇒ 判裸词会把那句解释本身判成违规（同 ③ 的剥注释教训）。
    expect(/\baria-live\s*=/.test(TSX), "StatusLine 重复声明了 aria-live（role 已隐含，会制造第二个真源）").toBe(false);
  });

  it("④ 仪器自证：七值可读、剥注释口径、正/负样本、域边界（原语层在域外）", () => {
    expect(RED_HEX).toHaveLength(7);
    expect(RED_HEX.every((h) => /^#[0-9a-f]{6}$/.test(h)), "词表里有非法十六进制").toBe(true);
    // 剥注释口径自证（M-2）：字符串里的三红算命中、行/块注释里的**不算** —— 两条各一，防口径单侧失效
    expect(countIn(stripComments('const a = "#b91c1c"; // #dc2626\n/* #ef4444 */')), "注释里的三红被计入了").toBe(1);
    expect(countIn(stripComments("// #b91c1c\n/* #dc2626 #ef4444 */")), "全是注释却仍有命中").toBe(0);
    // 正样本：域内确实还有命中（基线非空；否则下面的棘轮是空真）
    expect(COUNTS.size, "域内一处三红都没有 ⇒ 基线表是空真").toBeGreaterThan(0);
    expect([...COUNTS.values()].reduce((a, b) => a + b, 0), "域内三红总数与基线不符").toBe(FROZEN_RED_TOTAL);
    // 负样本：原语层在域外（它的 CSS 里出现 token 名是正常的，不该被算成调用点）
    expect(PROD.some((r) => r.startsWith("ui/primitives/")), "原语层没有被排除出域").toBe(false);
    expect(PROD.some((r) => /\.test\.tsx?$/.test(r)), "测试文件掉进了域内").toBe(false);
    expect(PROD.includes("ui/tokens.css") === false, "域口径漂了：CSS 不该进来").toBe(true);
    // 迁移面全部在域内（不然 ① 的「用了 StatusLine」在域外就失去意义）
    expect(MIGRATED.filter((r) => !PROD.includes(r)), "迁移面里有域外文件").toEqual([]);
  });
});
