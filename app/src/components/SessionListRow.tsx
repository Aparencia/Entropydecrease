/**
 * SessionListRow — 会话列表行（批 4 自 SessionListPanel 拆出，交互矩阵落地）。
 *
 * @ai-context: 行单击语义由父层裁决（非选择模式=打开详情；选择模式=勾选）——
 *              本行只做修饰键转发与事件上抛（与 NoteListRow 同构）。视觉=
 *              去 checkbox 列改 ✓ 前缀 + 靛蓝底（选中行不再无高亮）。
 * @ai-context: 行内重命名（右键菜单「重命名」入口）：Enter 提交/失焦提交、
 *              Esc 取消（stopPropagation——不触发父层全局 Esc 退出逻辑）；
 *              空标题/未变化=放弃退出（与详情 ✎ 同口径）。成功落库后后端
 *              广播 data:sessions-changed，父层自动刷新列表——本行用
 *              titleEcho 本地回声桥接刷新前空窗；分组视图（groups 快照不随
 *              事件刷新）靠 echo 持续显示新标题，服务端值追上即回落。
 * @ai-context: 多选视觉优先级=详情打开（teal）> 选集（indigo）> 默认白
 *              （与 NoteListRow 的 isOpen > multiSelected 同序）。
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionListItem } from "../types";
import { fmtDate, fmtDuration } from "../utils/fmt";
import { Button } from "../ui/primitives";

/** 父层下发的行内重命名请求（nonce 保证同一行连续两次请求都重启编辑） */
export interface SessionRenameRequest {
  id: number;
  nonce: number;
}

interface Props {
  item: SessionListItem;
  /** 本行详情打开中（teal 高亮优先于选集） */
  isOpen: boolean;
  /** 本行在多选集内（靛蓝高亮 + ✓ 前缀） */
  multiSelected: boolean;
  /** 可转化判定（父层 isEligible；决定「转笔记」按钮显隐） */
  canConvert: boolean;
  /** 行内重命名请求（null=无；父层持有） */
  renameRequest: SessionRenameRequest | null;
  /** 行内重命名结束（提交/取消后通知父层清请求） */
  onRenameEnd: () => void;
  /** 改名成功（父层刷新详情——列表刷新走既有 data:sessions-changed 总线） */
  onRenamed: (id: number) => void;
  showToast: (msg: string, kind: "ok" | "err") => void;
  onOpen: (item: SessionListItem) => void;
  onModifierClick: (item: SessionListItem, ctrl: boolean, shift: boolean) => void;
  onContextMenu: (e: React.MouseEvent, item: SessionListItem) => void;
  onConvert: (item: SessionListItem) => void;
  onOpenNote: (noteId: number) => void;
}

/** 状态徽标（转化状态可见化核心；自 SessionListPanel 原样迁移） */
function statusBadge(item: SessionListItem) {
  const s = item.session;
  if (s.status === "recording")
    return <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626" }}>● 录制中</span>;
  if (item.hasNote)
    return (
      <span style={{ fontSize: 11, fontWeight: 600, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 10, padding: "1px 7px" }}>
        ✓ 已转笔记
      </span>
    );
  if (s.status === "failed") return <span style={{ fontSize: 11, color: "#dc2626" }}>异常</span>;
  if (item.hasContent)
    return (
      <span style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "1px 7px" }}>
        待转
      </span>
    );
  return <span style={{ fontSize: 11, color: "#6b7280" }}>已完成</span>;
}

