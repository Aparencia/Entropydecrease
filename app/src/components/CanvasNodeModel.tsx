/**
 * CanvasNodeModel — 画布模型节点（v0.13.8 §4.2）。
 *
 * @ai-context: 浮动参照（§五 兼容）——模型节点只做展示与选中联动，新建/编辑
 *              走「模型」标签页（§九 不做清单）。展示：模型名 + 主张摘录 1 行
 *              + 学科标签（🏷 disciplines ≥1——model 数据契约保证非空）。
 * @ai-context: 缩放分级（§七）——与问题/概念节点同口径；无 Handle（§二.4）。
 */
import { memo } from "react";
import { useStore, type Node, type NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "../utils/canvasElements";
import { CANVAS_BBOX } from "../utils/layoutRadial";

export type ModelRfNode = Node<CanvasNodeData, "model">;

export default memo(function CanvasNodeModel({ data, selected }: NodeProps<ModelRfNode>) {
  const zoom = useStore((s) => s.transform[2]);
  const full = zoom > 0.7;
  const titleOnly = zoom >= 0.4;

  return (
    <div
      data-testid={`canvas-node-m-${data.entityId}`}
      style={{
        width: CANVAS_BBOX.model.w,
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
            <span>⚙</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.title}</span>
          </div>
          {data.subtitle && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data.subtitle}
            </div>
          )}
          {data.badges.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
              {data.badges.map((b) => (
                <span key={b.text} style={{ fontSize: 10, borderRadius: 8, padding: "0 5px", lineHeight: 1.6, background: "#f9fafb", color: "#6b7280", border: "1px solid #e5e7eb" }}>
                  🏷 {b.text}
                </span>
              ))}
            </div>
          )}
        </>
      ) : titleOnly ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#374151" }}>
          <span>⚙</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.title}</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, color: "#4b5563" }}>
          <span>⚙</span>
          <span>{data.title.slice(0, 4)}{data.title.length > 4 ? "…" : ""}</span>
        </div>
      )}
    </div>
  );
});
