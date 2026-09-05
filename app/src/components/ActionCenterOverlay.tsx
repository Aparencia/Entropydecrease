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
  const [tab, setTab] = useState<"queue" | "history">("queue");
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
  }, [fetchTab, reload]);

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
          <button style={{ ...btn, marginLeft: "auto" }} onClick={onClose}>关闭</button>
        </div>

        {msg && <div style={{ fontSize: 12, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>{msg}</div>}
        {err && <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>{err}</div>}

        {tab === "queue" ? (
          <>
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
        ) : (
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
        )}
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
          勾选任务行即被自动收录；产物 ☑️ 行可在上方「待提炼」区一键转标准任务行；🎴 转卡为规划中出口（G7 预留）。
        </p>
      </div>
    </div>
  );
}
