/**
 * SelectionActionMenu — 笔记正文「选中文字右键」共享自绘菜单（REQ-317，批 8）。
 *
 * @ai-context: 阅读态（NoteReadingView）与编辑态（RichEditorView/CodeMirror）
 *              两宿主共用的应用内菜单——原生菜单已被 BrowserChrome 全局抑制，
 *              本组件即其替代：**文本快照（text）在菜单打开时由宿主捕获传入**
 *              （Why：菜单内点击会动焦点/选区，动作不得依赖“点击瞬间的 DOM
 *              选区仍存活”；编辑态快照来自 CM state，阅读态来自 window
 *              Selection）。复制在菜单内自执行并内联展示结果（行菜单范式：
 *              复制后保持打开、状态行留痕）；其余动作经 onAction 委托宿主
 *              （先 onClose 再执行——既有行菜单范式）。
 * @ai-context: 交互契约同既有自绘菜单：透明背板（点击/右键即关）、ESC 关闭
 *              （**capture 层监听 + stopPropagation**——编辑态下 NotesPage 有
 *              全局 ESC=退出编辑的 window 监听（挂载更早、先于本组件 bubble
 *              监听），capture 先拦截可让 ESC 只关菜单不误退编辑）、坐标钳制、
 *              滚动/失焦/缩放收起。背板与面板 z 60/61 同既有行菜单。
 */
import { useEffect, useRef, useState } from "react";
import {
  buildSelectionMenuItems,
  clampMenuXY,
  type NoteSelectionMode,
  type SelectionActionId,
} from "../../utils/noteSelectionMenu";
import { writeClipboardText } from "../../utils/clipboardWrite";

interface Props {
  x: number;
  y: number;
  mode: NoteSelectionMode;
  /** 菜单打开瞬间的选区文本快照（见文件头 Why） */
  text: string;
  onClose: () => void;
  /** 非复制动作委托宿主（先关菜单后执行；selectAll/addTask 亦走此） */
  onAction: (id: Exclude<SelectionActionId, "copy">) => void;
}

const MENU_W = 224;
/** 行高/头/状态行余量的高度估算（钳制用；菜单自身不溢出视口） */
const ROW_H = 30;
const HEAD_H = 34;
/** 状态行高度（复制成功后出现；`已复制…` 反馈行 ≈18px 字高 + 8px 纵向留白） */
const STATUS_H = 26;
/** 面板上下 padding 合计（style padding: 4） */
const PANEL_PAD = 8;

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
  cursor: "pointer",
  textAlign: "left",
};

export default function SelectionActionMenu({ x, y, mode, text, onClose, onAction }: Props) {
  const [status, setStatus] = useState("");
  const items = buildSelectionMenuItems(mode, text.trim().length > 0);
  const statusShown = status.length > 0;
  // 复制的异步落定后组件可能已卸载（点背板关闭）——写标志防 setState on unmounted
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // ESC 关闭：capture 层先于 NotesPage 全局 ESC（退出编辑）监听生效并阻断冒泡
  // ——菜单开着时 ESC 只关菜单（见文件头）；关闭后监听移除，ESC 恢复全局语义
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // 滚动收起（capture：正文容器自身的 scroll 也会到 window；菜单自身滚动除外）
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = () => onClose();
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close();
    };
    const onBlurOrResize = () => onClose();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", onBlurOrResize);
    window.addEventListener("resize", onBlurOrResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", onBlurOrResize);
      window.removeEventListener("resize", onBlurOrResize);
    };
  }, [onClose]);

  // 坐标钳制（审查 P3-4 取舍）：高度按「含状态行区」的最终形态**一次性**计算
  // ——Why 不随 statusShown 重算：贴底菜单在复制成功、状态行出现时会因高度
  // 增加（+18px 净增）被重钳上跳（位置抖动）；预留后位置=终位，复制只增高
  // 不位移。代价：未触发状态行时菜单可比内容高出一截（多预留在上方空白），
  // 视觉可接受且换取“打开即终位”的稳定性。实际渲染高度仍随内容伸缩。
  const clampH = HEAD_H + items.length * ROW_H + STATUS_H + PANEL_PAD;
  const pos = clampMenuXY(x, y, MENU_W, clampH, window.innerWidth, window.innerHeight);

  const copy = () => {
    void writeClipboardText(text).then((ok) => {
      if (!aliveRef.current) return;
      setStatus(ok ? "已复制选中文本" : "复制失败（可用 Ctrl+C）");
    });
  };

  return (
    <>
      {/* 透明背板：点击/右键收起（覆盖全屏拦截） */}
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "transparent" }}
      />
      <div
        ref={menuRef}
        role="menu"
        data-testid="note-sel-menu"
        data-app-menu=""
        onContextMenu={(e) => e.preventDefault()}
        // preventDefault 防焦点窃取：mousedown 默认会聚焦按钮使 CM/正文失焦
        // （复制后菜单保持打开留状态行——编辑态焦点须留在编辑器）
        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 61,
          width: MENU_W,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
          padding: 4,
        }}
      >
        {/* 快照预览（行菜单标题位同构；溢出省略 + title 全文） */}
        <div
          style={{
            fontSize: 11,
            color: "#6b7280",
            padding: "2px 10px 4px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={text}
        >
          {text}
        </div>
        {items.map((item) => (
          <div key={item.id}>
            {item.dividerBefore && <div style={{ height: 1, background: "#f3f4f6", margin: "3px 6px" }} />}
            <button
              data-testid={`note-sel-${item.id}`}
              disabled={!item.enabled}
              onClick={() => {
                if (!item.enabled) return;
                if (item.id === "copy") { copy(); return; }
                onClose();
                onAction(item.id);
              }}
              style={{
                ...ITEM,
                color: item.enabled ? "#374151" : "#d1d5db",
                cursor: item.enabled ? "pointer" : "default",
              }}
            >
              <span style={{ width: 20, fontSize: 12, textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </button>
          </div>
        ))}
        {statusShown && (
          <div
            data-testid="note-sel-copy-status"
            style={{
              fontSize: 11,
              color: status.startsWith("已") ? "#047857" : "#dc2626",
              padding: "2px 10px 2px",
            }}
          >
            {status}
          </div>
        )}
      </div>
    </>
  );
}
