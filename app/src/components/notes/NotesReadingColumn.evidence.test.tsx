// @vitest-environment jsdom
/**
 * NotesReadingColumn.evidence.test.tsx — 第三视图（`evidence`）**经容器注入**的行为判据（批 8 T10）。
 *
 * @ai-context 为什么**另立新文件**（承 T10 卡片的授权「放不下就另立」）：`NotesReadingColumn.views.test.tsx`
 *   在 T7 拆件后 = 231 行，而本单元的判据要**真的把候选轨推进宿主**（夹具 + 断言 ≈ 40 行）⇒ 塞进原
 *   文件会把 F1–F11（既有 11 条，**逐字不许改**）挤到 300 行硬线附近，风险大于收益。原文件**零 hunk**。
 * @ai-context 本文件判据（编号续 `views.test.tsx` 的 F11，避免与既有编号撞车）：
 *   **F12 段落轨同源**（T10 的核心风险）：注入 `NoteEvidenceTracks`（**含 `lines`**）⇒ ① 第三视图
 *     挂载（键 `evidence` 真的路由到了 `EVIDENCE_LOAD`）② DOM 上的 `data-evidence-for` 序列 ==
 *     **注入的** `lines` 序列（`evidenceLinesOf` 的唯一派生处 ⇒ 容器与视图不各切一份、不错位）
 *     ③ 命中的候选带 `data-evidence-id`、容差外的段渲染「无证据」串 ⇒ 注入的**候选轨**真的在跑。
 *   **F13 原文不丢 + 惰性卸载**（规格 §7.3①②；T10 卡片的 F5/F6 同族）：在**候选轨已注入**的前提下
 *     切到第三视图再切回 `raw` ⇒ ① 常驻子树的 DOM **节点同一性**不变（`===`）② 第三视图**不在 DOM**
 *     （卸载，不是 `display:none`）③ 常驻层 `display` 复原 ④ 切回后 `data-evidence-for` 归零。
 * @ai-context 仪器边界：本文件必须写出 `@tauri-apps/api/core` 的模块 id 字面量（`vi.mock`）—— 一切
 *   「按源码扫描」的文字判据都应排除 `*.test.tsx`（T12 的口径），本文件不参与那类判据。
 * 副作用：只挂 React 树 + 读写 jsdom 的 `localStorage`；不写盘、不发请求（`invoke` 是可断言的 mock）。
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viewsFor } from "../../views/registry";
import type { NoteEvidenceTracks } from "../../views/note/NoteEvidenceTrackView";
import { evidenceLinesOf } from "../../views/note/NoteEvidenceTrackView";
import NotesPage from "../../pages/NotesPage";
import { HarnessHost, note, type HarnessProps } from "./readingColumnTestKit";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));
vi.mock("../RichEditorView", () => ({ default: () => <div data-testid="editor-stub" /> }));

/** 夹具正文：① 段锚在 5000 ms ⇒ 与候选 `{id:7,startMs:5000}` 命中 ② 段锚在 60000 ms ⇒ 容差（1000 ms）
 *  外 ⇒ 必须出显式「无证据」 ③ 段**无锚点** ⇒ 0 个 `EvidenceMatch`（E1 反向，T8 的既有契约）。 */
const CONTENT = "甲段 [⏱ 00:05]([[ts:5000]])\n\n乙段 [⏱ 01:00]([[ts:60000]])\n\n丙段无锚点";
const LINES = evidenceLinesOf(CONTENT);
/** 夹具自证（防空真）：3 段、序号连续 0..2（若 `evidenceLinesOf` 的口径变了，本文件当场红） */
const EXPECTED_INDEXES = ["0", "1", "2"];
const TRACKS: NoteEvidenceTracks = { segments: [{ id: 7, startMs: 5000 }], ocr: [], lines: LINES };

const Harness = (rest: Partial<HarnessProps>) => <HarnessHost views={viewsFor("note")} {...rest} />;

