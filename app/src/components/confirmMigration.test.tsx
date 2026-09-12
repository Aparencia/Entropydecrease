// @vitest-environment jsdom
/**
 * @ai-context 批 4 T11「`window.confirm` 8 处 → `ConfirmDialog`」的源码级 + 渲染级守卫。
 *
 * Why 两类判据都要：①–④ 是**源码级**（8 处迁移落在 6 个文件，其中 4 个没有同名测试 ⇒
 * 「不再用命令式确认」这件事在行为级没有观测点）；⑤ 是**渲染级**（逐处证明确认/取消两条分支
 * 与原文案逐字 —— 源码级判据证明不了「点确认真的执行同一个 invoke」）。
 *
 * 口径：
 *   ① 六个文件里 `window.confirm(` 命中 = 0（**剥注释后**判）；
 *   ② 六个文件都从 **barrel**（`"../ui/primitives"`）导入 `ConfirmDialog`（深导入会漏 `motion.css`）；
 *   ③ 每个文件都传了 `impacts`（§5.3 硬要求）与 `busy`（重复点击门）；
 *   ④ 全仓 `app/src/**`（含测试）`window.confirm(` 的剩余命中 == 登记的例外集（预期**空**）；
 *   ⑤ 逐处渲染：文案按 DOM 边界**逐段恰等**（标题 / message / 逐条 impact / 取消 / 确认，见 `segmentsOf`）+ 确认
 *      分支执行**同一个** invoke 实参 + 取消分支（= `window.confirm` 返回 false 的那条）**不执行**；副作用单判。
 *
 * 边界（诚实登记）：
 *   ① 段判据只认**静态字面段**；运行时插值（目标名 / 碎片正文 / 段数）在夹具下都取定值 ⇒ 仍是字面段，
 *      唯独 `VersionPanel` 的时间戳走 `fmtTime`（**本地时区**）⇒ 那一段单判「前后缀恰等 + 时间形状」。
 *   ② 「逐字」的可机械部分 = 原模板切成「标题 / message / impact 行 / 按钮」后**逐段恰等** —— 不是
 *      「片段存在」（评审 I-1：子串判据下**改一个字 / 追加「（已改字）」全绿**，计划 M4 却要求必红）；
 *      句末 `。？`、换行、包裹括号按**分隔符**处理（逐处映射表见 T11 报告 §2），未记账字符由总长守卫兜住。
 *   ③ 不判观感（jsdom 不排版）；不判真机 WebView2（`window.confirm` 静默 false 的复现面）。
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, openMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), openMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, convertFileSrc: (p: string) => `asset://${p}` }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
// AiRefineCard（NotePreviewView 的子件）与 RefineWorkbench（VersionPanel 的条件子件）都挂了
// `listen("ai:task-update")`；不 mock 这个模块 ⇒ 真 `@tauri-apps/api/event` 在 jsdom 下抛
// `transformCallback` 未定义（本仓既有范式：`pages/NotesPage.test.tsx:18`）。
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

import AiProviderSettings from "./AiProviderSettings";
import BackupPanel from "./BackupPanel";
import GoalDetail from "./GoalDetail";
import NotePreviewView from "./NotePreviewView";
import VersionPanel from "./VersionPanel";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");
const SELF = relative(SRC, fileURLToPath(import.meta.url)).split(sep).join("/");

/** `window.confirm` 的调用形态（属性链，不是裸子串判定）；④ 的例外集：迁移后应为**空**（无豁免） */
const WINDOW_CONFIRM = /window\s*\.\s*confirm\s*\(/;
const WINDOW_CONFIRM_EXCEPTIONS: readonly string[] = [];
/** 六个被迁移的文件（相对 `app/src`，一律正斜杠 —— Windows 下 `sep` 是反斜杠，承台账 #26） */
const SIX = [
  "components/AiProviderSettings.tsx", "components/BackupPanel.tsx", "components/FeedFragmentList.tsx",
  "components/GoalDetail.tsx", "components/NotePreviewView.tsx", "components/VersionPanel.tsx",
];

/** 剥注释；**保留换行与行号**（把注释字符换成空格而不是删除 —— 删了会让后面所有行号前移） */
const stripComments = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^([ \t]*)\/\/.*$/gm, "$1");
const read = (rel: string): string =>
  stripComments(readFileSync(join(SRC, ...rel.split("/")), "utf8").replace(/\r\n/g, "\n"));

