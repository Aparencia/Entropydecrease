// @vitest-environment node
/**
 * @ai-context **T12 迁移判据**（批 4 B4 的落点）：把 `const *Btn*` 常量族的直接消费者
 * （`style={xxxBtn}` / `style={xxxBtn(...)}`）换成 `Button` 原语后，**这些形态必须归零、且
 * 换出来的 `Button` 形状必须逐文件与冻结表一致**。
 *
 * Why 需要它：棘轮（`nativeButton.ratchet.test.ts`）只看得见「<button> 变少了」，看不见
 * 「**换成了什么**」—— 把 `variant="primary"` 写成 `"secondary"` 在棘轮下**完全无声**。
 * 本文件补的正是这条：`文件 × (variant,size)` 形状表 + 常量族台账 + **缺口登记**（还没迁的
 * 文件逐条列名 + 实测处数，不许静默消失）。
 *
 * ★ 形状表**不锚行号**：批 4 的 T13–T17 会继续编辑同一批文件 —— 行号锚点会让「在我上面加一行
 * import」变成假红。按**文件**聚合的计数粒度既抓得住「某处换了 variant」（计数必变），
 * 又不会被无关编辑误伤。**逐处 `文件:行` 的三元组对拍**由同一提交的 `tmp/t12/verify-map.mjs`
 * 对 `tmp/t12/button-map.md` 做（交付物 side，读数见报告 §5）。
 *
 * ★ 扫描口径 = `./buttonScan`（唯一实现，与生成器共享；本文件不重写剥注释状态机）。
 *
 * 副作用：只读磁盘（37 个源文件），不修改任何文件。边界：
 *   ① **不判视觉**（jsdom / 文本层判不了观感；像素归批 8）；
 *   ② 常量族白名单是**显式**的 —— 少一条 / 多一条都红（防「看起来干净」的静默残留）；
 *   ③ 缺口表是**实测值**（不是"应该还剩几处"）—— 后来者补做时它会红，那正是补做的信号。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FROZEN_NATIVE_BUTTON_TOTAL } from "./nativeButtonBaseline";
import { declsOf, directHits, shapeCensus, stripComments } from "./buttonScan";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** T1 `tmp/t1/callsites.txt` §B 的 37 文件（B4 的「真实迁移面」清单，逐字冻结） */
const T1_SECTION_B_37: readonly string[] = [
  "components/AiProviderSettings.tsx",
  "components/AiRefineCard.tsx",
  "components/AiServicePanel.tsx",
  "components/AiTaskPanel.tsx",
  "components/AsrConfusionPanel.tsx",
  "components/CaptureFloatPanel.tsx",
  "components/EnrichPanel.tsx",
  "components/GoalPlanApprovalDialog.tsx",
  "components/GraduateDialog.tsx",
  "components/GroupRowContextMenu.tsx",
  "components/ImageGallery.tsx",
  "components/InterviewDialog.tsx",
  "components/KnowledgeTreeView.tsx",
  "components/LinkEntityPicker.tsx",
  "components/MaterialInputPanel.tsx",
  "components/ModelCardFromNoteDialog.tsx",
  "components/ModelManagementPanel.tsx",
  "components/NoteAiDialog.tsx",
  "components/PracticeQuestionsOverlays.tsx",
  "components/ProofreadPanel.tsx",
  "components/RefineLaunchDialog.tsx",
  "components/RefineStrategyPicker.tsx",
  "components/RichEditorView.tsx",
  "components/SecondPassPanel.tsx",
  "components/SessionListRow.tsx",
  "components/SessionSearchBar.tsx",
  "components/SessionSelectionToolbar.tsx",
  "components/SopRunOverlay.tsx",
  "components/StructureImageSection.tsx",
  "components/VideoImportPanel.tsx",
  "components/VocabManager.tsx",
  "components/WebArticleView.tsx",
  "components/WebImportPanel.tsx",
  "components/WebInboxPanel.tsx",
  "components/action-center/ActionCenterPanel.tsx",
  "components/session-detail/SessionDetailHeader.tsx",
  "pages/GoalsPage.tsx",
];

/** 登记例外：**点名 + 理由**（缺口必须可见；不许从账本消失） */
const EXCLUDED: Readonly<Record<string, string>> = {
  "components/GroupRowContextMenu.tsx": "B1：T8 的 dialogMigration.e.test.ts:240-244 禁止 NON_MIGRATED_14 import 原语",
  "components/RichEditorView.tsx": "B1：同上（锚定菜单）",
};
const MIGRATED = T1_SECTION_B_37.filter((f) => EXCLUDED[f] === undefined);

