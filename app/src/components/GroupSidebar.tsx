/**
 * GroupSidebar — 笔记页左侧组筛选侧栏（v0.12.2 三栏拆分；自 NoteGroupPanel 拆分）。
 *
 * @ai-context: 职责单一化（规划 §7）——组筛选（行单击=仅过滤，无展开动作——
 *              v0.12.2 决策 1 三元分离：一个手势只触发一个动作）+ ⓘ 弹层入口
 *              （路由理由/改判/组管理/周契约收敛进 RouteInfoPopover）+
 *              快速记录（feed 进料口）+ 收件箱入口（恒常首项 + 待处理计数）。
 * @ai-context: 路由理由"可见"重释（REQ-198）——行小字人话一行
 *              （系统自动归类/⚠ 待确认/已改判 + ⓘ），算法原文不进行内。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Fragment, NoteGroup } from "../types";
import type { KnowledgeLink, KnowledgeSystem } from "../types/knowledge";
import { parseRouteReason, routeLineState } from "../utils/routeReason";
import RouteInfoPopover from "./RouteInfoPopover";
import SystemBadge from "./SystemBadge";

interface Props {
  /** 当前过滤组（null=全部笔记） */
  groupFilter: number | null;
  onGroupFilterChange: (id: number | null) => void;
  /** 组/笔记变更后的刷新回调（NotesPage 重载列表） */
  onChanged: () => void;
  /** 打开复习面（groupId=null 全量；name 呈现用） */
  onOpenReview: (groupId: number | null, name: string) => void;
  /** 当前选中笔记 id（ⓘ 弹层"移入/移出选中笔记"用；null=无） */
  selectedNoteId: number | null;
  /** 打开收件箱视图（中部列表原位切换为碎片列表） */
  onOpenInbox: () => void;
  /** 收件箱视图是否激活（高亮首项） */
  inboxActive: boolean;
  /** 外部刷新令牌（捕获/升笔记/升卡后触发本栏重载计数） */
  refreshToken: number;
  /** 跳转体系页并选中体系（v0.13.7 触点①） */
  onOpenSystem: (systemId: number) => void;
}

/** 组类别徽标（文案+配色） */
function kindBadge(kind: string): { label: string; color: string } {
  if (kind === "course") return { label: "📚 课程", color: "#0f766e" };
  if (kind === "topic") return { label: "🏷 主题", color: "#7c3aed" };
  return { label: "📄 独立", color: "#6b7280" };
}

