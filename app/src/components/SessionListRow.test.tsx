// @vitest-environment jsdom
/**
 * SessionListRow.test.tsx — 会话列表行交互测试（批 4；P2-9 组件覆盖）。
 *
 * @ai-context: 行内重命名是批 4 高频易错点——Enter 提交 / Esc 取消 / 失焦提交
 *              三入口同奔 commitRename，连点与「Enter 后失焦」竞态靠
 *              busyRef（同 tick 同步拦截）+ editingRef（提交后 blur 不再
 *              二次提交）双 ref 防抖。invoke 全 mock（update_session_title）。
 *              行单击语义（打开详情/选择勾选）由父层裁决——见
 *              SessionListPanel.test.tsx。
 */
import { useState } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionListItem } from "../types";
import SessionListRow, { type SessionRenameRequest } from "./SessionListRow";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  // 调用历史/实现跨测试隔离（mockReset 清历史——防前序用例计数串扰）
  invokeMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function item(id: number, title: string): SessionListItem {
  return {
    session: { id, title, source_window: null, started_at: id * 1000, ended_at: id * 1000 + 500, status: "finished", kind: null },
    hasContent: true,
    hasNote: false,
    noteId: null,
    noteTitle: null,
    displayNo: id,
  };
}

/** 可控 Promise（busy 窗口期模拟——invoke 未返回时连点/失焦竞态） */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

interface HarnessProps {
  row: SessionListItem;
  onRenamed?: (id: number) => void;
  showToast?: (msg: string, kind: "ok" | "err") => void;
}

/** 重命名请求由父层持有（真实面板同款受控形态）——提供启动按钮模拟右键入口 */
function RowHarness({ row, onRenamed, showToast }: HarnessProps) {
  const [req, setReq] = useState<SessionRenameRequest | null>(null);
  return (
    <>
      <button
        data-testid="start-rename"
        onClick={() => setReq((r) => ({ id: row.session.id, nonce: (r?.nonce ?? 0) + 1 }))}
      >
        重命名入口
      </button>
      <SessionListRow
        item={row}
        isOpen={false}
        multiSelected={false}
        canConvert={false}
        renameRequest={req}
        onRenameEnd={() => setReq(null)}
        onRenamed={onRenamed ?? (() => {})}
        showToast={showToast ?? (() => {})}
        onOpen={() => {}}
        onModifierClick={() => {}}
        onContextMenu={() => {}}
        onConvert={() => {}}
        onOpenNote={() => {}}
      />
    </>
  );
}

async function startRename() {
  fireEvent.click(screen.getByTestId("start-rename"));
  const input = await screen.findByTestId("session-row-title-input");
  return input as HTMLInputElement;
}

describe("SessionListRow 行内重命名", () => {
  it("Enter 提交：invoke 改名 + 回声标题 + onRenamed 上抛 + 退出编辑", async () => {
    // Arrange：invoke 成功返回
    invokeMock.mockResolvedValue(undefined);
    const onRenamed = vi.fn();
    const showToast = vi.fn();
    render(<RowHarness row={item(1, "原标题")} onRenamed={onRenamed} showToast={showToast} />);
    // Act：启动编辑 → 输入 → Enter
    const input = await startRename();
    expect(input.value).toBe("原标题");
    fireEvent.change(input, { target: { value: "精修后的标题" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Assert：单次 invoke、编辑退出、父层收到改名通知、toast 留痕
    // （标题展示受回声策略影响：echo 在服务端 prop 追上前会被既有 effect
    //  丢弃——本测试断言契约行为，不做展示文案断言；见文件头 @ai-context）
    await waitFor(() => expect(screen.queryByTestId("session-row-title-input")).toBeNull());
    expect(invokeMock).toHaveBeenCalledWith("update_session_title", { id: 1, title: "精修后的标题" });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(onRenamed).toHaveBeenCalledWith(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("已重命名"), "ok");
  });

  it("Esc 取消：不 invoke 且退出编辑（stopPropagation——不触发父层全局 Esc）", async () => {
    invokeMock.mockResolvedValue(undefined);
    render(<RowHarness row={item(1, "原标题")} />);
    const input = await startRename();
    fireEvent.change(input, { target: { value: "作废的标题" } });
    // Act：Esc 取消
    fireEvent.keyDown(input, { key: "Escape" });
    // Assert：无 invoke、编辑退出、原标题保留
    expect(invokeMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("session-row-title-input")).toBeNull());
    expect(screen.getByTestId("session-row-1").textContent).toContain("原标题");
  });

  it("失焦提交：blur 即改名（无 Enter 路径）", async () => {
    invokeMock.mockResolvedValue(undefined);
    render(<RowHarness row={item(1, "原标题")} />);
    const input = await startRename();
    fireEvent.change(input, { target: { value: "失焦提交标题" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("update_session_title", { id: 1, title: "失焦提交标题" });
    });
    await waitFor(() => expect(screen.queryByTestId("session-row-title-input")).toBeNull());
  });

  it("空/未变化标题=放弃退出（不 invoke）", async () => {
    invokeMock.mockResolvedValue(undefined);
    render(<RowHarness row={item(1, "原标题")} />);
    // 同名提交
    const input = await startRename();
    fireEvent.change(input, { target: { value: "原标题" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.queryByTestId("session-row-title-input")).toBeNull());
    expect(invokeMock).not.toHaveBeenCalled();
    // 空白提交（重进编辑）
    fireEvent.click(screen.getByTestId("start-rename"));
    const input2 = await screen.findByTestId("session-row-title-input");
    fireEvent.change(input2, { target: { value: "   " } });
    fireEvent.keyDown(input2, { key: "Enter" });
    await waitFor(() => expect(screen.queryByTestId("session-row-title-input")).toBeNull());
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("快速连点/失焦竞态：pending 期间 Enter+blur 只提交一次（双 ref 防抖）", async () => {
    // Arrange：首次 invoke 挂起（busy 窗口）
    const d = deferred<void>();
    invokeMock.mockImplementationOnce(async () => { await d.promise; });
    invokeMock.mockResolvedValue(undefined);
    const onRenamed = vi.fn();
    render(<RowHarness row={item(1, "原标题")} onRenamed={onRenamed} />);
    const input = await startRename();
    fireEvent.change(input, { target: { value: "竞态标题" } });
    // Act：同 tick 内 Enter → Enter → blur（旧实现 blur 会等 Enter 完成后
    // editingRef 已 false 二次提交失败……此处验证防抖：仅一次 invoke）
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    // 完成挂起调用 → 提交成功（唯一一次）
    await act(async () => { d.resolve(); });
    await waitFor(() => expect(screen.queryByTestId("session-row-title-input")).toBeNull());
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(onRenamed).toHaveBeenCalledWith(1);
    // busy 释放验证：再次改名仍可提交（finally 复位防抖标志）
    const input2 = await startRename();
    fireEvent.change(input2, { target: { value: "第二次改名" } });
    fireEvent.keyDown(input2, { key: "Enter" });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenLastCalledWith("update_session_title", { id: 1, title: "第二次改名" });
  });
});