/** 缺口：这些文件**还剩几处** `style={xxxBtn}`（实测值；补做时这里先红） */
const GAP_SITES: Readonly<Record<string, number>> = {
  "components/GroupRowContextMenu.tsx": 2,
  "components/RichEditorView.tsx": 3,
};

/** 已补齐的历史缺口（T11 落库后由 T12 补做）—— 留档，防止"缺口从账本消失" */
const FILLED_GAP = { file: "components/AiProviderSettings.tsx", sites: 8, why: "曾与 T11 并行撞车；T11 落库后补做" } as const;

/** 仍被引用的 `const *Btn*` 白名单（`文件|常量名`）—— **只有 spread 消费者**的常量按兵不动 */
const STILL_REFERENCED: readonly string[] = [
  "components/AiProviderSettings.tsx|btn",
  "components/AiRefineCard.tsx|btn",
  "components/AiServicePanel.tsx|btn",
  "components/AiTaskPanel.tsx|btn",
  "components/AsrConfusionPanel.tsx|rowBtn",
  "components/CaptureFloatPanel.tsx|btn",
  "components/CaptureFloatPanel.tsx|iconBtn",
  "components/EnrichPanel.tsx|btn",
  "components/InterviewDialog.tsx|ghostBtn",
  "components/MaterialInputPanel.tsx|btn",
  "components/NoteAiDialog.tsx|menuBtn",
  "components/PracticeQuestionsOverlays.tsx|btn",
  "components/PracticeQuestionsOverlays.tsx|ghostBtn",
  "components/ProofreadPanel.tsx|btn",
  "components/ProofreadPanel.tsx|ghostBtn",
  "components/ProofreadPanel.tsx|okBtn",
  "components/RefineLaunchDialog.tsx|btn",
  "components/RefineStrategyPicker.tsx|optBtn",
  "components/SecondPassPanel.tsx|btn",
  "components/SecondPassPanel.tsx|ghostBtn",
  "components/SecondPassPanel.tsx|okBtn",
  "components/SessionSelectionToolbar.tsx|btn",
  "components/SopRunOverlay.tsx|btn",
  "components/SopRunOverlay.tsx|ghostBtn",
  "components/VideoImportPanel.tsx|btn",
  "components/VocabManager.tsx|btn",
  "components/WebArticleView.tsx|btn",
  "components/WebInboxPanel.tsx|btn",
  "components/WebInboxPanel.tsx|ghostBtn",
  "components/action-center/ActionCenterPanel.tsx|btn",
  "components/action-center/ActionCenterPanel.tsx|dangerBtn",
  "components/action-center/ActionCenterPanel.tsx|ghostBtn",
  "components/action-center/ActionCenterPanel.tsx|okBtn",
  "components/session-detail/SessionDetailHeader.tsx|btn",
  "pages/GoalsPage.tsx|ghostBtn",
];

