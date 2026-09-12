// @vitest-environment jsdom
/**
 * NotesReadingColumn.views.test.tsx — 笔记**视图宿主**的行为级契约（批 5 T14；C4/C7/C11 + 规格 §7.3）。
 *
 * @ai-context 判据编号照计划 Task 14 Step 3 的 F1–F9 逐条兑现，另加 F8b（`views` 缺席的退化分支，
 *   控制方 2026-09-12 裁决 (A) 的第 4 条条件要求「可判、不静默」）与 F10（宿主接线零取数）。
 *   F1 **阻断**（C4 逐字）：注入 `flushSave` **reject** 的 `editorRef` ⇒ ① `aria-pressed` 为真的段**未变**
 *      ② 目标视图**未挂载** ③ `role="alert"` 错误行渲染 ④（本文件补强）**记忆未写** —— ④ 把
 *      「未挂载」与「惰性 chunk 还没到」区分开：切换若真的发生，`setViewKey` 会写 `view:default:note`。
 *   F2 **正向**：`flushSave` resolve ⇒ 切换发生 + 目标视图挂载 + **无**错误行。
 *   F3 **非编辑态直通**：`editorRef.current === null` ⇒ `await undefined` 直接通过（先例 = 计划判据 F3）。
 *   F4 **提示不用 toast**（C4 明确拒绝）：全过程 `.ed-toast` / `[data-testid*=toast]` **0 命中**；
 *      **阳性对照**在同一文件里渲染一个真 `Toast` ⇒ 同一选择器**必命中 1**（仪器双侧自证）。
 *   F5 **原文常驻（§7.3①）**：切到 `cardflow` ⇒ 正文片段仍在 DOM **且** 原文子树的 DOM **节点同一性**
 *      不变（`===` 引用相等 = 没被卸载重挂 —— 比"挂载计数"更直接，且不依赖探针组件）。
 *   F6 **惰性 + 卸载（§7.3②）**：切到 `cardflow` ⇒ 其挂载；切回 ⇒ 其**不在 DOM**；且记忆（C5 键口径）
 *      落盘并在**卸载重挂**后恢复（记忆是读路径，不只是写路径）。
 *   F7 **C11 槽位**：`[data-view-error-slot]` 恰 1 个、`textContent === ""`、位置在**切换器之后**。
 *   F8 **空态不写记忆**：`selected === null` ⇒ 切换器 0 个 ∧ `localStorage` 无 `view:default:note`。
 *   F8b **`views` 缺席退化**：不渲染切换器、原文照常在、不写记忆（不静默白屏）。
 *   F9 **既有断言原样绿**：由 V1 命令 + `git diff --numstat`（四个文件**零改动**）证明，不在本文件复制。
 *   F10 **宿主的切换动作零取数**：切换前后 `invoke` 调用数 **Δ=0**；同一条判据里断言 spy **有牙**
 *      （挂载期 `VersionPanel` 的既有边让它 > 0）—— 否则「Δ=0」可能是空真（§7.1 依赖方向）。
 *
 * @ai-context 两条仪器边界（都是本批已入册的坑）：
 *   ① `RichEditorView` 用 `vi.mock` 换成**不含 `useImperativeHandle` 的替身** —— 真身会在挂载时
 *      **覆盖** `editorRef.current`，使「注入的 handle」无法被观察到。替身只是**按 `NoteEditHandle`
 *      契约**（F1 里有一处 `const h: NoteEditHandle = …` 的编译期锚）承载注入值；C7 逐字禁止改
 *      `RichEditorView`/`NoteEditView`，故**不改真身**。
 *   ② 本文件必须写出 `@tauri-apps/api/core` 的模块 id 字面量（`vi.mock`）—— 一切按源码扫描的
 *      文字判据都应排除 `*.test.tsx`（T12 的口径），本文件不参与那类判据。
 * 副作用：只挂 React 树 + 读写 jsdom 的 `localStorage`；不写盘、不发请求。
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../../types";
import type { NoteEditHandle } from "../NoteEditView";
import type { NoteViewSlot, ViewSpec } from "../../views/registry";
import { viewsFor } from "../../views/registry";
import { columnSpec } from "../../shell/columnRegistry";
import { useColumnLayout } from "../../hooks/useColumnLayout";
import { Toast } from "../../ui/primitives";
import NotesReadingColumn from "./NotesReadingColumn";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));
vi.mock("../RichEditorView", () => ({ default: () => <div data-testid="editor-stub" /> }));

const note: Note = {
  id: 1,
  title: "标题",
  content: "# 正文\n内容段落",
  source: "session",
  session_id: 42,
  rule_version: null,
  purify_stats: null,
  tags: "[]",
  properties: null,
  pin: 0,
  group_id: null,
  created_at: 1,
  updated_at: 2,
};

const noop = vi.fn();
const MEMORY_KEY = "view:default:note";

/** 注入的编辑器出口（`NoteEditHandle` 契约一字未改 —— 这行是 C4「不改接口」的编译期锚） */
function handleOf(flushSave: () => Promise<void>): NoteEditHandle {
  return { flushSave, getContent: () => note.content };
}