const textOf = (testId: string): string => screen.getByTestId(testId).textContent ?? "";
const click = (testId: string): void => { fireEvent.click(screen.getByTestId(testId)); };

/**
 * 弹层按 **DOM 边界**切段（顺序 = 标题 · message · 逐条 impact · 取消 · 确认），供 `toEqual` **逐段恰等**
 * —— 这就是 I-1 的牙：段数、顺序、每段字面量全恰等，「改一个字 / 追加一句」必红。⚠️ 原语侧装饰（关闭钮 +
 * 印章）**不入段**（不属 T11 迁的文案），但由**总长守卫**单独记账 ⇒ 任何未记账字符同样必红。
 */
function segmentsOf(testId: string): string[] {
  const panel = screen.getByTestId(testId);
  const q = (sel: string): Element | null => panel.querySelector(sel);
  const body = q(".ed-confirm");
  const seal = q(".ed-confirm-seal");
  const ul = q("ul.ed-confirm-impacts");
  const kids = body === null ? [] : Array.from(body.children).filter((c) => c !== seal && c !== ul);
  const lis = ul === null ? [] : Array.from(ul.querySelectorAll("li"));
  const chrome = `${q(".ed-modal-head > button")?.textContent ?? ""}${seal?.textContent ?? ""}`;
  const segs = [q(".ed-modal-head > div"), ...kids, ...lis,
    screen.getByTestId(`${testId}-cancel`), screen.getByTestId(`${testId}-confirm`)].map((n) => n?.textContent ?? "");
  expect(panel.textContent?.length, `弹层里有未记账的字符：${panel.textContent}`).toBe(segs.join("").length + chrome.length);
  return segs;
}

const PROVIDER = {
  id: "p1", name: "DeepSeek", kind: "openAiCompat", baseUrl: "https://api.deepseek.com/v1",
  models: ["deepseek-flash"], defaultModel: "deepseek-flash", enabled: true, fallbackOrder: [], isDefault: false, hasKey: true,
};
const PREVIEW = {
  title: "", markdown: "# 标题\n正文", kept: [{}], ocr_points: [], ocr_screens: [],
  stats: { ui_junk: 0, duplicates: 0, fragments: 0, low_confidence: 0, filler: 0, transition: 0, rhetorical: 0, verbal: 0, ai_delete: 0, chapters: 0 },
  filtered: [{ segment_id: 1, start_ms: 0, reason: "filler", text: "嗯" }], merged: [],
};
const VERSIONS = [
  { id: 11, noteId: 1, content: "A", source: "rule", parentId: null, createdAt: 1700000000, meta: {} },
  { id: 12, noteId: 1, content: "B", source: "user-edit", parentId: 11, createdAt: 1700003600, meta: {} },
];
/** 目标详情桩：只有 `status` 会变（`graduated` 走另一条 `window.confirm` 文案分支） */
const goalDetail = (status: string) => ({
  goal: { name: "高数", status, domainTag: null, createdAt: 0 }, criteria: [], milestones: [], groups: [],
  declaration: "声明", progress: { progress: { percent: 10 }, statement: "", ready: false, checks: [] },
});

/** invoke 桩：一次装全部命令（`goalStatus` 供 GoalDetail 两条分支切换）。
 *  ⚠️ 同时 `mockClear()`：`not.toHaveBeenCalledWith` 看的是**全部历史调用** ——
 *  同一用例里先后跑两条分支时，前半段合法的那次 invoke 会让后半段的「取消不 invoke」假红。 */
