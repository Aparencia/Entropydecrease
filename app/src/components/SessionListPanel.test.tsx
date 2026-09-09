// @vitest-environment jsdom
/**
 * SessionListPanel.test.tsx — 会话列表面板交互测试（批 4；P2-9 组件覆盖 + P3-1/P3-2 回归）。
 *
 * @ai-context: 覆盖批 4 选择/批量交互矩阵——选择模式进出（按钮+Esc）、单击勾选、
 *              Ctrl 加/减、Shift 区间、折叠组全选**不含隐藏行**（P3-1 修复：
 *              全选口径=可见行序 visibleOrder 而非 filtered）、列表变化自动
 *              裁剪选集、批量删除 pending 防连点与成功清选集（P3-2）、批量转
 *              eligible 过滤。invoke 全 mock；数据为本地 props 零后端往返
 *              （面板数据驱动经 props——父层 invoke 不在本组件）。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CourseGroup, SessionListItem } from "../types";
import SessionListPanel from "./SessionListPanel";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  // 调用历史跨测试隔离（面板不 invoke——但搜索路径留 mock 完备性）
  invokeMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function item(id: number, title: string, over: Partial<SessionListItem["session"]> & { hasNote?: boolean; status?: string } = {}): SessionListItem {
  const { hasNote, status, ...rest } = over;
  return {
    session: { id, title, source_window: null, started_at: id * 1000, ended_at: id * 1000 + 500, status: status ?? "finished", kind: null, ...rest },
    hasContent: true,
    hasNote: hasNote ?? false,
    noteId: null,
    noteTitle: null,
    displayNo: id,
  };
}

function groupOf(course: string, ...rows: SessionListItem[]): CourseGroup {
  return { course, sessions: rows };
}

/** 可控 Promise（busy 窗口期模拟——invoke 未返回时连点） */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

interface Harness {
  onBatchConvert: ReturnType<typeof vi.fn>;
  onBatchDelete: ReturnType<typeof vi.fn>;
  onOpenDetail: ReturnType<typeof vi.fn>;
  showToast: ReturnType<typeof vi.fn>;
  rerender: (items: SessionListItem[], groups?: CourseGroup[] | null, grouped?: boolean) => void;
}

const DEFAULTS = {
  width: 320,
  groups: null,
  grouped: false,
  onToggleGrouped: () => {},
  loading: false,
  justFinished: 0,
  onDismissJustFinished: () => {},
  openSessionId: null,
  onOpenDetail: () => {},
  onConvert: () => {},
  onOpenNote: () => {},
  onBatchConvert: async () => {},
  onBatchDelete: async () => true,
  onDeleteOne: () => {},
  onSessionRenamed: () => {},
  showToast: () => {},
  onCollapse: () => {},
};

function renderPanel(items: SessionListItem[], groups: CourseGroup[] | null = null, grouped = false): Harness {
  const spies = {
    onBatchConvert: vi.fn(async () => {}),
    onBatchDelete: vi.fn(async () => true),
    onOpenDetail: vi.fn(),
    showToast: vi.fn(),
  };
  const view = render(
    <SessionListPanel
      {...DEFAULTS}
      items={items}
      groups={groups}
      grouped={grouped}
      onOpenDetail={spies.onOpenDetail}
      onBatchConvert={spies.onBatchConvert}
      onBatchDelete={spies.onBatchDelete}
      showToast={spies.showToast}
    />,
  );
  return {
    ...spies,
    rerender: (next, g2 = groups, grouped2 = grouped) =>
      view.rerender(
        <SessionListPanel
          {...DEFAULTS}
          items={next}
          groups={g2}
          grouped={grouped2}
          onOpenDetail={spies.onOpenDetail}
          onBatchConvert={spies.onBatchConvert}
          onBatchDelete={spies.onBatchDelete}
          showToast={spies.showToast}
        />,
      ),
  };
}

function selectedCountText(): string | null {
  // 批量栏固定文案「已选 N 个」——不存在=栏未渲染（空选集）
  const span = screen.queryByText(/^已选 \d+ 个$/);
  return span ? (span.textContent ?? null) : null;
}

