// @vitest-environment node
/**
 * @ai-context 批 4 T8「20 弹层迁移 · E 组（2 文件）」的收口判据 **+ B3 的 20 清单总判据**。
 *
 * Why：规格 §11-2 的验收逐字是「`role="dialog"` **20/20**」，但**规格没写是哪 20 个** ⇒ B3 裁定
 *   「验收按规格的 20，且计划必须**逐条列出**这 20 个文件」。本文件把那句验收钉成一条**跨 20 文件
 *   的机器判据**，并把**另两个口径**（ADR-033 的 **28** = 同行 `fixed`+`inset:0`；跨行容忍 **34**）
 *   **并列登记**在同一文件里 —— **20 / 28 / 34 三数并存是既知事实，两口径对账归批 8 治理收口**：
 *   本文件不改规格 §11-2 的数字，也不许谁把 20 悄悄改成 28。
 *
 * 三条跨文件判据（外加 E 组自己的 4 条）：
 *   ① `DIALOG_20` 的 20 个文件：barrel 名字表含 `Modal` ∧ 无深导入 ∧ 无自建遮罩 ∧ 无 `keydown`
 *      监听 ∧ 无裸数字 z-index；且**源码 0 处** `role="dialog"`（20/20 的角色归原语唯一持有）。
 *   ② `CROSS_LINE_34 − DIALOG_20 == NON_MIGRATED_14` ∧ 该差集**在盘上仍成立** —— 后半条同时是
 *      **B1 / B2** 的守卫：登记为「不迁」的 14 个不许被顺手迁掉（判据取「barrel 里含 `Modal`」，
 *      叶子原语不算绕过，理由见该条注释）。
 *   ③ `ADR033_28 ⊆ CROSS_LINE_34` ∧ `|ADR033_28| = 28` ∧ `ADR033_28 == CROSS_LINE_34 − 6`
 *      （6 = 跨行口径相对同行口径的新增项：`fixed` 与 `inset:0` 分写两行的文件）。
 *
 * 边界（诚实登记）：
 *   ① 28 / 34 是 **`42e88740`（批 4 基线）** 上的实测快照，探针可复现（本地 `tmp/t8/`，不入库）；28 的
 *      **语义**（同行）今日已不能复算（15 个成员已迁走）⇒ 它是**登记值**，本文件只做集合运算与存在性核对。
 *   ② 剥注释用 `a1` 的两行正则版（**不碰字符串字面量**）：已用 `tmp/t8/stripper-equiv.mjs` 对全部
 *      **287** 个非测试源文件做**双剥除器对拍**（本文件用到的 5 条谓词逐个同判、0 处不一致）。
 *   ③ `pages/ChatPage.tsx` 的口径差**双列登记**：§表 4 用 `components/BrowserChrome.tsx` 顶替它
 *      （两种数法都得 **11**）⇒ 本文件把 `BrowserChrome` 记成**别名**（不在 34 里，也不得进 34）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** `app/src` —— 相对它写路径（与 `.a1` / `.a2` / `.b` / `ui/zIndex.guard.test.ts` 同口径） */
const SRC = resolve(import.meta.dirname, "..", "..");

/**
 * **B3 的 20**（A14 + B4 + E2，计划 §表 3 逐字）。声明：这是**可辩护的构成，不是规格原文**
 * （规格只写「20 弹层」）；`shell/CommandPalette.tsx` 不在其中（批 3 自足件，由 T9 迁）。
 */
export const DIALOG_20: readonly string[] = [
  "components/ChatSaveNoteDialog.tsx",
  "components/GoalPlanApprovalDialog.tsx",
  "components/GraduateDialog.tsx",
  "components/GroupCreateDialog.tsx",
  "components/GroupDeleteConfirm.tsx",
  "components/InterviewDialog.tsx",
  "components/KnowledgeConceptDialog.tsx",
  "components/KnowledgeDecisionForm.tsx",
  "components/KnowledgeModelDialog.tsx",
  "components/KnowledgeSystemWizard.tsx",
  "components/ModelCardCreateDialog.tsx",
  "components/ModelCardFromNoteDialog.tsx",
  "components/NoteAiDialog.tsx",
  "components/PracticeQuestionsOverlays.tsx",
  "components/ProofreadPanel.tsx",
  "components/RefineLaunchDialog.tsx",
  "components/RefineWorkbench.tsx",
  "components/SecondPassPanel.tsx",
  "components/SopRunOverlay.tsx",
  "components/TaskLaunchDialog.tsx"];

