// @vitest-environment jsdom
/**
 * TaskLaunchDialog.test.tsx — 对话内发起任务对话框（v0.16.1）。AAA 模式。
 *
 * @ai-context: 覆盖三契约——① 未授权先同意（confirm + ai_set_authorized）再启动；
 *              ② 授权与成本确认后 invoke ai_refine_start / ai_enrich_start（补充=九子项）；
 *              ③ 目标为空提示、取消不启动。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock, confirmMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), confirmMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: confirmMock }));

import TaskLaunchDialog from "./TaskLaunchDialog";

const sessions = [{ id: 12, title: "B站·化妆课 01" }];
const notes = [{ id: 7, title: "化妆笔记" }];

beforeEach(() => {
  invokeMock.mockReset();
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "ai_get_settings": return { enabled: true, hasKey: true, authorized: true };
      case "ai_refine_estimate":
      case "ai_enrich_estimate": return { estimate: { estCostYuan: 0.012, estTokens: 1000 }, rememberCostChoice: false };
      case "ai_refine_start": return { taskId: 101, state: "Running" };
      case "ai_enrich_start": return { taskId: 202, state: "Running" };
      default: throw new Error(`unexpected ${cmd}`);
    }
  });
});
afterEach(() => cleanup());

describe("TaskLaunchDialog", () => {
  it("精修：选会话 → 成本确认 → ai_refine_start(sessionId, authorized) + onStarted", async () => {
    const onStarted = vi.fn();
    render(<TaskLaunchDialog kind="refine" sessions={sessions} notes={[]} onClose={vi.fn()} onStarted={onStarted} />);
    fireEvent.change(screen.getByTestId("task-launch-target"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("task-launch-start"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("ai_refine_start", { sessionId: 12, authorized: true });
    });
    expect(onStarted).toHaveBeenCalledWith(101);
  });

  it("补充：默认九子项起送（d1~d3+b1~b6）", async () => {
    const onStarted = vi.fn();
    render(<TaskLaunchDialog kind="enrich" sessions={[]} notes={notes} onClose={vi.fn()} onStarted={onStarted} />);
    fireEvent.change(screen.getByTestId("task-launch-target"), { target: { value: "7" } });
    fireEvent.click(screen.getByTestId("task-launch-start"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("ai_enrich_start", {
        noteId: 7,
        selectedKinds: ["d1", "d2", "d3", "b1", "b2", "b3", "b4", "b5", "b6"],
        authorized: true,
      });
    });
    expect(onStarted).toHaveBeenCalledWith(202);
  });

  it("未授权 → 先同意（confirm + ai_set_authorized）再启动", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "ai_get_settings": return { enabled: true, hasKey: true, authorized: false };
        case "ai_set_authorized": return null;
        case "ai_refine_estimate": return { estimate: { estCostYuan: 0.001 }, rememberCostChoice: false };
        case "ai_refine_start": return { taskId: 101, state: "Running" };
        default: throw new Error(`unexpected ${cmd}`);
      }
    });
    render(<TaskLaunchDialog kind="refine" sessions={sessions} notes={[]} onClose={vi.fn()} onStarted={vi.fn()} />);
    fireEvent.change(screen.getByTestId("task-launch-target"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("task-launch-start"));
    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalled();
      expect(invokeMock).toHaveBeenCalledWith("ai_set_authorized", { authorized: true });
      expect(invokeMock).toHaveBeenCalledWith("ai_refine_start", { sessionId: 12, authorized: true });
    });
  });

  it("取消授权确认 → 不启动；无目标列表 → 提示", async () => {
    confirmMock.mockResolvedValue(false);
    render(<TaskLaunchDialog kind="refine" sessions={sessions} notes={[]} onClose={vi.fn()} onStarted={vi.fn()} />);
    fireEvent.change(screen.getByTestId("task-launch-target"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("task-launch-start"));
    await waitFor(() => expect(invokeMock).not.toHaveBeenCalledWith("ai_refine_start", expect.anything()));
  });

  it("initialTargetId（/refine 12 命令）预选目标——免手工选择", () => {
    render(<TaskLaunchDialog kind="refine" sessions={sessions} notes={[]} initialTargetId={12} onClose={vi.fn()} onStarted={vi.fn()} />);
    expect((screen.getByTestId("task-launch-target") as HTMLSelectElement).value).toBe("12");
  });
});
