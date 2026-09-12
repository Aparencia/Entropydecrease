// @vitest-environment jsdom
/**
 * @ai-context AI 侧栏列接线守卫（批 3 T9 / 规格 §6.2「AI 对话侧栏：接入列基础设施」+ M3）。
 *
 * Why 用**真执行器 + 真注册表规格**（不是给组件塞假 props）：本文件要证的正是
 *   「`useColumnLayout("chat-sidebar", columnSpec("chat-sidebar"))` 的结果真的走到了 DOM」
 *   —— 假 props 只能证明组件认这个 prop，证不了接线（同 `notes/NotesReadingColumn.outline.test.tsx` 口径）。
 *
 * 判据（每条都配了能红的变异体，见 task-9-report §变异体实测）：
 *   ① 未记忆时渲染宽度 = 注册表默认 260（接线前本组件写死 240 ⇒ 红）；
 *   ② localStorage 记的列宽 → 渲染宽度（写死宽度 ⇒ 记忆无效 ⇒ 红）；
 *   ③ 窄窗（< `BREAKPOINTS.twoCol`）自动折叠 → 26px 窄条；**点窄条走 expand() 能展开**
 *      （J1-3 死局形态：只翻 setManualFolded 则自动折叠下点了不展开 ⇒ 红）；
 *   ④ 手动折叠记忆 + 页面不注入任何 prop 时仍然自足（缺省不回落 240）。
 *
 * ⑤⑥⑦（2026-09-12 · T9 评审 I-1 修正 / 控制方裁决 e）：**拖拽手柄**。此前页面只
 *   散传宽度/折叠态/展开回调 ⇒ `resizeBy` 到不了 UI，注册表承诺的 200..320 是
 *   规格 §6.2 逐字点名的「假可调」；现改为列状态**整体**注入 + 手柄在本组件内渲染：
 *   ⑤ 手柄在（`data-testid="column-resizer"`，见 `ColumnResizer.tsx:60`）；
 *   ⑥ **拖拽真的改宽**（pointer 增量 → `resizeBy` → DOM `style.width`，含 max 夹取）；
 *   ⑦ 折叠态下手柄仍在（与 `notes/NotesGroupsColumn` 同款：手柄在折叠三元之外）；
 *   ⑧ 宽度与 `resizeBy` 都取自**注入的那个对象**（防「注入了却被忽略」的假接线）。
 *
 * ⚠️ 仪器边界：jsdom **不排版** —— 只判 `style.width` 与元素有无，**不判像素**（像素归 T14 探针）；
 *   且组件测试底座全局 `environment: "node"` ⇒ 首行必须是指令行（本行之上不得有注释）。
 *   本仓未装 jest-dom / user-event ⇒ 断言用原生 API、交互用 `fireEvent`；无 `globals`
 *   ⇒ 必须显式 `afterEach(cleanup)`（先例 `NoteColorPicker.test.tsx:11`）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useColumnLayout, type ColumnLayout } from "../hooks/useColumnLayout";
import { columnSpec } from "../shell/columnRegistry";
import ChatSidebar from "./ChatSidebar";
import type { ChatSidebarProps } from "./ChatSidebar";

const KEY = "chat-sidebar";
const base: Omit<ChatSidebarProps, "col"> = {
  sessions: [], tasks: [], activeChatId: null, activeTaskId: null,
  onSelectChat: vi.fn(), onSelectTask: vi.fn(), onNewChat: vi.fn(),
  onRenameChat: vi.fn(), onDeleteChat: vi.fn(),
  sessionTitles: new Map<number, string>(), noteTitles: new Map<number, string>(),
};

/** 页面形态的宿主：真 hook + 真注册表规格（= `ChatPage.tsx` 的那一行 + props 注入） */
function Harness() {
  const chatCol = useColumnLayout(KEY, columnSpec(KEY));
  return <ChatSidebar {...base} col={chatCol} />;
}

/** 展开态的根元素宽度（折叠态根元素是 ColumnBar 窄条，无 width 样式） */
const rootWidth = (el: HTMLElement | null) => el?.style.width ?? "";

beforeEach(() => {
  // jsdom 默认视口恰为 1024 < twoCol(1100) ⇒ 不显式声明会让每一列都静默变成折叠态
  // （批 3 T5 实测；1280 = 规格 §1 决策 17 的默认窗宽）。断言一条不改，改的只是测试环境。
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  // 与 `SelectionActionMenu.test.tsx` 同款：视口改动必须复原，否则同文件后续用例跑在错的窗口下
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
});