function installInvoke(goalStatus = "active"): void {
  invokeMock.mockClear();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "ai_provider_list": return [PROVIDER];
      case "ai_provider_presets": return [];
      case "get_goal_detail": return goalDetail(goalStatus);
      case "get_goal_progress": return { progress: { percent: 10, weakGroups: [] }, statement: "", ready: false };
      case "list_note_groups": case "goal_concept_weakness": case "note_versions_usage": case "note_versions_diff": return [];
      case "backup_restore": return 3;
      case "preview_session_note": return PREVIEW;
      case "text_filter_status": return { enabled: true, model: "deepseek-flash", batchSize: 0, quotaRemaining: 0, mock: false };
      case "session_images_base_url": case "app_data_dir": return "";
      case "note_by_session": return null;
      case "ai_get_settings": return { enabled: false, hasKey: false };
      case "note_versions_list": return VERSIONS;
      case "note_versions_rollback": return { id: 13 };
      default: return null;
    }
  });
}

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
  installInvoke();
});
afterEach(() => cleanup());

describe("① 六个文件里 window.confirm( 归零（剥注释后判）", () => {
  it("六个文件都不含 window.confirm 调用，且仪器能命中已知存在的样本", () => {
    // 仪器自证（阳性 / 阴性）：没有这两条，「0 命中」可能只是正则坏了
    expect(WINDOW_CONFIRM.test('if (!window.confirm("x")) return;'), "阳性样本未命中 —— 仪器坏了").toBe(true);
    expect(WINDOW_CONFIRM.test('if (!window.confirmish("x")) return;'), "把 confirmish 误判成 confirm").toBe(false);
    expect(WINDOW_CONFIRM.test('const ok = await confirm("x");'), "裸 confirm 被误算成 window.confirm").toBe(false);
    for (const f of SIX) expect(WINDOW_CONFIRM.test(read(f)), `${f} 仍在用 window.confirm`).toBe(false);
  });
});

describe("② 六个文件都走 barrel 导入 ConfirmDialog（ADR-033 §1）", () => {
  it("import 自 ../ui/primitives，且没有深导入 ConfirmDialog", () => {
    expect(read(SIX[0]).includes('from "../ui/primitives"'), "阳性样本：AiProviderSettings 无 barrel 导入").toBe(true);
    for (const f of SIX) {
      const code = read(f);
      expect(code.includes('from "../ui/primitives"'), `${f} 未走 barrel`).toBe(true);
      expect(code.includes('from "../ui/primitives/ConfirmDialog"'), `${f} 深导入了 ConfirmDialog`).toBe(false);
    }
  });
});

describe("③ 迁移点都传了 impacts（§5.3）+ 都接了 busy（重复点击门）", () => {
  it("六文件：impacts= 至少 1 处；每个 <ConfirmDialog> 块内都有 busy=", () => {
    for (const f of SIX) {
      const code = read(f);
      expect(code.split("impacts={").length - 1, `${f} 没有传 impacts`).toBeGreaterThanOrEqual(1);
      const blocks = code.match(/<ConfirmDialog[\s\S]*?\/>/g) ?? [];
      expect(blocks.length, `${f} 没有 ConfirmDialog 实例`).toBeGreaterThanOrEqual(1);
      for (const b of blocks) expect(b.includes("busy={"), `${f} 的 ConfirmDialog 没接 busy`).toBe(true);
    }
  });
});

describe("④ 全仓剩余 window.confirm 命中 == 例外集（预期空）", () => {
  it("app/src/** 逐行扫描（含测试；排除本文件自身）", () => {
    const scanned: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(join(SRC, ...dir.split("/")))) {
        const next = dir === "" ? name : `${dir}/${name}`;
        if (statSync(join(SRC, ...next.split("/"))).isDirectory()) walk(next);
        else if (/\.tsx?$/.test(name)) scanned.push(next);
      }
    };
    walk("");
    expect(scanned.length, "扫描域为空 —— 仪器坏了").toBeGreaterThan(100);
    const hits: string[] = [];
    for (const rel of scanned) {
      if (rel === SELF) continue;
      read(rel).split("\n").forEach((line, i) => { if (WINDOW_CONFIRM.test(line)) hits.push(`${rel}:${i + 1}`); });
    }
    expect(hits).toEqual(WINDOW_CONFIRM_EXCEPTIONS);
    // 域自证：本文件自己的合成夹具**确实**会被这条正则命中（被 SELF 排除才没进 hits）
    expect(WINDOW_CONFIRM.test(read(SELF)), "本文件的阳性夹具没被读到 —— SELF 排除掩盖了空真").toBe(true);
  });
});

