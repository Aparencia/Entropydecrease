// @vitest-environment jsdom
/**
 * GroupSidebar.test.tsx — 组筛选侧栏 + ⓘ 弹层交互测试（v0.12.2 审查修复）。
 *
 * @ai-context: 覆盖串组场景——切换 ⓘ 弹层目标组时表单态必须重置（key=group.id
 *              修复）：组 A 改了判类（未确认）→ 点组 B ⓘ → 弹层显示 B 且
 *              判类下拉回到 B.kind（防把 A 的选择误用到 B——路径: 改判误操作）。
 *              invoke 全 mock（list_note_groups/count_due_cards/list_fragments/
 *              get_feature_flags/week_contract_status/list_knowledge_systems/
 *              list_knowledge_links）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NoteGroup } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import GroupSidebar from "./GroupSidebar";

const groupA: NoteGroup = {
  id: 1, name: "化妆课 A", terrain: "container", kind: "course", domainTag: null,
  source: "route", seriesKey: null, routeReason: null, routeOverridden: 0,
  noteCount: 3, createdAt: 0, updatedAt: 0,
};
const groupB: NoteGroup = {
  id: 2, name: "手账 B", terrain: "container", kind: "standalone", domainTag: null,
  source: "route", seriesKey: null, routeReason: null, routeOverridden: 0,
  noteCount: 1, createdAt: 0, updatedAt: 0,
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case "list_note_groups": return [groupA, groupB];
      case "count_due_cards": return 0;
      case "list_fragments": return [];
      case "get_feature_flags": return { feedCapture: true };
      case "week_contract_status":
        return { contract: null, weekStart: 0, actualDays: 0, actualCards: 0, minimalDayMet: false };
      case "list_knowledge_systems":
        return [{ id: 10, parentSystemId: null, name: "摄影", kind: "domain", coreQuestion: null, status: "active", createdAt: 0, updatedAt: 0 }];
      case "list_knowledge_links":
        // 后端强制 system_id（无全局查询）——仅体系 10 返回该组引用
        return args?.systemId === 10
          ? [{ id: 1, systemId: 10, nodeId: null, conceptId: null, modelId: null, targetType: "note_group", targetId: 1, createdAt: 0 }]
          : [];
      case "override_group_route": return true;
      case "move_note_to_group": return true;
      // 审查修复：ⓘ 弹层静默降级依赖的 mock 补齐（简报拉取 list_group_cards——原缺省
      // throw 依赖"简报静默降级"容错，测试通过≠mock 完备）
      case "list_group_cards": return [];
      case "create_topic_group": return { id: 99, name: args?.name ?? "新组", terrain: "container", kind: "topic", domainTag: args?.domainTag ?? "beauty", source: "manual", seriesKey: null, routeReason: null, routeOverridden: 0, noteCount: 0, createdAt: 0, updatedAt: 0 };
      case "update_group_color": return true;
      case "rename_note_group": return true;
      case "get_group_delete_impact":
        return { notes: 1, fragments: 0, cards: 0, settlements: 0, contracts: 0, systemRefs: 0 };
      case "delete_note_group": return true;
      default:
        throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

function renderSidebar() {
  return render(
    <GroupSidebar
      groupFilter={null}
      onGroupFilterChange={vi.fn()}
      onChanged={vi.fn()}
      onOpenReview={vi.fn()}
      selectedNoteId={null}
      onOpenInbox={vi.fn()}
      inboxActive={false}
      refreshToken={0}
      onOpenSystem={vi.fn()}
    />,
  );
}

describe("GroupSidebar ⓘ 弹层", () => {
  it("组行单击仅过滤（不展开）——组行与 ⓘ 为独立动作", async () => {
    const onGroupFilterChange = vi.fn();
    render(
      <GroupSidebar
        groupFilter={null}
        onGroupFilterChange={onGroupFilterChange}
        onChanged={vi.fn()}
        onOpenReview={vi.fn()}
        selectedNoteId={null}
        onOpenInbox={vi.fn()}
        inboxActive={false}
        refreshToken={0}
        onOpenSystem={vi.fn()}
      />,
    );
    await screen.findByTestId("group-row-1");
    // 单击组行 = 仅设置过滤（无展开动作——弹层不打开）
    fireEvent.click(screen.getByTestId("group-row-1"));
    expect(onGroupFilterChange).toHaveBeenCalledWith(1);
    expect(screen.queryByTestId("route-popover")).toBeNull();
    // ⓘ 才是弹层入口
    fireEvent.click(screen.getByTestId("group-info-1"));
    expect(await screen.findByTestId("route-popover")).toBeTruthy();
  });

  it("切换组时弹层表单态重置（A 的选择不串进 B）", async () => {
    renderSidebar();
    // 打开组 A（course）弹层，改判类为 topic（未确认）
    fireEvent.click(await screen.findByTestId("group-info-1"));
    const kindA = (await screen.findByTestId("override-kind")) as HTMLSelectElement;
    expect(kindA.value).toBe("course");
    fireEvent.change(kindA, { target: { value: "topic" } });

    // 切到组 B（standalone）——key 重建：表单态回到 B.kind
    fireEvent.click(screen.getByTestId("group-info-2"));
    const kindB = (await screen.findByTestId("override-kind")) as HTMLSelectElement;
    await waitFor(() => expect(kindB.value).toBe("standalone"));
    // 明细折叠态与结算计划同样重置
    expect(screen.queryByTestId("route-details")).toBeNull();
  });

  it("组行显示关联体系徽标并点击跳转（触点①）", async () => {
    const onOpenSystem = vi.fn();
    const onGroupFilterChange = vi.fn();
    render(
      <GroupSidebar
        groupFilter={null}
        onGroupFilterChange={onGroupFilterChange}
        onChanged={vi.fn()}
        onOpenReview={vi.fn()}
        selectedNoteId={null}
        onOpenInbox={vi.fn()}
        inboxActive={false}
        refreshToken={0}
        onOpenSystem={onOpenSystem}
      />,
    );
    await screen.findByTestId("group-row-1");
    const badge = await screen.findByTestId("system-badge");
    expect(badge.textContent).toContain("摄影");
    // 按体系聚合调用（后端 list_knowledge_links 强制 system_id）
    expect(invokeMock).toHaveBeenCalledWith("list_knowledge_links", { systemId: 10 });
    // 点击徽标跳体系页（stopPropagation——不触发组过滤）
    fireEvent.click(badge);
    expect(onOpenSystem).toHaveBeenCalledWith(10);
    expect(onGroupFilterChange).not.toHaveBeenCalled();
  });
});

describe("GroupSidebar v0.14 C1 Obsidian 式", () => {
  // 折叠/最近记忆跨测试残留（localStorage 不清空会串态——折叠态隐藏组行）
  beforeEach(() => localStorage.clear());

  it("组按 kind 分区渲染（空分区不显示）", async () => {
    renderSidebar();
    await screen.findByTestId("group-row-1");
    expect(screen.getByTestId("group-section-course")).toBeTruthy();
    expect(screen.getByTestId("group-section-standalone")).toBeTruthy();
    // 无 topic/feed 组 → 对应分区不渲染
    expect(screen.queryByTestId("group-section-topic")).toBeNull();
    expect(screen.queryByTestId("group-section-feed")).toBeNull();
  });

  it("折叠分区隐藏组行并写入 localStorage 记忆", async () => {
    localStorage.clear();
    renderSidebar();
    await screen.findByTestId("group-row-1");
    fireEvent.click(screen.getByTestId("section-toggle-course"));
    expect(screen.queryByTestId("group-row-1")).toBeNull();
    expect(localStorage.getItem("group-sidebar-folded:course")).toBe("1");
  });

  it("过滤关键词只显示匹配组（扁平结果无分区）", async () => {
    renderSidebar();
    await screen.findByTestId("group-row-1");
    fireEvent.change(screen.getByTestId("group-filter-input"), { target: { value: "手账" } });
    expect(screen.queryByTestId("group-row-1")).toBeNull();
    expect(screen.getByTestId("group-row-2")).toBeTruthy();
    expect(screen.queryByTestId("group-section-course")).toBeNull();
    // 清空过滤恢复分区
    fireEvent.change(screen.getByTestId("group-filter-input"), { target: { value: "" } });
    expect(screen.getByTestId("group-section-course")).toBeTruthy();
  });

  it("点击组行写入最近使用（LRU 存储 + 最近区显示）", async () => {
    localStorage.clear();
    renderSidebar();
    await screen.findByTestId("group-row-1");
    expect(screen.queryByTestId("recent-groups")).toBeNull();
    fireEvent.click(screen.getByTestId("group-row-1"));
    expect(JSON.parse(localStorage.getItem("group-sidebar-recent") ?? "[]")).toEqual([1]);
    expect(screen.getByTestId("recent-groups")).toBeTruthy();
  });

  it("拖拽笔记到组行 → move_note_to_group（noteId 来自 dataTransfer）", async () => {
    renderSidebar();
    await screen.findByTestId("group-row-1");
    const row = screen.getByTestId("group-row-1");
    fireEvent.dragOver(row, { dataTransfer: { types: ["text/note-id"] } });
    fireEvent.drop(row, { dataTransfer: { getData: () => "42" } });
    expect(invokeMock).toHaveBeenCalledWith("move_note_to_group", { noteId: 42, groupId: 1 });
  });

  it("拖拽归组失败显示提示（不吞错）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "move_note_to_group") throw new Error("group not found");
      if (cmd === "list_note_groups") return [groupA, groupB];
      if (cmd === "count_due_cards") return 0;
      if (cmd === "list_fragments") return [];
      if (cmd === "get_feature_flags") return { feedCapture: true };
      if (cmd === "week_contract_status") return { contract: null, weekStart: 0, actualDays: 0, actualCards: 0, minimalDayMet: false };
      if (cmd === "list_knowledge_systems") return [];
      if (cmd === "list_knowledge_links") return [];
      return true;
    });
    renderSidebar();
    await screen.findByTestId("group-row-1");
    fireEvent.drop(screen.getByTestId("group-row-1"), { dataTransfer: { getData: () => "42" } });
    expect(await screen.findByText(/归组失败/)).toBeTruthy();
  });
});

describe("GroupSidebar v0.14.1 新建/重命名", () => {
  beforeEach(() => localStorage.clear());

  it("「＋ 新建组」→ 弹窗校验拦截（空名/无领域），合法提交走 create→color→onChanged", async () => {
    // Arrange
    const onChanged = vi.fn();
    render(
      <GroupSidebar
        groupFilter={null}
        onGroupFilterChange={vi.fn()}
        onChanged={onChanged}
        onOpenReview={vi.fn()}
        selectedNoteId={null}
        onOpenInbox={vi.fn()}
        inboxActive={false}
        refreshToken={0}
        onOpenSystem={vi.fn()}
      />,
    );
    // Act：空名提交被拦截
    fireEvent.click(screen.getByTestId("group-create-open"));
    fireEvent.click(await screen.findByTestId("group-create-submit"));
    expect(screen.getByTestId("group-create-status").textContent).toContain("组名不能为空");
    // 填名不选领域 → 领域校验拦截
    fireEvent.change(screen.getByTestId("group-create-name"), { target: { value: "化妆美妆" } });
    fireEvent.click(screen.getByTestId("group-create-submit"));
    expect(screen.getByTestId("group-create-status").textContent).toContain("领域标签");
    // 合法提交（选领域 + 颜色）→ create_topic_group + update_group_color + onChanged
    fireEvent.change(screen.getByTestId("group-create-domain"), { target: { value: "beauty" } });
    // 审查修复（低6）：原用例注释声称覆盖颜色链路但从未点击色板——补真断言
    fireEvent.click(screen.getByTestId("color-teal"));
    expect(screen.getByTestId("group-create-color-set")).toBeTruthy();
    fireEvent.click(screen.getByTestId("group-create-submit"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("create_topic_group", { name: "化妆美妆", domainTag: "beauty" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("update_group_color", { id: 99, color: "teal" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // 成功反馈经 notice 区承载（弹窗已关——反馈上抛父级 status 区）
    expect(await screen.findByTestId("group-notice")).toBeTruthy();
  });

  it("新建组：未选颜色 → 不调 update_group_color（无颜色分支独立）", async () => {
    // Arrange
    const onChanged = vi.fn();
    render(
      <GroupSidebar
        groupFilter={null}
        onGroupFilterChange={vi.fn()}
        onChanged={onChanged}
        onOpenReview={vi.fn()}
        selectedNoteId={null}
        onOpenInbox={vi.fn()}
        inboxActive={false}
        refreshToken={0}
        onOpenSystem={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("group-create-open"));
    fireEvent.change(await screen.findByTestId("group-create-name"), { target: { value: "化妆美妆" } });
    fireEvent.change(screen.getByTestId("group-create-domain"), { target: { value: "beauty" } });
    fireEvent.click(screen.getByTestId("group-create-submit"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("create_topic_group", { name: "化妆美妆", domainTag: "beauty" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(invokeMock).not.toHaveBeenCalledWith("update_group_color", expect.anything());
  });

  it("行内 ✎ 重命名：Enter 提交 rename_note_group + onChanged；Esc 取消不提交", async () => {
    // Arrange
    const onChanged = vi.fn();
    const onGroupFilterChange = vi.fn();
    render(
      <GroupSidebar
        groupFilter={null}
        onGroupFilterChange={onGroupFilterChange}
        onChanged={onChanged}
        onOpenReview={vi.fn()}
        selectedNoteId={null}
        onOpenInbox={vi.fn()}
        inboxActive={false}
        refreshToken={0}
        onOpenSystem={vi.fn()}
      />,
    );
    await screen.findByTestId("group-row-1");
    // Act：✎ 进入编辑 → 改名 → Enter
    fireEvent.click(screen.getByTestId("group-rename-1"));
    const input = screen.getByTestId("group-rename-input-1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "化妆课 A·重修" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("rename_note_group", { id: 1, name: "化妆课 A·重修" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // 再次 ✎ → Esc 取消：无第二次提交
    fireEvent.click(screen.getByTestId("group-rename-1"));
    const input2 = screen.getByTestId("group-rename-input-1") as HTMLInputElement;
    fireEvent.change(input2, { target: { value: "不该提交" } });
    fireEvent.keyDown(input2, { key: "Escape" });
    expect(invokeMock).not.toHaveBeenCalledWith("rename_note_group", { id: 1, name: "不该提交" });
    // 审查修复（IME 守卫）：中文输入法确认候选的 Enter（isComposing）不触发提交
    fireEvent.click(screen.getByTestId("group-rename-1"));
    const input3 = screen.getByTestId("group-rename-input-1") as HTMLInputElement;
    fireEvent.change(input3, { target: { value: "拼音候选" } });
    fireEvent.keyDown(input3, { key: "Enter", isComposing: true });
    expect(invokeMock).not.toHaveBeenCalledWith("rename_note_group", { id: 1, name: "拼音候选" });
    // 审查修复（低7）：编辑态点击行空白区只停止传播（不触发组过滤切换）
    fireEvent.click(screen.getByTestId("group-row-1"));
    expect(onGroupFilterChange).not.toHaveBeenCalled();
  });
});
