// @vitest-environment jsdom
/**
 * NoteLinkToSystem.test.tsx — 笔记「挂到体系」选择器（v0.13.7 触点②）。
 *
 * @ai-context: 修复手工输 id 断点——用户零 id 知识：选体系→选节点→
 *              确认，targetType=note 与 targetId 由组件自动携带。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import NoteLinkToSystem from "./NoteLinkToSystem";

const systems = [
  { id: 1, parentSystemId: null, name: "全局", kind: "global", coreQuestion: "q", status: "active", createdAt: 0, updatedAt: 0 },
  { id: 2, parentSystemId: 1, name: "摄影", kind: "domain", coreQuestion: null, status: "active", createdAt: 0, updatedAt: 0 },
];
const nodes = [
  { id: 11, systemId: 2, parentId: null, type: "question", text: "照片为什么发灰？", orderIdx: 0, status: "active", createdAt: 0 },
];

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case "list_knowledge_systems": return systems;
      case "list_knowledge_nodes": return args?.systemId === 2 ? nodes : [];
      case "list_knowledge_links": return [];
      case "link_knowledge_target": return { id: 99 };
      case "delete_knowledge_link": return true;
      default: throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

describe("NoteLinkToSystem", () => {
  it("未挂接时显示「挂到体系」按钮；点开选体系选节点确认后调用 link（零 id）", async () => {
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    fireEvent.change(await screen.findByTestId("note-link-system"), { target: { value: "2" } });
    fireEvent.change(await screen.findByTestId("note-link-node"), { target: { value: "11" } });
    fireEvent.click(screen.getByTestId("note-link-confirm"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 2, nodeId: 11, targetType: "note", targetId: 7,
      });
    });
  });

  it("已挂接时显示「已挂 · 体系名」并可取消", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_knowledge_systems": return systems;
        case "list_knowledge_nodes": return nodes;
        case "list_knowledge_links":
          return [{ id: 50, systemId: 2, nodeId: 11, conceptId: null, modelId: null, targetType: "note", targetId: 7, createdAt: 0 }];
        case "delete_knowledge_link": return true;
        default: throw new Error(`unexpected: ${cmd}`);
      }
    });
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    const btn = await screen.findByTestId("note-link-open");
    expect(btn.textContent).toContain("已挂 · 摄影");
    fireEvent.click(btn);
    fireEvent.click(await screen.findByTestId("note-link-unlink"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("delete_knowledge_link", { id: 50 }));
  });

  it("无体系时提示先创建体系（不显示确认按钮）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_knowledge_systems") return [];
      if (cmd === "list_knowledge_links") return [];
      throw new Error(`unexpected: ${cmd}`);
    });
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    expect(await screen.findByTestId("note-link-empty")).toBeTruthy();
    expect(screen.queryByTestId("note-link-confirm")).toBeNull();
  });
});
