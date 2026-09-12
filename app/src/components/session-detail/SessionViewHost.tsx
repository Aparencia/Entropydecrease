/**
 * SessionViewHost — 会话详情的**视图宿主（过渡形态）**：两视图切换组 + `preview` 分支。
 *
 * @ai-context: 自 SessionDetailPanel.tsx 抽出（批 5 T2 Step 2 · C9）。**本任务里只做
 *              「行为等价搬移」**：现有手写 2 按钮切换组（`as const` 数组 + `.map`）与
 *              `preview` 分支逐字搬进来，**不引入注册表**（`ViewSpec` / `React.lazy` /
 *              `Suspense` 是 T6/T10 的事——本件先落位，T10 再把 `preview` 改成注册表驱动
 *              的三轨 + 印样 + 卡片流）。
 * @ai-context: 为什么叫 Host 而不是直接叫 Switch：它是 §7.1「领域 → 视图 → 容器 → 原语」
 *              里**容器**那一格的落点；`children` = 原文视图节点（由面板传入，本任务里
 *              面板直接渲染 `SessionRawView`；T10 起由 `views/registry` 的 `load()` 惰性给）。
 * @ai-context: 包装元素声明：返回 **单个 fragment**（`<>…</>`）——切换器行与视图区在面板里
 *              原本就是两个同级兄弟块，本件**不新增 wrapper**（DOM 顺序契约：…切换器行 →
 *              refineMsg 行 → 视图区 → 两个裁决面板；refineMsg 行留在面板，故不在本件）。
 * @ai-context: 按钮仍走原生 `<button>` + 行内 style（拆分前形态，`btn` 常量随切换组一起
 *              搬进本件）⇒ 按钮形态**逐字未变**；迁移到 `Button` 原语不在本任务范围
 *              （`nativeButton.ratchet` 的守恒由 `nativeButtonBaseline.SPLIT_MOVES` 登记）。
 * @ai-context: **棘轮口径（控制方 2026-09-12 插播裁决 + 回执②「落到档位，不是躲开冻结字面量集合」）**
 *              —— 切换组的**选中/未选中边框与文字色改走 token**：`var(--ed-ok)`（品牌青，与拆分前
 *              `#0d9488`/`#0f766e` 同族）· `var(--ed-border)`（拆分前 `#e5e7eb`）· `var(--ed-bg-surface)`
 *              （拆分前 `#fff`）· `var(--ed-ink-2)`（拆分前 `#374151`）；选中态底色 `#ccfbf1` 在 token 表里
 *              **无对应档** ⇒ 改用最近的 `var(--ed-bg-sunken)`。圆角 `6` 不在 `radiusScale`（3/5/8/10）里
 *              ⇒ **落到最近档位 `control`**：`borderRadius: "var(--ed-radius-control, 5px)"`
 *              （**登记 Δ：6 → 5**；⚠️ 第一版曾写成裸 `4` —— 那只是「躲开冻结集合」，同时制造了一个
 *              **新的非档位值**，控制方回执②点名 ⇒ 已改回 token 形态）。
 *              ⇒ 本件 0 处 `1px solid #e5e7eb` / 0 处越界圆角字面量 / 0 处裸 `fontSize`。
 *              **不迁 `Surface`**：这是 flex 行里的两个成组按钮（`SurfaceTag` 不含 `button`，
 *              加档=改原语契约）；按钮类名空间属 T5 的 `ViewSwitcher` 原语（批 5 后续任务）。
 */
import type { ReactNode } from "react";
import SessionRefineSection from "./SessionRefineSection";
import NotePreviewView from "../NotePreviewView";

/** 通用小按钮基础样式（拆分前 SessionDetailPanel 的 `btn`——本件切换组复用） */
const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

interface Props {
  /** 会话 id（面板的 `detail.session.id`）——`preview` 分支与切换器都要 */
  sessionId: number;
  /** 当前视图（状态由面板持有——裁决 D1：viewMode 状态留面板） */
  viewMode: "raw" | "preview";
  /** 切换请求（面板的 `setViewMode`） */
  onViewModeChange: (m: "raw" | "preview") => void;
  /** 工作台深链快照（面板的 `deepTaskId`）——透传 `NotePreviewView` */
  autoRefineTaskId: number | null;
  /** 精修任务启动回调（→ AI 对话页） */
  onRefineTaskStarted?: (sessionId: number, taskId: number) => void;
  /** 精修工具条的显隐/启用条件（面板按 detail 计算后传入，拆分前是同一表达式） */
  refining: boolean;
  onStartRefine: () => void;
  canSecondPass: boolean;
  onOpenPass2: () => void;
  onOpenProofread: () => void;
  /** 原文视图节点（本任务由面板直接渲染并传入） */
  children: ReactNode;
}

export default function SessionViewHost({
  sessionId,
  viewMode,
  onViewModeChange,
  autoRefineTaskId,
  onRefineTaskStarted,
  refining,
  onStartRefine,
  canSecondPass,
  onOpenPass2,
  onOpenProofread,
  children,
}: Props) {
  return (
    <>
      {/* 两视图切换（原料 / 笔记预览——REQ-081；v0.11.5 产物视图下线） */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {(
          [
            ["raw", "原料视图"],
            ["preview", "笔记预览"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            style={{
              ...btn,
              borderRadius: "var(--ed-radius-control, 5px)",
              border: viewMode === mode ? "1px solid var(--ed-ok)" : "1px solid var(--ed-border)",
              background: viewMode === mode ? "var(--ed-bg-sunken)" : "var(--ed-bg-surface)",
              color: viewMode === mode ? "var(--ed-ok)" : "var(--ed-ink-2)",
            }}
          >
            {label}
          </button>
        ))}
        {/* v0.11.5（spec 5️⃣）+ v0.20.2（REQ-268/270）：精修工具条三按钮
            —— 拆至 session-detail/SessionRefineSection.tsx（refineMsg 提示行与两裁决面板
            挂载保留原位，DOM 顺序逐字不变） */}
        <SessionRefineSection
          refining={refining}
          onStartRefine={onStartRefine}
          canSecondPass={canSecondPass}
          onOpenPass2={onOpenPass2}
          onOpenProofread={onOpenProofread}
        />
      </div>

      {viewMode === "preview" ? (
        <NotePreviewView
          sessionId={sessionId}
          autoTaskId={autoRefineTaskId}
          onTaskStarted={onRefineTaskStarted}
        />
      ) : (
        children
      )}
    </>
  );
}
