// @vitest-environment jsdom
/**
 * NoteLinkToSystem.test.tsx — 笔记「挂到体系」选择器（v0.13.7 触点②；v0.14 C3；
 *                             REQ-286 v0.19.7 搜索列表 + 三类内联轻建）。
 *
 * @ai-context: 覆盖——选体系→点行选中→link 零 id 契约；未选禁用/切体系重置；
 *              三实体挂接 conceptId/modelId；已挂态切换先撤旧链、取消挂接；
 *              旧数据兼容显示；REQ-286 行内轻建（问题挂根/挂选中节点下、
 *              概念、模型）即建即选→确认挂接。invoke 全 mock（AAA）。
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

/** 打开浮层并选体系 2（返回 confirm 按钮供后续断言） */
async function openWithSystem() {
  render(<NoteLinkToSystem noteId={7} onChanged={vi.fn()} />);
  fireEvent.click(await screen.findByTestId("note-link-open"));
  fireEvent.change(await screen.findByTestId("note-link-system"), { target: { value: "2" } });
}

describe("NoteLinkToSystem v0.13.7 基础（REQ-286 列表选中语义）", () => {
  it("点行选中问题节点确认 → link 携带 nodeId（零 id 知识）", async () => {
    await openWithSystem();
    fireEvent.click(await screen.findByTestId("note-link-row-11"));
    expect((screen.getByTestId("note-link-confirm") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("note-link-confirm"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 2, nodeId: 11, targetType: "note", targetId: 7,
      });
    });
  });

  it("未选目标时确认按钮禁用（不挂体系根）", async () => {
    await openWithSystem();
    expect((screen.getByTestId("note-link-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("切换体系时重置目标选择（防实体残留串体系）", async () => {
    await openWithSystem();
    fireEvent.click(await screen.findByTestId("note-link-row-11"));
    expect((screen.getByTestId("note-link-confirm") as HTMLButtonElement).disabled).toBe(false);
    // 切到体系 1（无实体）——目标重置、原行消失、确认禁用
    fireEvent.change(await screen.findByTestId("note-link-system"), { target: { value: "1" } });
    await waitFor(() => {
      expect(screen.queryByTestId("note-link-row-11")).toBeNull();
      expect((screen.getByTestId("note-link-confirm") as HTMLButtonElement).disabled).toBe(true);
    });
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
    await openWithSystem();
    fireEvent.click(screen.getByTestId("note-link-tab-concept"));
    fireEvent.click(await screen.findByTestId("note-link-row-21"));
    fireEvent.click(screen.getByTestId("note-link-confirm"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 2, conceptId: 21, targetType: "note", targetId: 7,
      });
    });
  });

  it("挂接模型：切「模型」tab 选模型 → link 带 modelId", async () => {
    await openWithSystem();
    fireEvent.click(screen.getByTestId("note-link-tab-model"));
    fireEvent.click(await screen.findByTestId("note-link-row-31"));
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
    fireEvent.click(screen.getByTestId("note-link-tab-model"));
    fireEvent.click(await screen.findByTestId("note-link-row-31"));
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

describe("NoteLinkToSystem REQ-286 行内轻建（即建即选）", () => {
  function withCreateMock() {
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case "list_knowledge_systems": return systems;
        case "list_knowledge_nodes": {
          const created = args?.__created ? [{ id: 88, systemId: 2, parentId: null, type: "question", text: "为什么天空是蓝的？", orderIdx: 0, status: "active", createdAt: 0 }] : [];
          return args?.systemId === 2 ? [...nodes, ...created] : [];
        }
        case "list_knowledge_concepts": return args?.systemId === 2 ? concepts : [];
        case "list_knowledge_models": return args?.systemId === 2 ? models : [];
        case "list_links_by_target": return [];
        case "add_knowledge_node": {
          // 记录创建以便列表重载可见（简化：直接置标）
          return { id: 88, systemId: 2, parentId: (args?.parentId as number | null) ?? null, type: "question", text: args?.text, orderIdx: 0, status: "active", createdAt: 0 };
        }
        case "link_knowledge_target": return { id: 99 };
        case "delete_knowledge_link": return true;
        default: throw new Error(`unexpected: ${cmd}`);
      }
    });
  }

  it("问题轻建挂体系根：输入名回车 → 新建即选 → 确认挂接 nodeId=新节点", async () => {
    withCreateMock();
    await openWithSystem();
    const search = await screen.findByTestId("note-link-search");
    fireEvent.change(search, { target: { value: "为什么天空是蓝的？" } });
    const createBtn = await screen.findByTestId("note-link-create");
    fireEvent.click(createBtn);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("add_knowledge_node", {
        systemId: 2, parentId: null, nodeType: "question", text: "为什么天空是蓝的？",
      });
    });
    // 即建即选：确认按钮可用，link 携带新节点 id
    await waitFor(() => {
      expect((screen.getByTestId("note-link-confirm") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId("note-link-confirm"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 2, nodeId: 88, targetType: "note", targetId: 7,
      });
    });
  });

  it("问题轻建挂选中节点下（父锚点=行点击）", async () => {
    withCreateMock();
    await openWithSystem();
    fireEvent.click(await screen.findByTestId("note-link-row-11")); // 父锚点
    const search = await screen.findByTestId("note-link-search");
    fireEvent.change(search, { target: { value: "子问题：怎么测白平衡？" } });
    fireEvent.click(await screen.findByTestId("note-link-create"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("add_knowledge_node", expect.objectContaining({
        systemId: 2, parentId: 11, nodeType: "question",
      }));
    });
  });

  it("概念轻建：切概念 tab 输入名回车 → add_knowledge_concept 名称级落库", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case "list_knowledge_systems": return systems;
        case "list_knowledge_nodes": return args?.systemId === 2 ? nodes : [];
        case "list_knowledge_concepts": return args?.systemId === 2 ? concepts : [];
        case "list_knowledge_models": return args?.systemId === 2 ? models : [];
        case "list_links_by_target": return [];
        case "add_knowledge_concept":
          return { id: 22, systemId: 2, name: args?.name, essence: null, boundary: null, relation: null, status: "core", lastAppliedAt: null, createdAt: 0, updatedAt: 0 };
        default: throw new Error(`unexpected: ${cmd}`);
      }
    });
    await openWithSystem();
    fireEvent.click(screen.getByTestId("note-link-tab-concept"));
    const search = await screen.findByTestId("note-link-search");
    fireEvent.keyDown(search, { key: "Enter" }); // 空输入不建
    expect(invokeMock).not.toHaveBeenCalledWith("add_knowledge_concept", expect.anything());
    fireEvent.change(search, { target: { value: "色温" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("add_knowledge_concept", {
        systemId: 2, name: "色温", essence: null, boundary: null, relation: null,
      });
    });
  });
});
