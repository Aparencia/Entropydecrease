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
  BalanceView,
  RefineEstimateView,
} from "../types";
import RefineWorkbench from "./RefineWorkbench";

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
  const [phase, setPhase] = useState<"idle" | "consent" | "confirm" | "running" | "done" | "failed">("idle");
  const [estimate, setEstimate] = useState<RefineEstimateView | null>(null);
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null);
  const [result, setResult] = useState<AiRefineResult | null>(null);
  const [failure, setFailure] = useState<AiTaskFailureLike | null>(null);
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState("");
  const [, setTaskId] = useState<number | null>(null);
  const [showWorkbench, setShowWorkbench] = useState(false);
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

  /** ① 预估 + 余额（确认弹窗数据源） */
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
    if (!settings.authorized) {
      setPhase("consent");
      return;
    }
    const est = await invoke<RefineEstimateView>("ai_refine_estimate", { sessionId }).catch(() => null);
    const bal = await invoke<BalanceView>("ai_get_balance").catch(() => null);
    if (!est) {
      setMsg("成本预估失败，无法继续");
      return;
    }
    setEstimate(est);
    setBalance(bal);
    setRemember(est.rememberCostChoice);
    // 已"记住此选择"且同意过 → 跳过确认直接开始
    if (est.rememberCostChoice) {
      void start(est);
    } else {
      setPhase("confirm");
    }
  };

  /** ② 启动任务（确认/授权通过后） */
  const start = async (est?: RefineEstimateView) => {
    setMsg("");
    if (remember && !est) {
      // 勾选"记住" → 持久化偏好
      await invoke("ai_update_settings", {
        settings: { ...settings, rememberCostChoice: true },
      }).catch(() => undefined);
    }
    setPhase("running");
    // 契约修复（2026-08-21 真机"排队中"根因）：Rust AiTaskHandle 为 camelCase
    // 序列化（taskId），此前读 handle.task_id 恒为 undefined → 事件被忽略、
    // 轮询缺参报错 → 前端永久"排队中"而任务实际早已失败
    const handle = await invoke<{ taskId: number; state: AiTaskState }>("ai_refine_start", {
      sessionId,
      authorized: true,
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
    setEstimate(null);
    setBalance(null);
  };

  const est = estimate?.estimate;

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

      {/* 授权卡（首次：上传内容说明） */}
      {phase === "consent" && (
        <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", borderRadius: 6, padding: 8, marginBottom: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>首次使用需授权</div>
          精修将上传<strong>转写文本与最小上下文</strong>至 DeepSeek；本地优先铁律：<strong>音视频/图像永不出本机</strong>。是否同意？
          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
            <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={async () => {
              await invoke("ai_set_authorized", { authorized: true }).catch(() => undefined);
              setSettings({ ...settings!, authorized: true });
              setPhase("confirm");
            }}>同意并继续</button>
            <button style={btn} onClick={() => setPhase("idle")}>暂不</button>
          </div>
        </div>
      )}

      {/* 成本确认（REQ-143 基础版：token 预估 + 费用 + 内联余额） */}
      {phase === "confirm" && est && (
        <div style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: 8, marginBottom: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>成本确认</div>
          <div>
            预估 token：<strong>{est.estTokens}</strong> · 预估费用：<strong>¥{est.estCostYuan.toFixed(4)}</strong>
            {est.pricePer1m > 0 && <span style={{ color: "#6b7280" }}>（单价 ¥{est.pricePer1m}/1M token）</span>}
            {est.pricePer1m === 0 && <span style={{ color: "#0d9488" }}>（当前模型免费档 ¥0）</span>}
            {est.pricePer1m === 0 && est.priceKnown === false && <span style={{ color: "#d97706" }}>（该模型单价未登记，费用可能不准确）</span>}
          </div>
          {balance && (
            <div style={{ color: balance.lowBalanceWarning ? "#dc2626" : "#374151" }}>
              当前余额：<strong>¥{balance.balance.totalBalance.toFixed(2)}</strong>
              {balance.lowBalanceWarning && <span style={{ marginLeft: 6 }}>⚠️ {balance.lowBalanceWarning}</span>}
            </div>
          )}
          {/* F3-D：成本硬拦截提示——余额不足时启动会被后端拒绝（三出口引导） */}
          {balance && est.estCostYuan > 0 && balance.balance.totalBalance < est.estCostYuan * 1.2 && (
            <div style={{ color: "#b91c1c", marginTop: 2 }}>
              ⚠️ 余额不足本次预估（含安全系数）——启动将被拦截，请充值或切换免费档模型
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 4, margin: "4px 0" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            记住此选择，下次不再确认
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => void start()}>
              开始精修
            </button>
            <button style={btn} onClick={reset}>取消</button>
          </div>
        </div>
      )}

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
                try { await start(); } finally { skipNavigateRef.current = false; }
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
    </div>
  );
}
