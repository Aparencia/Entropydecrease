import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * @ai-context **棘轮守卫**：裸数字 z-index 只许减少（ADR-032 决策 5 的执行手段）。
 *
 * Why：批 0-A 已交付六档标尺 `ui/zIndex.ts`（消费方式 `zIndex("modal")`），但全仓仍有
 * **43 文件 / 58 行**裸数字（recon §10），17 个不同值分裂成 10…61 与 900…1150 两个
 * **不相交**的段 —— 叠放顺序是涌现的而不是被设计的。批 4 才整段迁移，在那之前必须有
 * 机器判据拦住「新代码继续写裸数字」，否则标尺会退化成「又一套并存的东西」
 * （先例：`ui/icons/no-inline-svg.test.ts`）。本守卫**不要求本批清理存量**，只要求不倒退。
 *
 * 副作用：只读磁盘（递归遍历 `app/src`）。不修改任何文件。
 * 边界：批 4 每迁完一处，应从名单里删掉对应条目（第 2 个 `it` 会要求删）。
 *
 * ★ 检索口径（四项逐条声明 —— 口径本身是守卫的一部分，改口径等于改守卫）
 *   ① 范围：`app/src` 递归；文件 = `*.ts` / `*.tsx`（内联 `zIndex: <num>`）与
 *      `*.css`（`z-index: <num>`）。**不含** `.mjs`（token 生成器在 `app/scripts/`，
 *      不在 `app/src` 下）、不含 `app/src-tauri`（无 TS）。
 *   ② 排除测试：路径以 `.test.ts` / `.test.tsx` 结尾者**整体跳过**。理由是实测的 3 行
 *      `components/CanvasNodes.test.tsx:38,41,44` 的 `zIndex: 0` 是 React Flow 的
 *      **节点字段**而**不是样式**（把它算进来会让名单混入非样式命中，棘轮语义被稀释）。
 *      已知缺口：测试文件里新增的裸数字**样式**同样不会被拦下（测试不承载观感契约）。
 *   ③ `ui/zIndex.ts` 自身**不豁免**：它用 `Z_TIER` 常量表定义档位，不出现 `zIndex: <num>`
 *      形态，故天然 0 命中；第 4 个 `it` 把「它在扫描域内且自身 0 命中」钉成断言 ——
 *      若有人在标尺模块里写死裸数字，本守卫照样红。
 *   ④ 匹配形态：`/zIndex\s*:\s*-?\d+/`（内联）与 `/z-index\s*:\s*-?\d+/`（CSS）。
 *      合法写法 `zIndex: zIndex("modal")` / `z-index: var(--ed-…)` **不匹配**、不被误伤；
 *      字符串形态 `zIndex: "300"` 与 `zIndex:` 换行到下一行的写法**不匹配**（已知缺口，已登记）。
 *      命中键 = `相对 app/src 的正斜杠路径::该行 trim 后的原文` —— **刻意不含行号**：行号会随
 *      上方插行／删行漂移，把名单变成天天假红的噪声源；报错信息里则带 **路径:行号** 便于定位。
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 内联形态（TS/TSX）：`zIndex: 300` · `zIndex:300` · `zIndex: -1` */
const INLINE_PATTERN = /zIndex\s*:\s*-?\d+/;
/** CSS 形态：`z-index: 300`（`z-index: var(--ed-…)` 不匹配） */
const CSS_PATTERN = /z-index\s*:\s*-?\d+/;

/** 一条命中：`key` 进冻结名单（无行号，抗行漂移）；`location` 只用于报错定位 */
interface RawZIndexHit {
  key: string;
  location: string;
  text: string;
}

/**
 * 改造前就存在的裸数字 z-index（相对 `app/src`，正斜杠）—— **只允许减少**。
 *
 * 由 Task 2 守卫首次运行的实测输出逐行填入（58 条 = recon §10 的 58 lines / 43 files），
 * 与 `FROZEN_OVER_LIMIT` 的棘轮同源：名单只能缩短，不能加长。
 */