/** ADR-033 的 **28**（同行口径：同一行同时含 `position:"fixed"` 与 `inset:0`；`42e88740` 实测；
 *  T13-b 后 `pages/ChatPage.tsx` 那条 → `components/chat/ChatLaunchMenu.tsx`，成员数仍是 28） */
export const ADR033_28: readonly string[] = [
  "components/CaptureOverlayPanel.tsx", "components/ChatSaveNoteDialog.tsx",
  "components/GoalPlanApprovalDialog.tsx", "components/GraduateDialog.tsx",
  "components/GroupCreateDialog.tsx", "components/GroupDeleteConfirm.tsx",
  "components/GroupRowContextMenu.tsx", "components/InterviewDialog.tsx",
  "components/KnowledgeConceptDialog.tsx", "components/KnowledgeDecisionForm.tsx",
  "components/KnowledgeModelDialog.tsx", "components/KnowledgeSystemWizard.tsx",
  "components/ModelCardCreateDialog.tsx", "components/NoteAiDialog.tsx",
  "components/NoteEditView.tsx", "components/NoteLinkToSystem.tsx",
  "components/NoteListBatchMenu.tsx", "components/NoteMoveToGroupMenu.tsx",
  "components/NoteRowContextMenu.tsx", "components/RefineLaunchDialog.tsx",
  "components/RefineWorkbench.tsx", "components/RichEditorView.tsx",
  "components/RouteInfoPopover.tsx", "components/ScreenSelectOverlay.tsx",
  "components/SessionRowContextMenu.tsx", "components/TaskLaunchDialog.tsx",
  "components/chat/ChatLaunchMenu.tsx", "components/note-selection/SelectionActionMenu.tsx"];

/** 跨行口径 **34**（文件内含 `position:"fixed"` ∧ 含 `inset:0`，任意行；`42e88740` 实测；
 *  T13-b 后同上（`ChatPage` 那条 → `ChatLaunchMenu`），成员数仍是 34，见 `T13B_MOVED`） */
export const CROSS_LINE_34: readonly string[] = [
  "components/CaptureOverlayPanel.tsx", "components/ChatSaveNoteDialog.tsx",
  "components/GoalPlanApprovalDialog.tsx", "components/GraduateDialog.tsx",
  "components/GroupCreateDialog.tsx", "components/GroupDeleteConfirm.tsx",
  "components/GroupRowContextMenu.tsx", "components/ImagePreviewOverlay.tsx",
  "components/InterviewDialog.tsx", "components/KnowledgeConceptDialog.tsx",
  "components/KnowledgeDecisionForm.tsx", "components/KnowledgeModelDialog.tsx",
  "components/KnowledgeSystemWizard.tsx", "components/ModelCardCreateDialog.tsx",
  "components/ModelCardFromNoteDialog.tsx", "components/NoteAiDialog.tsx",
  "components/NoteEditView.tsx", "components/NoteLinkToSystem.tsx",
  "components/NoteListBatchMenu.tsx", "components/NoteMoveToGroupMenu.tsx",
  "components/NoteRowContextMenu.tsx", "components/PracticeQuestionsOverlays.tsx",
  "components/ProofreadPanel.tsx", "components/RefineLaunchDialog.tsx",
  "components/RefineWorkbench.tsx", "components/RichEditorView.tsx",
  "components/RouteInfoPopover.tsx", "components/ScreenSelectOverlay.tsx",
  "components/SecondPassPanel.tsx", "components/SessionRowContextMenu.tsx",
  "components/SopRunOverlay.tsx", "components/TaskLaunchDialog.tsx",
  "components/chat/ChatLaunchMenu.tsx", "components/note-selection/SelectionActionMenu.tsx"];

/** 34 − 28 = **6**：跨行口径的新增项（`fixed` 与 `inset:0` 分写两行）—— recon §3.2 逐字 */
export const CROSS_LINE_ONLY_6: readonly string[] = [
  "components/ImagePreviewOverlay.tsx", "components/ModelCardFromNoteDialog.tsx",
  "components/PracticeQuestionsOverlays.tsx", "components/ProofreadPanel.tsx",
  "components/SecondPassPanel.tsx", "components/SopRunOverlay.tsx"];

