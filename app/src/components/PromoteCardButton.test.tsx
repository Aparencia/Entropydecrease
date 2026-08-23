// @vitest-environment jsdom
/**
 * PromoteCardButton.test.tsx — 模型卡「纳入体系」交互测试（v0.13.2 §六）。
 *
 * @ai-context: 覆盖 §五 升格流——目标体系下拉默认全局（置顶高亮）、可切换领域体系、
 *              提交参数契约（promote_card_to_concept cardId/targetSystemId）、
 *              四分支结果文案（created/merged/hinted/already）。invoke 全 mock。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Flashcard } from "../types";
import type { KnowledgeConcept, KnowledgeSystem, PromoteResult } from "../types/knowledge";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import PromoteCardButton from "./PromoteCardButton";

const modelCard: Flashcard = {
  id: 5, groupId: 3, noteId: null, fragmentId: null,
  front: "安全边际", back: "本质：\n边界：\n联系：",
  kind: "model", stateJson: "{}", dueAt: 0, createdAt: 0,
};

const systems: KnowledgeSystem[] = [
  { id: 1, parentSystemId: null, name: "全局体系", kind: "global", coreQuestion: "如何练好化妆", status: "active", createdAt: 0, updatedAt: 0 },
  { id: 2, parentSystemId: 1, name: "化妆体系", kind: "domain", coreQuestion: null, status: "active", createdAt: 0, updatedAt: 0 },
];

const concept: KnowledgeConcept = {
  id: 9, systemId: 1, name: "安全边际", essence: "a", boundary: null, relation: null,
  status: "core", lastAppliedAt: null, createdAt: 0, updatedAt: 0,
};

let promoteResult: PromoteResult;

beforeEach(() => {
  invokeMock.mockReset();
  promoteResult = { action: "created", concept, link: null };
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "list_knowledge_systems") return systems;
    if (cmd === "promote_card_to_concept") return promoteResult;
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

function renderButton() {
  return render(<PromoteCardButton card={modelCard} />);
}

async function openPicker() {
  renderButton();
  fireEvent.click(screen.getByTestId("promote-open"));
  // 等体系列表异步加载完成（全局选项出现——此时下拉才有默认选中值）
  await screen.findByText("🌐 全局体系（默认）");
  return screen.getByTestId("promote-target") as HTMLSelectElement;
}

describe("PromoteCardButton 纳入体系", () => {
  it("默认目标体系为全局：打开后下拉选中全局且置顶标注「默认」", async () => {
    const select = await openPicker();
    expect(select).toBeTruthy();
    // 默认选中全局体系
    expect((select as HTMLSelectElement).value).toBe("1");
    const globalOption = screen.getByText("🌐 全局体系（默认）") as HTMLOptionElement;
    expect(globalOption).toBeTruthy();
  });

  it("切换目标体系：选领域体系确认 → 按契约调用 promote_card_to_concept", async () => {
    const select = await openPicker();
    fireEvent.change(select, { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("promote-confirm"));
    await screen.findByTestId("promote-status");
    expect(invokeMock).toHaveBeenCalledWith("promote_card_to_concept", { cardId: 5, targetSystemId: 2 });
  });

  it("四分支结果文案：created → 已纳入·创建概念", async () => {
    promoteResult = { action: "created", concept, link: null };
    await openPicker();
    fireEvent.click(screen.getByTestId("promote-confirm"));
    expect((await screen.findByTestId("promote-status")).textContent).toContain("已纳入·创建概念");
  });

  it("四分支结果文案：merged → 已关联既有概念", async () => {
    promoteResult = { action: "merged", concept, link: null };
    await openPicker();
    fireEvent.click(screen.getByTestId("promote-confirm"));
    expect((await screen.findByTestId("promote-status")).textContent).toContain("已关联既有概念");
  });

  it("四分支结果文案：hinted → 该概念属其他体系，暂不落库", async () => {
    promoteResult = { action: "hinted", concept, link: null };
    await openPicker();
    fireEvent.click(screen.getByTestId("promote-confirm"));
    expect((await screen.findByTestId("promote-status")).textContent).toContain("该概念属其他体系，暂不落库");
  });

  it("四分支结果文案：already → 已纳入（免重复）", async () => {
    promoteResult = { action: "already", concept, link: null };
    await openPicker();
    fireEvent.click(screen.getByTestId("promote-confirm"));
    expect((await screen.findByTestId("promote-status")).textContent).toContain("已纳入（免重复）");
  });
});