const FROZEN_NUMERIC_ZINDEX: readonly string[] = [
  "components/AiConversationDock.tsx::position: \"fixed\", top: \"var(--ed-nav-h)\", right: 0, bottom: 0, width: PANEL_W, zIndex: 900,",
  "components/BoxSelectOverlay.tsx::zIndex: 10,",
  "components/BoxSelectOverlay.tsx::zIndex: 20,",
  "components/BrowserChrome.tsx::zIndex: 1000,",
  "components/CaptureOverlayPanel.tsx::<div style={{ position: \"fixed\", bottom: 24, left: \"50%\", transform: \"translateX(-50%)\", display: \"flex\", gap: 8, zIndex: 10 }}>",
  "components/ChatSaveNoteDialog.tsx::position: \"fixed\", zIndex: 51, top: \"50%\", left: \"50%\",",
  "components/ChatSaveNoteDialog.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 50, background: \"rgba(0,0,0,0.18)\" }}",
  "components/GoalPlanApprovalDialog.tsx::<div style={{ position: \"fixed\", inset: 0, background: \"rgba(0,0,0,.35)\", display: \"flex\", alignItems: \"center\", justifyContent: \"center\", zIndex: 60 }}>",
  "components/GraduateDialog.tsx::<div style={{ position: \"fixed\", inset: 0, background: \"rgba(0,0,0,.35)\", display: \"flex\", alignItems: \"center\", justifyContent: \"center\", zIndex: 60 }}>",
  "components/GroupCreateDialog.tsx::style={{ position: \"fixed\", inset: 0, background: \"rgba(0,0,0,0.45)\", zIndex: 1000, display: \"flex\", alignItems: \"center\", justifyContent: \"center\" }}",
  "components/GroupDeleteConfirm.tsx::style={{ position: \"fixed\", inset: 0, background: \"rgba(0,0,0,0.45)\", zIndex: 1000, display: \"flex\", alignItems: \"center\", justifyContent: \"center\" }}",
  "components/GroupRowContextMenu.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 60, background: \"transparent\" }}",
  "components/GroupRowContextMenu.tsx::zIndex: 61,",
  "components/GroupSidebarRow.tsx::style={{ position: \"absolute\", top: \"100%\", left: 8, zIndex: 20, background: \"#fff\", border: \"1px solid #e5e7eb\", borderRadius: 6, padding: 8, boxShadow: \"0 4px 12px rgba(0,0,0,0.12)\" }}",
  "components/ImagePreviewOverlay.tsx::zIndex: 1000,",
  "components/InterviewDialog.tsx::<div style={{ position: \"fixed\", inset: 0, background: \"rgba(0,0,0,.35)\", display: \"flex\", alignItems: \"center\", justifyContent: \"center\", zIndex: 60 }}>",
  "components/KnowledgeConceptDialog.tsx::display: \"flex\", alignItems: \"center\", justifyContent: \"center\", zIndex: 50,",
  "components/KnowledgeDecisionForm.tsx::<div style={{ position: \"fixed\", inset: 0, background: \"rgba(0,0,0,0.45)\", display: \"flex\", alignItems: \"center\", justifyContent: \"center\", zIndex: 50 }} onClick={onClose}>",
  "components/KnowledgeModelDialog.tsx::display: \"flex\", alignItems: \"center\", justifyContent: \"center\", zIndex: 50,",
  "components/KnowledgeSystemWizard.tsx::display: \"flex\", alignItems: \"center\", justifyContent: \"center\", zIndex: 50,",
  "components/ModelCardCreateDialog.tsx::style={{ position: \"fixed\", inset: 0, background: \"rgba(0,0,0,0.45)\", zIndex: 1000, display: \"flex\", alignItems: \"center\", justifyContent: \"center\" }}",
  "components/ModelCardFromNoteDialog.tsx::zIndex: 1000,",
  "components/NoteAiDialog.tsx::style={{ position: \"fixed\", inset: 0, background: \"rgba(17,24,39,.45)\", zIndex: 1000,",
  "components/NoteEditView.tsx::<div onClick={() => setHighlightOpen(false)} style={{ position: \"fixed\", inset: 0, zIndex: 30, background: \"transparent\" }} />",
  "components/NoteEditView.tsx::style={{ position: \"absolute\", top: \"100%\", left: 0, zIndex: 31, background: \"#fff\", border: \"1px solid #e5e7eb\", borderRadius: 6, padding: 8, boxShadow: \"0 4px 12px rgba(0,0,0,0.12)\", maxWidth: 200 }}",
  "components/NoteHeaderActions.tsx::style={{ position: \"absolute\", top: \"100%\", right: 0, zIndex: 30, background: \"#fff\", border: \"1px solid #e5e7eb\", borderRadius: 6, padding: 8, boxShadow: \"0 4px 12px rgba(0,0,0,0.12)\" }}",
  "components/NoteLinkToSystem.tsx::position: \"absolute\", zIndex: 31, top: \"calc(100% + 6px)\", right: 0,",
  "components/NoteLinkToSystem.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 30, background: \"transparent\" }}",
  "components/NoteListBatchMenu.tsx::<div data-testid=\"batch-context-menu\" style={{ position: \"fixed\", zIndex: 41, left: x || 12, top: y || 12, minWidth: 180, background: \"#fff\", border: \"1px solid #e5e7eb\", borderRadius: 8, boxShadow: \"0 6px 18px rgba(0,0,0,0.12)\", padding: 6, fontSize: 12 }}>",
  "components/NoteListBatchMenu.tsx::<div style={{ position: \"fixed\", inset: 0, zIndex: 40 }} onClick={onClose} />",
  "components/NoteMoveToGroupMenu.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 30, background: \"transparent\" }}",
  "components/NoteMoveToGroupMenu.tsx::zIndex: 31,",
  "components/NoteRowContextMenu.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 60, background: \"transparent\" }}",
  "components/NoteRowContextMenu.tsx::zIndex: 61,",
  "components/PracticeQuestionsOverlays.tsx::zIndex: 1150,",
  "components/ProofreadPanel.tsx::zIndex: 1000,",
  "components/RefineLaunchDialog.tsx::style={{ position: \"fixed\", inset: 0, background: \"rgba(17,24,39,.45)\", zIndex: 1000,",
  "components/RefineWorkbench.tsx::position: \"fixed\", inset: 0, zIndex: 999,",
  "components/RichEditorView.tsx::<div onClick={() => setHighlightOpen(false)} style={{ position: \"fixed\", inset: 0, zIndex: 30, background: \"transparent\" }} />",
  "components/RichEditorView.tsx::style={{ position: \"absolute\", top: \"100%\", left: 0, zIndex: 31, background: \"#fff\", border: \"1px solid #e5e7eb\", borderRadius: 6, padding: 8, boxShadow: \"0 4px 12px rgba(0,0,0,0.12)\", maxWidth: 200 }}",
  "components/RouteInfoPopover.tsx::position: \"fixed\", zIndex: 31, width: 300, maxHeight: \"70vh\",",
  "components/RouteInfoPopover.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 30, background: \"transparent\" }}",
  "components/ScreenSelectOverlay.tsx::style={{ position: \"absolute\", inset: 0, background: \"rgba(255,255,255,0.96)\", zIndex: 20, display: \"flex\", flexDirection: \"column\", alignItems: \"center\", justifyContent: \"center\", gap: 8 }}",
  "components/ScreenSelectOverlay.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 999, background: \"rgba(17,24,39,0.45)\", cursor: \"crosshair\" }}",
  "components/SecondPassPanel.tsx::zIndex: 1000,",
  "components/SessionRowContextMenu.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 60, background: \"transparent\" }}",
  "components/SessionRowContextMenu.tsx::zIndex: 61,",
  "components/SopRunOverlay.tsx::zIndex: 1100,",
  "components/SystemStatusBadge.tsx::zIndex: 20,",
  "components/TaskLaunchDialog.tsx::<div onClick={onClose} data-testid=\"task-launch-backdrop\" style={{ position: \"fixed\", inset: 0, zIndex: 50, background: \"rgba(0,0,0,0.18)\" }} />",
  "components/TaskLaunchDialog.tsx::position: \"fixed\", zIndex: 51, top: \"50%\", left: \"50%\", transform: \"translate(-50%, -50%)\",",
  "components/WindowSelectCard.tsx::zIndex: 20,",
  "components/note-selection/SelectionActionMenu.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 60, background: \"transparent\" }}",
  "components/note-selection/SelectionActionMenu.tsx::zIndex: 61,",
  "hooks/useTransientToast.tsx::zIndex: 200,",
  "pages/ChatPage.tsx::<div data-testid=\"task-launch-menu\" data-app-menu=\"\" style={{ position: \"absolute\", top: \"100%\", left: 0, zIndex: 31, background: \"#fff\", border: \"1px solid #e5e7eb\", borderRadius: 6, padding: 4, boxShadow: \"0 4px 12px rgba(0,0,0,0.12)\", minWidth: 180 }}>",
  "pages/ChatPage.tsx::<div onClick={() => setLaunchMenuOpen(false)} style={{ position: \"fixed\", inset: 0, zIndex: 30, background: \"transparent\" }} />",
  "pages/SessionsPage.tsx::zIndex: 100,",
];

