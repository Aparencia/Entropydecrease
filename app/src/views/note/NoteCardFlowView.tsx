/**
 * NoteCardFlowView —— 笔记的「卡片流」视图（批 5 · T12 · C8/C14）。
 *
 * @ai-context 形态：把 `NoteMarkdown` 的**既有** react-markdown 管线再渲染一次，只是**追加**
 *   一个 remark 插件（`noteCardPlugin`）⇒ 顶层块各自成为一张卡片。**不新写渲染器、不新写 CSS**：
 *   卡片面走 `ed-surface` 类族（`noteCardModel.CARD_SURFACE_CLASSES`），与 `Surface` 原语同源。
 * @ai-context 数据面（C14② 第一条判据）：**全部由容器注入** —— `note` / `onTaskToggle` /
 *   `onOpenSession` / `onImageOpen` 即 `NoteViewSlot` 的全部字段；本组件**零 `@tauri-apps` import、
 *   零 `invoke`**（N7 的机器判据）。继承自 `NoteMarkdown` → `NoteImage` 的本地图片解析
 *   （`invoke("resolve_note_image")`）是**既有行为、本任务零改动**，N7 用阳性对照如实披露。
 * @ai-context `searchQuery=""`：卡片流不做阅读态搜索高亮（高亮是原文视图的语义）；空串即「不高亮」，
 *   与 `NoteMarkdown` 对 `searchQuery` 的既有约定一致（`utils/...` 侧无副作用分支）。
 * 副作用：只挂 React 树（读 `note.content` 渲染）；不写盘、不发请求、不读 store。
 * 边界：`NoteViewSlot` 的 `onOpenSession` 可选（`session_id` 为空的手动笔记没有跳转目标），
 *   原样透传给 `NoteMarkdown`（它自己按 `note.session_id` 门控）。
 */
import type { NoteViewSlot } from "../registry";
import NoteMarkdown from "../../components/NoteMarkdown";
import { noteCardPlugin } from "./noteCardModel";

export default function NoteCardFlowView({ note, onTaskToggle, onOpenSession, onImageOpen }: NoteViewSlot) {
  return (
    <div
      data-testid="note-card-flow"
      // 只做布局（ADR-033 §4：`style` 供布局用；底色/边框/圆角一律走类）
      style={{ display: "flex", flexDirection: "column", gap: "var(--ed-space-8,8px)" }}
    >
      <NoteMarkdown
        note={note}
        searchQuery=""
        onTaskToggle={onTaskToggle}
        onOpenSession={onOpenSession}
        onImageOpen={onImageOpen}
        remarkPluginsExtra={[noteCardPlugin]}
      />
    </div>
  );
}
