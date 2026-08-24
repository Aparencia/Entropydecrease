/**
 * KnowledgeCanvasView — 知识体系画布（v0.13.8 §4.2 主视图）。
 *
 * @ai-context: 画布=手动画布非自动图（REQ-029 P3）——节点位置由用户拖拽决定；
 *              首次打开（存在未布局问题节点）以辐射布局计算初始位置并批量入库，
 *              之后「自动排列」按钮才整体重排（规格 §4.4 纪律：算法只计算一次）。
 * @ai-context: 只展示+拖拽（§九 不做清单）——节点点击联动右栏详情面板（与树
 *              视图共享 selected 态）；编辑/新建仍走树视图与概念/模型标签页。
 * @ai-context: 概念/模型是浮动参照（无画布列——规格 DB 变更只加 knowledge_nodes
 *              canvas_x/y）：每次打开按辐射布局重排，不可拖拽（拖了也不持久）。
 * @ai-context: 视口经 knowledge_canvas_states 持久化——切回画布 setViewport 恢复
 *              （§4.5；无记录时 fitView 按内容兜底）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow,
  type Edge, type Node, type NodeProps, type OnMoveEnd, type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { KnowledgeConcept, KnowledgeLink, KnowledgeModel, KnowledgeNode } from "../types/knowledge";
import {
  buildCanvasElements, canvasKey, entityIdFromKey,
  type CanvasNodeData, type CanvasSelectKind,
} from "../utils/canvasElements";
import { CANVAS_BBOX, layoutRadial, type CanvasLayoutItem, type CanvasPoint } from "../utils/layoutRadial";
import CanvasNodeQuestion from "./CanvasNodeQuestion";
import CanvasNodeConcept from "./CanvasNodeConcept";
import CanvasNodeModel from "./CanvasNodeModel";

interface Props {
  systemId: number;
  /** 体系核心问题——存在时画布圆心渲染核心问题卡（布局圆心被虚拟核心占用） */
  coreQuestion: string | null;
  nodes: KnowledgeNode[];
  concepts: KnowledgeConcept[];
  models: KnowledgeModel[];
  links: KnowledgeLink[];
  /** 当前选中实体 key（`q:1`/`c:2`/`m:3`——与树视图/列表共享选中态） */
  selectedKey: string | null;
  onSelectItem: (kind: CanvasSelectKind, entityId: number) => void;
  /** 返回树视图（§4.5 切换） */
  onGoBack: () => void;
}

/** 自定义节点表（模块级常量——引用稳定，避免 RF 重渲染） */
const nodeTypes = {
  question: CanvasNodeQuestion,
  concept: CanvasNodeConcept,
  model: CanvasNodeModel,
  core: CanvasCoreNode,
};

/** 拖拽位置保存防抖（ms） */
const DRAG_DEBOUNCE_MS = 400;
/** 视口保存防抖（ms） */
const VIEWPORT_DEBOUNCE_MS = 500;

/** 圆心坐标 → React Flow 左上角坐标（DB/RF position 口径统一为左上角） */
function toTopLeft(center: CanvasPoint, bbox: { w: number; h: number }): CanvasPoint {
  return { x: center.x - bbox.w / 2, y: center.y - bbox.h / 2 };
}

export default function KnowledgeCanvasView(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasFlow {...props} />
    </ReactFlowProvider>
  );
}

