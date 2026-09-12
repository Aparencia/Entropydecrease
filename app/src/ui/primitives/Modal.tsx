/**
 * @ai-context L1 原语：**弹层唯一实现**（批 0-D Task 7；规格 §5.2）。本批分量最重的一类 ——
 * 它把三条全仓 **0 命中**的契约从 0 变成 1：`createPortal` · `role="dialog"` · `aria-modal`
 * （改造前实测 0/0/0，recon §10）；现状是 28 个文件各自手写 `position:fixed; inset:0` 的遮罩、
 * 61 行/22 文件的关闭调用点、11 个文件的早退式卸载（`if (!x) return null`，**没有出场路径**）。
 *
 * 副作用：`import "./Modal.css"`；挂载时 `createPortal` 到 `document.body`；在 `document` 上挂
 * 一个 ESC 监听（见 `useEscapeToClose`）；`useFocusTrap` 会搬移焦点；`usePresence` 会排
 * 至多一个计时器。组件不读 store、不发请求、不写磁盘。
 *
 * 边界（六条，逐条有测试或注释说明）：
 * ① **不早退式卸载**：`open=false` 后仍渲染到退场结束（`usePresence` 给时机，`[data-phase]`
 *    给样子）—— 这正是现状 11 个文件的病灶。
 * ② **遮罩点击走 `mousedown` + `target === currentTarget`**：`click` 会误伤"面板内按下、遮罩上松开"
 *    （拖选文字时手滑出面板就关掉了）；仓内先例 `BrowserChrome.tsx:135` 的 `stopPropagation` 防误关同理。
 * ③ **ESC 由"最内层"唯一响应**：同一 `document` 上多个 Modal 的监听器都会跑到，靠模块级
 *    `openModalStack` 判栈顶才确定。**深度取自 React 树**（`ModalDepthContext`）而不是 DOM 序或
 *    入栈序：React 的 effect 是**自底向上**跑的（子 Modal 先入栈 ⇒ 入栈序会把外层当栈顶），而
 *    portal 在 `document.body` 里的插入序**会随挂载时机反转**（同一次提交里内层反而更靠前 ——
 *    实测 `BODY_ORDER ["inner","outer"]`，晚挂载的内层才排在后面）⇒ 只有树深度稳定等于「最内层」。
 * ④ **ESC 的消费是排他的，但只拦得住"冒泡类"**：最内层 `stopPropagation()` 挂在 `document`
 *    **冒泡相**上（仓内退出链是"最上层优先、一次只响应一层"，`SessionListPanel.tsx:108-120`）。
 *    **拦得住**：`window` 上**冒泡相**的 15 处手写 ESC 监听（document 冒泡先于 window 冒泡）。
 *    **拦不住（批 4 迁移时必须一并处理）**：
 *    ① `SelectionActionMenu.tsx:73-78` 的 `window` **capture** 相 ESC 监听 —— capture 从 window
 *       开始，跑在 `document` 冒泡之前；
 *    ② **4 处元素级 React `onKeyDown`**：`SessionDetailHeader.tsx:106` · `GroupSidebarRow.tsx:115` ·
 *       `LinkEntityPicker.tsx:101` · `SessionListRow.tsx:188` —— React 19 把合成事件挂在根容器
 *       （在 document 之内），故它们也早于本监听。
 *    ⚠️ 口径更正：仓内 `addEventListener("keydown")` 共 19 个文件，其中 **16 个处理 Escape**
 *    （15 冒泡 + 1 捕获），另 3 个（`App.tsx:203` · `useClassroomShortcuts.ts:37` ·
 *    `useClassroomFloat.ts:73`）**不处理 Escape** —— 不要把它写成"19 处 ESC"。
 *    `closeOnEsc=false` 时**仍然消费**（弹层是最上层，ESC 不该穿透到下层），只是不调用 `onClose`。
 * ⑤ **body 滚动锁在 `presence.mounted` 上**（批 4 T2 结清，B6：20 个调用点共用 ⇒ 改原语）：
 *    引用计数 + 原值快照，见 `useBodyScrollLock`；未挂载时**不碰** `document.body` 的样式。
 * ⑥ **不消费 `isImeComposing`**：计划 Task 7 Step 1 明确"本批只建不接"—— 需要 IME 守卫的是
 *    「Enter 提交」，那是调用点的动作（`Modal` 自己不定义提交）。
 * ⑦ **解锁时恢复滚动位置**（批 5 T17 / C10#14；与规格 §7.3 第 2 条「重挂载恢复 `scrollTop`」同族）：
 *    快照在**加锁那一刻**取（归属 = 第一个持锁者），**最后一个持锁者释放时**写回；两条纯函数
 *    `saveScroll` / `restoreScroll` 导出给测试。⚠️ **jsdom 不做布局** ⇒ 只到"属性级可观测"（见未验证）。
 */
