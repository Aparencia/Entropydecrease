// @vitest-environment jsdom
/**
 * ConceptCardRow.test.tsx — 概念库三问一用卡片渲染测试（v0.13.2 §五）。
 *
 * @ai-context: 覆盖知识库概念行升级——三问摘要（essence 单行省略，缺则退边界/联系）、
 *              最近应用标签（lastAppliedAt null→"从未应用"；v0.13.3 前恒为未应用）、
 *              状态徽标（conceptStatusLabel）。纯展示组件，不触 invoke。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { KnowledgeConcept } from "../types/knowledge";

import ConceptCardRow from "./ConceptCardRow";

const concept: KnowledgeConcept = {
  id: 7, systemId: 1, name: "安全边际",
  essence: "赔率领先", boundary: "不是分散仓位", relation: "与仓位相关",
  status: "core", lastAppliedAt: null, createdAt: 0, updatedAt: 0,
};

afterEach(() => cleanup());

function renderRow(c: KnowledgeConcept) {
  return render(<ConceptCardRow concept={c} selected={false} onSelect={vi.fn()} />);
}

describe("ConceptCardRow 三问一用卡片", () => {
  it("渲染：名称 + 状态徽标 + 三问摘要（essence 单行）", () => {
    renderRow(concept);
    expect(screen.getByTestId("concept-row-7").textContent).toContain("安全边际");
    // 状态徽标（conceptStatusLabel：core → 核心）
    expect(screen.getByTestId("concept-row-7").textContent).toContain("核心");
    // 三问摘要取 essence
    expect(screen.getByTestId("concept-summary-7").textContent).toBe("赔率领先");
  });

  it("从未应用标签：lastAppliedAt 为 null → 显示「从未应用」", () => {
    renderRow(concept);
    expect(screen.getByTestId("concept-applied-7").textContent).toBe("从未应用");
  });

  it("最近应用标签：lastAppliedAt 有值 → 显示「最近应用」", () => {
    renderRow({ ...concept, lastAppliedAt: 1_700_000_000_000 });
    expect(screen.getByTestId("concept-applied-7").textContent).toBe("最近应用");
  });

  it("三问摘要回退：essence 为 null → 取 boundary 首个非空", () => {
    renderRow({ ...concept, essence: null });
    expect(screen.getByTestId("concept-summary-7").textContent).toBe("不是分散仓位");
  });
});