/** 换出来的 `Button` 形状表：`文件 → (variant,size) 形状 → 计数`（迁移后实测） */
const BUTTON_SHAPES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "components/AiProviderSettings.tsx": { "variant=secondary size=md": 8 },
  "components/AiRefineCard.tsx": { "variant=secondary size=md": 1 },
  "components/AiServicePanel.tsx": { "variant=secondary size=md": 1 },
  "components/AiTaskPanel.tsx": { "variant=secondary size=sm": 3 },
  "components/AsrConfusionPanel.tsx": { "variant=secondary size=md": 1 },
  "components/CaptureFloatPanel.tsx": { "variant=ghost size=sm": 5 },
  "components/EnrichPanel.tsx": { "variant=secondary size=md": 4 },
  "components/GoalPlanApprovalDialog.tsx": { "variant=secondary size=md": 2, "variant=primary size=md": 1 },
  "components/GraduateDialog.tsx": { "variant=primary size=md": 2, "variant=secondary size=md": 1 },
  "components/ImageGallery.tsx": { "variant=secondary size=md": 1 },
  "components/InterviewDialog.tsx": { "variant=secondary size=md": 2, "variant=primary size=md": 2 },
  "components/KnowledgeTreeView.tsx": { "variant=secondary size=md": 9 },
  "components/LinkEntityPicker.tsx": { "variant=三元:ghost|primary size=md": 1 },
  "components/MaterialInputPanel.tsx": { "variant=secondary size=lg": 2 },
  "components/ModelCardFromNoteDialog.tsx": { "variant=secondary size=md": 2 },
  "components/ModelManagementPanel.tsx": { "variant=secondary size=sm": 2 },
  "components/NoteAiDialog.tsx": { "variant=secondary size=lg": 1 },
  "components/PracticeQuestionsOverlays.tsx": { "variant=primary size=md": 4, "variant=secondary size=md": 1 },
  "components/ProofreadPanel.tsx": { "variant=primary size=md": 1 },
  "components/RefineLaunchDialog.tsx": { "variant=secondary size=md": 2 },
  "components/RefineStrategyPicker.tsx": { "variant=三元:primary|secondary size=md": 1, "variant=三元:primary|secondary size=sm": 1 },
  "components/SecondPassPanel.tsx": { "variant=primary size=md": 1, "variant=secondary size=md": 2 },
  "components/SessionListRow.tsx": { "variant=secondary size=sm": 2 },
  "components/SessionSearchBar.tsx": { "variant=三元:ghost|primary size=sm": 3, "variant=secondary size=md": 2 },
  "components/SessionSelectionToolbar.tsx": { "variant=三元:primary|secondary size=sm": 1 },
  "components/SopRunOverlay.tsx": { "variant=secondary size=md": 2, "variant=primary size=md": 4 },
  "components/StructureImageSection.tsx": { "variant=secondary size=md": 2 },
  "components/VideoImportPanel.tsx": { "variant=secondary size=lg": 1 },
  "components/VocabManager.tsx": { "variant=secondary size=sm": 4 },
  "components/WebArticleView.tsx": { "variant=secondary size=md": 1 },
  "components/WebImportPanel.tsx": { "variant=primary size=md": 1 },
  "components/WebInboxPanel.tsx": { "variant=primary size=md": 1, "variant=secondary size=md": 1 },
  "components/action-center/ActionCenterPanel.tsx": { "variant=primary size=md": 4, "variant=secondary size=md": 3 },
  "components/session-detail/SessionDetailHeader.tsx": { "variant=secondary size=md": 1 },
  "pages/GoalsPage.tsx": { "variant=primary size=md": 1, "variant=secondary size=md": 1 },
};
/** 形状表覆盖的 `Button` 总数（= 迁移处数；棘轮的 Δ 必须与它逐字相等） */
const MIGRATED_SITES = 99;
/** 迁移前读数（`dev@bde807dc` 导出树，同一仪器实测）：棘轮基线**只许在这条线以下** */
const PRE_T12_NATIVE_BUTTONS = 493;

const read = (rel: string): string => stripComments(readFileSync(join(SRC, ...rel.split("/")), "utf8"));

describe("T12 · 仪器自证（正/负对照 · 剥注释 · 空真排查）", () => {
  it("directHits 命中已知形态 · 对无意义串报 0 · **剥注释生效** · 带参形态同样命中", () => {
    const sample = [
      "const okBtn: React.CSSProperties = { color: \"#fff\" };",
      "export function X() {",
      "  return <button style={okBtn} onClick={() => void f()}>保存</button>;",
      "}",
    ].join("\n");
    expect(directHits(sample), "阳性对照：已知 style={okBtn} 必须被命中").toBe(1);
    expect(directHits(sample.replace("style={okBtn}", "style={other}")), "阴性对照：非常量引用报 0").toBe(0);
    expect(directHits(sample.replace("style={okBtn}", "style={{ ...okBtn, color: \"red\" }}")), "spread 形态**不算**直接形态（B4 只迁直接形态）").toBe(0);
    expect(directHits("const s = 1;"), "无意义串报 0").toBe(0);
    expect(directHits(stripComments("// <button style={okBtn}>\n")), "行注释里的标签不算命中（剥注释承重）").toBe(0);
    expect(directHits(stripComments("/* <button style={okBtn}> */\n")), "块注释同理").toBe(0);
    expect(directHits(stripComments(sample + "\nconst u = \"https://example.com/a//b\";\n")), "URL 字面量不破坏剥注释（\"//\" 在字符串里）").toBe(1);
    expect(directHits(sample.replace("style={okBtn}", "style={okBtn(1)}")), "带参形态 style={okBtn(1)} 命中").toBe(1);
  });

  it("shapeCensus 能区分字面量 / 三元 / 缺省（否则形状表是空真）", () => {
    expect(shapeCensus('<Button variant="primary" size="sm">x</Button>')).toEqual({ "variant=primary size=sm": 1 });
    expect(shapeCensus('<Button variant={a ? "ghost" : "primary"} size="md">x</Button>')).toEqual({ "variant=三元:ghost|primary size=md": 1 });
    expect(shapeCensus("<Button>x</Button>")).toEqual({ "variant=(默认) size=(默认)": 1 });
    expect(shapeCensus('<Text variant="primary">x</Text>'), "非 Button 标签不进形状表").toEqual({});
  });

  it("域完备性双侧自证：37 条清单每条在盘上可读 · 清单/例外/缺口三张表互相对得上", () => {
    expect(T1_SECTION_B_37.length, "T1 §B 清单长度不是 37").toBe(37);
    expect(new Set(T1_SECTION_B_37).size, "清单有重复条目").toBe(37);
    expect(MIGRATED.length + Object.keys(EXCLUDED).length).toBe(37);
    for (const rel of T1_SECTION_B_37) expect(read(rel).length, `读不到 ${rel}`).toBeGreaterThan(0);
    expect(Object.keys(GAP_SITES).sort(), "缺口表与例外表不是同一组文件").toEqual(Object.keys(EXCLUDED).sort());
    expect(MIGRATED.length, "已迁文件数不像话（清单读错会在这里显形）").toBe(35);
    expect(MIGRATED, "曾登记的历史缺口已补齐（它必须回到已迁清单里）").toContain(FILLED_GAP.file);
    expect(directHits(read(FILLED_GAP.file)), `补做过的 ${FILLED_GAP.file} 又冒出直接形态命中`).toBe(0);
  });
});

