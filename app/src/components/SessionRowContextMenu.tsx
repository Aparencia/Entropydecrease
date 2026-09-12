/**
 * SessionRowContextMenu — 会话行右键菜单（批 4 会话页交互矩阵）。
 *
 * @ai-context: 原生右键菜单已全局禁用（browser_chrome.rs）——本组件是会话行
 *              的应用内替代：打开详情 / 重命名 / 复制标题 / 转为笔记（仅可转
 *              化行）/ 删除（危险红、底部分隔）。菜单项动作除「复制标题」内
 *              部执行外均委托父层既有处理（onOpenDetail/onRename/onConvert/
 *              onDelete——父层负责关闭后的状态编排与 invoke/toast/刷新），
 *              与 NoteRowContextMenu 委托模式同构。
 * @ai-context: 骨架复用 NoteRowContextMenu 模式：透明背板（点击/右键即关）、
 *              ESC 关闭、坐标钳制防越界（右缘/下缘视口内）。选集语义=单行
 *              菜单（用户口径：会话无批处理右键需求，批量走底部批量栏）。
 */
import { useEffect, useState } from "react";
import { zIndex } from "../ui/zIndex";
import type { SessionListItem } from "../types";

interface Props {
  item: SessionListItem;
  x: number;
  y: number;
  onClose: () => void;
  onOpenDetail: (id: number) => void;
  onRename: (item: SessionListItem) => void;
  onConvert: (item: SessionListItem) => void;
  onDelete: (item: SessionListItem) => void;
  /** 本行可转化（决定「转为笔记」项显隐——已转/进行中/无内容不展示） */
  canConvert: boolean;
}

const ITEM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "5px 10px",
  border: "none",
  background: "none",
  borderRadius: 6,
  fontSize: 12.5,
  color: "#374151",
  cursor: "pointer",
  textAlign: "left",
};

const ITEM_ICON: React.CSSProperties = { width: 20, fontSize: 12, textAlign: "center" };

export default function SessionRowContextMenu({
  item, x, y, onClose, onOpenDetail, onRename, onConvert, onDelete, canConvert,
}: Props) {
  const [status, setStatus] = useState("");
  const session = item.session;

  // ESC 关闭（与 NoteRowContextMenu 键盘可达性同规）
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const copyTitle = async () => {
    try {
      await navigator.clipboard.writeText(session.title);
      setStatus("已复制标题");
    } catch {
      setStatus("复制失败（可用 Ctrl+C）");
    }
  };

  // 坐标钳制：菜单 216×≈250 内收于视口（防右键贴边时菜单溢出不可点）
  const px = Math.max(4, Math.min(x, window.innerWidth - 232));
  const py = Math.max(4, Math.min(y, window.innerHeight - 300));

  return (
    <>
      {/* 透明背板：点击/右键收起（覆盖全屏拦截） */}
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: zIndex("popover"), background: "transparent" }}
      />
      <div
        role="menu"
        data-testid="session-row-menu"
        data-app-menu=""
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: px,
          top: py,
          zIndex: zIndex("popover"),
          width: 216,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
          padding: 4,
        }}
      >
        <div style={{ fontSize: 11, color: "#6b7280", padding: "2px 10px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {session.title}
        </div>

        <button data-testid="ctx-open" style={ITEM} onClick={() => { onClose(); onOpenDetail(session.id); }}>
          <span style={ITEM_ICON}>📂</span> 打开详情
        </button>
        <button data-testid="ctx-rename" style={ITEM} onClick={() => { onClose(); onRename(item); }}>
          <span style={ITEM_ICON}>✏️</span> 重命名
        </button>
        <button data-testid="ctx-copy-title" style={ITEM} onClick={() => void copyTitle()}>
          <span style={ITEM_ICON}>📋</span> 复制标题
        </button>
        {canConvert && (
          <button data-testid="ctx-convert" style={ITEM} onClick={() => { onClose(); onConvert(item); }}>
            <span style={ITEM_ICON}>📝</span> 转为笔记
          </button>
        )}
        <div style={{ height: 1, background: "#f3f4f6", margin: "3px 6px" }} />
        <button
          data-testid="ctx-delete"
          style={{ ...ITEM, color: "#b91c1c" }}
          onClick={() => { onClose(); onDelete(item); }}
        >
          <span style={ITEM_ICON}>🗑</span> 删除
        </button>

        {status && (
          <div style={{ fontSize: 11, color: status.startsWith("已") ? "#047857" : "#dc2626", padding: "4px 10px 2px" }}>
            {status}
          </div>
        )}
      </div>
    </>
  );
}
