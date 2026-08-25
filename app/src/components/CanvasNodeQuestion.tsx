/**
 * CanvasNodeQuestion — 画布问题节点（v0.13.8 §4.2）。
 *
 * @ai-context: 只渲染不编辑（§九 不做清单：画布上不新建/编辑节点）——点击选中
 *              联动右栏详情面板，编辑仍走树视图/详情面板。展示：标题 2 行省略 +
 *              关联概念/模型徽标（links 引用）+ 引用计数，复用树视图的引用口径。
 * @ai-context: 缩放分级（§七）——zoom>0.7 完整内容；0.4~0.7 仅标题；<0.4 缩略卡
 *              （图标 + 名称缩写）。Handle 透明化——用户不能画线即建引用（§二.4）。
 */
import { memo } from "react";
import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "../utils/canvasElements";
import { CANVAS_BBOX } from "../utils/layoutRadial";
import { nodeTypeColor, nodeTypeLabel, type KnowledgeNodeType } from "../types/knowledge";

export type QuestionRfNode = Node<CanvasNodeData, "question">;

/** 节点类型图标（与 chip 同源） */
const typeIcon: Record<KnowledgeNodeType, string> = {
  question: "❓",
  scenario: "🎯",
  domain_entry: "📂",
};

/** v0.13.9：四边 Handle 统一样式（透明化——连线只反映既有关系，用户不能画线） */
const hiddenHandle: React.CSSProperties = { opacity: 0, width: 2, height: 2 };


/** 标题最多 2 行省略（内容为问题文本，宽 220px 下 2 行足够） */
const clamp2: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

/** 徽标小 chip（概念/模型/引用三类共用视觉语言） */
function badgeStyle(kind: CanvasNodeData["badges"][number]["kind"]): React.CSSProperties {
  if (kind === "concept") return { background: "#f0fdfa", color: "#0f766e", border: "1px solid #99f6e4" };
  return { background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe" };
}

export default memo(function CanvasNodeQuestion({ data, selected }: NodeProps<QuestionRfNode>) {
  const zoom = useStore((s) => s.transform[2]);
  const full = zoom > 0.7;
  const titleOnly = zoom >= 0.4;

  return (
    <div
      data-testid={`canvas-node-q-${data.entityId}`}
      style={{
        width: CANVAS_BBOX.question.w,
        borderRadius: 8,
        border: selected ? "2px solid #14b8a6" : "1px solid #d1d5db",
        background: selected ? "#f0fdfa" : "#ffffff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        padding: 8,
      }}
    >
      {/* v0.13.9：四边 Handle——接线方向随源/目标相对方位动态选择
          （resolveEdgeHandles）；透明化——连线只反映既有关系，用户不能画线 */}
      <Handle type="target" id="target-top" position={Position.Top} style={hiddenHandle} />
      <Handle type="target" id="target-bottom" position={Position.Bottom} style={hiddenHandle} />
      <Handle type="target" id="target-left" position={Position.Left} style={hiddenHandle} />
      <Handle type="target" id="target-right" position={Position.Right} style={hiddenHandle} />
      <Handle type="source" id="source-top" position={Position.Top} style={hiddenHandle} />
      <Handle type="source" id="source-bottom" position={Position.Bottom} style={hiddenHandle} />
      <Handle type="source" id="source-left" position={Position.Left} style={hiddenHandle} />
      <Handle type="source" id="source-right" position={Position.Right} style={hiddenHandle} />

      {full ? (
        <>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, fontWeight: 500, color: "#374151" }}>
            {/* v0.13.9：类型 chip（此前统一 ❓ 无法区分问题/场景/领域入口） */}
            {data.nodeType && (
              <span
                data-testid={`canvas-node-type-${data.entityId}`}
                style={{ fontSize: 10, borderRadius: 8, padding: "0 5px", lineHeight: 1.7, whiteSpace: "nowrap", background: "#f9fafb", color: nodeTypeColor[data.nodeType], border: `1px solid ${nodeTypeColor[data.nodeType]}33` }}
              >
                {typeIcon[data.nodeType]} {nodeTypeLabel[data.nodeType]}
              </span>
            )}
            <span style={clamp2}>{data.title}</span>
          </div>
          {data.badges.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5, alignItems: "center" }}>
              {data.badges.map((b) => (
                <span key={b.kind + b.text} style={{ fontSize: 10, borderRadius: 8, padding: "0 5px", lineHeight: 1.6, ...badgeStyle(b.kind) }}>
                  {b.kind === "concept" ? "🧬" : "◇"} {b.text}
                </span>
              ))}
            </div>
          )}
          {data.refCount > 0 && (
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 5 }}>📋 {data.refCount} 条笔记</div>
          )}
        </>
      ) : titleOnly ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#374151" }}>
          <span>❓</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.title}</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, color: "#4b5563" }}>
          <span>❓</span>
          <span>{data.title.slice(0, 4)}{data.title.length > 4 ? "…" : ""}</span>
        </div>
      )}
    </div>
  );
});
