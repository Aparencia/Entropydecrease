// @vitest-environment jsdom
/**
 * NoteLinkToSystem.test.tsx — 笔记「挂到体系」选择器（v0.13.7 触点②；v0.14 C3 增强）。
 *
 * @ai-context: 覆盖 C3 新增——挂接目标三选一（问题/概念/模型）、已挂态切换目标
 *              （先撤旧链再建新链）、反查命令 list_links_by_target、旧版本仅 nodeId
 *              兼容显示。修复手工输 id 断点——用户零 id 知识：选体系→选目标→确认。
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
const concepts = [
  { id: 21, systemId: 2, name: "白平衡", essence: null, boundary: null, relation: null, status: "core", lastAppliedAt: null, createdAt: 0, updatedAt: 0 },
];
const models = [
  { id: 31, systemId: 2, name: "三庭五眼", disciplines: ["美学"], claim: null, validWhen: null, invalidWhen: null, crossChecks: null, status: "active", createdAt: 0, updatedAt: 0 },
];

/** 已挂概念链（C3 场景：挂载实体与查看实体不一致的数据形态） */
const linkedConcept = { id: 50, systemId: 2, nodeId: null, conceptId: 21, modelId: null, targetType: "note", targetId: 7, createdAt: 0 };

function baseMock() {
  invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case "list_knowledge_systems": return systems;
      case "list_knowledge_nodes": return args?.systemId === 2 ? nodes : [];
      case "list_knowledge_concepts": return args?.systemId === 2 ? concepts : [];
      case "list_knowledge_models": return args?.systemId === 2 ? models : [];
      case "list_links_by_target": return [];
      case "link_knowledge_target": return { id: 99 };
      case "delete_knowledge_link": return true;
      default: throw new Error(`unexpected: ${cmd}`);
    }
  });
}

beforeEach(() => { invokeMock.mockReset(); baseMock(); });
afterEach(() => cleanup());

describe("NoteLinkToSystem v0.13.7 基础", () => {
  it("未挂接时显示「挂到体系」按钮；点开选体系选问题节点确认后调用 link（零 id）", async () => {
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    fireEvent.change(await screen.findByTestId("note-link-system"), { target: { value: "2" } });
    fireEvent.change(await screen.findByTestId("note-link-entity"), { target: { value: "11" } });
    fireEvent.click(screen.getByTestId("note-link-confirm"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 2, nodeId: 11, targetType: "note", targetId: 7,
      });
    });
  });

  it("未选目标时确认按钮禁用（不挂体系根）", async () => {
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    fireEvent.change(await screen.findByTestId("note-link-system"), { target: { value: "2" } });
    const entitySelect = (await screen.findByTestId("note-link-entity")) as HTMLSelectElement;
    expect(entitySelect.value).toBe("");
    expect((screen.getByTestId("note-link-confirm") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(entitySelect, { target: { value: "11" } });
    expect((screen.getByTestId("note-link-confirm") as HTMLButtonElement).disabled).toBe(false);
  });

  it("切换体系时重置目标选择（防实体残留串体系——后端报「引用实体不属于该体系」）", async () => {
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    fireEvent.change(await screen.findByTestId("note-link-system"), { target: { value: "2" } });
    fireEvent.change(await screen.findByTestId("note-link-entity"), { target: { value: "11" } });
    fireEvent.change(await screen.findByTestId("note-link-system"), { target: { value: "1" } });
    expect(((await screen.findByTestId("note-link-entity")) as HTMLSelectElement).value).toBe("");
    expect((screen.getByTestId("note-link-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("无体系时提示先创建体系（不显示确认按钮）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_knowledge_systems") return [];
      if (cmd === "list_links_by_target") return [];
      throw new Error(`unexpected: ${cmd}`);
    });
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    expect(await screen.findByTestId("note-link-empty")).toBeTruthy();
    expect(screen.queryByTestId("note-link-confirm")).toBeNull();
  });
});

describe("NoteLinkToSystem v0.14 C3 三实体挂接", () => {
  it("反查命令一次拉取当前笔记挂接（不再逐体系正查）", async () => {
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("list_links_by_target", { targetType: "note", targetId: 7 });
    });
  });

  it("挂接概念：切「概念」tab 选概念 → link 带 conceptId", async () => {
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    fireEvent.change(await screen.findByTestId("note-link-system"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("note-link-tab-concept"));
    fireEvent.change(await screen.findByTestId("note-link-entity"), { target: { value: "21" } });
    fireEvent.click(screen.getByTestId("note-link-confirm"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 2, conceptId: 21, targetType: "note", targetId: 7,
      });
    });
  });

  it("挂接模型：切「模型」tab 选模型 → link 带 modelId", async () => {
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    fireEvent.change(await screen.findByTestId("note-link-system"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("note-link-tab-model"));
    fireEvent.change(await screen.findByTestId("note-link-entity"), { target: { value: "31" } });
    fireEvent.click(screen.getByTestId("note-link-confirm"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 2, modelId: 31, targetType: "note", targetId: 7,
      });
    });
  });
});

