/**
 * KnowledgeGraphView — 多关系分层图谱视图（v0.14 C2）。
 *
 * @ai-context: spec §3.2——React Flow 画布 + 三类边图层开关（🔗 引用 / 🧬 溯源 /
 *              📁 归属，默认仅引用层）+ 局部聚焦（单击节点 → 1~2 度邻居展开，
 *              其余淡出）+ 节点按类型着色（B 子项目色板）。单击=聚焦（浏览），
 *              双击=跳转（note→笔记页 / group→笔记页过滤 / concept·model→体系页）。
 *              范围外：拖拽编辑（nodesDraggable=false，位置由 layoutGraph 计算）。
 *              数据源 graph_snapshot() 单次拉取（spec §3.2 后端裁决）。
 *              错误处理（spec §5）：加载失败/空图 → 空态 + 重试按钮。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider,
  useReactFlow, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  DEFAULT_LAYERS,
  LAYER_META,
  NODE_KIND_COLOR,
  filterEdges,
  focusSubgraph,
  layoutGraph,
  type GraphEdgeType,
  type GraphLayers,
  type GraphNodeKind,
  type GraphSnapshot,
} from "../utils/graphSnapshot";
import { isColorId, onColorText, paletteHex, type ThemeMode } from "../utils/colorPalette";

/** 图谱节点 data（RF 节点 data 契约——跳转/着色所需全部字段）
 * 注意：type 而非 interface——RF v12 Node<T> 约束 Record<string, unknown>，
 * interface 无隐式索引签名（canvasElements 同款经验）。 */
export type GraphRfData = {
  kind: GraphNodeKind;
  label: string;
  color: string | null;
  entityId: number;
  systemId: number | null;
  /** 聚焦中心（高亮描边） */
  focused: boolean;
  /** 聚焦范围外（淡出） */
  dimmed: boolean;
};

export type GraphRfNode = Node<GraphRfData>;

/** 边样式按类型（link 实线 / trace 虚线 / belong 点线——图层可辨识） */
const EDGE_STYLE: Record<GraphEdgeType, React.CSSProperties> = {
  link: { stroke: "#0d9488", strokeWidth: 1.5 },
  trace: { stroke: "#8e4ec6", strokeWidth: 1.2, strokeDasharray: "5 3" },
  belong: { stroke: "#9ca3af", strokeWidth: 1, strokeDasharray: "2 3" },
};

/** 自定义节点表（模块级常量——引用稳定，避免 RF 重渲染） */
const nodeTypes = { graphNode: GraphNodeView };

interface Props {
  onOpenNote: (noteId: number) => void;
  /** 跳笔记页并过滤该组 */
  onOpenGroup: (groupId: number) => void;
  onOpenSystem: (systemId: number) => void;
  /** 外部刷新令牌（C3 联动：挂接/删除后重拉图谱） */
  refreshToken?: number;
}

export default function KnowledgeGraphView(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphFlow {...props} />
    </ReactFlowProvider>
  );
}

