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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Background, BackgroundVariant, Controls, Handle, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow,
  type Edge, type Node, type NodeProps, type OnMoveEnd, type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CanvasPrefs, EdgeStyle, KnowledgeConcept, KnowledgeLink, KnowledgeModel, KnowledgeNode, CanvasNodePosition, LayoutAlgorithm } from "../types/knowledge";
import { DEFAULT_CANVAS_PREFS, EDGE_STYLE_OPTIONS, LAYOUT_OPTIONS } from "../types/knowledge";
import {
  buildCanvasElements, canvasKey, entityIdFromKey, resolveEdgeHandles,
  type CanvasNodeData, type CanvasSelectKind,
} from "../utils/canvasElements";
import { CANVAS_BBOX, type CanvasLayoutItem, type CanvasPoint } from "../utils/layoutRadial";
import { layoutCanvas } from "../utils/layoutCanvas";
import CanvasNodeQuestion from "./CanvasNodeQuestion";
import CanvasNodeConcept from "./CanvasNodeConcept";
import CanvasNodeModel from "./CanvasNodeModel";

interface Props {
  systemId: number;
  /** 体系核心问题——存在时画布圆心渲染核心问题卡（布局圆心被虚拟核心占用） */
  coreQuestion: string | null;
  /** v0.13.9：体系名——coreQuestion 为空（领域体系）时圆心渲染体系名卡 */
  systemName: string | null;
  nodes: KnowledgeNode[];
  concepts: KnowledgeConcept[];
  models: KnowledgeModel[];
  links: KnowledgeLink[];
  /** 当前选中实体 key（`q:1`/`c:2`/`m:3`——与树视图/列表共享选中态） */
  selectedKey: string | null;
  onSelectItem: (kind: CanvasSelectKind, entityId: number) => void;
  /**
   * 位置持久化成功回调（父页合并进 nodes props——重挂载后 props 即为已存位置，
   * 杜绝"辐射布局重算覆盖已拖走位置"；规格 §4.4 纪律：位置只由用户决定）。
   */
  onPositionsSaved?: (updates: CanvasNodePosition[]) => void;
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
  systemId, coreQuestion, systemName, nodes, concepts, models, links, selectedKey, onSelectItem, onPositionsSaved, onGoBack,
}: Props) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [status, setStatus] = useState("");
  // v0.14.1：画布偏好（连线样式/箭头/布局算法——按体系持久化；加载完成前不布局）
  const [prefs, setPrefs] = useState<CanvasPrefs>(DEFAULT_CANVAS_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // 审查修复：边样式经 ref 供布局 effect 取最新值（布局 effect 依赖已原子化为
  // layoutAlgorithm——连线/箭头切换走独立重建 effect，不重算布局不重复写库）
  const edgePrefsRef = useRef({ edgeStyle: DEFAULT_CANVAS_PREFS.edgeStyle, edgeArrows: DEFAULT_CANVAS_PREFS.edgeArrows });
  edgePrefsRef.current = { edgeStyle: prefs.edgeStyle, edgeArrows: prefs.edgeArrows };
  // 最近一次完整构建输入（连线样式重建 effect 的数据源——布局结果不因边样式丢）
  const buildInputRef = useRef<{
    nodes: KnowledgeNode[]; concepts: KnowledgeConcept[]; models: KnowledgeModel[];
    links: KnowledgeLink[]; positions: Map<string, CanvasPoint>; selectedKey: string | null;
    rootCard: { title: string; subtitle: string } | null;
  } | null>(null);
  const { fitView, setViewport } = useReactFlow();

  // v0.13.9：体系根卡（全局=核心问题 / 领域=体系名）——null 时不渲染圆心卡
  // （防御：无核心问题也无体系名的异常态保持旧行为，不凭空造根）
  const rootCard = useMemo<{ title: string; subtitle: string } | null>(() => {
    if (coreQuestion) return { title: coreQuestion, subtitle: "核心问题" };
    if (systemName) return { title: systemName, subtitle: "领域体系" };
    return null;
  }, [coreQuestion, systemName]);

  // useReactFlow 返回值身份可能随渲染变化——ref 捕获避免恢复 effect 依赖抖动
  // （依赖 fitView/setViewport 身份变化会反复触发恢复循环）
  const rfApi = useRef({ fitView, setViewport });
  rfApi.current.fitView = fitView;
  rfApi.current.setViewport = setViewport;

  // onPositionsSaved 经 ref 透传：防抖/卸载回调在闭包外执行，ref 保证拿到最新回调
  const savedRef = useRef(onPositionsSaved);
  savedRef.current = onPositionsSaved;

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
    if (entries.length === 0) return;
    // 全部成功才回传父页合并（部分失败不污染 props——下次重挂载用 DB 兜底）
    void Promise.all(
      entries.map(([nodeId, pos]) =>
        invoke("update_node_canvas_position", { nodeId, canvasX: pos.x, canvasY: pos.y }),
      ),
    )
      .then(() => savedRef.current?.(entries.map(([nodeId, pos]) => ({ nodeId, x: pos.x, y: pos.y }))))
      .catch((e) => setStatus(`位置保存失败: ${e}`));
  }, []);

  // 卸载兜底：清定时器 + 刷新未保存的拖拽落点（防切页丢失；父页存活，合并安全）
  useEffect(() => {
    return () => {
      if (dragTimer.current != null) window.clearTimeout(dragTimer.current);
      if (vpTimer.current != null) window.clearTimeout(vpTimer.current);
      if (pendingPositions.current.size > 0) {
        const entries = [...pendingPositions.current.entries()];
        pendingPositions.current.clear();
        void Promise.all(
          entries.map(([nodeId, pos]) =>
            invoke("update_node_canvas_position", { nodeId, canvasX: pos.x, canvasY: pos.y }),
          ),
        ).then(() => savedRef.current?.(entries.map(([nodeId, pos]) => ({ nodeId, x: pos.x, y: pos.y }))));
      }
    };
  }, []);

  // 元素构建：位置 = 已存（props/本地覆盖）?? 已选算法布局（首次不布局的节点）；
  // 首次打开（存在未布局问题节点）→ 批量初始化入库（规格 §4.3/§4.6）
  useEffect(() => {
    // v0.14.1：偏好未加载完成不布局——防"默认辐射先写库、用户偏好后到"的竞态
    // （首开缺位节点按已存布局算法初始化，一次写入）
    if (!prefsLoaded) return;
    const layoutItems: CanvasLayoutItem[] = [
      ...nodes.map((n) => ({
        key: canvasKey("question", n.id),
        kind: "question" as const,
        parentKey: n.parentId != null ? canvasKey("question", n.parentId) : null,
      })),
      ...concepts.map((c) => ({ key: canvasKey("concept", c.id), kind: "concept" as const, parentKey: null })),
      ...models.map((m) => ({ key: canvasKey("model", m.id), kind: "model" as const, parentKey: null })),
    ];
    // 审查修复：hasCore 统一 rootCard 口径（与 autoLayout 一致——领域体系首根上环 1，
    // 不再压住圆心体系名卡；v0.13.9 遗留，本版 5 个新算法同步受益）
    const layout = layoutCanvas({ hasCore: rootCard != null, items: layoutItems }, prefs.layoutAlgorithm);

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
        .then(() => savedRef.current?.(batchPersist))
        .catch((e) => setStatus(`布局初始化失败: ${e}`));
    }

    // 布局 effect 只依赖 layoutAlgorithm（审查修复：不依赖整个 prefs——连线/箭头
    // 切换是边属性变更，不应重算布局或重复批量写库）；边样式经 ref 取最新值，
    // 变更路径见下方 edgePrefs effect
    const { nodes: rfn, edges } = buildCanvasElements({
      nodes, concepts, models, links, positions, selectedKey, rootCard,
      edgeStyle: edgePrefsRef.current.edgeStyle, edgeArrows: edgePrefsRef.current.edgeArrows,
    });
    buildInputRef.current = { nodes, concepts, models, links, positions, selectedKey, rootCard };
    // v0.13.9：rootCard 由 buildCanvasElements 统一产出（含 core 卡 + 根节点虚线边）——
    // 初始布局与「自动排列」同路径，杜绝双份逻辑漂移（此前 autoLayout 漏加 core 卡）
    setRfNodes(rfn);
    setRfEdges(edges);
  }, [systemId, rootCard, nodes, concepts, models, links, selectedKey, setRfNodes, setRfEdges, prefs.layoutAlgorithm, prefsLoaded]);

  // v0.14.1：连线样式/箭头变更 → 基于上一布局结果即时重建（不重算布局）
  // （审查修复：原布局 effect 依赖整个 prefs——箭头/连线切换全量重排 + 重复写库窗口）
  useEffect(() => {
    const input = buildInputRef.current;
    if (!input || !prefsLoaded) return;
    const { nodes: rfn, edges } = buildCanvasElements({
      ...input,
      edgeStyle: prefs.edgeStyle, edgeArrows: prefs.edgeArrows,
    });
    setRfNodes(rfn);
    setRfEdges(edges);
  }, [prefs.edgeStyle, prefs.edgeArrows, prefsLoaded, setRfNodes, setRfEdges]);

  // 视口恢复（§4.5）：已存 → setViewport；未存 → fitView 按内容兜底
  useEffect(() => {
    void invoke<{ viewportX: number; viewportY: number; zoom: number } | null>("get_canvas_viewport", { systemId })
      .then((vp) => {
        if (vp) rfApi.current.setViewport({ x: vp.viewportX, y: vp.viewportY, zoom: vp.zoom });
        else void rfApi.current.fitView({ padding: 0.15 });
      })
      .catch(() => void rfApi.current.fitView({ padding: 0.15 }));
  }, [systemId]);

  // v0.14.1：偏好加载（体系切换重置；失败静默回落默认——偏好丢失不阻塞画布）
  useEffect(() => {
    setPrefsLoaded(false);
    setPrefs(DEFAULT_CANVAS_PREFS);
    invoke<CanvasPrefs | null>("get_canvas_prefs", { systemId })
      .then((p) => {
        if (p) setPrefs(p);
      })
      .catch(() => setPrefs(DEFAULT_CANVAS_PREFS))
      .finally(() => setPrefsLoaded(true));
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
  /** 偏好保存（v0.14.1；失败状态行提示——视觉选择会话内仍生效） */
  const savePrefs = useCallback((p: CanvasPrefs) => invoke("save_canvas_prefs", {
    systemId,
    edgeStyle: p.edgeStyle,
    edgeArrows: p.edgeArrows,
    layoutAlgorithm: p.layoutAlgorithm,
  }), [systemId]);

  /** 「布局 ▾」选择 = 用该算法整体重排 + 写偏好 + fitView（规格 §4.4 显式触发才覆盖已存位置） */
  const autoLayout = (algorithm: LayoutAlgorithm) => {
    const layoutItems: CanvasLayoutItem[] = [
      ...nodes.map((n) => ({
        key: canvasKey("question", n.id),
        kind: "question" as const,
        parentKey: n.parentId != null ? canvasKey("question", n.parentId) : null,
      })),
      ...concepts.map((c) => ({ key: canvasKey("concept", c.id), kind: "concept" as const, parentKey: null })),
      ...models.map((m) => ({ key: canvasKey("model", m.id), kind: "model" as const, parentKey: null })),
    ];
    const layout = layoutCanvas({ hasCore: rootCard != null, items: layoutItems }, algorithm);
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
    const { nodes: rfn, edges } = buildCanvasElements({
      nodes, concepts, models, links, positions, selectedKey, rootCard,
      edgeStyle: prefs.edgeStyle, edgeArrows: prefs.edgeArrows,
    });
    setRfNodes(rfn);
    setRfEdges(edges);
    void invoke("batch_initialize_canvas_positions", { systemId, positions: persist })
      .then(() => savedRef.current?.(persist))
      .catch((e) => setStatus(`布局保存失败: ${e}`));
    const next = { ...prefs, layoutAlgorithm: algorithm };
    setPrefs(next);
    void savePrefs(next).catch((e) => setStatus(`布局偏好保存失败: ${e}`));
    void fitView({ padding: 0.15 });
  };

  /** 「连线 ▾」选择 = 即时重渲染 + 写偏好 */
  const onEdgeStyleChange = (edgeStyle: EdgeStyle) => {
    const next = { ...prefs, edgeStyle };
    setPrefs(next);
    void savePrefs(next).catch((e) => setStatus(`连线偏好保存失败: ${e}`));
  };

  /** 箭头开关 = 即时重渲染 + 写偏好 */
  const onEdgeArrowsChange = (edgeArrows: boolean) => {
    const next = { ...prefs, edgeArrows };
    setPrefs(next);
    void savePrefs(next).catch((e) => setStatus(`连线偏好保存失败: ${e}`));
  };

  // v0.13.9：接线方向动态化——按源/目标当前中心相对方位选 Handle（拖拽后随
  // rfNodes 位置重算；纯函数 resolveEdgeHandles 可单测）。解决接线位置固定：
  // 移动节点后边始终从同一侧接入，产生大量回字形折角。
  const smartEdges = useMemo(() => {
    const centerOf = (id: string): CanvasPoint => {
      const n = rfNodes.find((x) => x.id === id);
      const p = n?.position ?? { x: 0, y: 0 };
      // core 卡无固定尺寸（maxWidth 240，标题 1-2 行）——按布局假定尺寸估算中心
      const bbox = n?.type === "core" ? { w: 240, h: 80 } : CANVAS_BBOX[n?.data.kind ?? "question"];
      return { x: p.x + bbox.w / 2, y: p.y + bbox.h / 2 };
    };
    return rfEdges.map((e) => ({ ...e, ...resolveEdgeHandles(centerOf(e.source), centerOf(e.target)) }));
  }, [rfNodes, rfEdges]);

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
          edges={smartEdges}
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
          // §九 不做清单：框选批量移动（RF 内置但本版暂不暴露）——禁用元素选择
          // 引擎，杜绝 shift 框选 + 多节点拖拽导致的"其余节点视觉位移不持久"竞态
          elementsSelectable={false}
          selectionKeyCode={null}
          deleteKeyCode={null}
          fitView={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <MiniMap pannable zoomable />
          <Controls />
          <Panel position="top-right" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
            {/* v0.14.1：「布局 ▾」「连线 ▾」下拉（选择即重排/重渲染 + 按体系持久化；
                原「✨ 自动排列」按钮并入布局下拉——避免双入口语义分歧） */}
            <select
              data-testid="canvas-layout-select"
              value={prefs.layoutAlgorithm}
              onChange={(e) => autoLayout(e.target.value as LayoutAlgorithm)}
              disabled={!prefsLoaded}
              style={{ fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", minWidth: 132 }}
              title="选择布局算法并自动排列（覆盖已存位置）"
            >
              {LAYOUT_OPTIONS.map((o) => <option key={o.value} value={o.value}>✨ {o.label}</option>)}
            </select>
            <select
              data-testid="canvas-edge-style-select"
              value={prefs.edgeStyle}
              onChange={(e) => onEdgeStyleChange(e.target.value as EdgeStyle)}
              disabled={!prefsLoaded}
              style={{ fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", minWidth: 132 }}
              title="连线样式"
            >
              {EDGE_STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>〰 {o.label}</option>)}
            </select>
            <label
              data-testid="canvas-edge-arrows"
              style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer" }}
            >
              <input type="checkbox" checked={prefs.edgeArrows} onChange={(e) => onEdgeArrowsChange(e.target.checked)} disabled={!prefsLoaded} />
              边箭头
            </label>
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

/** 体系根卡（虚拟中心——不可拖/不可选，仅展示体系根：全局=核心问题，领域=体系名） */
function CanvasCoreNode({ data }: NodeProps<Node<CanvasNodeData, "core">>) {
  return (
    <div
      data-testid="canvas-core"
      style={{ maxWidth: 240, borderRadius: 10, padding: "10px 14px", background: "#0f766e", color: "#fff", border: "1px solid #0f766e", boxShadow: "0 2px 8px rgba(15,118,110,0.25)" }}
    >
      {/* v0.13.9：四边 source Handle——根节点虚线边接线方向随相对方位动态选择 */}
      <Handle type="source" id="source-top" position={Position.Top} style={{ opacity: 0, width: 2, height: 2 }} />
      <Handle type="source" id="source-bottom" position={Position.Bottom} style={{ opacity: 0, width: 2, height: 2 }} />
      <Handle type="source" id="source-left" position={Position.Left} style={{ opacity: 0, width: 2, height: 2 }} />
      <Handle type="source" id="source-right" position={Position.Right} style={{ opacity: 0, width: 2, height: 2 }} />
      <div style={{ fontSize: 11, opacity: 0.85 }}>{data.subtitle ?? "体系"}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{data.title}</div>
    </div>
  );
}