describe("NoteLinkToSystem v0.14 C3 已挂态与切换", () => {
  it("已挂概念显示「已挂 · 体系名」+ 实体徽标「概念 · 名」", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_knowledge_systems": return systems;
        case "list_knowledge_concepts": return concepts;
        case "list_links_by_target": return [linkedConcept];
        case "delete_knowledge_link": return true;
        default: throw new Error(`unexpected: ${cmd}`);
      }
    });
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    const btn = await screen.findByTestId("note-link-open");
    expect(btn.textContent).toContain("已挂 · 摄影");
    // 实体名异步加载（linked 到达后才按体系拉列表）——waitFor 等名称映射完成
    await waitFor(() => {
      expect(screen.getByTestId("note-link-linked-label").textContent).toContain("概念 · 白平衡");
    });
  });

  it("旧版本仅 nodeId 挂接 → 兼容显示「问题 · …」", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_knowledge_systems": return systems;
        case "list_knowledge_nodes": return nodes;
        case "list_links_by_target":
          return [{ id: 60, systemId: 2, nodeId: 11, conceptId: null, modelId: null, targetType: "note", targetId: 7, createdAt: 0 }];
        case "delete_knowledge_link": return true;
        default: throw new Error(`unexpected: ${cmd}`);
      }
    });
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    // 实体名异步加载（linked 到达后才按体系拉列表）——waitFor 等名称映射完成
    await waitFor(() => {
      expect(screen.getByTestId("note-link-linked-label").textContent).toContain("问题 · 照片为什么发灰？");
    });
  });

  it("切换目标：先撤旧链再建新链（不堆积同 target 多链）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_knowledge_systems": return systems;
        case "list_knowledge_nodes": return nodes;
        case "list_knowledge_concepts": return concepts;
        case "list_knowledge_models": return models;
        case "list_links_by_target": return [linkedConcept];
        case "link_knowledge_target": return { id: 99 };
        case "delete_knowledge_link": return true;
        default: throw new Error(`unexpected: ${cmd}`);
      }
    });
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    // 已挂概念 → 切到模型目标
    fireEvent.click(screen.getByTestId("note-link-tab-model"));
    fireEvent.change(await screen.findByTestId("note-link-entity"), { target: { value: "31" } });
    // 已挂态确认按钮为「切换目标」（面板关闭前断言）
    expect((screen.getByTestId("note-link-confirm") as HTMLButtonElement).textContent).toContain("切换目标");
    fireEvent.click(screen.getByTestId("note-link-confirm"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_knowledge_link", { id: 50 });
    });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 2, modelId: 31, targetType: "note", targetId: 7,
      });
    });
  });

  it("已挂态可取消挂接", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_knowledge_systems": return systems;
        case "list_links_by_target": return [linkedConcept];
        case "delete_knowledge_link": return true;
        default: throw new Error(`unexpected: ${cmd}`);
      }
    });
    render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("note-link-open"));
    fireEvent.click(await screen.findByTestId("note-link-unlink"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("delete_knowledge_link", { id: 50 }));
  });
});