describe("选择模式进出与行勾选", () => {
  it("进入/退出选择模式（按钮与 Esc 双路径）：退出后单击行=打开详情", () => {
    const h = renderPanel([item(1, "会话一"), item(2, "会话二"), item(3, "会话三")]);
    // 进入（按钮）→ 模式 chip 出现；单击行=勾选不打开详情
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    expect(screen.getByTestId("session-select-mode-chip").textContent).toContain("选择模式");
    fireEvent.click(screen.getByTestId("session-row-1"));
    expect(selectedCountText()).toBe("已选 1 个");
    expect(h.onOpenDetail).not.toHaveBeenCalled();
    // 再点按钮退出：chip 消失、选集清空
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    expect(screen.queryByTestId("session-select-mode-chip")).toBeNull();
    expect(selectedCountText()).toBeNull();
    // 普通单击=打开详情（无目标段参数——单参调用）
    fireEvent.click(screen.getByTestId("session-row-2"));
    expect(h.onOpenDetail).toHaveBeenCalledWith(2);
    // Esc 退出：重新进入 → 勾两行 → Esc 全部清空退出
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    fireEvent.click(screen.getByTestId("session-row-3"));
    expect(selectedCountText()).toBe("已选 1 个");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("session-select-mode-chip")).toBeNull();
    expect(selectedCountText()).toBeNull();
  });

  it("选择模式单击勾选/再点取消（toggle 语义）", () => {
    const h = renderPanel([item(1, "会话一"), item(2, "会话二")]);
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    fireEvent.click(screen.getByTestId("session-row-1"));
    fireEvent.click(screen.getByTestId("session-row-2"));
    expect(selectedCountText()).toBe("已选 2 个");
    // 再点行 1 = 取消勾选
    fireEvent.click(screen.getByTestId("session-row-1"));
    expect(selectedCountText()).toBe("已选 1 个");
    expect(h.onOpenDetail).not.toHaveBeenCalled();
  });
});

describe("修饰键多选（Ctrl 加/减、Shift 区间）", () => {
  it("Ctrl/⌘+单击=加/减单行，不打开详情", () => {
    const h = renderPanel([item(1, "a"), item(2, "b"), item(3, "c")]);
    fireEvent.click(screen.getByTestId("session-row-1"), { ctrlKey: true });
    expect(selectedCountText()).toBe("已选 1 个");
    fireEvent.click(screen.getByTestId("session-row-2"), { ctrlKey: true });
    expect(selectedCountText()).toBe("已选 2 个");
    fireEvent.click(screen.getByTestId("session-row-1"), { ctrlKey: true });
    expect(selectedCountText()).toBe("已选 1 个");
    expect(h.onOpenDetail).not.toHaveBeenCalled();
    // Esc 清多选（无选择模式也生效）
    fireEvent.keyDown(window, { key: "Escape" });
    expect(selectedCountText()).toBeNull();
  });

  it("Shift 区间=可见列表位置首尾并集（锚迁移）", () => {
    const h = renderPanel([1, 2, 3, 4, 5].map((i) => item(i, `会话${i}`)));
    // 首次 Shift=单选并设锚（行 5）
    fireEvent.click(screen.getByTestId("session-row-5"), { shiftKey: true });
    expect(selectedCountText()).toBe("已选 1 个");
    // 锚 5 → Shift 点 2：区间 [2..5] 并集
    fireEvent.click(screen.getByTestId("session-row-2"), { shiftKey: true });
    expect(selectedCountText()).toBe("已选 4 个");
    // 经批量删除参数断言精确成员（顺序无关）
    fireEvent.click(screen.getByText("批量删除"));
    expect(h.onBatchDelete).toHaveBeenCalledTimes(1);
    expect(new Set(h.onBatchDelete.mock.calls[0][0] as number[])).toEqual(new Set([2, 3, 4, 5]));
    expect(h.onOpenDetail).not.toHaveBeenCalled();
  });
});

describe("全选口径（P3-1：折叠组全选不含隐藏行）", () => {
  function groupedFixture() {
    const gA = groupOf("课程甲", item(1, "甲-1"), item(2, "甲-2"));
    const gB = groupOf("课程乙", item(3, "乙-1"), item(4, "乙-2"));
    const gC = groupOf("课程丙", item(5, "丙-1"), item(6, "丙-2"));
    const items = [...gA.sessions, ...gB.sessions, ...gC.sessions];
    return { gA, gB, gC, items };
  }

  it("折叠组后全选只含可见行（原 filtered 口径把隐藏行一并纳入的回归）", async () => {
    const { gA, gB, gC, items } = groupedFixture();
    const h = renderPanel(items, [gA, gB, gC], true);
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    // 先勾一行使批量栏（含全选框）出现
    fireEvent.click(screen.getByTestId("session-row-1"));
    expect(selectedCountText()).toBe("已选 1 个");
    // 折叠课程丙 → 丙行不可见（不渲染）
    fireEvent.click(screen.getByText(/课程丙（2）/));
    expect(screen.queryByTestId("session-row-5")).toBeNull();
    // Act：全选（基准=可见行序：甲 1-2 + 乙 3-4；丙行不可见不得纳入）
    fireEvent.click(screen.getByTestId("session-select-all"));
    expect(selectedCountText()).toBe("已选 4 个");
    const all = screen.getByTestId("session-select-all") as HTMLInputElement;
    expect(all.checked).toBe(true);
    // 批量删除参数=精确 4 个可见行（旧实现会把隐藏的 5/6 也送来）
    fireEvent.click(screen.getByText("批量删除"));
    expect(h.onBatchDelete).toHaveBeenCalledTimes(1);
    expect(new Set(h.onBatchDelete.mock.calls[0][0] as number[])).toEqual(new Set([1, 2, 3, 4]));
    // 成功 → 清选集：批量栏消失
    await waitFor(() => expect(selectedCountText()).toBeNull());
    // 全选后再点=清空（checkbox 满选态反转）
    fireEvent.click(screen.getByTestId("session-row-1"));
    fireEvent.click(screen.getByTestId("session-select-all"));
    expect(selectedCountText()).toBe("已选 4 个");
    fireEvent.click(screen.getByTestId("session-select-all"));
    expect(selectedCountText()).toBeNull();
  });
});

