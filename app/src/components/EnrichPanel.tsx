/**
 * EnrichPanel — 笔记知识补充面板（REQ-142，v0.8.0 M3）。
 *
 * @ai-context: 与精修语义分开：精修=处理已有内容，补充=生成新内容（模型
 *              外部知识）。九子项勾选（深度 d1~d3 就近插入引用章节 + 广度
 *              b1~b6 聚合尾部扩展区；记忆上次选择 localStorage）→ 成本预估
 *              确认 → 异步任务（切片进度）→ 结果预览（含"AI 补充·非课程
 *              内容·需核实"扩展区）→ 采纳 update_note / 撤销（base 还原，
 *              删除无残留）。B6 仅标题不输出链接（后端 schema 保证）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AiEnrichResult,
  AiSettingsView,
  AiTaskState,
  BalanceView,
  EnrichKind,
  RefineEstimateView,
} from "../types";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };

/** 九子项展示（深度在前、广度在后；与 Rust AiEnrichKind 对齐） */
const KINDS: { key: EnrichKind; label: string; group: "深度" | "广度" }[] = [
  { key: "d1", label: "概念展开", group: "深度" },
  { key: "d2", label: "步骤补全", group: "深度" },
  { key: "d3", label: "例子补全", group: "深度" },
  { key: "b1", label: "前置知识", group: "广度" },
  { key: "b2", label: "进阶方向", group: "广度" },
  { key: "b3", label: "横向关联", group: "广度" },
  { key: "b4", label: "对比辨析", group: "广度" },
  { key: "b5", label: "实践建议", group: "广度" },
  { key: "b6", label: "资源推荐", group: "广度" },
];

const MEM_KEY = "entropy.enrich.kinds";
type FailureLike = Record<string, string>;

/** 失败原因 → 引导文案（与精修同口径四类出口） */
function failureGuide(f: FailureLike): string {
  const [kind, msg] = Object.entries(f)[0] ?? ["other", "未知错误"];
  switch (kind) {
    case "unauthorized": return `未授权：${msg}（请到设置页配置密钥并开启 AI 功能）`;
    case "network": return `网络错误：${msg}（可重试）`;
    case "balance": return `余额不足：${msg}（请充值或切换免费档模型）`;
    case "quota": return `配额受限：${msg}（请明日再试）`;
    case "invalid": return `响应非法已丢弃：${msg}（未落任何补充内容）`;
    default: return msg;
  }
}

