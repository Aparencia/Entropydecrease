/**
 * knowledgeSample.test.ts — 摄影示例体系常量结构校验（v0.13.7 具象化）。
 *
 * @ai-context: 示例数据即 golden——节点层级/概念三问/模型三字段/决策四行
 *              必须完整，缺字段=示例残缺（具象化失败）。
 */
import { describe, expect, it } from "vitest";
import { SAMPLE_SYSTEM } from "./knowledgeSample";

describe("SAMPLE_SYSTEM 结构完整性", () => {
  it("领域体系元数据完整", () => {
    expect(SAMPLE_SYSTEM.name).toBe("摄影");
    expect(SAMPLE_SYSTEM.kind).toBe("domain");
  });

  it("问题树 7 节点且含层级（有父节点）", () => {
    expect(SAMPLE_SYSTEM.nodes.length).toBe(7);
    expect(SAMPLE_SYSTEM.nodes.some((n) => n.parentId != null)).toBe(true);
    expect(SAMPLE_SYSTEM.nodes.some((n) => n.type === "scenario")).toBe(true);
  });

  it("概念 3 个且三问全填", () => {
    expect(SAMPLE_SYSTEM.concepts.length).toBe(3);
    for (const c of SAMPLE_SYSTEM.concepts) {
      expect(c.essence).toBeTruthy();
      expect(c.boundary).toBeTruthy();
      expect(c.relation).toBeTruthy();
    }
  });

  it("模型 1 个且 claim/valid_when/invalid_when 全填", () => {
    expect(SAMPLE_SYSTEM.models.length).toBe(1);
    const m = SAMPLE_SYSTEM.models[0];
    expect(m.claim).toBeTruthy();
    expect(m.validWhen).toBeTruthy();
    expect(m.invalidWhen).toBeTruthy();
  });
});
