/**
 * NoteAiDialog — 笔记编辑态 AI 能力对话框（v0.17.0 REQ-246）。
 *
 * @ai-context: 统一入口（精修/知识补充/预留）——知识补充板块从阅读态独立面板
 *              迁移至此（用户裁决：阅读态用 AI 直接进入编辑态）。精修=笔记级
 *              （内容=编辑器当前内容直接传参；profile=handwritten 笔记式/用户
 *              所选；基线=当前笔记版）；补充=现有 EnrichPanel 交互内嵌复用。
 * @ai-context: 审查修复（v0.17.0 七维）：笔记级精修完成后自动打开工作台
 *              （noteMode——对比/采纳/重生成闭环，与 AiRefineCard 会话级同
 *              状态机）；重生成沿用本次策略档位（overrideFromInfo——首版与
 *              重生成同档位，不回退全局默认）。
 * @ai-context: 批 4 T6 迁移：遮罩/居中/面板几何交给 `Modal`（barrel 导入，B5）。
 *              两个面板宽分支（menu 460 / 其余 520）按计划**同用 `m` 档**（520，
 *              取大者——避免同一组件里宽度跳档）。`kind === "menu"` 才允许「点遮罩
 *              关闭」这一点逐字保留（见下方 `closeOnOverlay`）；`handleClose` 的
 *              busy 门（`running || showWorkbench` 时不关）现在是**唯一的**关闭门。
 */