/** **T13-b（2026-09-12）：28/34/14 三数都不变，只有 `pages/ChatPage.tsx` 那条换了新家** —— B7「先拆件」把
 * 它那段**锚定菜单 + 透明点击层**整段搬到 `components/chat/ChatLaunchMenu.tsx`（`zIndex: 30/31` →
 * `zIndex("popover")`）⇒ 常量里把那条换成新家（不是新增、不是放宽：新文件同样被三条跨文件判据查）。 */
const T13B_MOVED = "components/chat/ChatLaunchMenu.tsx";

/** **不进 `Modal` 的 14**（= 34 − 20）：11 个锚定菜单（B1）+ 3 个采集/预览覆盖层（B2） */
export const NON_MIGRATED_14: readonly string[] = [
  "components/CaptureOverlayPanel.tsx", "components/GroupRowContextMenu.tsx",
  "components/ImagePreviewOverlay.tsx", "components/NoteEditView.tsx",
  "components/NoteLinkToSystem.tsx", "components/NoteListBatchMenu.tsx",
  "components/NoteMoveToGroupMenu.tsx", "components/NoteRowContextMenu.tsx",
  "components/RichEditorView.tsx", "components/RouteInfoPopover.tsx",
  "components/ScreenSelectOverlay.tsx", "components/SessionRowContextMenu.tsx",
  "components/chat/ChatLaunchMenu.tsx", "components/note-selection/SelectionActionMenu.tsx"];

/** E 组的 2 个文件（计划 Task 8 Files 逐字） */
const E_FILES: readonly string[] = ["components/PracticeQuestionsOverlays.tsx", "components/SopRunOverlay.tsx"];
/** 差集的两个角色：11 条锚定菜单（B1）与 3 条覆盖层（B2）—— 名字里带 `Overlay` 的即后者 */
const MENU_11 = NON_MIGRATED_14.filter((f) => !f.includes("Overlay"));
const OVERLAY_3 = NON_MIGRATED_14.filter((f) => f.includes("Overlay"));
/** §表 4 用来顶替 `ChatPage.tsx` 的那个文件（别名登记：两种数法都得 11，但它不属 34） */
const TABLE4_ALIAS = "components/BrowserChrome.tsx";