describe("① 直接形态 style={xxxBtn} 在 35 个已迁文件里归零", () => {
  it("逐文件 directHits === 0；缺口文件的实测处数 == 登记值（仪器在缺口上有非零读数 ⇒ 不是看不见）", () => {
    const bad = MIGRATED.filter((rel) => directHits(read(rel)) !== 0)
      .map((rel) => `${rel}: ${directHits(read(rel))}`);
    expect(bad, `以下文件仍有直接形态常量消费者：\n${bad.join("\n")}`).toEqual([]);
    const nonZero = MIGRATED.filter((rel) => directHits(read(rel)) > 0).length;
    expect(nonZero, "已迁文件里还有非零命中（上面那条应已列出）").toBe(0);
    for (const [rel, frozen] of Object.entries(GAP_SITES)) {
      expect(directHits(read(rel)), `缺口文件 ${rel} 的处数与登记不符（被静默补掉 / 悄悄变大）`).toBe(frozen);
    }
  });
});

describe("② 常量族台账：孤立常量 = 0，仍被引用者 == 白名单", () => {
  it("没有声明了却没人用的 const *Btn*；散见形态逐条在白名单里", () => {
    const orphans: string[] = [];
    const kept: string[] = [];
    for (const rel of MIGRATED) {
      const s = read(rel);
      for (const name of declsOf(s)) {
        const refs = (s.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
        if (refs <= 1) orphans.push(`${rel}|${name}`);
        else kept.push(`${rel}|${name}`);
      }
    }
    expect(orphans, `孤立常量（声明后无人引用）：\n${orphans.join("\n")}`).toEqual([]);
    expect(kept.slice().sort(), "仍被引用的常量集与白名单不符（多一条 = 残留没登记，少一条 = 白名单过期）").toEqual([...STILL_REFERENCED]);
  });
});

describe("③ Button 形状表：换出来的原语必须与冻结的 (variant,size) 逐文件一致", () => {
  it("逐文件形状计数相等，且总数 == 99（把 primary 写成 secondary 这里必红）", () => {
    const diffs: string[] = [];
    let total = 0;
    for (const rel of MIGRATED) {
      const now = shapeCensus(read(rel));
      total += Object.values(now).reduce((a, b) => a + b, 0);
      const want = BUTTON_SHAPES[rel];
      if (JSON.stringify(now) !== JSON.stringify(want)) diffs.push(`${rel}: 盘上 ${JSON.stringify(now)} ≠ 冻结 ${JSON.stringify(want)}`);
    }
    expect(diffs, `形状表不符：\n${diffs.join("\n")}`).toEqual([]);
    expect(total, "迁移处数与冻结总数不符（少迁 / 多迁都要红）").toBe(MIGRATED_SITES);
    expect(Object.keys(BUTTON_SHAPES).length, "形状表文件数 ≠ 已迁文件数").toBe(MIGRATED.length);
  });
});

describe("④ 棘轮朝向 + 缺口可见（这条判据的牙）", () => {
  it("棘轮基线在 T12 之前那条线以下（手改回 510 / 抬到 520 这里红）", () => {
    expect(FROZEN_NATIVE_BUTTON_TOTAL, `棘轮基线被抬高到 ${FROZEN_NATIVE_BUTTON_TOTAL}（T12 迁移前是 ${PRE_T12_NATIVE_BUTTONS}）`).toBeLessThanOrEqual(PRE_T12_NATIVE_BUTTONS);
  });

  it("两个 B1 例外文件不许 import 原语（与 T8 的 dialogMigration.e.test.ts:240-244 同向复核）", () => {
    const offenders = ["components/GroupRowContextMenu.tsx", "components/RichEditorView.tsx"]
      .filter((rel) => read(rel).includes("ui/primitives"));
    expect(offenders, `B1 例外文件开始用原语了（会绕过 T8 的 NON_MIGRATED_14 守卫）：\n${offenders.join("\n")}`).toEqual([]);
  });
});