describe("⑤ 逐处渲染：确认 / 取消两条分支 + 文案逐段恰等", () => {
  it("段切分仪器自检：原语装饰不入段 · 总长守卫把「关闭」+ 印章单独记账（防恒真）", async () => {
    const { container } = render(<BackupPanel />);
    openMock.mockResolvedValue("C:/b.zip");
    fireEvent.click(within(container).getByText("从备份恢复…"));
    await screen.findByTestId("backup-restore-confirm");
    const segs = segmentsOf("backup-restore-confirm");
    expect(segs, "少切 / 多切了段（切分仪器坏了）").toHaveLength(4);
    expect(segs.join(""), "切分没按 DOM 边界：原语装饰混进了段").not.toContain("慎");
    expect(textOf("backup-restore-confirm").length, "总长守卫的装饰项不是「关闭」+「慎」这 3 个字符").toBe(segs.join("").length + 3);
  });

  it("AiProviderSettings：删 Provider / 清密钥（2 处）", async () => {
    const { container } = render(<AiProviderSettings />);
    await screen.findByText("DeepSeek");
    const trigger = (label: string): void => { fireEvent.click(within(container).getByText(label)); };

    trigger("删除");
    expect(segmentsOf("ai-provider-danger-confirm")).toEqual(["确定删除？", "删除后该 Provider 配置与密钥将永久清除，且不可恢复。", "Provider 配置与密钥将永久清除", "其它 Provider 不受影响", "取消", "删除"]);
    click("ai-provider-danger-confirm-cancel");
    expect(invokeMock).not.toHaveBeenCalledWith("ai_provider_remove", expect.anything());

    trigger("清除密钥");
    expect(segmentsOf("ai-provider-danger-confirm")).toEqual(["确定清除？", "清除后密钥不可恢复（需重新输入）。", "端点与模型列表保留", "取消", "清除"]);
    click("ai-provider-danger-confirm-cancel");
    expect(invokeMock).not.toHaveBeenCalledWith("ai_provider_clear_key", expect.anything());

    trigger("删除");
    click("ai-provider-danger-confirm-confirm");
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("ai_provider_remove", { id: "p1" }));
    trigger("清除密钥");
    click("ai-provider-danger-confirm-confirm");
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("ai_provider_clear_key", { id: "p1" }));
  });

  it("BackupPanel：选文件后确认才恢复（取消不 invoke）；原文案逐字", async () => {
    const { container } = render(<BackupPanel />);
    openMock.mockResolvedValue("C:/b.zip");
    fireEvent.click(within(container).getByText("从备份恢复…"));
    await screen.findByTestId("backup-restore-confirm");
    expect(segmentsOf("backup-restore-confirm")).toEqual(["恢复将覆盖当前全部数据", "现有数据库改名 .pre-restore 兜底", "取消", "继续"]);
    click("backup-restore-confirm-cancel");
    expect(invokeMock).not.toHaveBeenCalledWith("backup_restore", expect.anything());
    // 再选一次并确认 ⇒ 同一条 invoke（实参 = 选中的路径）
    fireEvent.click(within(container).getByText("从备份恢复…"));
    await waitFor(() => expect(screen.getByTestId("backup-restore-confirm-confirm")).toBeTruthy());
    click("backup-restore-confirm-confirm");
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("backup_restore", { archivePath: "C:/b.zip" }));
  });

  it("GoalDetail：删除两条分支（已毕业 / 未毕业）文案各异，取消不 invoke", async () => {
    const onDeleted = vi.fn();
    const { container, unmount } = render(<GoalDetail goalId={7} onChanged={vi.fn()} onDeleted={onDeleted} />);
    await screen.findByTestId("goal-detail");
    fireEvent.click(within(container).getByTestId("goal-delete-open"));
    expect(segmentsOf("goal-delete-confirm")).toEqual(["确定删除目标「高数」？", "里程碑与绑定将一并移除", "组本身不受影响", "取消", "删除"]);
    click("goal-delete-confirm-cancel");
    expect(invokeMock).not.toHaveBeenCalledWith("delete_goal", expect.anything());
    fireEvent.click(within(container).getByTestId("goal-delete-open"));
    click("goal-delete-confirm-confirm");
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("delete_goal", { id: 7 }));
    expect(onDeleted).toHaveBeenCalled();
    unmount();

    // 已毕业分支：同一弹层换文案（原文第二条 window.confirm）
    installInvoke("graduated");
    const g = render(<GoalDetail goalId={8} onChanged={vi.fn()} onDeleted={vi.fn()} />);
    await screen.findByTestId("goal-detail");
    fireEvent.click(within(g.container).getByTestId("goal-delete-open"));
    expect(segmentsOf("goal-delete-confirm")).toEqual(["确定删除已毕业目标「高数」？", "毕业报告快照仍会在「毕业档案」保留", "取消", "删除"]);
    expect(textOf("goal-delete-confirm").includes("里程碑与绑定将一并移除"), "已毕业分支串了未毕业文案").toBe(false);
    click("goal-delete-confirm-cancel");
    expect(invokeMock).not.toHaveBeenCalledWith("delete_goal", expect.anything());
  });

  it("NotePreviewView：AI 复核授权——取消有副作用且不 invoke；确认才 invoke", async () => {
    const { container } = render(<NotePreviewView sessionId={5} />);
    const trigger = (): void => { fireEvent.click(within(container).getByText("✨ AI 复核")); };
    await waitFor(() => expect(within(container).queryByText("✨ AI 复核")).not.toBeNull());
    trigger();
    expect(segmentsOf("ai-review-confirm")).toEqual(["是否继续？", "将发送 1 段边界文本至 DeepSeek（模型 deepseek-flash）进行删除/保留/合并判定。", "进行删除/保留/合并判定", "纯规则结果原样输出", "取消", "继续"]);
    click("ai-review-confirm-cancel");
    expect(invokeMock).not.toHaveBeenCalledWith("review_text_filter", expect.anything());
    // 取消路径的**副作用**（原 window.confirm 返回 false 的那条分支）：状态文案必须还在
    expect(container.textContent).toContain("已取消（预览保持纯规则结果）");
    trigger();
    click("ai-review-confirm-confirm");
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("review_text_filter", { sessionId: 5, authorized: true }));
  });

  it("VersionPanel：回滚确认——取消不 invoke；确认带 targetVersionId", async () => {
    const onChanged = vi.fn();
    const { container } = render(<VersionPanel noteId={1} onChanged={onChanged} />);
    fireEvent.click(within(container).getByText(/版本时间线/));
    const trigger = await within(container).findByText("回滚到此处");
    fireEvent.click(trigger);
    const segs = segmentsOf("version-rollback-confirm");
    expect(segs.slice(1), "第 0 段是运行时插值标题（`fmtTime` 走本地时区）").toEqual(["将创建新版本", "历史链保留", "取消", "回滚"]);
    expect(segs[0]).toMatch(/^回滚到「本地规则」版本（\d{4}-\d{2}-\d{2} \d{2}:\d{2}）？$/);
    click("version-rollback-confirm-cancel");
    expect(invokeMock).not.toHaveBeenCalledWith("note_versions_rollback", expect.anything());
    fireEvent.click(within(container).getByText("回滚到此处"));
    click("version-rollback-confirm-confirm");
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("note_versions_rollback", { noteId: 1, targetVersionId: 11 }));
  });
});
