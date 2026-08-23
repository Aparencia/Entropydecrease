// @vitest-environment jsdom
/**
 * RefineWorkbench.test.tsx — 精修工作台数据源回归测试（Bug#：采纳前右侧恒空）。
 *
 * @ai-context: 工作台在采纳前打开，笔记尚未落库——refine_workbench 必须收到
 *              调用方内存结果（refineResult 参数）才能回显精修版；采纳落库须
 *              回传 taskId（标记 adopted 防重启重复采纳、成本回填）。invoke
 *              全 mock（不触碰真实后端），断言命令参数契约与双栏渲染。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AiRefineResult, WorkbenchData } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import RefineWorkbench from "./RefineWorkbench";

/** 最小精修结果桩（camelCase 契约） */
const resultStub: AiRefineResult = {
  title: "测试精修",
  baseMarkdown: "# 标题\n规则内容",
  refinedMarkdown: "# 标题\n精修内容",
  diff: [],
  addedLines: 1,
  removedLines: 1,
  slices: 1,
  failedSlices: 0,
  model: "test-model",
};

/** 后端工作台数据桩（含章节 diff——右侧带徽标） */
const wbStub: WorkbenchData = {
  ruleMarkdown: "# 标题\n规则内容",
  refinedMarkdown: "# 标题\n精修内容",
  sections: [{ heading: "标题", status: "modified", removed_lines: ["规则内容"], added_lines: ["精修内容"] }],
  stats: { added: 1, removed: 1, unchanged: 0 },
  meta: { costYuan: null, model: "test-model", slices: 1, mergedFrom: null },
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (_cmd: string) => wbStub);
});

afterEach(() => cleanup());

describe("RefineWorkbench 采纳前数据源（Bug# 回归）", () => {
  it("带 taskResult 打开：refine_workbench 收到 refineResult，右侧渲染精修版", async () => {
    // Arrange/Act
    render(<RefineWorkbench sessionId={1} onClose={vi.fn()} taskResult={resultStub} taskId={7} />);
    // Assert：命令契约——内存结果必须回传（原实现未传 → 后端取不到未落库笔记 → 右侧恒空）
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("refine_workbench", { sessionId: 1, refineResult: resultStub });
    });
    expect(await screen.findByText(/精修内容/)).toBeTruthy();
    expect(screen.getByText(/规则内容/)).toBeTruthy();
    // 右侧不再出现"尚未精修"占位（原 Bug 表象）
    expect(screen.queryByText(/尚未精修/)).toBeNull();
  });

  it("无 taskResult（重启/恢复路径）：refineResult 传 null，后端兜底未采纳任务", async () => {
    // Arrange/Act
    render(<RefineWorkbench sessionId={2} onClose={vi.fn()} />);
    // Assert
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("refine_workbench", { sessionId: 2, refineResult: null });
    });
  });

  it("采纳落库回传真实 taskId（标记 adopted + 成本回填——防重启重复采纳）", async () => {
    // Arrange：工作台数据 + apply 返回笔记 id
    invokeMock.mockImplementation(async (cmd: string) => (cmd === "ai_refine_apply" ? { id: 42 } : wbStub));
    // Act
    const onApplied = vi.fn();
    const onClose = vi.fn();
    render(<RefineWorkbench sessionId={1} onClose={onClose} taskResult={resultStub} taskId={7} onApplied={onApplied} />);
    fireEvent.click(await screen.findByRole("button", { name: /采纳落库/ }));
    // Assert
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("ai_refine_apply", {
        sessionId: 1,
        result: resultStub,
        taskId: 7,
      });
    });
    expect(onApplied).toHaveBeenCalledWith(42);
    expect(onClose).toHaveBeenCalled();
  });

  it("后端返回 refinedMarkdown=null（无任何精修来源）→ 显示占位而非空白", async () => {
    // Arrange：后端兜底也拿不到精修版
    invokeMock.mockImplementation(async (_cmd: string) => ({
      ...wbStub,
      refinedMarkdown: null,
      sections: [],
      stats: { added: 0, removed: 0, unchanged: 0 },
    }));
    // Act
    render(<RefineWorkbench sessionId={3} onClose={vi.fn()} />);
    // Assert：占位提示可见，右栏不崩
    expect(await screen.findByText(/尚未精修/)).toBeTruthy();
    expect(screen.getByText(/规则内容/)).toBeTruthy();
  });
});