import { createContext, useContext, useEffect, useId, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { zIndex } from "../zIndex";
import { Button } from "./Button";
import { Text } from "./Text";
import { useFocusTrap } from "./useFocusTrap";
import { usePresence } from "./usePresence";
import "./Modal.css";

/** 尺寸三档（规格 §5.2：S 380 确认类 / M 520 表单类 / L 720 向导与工作台） */
export type ModalSize = "s" | "m" | "l";

/** 层级两档：`modal`（常规）/ `modalNested`（弹层内再弹）—— 值一律从 `zIndex()` 标尺取 */
export type ModalTier = "modal" | "modalNested";

export interface ModalProps {
  /** 受控开合；`false` 后仍会渲染到退场结束（出场 160ms） */
  open: boolean;
  /** 关闭意图（ESC / 点遮罩 / 关闭按钮）—— 由调用点决定是否真的置 `open=false` */
  onClose: () => void;
  /** 标题文本，同时作为 `aria-labelledby` 的可读名（弹层必须有无障碍名） */
  title: string;
  children: ReactNode;
  /** 底部行动区（通常是主/次 `Button`）；不传则不渲染该行 */
  footer?: ReactNode;
  /** 尺寸，默认 `m`（520） */
  size?: ModalSize;
  /** 层级，默认 `modal`（300）；弹层内再弹用 `modalNested`（400） */
  tier?: ModalTier;
  /** 点遮罩关闭，默认 `true` */
  closeOnOverlay?: boolean;
  /** ESC 关闭，默认 `true`（脏表单的"先内联确认"由调用点在 `onClose` 里实现） */
  closeOnEsc?: boolean;
  /** 测试锚点：面板 `testId` · 遮罩 `${testId}-overlay` · 关闭钮 `${testId}-close` */
  testId?: string;
}

/** 出场名义时长 = `motion.css` 的 `--ed-dur-overlay-out`；`usePresence` 的兜底窗口 = 它 + 80ms */
const EXIT_MS = 160;

/** 弹层的 React 树深度（见 @ai-context 边界③）：根 = 0，弹层内再弹 = 1 … */
const ModalDepthContext = createContext(0);

/** 计划里的 `openModalStack`：已打开的弹层（按 effect 顺序入栈，深度用于定栈顶） */
const openModalStack: { depth: number }[] = [];

/** 是否是最内层弹层（深度最大者；同深度取**更晚入栈**的那个 —— 同一提交里的兄弟弹层） */
function isInnermost(entry: { depth: number }): boolean {
  let top = entry;
  for (const other of openModalStack) if (other.depth >= top.depth) top = other;
  return top === entry;
}

/** 当前持锁的弹层（`Set` 即引用计数：关内层时集合非空 ⇒ 不解锁） */
const scrollLockOwners = new Set<object>();
/** 首个持锁者记下的**原值快照**（`null` = 当前没持锁）。恢复成 `""` 会抹掉宿主页设过的 overflow */
let savedBodyOverflow: string | null = null;
/** 首个持锁者记下的**滚动位置快照**（`null` = 当前没持锁）；与 `savedBodyOverflow` 同源同时刻取 */
let savedScrollTop: number | null = null;

/**
 * 视口滚动宿主：`scrollingElement` 是规范里"能滚视口的那个元素"（标准模式 `html` / quirks `body`）——
 *   写死任一个都会在另一半场景里写到不该写的元素上（症状 = 解锁后跳回 0，比"不恢复"更难查）。
 *   兜底 `body` 是必需的：jsdom 30 **没有** `scrollingElement`（实测 `undefined`）⇒ 没有它，
 *   本能力的接线在测试环境里不可观测。
 */
function scrollHostOf(): { scrollTop: number } | null {
  if (typeof document === "undefined") return null;
  return document.scrollingElement ?? document.body ?? null;
}

/** 记录滚动位置（**纯函数**：只读宿主、原样返回快照）——导出给测试（C10#14 的判据形态） */
export function saveScroll(host: { scrollTop: number }): number {
  return host.scrollTop;
}

/** 恢复滚动位置（**纯函数**：只写宿主；不钳制、不分支 ⇒ 契约是全函数、无隐藏语义）——导出给测试 */
export function restoreScroll(host: { scrollTop: number }, saved: number): void {
  host.scrollTop = saved;
}

/**
 * body 滚动锁（批 4 T2；B6 缺口 A：20 个弹层共用 ⇒ 锁在原语里，调用点零改动）。
 *
 * Why 引用计数：弹层内再弹（`tier="modalNested"` 的 `ConfirmDialog`）时，**内层关闭不能解锁** ——
 *   外层还在屏上，背景一旦能滚就会跳一下。
 * Why 原值快照：恢复成 `""` 会把别人（或宿主页）设过的 `overflow` 一并抹掉 —— 那是"看不见的破坏"。
 * Why 门控是 `presence.mounted` 而**不是** `open`：`open=false` 后仍有 160ms 退场，那段时间面板还在屏上，
 *   提前解锁等于"弹层还在、背景却能滚"（与 §5.2 第 2 条「退场相位必须禁指针事件」同源）。
 * Why 单个 effect：加锁与解锁都在同一个 effect 的 body/cleanup 里 —— 拆成两个的话，退场中
 *   `open` 反向回到 `true` 时 cleanup 会先解锁、再（因依赖未变而）不加回来，锁就永久丢了。
 * Why 滚动快照与 `overflow` **同源同时刻**（批 5 T17 / C10#14）：两者都是"加锁前的宿主状态"，归属
 *   必须一致 —— 放在别的 effect 里，嵌套交接时两个快照会来自不同时刻（写回一个从未存在过的组合）。
 */
function useBodyScrollLock(locked: boolean): void {
  const ownerRef = useRef<object>({});
  useEffect(() => {
    // SSR / 预渲染：`document` 不在；effects 在服务端本来也不跑，这行只为类型与语义收口
    if (typeof document === "undefined") return;
    const owner = ownerRef.current;
    if (!locked) return;
    if (scrollLockOwners.size === 0) {
      savedBodyOverflow = document.body.style.overflow;
      const host = scrollHostOf();
      savedScrollTop = host ? saveScroll(host) : null; // 加锁时记录（快照归属 = 第一个持锁者）
    }
    scrollLockOwners.add(owner);
    document.body.style.overflow = "hidden";
    return () => {
      scrollLockOwners.delete(owner);
      if (scrollLockOwners.size > 0) return;
      document.body.style.overflow = savedBodyOverflow ?? "";
      savedBodyOverflow = null;
      const host = scrollHostOf();
      if (host && savedScrollTop !== null) restoreScroll(host, savedScrollTop); // 解锁时恢复（写回快照）
      savedScrollTop = null;
    };
  }, [locked]);
}

/**
 * ESC 接管（模块级栈 + `document` 冒泡监听）。
 * `closeOnEsc` / `onClose` 走 ref 镜像：若把它们放进 effect 依赖，父层每次重渲染都会"出栈再入栈"，
 * 栈序会被打乱（内层还开着时外层重渲染 ⇒ 外层跑到栈顶）。
 */
function useEscapeToClose(open: boolean, depth: number, closeOnEsc: boolean, onClose: () => void): void {
  const configRef = useRef({ closeOnEsc, onClose });
  useEffect(() => {
    configRef.current = { closeOnEsc, onClose };
  }, [closeOnEsc, onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const entry = { depth };
    openModalStack.push(entry);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.repeat) return; // 长按 ESC 不得连关多层
      if (!isInnermost(entry)) return;
      event.stopPropagation(); // 见 @ai-context 边界④：只许最上层消费这一次 ESC
      if (configRef.current.closeOnEsc) configRef.current.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const at = openModalStack.indexOf(entry);
      if (at !== -1) openModalStack.splice(at, 1); // 按身份出栈：内层先关也不会挤掉外层
    };
  }, [open, depth]);
}