export default function SessionListRow({
  item, isOpen, multiSelected, canConvert, renameRequest,
  onRenameEnd, onRenamed, showToast,
  onOpen, onModifierClick, onContextMenu, onConvert, onOpenNote,
}: Props) {
  const s = item.session;
  // 编辑态完全派生自父层请求（id 命中即编辑；结束=父层清请求后自动退出）
  const editing = renameRequest != null && renameRequest.id === s.id;
  // 重命名期间输入框内容（随请求启动重置为服务端标题）
  const [value, setValue] = useState("");
  const [echo, setEcho] = useState<string | null>(null);
  // busy=提交中：state 供输入框禁用视觉；busyRef 供同步判定（state 更新
  // 异步——同 tick 双击 Enter 需 ref 立即拦截防连点）；editingRef=编辑态
  // 镜像（Esc/提交后 blur 不再触发重复提交——移除节点时 focusout 竞态）
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const editingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 请求启动编辑：重置内容 + 聚焦全选；同一行二次请求（nonce 变）也重启
  useEffect(() => {
    if (!editing) return;
    editingRef.current = true;
    setValue(s.title);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renameRequest]);

  /** 结束编辑（提交/取消共用）——清编辑镜像并通知父层清请求 */
  const endRename = () => {
    editingRef.current = false;
    onRenameEnd();
  };

  /** Enter/失焦提交：空标题或未变化=放弃退出（与详情页 ✎ 同口径） */
  const commitRename = async () => {
    if (!editingRef.current || busyRef.current) return;
    const t = value.trim();
    if (!t || t === s.title) {
      endRename();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await invoke("update_session_title", { id: s.id, title: t });
      // 回声桥接刷新空窗（分组快照不随总线刷新则长期生效）
      setEcho(t);
      showToast(`已重命名为「${t}」`, "ok");
      onRenamed(s.id);
      endRename();
    } catch (e) {
      showToast(`改名失败: ${e}`, "err");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // 服务端标题追上（刷新/他处改名）即丢弃回声，避免陈旧值永驻
  useEffect(() => {
    if (echo != null && s.title !== echo) setEcho(null);
  }, [s.title, echo]);

  const displayTitle = echo ?? s.title;
  const now = Math.floor(Date.now() / 1000);
  const durationMs = ((s.ended_at ?? now) - s.started_at) * 1000;

  return (
    <div
      data-testid={`session-row-${s.id}`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) onModifierClick(item, true, false);
        else if (e.shiftKey) onModifierClick(item, false, true);
        else onOpen(item);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, item);
      }}
      style={{
        padding: "9px 14px",
        borderBottom: "1px solid #f3f4f6",
        cursor: "pointer",
        background: isOpen ? "#f0fdfa" : multiSelected ? "#eef2ff" : "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {multiSelected ? (
          <span style={{ fontSize: 11, color: "#4f46e5", fontWeight: 700, flexShrink: 0 }}>✓</span>
        ) : (
          <span style={{ width: 11, flexShrink: 0 }} />
        )}
        {editing ? (
          <input
            ref={inputRef}
            data-testid="session-row-title-input"
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                void commitRename();
              } else if (e.key === "Escape") {
                // 不冒泡：仅取消行内编辑，不触发父层全局 Esc 选择退出
                e.stopPropagation();
                endRename();
              }
            }}
            onBlur={() => void commitRename()}
            autoFocus
            style={{ flex: 1, fontSize: 13, fontWeight: 500, padding: "1px 6px", border: "1px solid #0d9488", borderRadius: 4, minWidth: 0 }}
            title="Enter 保存 / Esc 取消"
          />
        ) : (
          <span
            style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            title={displayTitle}
          >
            {displayTitle}
          </span>
        )}
        {statusBadge(item)}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3, display: "flex", alignItems: "center", gap: 8, paddingLeft: 17 }}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          #{item.displayNo} · {fmtDate(s.started_at)}
        </span>
        {s.kind === "photo" && <span style={{ fontWeight: 600 }}>📷 图文</span>}
        <span>{s.status === "recording" ? "进行中" : fmtDuration(durationMs)}</span>
        {s.source_window && (
          <span style={{ maxWidth: 130, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {s.source_window}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {/* 批 4 B4：`Button` 的 `onClick` 契约是 `() => void`（无事件实参）⇒ 行级冒泡拦截
              由外层 `<span>` 承担（同 `KnowledgeTreeView` 既有的行内操作包裹写法）。 */}
          {item.hasNote ? (
            <span onClick={(e) => e.stopPropagation()}>
              <Button
                variant="secondary"
                size="sm"
                title="打开关联笔记"
                onClick={() => {
                  if (item.noteId != null) onOpenNote(item.noteId);
                }}
              >
                查看笔记 →
              </Button>
            </span>
          ) : canConvert ? (
            <span onClick={(e) => e.stopPropagation()}>
              <Button
                variant="secondary"
                size="sm"
                title="一键转为笔记（与详情页同管线）"
                onClick={() => onConvert(item)}
              >
                转笔记
              </Button>
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
