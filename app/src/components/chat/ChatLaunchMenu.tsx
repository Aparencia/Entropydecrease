/**
 * ChatLaunchMenu — 对话页工具条上的「发起任务」锚定菜单（v0.16.1 任务对话化）。
 *
 * @ai-context: Why 独立成件：它原先是 `pages/ChatPage.tsx` 内联的一段 JSX（含自己的
 *              开合状态、透明点击层与锚定面板）。`ChatPage.tsx` 当时 **599/600 行**
 *              （本批的贴边文件之一），按控制方裁决 **B7「先拆件、再迁移」** 必须先把它
 *              摘出来，才允许动 `ChatPage.tsx` 的其它部分 —— 否则「拆件」与「迁移」会
 *              混在一个提交里，行为等价性无法用测试证明。
 *              本件是**纯展示 + 一个开合状态**：不读 store、不发 IPC、不写磁盘，
 *              唯一的对外语义是「用户选了 refine 还是 enrich」（`onLaunch`）。
 * @ai-context: 语义边界（与 `Modal` 的分工，ADR-033 §7）：它是**锚定菜单**而不是对话框 ——
 *              没有对话框语义（无标题、无焦点陷阱、无 ESC 栈），所以按 B1 只把层级落
 *              `zIndex("popover")`(200)，**不迁 `<Modal>`**。
 * @ai-context: 层级：透明点击层与锚定面板**同档 200**（原为两个裸数字 30 / 31）。
 *              面板「在点击层之上」由 **DOM 序**保证（同档位下后者胜），不靠更大的数字 ——
 *              这正是六档标尺要消灭的「17 个各不相同的值」。行内 `style` 只承载**布局与层级**
 *              （ADR-033 §4 允许），本件没有可被覆盖的原语语义（不是 `Button`/`Surface`/`Text`）。
 */
import { useState } from "react";
import { zIndex } from "../../ui/zIndex";

export interface ChatLaunchMenuProps {
  /** 选中一个任务种类（父层据此打开发起对话框并清空目标预选） */
  onLaunch: (kind: "refine" | "enrich") => void;
}

/**
 * 渲染发起任务的锚菜单。
 *
 * 开合状态**留在本件内部**（父层不需要知道菜单开没开）：`ChatPage` 原来的
 * `launchMenuOpen` 只在「选中/点空白」两处被置 false，且这两处的另一动作分别由本回调和
 * 点击层自身完成 ⇒ 状态上行只会多一份跨层耦合，不改变任何可观察行为。
 */
export default function ChatLaunchMenu({ onLaunch }: ChatLaunchMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        data-testid="task-launch-open"
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151" }}
        title="在对话中发起 AI 任务（也支持 '/refine' '/enrich'）"
      >
        ✨ 发起任务 ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: zIndex("popover"), background: "transparent" }} />
          <div
            data-testid="task-launch-menu"
            data-app-menu=""
            style={{ position: "absolute", top: "100%", left: 0, zIndex: zIndex("popover"), background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 4, boxShadow: "var(--ed-shadow-1)", minWidth: 180 }}
          >
            <button
              type="button"
              data-testid="task-launch-refine"
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12.5, cursor: "pointer", color: "#374151" }}
              onClick={() => { setOpen(false); onLaunch("refine"); }}
            >
              ✨ AI 精修（会话 → 精修成笔记）
            </button>
            <button
              type="button"
              data-testid="task-launch-enrich"
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12.5, cursor: "pointer", color: "#374151" }}
              onClick={() => { setOpen(false); onLaunch("enrich"); }}
            >
              📚 AI 知识补充（笔记 → 补外部知识）
            </button>
          </div>
        </>
      )}
    </div>
  );
}