/** 渲染一个弹层。未挂载时返回 `null`（不渲染任何 portal 节点） */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "m",
  tier = "modal",
  closeOnOverlay = true,
  closeOnEsc = true,
  testId,
}: ModalProps): ReactElement | null {
  const depth = useContext(ModalDepthContext);
  const presence = usePresence(open, { exitMs: EXIT_MS });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEscapeToClose(open, depth, closeOnEsc, onClose);
  useFocusTrap(open && presence.mounted, panelRef);
  useBodyScrollLock(presence.mounted);

  if (!presence.mounted) return null;
  // SSR / 预渲染：`createPortal` 需要真实容器（本仓无 SSR，但预渲染下一行都不能崩）
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ed-modal-overlay"
      data-phase={presence.phase}
      data-testid={testId ? `${testId}-overlay` : undefined}
      style={{ zIndex: zIndex(tier) }}
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`ed-modal ed-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-phase={presence.phase}
        data-testid={testId}
        ref={panelRef}
        tabIndex={-1}
        onTransitionEnd={presence.onTransitionEnd}
      >
        <div className="ed-modal-head">
          {/* 计划写的是 `<Text as="h2" id={titleId}>`，但 T3 已落地的 `TextProps` 没有 `id`（本任务
              不得改 `Text.tsx`）⇒ 用一层**无类名**的 div 承载 id：不新增 `.ed-*` 类，也不动 Text 契约 */}
          <div id={titleId}>
            <Text as="h2" size={2}>
              {title}
            </Text>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} testId={testId ? `${testId}-close` : undefined}>
            关闭
          </Button>
        </div>
        <div className="ed-modal-body">
          <ModalDepthContext.Provider value={depth + 1}>{children}</ModalDepthContext.Provider>
        </div>
        {footer ? <div className="ed-modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