export default function EnrichPanel({ noteId, onUpdated }: { noteId: number; onUpdated?: () => void }) {
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [selected, setSelected] = useState<EnrichKind[]>([]);
  const [phase, setPhase] = useState<"idle" | "consent" | "confirm" | "running" | "done" | "failed">("idle");
  const [estimate, setEstimate] = useState<RefineEstimateView | null>(null);
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null);
  const [result, setResult] = useState<AiEnrichResult | null>(null);
  const [failure, setFailure] = useState<FailureLike | null>(null);
  const [msg, setMsg] = useState("");
  const [, setTaskId] = useState<number | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  // 审查修复（2026-08-21 真机 debug）：同 AiRefineCard——闭包过期会导致
  // 事件/轮询回调用旧 taskId（null）查询结果而永久卡"排队中"
  const taskIdRef = useRef<number | null>(null);
  const handleStateRef = useRef<(st: AiTaskState) => Promise<void>>(async () => {});

  useEffect(() => {
    void invoke<AiSettingsView>("ai_get_settings").then(setSettings).catch(() => undefined);
    // 记忆上次选择（localStorage）
    try {
      const saved = localStorage.getItem(MEM_KEY);
      if (saved) setSelected(JSON.parse(saved) as EnrichKind[]);
    } catch { /* 损坏记忆回退默认 */ }
    if (!localStorage.getItem(MEM_KEY)) setSelected(["d1", "d2", "b1", "b5"]);
  }, []);

  const stopPolling = () => {
    if (polling.current) {
      clearInterval(polling.current);
      polling.current = null;
    }
  };

  const handleState = useCallback(async (st: AiTaskState) => {
    const tid = taskIdRef.current;
    if (st === "Succeeded") {
      stopPolling();
      const r = await invoke<AiEnrichResult>("ai_enrich_result", { taskId: tid }).catch(() => null);
      if (r) {
        setResult(r);
        setPhase("done");
      }
    } else if (typeof st === "object" && st !== null && "Failed" in st) {
      stopPolling();
      setFailure(st.Failed.reason as FailureLike);
      setPhase("failed");
    } else if (typeof st === "object" && st !== null && "Running" in st) {
      setProgress({ finished: st.Running.finished_slices, total: st.Running.total_slices });
      setPhase("running");
    }
  }, []);

  // 同步最新 handleState 到 ref（事件/轮询回调总用最新实现——无闭包过期）
  useEffect(() => {
    handleStateRef.current = handleState;
  }, [handleState]);

  useEffect(() => {
    // 审查修复（2026-08-21）：静态 import + 事件监听订阅一次，回调经 ref 取最新
    const un = listen<[number, AiTaskState]>("ai:task-update", (e) => {
      if (e.payload[0] !== taskIdRef.current) return;
      void handleStateRef.current(e.payload[1]);
    });
    return () => {
      un.then((off) => off());
    };
  }, []);

  const poll = (id: number) => {
    stopPolling();
    polling.current = setInterval(async () => {
      const st = await invoke<AiTaskState>("ai_refine_status", { taskId: id }).catch(() => null);
      if (st) void handleState(st);
    }, 1500);
  };

  useEffect(() => {
    // 审查修复（2026-08-21）：组件卸载时停止轮询——否则 interval 持续 invoke
    // 并对已卸载组件 setState（切会话/关面板后泄漏）
    return () => {
      if (polling.current) {
        clearInterval(polling.current);
        polling.current = null;
      }
    };
  }, []);

  const toggle = (k: EnrichKind) => {
    setSelected((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      localStorage.setItem(MEM_KEY, JSON.stringify(next));
      return next;
    });
  };

  const prepare = async () => {
    setMsg("");
    if (!settings?.enabled) {
      setMsg("AI 功能未开启——请到设置页「AI 服务」开启（默认关）");
      return;
    }
    if (!settings.hasKey) {
      setMsg("未配置 API 密钥——请到设置页「AI 服务」保存密钥");
      return;
    }
    if (selected.length === 0) {
      setMsg("请至少勾选一个补充子项");
      return;
    }
    if (!settings.authorized) {
      setPhase("consent");
      return;
    }
    await loadConfirm();
  };

  const loadConfirm = async () => {
    const est = await invoke<RefineEstimateView>("ai_enrich_estimate", { noteId, selectedKinds: selected }).catch(() => null);
    const bal = await invoke<BalanceView>("ai_get_balance").catch(() => null);
    if (!est) {
      setMsg("成本预估失败，无法继续");
      return;
    }
    setEstimate(est);
    setBalance(bal);
    setPhase("confirm");
  };

  const start = async () => {
    setMsg("");
    setPhase("running");
    const handle = await invoke<{ task_id: number; state: AiTaskState }>("ai_enrich_start", {
      noteId,
      selectedKinds: selected,
      authorized: true,
    }).catch((e) => {
      setMsg(`启动失败：${e}`);
      setPhase("idle");
      return null;
    });
    if (handle) {
      setTaskId(handle.task_id);
      void handleState(handle.state);
      poll(handle.task_id);
    }
  };

  const apply = async () => {
    if (!result) return;
    const note = await invoke<{ id: number }>("ai_enrich_apply", {
      noteId,
      result,
    }).catch((e) => {
      setMsg(`采纳失败：${e}`);
      return null;
    });
    if (note) {
      setMsg(`已应用知识补充（笔记 #${note.id}）——扩展区可手动删除或撤销还原；可到版本时间线对比`);
      onUpdated?.();
      reset();
    }
  };

  const revert = async () => {
    if (!result) return;
    await invoke<{ id: number }>("ai_enrich_revert", {
      noteId,
      baseMarkdown: result.baseMarkdown,
    }).catch((e) => setMsg(`撤销失败：${e}`));
    setMsg("已撤销补充（内容还原补充前——删除无残留）");
    onUpdated?.();
    reset();
  };

  const reset = () => {
    stopPolling();
    setPhase("idle");
    setTaskId(null);
    setResult(null);
    setFailure(null);
    setProgress(null);
  };

  const est = estimate?.estimate;

  return (
    <div style={{ border: "1px solid #ddd6fe", borderRadius: 8, padding: 10, marginBottom: 10, background: "#faf5ff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>✨ 知识补充（可选）</span>
        {phase === "idle" && (
          <button style={{ ...btn, background: "#7c3aed", color: "#fff", border: "none" }} onClick={() => void prepare()}>
            ✨ 知识补充
          </button>
        )}
        {phase === "done" && result && (
          <span style={{ fontSize: 11, color: "#7c3aed" }}>
            深度 {result.depthBlocks} · 广度 {result.breadthBlocks} · 切片 {result.blocks}
          </span>
        )}
      </div>

      {/* 子项勾选（深度/广度分组） */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        {(["深度", "广度"] as const).map((group) => (
          <div key={group}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{group}</div>
            {KINDS.filter((k) => k.group === group).map((k) => (
              <label key={k.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, marginRight: 10 }}>
                <input type="checkbox" checked={selected.includes(k.key)} onChange={() => toggle(k.key)} />
                {k.label}
              </label>
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
        深度=就近插入引用章节下（可溯源）；广度=聚合笔记尾部扩展区（"非课程内容·需核实"）；B6 仅标题不输出链接。
      </div>

      {/* 授权卡 */}
      {phase === "consent" && (
        <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", borderRadius: 6, padding: 8, marginBottom: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>首次使用需授权</div>
          知识补充将上传<strong>笔记文本与最小上下文</strong>至 SiliconFlow；本地优先铁律：<strong>音视频/图像永不出本机</strong>。是否同意？
          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
            <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={async () => {
              await invoke("ai_set_authorized", { authorized: true }).catch(() => undefined);
              setSettings({ ...settings!, authorized: true });
              await loadConfirm();
            }}>同意并继续</button>
            <button style={btn} onClick={() => setPhase("idle")}>暂不</button>
          </div>
        </div>
      )}

      {/* 成本确认 */}
      {phase === "confirm" && est && (
        <div style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: 8, marginBottom: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>成本确认</div>
          <div>
            预估 token：<strong>{est.estTokens}</strong> · 预估费用：<strong>¥{est.estCostYuan.toFixed(4)}</strong>
            {est.estCostYuan === 0 && <span style={{ color: "#0d9488" }}>（当前模型免费档 ¥0）</span>}
          </div>
          {balance && (
            <div style={{ color: balance.lowBalanceWarning ? "#dc2626" : "#374151" }}>
              当前余额：<strong>¥{balance.balance.totalBalance.toFixed(2)}</strong>
              {balance.lowBalanceWarning && <span style={{ marginLeft: 6 }}>⚠️ {balance.lowBalanceWarning}</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => void start()}>
              开始补充
            </button>
            <button style={btn} onClick={reset}>取消</button>
          </div>
        </div>
      )}

      {/* 任务进度 */}
      {phase === "running" && (
        <div style={{ fontSize: 12, color: "#4b5563" }}>
          ⏳ 补充中：{progress ? `已完成 ${progress.finished}/${progress.total} 片` : "任务排队中…"}
        </div>
      )}

      {/* 失败 */}
      {phase === "failed" && failure && (
        <div style={{ fontSize: 12, color: "#b91c1c" }}>
          ❌ {failureGuide(failure)}
          <button style={{ ...btn, marginLeft: 8, border: "1px solid #d1d5db" }} onClick={reset}>重试</button>
        </div>
      )}

      {/* 结果预览（扩展区预览 + 采纳/撤销） */}
      {phase === "done" && result && (
        <div>
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", padding: 8, fontSize: 11, fontFamily: "monospace", marginBottom: 6, whiteSpace: "pre-wrap" }}>
            {result.enrichedMarkdown.slice(-800)}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ ...btn, background: "#7c3aed", color: "#fff", border: "none" }} onClick={() => void apply()}>
              ✅ 采纳（应用补充）
            </button>
            <button style={btn} onClick={() => void revert()}>撤销（还原补充前）</button>
            <button style={btn} onClick={reset}>放弃预览</button>
          </div>
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: msg.startsWith("已") ? "#0d9488" : "#dc2626", marginTop: 4 }}>{msg}</div>}
    </div>
  );
}
