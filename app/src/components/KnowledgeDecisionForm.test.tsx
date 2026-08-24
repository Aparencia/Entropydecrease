// @vitest-environment jsdom
/**
 * KnowledgeDecisionForm.test.tsx — 四行表单校验测试（v0.13.3 §六）。
 *
 * @ai-context: 覆盖 UI 层校验与提交契约——content 必填拦截；引用为空拦截；
 *              application 模式默认携带 conceptIds=[当前概念]（挂概念）；决策模式
 *              不带 conceptId。invoke 全 mock（不触碰真实后端）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { KnowledgeConcept, KnowledgeSystem } from "../types/knowledge";
import { parseUsedRefs } from "../types/knowledge";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import KnowledgeDecisionForm from "./KnowledgeDecisionForm";

const system: KnowledgeSystem = {
  id: 2, parentSystemId: 1, name: "化妆体系", kind: "domain", coreQuestion: null,
  status: "active", createdAt: 0, updatedAt: 0, nodeCount: 0, conceptCount: 0, modelCount: 0,
};

const concept = (id: number, name: string): KnowledgeConcept => ({
  id, systemId: 2, name, essence: null, boundary: null, relation: null,
  status: "core", lastAppliedAt: null, createdAt: 0, updatedAt: 0,
});

type Args = Record<string, unknown>;
// 后端存储契约为 snake_case 键（validate_decision_input 白名单）；parseUsedRefs 双键兼容
const asRefs = (json: unknown) => parseUsedRefs(json as string);

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
    const a = (args ?? {}) as Args;
    if (cmd === "list_knowledge_systems") return [system];
    if (cmd === "list_knowledge_concepts") return [concept(5, "眼影"), concept(7, "晕染")];
    if (cmd === "list_knowledge_nodes") return [];
    if (cmd === "list_knowledge_models") return [];
    if (cmd === "list_note_groups") return [];
    if (cmd === "list_fragments") return [];
    if (cmd === "log_application") return { id: 10, kind: "application", systemId: 2, questionId: null, usedRefs: a.usedRefs as string, content: a.content as string, expectation: null, actual: null, reflection: null, decidedAt: 0, createdAt: 0 };
    if (cmd === "log_decision") return { id: 11, kind: "decision", systemId: 2, questionId: null, usedRefs: a.usedRefs as string, content: a.content as string, expectation: null, actual: null, reflection: null, decidedAt: 0, createdAt: 0 };
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

describe("KnowledgeDecisionForm 四行表单校验", () => {
  it("content 必填：空内容提交 → 红色提示且不调用 log_application", async () => {
    const onSaved = vi.fn();
    render(<KnowledgeDecisionForm mode="application" systemId={system.id} conceptId={5} onSaved={onSaved} onClose={vi.fn()} />);
    await screen.findByTestId("decision-form");
    fireEvent.click(screen.getByTestId("form-submit"));
    expect((await screen.findByTestId("form-error")).textContent).toContain("请填写决策内容/应用动作");
    expect(invokeMock).not.toHaveBeenCalledWith("log_application", expect.anything());
  });

  it("引用为空：决策模式无引用提交 → 红色提示且不调用 log_decision", async () => {
    const onSaved = vi.fn();
    render(<KnowledgeDecisionForm mode="decision" systemId={system.id} onSaved={onSaved} onClose={vi.fn()} />);
    await screen.findByTestId("decision-form");
    fireEvent.change(screen.getByTestId("form-content"), { target: { value: "我判断这个技法先淡化再上色。" } });
    fireEvent.click(screen.getByTestId("form-submit"));
    expect((await screen.findByTestId("form-error")).textContent).toContain("请至少添加一个引用");
    expect(invokeMock).not.toHaveBeenCalledWith("log_decision", expect.anything());
  });

  it("application 默认携带 conceptIds=[当前概念]：提交挂概念断言 invoke 参数", async () => {
    const onSaved = vi.fn();
    render(<KnowledgeDecisionForm mode="application" systemId={system.id} conceptId={5} onSaved={onSaved} onClose={vi.fn()} />);
    await screen.findByTestId("decision-form");
    // 已挂概念徽标可见
    expect(screen.getByTestId("ref-badge-concept").textContent).toContain("已挂概念 #5");
    fireEvent.change(screen.getByTestId("form-content"), { target: { value: "用了眼影。" } });
    fireEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const logApp = invokeMock.mock.calls.find((c) => c[0] === "log_application");
    expect(logApp).toBeDefined();
    const a = logApp![1] as Args;
    expect(a.conceptId).toBe(5);
    expect(a.systemId).toBe(system.id);
    expect(a.content).toBe("用了眼影。");
    expect(asRefs(a.usedRefs).conceptIds).toEqual([5]);
  });

  it("决策模式无 concept：提交不带 conceptId，引用走勾选实体", async () => {
    const onSaved = vi.fn();
    render(<KnowledgeDecisionForm mode="decision" systemId={system.id} onSaved={onSaved} onClose={vi.fn()} />);
    await screen.findByTestId("decision-form");
    fireEvent.change(screen.getByTestId("form-content"), { target: { value: "我判断晕染方向影响妆面层次。" } });
    fireEvent.click(await screen.findByTestId("ref-concept-7"));
    fireEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const logDec = invokeMock.mock.calls.find((c) => c[0] === "log_decision");
    expect(logDec).toBeDefined();
    const a = logDec![1] as Args;
    expect(a.conceptId).toBeUndefined();
    expect(a.systemId).toBe(system.id);
    expect(asRefs(a.usedRefs).conceptIds).toEqual([7]);
  });
});
