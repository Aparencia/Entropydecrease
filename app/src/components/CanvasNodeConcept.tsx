/**
 * CanvasNodeConcept — 画布概念节点（v0.13.8 §4.2）。
 *
 * @ai-context: 浮动参照（§五 兼容）——概念节点在画布只做展示与选中联动，
 *              新建/编辑概念仍走「概念」标签页（画布无编辑入口，§九 不做清单）。
 *              展示：概念名 + 本质摘要 1 行 + 状态指示（核心/关注/已归档）。
 * @ai-context: 缩放分级（§七）——与问题节点同口径；概念无父关系，无 Handle
 *              （连线只反映问题树 parent_id，§二.4）。
 */
import { memo } from "react";
import { useStore, type Node, type NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "../utils/canvasElements";
import { CANVAS_BBOX } from "../utils/layoutRadial";

export type ConceptRfNode = Node<CanvasNodeData, "concept">;

export default memo(function CanvasNodeConcept({ data, selected }: NodeProps<ConceptRfNode>) {
  const zoom = useStore((s) => s.transform[2]);
  const full = zoom > 0.7;
  const titleOnly = zoom >= 0.4;

  return (
    <div
      data-testid={`canvas-node-c-${data.entityId}`}
      style={{
        width: CANVAS_BBOX.concept.w,
        borderRadius: 8,
        border: selected ? "2px solid #14b8a6" : "1px solid #e5e7eb",
        background: selected ? "#f0fdfa" : "#ffffff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        padding: 8,
      }}
    >
      {full ? (
        <>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 500, color: "#374151" }}>
            <span>🧬</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.title}</span>
          </div>
          {data.subtitle && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              本质：{data.subtitle}
            </div>
          )}
          {data.statusText && (
            <div style={{ fontSize: 10, color: data.statusColor ?? "#6b7280", marginTop: 4 }}>
              ● {data.statusText}
            </div>
          )}
        </>
      ) : titleOnly ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#374151" }}>
          <span>🧬</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.title}</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, color: "#4b5563" }}>
          <span>🧬</span>
          <span>{data.title.slice(0, 4)}{data.title.length > 4 ? "…" : ""}</span>
        </div>
      )}
    </div>
  );
});
