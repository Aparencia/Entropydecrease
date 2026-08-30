/**
 * RouteInfoPopover — ⓘ 弹层（v0.12.2 路由信息收敛；自 NoteGroupPanel 拆分）。
 *
 * @ai-context: 四区（规划 §4）：① 人话归因一行 + 信号明细默认折叠
 *              （"可见可改"重释：结果可见、原因可按需、误判可一键纠正）；
 *              ② 改判（修改即记忆 REQ-198 保留）；③ 组管理（生成闪卡/
 *              结算/复习本组/移入移出选中笔记）；④ 周契约卡（REQ-200）。
 * @ai-context: 弹层由 GroupSidebar 锚定渲染（fixed 定位 + 透明背板关闭 +
 *              ESC 关闭）；所有变更经 onChanged 通知 NotesPage 刷新列表。
 * @ai-context: v0.13.7 触点③ 结算体系简报——弹层挂载时并行拉取组内 model 卡
 *              计数与体系引用/概念失效态（90 天未应用）；纯提示、加载失败静默
 *              降级（不阻塞结算区）；list_knowledge_links 契约强制 system_id，
 *              按非归档体系逐个查询聚合。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Flashcard, NoteGroup } from "../types";
import type { KnowledgeConcept, KnowledgeLink, KnowledgeSystem } from "../types/knowledge";
import { humanRouteLine, parseRouteReason } from "../utils/routeReason";
import { DOMAIN_OPTIONS } from "../utils/domainOptions";
import WeekContractCard from "./WeekContractCard";
import ModelCardCreateDialog from "./ModelCardCreateDialog";
import GroupDeleteConfirm from "./GroupDeleteConfirm";

/** 结算计划（v0.11.3；与后端 settlement_plan 返回契约对齐） */
interface SettlementPlan {
  itemCount: number;
  due: boolean;
  lastSettledAt: number | null;
  mergePairs: { keepId: number; dropId: number; keepText: string; dropText: string }[];
  archiveCandidates: { id: number; text: string }[];
}

interface Props {
  group: NoteGroup;
  /** 视口锚点（GroupSidebar 行 getBoundingClientRect 提供） */
  anchor: { x: number; y: number };
  /** 关闭弹层（背板点击/ESC/重新点 ⓘ） */
  onClose: () => void;
  /** 组/笔记变更后刷新回调（NotesPage 重载列表） */
  onChanged: () => void;
  /** 打开组级复习面 */
  onOpenReview: (groupId: number, name: string) => void;
  /** 当前选中笔记 id（移入/移出操作前提；null=无） */
  selectedNoteId: number | null;
}

/** 弹层内统一的小按钮样式（四区视觉一致） */
const BTN: React.CSSProperties = {
  fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 4,
  border: "1px solid #d1d5db", background: "#fff", color: "#374151",
};

