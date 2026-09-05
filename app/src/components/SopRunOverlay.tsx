/**
 * SopRunOverlay — SOP 执行器（v0.20.3 / REQ-296）。
 *
 * @ai-context: 双模式执行（READ-DO 单步引导 / DO-CONFIRM 总览核对——顶栏切换，
 *              差异=确认模式一次呈现全部步骤供核对）；步骤快照来自模板行范围
 *              （正文可复跑）；每步 ✓完成 / ✗失败(原因) / ⏭跳过；结束→结算页：
 *              轨迹统计 + 保鲜 diff（"笔记有出入？"）+ 修订建议（纯本地聚合）。
 *              证据=可选相对路径输入（notes-images/ 前缀白名单——命令层校验；
 *              图片三入口落盘的完整上传流登记后置）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 响应结构（SopTemplate/SopRunStep/SopRun/SopRunDetail 均 serde camelCase——字段须 camel 读取） */
interface SopTemplateView {
  id: number;
  noteId: number;
  name: string;
  startLine: number;
  endLine: number;
  mode: string;
  noteTitle: string;
}
interface SopStepView {
  id: number;
  runId: number;
  stepNo: number;
  textSnapshot: string;
  status: string;
  evidencePath: string | null;
  failureNote: string | null;
  checkedAt: number | null;
}
interface SopRunView {
  id: number;
  templateId: number;
  noteId: number;
  templateName: string;
  mode: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
}
interface RunDetailView {
  run: SopRunView;
  steps: SopStepView[];
  stats: { done: number; skipped: number; failed: number; total: number };
  freshnessChanged: boolean;
}

