/**
 * AiRefineCard — 会话→笔记 AI 精修卡片（REQ-141/145 + REQ-143 基础版，v0.8.0 M2）。
 *
 * @ai-context: 内嵌于笔记预览视图（REQ-141：AI 模式在预览视图提供选择）。
 *              流程：成本预估+余额确认（首次必显、可记住）→ 异步任务
 *              （切片进度）→ diff 预览（本地规则版为基线，AI 变化点高亮）
 *              → 采纳落库 / 放弃。授权红线：未开启/未授权先展示引导与授权卡。
 * @ai-context: 降级可见：任务失败按原因四类展示引导（未授权→设置密钥/授权、
 *              网络→重试、余额→充值、配额→明日再试），本地规则版保留。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
// M8：轮询/事件双通道/卡住检测抽入共用 hook（与 EnrichPanel 同源）
import { useAiTaskPolling } from "../hooks/useAiTaskPolling";
import { failureGuide } from "./aiTaskFailure";
import type { AiTaskFailureLike } from "./aiTaskFailure";
import type {
  AiRefineResult,
  AiSettingsView,
  AiTaskState,
  StrategyOverride,
} from "../types";
import RefineWorkbench from "./RefineWorkbench";
import RefineLaunchDialog from "./RefineLaunchDialog";
import { overrideFromInfo } from "../utils/refineStrategy";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };

export default function AiRefineCard({
  sessionId, onApplied, autoTaskId, onTaskStarted, onAutoTaskMissing,
}: {
  sessionId: number;
  onApplied?: (id: number) => void;
  /** v0.16.1：深链任务 id——挂载即取回结果并直接展开工作台（对话页任务视图跳转） */
  autoTaskId?: number | null;
  /** v0.16.1：任务启动成功回调（会话页精修 → 自动跳 AI 对话页） */
  onTaskStarted?: (sessionId: number, taskId: number) => void;
  /** v0.16.1：深链任务取回失败（任务非成功态/已清理——父层提示并清焦点） */
  onAutoTaskMissing?: () => void;
}) {
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null);
  const [result, setResult] = useState<AiRefineResult | null>(null);
  const [failure, setFailure] = useState<AiTaskFailureLike | null>(null);
  const [msg, setMsg] = useState("");
  const [, setTaskId] = useState<number | null>(null);
  const [showWorkbench, setShowWorkbench] = useState(false);
  // v0.17.0：策略发起对话框（目标/档位/旋钮/提示词预览/成本确认在对话框内）
  const [showLaunch, setShowLaunch] = useState(false);
  // v0.16.1 审查修复：工作台「重新生成」不经用户启动路径——旁路导航跳转
  // （否则每次 regenerate 都会 onTaskStarted → App 把你从会话页拽到 AI 对话页）
  const skipNavigateRef = useRef(false);

  useEffect(() => {
    void invoke<AiSettingsView>("ai_get_settings").then(setSettings).catch(() => undefined);
  }, []);

  // v0.16.1：工作台深链——带 autoTaskId 挂载 → 取回结果直接展开工作台（免重跑流程）
  useEffect(() => {
    if (autoTaskId == null) return;
    void (async () => {
      try {
        const r = await invoke<AiRefineResult>("ai_refine_result", { taskId: autoTaskId });
        taskIdRef.current = autoTaskId;
        setResult(r);
        setPhase("done");
        setShowWorkbench(true);
      } catch {
        onAutoTaskMissing?.();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTaskId]);

  // M8：任务状态派发（纯业务）——轮询/事件/卡住检测/卸载清理均由
  // useAiTaskPolling 承担；taskId 以参数传入（原实现靠 ref 镜像防闭包过期，
  // 现由 hook 内部 ref 统一保障）
  const handleState = useCallback(async (st: AiTaskState, tid: number | null) => {
    if (st === "Succeeded") {
      const r = await invoke<AiRefineResult>("ai_refine_result", { taskId: tid }).catch(() => null);
      if (r) {
        setResult(r);
        setPhase("done");
        // 线路优化：完成即自动打开工作台（对比+采纳/放弃/重新生成一体——
        // 原"打开工作台/放弃"中间步冗余，工作台内本就有这两个出口）
        setShowWorkbench(true);
      }
    } else if (typeof st === "object" && st !== null && "Failed" in st) {
      setFailure(st.Failed.reason as AiTaskFailureLike);
      setPhase("failed");
    } else if (typeof st === "object" && st !== null && "Running" in st) {
      setProgress({ finished: st.Running.finished_slices, total: st.Running.total_slices });
      setPhase("running");
    }
  }, []);

  const { taskIdRef, startPolling, stopPolling } = useAiTaskPolling(handleState, () => {
    // 30s 卡住 UI 复位（文案与抽取前一致）
    setTaskId(null);
    setPhase("idle");
    setMsg("任务 30 秒无进展（可能未启动或后台卡住）——请查看 tauri 终端 [refine-task] 日志后重试");
  });

  /** ① 快速检查 → 打开策略发起对话框（授权/成本确认/策略选择在对话框内） */
  const prepare = async () => {
    setMsg("");
    if (!settings?.enabled) {
      setMsg("AI 功能未开启——请到设置页「AI 服务」开启（默认关）");
      setPhase("idle");
      return;
    }
    if (!settings.hasKey) {
      setMsg("未配置 API 密钥——请在设置页「AI 服务提供商」配置密钥");
      setPhase("idle");
      return;
    }
    setShowLaunch(true);
  };

  /** ② 对话框确认启动回调（策略已由对话框传入——回接轮询/事件双通道） */
  const handleDialogStarted = useCallback((sid: number, taskId: number) => {
    setPhase("running");
    taskIdRef.current = taskId;
    // v0.16.1：会话页精修启动 → 自动跳 AI 对话页（任务卡入聊天线程/可追问）
    if (!skipNavigateRef.current) onTaskStarted?.(sid, taskId);
    setTaskId(taskId);
    startPolling(taskId);
  }, [onTaskStarted, startPolling]);

  /** ② 启动任务（重生成路径——沿用本次策略档位；主发起对话框传策略） */
  const start = async (strategy?: StrategyOverride) => {
    setMsg("");
    setPhase("running");
    // 契约修复（2026-08-21 真机"排队中"根因）：Rust AiTaskHandle 为 camelCase
    // 序列化（taskId），此前读 handle.task_id 恒为 undefined → 事件被忽略、
    // 轮询缺参报错 → 前端永久"排队中"而任务实际早已失败
    const handle = await invoke<{ taskId: number; state: AiTaskState }>("ai_refine_start", {
      sessionId,
      authorized: true,
      strategy: strategy ?? null,
    }).catch((e) => {
      setMsg(`启动失败：${e}`);
      setPhase("idle");
      return null;
    });
    if (handle) {
      taskIdRef.current = handle.taskId;
      // v0.16.1：会话页精修启动 → 自动跳 AI 对话页（任务卡入聊天线程/可追问）；
      // 工作台重新生成路径经 skipNavigateRef 旁路（审查修复：不跳转）
      if (!skipNavigateRef.current) onTaskStarted?.(sessionId, handle.taskId);
      setTaskId(handle.taskId);
      void handleState(handle.state, handle.taskId);
      startPolling(handle.taskId);
    }
  };

  /** ③ 采纳落库已移至 RefineWorkbench 组件（Task 11 工作台） */
  const reset = () => {
    stopPolling();
    taskIdRef.current = null;
    setPhase("idle");
    setTaskId(null);
    setResult(null);
    setFailure(null);
    setProgress(null);
  };

  return (
    <div style={{ border: "1px solid #c7d2fe", borderRadius: 8, padding: 10, marginBottom: 8, background: "#f5f3ff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>✨ AI 精修（可选）</span>
        {phase === "idle" && (
          <button style={{ ...btn, background: "#4f46e5", color: "#fff", border: "none" }} onClick={() => void prepare()}>
            ✨ AI 精修
          </button>
        )}
        {phase === "done" && (
          <span style={{ fontSize: 11, color: "#0d9488" }}>
            新增 {result?.addedLines} 行 · 删除 {result?.removedLines} 行 · 切片 {result?.slices}
            {result && result.failedSlices > 0 && (
              <span style={{ color: "#b45309", marginLeft: 6 }}>
                ⚠️ 部分成功（{result.failedSlices}/{result.slices} 片失败——已保留规则版内容）
              </span>
            )}
          </span>
        )}
      </div>

      {/* 任务进行中（切片进度） */}
      {phase === "running" && (
        <div style={{ fontSize: 12, color: "#4b5563" }}>
          ⏳ 精修中：{progress ? `已完成 ${progress.finished}/${progress.total} 片` : "任务排队中…"}
          {progress && progress.total > 1 && (
            <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, marginTop: 6 }}>
              <div style={{ height: 4, width: `${(progress.finished / progress.total) * 100}%`, background: "#4f46e5", borderRadius: 2 }} />
            </div>
          )}
        </div>
      )}

      {/* 失败（降级可见 + 原因引导 + 重试） */}
      {phase === "failed" && failure && (
        <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 6 }}>
          ❌ {failureGuide(failure, "本地规则版保留")}
          <div style={{ marginTop: 6 }}>
            <button style={{ ...btn, border: "1px solid #d1d5db" }} onClick={reset}>重试</button>
            <span style={{ marginLeft: 8, color: "#6b7280" }}>本地规则版保留（不丢不假）</span>
          </div>
        </div>
      )}

      {/* 精修完成 → 工作台（完成即自动打开；关闭后可经下方按钮重开） */}
      {phase === "done" && result && (
        <div>
          {showWorkbench ? (
            <RefineWorkbench
              sessionId={sessionId}
              taskResult={result}
              // 采纳落库回传真实 taskId——标记 adopted + 成本回填（防重启后
              // 任务中心重复采纳产生重复笔记；原实现恒传 null 丢失该保障）
              taskId={taskIdRef.current}
              // 重新生成走父级任务管线（running 态 + 轮询/事件 + 卡住检测）——
              // 原工作台直连 ai_refine_start 导致卡片状态残留（旧结果+无进度）；
              // 审查修复：regenerate 旁路 onTaskStarted 导航（不离开当前页）
              onRegenerate={async () => {
                skipNavigateRef.current = true;
                try {
                  // 审查修复：重生成沿用本次策略档位（首版与重生成同档位）
                  await start(result.strategy ? overrideFromInfo(result.strategy) : undefined);
                } finally { skipNavigateRef.current = false; }
              }}
              onClose={() => setShowWorkbench(false)}
              onApplied={(id) => { reset(); onApplied?.(id); }}
            />
          ) : (
            <div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <button
                  style={{ ...btn, background: "#4f46e5", color: "#fff", border: "none", fontSize: 12 }}
                  onClick={() => setShowWorkbench(true)}
                >
                  🔧 打开工作台
                </button>
                <button style={btn} onClick={reset}>放弃（保留规则版）</button>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: msg.startsWith("已") ? "#0d9488" : "#dc2626", marginTop: 4 }}>{msg}</div>}

      {/* v0.17.0：策略发起对话框（目标/档位/旋钮/预览/成本/授权） */}
      {showLaunch && (
        <RefineLaunchDialog
          sessionId={sessionId}
          onClose={() => setShowLaunch(false)}
          onStarted={handleDialogStarted}
        />
      )}
    </div>
  );
}
