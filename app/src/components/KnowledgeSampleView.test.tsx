// @vitest-environment jsdom
/**
 * KnowledgeSampleView.test.tsx — 示例体系浏览 + 复制（v0.13.7 具象化）。
 *
 * @ai-context: 复制流——无全局体系先开全局向导（onNeedGlobal 回调），
 *              有全局则直接逐条落库；命令顺序 golden：system→node×7→concept×3→model×1。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import KnowledgeSampleView from "./KnowledgeSampleView";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_knowledge_systems": return [];
      case "create_knowledge_system": return { id: 100, parentSystemId: null, name: "摄影", kind: "domain", coreQuestion: "q", status: "active", createdAt: 0, updatedAt: 0 };
      case "add_knowledge_node": return { id: 1 };
      case "add_knowledge_concept": return { id: 1 };
      case "add_knowledge_model": return { id: 1 };
      default: throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

describe("KnowledgeSampleView", () => {
  it("浏览：渲染体系名/问题树节点/概念/模型", () => {
    render(<KnowledgeSampleView onCopied={vi.fn()} onNeedGlobal={vi.fn()} />);
    expect(screen.getByTestId("sample-view").textContent).toContain("摄影");
    expect(screen.getByTestId("sample-view").textContent).toContain("曝光三角");
  });

  it("无全局体系：点复制触发 onNeedGlobal（不落库）", async () => {
    const onNeedGlobal = vi.fn();
    render(<KnowledgeSampleView onCopied={vi.fn()} onNeedGlobal={onNeedGlobal} />);
    fireEvent.click(await screen.findByTestId("sample-copy"));
    expect(onNeedGlobal).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalledWith("create_knowledge_system", expect.anything());
  });

  it("有全局体系：复制按序落库并回调 onCopied", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_knowledge_systems") {
        return [{ id: 1, parentSystemId: null, name: "全局", kind: "global", coreQuestion: "q", status: "active", createdAt: 0, updatedAt: 0 }];
      }
      if (cmd === "create_knowledge_system") return { id: 100, parentSystemId: 1, name: "摄影", kind: "domain", coreQuestion: "q", status: "active", createdAt: 0, updatedAt: 0 };
      if (cmd === "add_knowledge_node") return { id: 1 };
      if (cmd === "add_knowledge_concept") return { id: 1 };
      if (cmd === "add_knowledge_model") return { id: 1 };
      throw new Error(`unexpected: ${cmd}`);
    });
    const onCopied = vi.fn();
    render(<KnowledgeSampleView onCopied={onCopied} onNeedGlobal={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("sample-copy"));
    await waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1));
    const calls = invokeMock.mock.calls.map((c) => c[0]);
    // calls[0] 是 mount 预检 list_knowledge_systems（另见 useEffect）——复制序列从 create 开始
    const createIdx = calls.findIndex((c) => c === "create_knowledge_system");
    const firstNodeIdx = calls.findIndex((c) => c === "add_knowledge_node");
    const firstConceptIdx = calls.findIndex((c) => c === "add_knowledge_concept");
    const firstModelIdx = calls.findIndex((c) => c === "add_knowledge_model");
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(firstNodeIdx).toBeGreaterThan(createIdx);
    expect(firstConceptIdx).toBeGreaterThan(firstNodeIdx);
    expect(firstModelIdx).toBeGreaterThan(firstConceptIdx);
    expect(calls.filter((c) => c === "add_knowledge_node").length).toBe(7);
    expect(calls.filter((c) => c === "add_knowledge_concept").length).toBe(3);
    expect(calls.filter((c) => c === "add_knowledge_model").length).toBe(1);
  });
});
