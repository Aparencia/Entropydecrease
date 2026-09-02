/**
 * GoalsPage — 独立「🎯 目标」Tab（意图层独立视图；零叙事元素）。
 *
 * @ai-context: 规格 §十——卡片单行折叠（列表是导航不是仪表盘），明细全部在
 *              详情页；空态给出领域热词推荐。双入口（访谈默认 / 快速记一下）
 *              是同一 InterviewDialog 的两种展开（优化评审 #4）。
 * @ai-context: 进度信号现算（每次刷新 list_goals 现算聚合）——目标层零进度副本。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GoalCardView } from "../types/goals";
import GoalCard from "../components/GoalCard";
import GoalDetail from "../components/GoalDetail";
import InterviewDialog from "../components/InterviewDialog";

const HOT_DOMAINS = ["学 Python", "练听力", "画水彩"];

export default function GoalsPage() {
  const [cards, setCards] = useState<GoalCardView[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [dialog, setDialog] = useState<{ mode: "interview" | "quick"; name?: string } | null>(null);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const cs = await invoke<GoalCardView[]>("list_goals");
      setCards(cs);
      setErr("");
    } catch (e) {
      setErr(`目标列表加载失败: ${e}`);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    invoke<{ id: number; name: string }[]>("list_note_groups", { terrain: "container" })
      .then(setGroups)
      .catch((e) => setErr(`组列表加载失败: ${e}`));
  }, [load]);

  const onCreated = () => {
    setDialog(null);
    void load();
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🎯 目标</span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>意图层——把素材串成可毕业的目标</span>
        <button data-testid="open-interview" onClick={() => setDialog({ mode: "interview" })} style={primaryBtn}>＋ 新建目标（访谈）</button>
        <button data-testid="open-quick" onClick={() => setDialog({ mode: "quick" })} style={ghostBtn}>只想简单记一下</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ width: 380, overflow: "auto", padding: 12, borderRight: "1px solid #e5e7eb", boxSizing: "border-box", flexShrink: 0 }}>
          {err && <p style={{ fontSize: 12, color: "#dc2626" }}>{err}</p>}
          {loaded && cards.length === 0 && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px" }}>定一个学习目标——不是「我要学 xx」，是「用它做什么」。</p>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                领域热词推荐：
                {HOT_DOMAINS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setDialog({ mode: "interview", name: h })}
                    style={{ ...ghostBtn, margin: "0 4px" }}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
          {cards.map((c) => (
            <GoalCard key={c.goal.id} card={c} onClick={() => setSelectedId(c.goal.id)} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedId != null ? (
            <GoalDetail
              goalId={selectedId}
              onChanged={() => void load()}
              onDeleted={() => { setSelectedId(null); void load(); }}
            />
          ) : (
            <div style={{ padding: 32, fontSize: 13, color: "#9ca3af" }}>← 选择一个目标查看详情（周契约/组徽标/弱项/里程碑都在这里）</div>
          )}
        </div>
      </div>

      {dialog && (
        <InterviewDialog
          mode={dialog.mode}
          groups={groups}
          initialName={dialog.name}
          onClose={() => setDialog(null)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid #0f766e", background: "#0f766e", color: "#fff", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#4b5563", cursor: "pointer" };
