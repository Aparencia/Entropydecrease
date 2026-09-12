/**
 * @ai-context L1 原语：**危险确认**（批 0-D Task 8；规格 §5.3「删除语义两档分级」的高危档）。
 *
 * Why：现状 23 处确认调用（`window.confirm` 8 行/6 文件 + 裸 `confirm(` 15 行/12 文件，recon §3.2/§10）
 * **全是命令式** —— 在 WebView2 里 `window.confirm` 可能静默返回 false（规格 §5.1），且没有 DOM 容器
 * 能挂出场动效；而规格 §5.3 对高危不可逆动作（组删除 / 体系级联 / 采集弃置 / 毕业结算）要求
 * **框内必须列明级联影响与保留项**（范例：「将删除 1 个组 · 3 条排序记录 · 笔记 7 篇保留」）。
 *
 * ★ 危险语义用色（控制方 2026-09-11 裁决③ · 规格 §4.1）：
 *   `--ed-stamp` 是**全站唯一非中性色**，规格原文写明「绝不用于按钮」⇒ 本原语的确认按钮
 *   **保持中性**（`variant="secondary"`，与取消按钮同档，**没有 danger 变体**），危险信号由
 *   **印章标记**（`.ed-confirm-seal`：该 token 只作文字色与描边 + `aria-hidden` 装饰）与
 *   **级联影响清单**承载；**不新增任何 token**。`ConfirmDialog.css` 里它绝不出现在任何
 *   `background*` 声明里 —— 该不变量由本原语的测试与 Task 14 Step 1 第 4 条的批次守卫同向守住。
 *
 * 副作用：本文件**没有自有副作用** —— 容器 / 层叠 / 进出场 / 焦点陷阱 / 键盘退出全部由 `Modal`
 * 承担（不建 Portal、不读层级标尺、不挂文档级键盘监听）；唯一额外的一次副作用见边界①。
 *
 * 边界：
 * ① **初始焦点重定向**（一次性的聚焦写，**不是第二套焦点陷阱**）：`Modal` 的陷阱把焦点给面板内
 *    **首个**可聚焦元素＝它头部的「关闭」钮，而规格 §8.6.1 第 4 条要求「危险动作不能因一个回车就
 *    发生」⇒ 本组件在打开后把焦点从「关闭」挪到**「取消」**。Tab 循环与关闭后的焦点归还仍全在
 *    `useFocusTrap` 里；本组件只在「面板已挂载**且**焦点仍在本面板内」时挪（调用点若已自己接管
 *    焦点就不抢），每个打开会话只挪一次。面板判据用 `Modal` 的面板类名 —— 本原语已消费它的
 *    `footer` 槽，属同一份 DOM 契约；若那个类名变了，本原语的焦点用例会红，不会静默失效。
 * ② `busy` 只透传给 `Button` 的 `busy`（`aria-disabled` + 视觉降级，**保留焦点与 Tab 序**）：两个
 *    按钮都不可点，但**本原语不做去抖** —— 「已经点过一次」由调用点的 `busy` 表达；原语若自己吞掉
 *    第二次点击，父级在动作失败后想重试就再没有入口（连点用例把这条契约钉住）。
 * ③ **退出路径永不产生确认**：ESC / 点遮罩一律走 `onCancel`（`Modal` 的关闭意图）——「破坏性动作
 *    不得因误点遮罩而被确认」；本原语不区分退出路径，也不因 `busy` 改变退出语义（确定行为）。
 * ④ 不迁移任何现有 `confirm` 调用点（那 23 处是批 4 的迁移面；本批只交付被迁移的靶子）。
 * ⑤ **退场相位（`open=false` 而面板仍在淡出的 160ms）内整个对话框失活**（评审 I-1 的修复）：
 *    点击是**即时**的，而退场是**异步**的 —— 那 160ms 里面板还挂在屏上，用户「手一抖」的第二次点击
 *    会真的落到按钮上（批 4 迁移后正是删除 / 级联删除的**误触面**）。两条落点：
 *    ① 两颗按钮 `busy={busy || !open}`（`Button` 的 `busy` 已实测拦下 click，且不设原生 `disabled`
 *       ⇒ 焦点与 Tab 序在退场期保持稳定，不会因卸载前的属性抖动打断读屏）；
 *    ② `Modal` 的关闭意图（遮罩 / 头部「关闭」钮）经 `handleCloseIntent` **按 `open` 门控** ——
 *       这条 `busy` 到不了（那是 `Modal` 自己的处理器），故在本文件补一道守卫；ESC 无需处理
 *       （`Modal` 的 ESC 监听本就以 `open` 为门控，实测退场期不响应）。
 *    ⚠️ **系统级修法建议（登记给 T7 的 `Modal`，本任务不改它的文件）**：在
 *    `Modal.css` 给 `[data-phase="exit"]` 的面板与遮罩加 `pointer-events: none` —— 那能一次性
 *    覆盖**所有** Modal 消费者（含批 4 迁移的 28 个手写弹层），而本原语这两行只是**文件内缓解**。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import type { ModalTier } from "./Modal";
import { Text } from "./Text";
import "./ConfirmDialog.css";

/**
 * 印章标记的字符：高危不可逆动作在中文语境里读作「慎」。
 * 它是**装饰**（`aria-hidden`）—— 危险语义由 `title` / `message` / `impacts` 的**文字**承载，
 * 印章与颜色都不是唯一信号（同 §4.3 第 1 条对「过渡态不得承载唯一关键信息」的口径）。
 */