/** 递归收集 `app/src` 下受管辖的源文件（口径①） */
function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (/\.tsx?$/.test(entry) || entry.endsWith(".css")) out.push(full);
  }
  return out;
}

/** 按口径①②④ 全仓扫描，返回按 `key` 排序的命中明细 */
function numericZIndexHits(): RawZIndexHit[] {
  const hits: RawZIndexHit[] = [];
  for (const file of collectFiles(SRC)) {
    const isCss = file.endsWith(".css");
    if (!isCss && /\.test\.tsx?$/.test(file)) continue; // 口径②
    const rel = relative(SRC, file).split(sep).join("/");
    const pattern = isCss ? CSS_PATTERN : INLINE_PATTERN;
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (!pattern.test(line)) return;
        const text = line.trim();
        hits.push({ key: `${rel}::${text}`, location: `${rel}:${index + 1}`, text });
      });
  }
  return hits.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** 违规明细格式 = `相对路径:行号  该行原文`（报错必须点名到行，否则无法定位） */
function describeHits(hits: readonly RawZIndexHit[]): string {
  return hits.map((h) => `${h.location}  ${h.text}`).join("\n");
}

describe("z-index 棘轮", () => {
  it("不得新增裸数字 z-index（只允许减少）", () => {
    const current = numericZIndexHits();
    const added = current.filter((h) => !FROZEN_NUMERIC_ZINDEX.includes(h.key));
    expect(
      added.map((h) => `${h.location}  ${h.text}`),
      `新增了裸数字 z-index（请改用 zIndex("<档名>")，六档见 ui/zIndex.ts）：\n${describeHits(added)}`,
    ).toEqual([]);
    // 名单无重复（第 3 个 it）⇒「命中行数 ≤ 名单长度」就等价于棘轮单调。这一条闭合上面那条
    // 集合差集的漏洞：在同一文件里**整行复制**一条文本完全相同的 `zIndex: 1000,`，key 会撞车。
    expect(current.length, "裸数字 z-index 的行数变多了（只允许减少）").toBeLessThanOrEqual(
      FROZEN_NUMERIC_ZINDEX.length,
    );
  });

  it("冻结名单没有过期项（批 4 迁完要及时从名单删除）", () => {
    const current = new Set(numericZIndexHits().map((h) => h.key));
    const stale = FROZEN_NUMERIC_ZINDEX.filter((key) => !current.has(key));
    expect(stale, `名单里这些行已不含裸数字 z-index，请删除：\n${stale.join("\n")}`).toEqual([]);
  });

  it("名单非空且已排序、无重复（防空名单/失序把棘轮静默关掉）", () => {
    expect(FROZEN_NUMERIC_ZINDEX.length).toBeGreaterThan(0);
    expect([...FROZEN_NUMERIC_ZINDEX]).toEqual([...FROZEN_NUMERIC_ZINDEX].sort());
    expect(new Set(FROZEN_NUMERIC_ZINDEX).size).toBe(FROZEN_NUMERIC_ZINDEX.length);
  });

  it("扫描域锚点：标尺模块在扫描域内且自身 0 命中（口径③：不设豁免）", () => {
    const inDomain = collectFiles(SRC).map((f) => relative(SRC, f).split(sep).join("/"));
    expect(inDomain.includes("ui/zIndex.ts"), "标尺模块掉出了扫描域（口径①失效）").toBe(true);
    const fromScale = numericZIndexHits().filter((h) => h.location.startsWith("ui/zIndex.ts:"));
    expect(fromScale.map((h) => h.location), "标尺模块里出现了裸数字 z-index").toEqual([]);
  });
});