const clickSegment = async (label: string): Promise<void> => {
  await act(async () => {
    fireEvent.click(screen.getByText(label, { selector: "button" }));
  });
};

/** 第三视图内每个段落节点的 `data-evidence-for` 序列（顺序 = DOM 顺序 = 段落顺序，读的是**真 DOM**） */
const evidenceFors = (root: HTMLElement): string[] =>
  [...root.querySelectorAll("[data-evidence-for]")].map((el) => el.getAttribute("data-evidence-for") ?? "");

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
  window.localStorage.clear();
  // 规格 §1 决策 17 默认窗宽 1280（= 大纲列阈值）⇒ 不自动折叠，常驻子树完整（同 views.test 口径）
  window.innerWidth = 1280;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.innerWidth = 1024;
});

describe("F12/F13 第三视图经容器注入（批 8 T10 · §7.3①② · E1 的 DOM 面）", () => {
  it("F12 段落轨同源 + 候选轨在跑：data-evidence-for == 注入 lines；命中带 id、容差外出「无证据」", async () => {
    expect(LINES.map((l) => String(l.paragraphIndex)), "夹具自证：段落轨是 3 段、序号连续").toEqual(EXPECTED_INDEXES);
    const { container } = render(<Harness selected={{ ...note, content: CONTENT }} evidence={TRACKS} />);
    await clickSegment("证据");
    const panel = await screen.findByTestId("note-evidence-track");
    expect(container.querySelector("[data-evidence-for]"), "面板不在本次渲染的容器里（断言读错了树）").toBeTruthy();
    // ① 注入的 `lines` 真的被视图采用（容器是段落轨的派生方 ⇒ 两处不可能各切一份而错位）
    expect(evidenceFors(panel), "DOM 段落轨 != 注入的 lines（容器与视图各派生了一份 ⇒ paragraphIndex 会漂移）")
      .toEqual(LINES.map((l) => String(l.paragraphIndex)));
    expect(panel.querySelectorAll("[data-evidence-for]").length, "段落节点数 != 派生段落数（空行/标题行口径漂了）").toBe(CONTENT.split(/\n/).filter((t) => t.trim() !== "").length);
    // ② 候选轨（转写段轨）在跑：命中段有 id，容差外的段出显式「无证据」（E2 的两态都在）
    expect(panel.querySelector('[data-evidence-id="7"]'), "命中的转写段候选没渲染（注入的候选轨没进视图）").toBeTruthy();
    expect(within(panel).getByText("无证据"), "容差外段落必须出显式失配标记（不许静默取最近邻）").toBeTruthy();
    // ③ 无锚点段 = 一等状态：不渲染证据列、也不渲染任何告警（E1 反向）
    const rows = [...panel.querySelectorAll("[data-evidence-for]")];
    expect(rows[2].querySelectorAll("[data-evidence-cell]").length, "无锚点段渲染了证据列（E1 反向被破）").toBe(0);
    expect(rows[0].querySelectorAll("[data-evidence-cell]").length, "有锚点段没有证据列（E1 反向的另一半）").toBe(1);
    // ④ 注入面缺席的负对照：注册表直载态（无 `evidence`）⇒ 候选轨空 ⇒ 全部为「无证据」（不假装命中）
    cleanup();
    const bare = render(<Harness selected={{ ...note, content: CONTENT }} />);
    await clickSegment("证据");
    expect(within(await screen.findByTestId("note-evidence-track")).queryAllByText("无证据").length, "缺省候选轨必须全是显式「无证据」").toBeGreaterThan(0);
    expect(bare.container.querySelectorAll("[data-evidence-id]"), "缺省态凭空出现了命中 id").toHaveLength(0);
  });

  it("F13 原文不丢 + 惰性卸载：候选轨已注入时切走/切回，常驻子树节点同一性不变、第三视图卸载", async () => {
    render(<Harness evidence={TRACKS} />);
    const resident = screen.getByTestId("note-resident-view");
    const before = screen.getByTestId("outline-panel");
    expect(within(resident).getByText("内容段落"), "常驻原文子树的既有锚点").toBeTruthy();
    await clickSegment("证据");
    expect(await screen.findByTestId("note-evidence-track")).toBeTruthy();
    // 切走 ⇒ 第三视图**卸载**（不是 display:none）；常驻原文仍在 DOM 且节点同一性不变（§7.3①）
    await clickSegment("原文");
    await waitFor(() => expect(screen.queryByTestId("note-evidence-track")).toBeNull());
    expect(within(resident).getByText("内容段落"), "切回 raw 后原文丢了（§7.3① 被破）").toBeTruthy();
    expect(screen.getByTestId("outline-panel"), "常驻子树被卸载重挂（节点引用变了）").toBe(before);
    expect((screen.getByTestId("note-resident-view") as HTMLElement).style.display).not.toBe("none");
    expect(screen.queryAllByText("无证据"), "第三视图卸载后仍残留证据面").toHaveLength(0);
  });
});

