/**
 * BrowserChrome — 浏览器痕迹去除·前端层（v0.16.1 用户决定①）。
 *
 * @ai-context: 后端已经 WebView2 host 设置禁用原生右键菜单（browser_chrome.rs，
 *              AreDefaultContextMenusEnabled=false——可靠通道）；本组件补两层职责：
 *              ① window contextmenu preventDefault 兜底（开发浏览器环境同效，
 *              应用内不出现浏览器原生菜单）；② input/textarea 右键弹出**应用内**
 *              小菜单（剪切/复制/粘贴/全选）——补偿原生菜单消失后的文本编辑可用性
 *              （右键粘贴是桌面用户肌肉记忆）。自绘菜单（笔记行右键/组行 ⓘ 等）
 *              在各自组件内 stopPropagation，与此监听不竞争（事件到不了 window）。
 *              边界：CodeMirror 编辑区（.cm-content contenteditable）不放行——
 *              其内部有完整键鼠编辑语义，插入文本走 CM 事务而不是裸 DOM。
 *              失败降级：剪贴板权限被拒/execCommand 不可用 → 菜单项静默无操作
 *              （不弹错；Ctrl+C/V 主路径不受影响）。
 */
import { useEffect, useRef, useState } from "react";

interface MenuState {
  x: number;
  y: number;
  el: HTMLInputElement | HTMLTextAreaElement;
  hasSelection: boolean;
}

/** 可编辑文本目标判定（仅 input/textarea；contenteditable 交给宿主语义） */
function textEditableTarget(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest(".cm-editor")) return null; // CM 编辑区有自己的编辑事务
  if (target instanceof HTMLTextAreaElement) return target;
  if (target instanceof HTMLInputElement) {
    const type = (target.type || "text").toLowerCase();
    return ["text", "search", "url", "tel", "password", "email", ""].includes(type) ? target : null;
  }
  return null;
}

export default function BrowserChrome() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const el = textEditableTarget(e.target);
      // 无条件抑制：应用内任何位置都不允许浏览器原生菜单
      e.preventDefault();
      if (!el) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      setMenu({
        x: e.clientX,
        y: e.clientY,
        el,
        hasSelection: end > start,
      });
    };
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onScroll = (e: Event) => {
      // 菜单自身滚动不关闭；其余任何滚动都收起（位置已失效）
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close();
    };
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  if (!menu) return null;

  const { x, y, el, hasSelection } = menu;
  const px = Math.min(x, window.innerWidth - 148);
  const py = Math.min(y, window.innerHeight - 132);

  const runOnEditable = (fn: (t: HTMLInputElement | HTMLTextAreaElement) => void) => {
    fn(el);
    setMenu(null);
  };

  const actions: { label: string; disabled: boolean; run: () => void }[] = [
    {
      label: "剪切",
      disabled: !hasSelection,
      run: () => runOnEditable(() => {
        try { document.execCommand("cut"); } catch { /* 降级：Ctrl+X 主路径 */ }
      }),
    },
    {
      label: "复制",
      disabled: !hasSelection,
      run: () => runOnEditable(() => {
        try { document.execCommand("copy"); } catch { /* 降级：Ctrl+C 主路径 */ }
      }),
    },
    {
      label: "粘贴",
      disabled: false,
      run: () => {
        // 异步读剪贴板 → 插入光标处；失败静默（Ctrl+V 主路径）
        void navigator.clipboard.readText()
          .then((text) => {
            if (!text) { setMenu(null); return; }
            runOnEditable((t) => {
              const start = t.selectionStart ?? t.value.length;
              const end = t.selectionEnd ?? start;
              // setRangeText 不经 React onChange——补发 input 事件驱动受控组件同步
              t.setRangeText(text, start, end, "end");
              t.dispatchEvent(new Event("input", { bubbles: true }));
            });
          })
          .catch(() => { setMenu(null); });
      },
    },
    {
      label: "全选",
      disabled: false,
      run: () => runOnEditable((t) => { t.focus(); t.select(); }),
    },
  ];

  return (
    <div
      ref={menuRef}
      data-testid="browser-chrome-menu"
      data-app-menu=""
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: px,
        top: py,
        zIndex: 1000,
        minWidth: 128,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
        padding: 4,
      }}
    >
      {actions.map((a) => (
        <button
          key={a.label}
          data-testid={`browser-chrome-${a.label}`}
          disabled={a.disabled}
          onClick={a.run}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            border: "none",
            background: "none",
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 12.5,
            color: a.disabled ? "#d1d5db" : "#374151",
            cursor: a.disabled ? "default" : "pointer",
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
