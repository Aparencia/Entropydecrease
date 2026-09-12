/**
 * @ai-context ⌘K 命令面板（规格 §6.1「⌘K 命令入口用来替代现在手写的 9 个 `focus*` 参数跳转」；
 *   批 3 Task 11）。
 *
 * 分工：**T11 交付壳** —— 开合、键盘导航（↑↓ / Enter / Esc）、命令列表 =
 *   9 个页面跳转命令（来自 `navRegistry` 的 `ALL_ENTRIES`，含设置页）+ 1 条对话面板命令。
 *   **T12 交付数据源** —— 把 `kb_search` 的命中变成「结果命令」；交接面就是本文件导出的 `Command`
 *   （同一形状，T12 只往里追加，不必改本文件的结构）。
 *   顶栏的 `dock-toggle` **不因本文件而移除**（控制方 T11-b：它仍是 REQ-274 的唯一显式入口，
 *   `TopBar.test.tsx` 的守卫钉着它）⇒ 面板里的「对话面板」命令是**增量**入口。
 *
 * Why 不用 L1 的 `Modal` 原语（批 3 非目标 2）：从原语层进来会连带 `motion.css` 与整层 CSS 进首屏，
 *   吃掉批 2 挣来的包体余量。本组件因此**自带**遮罩 + Esc + 自动聚焦，
 *   但**契约与 `Modal` 逐条对齐**：`role="dialog"` + `aria-modal` + 输入框自动聚焦 + ESC 关 + 点遮罩关
 *   （遮罩走 `mousedown` + `target === currentTarget`，与 `Modal` 同款：避免「面板内按下、遮罩上松开」误关）。
 *   ⚠️ **这里是批 4 的迁移点**：批 4 用 `Modal` 换掉本文件的遮罩与键盘代码，并把下面的 IME 判断
 *   换成原语层的 `isImeComposing()`；本文件的 CSS 也整份随之删除。不写在这里，批 4 会漏掉它。
 *
 * 副作用：`open` 为真时在 `window` 上挂一个 keydown（只处理 Esc），关闭或卸载即解绑；
 *   输入框 `autoFocus` 会搬走焦点、关闭时**不还原**（与今日 28 个手写弹层一致 —— 焦点归还是批 4 的
 *   `Modal` 焦点管理范围）。
 * 边界：① **不做模糊搜索排序**（只对本地面板命令做大小写不敏感的子串过滤；T12 的检索结果由后端给序）；
 *   ② **不做动效**（批 6）；③ 不认识任何 `focus*` 深链参数（T12 才收敛入口）；
 *   ④ 层级不写裸数字 —— 走 `zIndex("modal")` 六档标尺；
 *   ⑤ 组合态的 Esc（「只取消候选词」）归批 4 的 IME 原语，本文件只保证 **Enter 不误提交**。
 */
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { zIndex } from "../ui/zIndex";
import { ALL_ENTRIES, type PageKey } from "./navRegistry";
import "./CommandPalette.css";

/** 选中一条命令后交给调用方的**动作描述**：调用方持有 `setPage` 与对话面板状态，本组件不碰它们 */
export type PalettePick = { kind: "page"; key: PageKey } | { kind: "dock" };

/** 一条命令（T12 的 `commandsFromHits(): Command[]` 用的就是这个形状） */
export interface Command {
  id: string;
  label: string;
  /** 右侧灰字提示（类型 / 快捷键）——纯展示，不参与过滤 */
  hint?: string;
  /** 执行体：由面板在 Enter 或点击时调用，随后面板自行关闭 */
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onPick: (pick: PalettePick) => void;
}

/** 循环移动选中项（↑↓ 在两端回绕；空列表恒 0） */
function step(index: number, delta: number, size: number): number {
  if (size <= 0) return 0;
  return (Math.min(index, size - 1) + delta + size) % size;
}

/** 本地子串过滤（大小写不敏感）。空查询 = 全量 —— 「没输入时也看得到全部页面命令」是本面板的默认形态 */
function filterCommands(commands: readonly Command[], query: string): readonly Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter((c) => c.label.toLowerCase().includes(q));
}

/** 装配命令列表：注册表的 9 页 + 面板自带的对话面板入口（页面命令恒在最前，T12 的结果追在其后） */
function buildCommands(onPick: (pick: PalettePick) => void): Command[] {
  const pages: Command[] = ALL_ENTRIES.map((e) => ({
    id: `page:${e.key}`,
    label: e.label,
    hint: "页面",
    run: () => onPick({ kind: "page", key: e.key }),
  }));
  return [...pages, { id: "dock", label: "对话面板", hint: "Ctrl+Shift+A", run: () => onPick({ kind: "dock" }) }];
}

export function CommandPalette({ open, onClose, onPick }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // 关闭回调走 ref 镜像：调用点写的是内联箭头（每次渲染新身份），直接进 deps 会让 window 监听
  // 反复解绑/重挂（与 `Modal` 的 useEscapeToClose 同款处置）。
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // 每次打开都重置：否则上一次留下的输入会**静默决定**这一次的首选项（本面板是「每次从零开始」的入口）
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
  }, [open]);

  // ESC 关：只在打开时挂 window 监听（冒泡相）—— 与 `Modal` 的「一次只响应一层」同口径
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.repeat) return; // 长按 Esc 不重复关
      closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // 命令表随渲染重建（10 条，成本可忽略）：`run` 闭包因此恒为最新，不需要为依赖稳定性再包一层 memo
  const list = filterCommands(buildCommands(onPick), query);
  const activeAt = list.length === 0 ? -1 : Math.min(active, list.length - 1);

  if (!open) return null;

  const activate = (cmd: Command): void => {
    cmd.run();
    closeRef.current();
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    // IME 守卫：中文输入法**组合期**的 Enter 是「确认候选词」，不是「提交」（规格 §5.2 第三条）。
    // 批 4 换成原语层的 `isImeComposing()`；这里不许 import 那一层（非目标 2）。
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(step(activeAt, 1, list.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(step(activeAt, -1, list.length));
    } else if (event.key === "Enter") {
      const cmd = list[activeAt];
      if (cmd) activate(cmd);
    }
  };

  return (
    <div
      className="ed-cmdk__overlay"
      data-testid="command-palette-overlay"
      style={{ zIndex: zIndex("modal") }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      <div className="ed-cmdk" role="dialog" aria-modal="true" aria-label="命令面板" data-testid="command-palette">
        <input
          className="ed-cmdk__input"
          data-testid="command-palette-input"
          type="text"
          autoFocus
          value={query}
          aria-label="命令搜索"
          placeholder="输入页面名…"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0); // 输入变化即回到首项：否则旧的选中位会指向过滤后的另一条命令
          }}
          onKeyDown={onInputKeyDown}
        />
        <ul className="ed-cmdk__list" role="listbox" aria-label="命令列表" data-testid="command-palette-list">
          {list.map((cmd, i) => (
            <li
              key={cmd.id}
              role="option"
              aria-selected={i === activeAt}
              data-testid={`command-${cmd.id}`}
              className={i === activeAt ? "ed-cmdk__item ed-cmdk__item--active" : "ed-cmdk__item"}
              onMouseEnter={() => setActive(i)}
              onClick={() => activate(cmd)}
            >
              <span className="ed-cmdk__label">{cmd.label}</span>
              {cmd.hint ? <span className="ed-cmdk__hint">{cmd.hint}</span> : null}
            </li>
          ))}
          {list.length === 0 ? (
            <li className="ed-cmdk__empty" data-testid="command-palette-empty">
              没有匹配的命令
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