function GraphFlow({ onOpenNote, onOpenGroup, onOpenSystem, refreshToken }: Props) {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [layers, setLayers] = useState<GraphLayers>(DEFAULT_LAYERS);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const { fitView } = useReactFlow();

  // useReactFlow 返回值身份可能随渲染变化——ref 捕获避免 effect 依赖抖动
  const rfApi = useRef({ fitView });
  rfApi.current.fitView = fitView;

  const load = useCallback(async () => {
    try {
      const snap = await invoke<GraphSnapshot>("graph_snapshot");
      setSnapshot(snap);
      setStatus("");
    } catch (e) {
      setStatus(`图谱加载失败: ${e}`);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // 数据就绪后 fit 全图（浏览视图初始视野；用户缩放后不覆盖）
  useEffect(() => {
    if (!snapshot || snapshot.nodes.length === 0) return;
    const t = window.setTimeout(() => rfApi.current.fitView({ padding: 0.15, duration: 200 }), 50);
    return () => window.clearTimeout(t);
  }, [snapshot]);

  // 节点/边构建：图层过滤 → 局部聚焦（聚焦时节点全集渲染、范围外淡出——
  // spec「其余淡出」非隐藏；边仅保留两端都在聚焦集内）
  const { rfNodes, rfEdges, visibleCount } = useMemo(() => {
    const nodes = snapshot?.nodes ?? [];
    const allEdges = snapshot?.edges ?? [];
    const visibleEdges = filterEdges(allEdges, layers);
    const focus = focusSubgraph(nodes, visibleEdges, focusId, 2);
    const pos = layoutGraph(nodes);
    const rf = nodes.map((n) => {
      const inFocus = focusId == null || focus.nodeIds.has(n.id);
      return {
        id: n.id,
        type: "graphNode",
        position: pos[n.id] ?? { x: 0, y: 0 },
        data: {
          kind: n.kind, label: n.label, color: n.color,
          entityId: n.entityId, systemId: n.systemId ?? null,
          focused: focusId === n.id, dimmed: !inFocus,
        } satisfies GraphRfData,
        style: inFocus ? undefined : { opacity: 0.15, pointerEvents: "none" },
      } satisfies GraphRfNode;
    });
    const edges = focus.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, style: EDGE_STYLE[e.type],
    }));
    return { rfNodes: rf, rfEdges: edges, visibleCount: visibleEdges.length };
  }, [snapshot, layers, focusId]);

  // 双击跳转（note→笔记页 / group→笔记页过滤组 / concept·model→体系页）
  const handleNodeDoubleClick = useCallback(
    (_e: React.MouseEvent, node: GraphRfNode) => {
      const d = node.data;
      if (d.kind === "note") onOpenNote(d.entityId);
      else if (d.kind === "group") onOpenGroup(d.entityId);
      else if (d.systemId != null) onOpenSystem(d.systemId);
    },
    [onOpenNote, onOpenGroup, onOpenSystem],
  );

  const toggleLayer = (type: GraphEdgeType) => {
    setLayers((cur) => ({ ...cur, [type]: !cur[type] }));
  };

  const empty = !!snapshot && snapshot.nodes.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 工具栏：图层开关 + 计数 + 交互提示 */}
      <div data-testid="graph-toolbar" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" }}>
        {(Object.keys(LAYER_META) as GraphEdgeType[]).map((type) => (
          <button
            key={type}
            data-testid={`graph-layer-${type}`}
            onClick={() => toggleLayer(type)}
            title={layers[type] ? `关闭${LAYER_META[type].label}层` : `打开${LAYER_META[type].label}层`}
            style={{
              fontSize: 11, cursor: "pointer", padding: "3px 10px", borderRadius: 12,
              border: layers[type] ? "1px solid #0d9488" : "1px solid #e5e7eb",
              background: layers[type] ? "#f0fdfa" : "#fff",
              color: layers[type] ? "#0f766e" : "#9ca3af", fontWeight: layers[type] ? 600 : 400,
            }}
          >
            {LAYER_META[type].icon} {LAYER_META[type].label}
          </button>
        ))}
        {snapshot && (
          <span data-testid="graph-counts" style={{ fontSize: 11, color: "#9ca3af" }}>
            {snapshot.nodes.length} 节点 · {visibleCount} 边
          </span>
        )}
        <span style={{ fontSize: 10, color: "#d1d5db", marginLeft: "auto" }}>单击聚焦 · 双击跳转</span>
      </div>

      {status && (
        <div data-testid="graph-error" style={{ padding: "8px 12px", fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 8 }}>
          {status}
          <button data-testid="graph-retry" onClick={() => void load()} style={{ fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #fca5a5", background: "#fff" }}>
            重试
          </button>
        </div>
      )}

      {empty ? (
        /* 空态（spec §5：空图不阻塞其他功能；重试按钮） */
        <div data-testid="graph-empty" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#9ca3af", fontSize: 13 }}>
          <div style={{ fontSize: 36 }}>🕸</div>
          <p>图谱还是空的——挂接笔记/概念后这里会出现关系。</p>
          <button data-testid="graph-retry" onClick={() => void load()} style={{ fontSize: 12, cursor: "pointer", padding: "4px 12px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>
            刷新
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            fitView={false}
            minZoom={0.2}
            onNodeClick={(_e, node) => setFocusId((cur) => (cur === node.id ? null : node.id))}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={() => setFocusId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#e5e7eb" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}

/** 图谱节点卡（按类型着色——B 子项目色板；聚焦中心高亮描边） */
function GraphNodeView({ data }: NodeProps<GraphRfNode>) {
  const theme: ThemeMode = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const colorId = data.color && isColorId(data.color) ? data.color : NODE_KIND_COLOR[data.kind];
  const hex = paletteHex(colorId, theme);
  const text = onColorText(colorId, theme);
  return (
    <div
      data-testid={`graph-node-${data.kind}-${data.entityId}`}
      style={{
        width: 150, padding: "6px 10px", borderRadius: 8, background: hex,
        boxShadow: data.focused ? "0 0 0 2px #fff, 0 0 0 4px #0f766e" : "0 1px 4px rgba(0,0,0,0.15)",
        cursor: "pointer", userSelect: "none",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {data.label}
      </div>
      <div style={{ fontSize: 9, color: text, opacity: 0.85 }}>{kindLabel[data.kind]}</div>
    </div>
  );
}

/** 节点类型小字（节点卡第二行） */
const kindLabel: Record<GraphNodeKind, string> = {
  note: "笔记",
  concept: "概念",
  model: "模型",
  group: "组",
};