import { useCallback, useState } from "react";
import { Button, Modal, StatusLine, Text } from "../ui/primitives";
import { invoke } from "@tauri-apps/api/core";
import { useAiTaskPolling } from "../hooks/useAiTaskPolling";
import type { AiRefineResult, AiTaskState } from "../types";
import { overrideFromInfo } from "../utils/refineStrategy";
import EnrichPanel from "./EnrichPanel";
import RefineLaunchDialog from "./RefineLaunchDialog";
import RefineWorkbench from "./RefineWorkbench";

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
  /** 精修采纳/补充完成回调（父层刷新笔记） */
  onUpdated?: (noteId: number) => void;
}) {
  const [kind, setKind] = useState<"menu" | "refine" | "enrich">("menu");
  // 笔记级精修状态机（审查修复：完成即开工作台——闭环不缺采纳入口）
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null);
  const [result, setResult] = useState<AiRefineResult | null>(null);
  const [showWorkbench, setShowWorkbench] = useState(false);
  const [msg, setMsg] = useState("");

  const handleState = useCallback(async (st: AiTaskState, tid: number | null) => {
    if (st === "Succeeded") {
      const r = await invoke<AiRefineResult>("ai_refine_result", { taskId: tid }).catch(() => null);
      if (r) {
        setResult(r);
        setRunning(false);
        setShowWorkbench(true);
      } else {
        // v0.17.1 防御：结果取回失败不得静默卡住（提示可重试）
        setMsg("任务已完成但结果取回失败——可关闭后到 AI 对话页「AI 任务」查看或重试");
        setRunning(false);
      }
    } else if (typeof st === "object" && st !== null && "Failed" in st) {
      setMsg(`精修失败：${JSON.stringify(st.Failed.reason ?? {})}`);
      setRunning(false);
    } else if (typeof st === "object" && st !== null && "Running" in st) {
      setProgress({ finished: st.Running.finished_slices, total: st.Running.total_slices });
    }
  }, []);

  // v0.17.1 修复：hook 的 taskIdRef 由调用方设置（事件通道过滤 + 派发参数
  // 数据源）——此前误用本地自建 ref → 轮询以 taskId=null 派发 → 结果取回
  // 失败被吞 → running 永不翻转（用户报障"长时间卡在处理页面"）
  const { taskIdRef, startPolling, stopPolling } = useAiTaskPolling(handleState, () => {
    setMsg("任务 30 秒无进展（可能未启动或后台卡住）——请查看 tauri 终端 [refine-task] 日志后重试");
    setRunning(false);
  });

  /** 精修发起成功回调（taskId 回接轮询/事件双通道） */
  const handleRefineStarted = useCallback((_targetId: number, taskId: number) => {
    taskIdRef.current = taskId;
    setRunning(true);
    setMsg("");
    startPolling(taskId);
  }, [startPolling]);

  /** 重新生成（沿用本次策略档位——审查修复：不回退全局默认） */
  const handleRegenerate = useCallback(async () => {
    setMsg("");
    setShowWorkbench(false);
    setRunning(true);
    const handle = await invoke<{ taskId: number }>("ai_note_refine_start", {
      noteId,
      content: noteContent,
      profile: null,
      authorized: true,
      strategy: result?.strategy ? overrideFromInfo(result.strategy) : undefined,
    }).catch((e) => {
      setMsg(`重新生成失败：${e}`);
      setRunning(false);
      return null;
    });
    if (handle) {
      taskIdRef.current = handle.taskId;
      startPolling(handle.taskId);
    }
  }, [noteId, noteContent, result, startPolling]);

  /** 关闭（进行中/工作台打开时不关——防丢任务与对比） */
  const handleClose = useCallback(() => {
    if (running || showWorkbench) return;
    stopPolling();
    onClose();
  }, [running, showWorkbench, stopPolling, onClose]);

  /** 头行右侧状态位（原面板头的 `smallBtn` 自定义关闭钮已删——关闭由 `Modal` 的 `-close` 承载） */
  const statusHint = (
    <Text tone="ink-3" style={{ fontSize: 11 }}>
      {/* 信息9（审查裸号）：本对话框未传标题上下文（仅 noteId/content）——
          中性「当前笔记」不裸显 #id（REQ-277 口径） */}
      当前笔记
    </Text>
  );

  return (
    <Modal
      open
      onClose={handleClose}
      title="AI 能力"
      size="m"
      testId="note-ai-dialog"
      // 原 `onClick` 只在 menu 分支关（选完能力后误点背景不该关掉精修/补充面板）
      closeOnOverlay={kind === "menu"}
    >
      {/* 原面板的 `maxHeight: "90vh"` + `overflowY: "auto"` —— `Modal` 自己给的是 85vh，
          这里保留调用点的 90vh 上限（内容超高时仍在面板内滚，不外溢到遮罩） */}
      <div style={{ maxHeight: "90vh", overflowY: "auto" }}>
        {kind === "menu" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>🤖 AI 能力</span>
              {statusHint}
            </div>
            <button style={{ ...menuBtn, background: "#f5f3ff", border: "1px solid #c7d2fe" }} onClick={() => setKind("refine")}>
              <span style={{ fontWeight: 600 }}>✨ AI 精修</span>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                整理当前笔记（去冗余/结构化/按目标改写）——选择目标/变化程度，可实时预览提示词
              </div>
            </button>
            <Button
              variant="secondary"
              size="lg"
              block
              style={{ display: "block", textAlign: "left", marginBottom: 6 }}
              onClick={() => setKind("enrich")}
            >
              <span style={{ fontWeight: 600 }}>✧ 知识补充</span>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                补充与笔记相关的新知识（概念展开/步骤补全/例子/进阶/资源）——九子项勾选
              </div>
            </Button>
          </>
        )}

        {kind === "refine" && (
          <>
            {!running && !showWorkbench && (
              <RefineLaunchDialog
                noteId={noteId}
                noteContent={noteContent}
                onClose={handleClose}
                onStarted={handleRefineStarted}
              />
            )}
            {running && (
              <div style={{ fontSize: 12, color: "#4b5563" }}>
                ⏳ 精修中：{progress ? `已完成 ${progress.finished}/${progress.total} 片` : "任务排队中…"}
                {progress && progress.total > 1 && (
                  <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, marginTop: 6 }}>
                    <div style={{ height: 4, width: `${(progress.finished / progress.total) * 100}%`, background: "#4f46e5", borderRadius: 2 }} />
                  </div>
                )}
              </div>
            )}
            {msg && (
              <div style={{ marginTop: 8 }}>
                <StatusLine
                  kind="error"
                  action={<button style={{ padding: "4px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6, marginLeft: 8, border: "1px solid #d1d5db" }} onClick={handleClose}>关闭</button>}
                >
                  {msg}
                </StatusLine>
              </div>
            )}
            {showWorkbench && result && (
              <RefineWorkbench
                noteMode
                noteId={noteId}
                sessionId={undefined}
                taskResult={result}
                taskId={taskIdRef.current}
                onRegenerate={() => void handleRegenerate()}
                onClose={() => { setShowWorkbench(false); handleClose(); }}
                onApplied={(id) => { onUpdated?.(id); handleClose(); }}
              />
            )}
          </>
        )}

        {kind === "enrich" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>✧ 知识补充</span>
              <button
                onClick={handleClose}
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
    </Modal>
  );
}