const SEAL_TEXT = "慎";

/** 弹层尺寸取 `s`（380）：确认类弹层按规格 §5.2 走小档 */
const CONFIRM_SIZE = "s";

export interface ConfirmImpact {
  /** 一行级联影响或保留项的**用户可见文案**（如「将删除 1 个组」「笔记 7 篇保留」） */
  readonly text: string;
  /** `true` = **保留项**：用正向语气渲染（`ed-confirm-keep` 类 + 正向前缀），与级联删除项一眼可分 */
  readonly keep?: boolean;
}

export interface ConfirmDialogProps {
  /** 受控开合；`false` 后仍会渲染到退场结束（出场 160ms < 进场 200ms，规格 §8.4） */
  open: boolean;
  /** 危险动作的标题（同时是弹层的无障碍名），如「删除「高数」？」 */
  title: string;
  /** 正文说明（可选）；**级联影响清单请走 `impacts`**（结构化才能区分保留项） */
  message?: ReactNode;
  /** 级联影响与保留项清单（规格 §5.3 的硬要求：高危不可逆动作**必须列明**） */
  impacts?: readonly ConfirmImpact[];
  /** 确认按钮文案，默认「确认」 */
  confirmLabel?: string;
  /** 取消按钮文案，默认「取消」 */
  cancelLabel?: string;
  /** 动作进行中：两个按钮都不可点（`aria-disabled` + 降级），但不卸载、不改变退出语义 */
  busy?: boolean;
  /**
   * 层级，透传给 `Modal` 的 `tier`（默认 `"modal"` = 300）。
   * **何时该传 `modalNested`（400）**：本确认框**被另一个弹层承载**时（如
   * `InterviewDialog → GoalPlanApprovalDialog` 那类「弹层内再弹」）—— 不传就与外层同档 300，
   * 叠放顺序退化成 DOM 序、外层遮罩会压住它。ADR-033 后果④的观察项，批 4 T2 结清。
   */
  tier?: ModalTier;
  /** 用户确认（危险动作；调用点应同步置 `busy` 以挡住重复触发） */
  onConfirm: () => void;
  /** 用户取消 / ESC / 点遮罩 —— **所有退出路径都归到这里** */
  onCancel: () => void;
  /** 测试锚点：面板 `testId` · 遮罩 `${testId}-overlay` · 取消 `${testId}-cancel` · 确认 `${testId}-confirm` */
  testId?: string;
}