interface HarnessProps {
  readonly views?: readonly ViewSpec<NoteViewSlot>[];
  readonly editing?: boolean;
  readonly selected?: Note | null;
  readonly handle?: NoteEditHandle | null;
}

/** 页面形态的宿主：真 `useColumnLayout` + 真注册表清单（与 `NotesPage` 的那一行同源） */
function Harness({ views = viewsFor("note"), editing = false, selected = note, handle = null }: HarnessProps) {
  const outlineCol = useColumnLayout("notes-outline", columnSpec("notes-outline"));
  const editorRef = useRef<NoteEditHandle | null>(handle);
  return (
    <NotesReadingColumn
      selected={selected}
      editing={editing}
      setEditing={noop}
      readerSearch={null}
      noteColors={{}}
      groups={[]}
      editorRef={editorRef}
      outlineCol={outlineCol}
      onChanged={noop}
      onError={noop}
      onOpenAi={noop}
      onOpenModelCard={noop}
      onSelectionAction={noop}
      onPinToggle={noop}
      onDelete={noop}
      onTaskToggle={noop}
      onTagClick={noop}
      onImageOpen={noop}
      onCleanNotice={noop}
      views={views}
    />
  );
}

/** 当前 `aria-pressed` 为真的段文本（= 切换器的受控值；`ViewSwitcher` 用 `aria-pressed` 承载选中态） */
const pressedLabel = (): string => {
  const pressed = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true");
  expect(pressed, "恰有一个段处于按下态（aria-pressed 是选中态的唯一权威）").toHaveLength(1);
  return pressed[0].textContent ?? "";
};

const clickSegment = async (label: string): Promise<void> => {
  const seg = screen.getByText(label, { selector: "button" });
  await act(async () => {
    fireEvent.click(seg);
  });
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
  window.localStorage.clear();
  // 规格 §1 决策 17 默认窗宽 1280（= 大纲列阈值）⇒ 不自动折叠，原文子树完整（同 outline.test 口径）
  window.innerWidth = 1280;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.innerWidth = 1024;
});