/**
 * F14 —— **页面级畸形载荷判据**（T10 实测抓到的真缺陷的回归网）：`NotesPage` 的
 * `useNoteEvidence` 对 `get_session_detail` 的返回值**没有形状假设**。
 *
 * @ai-context 变异体（实测）：把 hook 里 `tracksOf` 的 `Array.isArray` 守卫换成裸 `detail.segments.map`
 *   ⇒ 本节红在**具名断言**（渲染期炸树 ⇒ 列表行文案查不到），而**不是**「看起来没问题」。
 * @ai-context 为什么这条必须落在页面级：缺陷的可见形态是「整棵 React 树被卸载」—— 组件级挂载
 *   （`HarnessHost`）永远拿不到 `null` 详情，只有在**真页面 + 真 hook** 的形态下才可达。
 * 副作用：与同目录 `NotesPage.test.tsx` 同款（只挂树 + mock IPC）；不写盘、不发请求。
 */
describe("F14 页面级：畸形 get_session_detail 载荷（null）⇒ 降级空轨、不炸树", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_note_groups": return [];
        case "list_fragments": return [];
        // 🔴 本用例的**全部要点**：详情命令回 null（老后端 / 局部失败 / mock 兜底的真实形态）
        case "get_session_detail": return null;
        // 正文带锚点 ⇒ 空候选轨下必然出显式「无证据」（缺省态的可判形态）
        case "list_notes": return [{ ...note, title: "畸形载荷笔记", content: "甲段 [⏱ 00:05]([[ts:5000]])" }];
        default: return [];
      }
    });
    window.innerWidth = 1280;
  });

  it("F14 详情回 null ⇒ 笔记仍可打开、阅读面仍在、第三视图渲染「无证据」（不白屏、不炸树）", async () => {
    render(<NotesPage />);
    fireEvent.click(await screen.findByText("畸形载荷笔记"));
    // ① 树没被炸：右栏标题（常驻原文子树的锚点）与列表行都还在
    expect(await screen.findByRole("heading", { name: "畸形载荷笔记" }), "畸形载荷把整棵笔记页炸掉了").toBeTruthy();
    // ② 第三视图可切、可渲染：候选轨为空 ⇒ 有锚点段出显式「无证据」，无锚点段 0 列 0 告警
    await clickSegment("证据");
    const panel = await screen.findByTestId("note-evidence-track");
    expect(within(panel).getAllByText("无证据").length, "畸形载荷必须降级成空候选轨（不许抛、不许假装命中）").toBeGreaterThan(0);
    expect(panel.querySelectorAll("[data-evidence-id]"), "畸形载荷下凭空出现了命中 id").toHaveLength(0);
    // ③ 段落轨仍在（空轨只影响候选轨，不影响段落面）：夹具正文 = 1 行 ⇒ 恰 1 个段落节点
    expect(panel.querySelectorAll("[data-evidence-for]").length, "畸形载荷把段落轨也带没了").toBe(1);
  });
});
