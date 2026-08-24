/**
 * KnowledgePage — 知识体系页（v0.13.1 §五 UI 层）。
 *
 * @ai-context: 三区布局（§五）——左：体系列表（全局置顶 + 领域列表）；中：问题树
 *              / 概念 / 模型（segmented master 视图）；右：详情面板（node/concept/
 *              model 编辑器）。树＋列表，不做图可视化（§五 UI 原则）。
 * @ai-context: 三时钟纪律（总架构 §一）——本页是体系页（周/季度视图），不进每日
 *              复习面；与「笔记」/「复习」动线隔离。空态不预填内容（预填＝假燃料）。
 * @ai-context: 体系只引用、不收纳——本页不搬内容进体系，只做引用与结构管理。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  KnowledgeSystem, KnowledgeNode, KnowledgeConcept, KnowledgeModel,
  KnowledgeLink, KnowledgeSelection,
} from "../types/knowledge";
import { systemStatusLabel } from "../types/knowledge";
import KnowledgeSystemWizard from "../components/KnowledgeSystemWizard";
import KnowledgeTreeView from "../components/KnowledgeTreeView";
import KnowledgeDetailPanel from "../components/KnowledgeDetailPanel";
import KnowledgeConceptDialog from "../components/KnowledgeConceptDialog";
import KnowledgeModelDialog from "../components/KnowledgeModelDialog";
import ConceptCardRow from "../components/ConceptCardRow";
import KnowledgeSampleView from "../components/KnowledgeSampleView";

type MiddleView = "tree" | "concept" | "model";

const MIDDLE_TABS: { key: MiddleView; label: string }[] = [
  { key: "tree", label: "🌳 问题树" },
  { key: "concept", label: "🧬 概念" },
  { key: "model", label: "⚙ 模型" },
];

export default function KnowledgePage() {
  const [systems, setSystems] = useState<KnowledgeSystem[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [concepts, setConcepts] = useState<KnowledgeConcept[]>([]);
  const [models, setModels] = useState<KnowledgeModel[]>([]);
  const [links, setLinks] = useState<KnowledgeLink[]>([]);
  const [middleView, setMiddleView] = useState<MiddleView>("tree");
  const [selection, setSelection] = useState<KnowledgeSelection | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [conceptDialogOpen, setConceptDialogOpen] = useState(false);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [domainCreate, setDomainCreate] = useState<{ open: boolean; name: string }>({ open: false, name: "" });
  const [status, setStatus] = useState("");

  const loadSystems = useCallback(async () => {
    try {
      const list = await invoke<KnowledgeSystem[]>("list_knowledge_systems");
      setSystems(list);
    } catch (e) { setStatus(`体系加载失败: ${e}`); }
  }, []);

  const loadSystemDetail = useCallback(async (id: number) => {
    try {
      const [ns, cs, ms, ls] = await Promise.all([
        invoke<KnowledgeNode[]>("list_knowledge_nodes", { systemId: id }),
        invoke<KnowledgeConcept[]>("list_knowledge_concepts", { systemId: id }),
        invoke<KnowledgeModel[]>("list_knowledge_models", { systemId: id }),
        invoke<KnowledgeLink[]>("list_knowledge_links", { systemId: id }),
      ]);
      setNodes(ns); setConcepts(cs); setModels(ms); setLinks(ls);
    } catch (e) { setStatus(`数据加载失败: ${e}`); }
  }, []);

  // 刷新体系列表 + 当前体系详情（子组件变更后统一回调）
  const reloadAll = useCallback(async () => {
    await loadSystems();
    if (selectedSystemId != null) await loadSystemDetail(selectedSystemId);
  }, [loadSystems, loadSystemDetail, selectedSystemId]);

  // 向导创建成功：关闭向导、刷新列表使新体系可见，再选中（效果驱动详情加载）
  // useCallback：早返回分支（无体系空态）也引用它，避免 TDZ。
  const handleCreated = useCallback(async (system: KnowledgeSystem) => {
    setWizardOpen(false);
    await loadSystems();
    setSelectedSystemId(system.id);
  }, [loadSystems]);

  useEffect(() => { void loadSystems(); }, [loadSystems]);

  useEffect(() => {
    if (selectedSystemId != null) void loadSystemDetail(selectedSystemId);
    else { setNodes([]); setConcepts([]); setModels([]); setLinks([]); setSelection(null); }
  }, [selectedSystemId, loadSystemDetail]);

  const selectSystem = (id: number) => {
    setSelectedSystemId(id);
    setSelection(null);
    setMiddleView("tree");
  };

  const globalSystem = systems.find((s) => s.kind === "global") ?? null;
  const domainSystems = systems.filter((s) => s.kind === "domain");
  const selectedSystem = systems.find((s) => s.id === selectedSystemId) ?? null;

  const createDomain = async () => {
    const name = domainCreate.name.trim();
    if (!name || !globalSystem) { setStatus("请输入领域体系名称"); return; }
    try {
      const sys = await invoke<KnowledgeSystem>("create_knowledge_system", { name, kind: "domain", parentSystemId: globalSystem.id });
      setDomainCreate({ open: false, name: "" });
      await loadSystems();
      setSelectedSystemId(sys.id);
    } catch (e) { setStatus(`领域体系创建失败: ${e}`); }
  };

  const archiveSystem = async (s: KnowledgeSystem) => {
    try {
      await invoke<boolean>("archive_knowledge_system", { id: s.id });
      if (s.id === selectedSystemId) setSelectedSystemId(null);
      await reloadAll();
    } catch (e) { setStatus(`归档失败: ${e}`); }
  };

  // ── 整页空态（无任何体系）──
  if (systems.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 24, textAlign: "center", overflowY: "auto" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#374151", marginBottom: 8 }}>结构在问题里的，成为体系</div>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7, maxWidth: 380, margin: "0 auto 20px" }}>
          把零散学到的东西，从"囤积"变成"体系"：先写下一个核心问题，再把领域入口和第一个输出挂进来。知识不再是收藏，而是可复用的结构。
        </p>
        <button data-testid="page-create-first" onClick={() => setWizardOpen(true)} style={{ fontSize: 14, cursor: "pointer", padding: "10px 24px", borderRadius: 8, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e", fontWeight: 600 }}>
          ✳ 创建你的第一个体系
        </button>
        {/* v0.13.7：空态示例入口——浏览为被动参照，复制得骨架（"待改造"非"已完成"） */}
        {/* 无全局体系时 onNeedGlobal 打开向导；创建后 handleCreated 刷新并选中，空态随之退出 */}
        <KnowledgeSampleView
          onCopied={(sys) => {
            setWizardOpen(false);
            void loadSystems().then(() => setSelectedSystemId(sys.id));
          }}
          onNeedGlobal={() => setWizardOpen(true)}
          refreshGlobal={0}
        />
        {wizardOpen && <KnowledgeSystemWizard onClose={() => setWizardOpen(false)} onCreated={(sys) => void handleCreated(sys)} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 左：体系列表（全局置顶固定 + 领域列表） ── */}
      <div style={{ width: 260, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <span>🧭 知识体系</span>
          <button data-testid="sidebar-new" onClick={() => setWizardOpen(true)} style={{ marginLeft: "auto", fontSize: 11, cursor: "pointer", padding: "3px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>
            ＋ 新建体系
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {globalSystem ? (
            <SystemCard system={globalSystem} selected={selectedSystemId === globalSystem.id} onSelect={() => selectSystem(globalSystem.id)} />
          ) : (
            <div style={{ padding: "10px 8px", fontSize: 12, color: "#9ca3af" }}>尚未创建全局体系——每个领域的根。</div>
          )}

          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: "#6b7280", padding: "0 6px" }}>领域体系</div>
          {domainSystems.length === 0 && <div style={{ padding: "6px 8px", fontSize: 11, color: "#9ca3af" }}>暂无领域体系。</div>}
          {domainSystems.map((s) => (
            <SystemCard key={s.id} system={s} selected={selectedSystemId === s.id} onSelect={() => selectSystem(s.id)} onArchive={() => void archiveSystem(s)} />
          ))}

          {globalSystem && (
            <div style={{ marginTop: 8, padding: "6px 8px", borderTop: "1px solid #f3f4f6" }}>
              {domainCreate.open ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <input data-testid="domain-name" value={domainCreate.name} onChange={(e) => setDomainCreate({ open: true, name: e.target.value })} placeholder="领域体系名称" style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 4 }} />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button data-testid="domain-create-confirm" onClick={() => void createDomain()} style={{ fontSize: 11, cursor: "pointer", padding: "3px 10px", borderRadius: 4, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}>创建</button>
                    <button onClick={() => setDomainCreate({ open: false, name: "" })} style={{ fontSize: 11, cursor: "pointer", padding: "3px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>取消</button>
                  </div>
                </div>
              ) : (
                <button data-testid="domain-create-open" onClick={() => setDomainCreate({ open: true, name: "" })} style={{ fontSize: 11, cursor: "pointer", padding: "3px 10px", borderRadius: 4, border: "1px dashed #d1d5db", background: "#fff" }}>
                  ＋ 新建领域体系
                </button>
              )}
            </div>
          )}
        </div>
        {status && <p data-testid="page-status" style={{ padding: "6px 10px", fontSize: 12, color: "#dc2626" }}>{status}</p>}
      </div>

      {/* ── 中：问题树 / 概念 / 模型（segmented master） ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 4, padding: "10px 12px", borderBottom: "1px solid #e5e7eb", alignItems: "center" }}>
          {MIDDLE_TABS.map((t) => (
            <button key={t.key} onClick={() => setMiddleView(t.key)} style={{ fontSize: 12, cursor: "pointer", padding: "4px 12px", borderRadius: 6, border: "1px solid transparent", background: middleView === t.key ? "#f0fdfa" : "transparent", color: middleView === t.key ? "#0f766e" : "#6b7280", fontWeight: middleView === t.key ? 600 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>

        {!selectedSystem ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>从左侧选择一个体系查看</div>
        ) : middleView === "tree" ? (
          <KnowledgeTreeView systemId={selectedSystem.id} nodes={nodes} links={links} selectedNodeId={selection?.type === "node" ? selection.id : null} onSelectNode={(id) => setSelection({ type: "node", id })} onChanged={() => void reloadAll()} />
        ) : middleView === "concept" ? (
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            <button data-testid="concept-add" onClick={() => setConceptDialogOpen(true)} style={{ marginBottom: 10, fontSize: 12, cursor: "pointer", padding: "4px 12px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>＋ 添加概念</button>
            {concepts.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>暂无概念——从卡住你的词开始。</p>}
            {concepts.map((c) => (
              <ConceptCardRow
                key={c.id}
                concept={c}
                selected={selection?.type === "concept" && selection.id === c.id}
                onSelect={() => setSelection({ type: "concept", id: c.id })}
              />
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            <button data-testid="model-add" onClick={() => setModelDialogOpen(true)} style={{ marginBottom: 10, fontSize: 12, cursor: "pointer", padding: "4px 12px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>＋ 添加模型</button>
            {models.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>暂无模型——把可验证的断言写下来。</p>}
            {models.map((m) => (
              <div key={m.id} data-testid={`model-row-${m.id}`} onClick={() => setSelection({ type: "model", id: m.id })} style={{ padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: selection?.type === "model" && selection.id === m.id ? "#f0fdfa" : "transparent", border: selection?.type === "model" && selection.id === m.id ? "1px solid #99f6e4" : "1px solid transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{m.name}</span>
                  <span style={{ fontSize: 10, color: "#6b7280", background: "#f9fafb", borderRadius: 8, padding: "0 5px" }}>{m.disciplines.join(" / ")}</span>
                </div>
                {m.claim && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.claim}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 右：详情面板（可折叠；node/concept/model 编辑器；未选体系时收起） ── */}
      {selectedSystem && (
        <KnowledgeDetailPanel system={selectedSystem} nodes={nodes} concepts={concepts} models={models} links={links} selection={selection} onChanged={() => void reloadAll()} />
      )}

      {wizardOpen && <KnowledgeSystemWizard onClose={() => setWizardOpen(false)} onCreated={(sys) => void handleCreated(sys)} />}

      {/* 新建概念/模型走独立弹窗——不再占用右栏编辑器 */}
      {selectedSystem && conceptDialogOpen && (
        <KnowledgeConceptDialog
          systemId={selectedSystem.id}
          onCreated={() => { setConceptDialogOpen(false); void reloadAll(); }}
          onClose={() => setConceptDialogOpen(false)}
        />
      )}
      {selectedSystem && modelDialogOpen && (
        <KnowledgeModelDialog
          systemId={selectedSystem.id}
          onCreated={() => { setModelDialogOpen(false); void reloadAll(); }}
          onClose={() => setModelDialogOpen(false)}
        />
      )}
    </div>
  );
}