describe("笔记视图宿主（批 5 T14 · C4 阻断 / §7.3 三条硬约束 / C11 槽位）", () => {
  it("F0 阳性对照：注入的清单真的进到切换器（两段、可访问名、受控值 = 原文）", () => {
    render(<Harness />);
    const group = screen.getByTestId("note-view-switcher");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("笔记视图");
    expect(screen.getByText("原文", { selector: "button" })).toBeTruthy();
    expect(screen.getByText("卡片流", { selector: "button" })).toBeTruthy();
    expect(pressedLabel()).toBe("原文");
  });

  it("F1 阻断（C4）：flushSave reject ⇒ 值未变 + 目标视图未挂载 + role=alert + 记忆未写", async () => {
    const flushSave = vi.fn(() => Promise.reject(new Error("boom")));
    render(<Harness editing handle={handleOf(flushSave)} />);
    expect(screen.getByTestId("editor-stub"), "编辑态：编辑器替身在位（被观察的 handle 就是这个出口）").toBeTruthy();

    await clickSegment("卡片流");

    // ① 受控值未变
    expect(pressedLabel()).toBe("原文");
    // ③ 就近错误行（`role="alert"` 由 StatusLine 的 error 档给）
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-testid")).toBe("note-view-error");
    expect(alert.textContent).toContain("保存失败");
    // ② 目标视图未挂载 + ④ 记忆未写（把「未挂载」与「惰性 chunk 未到」区分开）
    await act(async () => {});
    expect(screen.queryByTestId("note-card-flow")).toBeNull();
    expect(window.localStorage.getItem(MEMORY_KEY)).toBeNull();
    // 守卫确实调了 flushSave（不是"没调所以没事"）
    expect(flushSave).toHaveBeenCalledTimes(1);
    // 阻断期结束 ⇒ 整组恢复可用（不是永久禁用）
    expect(screen.getByText("原文", { selector: "button" })).toHaveProperty("disabled", false);
  });

  it("F2 正向：flushSave resolve ⇒ 切换发生 + 目标视图挂载 + 无错误行", async () => {
    const flushSave = vi.fn(() => Promise.resolve());
    render(<Harness editing handle={handleOf(flushSave)} />);
    await clickSegment("卡片流");
    expect(await screen.findByTestId("note-card-flow")).toBeTruthy();
    expect(pressedLabel()).toBe("卡片流");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(flushSave).toHaveBeenCalledTimes(1);
  });

  it("F3 非编辑态直通：editorRef.current === null ⇒ 切换不被阻塞", async () => {
    // `editing=false` ⇒ NoteReadingView 不渲染编辑槽 ⇒ ref 保持 null（生产形态，不是造假）
    render(<Harness />);
    await clickSegment("卡片流");
    expect(await screen.findByTestId("note-card-flow")).toBeTruthy();
    expect(pressedLabel()).toBe("卡片流");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("F4 提示不用 toast（C4）：阻断全过程 0 个 toast 节点（并证明选择器有牙）", async () => {
    const { container } = render(<Harness editing handle={handleOf(() => Promise.reject(new Error("boom")))} />);
    await clickSegment("卡片流");
    const TOAST_SEL = ".ed-toast, [data-testid*=toast]";
    expect(screen.getByRole("alert"), "阻断提示必须可见（否则这条判据会被「什么都不渲染」蒙过）").toBeTruthy();
    expect(container.querySelectorAll(TOAST_SEL), "阻断提示用了 toast（C4 逐字拒绝）").toHaveLength(0);
    // 仪器自证：同一选择器对**一个真 Toast** 必须命中恰 1（否则上面那个 0 是空真）
    cleanup();
    const probe = render(<Toast open kind="err" message="探针" onDismiss={noop} testId="probe-toast" />);
    await waitFor(() => expect(probe.container.querySelectorAll(TOAST_SEL), "选择器抓不到已知存在的 toast ⇒ 上面的 0 不可信").toHaveLength(1));
  });

  it("F5 原文常驻（§7.3①）：切到 cardflow 后正文仍在 DOM，且原文子树节点同一性不变", async () => {
    render(<Harness handle={null} />);
    const resident = screen.getByTestId("note-resident-view");
    const before = screen.getByTestId("outline-panel");
    // 断言**限定在常驻容器内**：切到卡片流后同一段文字会出现两次（原文 + 卡片各一次）
    expect(within(resident).getByText("内容段落")).toBeTruthy();
    await clickSegment("卡片流");
    const card = await screen.findByTestId("note-card-flow");
    // 内容仍在 DOM（不互斥卸载），且卡片流与原文**同时**在场
    expect(within(resident).getByText("内容段落")).toBeTruthy();
    expect(within(card).getByText("内容段落")).toBeTruthy();
    // 节点同一性：同一个 DOM 元素（=== ）⇒ 没有被卸载重挂（比计数更直接）
    expect(screen.getByTestId("outline-panel")).toBe(before);
    // 常驻容器只切 display
    expect((screen.getByTestId("note-resident-view") as HTMLElement).style.display).toBe("none");
  });

  it("F6 惰性 + 卸载（§7.3②）+ 记忆（C5）：切走 ⇒ 不在 DOM；卸载重挂 ⇒ 由记忆恢复", async () => {
    const first = render(<Harness />);
    await clickSegment("卡片流");
    expect(await screen.findByTestId("note-card-flow")).toBeTruthy();
    expect(window.localStorage.getItem(MEMORY_KEY)).toBe("cardflow");

    // 记忆是**读**路径：卸载重挂后仍停在卡片流（键口径 `view:default:note`）
    first.unmount();
    render(<Harness />);
    expect(pressedLabel()).toBe("卡片流");
    expect(await screen.findByTestId("note-card-flow")).toBeTruthy();

    // 切回原文 ⇒ 卡片流**不在 DOM**（卸载，不是 display:none）
    await clickSegment("原文");
    await waitFor(() => expect(screen.queryByTestId("note-card-flow")).toBeNull());
    expect((screen.getByTestId("note-resident-view") as HTMLElement).style.display).not.toBe("none");
  });

  it("F7 C11 槽位：恰 1 个、空、位置在切换器之后（与 SessionViewHost 逐字同形）", () => {
    const { container } = render(<Harness />);
    const slots = container.querySelectorAll("[data-view-error-slot]");
    expect(slots).toHaveLength(1);
    expect(slots[0].textContent).toBe("");
    expect(slots[0].className).toBe("ed-view-error-slot");
    const switcher = screen.getByTestId("note-view-switcher");
    // 切换器在槽位**之前** ⇒ 槽位在切换器之后（compareDocumentPosition 的 FOLLOWING 位）
    expect(switcher.compareDocumentPosition(slots[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("F8 空态不写记忆：selected === null ⇒ 切换器 0 个 ∧ localStorage 无键", () => {
    const { container } = render(<Harness selected={null} />);
    expect(screen.queryByTestId("note-view-switcher")).toBeNull();
    expect(container.querySelectorAll("[data-view-error-slot]")).toHaveLength(0);
    expect(screen.getByText("从左侧选择一条笔记查看")).toBeTruthy();
    expect(window.localStorage.getItem(MEMORY_KEY)).toBeNull();
  });

  it("F8b views 缺席的退化分支：单视图（原文）·不渲染切换器·不写记忆·不白屏", async () => {
    render(<Harness views={[]} />);
    expect(screen.queryByTestId("note-view-switcher")).toBeNull();
    expect(screen.getByText("内容段落"), "退化分支必须仍渲染原文（不许静默白屏）").toBeTruthy();
    expect((screen.getByTestId("note-resident-view") as HTMLElement).style.display).not.toBe("none");
    await act(async () => {});
    expect(window.localStorage.getItem(MEMORY_KEY)).toBeNull();
  });

  it("F10 宿主接线零取数：切换动作 invoke Δ=0（且 spy 有牙 —— 挂载期既有边 > 0）", async () => {
    render(<Harness />);
    await waitFor(() => expect(invokeMock.mock.calls.length).toBeGreaterThan(0));
    const before = invokeMock.mock.calls.length;
    await clickSegment("卡片流");
    expect(await screen.findByTestId("note-card-flow")).toBeTruthy();
    // 惰性 chunk 已解析、卡片流已挂载之后再看：切换这条路径自身 0 次 invoke（§7.1 依赖方向）
    await act(async () => {});
    expect(invokeMock.mock.calls.length).toBe(before);
  });
});
