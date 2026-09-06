// @vitest-environment jsdom
/**
 * ActionCenterPanel.test.tsx — 行动域页面板关键路径（v0.20.5 独立页化）。
 *
 * @ai-context: 覆盖页面化改造后的骨架行为——挂载全量拉取（四分区/完成史/
 *              SOP 库）、三页签切换、refreshToken 递增触发全量重载（ActionPage
 *              active 门控切回补偿）。invoke 全 mock（零后端依赖）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import ActionCenterPanel from "./ActionCenterPanel";

const queueCalls = () => invokeMock.mock.calls.filter((c) => c[0] === "list_action_queue").length;

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_action_queue": return [];
      case "completion_history_list": return [];
      case "sop_template_list": return [];
      case "list_notes": return [];
      default:
        throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

describe("ActionCenterPanel 页面化骨架", () => {
  it("挂载即全量拉取（四分区/完成史/SOP 库/笔记列表）", async () => {
    render(<ActionCenterPanel />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("list_action_queue", { tab: "overdue", noteId: null });
      expect(invokeMock).toHaveBeenCalledWith("list_action_queue", { tab: "planned", noteId: null });
      expect(invokeMock).toHaveBeenCalledWith("list_action_queue", { tab: "someday", noteId: null });
      expect(invokeMock).toHaveBeenCalledWith("list_action_queue", { tab: "unrefined", noteId: null });
      expect(invokeMock).toHaveBeenCalledWith("completion_history_list", { eventType: null, limit: 150 });
      expect(invokeMock).toHaveBeenCalledWith("sop_template_list", { noteId: null });
      expect(invokeMock).toHaveBeenCalledWith("list_notes");
    });
  });

  it("三页签切换：队列空态 / 完成史空态 / SOP 库空态", async () => {
    render(<ActionCenterPanel />);
    expect(await screen.findByText(/无逾期——裁决是机制不是自动清理/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /完成史/ }));
    expect(await screen.findByText(/暂无完成记录/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /SOP 库/ }));
    expect(await screen.findByText(/暂无 SOP 模板/)).toBeTruthy();
    // 回到队列页签不抛错（三区共享状态）
    fireEvent.click(screen.getByRole("button", { name: /裁决队列/ }));
    expect(screen.getByText(/无逾期——裁决是机制不是自动清理/)).toBeTruthy();
  });

  it("refreshToken 递增触发全量重载（切回补偿）", async () => {
    const { rerender } = render(<ActionCenterPanel refreshToken={0} />);
    await waitFor(() => expect(queueCalls()).toBeGreaterThanOrEqual(4));
    const before = invokeMock.mock.calls.length;
    rerender(<ActionCenterPanel refreshToken={1} />);
    await waitFor(() => expect(invokeMock.mock.calls.length).toBeGreaterThan(before));
    expect(queueCalls()).toBeGreaterThanOrEqual(4);
  });

  it("页面形态无遮罩关闭语义：渲染为页内容器（无 overlay 层级依赖）", () => {
    const { container } = render(<ActionCenterPanel />);
    // 原 Overlay 为 position:fixed 全屏遮罩——页面化后根容器为普通文档流占位
    expect(container.firstElementChild?.getAttribute("style") ?? "").not.toContain("position: fixed");
    expect(screen.queryByText("关闭")).toBeNull();
  });
});
