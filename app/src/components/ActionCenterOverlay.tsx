/**
 * ActionCenterOverlay — ✅ 行动中心（v0.20.3 / REQ-293/294/298）。
 *
 * @ai-context: 裁决漏斗（不留死尸的机制是裁决不是自动清理）：待办分区
 *              逾期(标红)/计划日/搁置/待提炼，行操作 ✓完成 · 📅改期 · ⤴迁出
 *              （剪贴板复制 todo.txt 行——保底三件套之复制面；文件/邮件与
 *              scheme 通道由导出命令面补足）· ✗放弃(留一行原因)；完成史页签
 *              展示统一证据流（周回顾原料/成长轨迹）。
 * @ai-context: 全部操作走 commands_tasks 命令族——正文回写收敛于 tasks_core
 *              原子层；操作后重载本面板（列表即真相；笔记域广播驱动阅读侧）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import SopRunOverlay from "./SopRunOverlay";
import { PracticeOverlay, QuestionsOverlay } from "./PracticeQuestionsOverlays";

interface SopTemplateView {
  id: number;
  note_id: number;
  name: string;
  start_line: number;
  end_line: number;
  mode: string;
  note_title: string;
}

interface ActionRow {
  id: number;
  note_id: number;
  line_no: number;
  text: string;
  status: string;
  unrefined: boolean;
  plan_date: number | null;
  disposition: string | null;
  note_title: string;
}

interface HistoryRow {
  id: number;
  ts: number;
  event_type: string;
  source_type: string;
  source_id: number | null;
  note_id: number | null;
  text: string;
  note: string | null;
  meta_json: string | null;
}

interface Props {
  onClose: () => void;
  /** 数据变化回调（NotesPage 列表刷新等） */
  onChanged?: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  width: 780,
  maxWidth: "94vw",
  maxHeight: "84vh",
  overflow: "auto",
  padding: 16,
  fontSize: 13,
};
const btn: React.CSSProperties = { padding: "4px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", color: "#374151" };
const okBtn: React.CSSProperties = { ...btn, background: "#0d9488", color: "#fff", border: "none" };
const dangerBtn: React.CSSProperties = { ...btn, color: "#dc2626" };
const ghostBtn: React.CSSProperties = { ...btn };