describe("选集自动裁剪与批量操作", () => {
  it("列表变化自动裁剪选集（行消失即从选集剔除；全空则栏消失）", async () => {
    const h = renderPanel([item(1, "a"), item(2, "b"), item(3, "c")]);
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    fireEvent.click(screen.getByTestId("session-row-1"));
    fireEvent.click(screen.getByTestId("session-row-2"));
    expect(selectedCountText()).toBe("已选 2 个");
    // 刷新后行 2 不存在（删除/筛选）→ 幽灵勾选被裁剪
    h.rerender([item(1, "a")]);
    await waitFor(() => expect(selectedCountText()).toBe("已选 1 个"));
    // 列表清空 → 选集空、批量栏消失（模式 chip 仍在——模式与选集解耦）
    h.rerender([]);
    await waitFor(() => expect(selectedCountText()).toBeNull());
    expect(screen.getByTestId("session-select-mode-chip")).toBeTruthy();
    // Esc 退出模式
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("session-select-mode-chip")).toBeNull();
  });

  it("批量删除 pending 禁用防连点（P3-2）且成功后清选集", async () => {
    const d = deferred<boolean>();
    const h = renderPanel([item(1, "a"), item(2, "b")]);
    h.onBatchDelete.mockImplementation(async () => { await d.promise; return true; });
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    fireEvent.click(screen.getByTestId("session-row-1"));
    fireEvent.click(screen.getByTestId("session-row-2"));
    expect(selectedCountText()).toBe("已选 2 个");
    // Act：点击批量删除（pending——confirm/invoke 未返回）
    fireEvent.click(screen.getByText("批量删除"));
    expect(h.onBatchDelete).toHaveBeenCalledTimes(1);
    const delBtn = screen.getByText("批量删除") as HTMLButtonElement;
    expect(delBtn.disabled).toBe(true);
    // 连点（disabled 期间浏览器不派发；即便派发 ref 同步拦截）→ 仍单次
    fireEvent.click(delBtn);
    expect(h.onBatchDelete).toHaveBeenCalledTimes(1);
    // pending 期间不清选集
    expect(selectedCountText()).toBe("已选 2 个");
    // 完成（成功）→ 清选集、批量栏消失
    await act(async () => { d.resolve(true); });
    await waitFor(() => expect(selectedCountText()).toBeNull());
  });

  it("批量删除失败保留选集（resolve=false 不清——父层报错后可重试）", async () => {
    const h = renderPanel([item(1, "a")]);
    h.onBatchDelete.mockResolvedValue(false);
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    fireEvent.click(screen.getByTestId("session-row-1"));
    fireEvent.click(screen.getByText("批量删除"));
    await waitFor(() => expect(h.onBatchDelete).toHaveBeenCalledTimes(1));
    expect(selectedCountText()).toBe("已选 1 个");
  });

  it("批量转笔记：过滤不可转（已转/进行中）只交可转 id", async () => {
    const rows = [
      item(1, "可转会话"),
      item(2, "已转会话", { hasNote: true }),
      item(3, "录制中", { status: "recording" }),
    ];
    const h = renderPanel(rows);
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    for (const id of [1, 2, 3]) fireEvent.click(screen.getByTestId(`session-row-${id}`));
    expect(selectedCountText()).toBe("已选 3 个");
    // Act：批量转（选中集含不可转——只发 eligible）
    fireEvent.click(screen.getByText("批量转笔记"));
    await waitFor(() => expect(h.onBatchConvert).toHaveBeenCalledTimes(1));
    expect(h.onBatchConvert.mock.calls[0][0]).toEqual([1]);
    // 选集已清（转前 clearSelection——批量栏消失）
    await waitFor(() => expect(selectedCountText()).toBeNull());
  });

  it("批量转：全不可转不 invoke 走 toast", () => {
    const h = renderPanel([
      item(2, "已转会话", { hasNote: true }),
      item(3, "录制中", { status: "recording" }),
    ]);
    fireEvent.click(screen.getByTestId("session-select-mode-btn"));
    fireEvent.click(screen.getByTestId("session-row-2"));
    fireEvent.click(screen.getByTestId("session-row-3"));
    fireEvent.click(screen.getByText("批量转笔记"));
    expect(h.onBatchConvert).not.toHaveBeenCalled();
    expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining("均不可转换"), "err");
    // 转换未发生——选集保留
    expect(selectedCountText()).toBe("已选 2 个");
  });
});
