// @vitest-environment jsdom
/**
 * KnowledgeLinkSection.test.tsx — 引用区聚合视图测试（v0.14 C3 spec §6 联动用例）。
 *
 * @ai-context: 覆盖 C3 痛点修复——默认聚合视图（挂载实体与查看实体不一致时引用
 *              不再消失）：groupLinksByEntity 按实体分组 + 实体名映射；「本实体」
 *              模式保留过滤行为；模式切换交互；撤销/挂引用沿用既有路径。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { KnowledgeLink } from "../types/knowledge";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import KnowledgeLinkSection, { groupLinksByEntity } from "./KnowledgeLinkSection";
import type { KnowledgeConcept, KnowledgeModel, KnowledgeNode } from "../types/knowledge";

const nodes: KnowledgeNode[] = [
  { id: 11, systemId: 2, parentId: null, type: "question", text: "照片为什么发灰？", orderIdx: 0, status: "active", createdAt: 0 },
];
const concepts: KnowledgeConcept[] = [
  { id: 21, systemId: 2, name: "白平衡", essence: null, boundary: null, relation: null, status: "core", lastAppliedAt: null, createdAt: 0, updatedAt: 0 },
];
const models: KnowledgeModel[] = [
  { id: 31, systemId: 2, name: "三庭五眼", disciplines: ["美学"], claim: null, validWhen: null, invalidWhen: null, crossChecks: null, status: "active", createdAt: 0, updatedAt: 0 },
];

/** 三实体各一条引用（C3 场景：挂到问题 A，查看概念 B 时引用不消失） */
const links: KnowledgeLink[] = [
  { id: 1, systemId: 2, nodeId: 11, conceptId: null, modelId: null, targetType: "note", targetId: 100, createdAt: 0 },
  { id: 2, systemId: 2, nodeId: null, conceptId: 21, modelId: null, targetType: "note_group", targetId: 5, createdAt: 0 },
  { id: 3, systemId: 2, nodeId: null, conceptId: null, modelId: 31, targetType: "fragment", targetId: 9, createdAt: 0 },
];

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
});

afterEach(() => cleanup());

function renderSection(overrides: Partial<Parameters<typeof KnowledgeLinkSection>[0]> = {}) {
  return render(
    <KnowledgeLinkSection
      systemId={2}
      entityType="node"
      entityId={11}
      links={links}
      nodes={nodes}
      concepts={concepts}
      models={models}
      onChanged={vi.fn()}
      {...overrides}
    />,
  );
}

describe("groupLinksByEntity 纯函数", () => {
  it("按体系实体分组，实体名实时映射（问题/概念/模型三类）", () => {
    const groups = groupLinksByEntity(links, nodes, concepts, models);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ key: "node:11", kindLabel: "问题", label: "照片为什么发灰？" });
    expect(groups[1]).toMatchObject({ key: "concept:21", kindLabel: "概念", label: "白平衡" });
    expect(groups[2]).toMatchObject({ key: "model:31", kindLabel: "模型", label: "三庭五眼" });
  });

  it("同名实体多条引用合入同一组", () => {
    const two: KnowledgeLink[] = [
      links[1],
      { id: 4, systemId: 2, nodeId: null, conceptId: 21, modelId: null, targetType: "note", targetId: 200, createdAt: 0 },
    ];
    const groups = groupLinksByEntity(two, nodes, concepts, models);
    expect(groups).toHaveLength(1);
    expect(groups[0].links).toHaveLength(2);
  });

  it("实体名缺失回退 #id（数据损坏防御，不崩）", () => {
    const ghost: KnowledgeLink[] = [
      { id: 5, systemId: 2, nodeId: 999, conceptId: null, modelId: null, targetType: "note", targetId: 1, createdAt: 0 },
    ];
    const groups = groupLinksByEntity(ghost, nodes, concepts, models);
    expect(groups[0].label).toBe("#999");
  });
});

describe("KnowledgeLinkSection 聚合视图（v0.14 C3）", () => {
  it("默认聚合视图：查看问题 A 也显示概念/模型实体的引用（C3 痛点修复）", () => {
    renderSection();
    // 三段分组头（问题/概念/模型）
    expect(screen.getByTestId("link-group-node:11").textContent).toContain("照片为什么发灰？");
    expect(screen.getByTestId("link-group-concept:21").textContent).toContain("白平衡");
    expect(screen.getByTestId("link-group-model:31").textContent).toContain("三庭五眼");
    expect(screen.getAllByTestId("link-row")).toHaveLength(3);
  });

  it("切「本实体」模式 → 仅当前实体引用（node:11 一条）", () => {
    renderSection();
    fireEvent.click(screen.getByTestId("ref-mode-entity"));
    expect(screen.getAllByTestId("link-row")).toHaveLength(1);
    expect(screen.queryByTestId("link-group-concept:21")).toBeNull();
    expect(screen.getByText(/引用（1）/)).toBeTruthy();
  });

  it("切回「全部」恢复聚合分组", () => {
    renderSection();
    fireEvent.click(screen.getByTestId("ref-mode-entity"));
    fireEvent.click(screen.getByTestId("ref-mode-all"));
    expect(screen.getAllByTestId("link-row")).toHaveLength(3);
  });

  it("聚合视图撤销引用仍走 delete_knowledge_link", () => {
    renderSection();
    fireEvent.click(screen.getByTestId("link-unlink-2"));
    expect(invokeMock).toHaveBeenCalledWith("delete_knowledge_link", { id: 2 });
  });

  it("空引用显示空态文案（聚合模式）", () => {
    renderSection({ links: [] });
    expect(screen.getByText(/暂无引用/)).toBeTruthy();
  });
});
