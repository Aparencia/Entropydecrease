/**
 * SessionNotePreview — 会话视图槽 `SessionViewSlot` → `NotePreviewView` props 的**适配器**（批 5 · T6b）。
 *
 * @ai-context 为什么需要它（这不是第二套取数，是本批唯一的**接线垫片**）：`NotePreviewView` 是
 *   **容器**形态 —— 它的 props 是 `{ sessionId, autoTaskId, onTaskStarted }`，取数（`invoke
 *   ("preview_session_note")`）、状态、AI 复核全在它自己体内；而注册表 `ViewSpec<SessionViewSlot>`
 *   的 `P` 是**纯注入槽**（`views/**` 零 `invoke` 是本批唯一可机器验证的架构约束，C14②）。
 *   二者**不同形** ⇒ 把 `load` 直接指向 `import("../components/NotePreviewView")` 会得到
 *   `TS2322: Type '() => Promise<typeof import("…/NotePreviewView")>' is not assignable to type
 *   '() => Promise<{ default: ComponentType<SessionViewSlot> }>'`，**且不许用 `as` 强转** ——
 *   强转后运行期 `sessionId === undefined`（`NotePreviewView` 读不到 `slot.detail.session.id`），
 *   预览会静默查一个不存在的会话。故本件只做**字段搬运**，是那条 `TS2322` 的正面修法。
 * @ai-context 映射口径**逐字照抄既有宿主** `components/session-detail/SessionViewHost.tsx:108-112`
 *   （今天 `preview` 视图的真实接线）：`sessionId={sessionId}` / `autoTaskId={autoRefineTaskId}` /
 *   `onTaskStarted={onRefineTaskStarted}`。两项来源不同名：槽里叫 `detail.session.id` 与
 *   `autoRefineTaskId` / `onRefineTaskStarted` ⇒ 本文件是**唯一**知道这层改名的地方。
 * @ai-context 副作用：**无**。零 `invoke`、零 `@tauri-apps` import、零 `useState`/`useEffect`、
 *   零 I/O、零取数 —— 取的活全在 `NotePreviewView` 里（本件是垫片，不是第二份实现）。
 *   零 DOM 包裹：直接返回 `<NotePreviewView/>`，不制造「多一层 div」的排版权威（ADR-033 §4）。
 * @ai-context 零棘轮面的原因：本件不渲染任何自带样式/文本/面/按钮元素 ⇒ 五类棘轮域内 0 命中
 *   （`surfaceRatchet` 尤其：本件无边框/底色需求，故不引入 `Surface` 调用点）。
 * 边界：槽里其余 7 个字段（`imageUrl` / `ocrBlocksByScreen` / `selectingScreen` / `onSelectScreen` /
 *   `panelToast` / `onShowToast` / `onClearToast`）**本视图不消费** —— 它们是三轨/印样/卡片流的注入面，
 *   `NotePreviewView` 今天的 props 面里没有对应槽（要接就得先扩它的 props = 改既有组件的契约面，
 *   不在本任务权限内）。**不用 `void` 假装用过**：TypeScript 的结构化参数不要求取用全部字段。
 */
import type { SessionViewSlot } from "../registry";
import NotePreviewView from "../../components/NotePreviewView";

export default function SessionNotePreview({ detail, autoRefineTaskId, onRefineTaskStarted }: SessionViewSlot) {
  return (
    <NotePreviewView
      sessionId={detail.session.id}
      autoTaskId={autoRefineTaskId}
      onTaskStarted={onRefineTaskStarted}
    />
  );
}
