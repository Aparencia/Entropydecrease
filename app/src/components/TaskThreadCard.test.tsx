// @vitest-environment jsdom
/**
 * TaskThreadCard.test.tsx — 对话线程任务卡（v0.16.1）。AAA 模式。
 *
 * @ai-context: 覆盖四契约——① 进行中任务实时卡（排队/进行中文案）；
 *              ② 10 分钟窗口内最近成功任务 → 「在对话中追问」/「查看轨迹」；
 *              ③ 无进行中且无最近完成 → 不渲染（不打扰当前对话）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TaskThreadCard from "./TaskThreadCard";
import type { AiTaskRecord } from "../types";

// v0.17.0：流式 hook 依赖 tauri event listen——测试环境 mock 为空流（不报错）
vi.mock("../hooks/useRefineStream", () => ({
  useRefineStream: () => [],
  orderedBlockFrames: () => [],
}));

function task(partial: Partial<AiTaskRecord> & { taskId: number }): AiTaskRecord {
  return {
    opType: "refine", refId: 12, state: "running", model: "m", slices: 3, costYuan: null,
    elapsedMs: null, createdAt: Math.floor(Date.now() / 1000), finishedAt: null, adopted: false, error: null,
    resultJson: null, ...partial,
  };
}

const refTitle = () => "B站#12";

afterEach(() => cleanup());

describe("TaskThreadCard", () => {
  it("进行中任务卡：文案区分排队/进行中", () => {
    render(<TaskThreadCard
      tasks={[
        task({ taskId: 1, state: "running" }),
        task({ taskId: 2, state: "pending" }),
      ]}
      onFollowUp={vi.fn()} onOpenTask={vi.fn()} refTitle={refTitle}
    />);
    expect(screen.getAllByTestId("task-thread-active")).toHaveLength(2);
    expect(screen.getByText("进行中…")).toBeTruthy();
    expect(screen.getByText("排队中…")).toBeTruthy();
  });

  it("最近成功任务：可追问 + 查看轨迹", () => {
    const onFollowUp = vi.fn();
    const onOpenTask = vi.fn();
    render(<TaskThreadCard tasks={[task({ taskId: 3, state: "succeeded" })]} onFollowUp={onFollowUp} onOpenTask={onOpenTask} refTitle={refTitle} />);
    fireEvent.click(screen.getByTestId("task-thread-followup"));
    expect(onFollowUp).toHaveBeenCalledWith(expect.objectContaining({ taskId: 3 }));
    fireEvent.click(screen.getByText("查看轨迹 ▸"));
    expect(onOpenTask).toHaveBeenCalledWith(3);
  });

  it("10 分钟窗口外的历史任务不显示（不打扰当前对话）", () => {
    render(<TaskThreadCard
      tasks={[task({ taskId: 4, state: "succeeded", createdAt: Math.floor(Date.now() / 1000) - 700 })]}
      onFollowUp={vi.fn()} onOpenTask={vi.fn()} refTitle={refTitle}
    />);
    expect(screen.queryByTestId("task-thread-done")).toBeNull();
  });

  it("无进行中且无最近完成 → 不渲染", () => {
    const { container } = render(<TaskThreadCard tasks={[]} onFollowUp={vi.fn()} onOpenTask={vi.fn()} refTitle={refTitle} />);
    expect(container.firstChild).toBeNull();
  });
});
