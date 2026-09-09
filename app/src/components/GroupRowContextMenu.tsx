/**
 * GroupRowContextMenu — 组行右键菜单（REQ-315，v0.20.11 批 6）。
 *
 * @ai-context: 原生右键菜单已全局禁用——组行右键此前直开 ⓘ 弹层（与 ⓘ 按钮
 *              同语义），本组件承接右键入口并扩展为操作菜单：📌 置顶/取消置顶
 *              （update_note_group_pin）→ ↑↓ 上移/下移（分区手动序快照——
 *              note_group_order_save，父层重排后整表覆写）→ ↺ 回自动排序
 *              （note_group_order_clear——仅组已有手动位时显示；整分区复位在
 *              分区头「手排 ↺」徽标）→ ⓘ 打开信息（保留既有 RouteInfoPopover
 *              入口）。行内 ⓘ 按钮仍直开弹层（不动旧动线）。
 * @ai-context: 置顶组移动禁用——置顶区按更新时间定序（内部排序非手动位），
 *              与笔记置顶语义一致；边界/置顶可用性由父层按分区可见序计算。
 */
import { useEffect } from "react";

interface Props {
  /** 组名（菜单头） */
  name: string;
  pinned: boolean;
  /** 组当前是否有手动位（有则显示「回自动排序」） */
  hasOrderRow: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onPinToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** 清除该组手动位（=该组回自动区；行已删=后端幂等） */
  onClearOrder: () => void;
  /** 打开 ⓘ 组管理弹层（父层以菜单坐标合成锚点） */
  onOpenInfo: () => void;
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

export default function GroupRowContextMenu({
  name, pinned, hasOrderRow, canMoveUp, canMoveDown, x, y,
  onClose, onPinToggle, onMoveUp, onMoveDown, onClearOrder, onOpenInfo,
}: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const px = Math.max(4, Math.min(x, window.innerWidth - 232));
  const py = Math.max(4, Math.min(y, window.innerHeight - 320));
  // 置顶区语义提示（与笔记置顶菜单同口径——置顶项位置由更新时间表达）
  const pinMoveHint = pinned ? "置顶组固定于置顶区（按更新时间排序），取消置顶后可移动" : undefined;
  const moveBtn = (disabled: boolean) => ({
    ...ITEM,
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "default" : "pointer",
  });

  return (
    <>
      {/* 透明背板：点击/右键收起 */}
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "transparent" }}
      />
      <div
        role="menu"
        data-testid="group-row-menu"
        data-app-menu=""
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: px,
          top: py,
          zIndex: 61,
          width: 216,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
          padding: 4,
        }}
      >
        <div style={{ fontSize: 11, color: "#6b7280", padding: "2px 10px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          📁 {name}
        </div>

        <button data-testid="ctx-group-pin" style={ITEM} onClick={() => { onClose(); onPinToggle(); }}>
          <span style={ITEM_ICON}>📌</span> {pinned ? "取消置顶" : "置顶"}
        </button>
        <button
          data-testid="ctx-group-up"
          disabled={!canMoveUp}
          title={pinMoveHint ?? "已在首位"}
          style={moveBtn(!canMoveUp)}
          onClick={() => { if (canMoveUp) { onClose(); onMoveUp(); } }}
        >
          <span style={ITEM_ICON}>↑</span> 上移
        </button>
        <button
          data-testid="ctx-group-down"
          disabled={!canMoveDown}
          title={pinMoveHint ?? "已在末位"}
          style={moveBtn(!canMoveDown)}
          onClick={() => { if (canMoveDown) { onClose(); onMoveDown(); } }}
        >
          <span style={ITEM_ICON}>↓</span> 下移
        </button>
        {hasOrderRow && (
          <button data-testid="ctx-group-reset" style={ITEM} onClick={() => { onClose(); onClearOrder(); }}>
            <span style={ITEM_ICON}>↺</span> 回自动排序（移除手动位）
          </button>
        )}
        <div style={{ height: 1, background: "#f3f4f6", margin: "3px 6px" }} />
        <button data-testid="ctx-group-info" style={ITEM} onClick={() => { onClose(); onOpenInfo(); }}>
          <span style={ITEM_ICON}>ⓘ</span> 打开信息（路由/改判/周契约…）
        </button>
      </div>
    </>
  );
}