const TYPE_LABEL: Record<string, string> = {
  done: "✓ 完成",
  abandoned: "✗ 放弃",
  exported: "⤴ 迁出",
  export_manual_done: "⤴ 回填完成",
  practice_tick: "🎯 练习打点",
  sop_run: "🧭 SOP 执行",
};

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ActionCenterOverlay({ onClose, onChanged }: Props) {
  const [tab, setTab] = useState<"queue" | "history" | "sop">("queue");
  // SOP 库（模板/新建/执行——REQ-296）
  const [templates, setTemplates] = useState<SopTemplateView[]>([]);
  const [notes, setNotes] = useState<{ id: number; title: string }[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<SopTemplateView | null>(null);
  // v0.20.3（REQ-299/300）：练习/问题轻量面（嵌套 Overlay）
  const [showPractice, setShowPractice] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [sopNoteId, setSopNoteId] = useState<number | null>(null);
  const [sopName, setSopName] = useState("");
  const [sopStart, setSopStart] = useState("0");
  const [sopEnd, setSopEnd] = useState("0");
  const [suggestions, setSuggestions] = useState<Record<number, string[]>>({});
  // v0.20.3（REQ-294）：批量周回顾（选中执行/放弃——batch_weekly_resolve 单事务）
  const [batchMode, setBatchMode] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [batchReason, setBatchReason] = useState("");

  const toggleChecked = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runBatch = async (action: "done" | "abandon") => {
    const candidates = [...overdue, ...planned, ...rows];
    const decisions = candidates
      .filter((r) => checked.has(r.id) && !r.unrefined)
      .map((r) => ({ rowId: r.id, action, reason: action === "abandon" ? batchReason.trim() || null : null }));
    if (decisions.length === 0) {
      setErr("请先勾选要批决议的任务行");
      return;
    }
    try {
      const view = await invoke<{ done: number; abandoned: number; failed: string[] }>(
        "batch_weekly_resolve",
        { decisions },
      );
      setMsg(`⚖ 周回顾批提交完成：执行 ${view.done} · 放弃 ${view.abandoned}${view.failed.length > 0 ? ` · 失败 ${view.failed.length} 条（${view.failed[0]}）` : ""}`);
      setChecked(new Set());
      setBatchReason("");
      setBatchMode(false);
      onChanged?.();
      const [o, p, s, u, h] = await Promise.all([
        fetchTab("overdue"),
        fetchTab("planned"),
        fetchTab("someday"),
        fetchTab("unrefined"),
        invoke<HistoryRow[]>("completion_history_list", { eventType: null, limit: 150 }),
      ]);
      setOverdue(o); setPlanned(p); setRows(s); setUnrefined(u); setHistory(h);
    } catch (e) {
      setErr(String(e));
    }
  };
  // 裁决队列（四分区同拉全量行，前端按 tab 分区展示——逾期标红/计划/搁置/提炼）
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const reasonRef = useRef("");

  const reload = useCallback(async () => {
    try {
      setErr("");
      const [q, h] = await Promise.all([
        invoke<ActionRow[]>("list_action_queue", { tab: "someday", noteId: null }),
        invoke<HistoryRow[]>("completion_history_list", { eventType: null, limit: 150 }),
      ]);
      setRows(q);
      setHistory(h);
    } catch (e) {
      setErr(`加载失败: ${e}`);
    }
  }, []);

  // 队列四分区拉取（逾期/计划/搁置/待提炼）
  const fetchTab = useCallback(async (t: "overdue" | "planned" | "someday" | "unrefined") => {
    try {
      const r = await invoke<ActionRow[]>("list_action_queue", { tab: t, noteId: null });
      return r;
    } catch (e) {
      setErr(`队列加载失败: ${e}`);
      return [] as ActionRow[];
    }
  }, []);

  const [overdue, setOverdue] = useState<ActionRow[]>([]);
  const [planned, setPlanned] = useState<ActionRow[]>([]);
  const [unrefined, setUnrefined] = useState<ActionRow[]>([]);

  useEffect(() => {
    void (async () => {
      const [o, p, s, u] = await Promise.all([
        fetchTab("overdue"),
        fetchTab("planned"),
        fetchTab("someday"),
        fetchTab("unrefined"),
      ]);
      setOverdue(o);
      setPlanned(p);
      setRows(s);
      setUnrefined(u);
    })();
    void reload();
    void loadSop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTab, reload]);

  const loadSop = useCallback(async () => {
    try {
      const [t, n] = await Promise.all([
        invoke<SopTemplateView[]>("sop_template_list", { noteId: null }),
        invoke<{ id: number; title: string }[]>("list_notes"),
      ]);
      setTemplates(t);
      setNotes(n);
      if (sopNoteId == null && n.length > 0) setSopNoteId(n[0].id);
    } catch (e) {
      setErr(`SOP 库加载失败: ${e}`);
    }
  }, [sopNoteId]);

  const createTemplate = async () => {
    const start = Number.parseInt(sopStart, 10);
    const end = Number.parseInt(sopEnd, 10);
    if (sopNoteId == null) { setErr("请先选择笔记"); return; }
    if (!sopName.trim()) { setErr("请输入模板名"); return; }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      setErr("行范围非法（0 起整数，end ≥ start）");
      return;
    }
    try {
      await invoke("sop_template_create", { noteId: sopNoteId, name: sopName.trim(), startLine: start, endLine: end, mode: null });
      setSopName("");
      setMsg(`✓ 模板「${sopName.trim()}」已创建（段落行引用，编辑正文即编辑模板）`);
      await loadSop();
    } catch (e) {
      setErr(String(e));
    }
  };

  const fetchSuggestions = async (templateId: number) => {
    try {
      const list = await invoke<string[]>("sop_revision_suggestions", { templateId });
      setSuggestions((m) => ({ ...m, [templateId]: list }));
    } catch (e) {
      setErr(String(e));
    }
  };

  const deleteTemplate = async (t: SopTemplateView) => {
    try {
      await invoke("sop_template_delete", { templateId: t.id });
      setMsg(`已删除模板「${t.name}」（正文未动）`);
      await loadSop();
    } catch (e) {
      setErr(String(e));
    }
  };

  const afterMutate = async (info?: string) => {
    if (info) setMsg(info);
    onChanged?.();
    const [o, p, s, u, h] = await Promise.all([
      fetchTab("overdue"),
      fetchTab("planned"),
      fetchTab("someday"),
      fetchTab("unrefined"),
      invoke<HistoryRow[]>("completion_history_list", { eventType: null, limit: 150 }),
    ]);
    setOverdue(o);
    setPlanned(p);
    setRows(s);
    setUnrefined(u);
    setHistory(h);
  };

  const complete = async (id: number) => {
    setBusy(true);
    try {
      const m = await invoke<string>("task_complete", { rowId: id });
      await afterMutate(m);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const abandon = async (id: number) => {
    setBusy(true);
    try {
      const m = await invoke<string>("task_abandon", { rowId: id, reason: reasonFor === id ? reasonRef.current.trim() || null : null });
      setReasonFor(null);
      reasonRef.current = "";
      await afterMutate(m);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const refineUnrefined = async (id: number) => {
    try {
      const m = await invoke<string>("task_refine_unrefined", { rowId: id });
      await afterMutate(m);
    } catch (e) {
      setErr(String(e));
    }
  };

  const planTomorrow = async (id: number) => {
    try {
      const tomorrow = Math.floor(Date.now() / 1000 / 86400) * 86400 + 86400;
      await invoke("task_set_plan_date", { rowId: id, planDate: tomorrow });
      await afterMutate("📅 已改期至明天（计划日只入索引，正文零污染）");
    } catch (e) {
      setErr(String(e));
    }
  };

  /** 迁出=放手：复制 todo.txt 行到剪贴板（保底三件套之复制面） */
  const exportCopy = async (r: ActionRow) => {
    try {
      const line = `[ ] ${r.text} (via:${r.note_title})`;
      await navigator.clipboard.writeText(line);
      setMsg(`⤴ 已复制 todo.txt 行（外部完成后可到完成史手动回填）：${line}`);
    } catch (e) {
      setErr(`复制失败: ${e}`);
    }
  };

  const renderRow = (r: ActionRow, overdueFlag: boolean) => (
    <div key={r.id} style={{ border: overdueFlag ? "1px solid #fca5a5" : "1px solid #e5e7eb", background: overdueFlag ? "#fff7f7" : "#fff", borderRadius: 6, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: "#111827", flex: 1 }}>{r.text}</span>
        <span style={{ fontSize: 10.5, color: "#9ca3af" }}>@{r.note_title}</span>
        {overdueFlag && <span style={{ fontSize: 10.5, color: "#dc2626", fontWeight: 600 }}>逾期</span>}
      </div>
      {reasonFor === r.id && (
        <div style={{ display: "flex", gap: 4 }}>
          <input
            autoFocus
            placeholder="放弃原因（留档不追问）"
            defaultValue={reasonRef.current}
            onChange={(e) => { reasonRef.current = e.target.value; }}
            style={{ flex: 1, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px" }}
          />
          <button style={okBtn} onClick={() => void abandon(r.id)}>确认放弃</button>
          <button style={btn} onClick={() => setReasonFor(null)}>取消</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button style={{ ...okBtn, fontSize: 11 }} disabled={busy} onClick={() => void complete(r.id)}>✓ 完成</button>
        <button style={{ ...btn, fontSize: 11 }} onClick={() => void planTomorrow(r.id)}>📅 明天</button>
        <button style={{ ...btn, fontSize: 11 }} title="🎴 转闪卡（规划中——先置灰提示）" disabled>🎴 转卡</button>
        <button style={{ ...btn, fontSize: 11 }} onClick={() => void exportCopy(r)}>⤴ 迁出</button>
        <button style={{ ...dangerBtn, fontSize: 11 }} onClick={() => { setReasonFor(r.id); }}>✗ 放弃</button>
      </div>
    </div>
  );

  const empty = (text: string) => (
    <p style={{ fontSize: 12, color: "#9ca3af", padding: "8px 2px" }}>{text}</p>
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>✅ 行动中心</h3>
          <div style={{ marginLeft: 12, display: "flex", gap: 4 }}>
            {(
              [
                ["queue", `裁决队列（${overdue.length + planned.length + rows.length + unrefined.length}）`],
                ["history", `完成史（${history.length}）`],
                ["sop", `SOP 库（${templates.length}）`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  ...btn,
                  borderRadius: 6,
                  border: tab === k ? "1px solid #0d9488" : "1px solid #e5e7eb",
                  background: tab === k ? "#ccfbf1" : "#fff",
                  color: tab === k ? "#0f766e" : "#374151",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 12, display: "flex", gap: 4 }}>
            <button style={{ ...btn, borderRadius: 6, border: "1px solid #7c3aed", background: "#f5f3ff", color: "#6d28d9" }} onClick={() => setShowPractice(true)}>
              🎯 练习
            </button>
            <button style={{ ...btn, borderRadius: 6, border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8" }} onClick={() => setShowQuestions(true)}>
              ❓ 问题
            </button>
          </div>
          <button style={{ ...btn, marginLeft: "auto" }} onClick={onClose}>关闭</button>
        </div>

        {msg && <div style={{ fontSize: 12, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>{msg}</div>}
        {err && <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>{err}</div>}

        {tab === "queue" ? (
          <>
            {/* v0.20.3（REQ-294）：周回顾批裁决（不留死尸——裁决机制批量面） */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <button style={ghostBtn} onClick={() => setBatchMode((m) => !m)} data-testid="weekly-batch-toggle">
                {batchMode ? "退出批量（⚖ 周回顾）" : "⚖ 批量裁决（周回顾）"}
              </button>
              {batchMode && (
                <>
                  <input value={batchReason} onChange={(e) => setBatchReason(e.target.value)} placeholder="放弃原因（批量放弃共用，可空）" style={{ fontSize: 12, width: 200, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px" }} />
                  <button style={okBtn} disabled={checked.size === 0} onClick={() => void runBatch("done")}>
                    ⚖ 执行选中（{checked.size}）
                  </button>
                  <button style={{ ...ghostBtn, color: "#dc2626" }} disabled={checked.size === 0} onClick={() => void runBatch("abandon")}>
                    ✗ 放弃选中（留因）
                  </button>
                </>
              )}
            </div>
            {batchMode && (
              <div style={{ border: "1px dashed #c4b5fd", borderRadius: 8, padding: 6, marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {[...overdue, ...planned, ...rows].filter((r) => !r.unrefined).length === 0 && (
                  <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>当前无可批决议的 todo 行</p>
                )}
                {[...overdue, ...planned, ...rows]
                  .filter((r) => !r.unrefined)
                  .map((r) => (
                    <label key={r.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, cursor: "pointer", padding: "2px 4px", borderRadius: 4, background: checked.has(r.id) ? "#f5f3ff" : "transparent" }}>
                      <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleChecked(r.id)} />
                      <span style={{ color: "#111827" }}>{r.text}</span>
                      <span style={{ fontSize: 10.5, color: "#9ca3af", marginLeft: "auto" }}>@{r.note_title}</span>
                    </label>
                  ))}
              </div>
            )}
            <h4 style={{ fontSize: 12.5, margin: "6px 0 4px", color: "#dc2626" }}>逾期（{overdue.length}）</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {overdue.length === 0 ? empty("无逾期——裁决是机制不是自动清理") : overdue.map((r) => renderRow(r, true))}
            </div>
            <h4 style={{ fontSize: 12.5, margin: "10px 0 4px", color: "#374151" }}>计划日（{planned.length}）</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {planned.length === 0 ? empty("无排期任务") : planned.map((r) => renderRow(r, false))}
            </div>
            <h4 style={{ fontSize: 12.5, margin: "10px 0 4px", color: "#374151" }}>搁置（{rows.length}）</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.length === 0 ? empty("无搁置任务——未排期的任务在此候裁") : rows.map((r) => renderRow(r, false))}
            </div>
            <h4 style={{ fontSize: 12.5, margin: "10px 0 4px", color: "#7c3aed" }}>待提炼（{unrefined.length} · 产物遗留 ☑️ 行）</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {unrefined.length === 0 ? empty("无待提炼产物行") : unrefined.map((r) => (
                <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 8px", display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, flex: 1 }}>☑️ {r.text}</span>
                  <span style={{ fontSize: 10.5, color: "#9ca3af" }}>@{r.note_title}</span>
                  <button style={{ ...okBtn, fontSize: 11 }} onClick={() => void refineUnrefined(r.id)}>提炼为任务行</button>
                </div>
              ))}
            </div>
          </>
        ) : tab === "history" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {history.length === 0 ? empty("暂无完成记录——完成即证据，周回顾原料在此沉淀") : history.map((h) => (
              <div key={h.id} style={{ display: "flex", gap: 8, fontSize: 12, borderBottom: "1px solid #f3f4f6", padding: "4px 2px" }}>
                <span style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtDate(h.ts)}</span>
                <span style={{ color: h.event_type === "abandoned" ? "#dc2626" : "#0f766e", flexShrink: 0, width: 90 }}>
                  {TYPE_LABEL[h.event_type] ?? h.event_type}
                </span>
                <span style={{ flex: 1, color: "#374151" }}>{h.text}</span>
                {h.note && <span style={{ fontSize: 11, color: "#9ca3af" }}>因：{h.note}</span>}
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* SOP 库：模板行范围引用 + 执行（REQ-296） */}
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
              <b>SOP 模板（{templates.length}）</b>{" "}
              <span style={{ color: "#9ca3af", fontSize: 11 }}>模板=笔记段落行范围引用（编辑正文即编辑模板，无双写）；执行=步骤快照跑 run</span>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>新建：</span>
                <select value={sopNoteId ?? undefined} onChange={(e) => setSopNoteId(Number(e.target.value))} style={{ fontSize: 12, maxWidth: 180 }}>
                  {notes.map((n) => <option key={n.id} value={n.id}>{n.title.slice(0, 18)}</option>)}
                </select>
                <input value={sopName} onChange={(e) => setSopName(e.target.value)} placeholder="模板名" style={{ fontSize: 12, width: 110, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px" }} />
                <span style={{ fontSize: 11, color: "#9ca3af" }}>行</span>
                <input value={sopStart} onChange={(e) => setSopStart(e.target.value)} style={{ fontSize: 12, width: 44, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px" }} />
                <span style={{ fontSize: 11, color: "#9ca3af" }}>–</span>
                <input value={sopEnd} onChange={(e) => setSopEnd(e.target.value)} style={{ fontSize: 12, width: 44, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px" }} />
                <button style={okBtn} onClick={() => void createTemplate()}>创建</button>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                行号 0 起（标题=0）；空行自动跳过；超 50 步拒绝。编辑器内选中段落生成入口在笔记工具栏接线（同款命令）。
              </div>
            </div>
            {templates.length === 0 ? (
              <p style={{ fontSize: 12, color: "#9ca3af" }}>暂无 SOP 模板——选中笔记步骤段落（行范围）即可创建</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {templates.map((t) => (
                  <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#111827" }}>{t.name}</span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>@{t.note_title} · 行 {t.start_line}–{t.end_line} · {t.mode === "confirm" ? "总览核对" : "逐步引导"}</span>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button style={okBtn} onClick={() => setActiveTemplate(t)}>▶ 执行</button>
                        <button style={ghostBtn} onClick={() => void fetchSuggestions(t.id)}>💡 修订建议</button>
                        <button style={{ ...ghostBtn, color: "#dc2626" }} onClick={() => void deleteTemplate(t)}>删除</button>
                      </span>
                    </div>
                    {(suggestions[t.id]?.length ?? 0) > 0 && (
                      <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>
                        {suggestions[t.id].map((s, i) => <div key={i}>💡 {s}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
          勾选任务行即被自动收录；产物 ☑️ 行可在上方「待提炼」区一键转标准任务行；🎴 转卡为规划中出口（G7 预留）。SOP run 完成自动入完成史。
        </p>
        {/* v0.20.3（REQ-296）：SOP 执行器（嵌套 Overlay——覆盖本面板） */}
        {activeTemplate && (
          <SopRunOverlay
            template={activeTemplate}
            onClose={() => setActiveTemplate(null)}
            onChanged={() => { void loadSop(); onChanged?.(); }}
          />
        )}
        {/* v0.20.3（REQ-299/300）：练习/问题轻量面 */}
        {showPractice && <PracticeOverlay onClose={() => setShowPractice(false)} />}
        {showQuestions && <QuestionsOverlay onClose={() => setShowQuestions(false)} />}
      </div>
    </div>
  );
}
