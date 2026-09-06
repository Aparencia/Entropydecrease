/**
 * GroupSidebar — 笔记页左侧组筛选侧栏（v0.14 C1 Obsidian 式重构）。
 *
 * @ai-context: 原 240px 平铺混排（痛点 C1：展示混乱）——重构为分区组织：
 *              最近使用区（LRU≤5，访问组时写入 localStorage）+ 收件箱/全部/
 *              复习（移出"组"概念区）+ 组分区（按 kind：课程/主题/独立/feed，
 *              折叠记忆 localStorage）+ 组过滤（纯函数 filterGroups）+
 *              拖拽归组（组行为 drop target，笔记卡片为 drag source，
 *              move_note_to_group 命令）。组行渲染提取至 GroupSidebarRow
 *              （行内徽标收敛为 1-2 个）。三条设计契约延续：展示层组织，
 *              不改组模型（无父子组）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Fragment, NoteGroup } from "../types";
import type { KnowledgeLink, KnowledgeSystem } from "../types/knowledge";
import {
  GROUP_SECTIONS,
  filterGroups,
  pushRecentGroup,
  readFolded,
  readRecentGroupIds,
  writeFolded,
  writeRecentGroupIds,
} from "../utils/groupSidebar";
import RouteInfoPopover from "./RouteInfoPopover";
import GroupSidebarRow from "./GroupSidebarRow";
import GroupCreateDialog from "./GroupCreateDialog";
// REQ-287：多选拖拽载荷读取（text/note-ids JSON + 单 id 兜底）
import { crateDndReadIds } from "./NoteTreeSection";
import { blobToBase64 } from "../utils/blobToBase64";

interface Props {
  /** 列宽（v0.15 全站自适应——父层 useColumnLayout 驱动；缺省 240=历史值） */
  width?: number;
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
  /** v0.15：折叠为窄条（父层 useColumnLayout.setManualFolded(true)） */
  onCollapse?: () => void;
}

