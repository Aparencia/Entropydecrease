/**
 * @ai-context ⌘K 命令面板（规格 §6.1「⌘K 命令入口用来替代现在手写的 9 个 `focus*` 参数跳转」）。
 *   批 4 T9：**遮罩 / ESC / 焦点 / 层级整条交给 `Modal`**（ADR-033 §7「唯一持有者」），
 *   **内容层改由既有原语表达**（`Text` / `StatusLine` / `EmptyState`），自带的 `CommandPalette.css`
 *   **整份删除**（计划 V1）—— 本文件因此不再持有任何遮罩、`window` 级 ESC 监听、焦点陷阱、
 *   裸层级，也不再有自带 CSS 层或 `.ed-cmdk*` 残类。
 *
 * 分工（批 3 原样保留）：**T11 交付壳** —— 开合、键盘导航（↑↓ / Enter / Esc）、命令列表 =
 *   9 个页面跳转命令（注册表 `ALL_ENTRIES`，含设置页）+ 对话面板 + 新建体系；
 *   **T12 交付数据源**（已接线）—— `kb_search` 命中变成「结果命令」追在页面命令之后
 *   （180ms 防抖 + `seq` 只认最后一次 + 失败降级 + 一行如实提示）。数据形状全在
 *   `shell/kbCommands.ts`（纯函数、不 import React），取样在 `useKbPaletteSearch`（hook）⇒
 *   本文件只做渲染与键盘。顶栏的 `dock-toggle` **不因本文件而移除**（控制方 T11-b：REQ-274 的
 *   唯一显式入口，`TopBar.test.tsx` 钉着它）⇒ 面板里的「对话面板」是**增量**入口。
 *
 * 等价性锚点（T9 逐条核对，证据见 `task-9-report.md`）：`role="dialog"` + `aria-modal` 由 `Modal` 给；
 *   无障碍名 `aria-label="命令面板"` → `Modal` 的 `aria-labelledby` → 可见标题「命令面板」（同值）；
 *   点遮罩关（`mousedown` + `target === currentTarget`，`Modal` 同款）· ESC 关（原 window 冒泡 →
 *   现 `document` 冒泡 + 栈顶）· 输入框初始聚焦（`Modal` 的陷阱给的是**首个可聚焦元素 = 头部关闭钮**，
 *   见下）· 遮罩 `data-testid` **同名**（`Modal` 的 `${testId}-overlay` = 原 `command-palette-overlay`）。
 *
 * 副作用：`Modal` 负责 portal / 焦点陷阱 / ESC 栈 / body 滚动锁；本文件只多一个「打开时把焦点钉在
 *   输入框」的 effect（`Modal` 的陷阱给「首个可聚焦元素」= 头部关闭钮 —— `Modal.test.tsx:200` 钉着
 *   这条契约，而本面板的入口是搜索框 ⇒ 属**调用点自己的初始焦点**，与 `ConfirmDialog.tsx:141-153`
 *   把焦点重定向到取消钮同款：只搬一次焦点，不接管 Tab）。
 *
 * 边界：
 *   ① **合并语义**（控制方 I-1 裁决 B）：「**有命中时页面命令恒在；零命中时按查询词过滤并显示空态**」
 *      —— 只有零命中那一支才把查询词交给 `filterCommands`（空串 = 全量）；命中由后端给序、恒追在后。
 *   ② **本文件不自建动效**（🔴 T14b 更正过时标签）：纲领**已由批 6 交付**（`docs/standards/motion.md` +
 *      `ADR-035`）⇒ 原文「不做动效纲领……只有接缝、没有纲领」已不成立；本文件今天仍是**纯接缝消费方**
 *      （零自带 CSS、零行内 `style`、0 条动效声明），动效全来自原语：`Modal` 的进出场 200/160ms ·
 *      `EmptyState` 的入场（`ed-empty-in` 120ms）· `Text` 的墨度过渡。
 *      ⚠️ 本文件在 `motion/responseCoverage.test.ts` 的余量表上只登记了一条：选中行的 hover 由
 *      `onMouseEnter` 改 JS 状态（`Text` 的 `tone` 跟着换）⇒ 元素级回执打不到，归批 7/8 的入口收口。
 *   ③ 不认识任何 `focus*` 深链参数（入口收敛在 `App.tsx`）。
 *   ④ **零行内 `style`**（ADR-033 §4）· **零自带 CSS**。四类"原语表达不了"的排版**登记为缺口**
 *      （交 T18，待批 5/6 的排版档）：输入框的排版（内边距 / 下边框 / 字号）· 选中行的**底色与字重**
 *      （现在只有墨度差 `ink-1` vs `ink-2`）· 行间距与 hover 反馈 · 列表滚动区高度（原 `max-height:60vh`）。
 *      面板宽度 560 → `Modal size="m"`（520）也是**可见变化**，与 T7 的档位收敛同批登记。
 *   ⑤ 组合态的 Esc（「只取消候选词」）归原语判据；本文件只保证 **Enter 不误提交**（`isImeComposing`）。
 */
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { EmptyState, isImeComposing, Modal, StatusLine, Text } from "../ui/primitives";
import { ALL_ENTRIES, type PageKey } from "./navRegistry";
import { useKbPaletteSearch } from "./useKbPaletteSearch";
import type { HitJump } from "./kbCommands";