describe("ChatSidebar 列接线（规格 §6.2）", () => {
  it("① 未记忆时 = 注册表默认（260，接线前写死 240）", () => {
    expect(columnSpec(KEY).default).toBe(260); // 规格 §6.2 锚点（注册表被改错时先在这里红）
    const { container } = render(<Harness />);
    expect(rootWidth(container.firstElementChild as HTMLElement)).toBe("260px");
    expect(screen.queryByTestId("column-bar")).toBeNull();
  });

  it("② localStorage 记忆的列宽走到 DOM（写死宽度则记忆无效）", () => {
    window.localStorage.setItem(`layout:col-width:${KEY}`, "300");
    const { container } = render(<Harness />);
    expect(rootWidth(container.firstElementChild as HTMLElement)).toBe("300px");
  });

  it("③ 窄窗自动折叠渲染窄条；点窄条走 expand() 能展开", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
    const { container } = render(<Harness />);
    expect(screen.getByTestId("column-bar")).toBeTruthy();
    expect(container.firstElementChild?.getAttribute("data-testid")).toBe("column-bar");
    fireEvent.click(screen.getByTestId("column-bar"));
    expect(screen.queryByTestId("column-bar")).toBeNull();
    expect(rootWidth(container.firstElementChild as HTMLElement)).toBe("260px");
  });

  it("④ 手动折叠记忆生效；且页面零注入时组件仍自足（不回落 240）", () => {
    window.localStorage.setItem(`layout:col-fold:${KEY}`, "1");
    const folded = render(<Harness />);
    expect(screen.getByTestId("column-bar")).toBeTruthy();
    folded.unmount();
    // 2026-09-12（I-1 修正）：组件现在**自持**同 key 的列状态 ⇒ 上面写进去的手动折叠
    // 记忆会被兜底实例读回（渲染成窄条）。本条的判据是「宽度缺省来自注册表」，
    // 折记忆另由 ③⑦ 覆盖，故先清掉折叠记忆再验缺省宽度。
    window.localStorage.removeItem(`layout:col-fold:${KEY}`);
    const bare = render(<ChatSidebar {...base} />);
    expect(rootWidth(bare.container.firstElementChild as HTMLElement)).toBe(
      `${columnSpec(KEY).default}px`,
    );
  });

  it("⑤ 拖拽手柄接在侧栏上（I-1「假可调」修正：注册表承诺的 200..320 可达）", () => {
    window.localStorage.setItem(`layout:col-width:${KEY}`, "300");
    render(<Harness />);
    // 有且仅有一个手柄（页面不再自己渲染第二个——列随组件走）
    const handle = screen.getByTestId("column-resizer");
    expect(handle.getAttribute("role")).toBe("separator");
  });

  it("⑥ 拖手柄真的改宽（pointer 增量 → resizeBy → DOM 宽度；max 由 hook 夹取）", () => {
    const { container } = render(<Harness />);
    const handle = screen.getByTestId("column-resizer");
    expect(rootWidth(container.firstElementChild as HTMLElement)).toBe("260px");
    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(handle, { clientX: 140 }); // +40 ⇒ 300（增量语义：不是累计位移）
    fireEvent.pointerUp(handle);
    expect(rootWidth(container.firstElementChild as HTMLElement)).toBe("300px");
    // 注册表 max=320：再拖 +100 必须被 useColumnLayout 夹回 320（手柄旁路不了规格）
    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(handle, { clientX: 200 });
    fireEvent.pointerUp(handle);
    expect(rootWidth(container.firstElementChild as HTMLElement)).toBe("320px");
  });

  it("⑦ 折叠态下手柄仍在（与 notes/NotesGroupsColumn 同款：手柄在折叠三元之外）", () => {
    window.localStorage.setItem(`layout:col-fold:${KEY}`, "1");
    render(<Harness />);
    expect(screen.getByTestId("column-bar")).toBeTruthy();
    expect(screen.getByTestId("column-resizer")).toBeTruthy();
  });

  it("⑧ **注入的那个对象**就是真源（宽度与 resizeBy 都取自页面传的 col）", () => {
    // Why 造一个假对象（与 ①–⑦ 的「真 hook」口径互补）：Harness 与页面的 hook 同 key、
    // 同规格 ⇒ 它分不清「用了注入对象」与「自己另开了一份状态」。若要防
    // `const col = ownCol`（页面注入了却被忽略）这类假接线，必须让注入值**可区分**。
    const resizeBy = vi.fn();
    const injected: ColumnLayout = {
      width: 205, folded: false, manuallyFolded: false,
      resizeBy, resetWidth: vi.fn(), setManualFolded: vi.fn(), expand: vi.fn(),
    };
    const { container } = render(<ChatSidebar {...base} col={injected} />);
    expect(rootWidth(container.firstElementChild as HTMLElement)).toBe("205px");
    const handle = screen.getByTestId("column-resizer");
    fireEvent.pointerDown(handle, { clientX: 10 });
    fireEvent.pointerMove(handle, { clientX: 30 });
    fireEvent.pointerUp(handle);
    expect(resizeBy.mock.calls.map((c) => c[0])).toEqual([20]);
  });
});