function CanvasFlow({
  systemId, coreQuestion, nodes, concepts, models, links, selectedKey, onSelectItem, onGoBack,
}: Props) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [status, setStatus] = useState("");
  const { fitView, setViewport } = useReactFlow();

  // useReactFlow 返回值身份可能随渲染变化——ref 捕获避免恢复 effect 依赖抖动
  // （依赖 fitView/setViewport 身份变化会反复触发恢复循环）
  const rfApi = useRef({ fitView, setViewport });
  rfApi.current.fitView = fitView;
  rfApi.current.setViewport = setViewport;

  // 拖拽落点本地覆盖（props 未刷新前保持视图正确；systemId 切换随组件卸载清空）
  const localOverrides = useRef(new Map<number, CanvasPoint>());
  // 待保存拖拽位置（防抖批量刷 DB；卸载时兜底刷新）
  const pendingPositions = useRef(new Map<number, CanvasPoint>());
  const dragTimer = useRef<number | null>(null);
  const vpTimer = useRef<number | null>(null);

  const flushPending = useCallback(() => {
    if (dragTimer.current != null) {
      window.clearTimeout(dragTimer.current);
      dragTimer.current = null;
    }
    const entries = [...pendingPositions.current.entries()];
    pendingPositions.current.clear();
    for (const [nodeId, pos] of entries) {
      void invoke("update_node_canvas_position", { nodeId, canvasX: pos.x, canvasY: pos.y })
        .catch((e) => setStatus(`位置保存失败: ${e}`));
    }
  }, []);

  // 卸载兜底：清定时器 + 刷新未保存的拖拽落点（防切页丢失）
  useEffect(() => {
    return () => {
      if (dragTimer.current != null) window.clearTimeout(dragTimer.current);
      if (vpTimer.current != null) window.clearTimeout(vpTimer.current);
      if (pendingPositions.current.size > 0) {
        const entries = [...pendingPositions.current.entries()];
        pendingPositions.current.clear();
        for (const [nodeId, pos] of entries) {
          void invoke("update_node_canvas_position", { nodeId, canvasX: pos.x, canvasY: pos.y });
        }
      }
    };
  }, []);

  // 元素构建：位置 = 已存（props/本地覆盖）?? 辐射布局（首次不布局的节点）；
  // 首次打开（存在未布局问题节点）→ 批量初始化入库（规格 §4.3/§4.6）
  useEffect(() => {
    const layoutItems: CanvasLayoutItem[] = [
      ...nodes.map((n) => ({
        key: canvasKey("question", n.id),
        kind: "question" as const,
        parentKey: n.parentId != null ? canvasKey("question", n.parentId) : null,
      })),
      ...concepts.map((c) => ({ key: canvasKey("concept", c.id), kind: "concept" as const, parentKey: null })),
      ...models.map((m) => ({ key: canvasKey("model", m.id), kind: "model" as const, parentKey: null })),
    ];
    const layout = layoutRadial({ hasCore: coreQuestion != null, items: layoutItems });

    const positions = new Map<string, CanvasPoint>();
    let batchPersist: { nodeId: number; x: number; y: number }[] = [];
    for (const n of nodes) {
      const key = canvasKey("question", n.id);
      const local = localOverrides.current.get(n.id);
      const stored = n.canvasX != null && n.canvasY != null ? { x: n.canvasX, y: n.canvasY } : null;
      if (local) {
        positions.set(key, local);
      } else if (stored) {
        positions.set(key, stored);
      } else {
        const center = layout.get(key) ?? { x: 0, y: 0 };
        const tl = toTopLeft(center, CANVAS_BBOX.question);
        positions.set(key, tl);
        batchPersist.push({ nodeId: n.id, x: tl.x, y: tl.y });
      }
    }
    for (const c of concepts) {
      const center = layout.get(canvasKey("concept", c.id)) ?? { x: 0, y: 0 };
      positions.set(canvasKey("concept", c.id), toTopLeft(center, CANVAS_BBOX.concept));
    }
    for (const m of models) {
      const center = layout.get(canvasKey("model", m.id)) ?? { x: 0, y: 0 };
      positions.set(canvasKey("model", m.id), toTopLeft(center, CANVAS_BBOX.model));
    }
    if (batchPersist.length > 0) {
      // 首次打开（或新增未布局节点）→ 批量初始化；失败不阻塞渲染（下次打开重试）
      void invoke("batch_initialize_canvas_positions", { systemId, positions: batchPersist })
        .catch((e) => setStatus(`布局初始化失败: ${e}`));
    }

    const { nodes: rfn, edges } = buildCanvasElements({ nodes, concepts, models, links, positions, selectedKey });
    const extras: Node<CanvasNodeData>[] = [];
    if (coreQuestion) {
      extras.push({
        id: "core",
        type: "core",
        position: { x: -120, y: -40 },
        draggable: false,
        selectable: false,
        focusable: false,
        data: { kind: "question", entityId: 0, title: coreQuestion, subtitle: null, badges: [], statusText: null, statusColor: null, refCount: 0 },
      });
    }
    setRfNodes([...rfn, ...extras]);
    setRfEdges(edges);
  }, [systemId, coreQuestion, nodes, concepts, models, links, selectedKey, setRfNodes, setRfEdges]);

  // 视口恢复（§4.5）：已存 → setViewport；未存 → fitView 按内容兜底
  useEffect(() => {
    void invoke<{ viewportX: number; viewportY: number; zoom: number } | null>("get_canvas_viewport", { systemId })
      .then((vp) => {
        if (vp) rfApi.current.setViewport({ x: vp.viewportX, y: vp.viewportY, zoom: vp.zoom });
        else void rfApi.current.fitView({ padding: 0.15 });
      })
      .catch(() => void rfApi.current.fitView({ padding: 0.15 }));
  }, [systemId]);

  // 拖拽结束 → 本地覆盖 + 防抖批量保存（规格 §4.3 onNodeDragStop → debounce → invoke）
  const onNodeDragStop = useCallback((_e: unknown, node: Node<CanvasNodeData>) => {
    const nodeId = entityIdFromKey(node.id);
    if (nodeId == null) return;
    const pos = { x: node.position.x, y: node.position.y };
    localOverrides.current.set(nodeId, pos);
    pendingPositions.current.set(nodeId, pos);
    if (dragTimer.current != null) window.clearTimeout(dragTimer.current);
    dragTimer.current = window.setTimeout(flushPending, DRAG_DEBOUNCE_MS);
  }, [flushPending]);

  // 节点点击 → 选中联动（与树视图/概念列表共享右栏面板）
  const onNodeClick = useCallback((_e: unknown, node: Node<CanvasNodeData>) => {
    const entityId = entityIdFromKey(node.id);
    if (entityId == null) return;
    const kind: CanvasSelectKind = node.data.kind === "question" ? "node" : node.data.kind;
    onSelectItem(kind, entityId);
  }, [onSelectItem]);

  // 视口变化（平移/缩放结束）→ 防抖保存（§4.6 save_canvas_viewport）
  const onMoveEnd: OnMoveEnd = useCallback((_e, viewport: Viewport) => {
    if (vpTimer.current != null) window.clearTimeout(vpTimer.current);
    vpTimer.current = window.setTimeout(() => {
      void invoke("save_canvas_viewport", {
        systemId, viewportX: viewport.x, viewportY: viewport.y, zoom: viewport.zoom,
      }).catch((e) => setStatus(`视口保存失败: ${e}`));
    }, VIEWPORT_DEBOUNCE_MS);
  }, [systemId]);

  // 「自动排列」：整体重排 + 批量覆盖 + fitView（规格 §4.4：用户显式触发才覆盖已存位置）
  const autoLayout = () => {
    const layoutItems: CanvasLayoutItem[] = [
      ...nodes.map((n) => ({
        key: canvasKey("question", n.id),
        kind: "question" as const,
        parentKey: n.parentId != null ? canvasKey("question", n.parentId) : null,
      })),
      ...concepts.map((c) => ({ key: canvasKey("concept", c.id), kind: "concept" as const, parentKey: null })),
      ...models.map((m) => ({ key: canvasKey("model", m.id), kind: "model" as const, parentKey: null })),
    ];
    const layout = layoutRadial({ hasCore: coreQuestion != null, items: layoutItems });
    const positions = new Map<string, CanvasPoint>();
    const persist: { nodeId: number; x: number; y: number }[] = [];
    for (const n of nodes) {
      const tl = toTopLeft(layout.get(canvasKey("question", n.id)) ?? { x: 0, y: 0 }, CANVAS_BBOX.question);
      positions.set(canvasKey("question", n.id), tl);
      persist.push({ nodeId: n.id, x: tl.x, y: tl.y });
      localOverrides.current.set(n.id, tl);
    }
    for (const c of concepts) {
      positions.set(canvasKey("concept", c.id), toTopLeft(layout.get(canvasKey("concept", c.id)) ?? { x: 0, y: 0 }, CANVAS_BBOX.concept));
    }
    for (const m of models) {
      positions.set(canvasKey("model", m.id), toTopLeft(layout.get(canvasKey("model", m.id)) ?? { x: 0, y: 0 }, CANVAS_BBOX.model));
    }
    const { nodes: rfn, edges } = buildCanvasElements({ nodes, concepts, models, links, positions, selectedKey });
    setRfNodes(rfn);
    setRfEdges(edges);
    void invoke("batch_initialize_canvas_positions", { systemId, positions: persist })
      .catch((e) => setStatus(`布局保存失败: ${e}`));
    void fitView({ padding: 0.15 });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 顶部：返回树视图（§4.5 内嵌切换——标签页栏「画布」项与这里互通） */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
        <button data-testid="canvas-back" onClick={onGoBack} style={{ fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff", color: "#374151" }}>
          ← 树视图
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>🗺 知识画布</span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>拖拽整理你的知识结构——位置只由你决定</span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={onMoveEnd}
          minZoom={0.1}
          maxZoom={2}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          fitView={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <MiniMap pannable zoomable />
          <Controls />
          <Panel position="top-right" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              data-testid="canvas-auto-layout"
              onClick={autoLayout}
              style={{ fontSize: 11, cursor: "pointer", padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151" }}
            >
              ✨ 自动排列
            </button>
            <button
              data-testid="canvas-fit-view"
              onClick={() => void fitView({ padding: 0.15 })}
              style={{ fontSize: 11, cursor: "pointer", padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151" }}
            >
              ⛶ 适配视图
            </button>
          </Panel>
        </ReactFlow>
      </div>
      {status && <p data-testid="canvas-status" style={{ padding: "4px 10px", fontSize: 12, color: "#dc2626" }}>{status}</p>}
    </div>
  );
}

/** 核心问题节点（虚拟中心——不可拖/不可选，仅展示体系核心问题） */
function CanvasCoreNode({ data }: NodeProps<Node<CanvasNodeData, "core">>) {
  return (
    <div
      data-testid="canvas-core"
      style={{ maxWidth: 240, borderRadius: 10, padding: "10px 14px", background: "#0f766e", color: "#fff", border: "1px solid #0f766e", boxShadow: "0 2px 8px rgba(15,118,110,0.25)" }}
    >
      <div style={{ fontSize: 11, opacity: 0.85 }}>核心问题</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{data.title}</div>
    </div>
  );
}