/** 选中一条命令后交给调用方的**动作描述**：调用方持有 `setPage` 与对话面板状态，本组件不碰它们 */
export type PalettePick =
  | { kind: "page"; key: PageKey }
  | { kind: "dock" }
  // ↓ T12 新增两类。① 「结果命令」：携带跳转意图，落到哪个 `focus*` 状态由调用方决定（本组件不碰状态机）
  | { kind: "hit"; jump: HitJump }
  // ② 无载荷的 `focus*` 入口：`createSystemSignal`（建体系向导不需要 ID —— 10 个 focus* 字段里唯一
  //    能由面板独立发起的一条；其余 9 个带 ID 深链的入口收敛方式见 task-12-report.md 的入口映射表）
  | { kind: "create-system" };

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

/** 本地子串过滤（大小写不敏感）。空查询 = 全量 —— I-1 裁决 B 下「有命中」那一支正是走空查询（不过滤） */
function filterCommands(commands: readonly Command[], query: string): readonly Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter((c) => c.label.toLowerCase().includes(q));
}

/** 装配命令列表：注册表的 9 页 + 面板自带的对话面板与建体系入口（T12 的检索结果恒追在这一组之后） */
function buildCommands(onPick: (pick: PalettePick) => void): Command[] {
  const pages: Command[] = ALL_ENTRIES.map((e) => ({
    id: `page:${e.key}`,
    label: e.label,
    hint: "页面",
    run: () => onPick({ kind: "page", key: e.key }),
  }));
  return [
    ...pages,
    { id: "dock", label: "对话面板", hint: "Ctrl+Shift+A", run: () => onPick({ kind: "dock" }) },
    // T12（规格 §6.1 的 `focus*` 入口收敛）：无载荷的深链入口（建体系向导）进面板
    { id: "focus:create-system", label: "新建体系", hint: "体系向导", run: () => onPick({ kind: "create-system" }) },
  ];
}

export function CommandPalette({ open, onClose, onPick }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // `Modal` 的焦点陷阱把焦点给了「首个可聚焦元素」= 头部关闭钮（`Modal.test.tsx:200` 的契约）；
  // 本面板的入口是搜索框 ⇒ 调用点自己把焦点钉过来。父组件的 effect 在 `Modal` 的 effect **之后**跑，
  // 故不会被陷阱覆盖（渲染级判据钉着这条：`shell/commandPalette.modal.test.tsx` 的 ②）。
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 每次打开都重置：否则上一次留下的输入会**静默决定**这一次的首选项（本面板是「每次从零开始」的入口）
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
  }, [open]);

  // 命令表随渲染重建（11 条，成本可忽略）：`run` 闭包因此恒为最新，不需要为依赖稳定性再包一层 memo
  // T12：**检索结果**（`kb_search` 数据源）——取样（180ms 防抖 + seq 只认最后一次 + 失败降级）
  // 整段在 `useKbPaletteSearch` 里。合并语义见文件头边界①：只有零命中那一支才把查询词传进过滤。
  const { commands: hits, degraded, skipped } = useKbPaletteSearch(open, query, (jump) => onPick({ kind: "hit", jump }));
  const list = [...filterCommands(buildCommands(onPick), hits.length ? "" : query), ...hits];
  const activeAt = list.length === 0 ? -1 : Math.min(active, list.length - 1);
  const openHits = list.length === 0 && skipped === 0;

  const activate = (cmd: Command): void => {
    cmd.run();
    onClose();
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    // IME 守卫：中文输入法**组合期**的 Enter 是「确认候选词」，不是「提交」（规格 §5.2 第三条）。
    // 批 4 T9 起走原语层的 `isImeComposing()`（`isComposing` ∨ `keyCode === 229`，语义同前、覆盖面更宽）。
    if (isImeComposing(event)) return;
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
    <Modal open={open} onClose={onClose} title="命令面板" size="m" testId="command-palette">
      <input
        ref={inputRef}
        data-testid="command-palette-input"
        type="text"
        value={query}
        aria-label="命令搜索"
        placeholder="输入页面名…"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0); // 输入变化即回到首项：否则旧的选中位会指向过滤后的另一条命令
        }}
        onKeyDown={onInputKeyDown}
      />
      {/* T12：检索失败时如实降级（只剩页面命令可走）——不谎报成「没有匹配的命令」 */}
      {degraded ? (
        <StatusLine kind="warn" testId="command-palette-degraded">
          学习库检索不可用——只显示页面命令
        </StatusLine>
      ) : null}
      {/* I-2：命中里**没有跳转目标**的条数要如实说出来 —— 旧版把它们静默丢掉后显示
          「没有匹配的命令」是**假陈述**（学习库确实有匹配，只是没有可打开的入口） */}
      {skipped > 0 ? (
        <StatusLine kind="info" testId="command-palette-skipped">
          {openHits ? `没有可打开的命令（另有 ${skipped} 条无定位信息的命中）` : `另有 ${skipped} 条无定位信息的命中（无跳转目标）`}
        </StatusLine>
      ) : null}
      {/* `role="listbox"` 落在 `div` 上（原 `ul`）：列表项的**选中/可点**语义全由 `role="option"` 承载，
          换元素只为不引入浏览器默认项目符号 —— 本文件不许自带 CSS，`list-style` 无处安放（登记为缺口）。 */}
      <div role="listbox" aria-label="命令列表" data-testid="command-palette-list">
        {list.map((cmd, i) => (
          <div
            key={cmd.id}
            role="option"
            aria-selected={i === activeAt}
            data-testid={`command-${cmd.id}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => activate(cmd)}
          >
            <Text size={4} tone={i === activeAt ? "ink-1" : "ink-2"}>
              {cmd.label}
            </Text>
            {cmd.hint ? (
              <Text size={5} tone="ink-3">
                {cmd.hint}
              </Text>
            ) : null}
          </div>
        ))}
      </div>
      {openHits ? <EmptyState title="没有匹配的命令" compact align="start" testId="command-palette-empty" /> : null}
    </Modal>
  );
}