interface Props {
  template: SopTemplateView;
  onClose: () => void;
  /** 结算/中止后通知（列表刷新） */
  onChanged?: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  zIndex: 1100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  width: 640,
  maxWidth: "92vw",
  maxHeight: "84vh",
  overflow: "auto",
  padding: 16,
  fontSize: 13,
};
const btn: React.CSSProperties = { padding: "4px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };
const okBtn: React.CSSProperties = { ...btn, background: "#0d9488", color: "#fff", border: "none" };
const ghostBtn: React.CSSProperties = { ...btn, background: "#fff", border: "1px solid #e5e7eb", color: "#374151" };

export default function SopRunOverlay({ template, onClose, onChanged }: Props) {
  const [stage, setStage] = useState<"run" | "settle">("run");
  const [detail, setDetail] = useState<RunDetailView | null>(null);
  const [confirmMode, setConfirmMode] = useState(template.mode === "confirm");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [failOpen, setFailOpen] = useState<number | null>(null);
  const [failNote, setFailNote] = useState("");
  const [evidenceByStep, setEvidenceByStep] = useState<Record<number, string>>({});

  const reloadDetail = async (runId: number) => {
    try {
      const d = await invoke<RunDetailView>("sop_run_detail", { runId });
      setDetail(d);
    } catch (e) {
      setErr(String(e));
    }
  };

  const begin = async () => {
    setBusy(true);
    setErr("");
    try {
      // 续跑语义：先查该模板进行中 run（status=active）→ 存在则直接加载其详情续跑，
      // 否则新建（防双开重复证据；后端拒绝路径在 catch 兜底引导）
      const runs = await invoke<SopRunView[]>("sop_run_list", { templateId: template.id });
      const active = runs.find((r) => r.status === "active");
      if (active) {
        await reloadDetail(active.id);
        return;
      }
      const runId = await invoke<number>("sop_run_start", { templateId: template.id });
      await reloadDetail(runId);
    } catch (e) {
      const raw = String(e);
      if (raw.includes("已有进行中")) {
        // 竞态（多窗/并发）：再查一次并直接续跑；不可得时引导「继续执行或中止」
        try {
          const runs = await invoke<SopRunView[]>("sop_run_list", { templateId: template.id });
          const active = runs.find((r) => r.status === "active");
          if (active) {
            await reloadDetail(active.id);
            return;
          }
        } catch {
          // 落入下方引导文案
        }
        setErr("该模板已有进行中的执行——请先结算或中止旧 run；重新进入本模板「▶ 执行」会自动续跑");
      } else {
        setErr(raw);
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepAction = async (stepNo: number, status: string) => {
    if (!detail) return;
    setBusy(true);
    setErr("");
    try {
      await invoke("sop_step_update", {
        runId: detail.run.id,
        stepNo,
        status,
        evidencePath: status === "done" ? (evidenceByStep[stepNo] ?? null) : null,
        failureNote: status === "failed" && failOpen === stepNo ? failNote.trim() || null : null,
      });
      setFailOpen(null);
      setFailNote("");
      await reloadDetail(detail.run.id);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (status: string) => {
    if (!detail) return;
    setBusy(true);
    try {
      const settled = await invoke<RunDetailView>("sop_run_finish", { runId: detail.run.id, status });
      setDetail(settled);
      setStage("settle");
      onChanged?.();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const pending = detail?.steps.filter((s) => s.status === "todo").length ?? 0;
  const modeLabel = confirmMode ? "总览核对（DO-CONFIRM）" : "逐步引导（READ-DO）";

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>🧭 {template.name}</h3>
          <span style={{ fontSize: 11, color: "#6b7280" }}>@{template.noteTitle}</span>
          <span style={{ fontSize: 11, color: "#0f766e", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, padding: "1px 8px" }}>
            {modeLabel}
          </span>
          <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={onClose}>
            关闭
          </button>
        </div>

        {err && <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>{err}</div>}
        {detail?.freshnessChanged && stage === "run" && (
          <div style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
            ⚠ 笔记正文与启动快照已有出入——结算时请对比修订模板（执行即保鲜）
          </div>
        )}

        {stage === "run" && detail && (
          <>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <button style={ghostBtn} onClick={() => setConfirmMode((m) => !m)} title="两种执行模式可随时切换">
                {confirmMode ? "切到逐步引导" : "切到总览核对"}
              </button>
              <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
                进行中 {detail.stats.done + detail.stats.failed + detail.stats.skipped}/{detail.stats.total} · 待办 {pending}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {detail.steps.map((s) => {
                const done = s.status === "done";
                const failed = s.status === "failed";
                const skipped = s.status === "skipped";
                return (
                  <div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", background: done ? "#ecfdf5" : failed ? "#fef2f2" : "#fff" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>步骤 {s.stepNo}</span>
                      <span style={{ fontSize: 13, color: "#111827", flex: 1 }}>{s.textSnapshot}</span>
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                        {done ? "✓" : failed ? "✗" : skipped ? "⏭" : s.status}
                      </span>
                    </div>
                    {!done && !failed && !skipped && (
                      <>
                        <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                          <button style={okBtn} disabled={busy} onClick={() => void stepAction(s.stepNo, "done")}>✓ 完成</button>
                          <button style={ghostBtn} disabled={busy} onClick={() => void stepAction(s.stepNo, "skipped")}>⏭ 跳过</button>
                          <button style={{ ...ghostBtn, color: "#dc2626" }} disabled={busy} onClick={() => { setFailOpen(failOpen === s.stepNo ? null : s.stepNo); setFailNote(""); }}>✗ 失败</button>
                        </div>
                        {failOpen === s.stepNo && (
                          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            <input autoFocus placeholder="失败原因（建议记录可观测信号差在哪）" value={failNote} onChange={(e) => setFailNote(e.target.value)} style={{ flex: 1, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px" }} />
                            <button style={okBtn} disabled={busy} onClick={() => void stepAction(s.stepNo, "failed")}>记录失败</button>
                          </div>
                        )}
                        {s.status === "todo" && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>证据路径（notes-images/…，可选）：</span>
                            <input
                              value={evidenceByStep[s.stepNo] ?? ""}
                              onChange={(e) => setEvidenceByStep((m) => ({ ...m, [s.stepNo]: e.target.value }))}
                              placeholder="notes-images/xxx.png"
                              style={{ flex: 1, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px" }}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button style={okBtn} disabled={busy || pending > 0} onClick={() => void finish("done")}>
                ✅ 结算（完成）
              </button>
              <button style={{ ...ghostBtn, color: "#b45309" }} disabled={busy} onClick={() => void finish("aborted")}>
                ⏹ 中止并归档
              </button>
              {pending > 0 && <span style={{ fontSize: 11, color: "#b45309" }}>还有 {pending} 步未处理（可先处理或中止）</span>}
            </div>
          </>
        )}

        {stage === "settle" && detail && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              {detail.run.status === "done" ? "✅ run 已完成并归档入史" : "⏹ run 已中止归档"}
            </div>
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
              轨迹：✓完成 {detail.stats.done} · ⏭跳过 {detail.stats.skipped} · ✗失败 {detail.stats.failed}（共 {detail.stats.total} 步）
            </div>
            {detail.freshnessChanged && (
              <div style={{ fontSize: 12, color: "#b45309", marginBottom: 6 }}>
                📝 笔记正文有出入——可对比快照修订模板段落（编辑即模板，无双写）
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button style={okBtn} onClick={onClose}>返回</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
