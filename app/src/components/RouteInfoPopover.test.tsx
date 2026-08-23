// @vitest-environment jsdom
/**
 * RouteInfoPopover.test.tsx — ⓘ 弹层交互测试（v0.12.2 验收标准 1/4）。
 *
 * @ai-context: 四区齐全（人话归因 + 明细默认折叠 / 改判 / 组管理 / 周契约）；
 *              改判命令契约（id/kind/domainTag）；明细展开默认收起——
 *              invoke 全 mock（WeekContractCard 依赖 week_contract_status）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NoteGroup } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import RouteInfoPopover from "./RouteInfoPopover";

const groupWithReason: NoteGroup = {
  id: 3, name: "化妆课", terrain: "container", kind: "course", domainTag: null,
  source: "route", seriesKey: null,
  routeReason: '{"action":"course","needsConfirm":false,"reasons":["系列连续内容","术语表成块（60 条术语）"]}',
  routeOverridden: 0, noteCount: 5, createdAt: 0, updatedAt: 0,
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "week_contract_status":
        return { contract: null, weekStart: 0, actualDays: 0, actualCards: 0, minimalDayMet: false };
      case "override_group_route":
        return true;
      case "generate_group_cards":
        return 2;
      default:
        throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

function renderPopover(overrides: Partial<Parameters<typeof RouteInfoPopover>[0]> = {}) {
  const props = {
    group: groupWithReason, anchor: { x: 10, y: 20 }, onClose: vi.fn(),
    onChanged: vi.fn(), onOpenReview: vi.fn(), selectedNoteId: null,
    ...overrides,
  };
  return render(<RouteInfoPopover {...props} />);
}

describe("RouteInfoPopover ⓘ 弹层", () => {
  it("四区齐全：人话归因一行 + 明细默认折叠可展开 + 改判/组管理/周契约", async () => {
    renderPopover();
    // ① 人话归因（取首条信号——非算法原文）
    expect(await screen.findByText("系统按内容特征归入：系列连续内容")).toBeTruthy();
    // 明细默认折叠（原因按需——不默认铺开）
    expect(screen.queryByTestId("route-details")).toBeNull();
    expect(screen.getByText("查看明细 ▾")).toBeTruthy();
    fireEvent.click(screen.getByTestId("route-details-toggle"));
    expect(screen.getByTestId("route-details").textContent).toContain("术语表成块（60 条术语）");
    // ② 改判 / ③ 组管理 / ④ 周契约
    expect(screen.getByTestId("override-kind")).toBeTruthy();
    expect(screen.getByText("⚙ 生成闪卡")).toBeTruthy();
    expect(screen.getByText("🧹 结算")).toBeTruthy();
    expect(screen.getByText("🎴 复习本组")).toBeTruthy();
    expect(await screen.findByText("📅 周契约")).toBeTruthy();
  });

  it("改动归：确认后按契约调用 override_group_route + onChanged 刷新", async () => {
    const onChanged = vi.fn();
    renderPopover({ onChanged });
    await screen.findByText("系统按内容特征归入：系列连续内容");

    // 课程组 → 主题组 + 领域下拉出现（修改即记忆）
    fireEvent.change(screen.getByTestId("override-kind"), { target: { value: "topic" } });
    const domain = await screen.findByTestId("override-domain");
    fireEvent.change(domain, { target: { value: "beauty" } });
    fireEvent.click(screen.getByTestId("override-confirm"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("override_group_route", {
        id: 3, kind: "topic", domainTag: "beauty",
      });
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("组管理：生成闪卡触发命令并刷新", async () => {
    const onChanged = vi.fn();
    renderPopover({ onChanged });
    await screen.findByText("系统按内容特征归入：系列连续内容");
    fireEvent.click(screen.getByText("⚙ 生成闪卡"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("generate_group_cards", { groupId: 3 });
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("ESC 关闭弹层", async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    await screen.findByText("系统按内容特征归入：系列连续内容");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