/** 剥注释（= `dialogMigration.a1.test.ts:67-69` 逐字；不碰字符串字面量，等价性见文件头边界②） */
const strip = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const read = (rel: string): string => readFileSync(join(SRC, ...rel.split("/")), "utf8");
const stripped = (rel: string): string => strip(read(rel));
/** 跨行容忍：`\s` 匹配换行 ⇒ `position:` 与 `"fixed"` 分写两行也命中 */
const RE_FIXED = /position\s*:\s*["']fixed["']/;
const RE_INSET = /inset\s*:\s*0\b/;
const RE_BARE_Z = /z-index\s*:\s*-?\d|zIndex\s*:\s*-?\d/;
const RE_DEEP = /from\s*"(?:\.\.\/)+ui\/primitives\/[A-Za-z]+"/;
const RE_BARREL = /import\s*\{([^}]*)\}\s*from\s*"(?:\.\.\/)+ui\/primitives"/;
const RE_DIALOG = /role\s*=\s*["']dialog["']/g;
/** barrel 名字表（纯函数：喂合成样本即可自证读法，见「仪器自证」） */
const barrelNamesOf = (text: string): string[] => (RE_BARREL.exec(text)?.[1] ?? "").split(",").map((s) => s.trim());
const BARREL_NAMES = (rel: string): string[] => barrelNamesOf(stripped(rel));
const offendersOf = (files: readonly string[], hit: (text: string) => boolean): string[] =>
  files.filter((rel) => hit(stripped(rel)));

/** 递归收集 `app/src` 下非测试的 `.ts`/`.tsx`（相对路径、正斜杠；与 `tmp/t8/overlay-lists.mjs` 同域） */
function walkRel(prefix: string, out: string[] = []): string[] {
  const dir = prefix === "" ? SRC : join(SRC, ...prefix.split("/"));
  for (const name of readdirSync(dir)) {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    if (statSync(join(SRC, ...rel.split("/"))).isDirectory()) walkRel(rel, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

const DISK_FILES = walkRel("");
/** 今日盘上仍匹配**跨行口径**的文件（20 个迁完后应当**恰好**等于 `NON_MIGRATED_14`） */
const DISK_CROSS_LINE = DISK_FILES.filter((rel) => {
  const text = stripped(rel);
  return RE_FIXED.test(text) && RE_INSET.test(text);
}).sort();

describe("20 清单的常量自检（防路径写错 / 空数组造成的静默假绿）", () => {
  it("六个数组：长度就是名字里的那个数、已排序、无重复；每个登记路径都在盘上", () => {
    const named: readonly (readonly [string, readonly string[], number])[] = [
      ["DIALOG_20", DIALOG_20, 20],
      // 28 / 34 是 `42e88740` 的**成员数快照**，T13-b 只把 `ChatPage` 那**一条**换成它的新家
      // （同一次搬迁）⇒ 三个数都不变；`NON_MIGRATED_14` 同理（见 `T13B_MOVED` 的登记）。
      ["ADR033_28", ADR033_28, 28],
      ["CROSS_LINE_34", CROSS_LINE_34, 34],
      ["CROSS_LINE_ONLY_6", CROSS_LINE_ONLY_6, 6],
      ["NON_MIGRATED_14", NON_MIGRATED_14, 14],
      ["E_FILES", E_FILES, 2],
    ];
    for (const [name, list, size] of named) {
      expect(list.length, `${name} 长度不是 ${size}（写漏或写重）`).toBe(size);
      expect([...list], `${name} 未排序 —— 排序一致是后面几条集合断言的共同前提`).toEqual([...list].sort());
      expect(new Set(list).size, `${name} 有重复条目`).toBe(list.length);
    }
    // 扫描域锚点（计划 Step 2 的自检）：原语侧必须在域内，否则下面「盘上对拍」是空真
    expect(DISK_FILES.includes("ui/primitives/Modal.tsx"), "Modal.tsx 掉出扫描域").toBe(true);
    expect(DISK_FILES.length, "扫描域小得不像话 ⇒ walk 写错").toBeGreaterThan(200);
    const missing = named.flatMap(([name, list]) =>
      list.filter((rel) => !DISK_FILES.includes(rel)).map((rel) => `${name}: ${rel}`));
    expect(missing, `登记清单里有盘上不存在的文件（改名 / 迁移后本行先红）：\n${missing.join("\n")}`).toEqual([]);
  });

  it("仪器自证：剥注释生效 · 六条正则各能命中已知样本 · 对无意义串报 0", () => {
    expect(strip('// position: "fixed"; inset: 0\nconst k = 1;\n').includes("fixed")).toBe(false);
    expect(strip('/* zIndex: 1000 */\nconst k = 1;\n').includes("1000")).toBe(false);
    expect(RE_FIXED.test(strip('const s = { position: "fixed" };\n'))).toBe(true);
    expect(RE_FIXED.test(strip('const s = { position:\n  "fixed" };\n')), "跨行写法漏判").toBe(true);
    expect(RE_INSET.test(strip('const s = { inset: 0 };\n'))).toBe(true);
    expect(RE_INSET.test("inset: 0px") || RE_FIXED.test("position: absolute;")).toBe(false);
    expect(RE_BARE_Z.test('zIndex: zIndex("modal")'), "合法标尺写法被误判成裸数字").toBe(false);
    expect(RE_BARE_Z.test("zIndex: 1000,")).toBe(true);
    expect(RE_DEEP.test('import { Modal } from "../../ui/primitives/Modal";')).toBe(true);
    expect(RE_BARREL.test('import { Modal } from "../../ui/primitives";')).toBe(true);
    expect(barrelNamesOf('import { Modal, Text } from "../../ui/primitives";'), "barrel 名字表读法失效").toEqual(["Modal", "Text"]);
    expect(barrelNamesOf('import { Modal } from "../../ui/primitives/Modal";'), "深导入被当成 barrel").toEqual([""]);
    expect("x".match(RE_DIALOG)).toBe(null);
    expect('const x = <div role="dialog" />;'.match(RE_DIALOG)?.length).toBe(1);
  });
});

describe("① DIALOG_20：20 个文件全部只经原语持有弹层机制", () => {
  it("20 个文件：barrel 含 Modal ∧ 无深导入 ∧ 无自建遮罩 ∧ 无 keydown ∧ 无裸数字 z-index", () => {
    const noBarrel = offendersOf(DIALOG_20, (t) => !(RE_BARREL.exec(t)?.[1] ?? "").split(",").some((s) => s.trim() === "Modal"));
    expect(noBarrel, `以下文件没有从 barrel 导入 Modal（ADR-033 §1）：\n${noBarrel.join("\n")}`).toEqual([]);
    const deep = offendersOf(DIALOG_20, (t) => RE_DEEP.test(t));
    expect(deep, `以下文件深导入了原语（barrel 才带 motion.css）：\n${deep.join("\n")}`).toEqual([]);
    const mask = offendersOf(DIALOG_20, (t) => RE_FIXED.test(t) && RE_INSET.test(t));
    expect(mask, `以下文件仍在自建遮罩（ADR-033 §7）：\n${mask.join("\n")}`).toEqual([]);
    const keys = offendersOf(DIALOG_20, (t) => t.includes('addEventListener("' + 'keydown') || t.includes("onkeydown="));
    expect(keys, `以下文件仍自建 ESC 监听（ESC 栈归 Modal）：\n${keys.join("\n")}`).toEqual([]);
    const bare = offendersOf(DIALOG_20, (t) => RE_BARE_Z.test(t));
    expect(bare, `以下文件仍有裸数字 z-index（层级归 ui/zIndex 标尺）：\n${bare.join("\n")}`).toEqual([]);
  });

  it('20/20 的 role="dialog" 由原语唯一持有：20 个文件 0 命中，Modal.tsx 恰 1 命中', () => {
    const holders = offendersOf(DIALOG_20, (t) => t.match(RE_DIALOG) !== null);
    expect(holders, `20 个调用点自建了 role="dialog"（角色归 Modal）：\n${holders.join("\n")}`).toEqual([]);
    const modalHits = stripped("ui/primitives/Modal.tsx").match(RE_DIALOG)?.length ?? 0;
    expect(modalHits, "原语侧不是恰 1 处 ⇒ 仪器坏了或角色被搬走").toBe(1);
  });
});

describe("② 34 − 20 = 14：不迁的 14 条逐字登记，且今日盘上仍是这 14 个", () => {
  it("差集 == NON_MIGRATED_14（14 条），角色 = 11 锚定菜单（B1）+ 3 覆盖层（B2）", () => {
    const diff = CROSS_LINE_34.filter((f) => !DIALOG_20.includes(f));
    expect(diff, "34 − 20 的差集与登记表不符（少一条 / 多一条都会被这里抓住）").toEqual([...NON_MIGRATED_14]);
    expect(diff.length, "34 − 20 必须恰好是 14").toBe(14);
    expect(MENU_11.length, "11 个锚定菜单（B1）").toBe(11);
    expect(OVERLAY_3.length, "3 个采集/预览覆盖层（B2）").toBe(3);
    expect([...MENU_11, ...OVERLAY_3].sort()).toEqual([...NON_MIGRATED_14]);
    expect(NON_MIGRATED_14.includes(T13B_MOVED), "T13-b 搬来的那一段必须仍在「不迁」账上（B1/B2 不许静默消失）").toBe(true);
    expect(CROSS_LINE_34.includes(TABLE4_ALIAS), `${TABLE4_ALIAS} 不在 34 里（别名不是成员）`).toBe(false);
    expect(DISK_FILES.includes(TABLE4_ALIAS), `${TABLE4_ALIAS} 在盘上不存在`).toBe(true);
  });

  it("盘上对拍：今日的跨行命中集 == 这 14 个（原文件 → T13-b 搬走的那一段仍算在内）", () => {
    // B7 的拆件把 `pages/ChatPage.tsx` 里的**同一段**锚定菜单搬到 `components/chat/ChatLaunchMenu.tsx`
    // ⇒ 盘上集合 = 登记表（`ChatLaunchMenu` 为成员、`ChatPage` 不再命中）。这不是放宽：两侧都逐字列名。
    expect(DISK_CROSS_LINE, "盘上跨行 `fixed`∧`inset:0` 的文件集与登记的 14 条不符").toEqual([...NON_MIGRATED_14]);
    // B1/B2 的守卫（**收窄后**）：判据 = 登记为「不迁」的 14 个，barrel 名字表里不得出现 `Modal`。
    // 为什么不判「文件里出现 `ui/primitives` 字样」：T13 的空态迁移按 B6 让其中三个锚定菜单 import 了
    // `EmptyState`/`Button` —— 叶子原语既不是弹层机制也不是「自建第二套对话框」（ADR-033 §7 的适用对象
    // 是对话框类，B1 逐字排除它们）⇒ 旧判据会把 B6 授权的迁移误报成绕过 B1。
    const usesModal = NON_MIGRATED_14.filter((rel) => BARREL_NAMES(rel).includes("Modal"));
    expect(usesModal, `登记为「不迁」的文件开始用 Modal 了（B1 / B2 被绕过）：\n${usesModal.join("\n")}`).toEqual([]);
    // 收窄不能变成空转：域内必须真的有文件被判为「用了 Modal」（阳性对照）
    expect(BARREL_NAMES("components/RefineWorkbench.tsx").includes("Modal"), "阳性对照失效：判据读不出 Modal").toBe(true);
  });
});

describe("③ ADR-033 的 28：⊆ 34、恰 28 条、且 == 34 − 6（跨行口径新增项）", () => {
  it("28 ⊆ 34 ∧ |28| = 28 ∧ 28 == 34 − CROSS_LINE_ONLY_6 ∧ 6 条差项互不重叠", () => {
    const notIn34 = ADR033_28.filter((f) => !CROSS_LINE_34.includes(f));
    expect(notIn34, `28 里有不在 34 的文件：\n${notIn34.join("\n")}`).toEqual([]);
    // T13-b 只把 `ChatPage` 那**一条**换成它的新家（同一段代码、同一次搬迁）⇒ 两侧计数都不变，
    // `28 + 6 == 34` 与 `34 − 20 == 14` 两条恒等式在搬迁后依然成立。
    expect(ADR033_28.length).toBe(28);
    expect(CROSS_LINE_34.filter((f) => !CROSS_LINE_ONLY_6.includes(f))).toEqual([...ADR033_28]);
    expect(CROSS_LINE_ONLY_6.length, "28 + 6 = 34 的差额必须是 6").toBe(6);
    expect(ADR033_28.filter((f) => CROSS_LINE_ONLY_6.includes(f)), "6 条差项必须都在 28 之外").toEqual([]);
    expect(CROSS_LINE_ONLY_6.filter((f) => !CROSS_LINE_34.includes(f)), "差项必须是 34 的成员").toEqual([]);
  });
});

describe("E 组 · 2 个弹层的四条形态契约（每条各带自己的变异体）", () => {
  for (const rel of E_FILES) {
    it(`① ${rel}：从 barrel 导入 Modal，无深导入`, () => {
      expect(BARREL_NAMES(rel), `${rel} 的 barrel 名字表不含 Modal`).toContain("Modal");
      expect(RE_DEEP.test(stripped(rel)), `${rel} 出现深导入（ADR-033 §1 禁止）`).toBe(false);
    });

    it(`② ${rel}：无自建遮罩`, () => {
      const text = stripped(rel);
      expect(RE_FIXED.test(text) && RE_INSET.test(text), `${rel} 仍在自建遮罩（position:"fixed" ∧ inset:0）`).toBe(false);
    });

    it(`③ ${rel}：无 keydown 监听、无裸数字 z-index、不再 import 层级标尺`, () => {
      const text = stripped(rel);
      expect(text.includes('addEventListener("' + 'keydown') || text.includes("onkeydown="), `${rel} 仍自建 ESC 监听`).toBe(false);
      expect(RE_BARE_Z.test(text), `${rel} 仍有裸数字 z-index`).toBe(false);
      expect(/from\s*"(?:\.\.\/)+ui\/zIndex"/.test(text), `${rel} 仍 import ui/zIndex（层级归 Modal）`).toBe(false);
    });

    it(`④ ${rel}：面板宽度不再由调用点声明（宽度权威在 Modal 的档位）`, () => {
      const text = stripped(rel);
      expect(/<Modal[\s\S]*?\bsize="l"/.test(text), `${rel} 未给 Modal 声明 size="l"`).toBe(true);
      expect(/width\s*:\s*(560|640|720|1200|["']9\dvw["'])/.test(text), `${rel} 仍由调用点声明面板宽度`).toBe(false);
      // 仪器自证：同一条正则对**迁移前**的写法必须命中（否则上面那条恒真 = 空真）
      expect(/width\s*:\s*(560|640|720|1200|["']9\dvw["'])/.test('const s = { width: 560, maxWidth: "92vw" };')).toBe(true);
    });
  }
});
