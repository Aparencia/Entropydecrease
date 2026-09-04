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
import { useDbRefresh } from "../hooks/useDbRefresh";
import type { GoalCardView, GraduationReport } from "../types/goals";
import GoalCard from "../components/GoalCard";
import GoalDetail from "../components/GoalDetail";
import InterviewDialog from "../components/InterviewDialog";
import { ReportBody } from "../components/GraduateDialog";

const HOT_DOMAINS = ["学 Python", "练听力", "画水彩"];

export default function GoalsPage() {
  const [cards, setCards] = useState<GoalCardView[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [dialog, setDialog] = useState<{ mode: "interview" | "quick"; name?: string } | null>(null);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  // v0.18.1：毕业档案（快照永久保留——目标删除后仍可读；REQ-255/256）
  const [archives, setArchives] = useState<GraduationReport[]>([]);
  const [archiveOpen, setArchiveOpen] = useState<number | null>(null);

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

  // F8（0.19.4/5 审查）：毕业档案独立重取函数——毕业动作把目标移出 list_goals
  // 并新写快照，bus 回调只刷列表会漏掉档案区（毕业卡片不出现）；次要区降级
  const loadArchives = useCallback(() => {
    invoke<GraduationReport[]>("list_goal_graduations")
      .then(setArchives)
      .catch((e) => console.warn("[goal] 毕业档案加载失败（次要区降级）:", e));
  }, []);

  useEffect(() => {
    void load();
    invoke<{ id: number; name: string }[]>("list_note_groups", { terrain: "container" })
      .then(setGroups)
      .catch((e) => setErr(`组列表加载失败: ${e}`));
    loadArchives();
  }, [load, loadArchives]);

  // REQ-278（v0.19.4 §5）：data:goals-changed 常驻订阅——目标进度/里程碑由
  // Rust 侧推进后（他页/任务流）列表现算聚合需重取；常驻理由：隐藏期事件
  // 不漏收（切回即最新），防抖在 hook 内合并风暴。
  // F8：毕业档案与卡片列表一并刷新（毕业也是 goals 域变更）
  useDbRefresh(["goals"], () => { void load(); loadArchives(); });

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
          {/* v0.18.1：毕业档案——已毕业目标（含已删除者）的报告快照永久可读 */}
          {archives.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "#047857", marginBottom: 6 }}>🎓 毕业档案（{archives.length}）</div>
              {archives.map((r) => (
                <div key={r.goalId} style={{ marginBottom: 6 }}>
                  <button
                    data-testid={`archive-${r.goalId}`}
                    onClick={() => setArchiveOpen(archiveOpen === r.goalId ? null : r.goalId)}
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #a7f3d0", background: "#ecfdf5", color: "#047857", cursor: "pointer", width: "100%", textAlign: "left" }}
                  >
                    {r.goalName} · {new Date(r.graduatedAt * 1000).toISOString().slice(0, 10)} · 里程碑 {r.milestones.filter((m) => m.status === "done").length}/{r.milestones.reduce((n, m) => n + (m.status === "skipped" ? 0 : 1), 0)} · {r.reviewStats.reviewLogsTotal} 次复习
                  </button>
                  {archiveOpen === r.goalId && (
                    <div style={{ border: "1px solid #a7f3d0", borderRadius: 6, padding: 10, background: "#f7fdf9", marginTop: 4 }}>
                      <ReportBody report={r} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
