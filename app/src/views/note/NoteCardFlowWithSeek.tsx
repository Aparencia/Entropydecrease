/**
 * NoteCardFlowWithSeek — 卡片流视图的**带 seek 包装**（批 7 T17 · C10.3 的「第三缺口」）。
 *
 * @ai-context 为什么需要包装件：`[[ts:ms]]` 回链的毫秒载体 `onOpenSessionAt` **不是**
 *   `NoteViewSlot` 的成员，而批 6 已裁「不得给 `NoteViewSlot` 加可选槽」（C10.3 逐字：控制方
 *   **不覆盖**该裁决）；同时 `views/architecture.slots.test.ts` 的 tsc 探针强制「视图组件的
 *   props ⊆ slot」⇒ 直接给 `NoteCardFlowView` 加 prop 会 `TS2769 no overload matches`。
 *   ⇒ 唯一可行形态 = **容器侧包一层**：本件吃 `NoteViewSlot & { onOpenSessionAt? }`，把**槽整体**
 *   转给 `NoteCardFlowView` —— 后者的 props 面与 `NoteViewSlot` **一字不改**（探针仍绿）。
 * @ai-context 为什么用「捕获阶段委托 + `stopPropagation`」而不是让芯片自己带 ms：卡片流经
 *   `NoteCardFlowView` → `NoteMarkdown`（react-markdown 站点）渲染芯片，而那条链上
 *   `onOpenSessionAt` **拿不到**（同上），芯片只会走它自己的**单参**兜底分支
 *   （`noteMarkdownComponents.tsx` 的 `if (onOpenSessionAt) … else onOpenSession?.(…)`）。
 *   故本件在**捕获阶段**先取 `closest("[data-ts-ms]")`（T17 给 React 侧芯片补的同名 marker，
 *   与串渲染链同一个名字）：命中且本件持有回调 ⇒ `stopPropagation()` 拦掉芯片的单参分支，
 *   改由本件带 ms 跳转（**不产生第二次导航**）；未命中 / 未注入回调 ⇒ 一律放行，芯片走既有
 *   单参路径（**缺省语义与今天逐字相同**）。
 * 边界：① 本件**不是注册表视图**（不进 `viewsFor`、不进 A6 探针的 `VIEWS` 名单）⇒ 站点数、
 *   惰性判据、`FROZEN_VIEW_KEYS` 一律不受影响；② 委托需要一个宿主元素 ⇒ 本件是**唯一新增的
 *   DOM**（一个无样式的纯布局 `div`），该变化已登记为「有意的、已声明的改动」；③ 定位精度受
 *   音频对齐块粒度 **±200 ms** 限制（不得声称毫秒级定位）。
 * 副作用：只挂 React 树；无 `invoke`、无 `@tauri-apps` 边（`views/**` 的整目录硬边界）。
 */
import type { MouseEvent, ReactElement } from "react";
import type { NoteViewSlot } from "../registry";
import NoteCardFlowView from "./NoteCardFlowView";

export default function NoteCardFlowWithSeek({
  onOpenSessionAt,
  ...slot
}: NoteViewSlot & {
  readonly onOpenSessionAt?: (sessionId: number, ms: number) => void;
}): ReactElement {
  const onChipClick = (e: MouseEvent<HTMLDivElement>): void => {
    const chip = (e.target as HTMLElement).closest("[data-ts-ms]");
    const sessionId = slot.note.session_id;
    if (chip === null || !sessionId || !onOpenSessionAt) return;
    e.stopPropagation(); // 拦掉芯片自己的单参跳转（否则会导航两次）
    onOpenSessionAt(sessionId, Number(chip.getAttribute("data-ts-ms")));
  };
  return (
    <div onClickCapture={onChipClick}>
      <NoteCardFlowView {...slot} />
    </div>
  );
}
