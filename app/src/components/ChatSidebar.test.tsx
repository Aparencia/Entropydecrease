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
 * ⚠️ 仪器边界：jsdom **不排版** —— 只判 `style.width` 与元素有无，**不判像素**（像素归 T14 探针）；
 *   且组件测试底座全局 `environment: "node"` ⇒ 首行必须是指令行（本行之上不得有注释）。
 *   本仓未装 jest-dom / user-event ⇒ 断言用原生 API、交互用 `fireEvent`；无 `globals`
 *   ⇒ 必须显式 `afterEach(cleanup)`（先例 `NoteColorPicker.test.tsx:11`）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useColumnLayout } from "../hooks/useColumnLayout";
import { columnSpec } from "../shell/columnRegistry";
import ChatSidebar from "./ChatSidebar";
import type { ChatSidebarProps } from "./ChatSidebar";

const KEY = "chat-sidebar";
const base: Omit<ChatSidebarProps, "width" | "folded" | "onExpand"> = {
  sessions: [], tasks: [], activeChatId: null, activeTaskId: null,
  onSelectChat: vi.fn(), onSelectTask: vi.fn(), onNewChat: vi.fn(),
  onRenameChat: vi.fn(), onDeleteChat: vi.fn(),
  sessionTitles: new Map<number, string>(), noteTitles: new Map<number, string>(),
};

/** 页面形态的宿主：真 hook + 真注册表规格（= `ChatPage.tsx` 的那一行 + props 注入） */
function Harness() {
  const chatCol = useColumnLayout(KEY, columnSpec(KEY));
  return <ChatSidebar {...base} width={chatCol.width} folded={chatCol.folded} onExpand={chatCol.expand} />;
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
    const bare = render(<ChatSidebar {...base} />);
    expect(rootWidth(bare.container.firstElementChild as HTMLElement)).toBe(
      `${columnSpec(KEY).default}px`,
    );
  });
});