export default function RouteInfoPopover({
  group, anchor, onClose, onChanged, onOpenReview, selectedNoteId,
}: Props) {
  // ① 明细折叠（默认收起——原因可按需，不默认铺开）
  const [showDetails, setShowDetails] = useState(false);
  // ② 改判表单态（弹层自有——组行单击不再展开）
  const [overrideKind, setOverrideKind] = useState<string>(group.kind);
  const [overrideDomain, setOverrideDomain] = useState(group.domainTag ?? "");
  // ③ 结算计划态（仪式第一步：先看见沼泽全貌）
  const [settlePlan, setSettlePlan] = useState<SettlementPlan | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // v0.13.2：组侧「＋ 概念卡」弹窗开合（组仍是唯一容器——只在此组内建卡）
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  // v0.13.7 触点③：结算体系简报（model 卡计数 + 关联体系概念失效数）
  const [sysBrief, setSysBrief] = useState<{ modelCount: number; staleConcepts: number; systemName: string } | null>(null);
  // v0.14.1：删除组确认弹窗开合（⑤ 危险操作）
  const [deleteOpen, setDeleteOpen] = useState(false);

  const reason = useMemo(() => parseRouteReason(group.routeReason), [group.routeReason]);

  // ESC 关闭（弹层是模态背板——键盘可达性）
  // 审查修复：删除确认弹窗打开时 ESC 只关最顶层模态（两层 ESC 监听并存曾一次
  // 关掉弹层+确认窗——未确认的改判/结算态随 ⓘ 弹层一起丢失）
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !deleteOpen) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, deleteOpen]);

  // ② 改判（REQ-198 修改即记忆——路由偏好持久化）
  const runOverride = async () => {
    setBusy(true);
    try {
      await invoke<boolean>("override_group_route", {
        id: group.id,
        kind: overrideKind,
        domainTag: overrideKind === "topic" ? overrideDomain || null : null,
      });
      setStatus("");
      onChanged();
    } catch (e) {
      setStatus(`改判失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // ③ 组→闪卡生成（本地规则版；幂等）
  const runGenerateCards = async () => {
    setBusy(true);
    try {
      const n = await invoke<number>("generate_group_cards", { groupId: group.id });
      setStatus(n > 0 ? `已生成 ${n} 张闪卡` : "无新卡可生成（已生成过或无可出卡素材）");
      onChanged();
    } catch (e) {
      setStatus(`闪卡生成失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // ③ v0.13.7 触点③ 结算体系简报（弹层挂载时并行拉取；纯提示——失败静默降级）
  const loadSystemBrief = useCallback(async () => {
    try {
      const [cards, sysList] = await Promise.all([
        invoke<Flashcard[]>("list_group_cards", { groupId: group.id }),
        invoke<KnowledgeSystem[]>("list_knowledge_systems"),
      ]);
      const modelCount = cards.filter((c) => c.kind === "model").length;
      // 后端 list_knowledge_links 强制 system_id——按非归档体系聚合
      const activeSystems = sysList.filter((s) => s.status !== "archived");
      const linkArrays = await Promise.all(
        activeSystems.map((s) => invoke<KnowledgeLink[]>("list_knowledge_links", { systemId: s.id })),
      );
      const links = linkArrays.flat();
      const groupLinks = links.filter((l) => l.targetType === "note_group" && l.targetId === group.id);
      if (modelCount === 0 && groupLinks.length === 0) { setSysBrief(null); return; }
      const sys = sysList.find((s) => s.id === groupLinks[0]?.systemId) ?? null;
      let staleConcepts = 0;
      if (sys) {
        const concepts = await invoke<KnowledgeConcept[]>("list_knowledge_concepts", { systemId: sys.id });
        const now = Math.floor(Date.now() / 1000);
        staleConcepts = concepts.filter((c) => {
          const base = c.lastAppliedAt ?? c.createdAt;
          return now - base > 90 * 86400;
        }).length;
      }
      setSysBrief({ modelCount, staleConcepts, systemName: sys?.name ?? "" });
    } catch { setSysBrief(null); } // 简报为纯提示——加载失败静默降级
  }, [group.id]);

  // 弹层挂载时触发（一次性；结算区展开时并行拉取）
  useEffect(() => { void loadSystemBrief(); }, [loadSystemBrief]);

  // ③ 结算计划（呈现→确认→执行）
  const runSettlementPlan = async () => {
    setBusy(true);
    try {
      const plan = await invoke<SettlementPlan>("settlement_plan", { groupId: group.id });
      setSettlePlan(plan);
      setStatus("");
    } catch (e) {
      setStatus(`结算计划失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const runExecuteSettlement = async () => {
    setBusy(true);
    try {
      const r = await invoke<{ merged: number; archived: number; coreNoteId: number | null }>(
        "execute_settlement",
        { groupId: group.id, applyMerges: true, applyArchives: true },
      );
      setSettlePlan(null);
      setStatus(`结算完成：合并 ${r.merged} 条重复、归档 ${r.archived} 条低价值，已生成核心提炼笔记`);
      onChanged();
    } catch (e) {
      setStatus(`结算执行失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // ③ 笔记移入/移出（选中笔记 ↔ 本组）
  const runMove = async (groupId: number | null) => {
    if (selectedNoteId == null) return;
    setBusy(true);
    try {
      await invoke<boolean>("move_note_to_group", { noteId: selectedNoteId, groupId });
      setStatus("");
      onChanged();
    } catch (e) {
      setStatus(`移动失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* 透明背板：点击关闭（弹层外的任意点击都收起） */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 30, background: "transparent" }}
        data-testid="route-popover-backdrop"
      />
      <div
        data-testid="route-popover"
        style={{
          // 锚定组行下方（视口坐标；右缘越界时左移——贴边不溢屏）
          position: "fixed", zIndex: 31, width: 300, maxHeight: "70vh",
          top: anchor.y + 4,
          left: Math.max(4, Math.min(anchor.x, window.innerWidth - 304)),
          overflowY: "auto", background: "#fff", borderRadius: 8,
          border: "1px solid #e5e7eb", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          padding: 12, fontSize: 12,
        }}
      >
        {/* 头部：组名 + 关闭 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            ⓘ {group.name}
          </span>
          <button onClick={onClose} style={{ fontSize: 13, border: "none", background: "none", cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>✕</button>
        </div>

        {/* ① 人话归因 + 明细折叠 */}
        <div style={{ padding: 8, background: "#f9fafb", borderRadius: 6, marginBottom: 8 }}>
          <div style={{ color: "#374151", lineHeight: 1.6 }}>{humanRouteLine(reason, group.kind)}</div>
          {(reason.reasons ?? []).length > 0 && (
            <div style={{ marginTop: 4 }}>
              <button
                data-testid="route-details-toggle"
                onClick={() => setShowDetails((v) => !v)}
                style={{ ...BTN, background: "#fff" }}
              >
                {showDetails ? "收起明细 ▴" : "查看明细 ▾"}
              </button>
              {showDetails && (
                <div data-testid="route-details" style={{ marginTop: 6, paddingLeft: 6, borderLeft: "2px solid #e5e7eb", color: "#6b7280" }}>
                  {(reason.reasons ?? []).map((r, i) => (
                    <div key={i} style={{ marginBottom: 2, wordBreak: "break-word" }}>· {r}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ② 改判（修改即记忆） */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 4 }}>改判归属</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <select value={overrideKind} onChange={(e) => setOverrideKind(e.target.value)}
              data-testid="override-kind"
              style={{ fontSize: 11, padding: "2px 4px", border: "1px solid #e5e7eb", borderRadius: 4 }}>
              <option value="standalone">独立组</option>
              <option value="course">课程组</option>
              <option value="topic">主题组</option>
            </select>
            {overrideKind === "topic" && (
              <select value={overrideDomain} onChange={(e) => setOverrideDomain(e.target.value)}
                data-testid="override-domain"
                style={{ fontSize: 11, padding: "2px 4px", border: "1px solid #e5e7eb", borderRadius: 4 }}>
                <option value="">选择领域…</option>
                {DOMAIN_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            )}
            <button onClick={() => void runOverride()} disabled={busy}
              data-testid="override-confirm" style={{ ...BTN, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}>
              ✓ 改判
            </button>
          </div>
        </div>

        {/* ③ 组管理 */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 4 }}>组管理</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button onClick={() => void runGenerateCards()} disabled={busy} style={BTN} title="从组内笔记词汇表/碎片生成闪卡（幂等）">⚙ 生成闪卡</button>
            <button onClick={() => setCardDialogOpen(true)} data-testid="model-card-open" style={BTN} title="在组内建一张概念卡（模型卡）——组内记忆面">＋ 概念卡</button>
            <button onClick={() => void runSettlementPlan()} disabled={busy} data-testid="settle-button" style={BTN} title="对账本组：提炼核心/合并重复/归档低价值">🧹 结算</button>
            <button onClick={() => onOpenReview(group.id, group.name)} style={BTN}>🎴 复习本组</button>
            {selectedNoteId != null && (
              <>
                <button onClick={() => void runMove(group.id)} disabled={busy} style={BTN} title="移入选中笔记到本组">← 移入选中笔记</button>
                <button onClick={() => void runMove(null)} disabled={busy} style={BTN} title="移出选中笔记">移出组</button>
              </>
            )}
          </div>
          {/* 结算计划呈现（仪式第一步：看见沼泽全貌再动手） */}
          {settlePlan && (
            <div data-testid="settlement-plan" style={{ marginTop: 8, padding: 8, background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                结算计划 · 共 {settlePlan.itemCount} 条目
                {settlePlan.due && <span style={{ color: "#b45309", marginLeft: 6 }}>⚠ 建议结算</span>}
              </div>
              <div style={{ color: "#6b7280" }}>重复合并：{settlePlan.mergePairs.length} 对（保留长文本，归档短重复）</div>
              {settlePlan.mergePairs.slice(0, 3).map((p) => (
                <div key={p.dropId} style={{ color: "#9ca3af", paddingLeft: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  「{p.keepText.slice(0, 18)}…」⇐「{p.dropText.slice(0, 18)}…」
                </div>
              ))}
              <div style={{ color: "#6b7280", marginTop: 2 }}>低价值归档：{settlePlan.archiveCandidates.length} 条（老化且无卡绑定，可恢复）</div>
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <button onClick={() => void runExecuteSettlement()} disabled={busy}
                  style={{ ...BTN, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}>
                  ✓ 执行结算（含核心提炼）
                </button>
                <button onClick={() => setSettlePlan(null)} style={BTN}>取消</button>
              </div>
            </div>
          )}
          {/* v0.13.7 触点③ 结算体系简报（model 卡计数 + 体系概念失效） */}
          {sysBrief && (sysBrief.modelCount > 0 || sysBrief.staleConcepts > 0) && (
            <div data-testid="sys-brief" style={{ marginTop: 8, padding: 8, background: "#f0fdfa", borderRadius: 6, border: "1px solid #99f6e4" }}>
              <div style={{ fontWeight: 600, color: "#0f766e", marginBottom: 4 }}>体系简报</div>
              {sysBrief.modelCount > 0 && (
                <div data-testid="sys-brief-model" style={{ fontSize: 11, color: "#0f766e" }}>🧬 本组有 {sysBrief.modelCount} 张 model 卡可纳入体系（复习面「纳入体系」）</div>
              )}
              {sysBrief.staleConcepts > 0 && sysBrief.systemName && (
                <div data-testid="sys-brief-stale" style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>⏳ 体系「{sysBrief.systemName}」有 {sysBrief.staleConcepts} 个概念 90 天未引用</div>
              )}
            </div>
          )}
        </div>

        {/* ④ 周契约卡（REQ-200 弹性承诺呈现层） */}
        <WeekContractCard groupId={group.id} />

        {/* ⑤ v0.14.1：组管理·危险操作——删除组（影响面确认后级联） */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
          <button
            data-testid="group-delete-open"
            onClick={() => setDeleteOpen(true)}
            style={{ fontSize: 11, cursor: "pointer", padding: "3px 10px", borderRadius: 4, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c" }}
            title="删除组——笔记/碎片保留移入「全部」，闪卡/结算/契约级联删除"
          >
            🗑 删除组…
          </button>
          <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 6 }}>影响面确认后执行</span>
        </div>

        {status && <p data-testid="popover-status" style={{ margin: "6px 0 0", fontSize: 11, color: "#dc2626" }}>{status}</p>}
      </div>

      {/* v0.13.2：组侧「＋ 概念卡」弹窗（仅在组内建 model 卡——不建体系侧入口） */}
      {cardDialogOpen && (
        <ModelCardCreateDialog
          groupId={group.id}
          groupName={group.name}
          onClose={() => setCardDialogOpen(false)}
        />
      )}

      {/* v0.14.1：删除组确认弹窗（⑤；删除成功 → 关闭弹层 + 通知父级刷新） */}
      {deleteOpen && (
        <GroupDeleteConfirm
          group={group}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => { setDeleteOpen(false); onClose(); onChanged(); }}
        />
      )}
    </>
  );
}
