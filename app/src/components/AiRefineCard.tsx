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
import { listen } from "@tauri-apps/api/event";
import type {
  AiRefineResult,
  AiSettingsView,
  AiTaskState,
  BalanceView,
  DiffOp,
  RefineEstimateView,
} from "../types";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };

/** 任务失败原因 → 引导文案（REQ-145 四类出口） */
function failureGuide(failure: AiTaskFailureLike): string {
  const [kind, msg] = Object.entries(failure)[0] ?? ["other", "未知错误"];
  switch (kind) {
    case "unauthorized": return `未授权：${msg}（请到设置页配置密钥并开启 AI 功能）`;
    case "network": return `网络错误：${msg}（可重试）`;
    case "balance": return `余额不足：${msg}（请充值或切换免费档模型）`;
    case "quota": return `配额受限：${msg}（请明日再试）`;
    case "invalid": return `响应非法已丢弃：${msg}（本地规则版保留）`;
    default: return msg;
  }
}
type AiTaskFailureLike = Record<string, string>;

/** diff 三态渲染（本地版为基线：删除红划线/新增绿底/未变灰） */
function DiffLine({ op }: { op: DiffOp }) {
  if ("added" in op) {
    return <div style={{ background: "#ecfdf5", color: "#047857", padding: "2px 6px", borderRadius: 4 }}>+ {op.added}</div>;
  }
  if ("removed" in op) {
    return <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "2px 6px", borderRadius: 4, textDecoration: "line-through" }}>− {op.removed}</div>;
  }
  return <div style={{ color: "#6b7280", padding: "2px 6px" }}>  {("unchanged" in op ? op.unchanged : "").replace(/^#+\s*/, "") || " "}</div>;
}

export default function AiRefineCard({ sessionId, onApplied }: { sessionId: number; onApplied?: (id: number) => void }) {
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [phase, setPhase] = useState<"idle" | "consent" | "confirm" | "running" | "done" | "failed">("idle");
  const [estimate, setEstimate] = useState<RefineEstimateView | null>(null);
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null);
  const [result, setResult] = useState<AiRefineResult | null>(null);
  const [failure, setFailure] = useState<AiTaskFailureLike | null>(null);
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState("");
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  // 审查修复（2026-08-21 真机 debug）：taskId 与 handleState 用 ref 持有——
  // 事件/轮询回调在任务期间多次触发，若闭包捕获旧渲染版本（taskId=null），
  // 任务成功时 ai_refine_result 以 null 查询会失败 → 永久卡"排队中"
  const [, setTaskId] = useState<number | null>(null);
  const taskIdRef = useRef<number | null>(null);
  const handleStateRef = useRef<(st: AiTaskState) => Promise<void>>(async () => {});
  // 卡住检测（2026-08-21 真机"排队中"排查）：任务 30s 仍 Pending → 提示查看日志
  const lastChangeRef = useRef(0);

  // 事件通道（ai:task-update）——与轮询双通道，事件优先即时；订阅一次，
  // 回调经 handleStateRef 取最新实现（无闭包过期）
  useEffect(() => {
    const un = listen<[number, AiTaskState]>("ai:task-update", (e) => {
      const [tid, st] = e.payload;
      if (tid !== taskIdRef.current) return;
      void handleStateRef.current(st);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // 审查修复（2026-08-21）：组件卸载时停止轮询——否则 interval 持续 invoke
  // 并对已卸载组件 setState（切会话/关面板后泄漏）
  useEffect(() => {
    return () => {
      if (polling.current) {
        clearInterval(polling.current);
        polling.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void invoke<AiSettingsView>("ai_get_settings").then(setSettings).catch(() => undefined);
  }, []);

  const handleState = useCallback(async (st: AiTaskState) => {
    const tid = taskIdRef.current;
    if (st === "Succeeded") {
      stopPolling();
      const r = await invoke<AiRefineResult>("ai_refine_result", { taskId: tid }).catch(() => null);
      if (r) {
        setResult(r);
        setPhase("done");
      }
    } else if (typeof st === "object" && st !== null && "Failed" in st) {
      stopPolling();
      setFailure(st.Failed.reason as AiTaskFailureLike);
      setPhase("failed");
    } else if (typeof st === "object" && st !== null && "Running" in st) {
      setProgress({ finished: st.Running.finished_slices, total: st.Running.total_slices });
      setPhase("running");
    }
  }, []);

  // 同步最新 handleState 到 ref（事件/轮询回调总用最新实现）
  useEffect(() => {
    handleStateRef.current = handleState;
  }, [handleState]);

  const stopPolling = () => {
    if (polling.current) {
      clearInterval(polling.current);
      polling.current = null;
    }
  };

  const poll = (id: number) => {
    stopPolling();
    lastChangeRef.current = Date.now();
    polling.current = setInterval(async () => {
      const st = await invoke<AiTaskState>("ai_refine_status", { taskId: id }).catch(() => null);
      if (st) {
        // 状态有进展（Running/Succeeded/Failed）→ 刷新时间戳；仅 Pending 计入卡住窗口
        if (st !== "Pending") lastChangeRef.current = Date.now();
        void handleStateRef.current(st);
      }
      // 卡住检测：长时间仍 Pending = 任务未启动或后台卡死（tauri 终端看 [refine-task] 日志）
      if (Date.now() - lastChangeRef.current > 30_000) {
        stopPolling();
        taskIdRef.current = null; // 隔离旧任务后续事件
        setTaskId(null);
        setPhase("idle");
        setMsg("任务 30 秒无进展（可能未启动或后台卡住）——请查看 tauri 终端 [refine-task] 日志后重试");
      }
    }, 1500);
  };

  /** ① 预估 + 余额（确认弹窗数据源） */
  const prepare = async () => {
    setMsg("");
    if (!settings?.enabled) {
      setMsg("AI 功能未开启——请到设置页「AI 服务」开启（默认关）");
      setPhase("idle");
      return;
    }
    if (!settings.hasKey) {
      setMsg("未配置 API 密钥——请到设置页「AI 服务」保存密钥");
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
      setTaskId(handle.taskId);
      void handleState(handle.state);
      poll(handle.taskId);
    }
  };

  /** ③ 采纳落库（REQ-141：diff 预览后用户采纳 → 新笔记；v0.8.0 M4 版本化
   * 写路径——result 回传：规则基线=首快照 + 精修版=新版本 + 成本落库） */
  const apply = async () => {
    if (!result) return;
    setMsg("");
    const note = await invoke<{ id: number }>("ai_refine_apply", {
      sessionId,
      result,
    }).catch((e) => {
      setMsg(`落库失败：${e}`);
      return null;
    });
    if (note) {
      setMsg(`已落库为笔记 #${note.id}（可到笔记页查看版本时间线）`);
      onApplied?.(note.id);
      reset();
    }
  };

  const reset = () => {
    stopPolling();
    taskIdRef.current = null;
    setPhase("idle");
    setTaskId(null);
    setResult(null);
    setFailure(null);
    setProgress(null);
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
          </span>
        )}
      </div>

      {/* 授权卡（首次：上传内容说明） */}
      {phase === "consent" && (
        <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", borderRadius: 6, padding: 8, marginBottom: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>首次使用需授权</div>
          精修将上传<strong>转写文本与最小上下文</strong>至 SiliconFlow；本地优先铁律：<strong>音视频/图像永不出本机</strong>。是否同意？
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
          ❌ {failureGuide(failure)}
          <div style={{ marginTop: 6 }}>
            <button style={{ ...btn, border: "1px solid #d1d5db" }} onClick={reset}>重试</button>
            <span style={{ marginLeft: 8, color: "#6b7280" }}>本地规则版保留（不丢不假）</span>
          </div>
        </div>
      )}

      {/* diff 预览（本地版为基线 + 采纳/放弃） */}
      {phase === "done" && result && (
        <div>
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", padding: 6, fontSize: 11, fontFamily: "monospace", marginBottom: 6 }}>
            {result.diff.length === 0 ? (
              <div style={{ color: "#6b7280" }}>AI 精修与规则版无差异</div>
            ) : (
              result.diff.map((op, i) => <DiffLine key={i} op={op} />)
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => void apply()}>
              ✅ 采纳落库
            </button>
            <button style={btn} onClick={reset}>放弃（保留规则版）</button>
          </div>
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: msg.startsWith("已") ? "#0d9488" : "#dc2626", marginTop: 4 }}>{msg}</div>}
    </div>
  );
}
