/**
 * PracticeQuestionsOverlays — 🎯 练习条目 & ❓ 问题清单轻量面（v0.20.3 / REQ-299/300）。
 *
 * @ai-context: 与行动中心同遮罩形态的嵌套 Overlay（打开即用，零新导航）：
 *              练习=内建习得行动（打点入完成史 practice_tick，宽容缺勤）；
 *              问题=Me 问题化（open/answered/archived + 答沉淀回链——供输出创作
 *              前翻看与复盘）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 响应结构（PracticeItem/QuestionItem 均 serde camelCase——字段须 camel 读取） */
interface PracticeView {
  id: number;
  noteId: number | null;
  kbConceptId: number | null;
  text: string;
  frequency: string;
  goal: string | null;
  mastery: number | null;
  nextDue: number | null;
  status: string;
}
interface QuestionView {
  id: number;
  noteId: number | null;
  kbConceptId: number | null;
  text: string;
  context: string | null;
  status: string;
  answerRef: string | null;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  zIndex: 1150,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  width: 560,
  maxWidth: "92vw",
  maxHeight: "80vh",
  overflow: "auto",
  padding: 16,
  fontSize: 13,
};
const btn: React.CSSProperties = { padding: "4px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };
const okBtn: React.CSSProperties = { ...btn, background: "#0d9488", color: "#fff", border: "none" };
const ghostBtn: React.CSSProperties = { ...btn, background: "#fff", border: "1px solid #e5e7eb", color: "#374151" };

function shell(title: string, subtitle: string, onClose: () => void, children: React.ReactNode) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{subtitle}</span>
          <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={onClose}>关闭</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PracticeOverlay({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<PracticeView[]>([]);
  const [text, setText] = useState("");
  const [freq, setFreq] = useState<"daily" | "manual">("manual");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const reload = useCallback(async () => {
    try {
      setErr("");
      setItems(await invoke<PracticeView[]>("practice_list", { status: "active" }));
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async () => {
    if (!text.trim()) return;
    try {
      await invoke("practice_create", { text: text.trim(), frequency: freq, goal: null });
      setText("");
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const tick = async (item: PracticeView) => {
    try {
      await invoke("practice_tick", { itemId: item.id, mastery: null });
      setMsg(`🎯 已打点：${item.text}（daily 型推到明天；manual 型不造伪死线）`);
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const dueCount = items.filter((i) => i.nextDue != null && i.nextDue <= Math.floor(Date.now() / 1000)).length;

  return shell("🎯 练习条目", `该练了 ${dueCount} · 闪卡之外第二条复利曲线（宽容缺勤只记史）`, onClose, (
    <>
      {msg && <div style={{ fontSize: 11, color: "#047857", marginBottom: 6 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 6 }}>{err}</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="练习什么？（如：哑铃弯举 3×12）" style={{ flex: 1, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, padding: "4px 6px" }} />
        <select value={freq} onChange={(e) => setFreq(e.target.value as "daily" | "manual")} style={{ fontSize: 12 }}>
          <option value="daily">daily（每日）</option>
          <option value="manual">manual（手动）</option>
        </select>
        <button style={okBtn} onClick={() => void create()}>新建</button>
      </div>
      {items.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: 12 }}>暂无练习条目——把「需要周期练」的行动内建为练习条目</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <div key={it.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, flex: 1 }}>{it.text}</span>
              <span style={{ fontSize: 10.5, color: "#9ca3af" }}>
                {it.frequency === "daily" ? "每日" : "手动"}
                {it.mastery != null ? ` · 熟练 ${it.mastery}/5` : ""}
                {it.nextDue != null ? ` · 下次 ${new Date(it.nextDue * 1000).toLocaleDateString()}` : ""}
              </span>
              <button style={okBtn} onClick={() => void tick(it)}>🎯 打点</button>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>打点入完成史（practice_tick）——练习曲线由史聚合；缺勤不追债不清零。</p>
    </>
  ));
}

export function QuestionsOverlay({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<QuestionView[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [answerFor, setAnswerFor] = useState<number | null>(null);
  const [answerRef, setAnswerRef] = useState("");

  const reload = useCallback(async () => {
    try {
      setErr("");
      const all = await invoke<QuestionView[]>("question_list", { status: null });
      setItems(all);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async () => {
    if (!text.trim()) return;
    try {
      await invoke("question_create", { text: text.trim(), noteId: null, context: null });
      setText("");
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const answer = async (q: QuestionView) => {
    try {
      await invoke("question_answer", { id: q.id, answerRef: answerRef.trim() || null });
      setAnswerFor(null);
      setAnswerRef("");
      setMsg("✓ 已标记已答（答沉淀处回链已记）");
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const archive = async (q: QuestionView) => {
    try {
      await invoke("question_set_status", { id: q.id, status: "archived" });
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const open = items.filter((q) => q.status === "open");
  const answered = items.filter((q) => q.status === "answered");

  return shell("❓ 问题清单", "Me 洞见问题化——open/answered/archived（输出创作前翻看/复盘原料）", onClose, (
    <>
      {msg && <div style={{ fontSize: 11, color: "#047857", marginBottom: 6 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 6 }}>{err}</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="记下一个值得回答的问题…" style={{ flex: 1, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, padding: "4px 6px" }} />
        <button style={okBtn} onClick={() => void create()}>添加</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {open.map((q) => (
          <div key={q.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, flex: 1 }}>❓ {q.text}</span>
              <button style={ghostBtn} onClick={() => setAnswerFor(answerFor === q.id ? null : q.id)}>已答</button>
              <button style={{ ...ghostBtn, color: "#9ca3af" }} onClick={() => void archive(q)}>归档</button>
            </div>
            {answerFor === q.id && (
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <input autoFocus value={answerRef} onChange={(e) => setAnswerRef(e.target.value)} placeholder="答沉淀处回链（笔记 id/卡 id，可空）" style={{ flex: 1, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px" }} />
                <button style={okBtn} onClick={() => void answer(q)}>确认</button>
              </div>
            )}
          </div>
        ))}
        {open.length === 0 && answered.length === 0 && (
          <p style={{ color: "#9ca3af", fontSize: 12 }}>暂无问题——学习中的疑问随手记下，答沉淀后归档（可转复习卡出口规划中）</p>
        )}
      </div>
      {answered.length > 0 && (
        <>
          <h4 style={{ fontSize: 12, margin: "10px 0 4px", color: "#0f766e" }}>已答（{answered.length}）</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {answered.map((q) => (
              <div key={q.id} style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 6 }}>
                <span>✓ {q.text}</span>
                {q.answerRef && <span style={{ fontSize: 10.5, color: "#9ca3af" }}>→ {q.answerRef}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  ));
}