/** 体系卡（全局/领域共用）：名称/核心问题/计数/状态徽标 */
function SystemCard({ system, selected, onSelect, onArchive }: { system: KnowledgeSystem; selected: boolean; onSelect: () => void; onArchive?: () => void }) {
  return (
    <div onClick={onSelect} data-testid={system.kind === "global" ? "system-global" : `system-${system.id}`} style={{ padding: "8px 10px", borderRadius: 6, cursor: "pointer", background: selected ? "#f0fdfa" : "transparent", border: selected ? "1px solid #99f6e4" : "1px solid transparent" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {system.kind === "global" && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "#fef3c7", color: "#b45309" }}>全局</span>}
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{system.name}</span>
        <span style={{ fontSize: 10, color: systemStatusColor(system.status) }}>{systemStatusLabel[system.status]}</span>
      </div>
      {system.coreQuestion && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{system.coreQuestion}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
        <span style={{ fontSize: 10, color: "#6b7280" }}>节点 {system.nodeCount ?? 0}</span>
        <span style={{ fontSize: 10, color: "#6b7280" }}>概念 {system.conceptCount ?? 0}</span>
        <span style={{ fontSize: 10, color: "#6b7280" }}>模型 {system.modelCount ?? 0}</span>
        {system.kind === "domain" && onArchive && <button onClick={(e) => { e.stopPropagation(); onArchive(); }} style={{ marginLeft: "auto", fontSize: 10, cursor: "pointer", border: "none", background: "none", color: "#9ca3af" }} title="归档体系">🗄</button>}
      </div>
    </div>
  );
}

/** 状态徽标配色 */
function systemStatusColor(status: string): string {
  if (status === "archived") return "#9ca3af";
  if (status === "watching") return "#b45309";
  return "#0f766e";
}
