// @vitest-environment jsdom
/**
 * GroupSidebar.test.tsx — 组筛选侧栏 + ⓘ 弹层交互测试（v0.12.2 审查修复）。
 *
 * @ai-context: 覆盖串组场景——切换 ⓘ 弹层目标组时表单态必须重置（key=group.id
 *              修复）：组 A 改了判类（未确认）→ 点组 B ⓘ → 弹层显示 B 且
 *              判类下拉回到 B.kind（防把 A 的选择误用到 B——路径: 改判误操作）。
 *              invoke 全 mock（list_note_groups/count_due_cards/list_fragments/
 *              get_feature_flags/week_contract_status）。
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
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_note_groups": return [groupA, groupB];
      case "count_due_cards": return 0;
      case "list_fragments": return [];
      case "get_feature_flags": return { feedCapture: true };
      case "week_contract_status":
        return { contract: null, weekStart: 0, actualDays: 0, actualCards: 0, minimalDayMet: false };
      case "override_group_route": return true;
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
});