/**
 * 渲染一个危险确认框。未挂载时由 `Modal` 返回 `null`。
 *
 * 返回 `ReactElement | null`（= 契约里的 `JSX.Element | null`）：React 19 把全局 `JSX` 命名空间
 * 收进 `React.JSX`，直接写 `JSX.Element` 在 `@types/react@19` 下取不到（同 `Modal.tsx` 先例）。
 */
export function ConfirmDialog({
  open,
  title,
  message,
  impacts,
  confirmLabel = "确认",
  cancelLabel = "取消",
  busy = false,
  tier = "modal",
  onConfirm,
  onCancel,
  testId,
}: ConfirmDialogProps): ReactElement | null {
  // 取消按钮的插槽：`Button` 不透传 ref（T5 的契约，本任务不得改它）⇒ 用一层**裸 span** 定位
  // 「footer 里的取消钮」。裸 span 不带类名，故不新增任何 `.ed-*` 类，也不改变 footer 的 flex 布局。
  const [cancelSlot, setCancelSlot] = useState<HTMLSpanElement | null>(null);
  /** 每个打开会话只重定向一次（见 @ai-context 边界①）；关闭时复位 */
  const redirectedRef = useRef(false);

  const attachCancelSlot = useCallback((node: HTMLSpanElement | null): void => {
    setCancelSlot(node);
  }, []);

  /**
   * 退场相位内按钮**必须失活**（见 @ai-context 边界⑤）：复用 `Button` 的 `busy`（它拦 click、不设原生
   * `disabled`）而不是 `disabled` —— 退场只有 160ms，`disabled` 会把焦点踢出 Tab 序再被卸载，读屏会读成
   * 「按钮被禁用」这种无意义的状态抖动。
   */
  const buttonsInert = busy || !open;

  /** `Modal` 的关闭意图守卫（遮罩 / 头部「关闭」钮）：`open=false` 的那一瞬起就不再接受退出意图 */
  const handleCloseIntent = useCallback((): void => {
    if (!open) return;
    onCancel();
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) {
      redirectedRef.current = false; // 关闭即复位：下一次打开重新定向
      return;
    }
    if (cancelSlot === null || redirectedRef.current) return;
    const panel = cancelSlot.closest(".ed-modal");
    const active = document.activeElement;
    // 焦点已在别处（调用点自己接管了焦点）⇒ 不抢；见 @ai-context 边界①
    if (panel === null || (active !== null && !panel.contains(active))) return;
    redirectedRef.current = true;
    cancelSlot.querySelector("button")?.focus();
  }, [open, cancelSlot]);

  const impactList = impacts ?? [];
  const footer = (
    <>
      <span ref={attachCancelSlot}>
        <Button variant="secondary" onClick={onCancel} busy={buttonsInert} testId={testId ? `${testId}-cancel` : undefined}>
          {cancelLabel}
        </Button>
      </span>
      <Button variant="secondary" onClick={onConfirm} busy={buttonsInert} testId={testId ? `${testId}-confirm` : undefined}>
        {confirmLabel}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={handleCloseIntent}
      title={title}
      size={CONFIRM_SIZE}
      tier={tier}
      testId={testId}
      footer={footer}
    >
      <div className="ed-confirm">
        <span className="ed-confirm-seal" aria-hidden="true">
          {SEAL_TEXT}
        </span>
        {message !== undefined ? <Text size={3}>{message}</Text> : null}
        {impactList.length > 0 ? (
          <ul className="ed-confirm-impacts">
            {impactList.map((impact) => (
              <li
                key={impact.text}
                className={impact.keep ? "ed-confirm-keep" : undefined}
                data-keep={impact.keep ? "true" : undefined}
              >
                <Text size={4} tone={impact.keep ? "ok" : "ink-2"}>
                  {impact.text}
                </Text>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
}