/** Blob → base64（分块转换——大截图防 String.fromCharCode 栈溢出） */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export default function GroupSidebar({
  groupFilter, onGroupFilterChange, onChanged, onOpenReview, selectedNoteId,
  onOpenInbox, inboxActive, refreshToken, onOpenSystem,
}: Props) {
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [feedCaptureOn, setFeedCaptureOn] = useState(true);
  const [fragText, setFragText] = useState("");
  // 全量到期卡数（"复习 N"徽标）
  const [dueTotal, setDueTotal] = useState(0);
  // 收件箱待处理数（active 碎片计数）
  const [inboxCount, setInboxCount] = useState(0);
  const [status, setStatus] = useState("");
  // 体系引用映射（组 id → 引用它的体系列表；v0.13.7 触点① 徽标）
  const [systemLinks, setSystemLinks] = useState<Record<number, { systemId: number; count: number }[]>>({});
  const [systems, setSystems] = useState<KnowledgeSystem[]>([]);
  // ⓘ 弹层态（受控单开——同一时间只开一个组）
  const [popover, setPopover] = useState<{ group: NoteGroup; anchor: { x: number; y: number } } | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await invoke<NoteGroup[]>("list_note_groups", { terrain: null });
      // feed 组仅开关开启时显示（开关关闭时碎片操作面不可见——后端另有校验）
      setGroups(feedCaptureOn ? list : list.filter((g) => g.terrain !== "feed"));
      const due = await invoke<number>("count_due_cards", { groupId: null });
      setDueTotal(due);
      const frags = await invoke<Fragment[]>("list_fragments", { status: "active", limit: 500 });
      setInboxCount(frags.length);
      // v0.13.7 触点①：体系 + 引用拉取（并行——徽标数据与组列表无依赖）
      const sysList = await invoke<KnowledgeSystem[]>("list_knowledge_systems");
      setSystems(sysList);
      // 后端 list_knowledge_links 强制 system_id（无全局查询）——
      // 按非归档体系逐次查询后聚合（审查修复：原无参调用必报"必须指定体系"）
      const activeSystems = sysList.filter((s) => s.status !== "archived");
      const linkArrays = await Promise.all(
        activeSystems.map((s) => invoke<KnowledgeLink[]>("list_knowledge_links", { systemId: s.id })),
      );
      const links = linkArrays.flat();
      const map: Record<number, { systemId: number; count: number }[]> = {};
      for (const l of links) {
        if (l.targetType !== "note_group") continue;
        (map[l.targetId] ??= []).push({ systemId: l.systemId, count: 0 });
      }
      // 合并同体系多引用为一条（count 累加——一行一个徽标，不重复堆叠）
      for (const gid of Object.keys(map)) {
        const merged: Record<number, number> = {};
        for (const item of map[Number(gid)]) merged[item.systemId] = (merged[item.systemId] ?? 0) + 1;
        map[Number(gid)] = Object.entries(merged).map(([sid, count]) => ({ systemId: Number(sid), count }));
      }
      setSystemLinks(map);
      setStatus("");
    } catch (e) {
      setStatus(`组加载失败: ${e}`);
    }
  }, [feedCaptureOn]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // 开关读取（设置页改动后重进笔记页即刷新；refreshToken 同步兜底）
  useEffect(() => {
    invoke<{ feedCapture: boolean }>("get_feature_flags")
      .then((f) => setFeedCaptureOn(f.feedCapture))
      .catch(() => setFeedCaptureOn(true));
  }, [refreshToken]);

  // ── 碎片快速捕获（feed 进料口；后端二次校验开关）──
  const runCapture = async (source: "manual" | "clipboard") => {
    try {
      let text = fragText.trim();
      let imageB64: string | null = null;
      if (source === "clipboard") {
        // 剪贴板优先：文本+图片一次捕获（REQ-132）
        const clipText = await navigator.clipboard.readText().catch(() => "");
        if (clipText.trim()) text = clipText.trim();
        const items = await navigator.clipboard.read().catch(() => []);
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            imageB64 = await blobToBase64(blob);
            break;
          }
        }
      }
      if (!text && !imageB64) {
        setStatus("请输入碎片内容或复制剪贴板后再捕获");
        return;
      }
      await invoke("capture_fragment", { text, imageB64, source });
      setFragText("");
      setStatus("");
      // 刷新统一由 onChanged（refreshToken）驱动——本组件 load 与 NotesPage
      // 列表重载各执行一次（审查修复：原显式 load + onChanged 会双跑全套请求）
      onChanged();
    } catch (e) {
      setStatus(`碎片捕获失败: ${e}`);
    }
  };

  const openPopover = (g: NoteGroup, e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor = { x: rect.left, y: rect.bottom };
    setPopover((prev) => (prev?.group.id === g.id ? null : { group: g, anchor }));
  };

  return (
    <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", position: "relative", minWidth: 0 }}>
      {/* 头部：标题 + 刷新 */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📁 笔记组</span>
        <button onClick={() => void load()} style={{ marginLeft: "auto", fontSize: 13, cursor: "pointer" }} title="刷新组列表">⟳</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* ⚡ 快速记录（feedCapture 开关=快速记录入口；默认开） */}
        {feedCaptureOn && (
          <div data-testid="quick-capture" style={{ margin: "2px 0 6px", padding: 8, background: "#faf5ff", borderRadius: 6, border: "1px solid #e9d5ff" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed", marginBottom: 4 }}>⚡ 快速记录</div>
            <textarea
              value={fragText}
              onChange={(e) => setFragText(e.target.value)}
              placeholder="几句话记下刚学到的…"
              rows={2}
              style={{ width: "100%", fontSize: 12, padding: 4, border: "1px solid #e5e7eb", borderRadius: 4, resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <button onClick={() => void runCapture("manual")} style={{ fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>
                捕获
              </button>
              <button onClick={() => void runCapture("clipboard")} style={{ fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }} title="文本+图片从剪贴板一次捕获">
                📋 剪贴板捕获
              </button>
            </div>
          </div>
        )}

        {/* 📥 收件箱（恒常首项——快速记录→这里消费） */}
        <div
          data-testid="inbox-entry"
          onClick={onOpenInbox}
          style={{
            padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13,
            background: inboxActive ? "#fdf2f8" : "transparent",
            color: inboxActive ? "#be185d" : "#374151", fontWeight: 500,
            border: inboxActive ? "1px solid #fbcfe8" : "1px solid transparent",
          }}
        >
          📥 收件箱 <span style={{ fontSize: 11, color: inboxActive ? "#be185d" : "#9ca3af" }}>{inboxCount > 0 ? `(${inboxCount})` : ""}</span>
          <span style={{ float: "right", fontSize: 10, color: "#9ca3af" }}>碎片原料</span>
        </div>

        {/* 📁 全部笔记（未归组笔记在此可见——收件箱只装碎片，两种实体两条动线） */}
        <div
          onClick={() => { onGroupFilterChange(null); }}
          data-testid="all-notes-entry"
          style={{
            padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13,
            background: groupFilter === null ? "#f0fdfa" : "transparent",
            color: groupFilter === null ? "#0f766e" : "#374151", fontWeight: 500,
          }}
        >
          📁 全部笔记
        </div>

        {groups.length === 0 && (
          <p style={{ fontSize: 12, color: "#9ca3af", padding: "12px 8px" }}>
            暂无笔记组——会话转笔记时自动归组
          </p>
        )}

        {/* 组行：单击=仅过滤（无展开动作）；ⓘ 打开弹层 */}
        {groups.map((g) => {
          const badge = kindBadge(g.kind);
          const reason = parseRouteReason(g.routeReason);
          const line = routeLineState(reason, g.routeOverridden);
          const active = groupFilter === g.id;
          return (
            <div
              key={g.id}
              data-testid={`group-row-${g.id}`}
              onClick={() => onGroupFilterChange(active ? null : g.id)}
              style={{
                padding: "7px 10px", borderRadius: 6, cursor: "pointer",
                background: active ? "#f0fdfa" : "transparent",
                border: line.needsConfirm && !g.routeOverridden ? "1px dashed #f59e0b" : "1px solid transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{g.noteCount}</span>
              </div>
              {/* 行小字：人话归因一行 + ⓘ（结果可见；原因进弹层明细） */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                <span style={{ fontSize: 10, color: badge.color, background: "#f9fafb", borderRadius: 8, padding: "0 5px" }}>{badge.label}</span>
                {g.terrain === "feed" && (
                  <span style={{ fontSize: 10, color: "#7c3aed", background: "#faf5ff", borderRadius: 8, padding: "0 5px" }}>feed</span>
                )}
                {/* 体系徽标（触点①：该组被哪些体系引用；点击跳体系页） */}
                {systemLinks[g.id]?.map((sl) => {
                  const sys = systems.find((s) => s.id === sl.systemId);
                  if (!sys || sys.status === "archived") return null;
                  return (
                    <SystemBadge
                      key={sl.systemId}
                      name={sys.name}
                      linkCount={sl.count}
                      onClick={() => onOpenSystem(sl.systemId)}
                    />
                  );
                })}
                <span style={{ fontSize: 10, color: line.needsConfirm ? "#b45309" : "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {line.label}
                </span>
                <button
                  data-testid={`group-info-${g.id}`}
                  onClick={(e) => openPopover(g, e)}
                  style={{ marginLeft: "auto", fontSize: 11, cursor: "pointer", border: "none", background: "none", color: "#6b7280", padding: "0 2px", lineHeight: 1 }}
                  title="路由详情 / 改判 / 组管理 / 周契约"
                >
                  ⓘ
                </button>
              </div>
            </div>
          );
        })}

        {/* 🎴 复习（全量入口：UI 最小化——一个按钮 + 到期数） */}
        <div style={{ marginTop: "auto", paddingTop: 6 }}>
          <button
            onClick={() => onOpenReview(null, "全部组")}
            style={{ width: "100%", fontSize: 11, cursor: "pointer", padding: "4px 8px", borderRadius: 4, border: "1px solid #0f766e", background: dueTotal > 0 ? "#f0fdfa" : "#fff", color: "#0f766e" }}
            title="开始复习到期卡片"
          >
            🎴 复习{dueTotal > 0 ? ` ${dueTotal}` : ""}
          </button>
        </div>
      </div>

      {status && <p style={{ padding: 8, fontSize: 12, color: "#dc2626" }}>{status}</p>}

      {/* ⓘ 弹层（受控单开；key=group.id——切组重置内部表单态，
          防 A 组的改判/结算选择串进 B 组——审查修复） */}
      {popover && (
        <RouteInfoPopover
          key={popover.group.id}
          group={popover.group}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          // via onChanged（refreshToken）驱动本组件 load——不再显式双跑
          onChanged={onChanged}
          onOpenReview={(gid, name) => { setPopover(null); onOpenReview(gid, name); }}
          selectedNoteId={selectedNoteId}
        />
      )}
    </div>
  );
}
