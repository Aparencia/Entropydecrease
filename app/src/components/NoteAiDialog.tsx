/**
 * NoteAiDialog — 笔记编辑态 AI 能力对话框（v0.17.0 REQ-246）。
 *
 * @ai-context: 统一入口（精修/知识补充/预留槽位）——知识补充板块从阅读态
 *              独立面板迁移至此（用户裁决：阅读态用 AI 直接进入编辑态）。
 *              精修=笔记级（内容=编辑器当前内容直接传参，未保存所见即所修；
 *              profile=handwritten 笔记式/用户所选；基线=当前笔记版）；
 *              补充=现有 EnrichPanel 交互（九子项勾选）内嵌复用。
 */

import { useState } from "react";
import EnrichPanel from "./EnrichPanel";
import RefineLaunchDialog from "./RefineLaunchDialog";

const menuBtn: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "10px 12px", cursor: "pointer", fontSize: 13, borderRadius: 8,
  border: "1px solid #e5e7eb", background: "#fff", color: "#374151", marginBottom: 6,
};

export default function NoteAiDialog({
  noteId,
  noteContent,
  onClose,
  onUpdated,
}: {
  noteId: number;
  /** 编辑器当前内容（发起精修时直接传参——未保存所见即所修） */
  noteContent: string;
  onClose: () => void;
  /** 知识补充完成回调（父层刷新笔记） */
  onUpdated?: (noteId: number) => void;
}) {
  const [kind, setKind] = useState<"menu" | "refine" | "enrich">("menu");

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={() => { if (kind === "menu") onClose(); }}
    >
      <div
        style={{ width: 460, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto",
          background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 8px 30px rgba(0,0,0,.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {kind === "menu" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>🤖 AI 能力</span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>笔记 #{noteId}</span>
            </div>
            <button style={{ ...menuBtn, background: "#f5f3ff", border: "1px solid #c7d2fe" }} onClick={() => setKind("refine")}>
              <span style={{ fontWeight: 600 }}>✨ AI 精修</span>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                整理当前笔记（去冗余/结构化/按目标改写）——选择目标/变化程度，可实时预览提示词
              </div>
            </button>
            <button style={menuBtn} onClick={() => setKind("enrich")}>
              <span style={{ fontWeight: 600 }}>✧ 知识补充</span>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                补充与笔记相关的新知识（概念展开/步骤补全/例子/进阶/资源）——九子项勾选
              </div>
            </button>
          </>
        )}

        {kind === "refine" && (
          <RefineLaunchDialog
            noteId={noteId}
            noteContent={noteContent}
            onClose={onClose}
            onStarted={(_targetId, _taskId) => {
              // 任务已入后台（事件/轮询双通道）——关闭对话框；父层保持编辑态
              onClose();
            }}
          />
        )}

        {kind === "enrich" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>✧ 知识补充</span>
              <button
                onClick={onClose}
                style={{ padding: "3px 10px", cursor: "pointer", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff" }}
              >
                完成
              </button>
            </div>
            {/* 九子项面板复用（REQ-142 交互不变——仅入口迁至编辑态） */}
            <EnrichPanel noteId={noteId} onUpdated={() => onUpdated?.(noteId)} />
          </div>
        )}
      </div>
    </div>
  );
}
