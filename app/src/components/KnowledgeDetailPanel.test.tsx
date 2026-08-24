// @vitest-environment jsdom
/**
 * KnowledgeDetailPanel.test.tsx — 概念面板「记一次使用」按钮流（v0.13.3 §六）。
 *
 * @ai-context: 最小用例——选中概念时可见「📝 记一次使用」按钮，点击打开四行表单
 *              （mode=application、挂当前概念）。invoke 全 mock（list_* 返回空，
 *              不触碰真实后端）。决策日志/引用段仅验证挂载不崩溃。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { KnowledgeConcept, KnowledgeSystem } from "../types/knowledge";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import KnowledgeDetailPanel from "./KnowledgeDetailPanel";

const system: KnowledgeSystem = {
  id: 2, parentSystemId: 1, name: "化妆体系", kind: "domain", coreQuestion: null,
  status: "active", createdAt: 0, updatedAt: 0, nodeCount: 0, conceptCount: 0, modelCount: 0,
};

const concept: KnowledgeConcept = {
  id: 5, systemId: 2, name: "眼影", essence: null, boundary: null, relation: null,
  status: "core", lastAppliedAt: null, createdAt: 0, updatedAt: 0,
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd.startsWith("list_")) return [];
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

describe("KnowledgeDetailPanel 概念入口", () => {
  it("选中概念（id!=null）：点击「记一次使用」打开应用表单并挂当前概念", async () => {
    const onChanged = vi.fn();
    render(
      <KnowledgeDetailPanel
        system={system}
        nodes={[]}
        concepts={[concept]}
        models={[]}
        links={[]}
        selection={{ type: "concept", id: 5 }}
        onChanged={onChanged}
      />,
    );
    const btn = await screen.findByTestId("log-application-open");
    expect(btn.textContent).toContain("记一次使用");
    fireEvent.click(btn);
    const form = await screen.findByTestId("decision-form");
    expect(form.textContent).toContain("记一次使用");
    expect(screen.getByTestId("ref-badge-concept").textContent).toContain("已挂概念 #5");
  });

  it("未选中实体：不出现「记一次使用」按钮", async () => {
    render(
      <KnowledgeDetailPanel
        system={system}
        nodes={[]}
        concepts={[concept]}
        models={[]}
        links={[]}
        selection={null}
        onChanged={vi.fn()}
      />,
    );
    await screen.findByTestId("detail-panel");
    expect(screen.queryByTestId("log-application-open")).toBeNull();
  });
});
