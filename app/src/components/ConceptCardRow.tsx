/**
 * ConceptCardRow — 概念库三问一用卡片（v0.13.2 §五 中栏概念列表升级）。
 *
 * @ai-context: 概念卡只展示记忆面"随手能读"的一层——name + 三问摘要（essence
 *              单行省略，缺则退边界/联系）+ 最近应用标签 + 状态徽标。不预填内容
 *              （预填＝假燃料）；点击进详情面板做完整三问编辑。
 * @ai-context: 最近应用标签（§五）——lastAppliedAt 有值→"最近应用"，null→
 *              "从未应用"；v0.13.3 接线"记一次使用"前恒为未应用，本版只展示占位。
 * @ai-context: 概念名全局唯一（§二 UNIQUE）——行点击只选中，不做改名入口。
 */
import type { KnowledgeConcept } from "../types/knowledge";
import { conceptStatusLabel } from "../types/knowledge";

interface Props {
  concept: KnowledgeConcept;
  /** 是否选中（行高亮 + 边框） */
  selected: boolean;
  /** 单击选中回调节奏（父页 setSelection） */
  onSelect: () => void;
}

export default function ConceptCardRow({ concept, selected, onSelect }: Props) {
  // 三问摘要：essence 优先；缺（null/空）则取 boundary/relation 首个非空（§五）
  const summary = concept.essence || concept.boundary || concept.relation || "";
  const appliedLabel = concept.lastAppliedAt != null ? "最近应用" : "从未应用";

  return (
    <div
      data-testid={`concept-row-${concept.id}`}
      onClick={onSelect}
      style={{
        padding: "6px 8px", borderRadius: 6, cursor: "pointer",
        background: selected ? "#f0fdfa" : "transparent",
        border: selected ? "1px solid #99f6e4" : "1px solid transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{concept.name}</span>
        <span style={{ fontSize: 10, color: "#7c3aed", background: "#faf5ff", borderRadius: 8, padding: "0 5px" }}>{conceptStatusLabel[concept.status]}</span>
      </div>
      {summary && (
        <div data-testid={`concept-summary-${concept.id}`} style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summary}
        </div>
      )}
      <div data-testid={`concept-applied-${concept.id}`} style={{ fontSize: 10, color: concept.lastAppliedAt != null ? "#0f766e" : "#9ca3af", marginTop: 2 }}>
        {appliedLabel}
      </div>
    </div>
  );
}