export default function GroupSidebar({
  width = 240, groupFilter, onGroupFilterChange, onChanged, onOpenReview, selectedNoteId,
  onOpenInbox, inboxActive, refreshToken, onOpenSystem, onCollapse,
}: Props) {
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [feedCaptureOn, setFeedCaptureOn] = useState(true);
  const [fragText, setFragText] = useState("");
  // 全量到期卡数（"复习 N"徽标）
  const [dueTotal, setDueTotal] = useState(0);
  // 收件箱待处理数（active 碎片计数）
  const [inboxCount, setInboxCount] = useState(0);
  const [status, setStatus] = useState("");
  // v0.14.1：成功提示区（绿色——与 status 错误红区分；新建组反馈承载）
  const [notice, setNotice] = useState("");
  // 体系引用映射（组 id → 引用它的体系列表；v0.13.7 触点① 徽标）
  const [systemLinks, setSystemLinks] = useState<Record<number, { systemId: number; count: number }[]>>({});
  const [systems, setSystems] = useState<KnowledgeSystem[]>([]);
  // ⓘ 弹层态（受控单开——同一时间只开一个组）
  const [popover, setPopover] = useState<{ group: NoteGroup; anchor: { x: number; y: number } } | null>(null);
  // v0.14 B：组色选择器打开态（受控单开；null=全关）
  const [colorPickerFor, setColorPickerFor] = useState<number | null>(null);
  // v0.14.1：新建组弹窗开合
  const [createOpen, setCreateOpen] = useState(false);
  // ── v0.14 C1：Obsidian 式状态 ──
  const [groupQuery, setGroupQuery] = useState("");
  // 分区折叠记忆（localStorage 初始化；kind → 是否折叠）
  const [folded, setFolded] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    const f: Record<string, boolean> = {};
    for (const s of GROUP_SECTIONS) f[s.kind] = readFolded(window.localStorage, s.kind);
    return f;
  });
  // 最近使用（LRU≤5；访问组时写入 localStorage）
  const [recentIds, setRecentIds] = useState<number[]>(() =>
    typeof window === "undefined" ? [] : readRecentGroupIds(window.localStorage),
  );
  // 拖拽悬停态（组行高亮）
  const [dragOverId, setDragOverId] = useState<number | null>(null);

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

  // ── v0.14 C1：过滤 / 最近使用 / 折叠 / 拖拽 ──
  const filteredGroups = useMemo(() => filterGroups(groups, groupQuery), [groups, groupQuery]);
  const recentGroups = useMemo(
    () => recentIds.map((id) => groups.find((g) => g.id === id)).filter((g): g is NoteGroup => !!g),
    [recentIds, groups],
  );

  /** 访问组：写最近使用（LRU）+ 过滤切换（toggle=组行单击互斥；recent=直达） */
  const handleGroupSelect = (g: NoteGroup, toggle: boolean) => {
    setRecentIds((cur) => pushRecentGroup(cur, g.id));
    onGroupFilterChange(toggle ? (groupFilter === g.id ? null : g.id) : g.id);
  };

  const toggleFolded = (kind: string) => {
    setFolded((cur) => ({ ...cur, [kind]: !cur[kind] }));
  };

  // v0.14 C1 审查（L6）：setState updater 保持纯函数——localStorage 副作用移出，
  // 经 useEffect 在 state 落定后同步（StrictMode 双调用/并发渲染下行为确定）；
  // 挂载后首写与初始化值相同，幂等无副作用
  useEffect(() => {
    writeRecentGroupIds(window.localStorage, recentIds);
  }, [recentIds]);
  useEffect(() => {
    // folded 键数固定（GROUP_SECTIONS），全量写量级忽略
    Object.entries(folded).forEach(([kind, value]) => writeFolded(window.localStorage, kind, value));
  }, [folded]);

  /** 拖拽归组（组行 drop；载荷支持多选 JSON + 单 id 兜底——REQ-287 整组拖走） */
  const handleGroupDrop = (g: NoteGroup, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
    const ids = crateDndReadIds(e.dataTransfer);
    if (ids.length === 0) return;
    void (async () => {
      let failed = 0;
      for (const noteId of ids) {
        try {
          await invoke("move_note_to_group", { noteId, groupId: g.id });
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) setStatus(`归组失败 ${failed}/${ids.length} 条`);
      onChanged();
    })();
  };

  /** v0.14.1：行内重命名提交（rename_note_group 命令自 v0.11.0 存在，本版接线） */
  const handleRename = async (g: NoteGroup, name: string) => {
    try {
      await invoke<boolean>("rename_note_group", { id: g.id, name });
      setStatus("");
      onChanged();
    } catch (e) {
      setStatus(`重命名失败: ${e}`);
    }
  };

  const renderGroupRow = (g: NoteGroup) => (
    <GroupSidebarRow
      key={g.id}
      group={g}
      active={groupFilter === g.id}
      systems={systems}
      systemLinks={systemLinks[g.id] ?? []}
      colorPickerOpen={colorPickerFor === g.id}
      dragOver={dragOverId === g.id}
      onSelect={() => handleGroupSelect(g, true)}
      onInfo={(e) => openPopover(g, e)}
      onToggleColorPicker={() => setColorPickerFor(colorPickerFor === g.id ? null : g.id)}
      onColorChange={(color) => {
        invoke("update_group_color", { id: g.id, color })
          .then(() => { setColorPickerFor(null); onChanged(); })
          .catch((e) => setStatus(`组颜色设置失败: ${e}`));
      }}
      onRename={(name) => void handleRename(g, name)}
      onOpenSystem={(id) => onOpenSystem(id)}
      onDragOver={(e) => {
        // REQ-287：多选载荷（note-ids JSON）+ 单 id 兜底均可落组
        if (e.dataTransfer.types.includes("text/note-ids") || e.dataTransfer.types.includes("text/note-id")) {
          e.preventDefault();
          setDragOverId(g.id);
        }
      }}
      onDragLeave={() => setDragOverId((cur) => (cur === g.id ? null : cur))}
      onDrop={(e) => handleGroupDrop(g, e)}
      // v0.16.1：右键组行 = 打开 ⓘ 组管理弹层（同语义；原生菜单已全局禁用）
      onContextMenu={(e) => openPopover(g, e)}
    />
  );

  const filtering = groupQuery.trim().length > 0;

  return (
    <div style={{ width, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", position: "relative", minWidth: 0 }}>
      {/* 头部：标题 + 新建组 + 刷新 */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📁 笔记组</span>
        <button
          data-testid="group-create-open"
          onClick={() => setCreateOpen(true)}
          style={{ marginLeft: "auto", fontSize: 13, cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", borderRadius: 4, padding: "0 6px", lineHeight: "18px", color: "#0f766e" }}
          title="新建主题组（名称+领域+颜色）"
        >
          ＋ 新建组
        </button>
        <button onClick={() => void load()} style={{ fontSize: 13, cursor: "pointer" }} title="刷新组列表">⟳</button>
        <button onClick={onCollapse} style={{ fontSize: 12, cursor: "pointer", border: "none", background: "none", color: "#9ca3af" }} title="折叠侧栏">⟨</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* v0.14 C1：组过滤框 */}
        <input
          data-testid="group-filter-input"
          value={groupQuery}
          onChange={(e) => setGroupQuery(e.target.value)}
          placeholder="🔍 过滤组…"
          style={{ width: "100%", fontSize: 12, padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 4, boxSizing: "border-box", marginBottom: 4 }}
        />

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

        {/* v0.14 C1：最近使用区（LRU≤5；点击直达过滤——无 toggle 互斥） */}
        {!filtering && recentGroups.length > 0 && (
          <div data-testid="recent-groups" style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", padding: "2px 10px", fontWeight: 600 }}>🕐 最近使用</div>
            {recentGroups.map((g) => (
              <div
                key={g.id}
                onClick={() => handleGroupSelect(g, false)}
                style={{
                  padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                  background: groupFilter === g.id ? "#f0fdfa" : "transparent",
                  color: groupFilter === g.id ? "#0f766e" : "#374151",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {g.name}
              </div>
            ))}
          </div>
        )}

        {/* v0.14 C1：组分区（无查询→按 kind 分区+折叠记忆；有查询→扁平过滤结果） */}
        {filtering ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filteredGroups.map(renderGroupRow)}
            {filteredGroups.length === 0 && (
              <p style={{ fontSize: 12, color: "#9ca3af", padding: "12px 8px" }}>无匹配组</p>
            )}
          </div>
        ) : (
          GROUP_SECTIONS.map((sec) => {
            const secGroups = filteredGroups.filter((g) => g.kind === sec.kind);
            if (secGroups.length === 0) return null;
            const isFolded = folded[sec.kind] ?? false;
            return (
              <div key={sec.kind} data-testid={`group-section-${sec.kind}`} style={{ marginTop: 6 }}>
                <div
                  data-testid={`section-toggle-${sec.kind}`}
                  onClick={() => toggleFolded(sec.kind)}
                  style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", padding: "2px 10px", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span>{isFolded ? "▸" : "▾"}</span> {sec.title}
                  <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>{secGroups.length}</span>
                </div>
                {!isFolded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {secGroups.map(renderGroupRow)}
                  </div>
                )}
              </div>
            );
          })
        )}

        {groups.length === 0 && (
          <p style={{ fontSize: 12, color: "#9ca3af", padding: "12px 8px" }}>
            暂无笔记组——会话转笔记时自动归组
          </p>
        )}

        {/* 🎴 复习（全量入口：UI 最小化——一个按钮 + 到期数；v0.20.5：✅ 行动
            入口与徽标已移除——行动独立为顶层「✅ 行动」Tab 唯一入口） */}
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
      {notice && <p data-testid="group-notice" style={{ padding: 8, fontSize: 12, color: "#0f766e" }}>{notice}</p>}

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

      {/* v0.14.1：新建组弹窗（创建成功 → 关闭 + onChanged refreshToken 驱动刷新；
          成功反馈文案经回调上抛——status 区承载，替代弹窗内一帧即卸载的死代码） */}
      {createOpen && (
        <GroupCreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(text) => { setCreateOpen(false); setNotice(text); onChanged(); }}
        />
      )}
    </div>
  );
}
