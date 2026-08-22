/**
 * WeekContractCard — 周契约卡（v0.11.4 REQ-200；弹性承诺呈现层）。
 *
 * @ai-context: P31+N10 的 UI 落点——契约是用户自设本周目标，不是打卡 KPI：
 *              无 streak、无惩罚、欠账不追（后端 review_logs 无 streak 字段）。
 *              本卡只呈现"承诺 vs 实际"两个数字 + 最小可行日徽标（N9/N11
 *              低谷生存的最轻形态：本周完成 ≥3 卡即成立，一天崩坏不否定整周）。
 * @ai-context: 断签不清零视觉——进度按本周（周一零点起）独立计算，下周归零
 *              重来，无连续记录展示；周界（weekStart UTC 秒）转本地日期展示。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WeekContractStatus } from "../types";

interface Props {
  groupId: number;
}

/** UTC 秒 → 本地日期短格式（周界展示用；epoch 前防御性回退空串） */
function formatWeekStart(utcSecs: number): string {
  if (!utcSecs) return "";
  const d = new Date(utcSecs * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 简单进度条（宽度百分比 0..100 有界） */
function bar(ratio: number): React.CSSProperties {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return {
    width: `${pct}%`,
    height: 6,
    background: pct >= 100 ? "#059669" : "#0f766e",
    borderRadius: 3,
    transition: "width 0.3s",
  };
}

export default function WeekContractCard({ groupId }: Props) {
  const [status, setStatus] = useState<WeekContractStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(3);
  const [cards, setCards] = useState(15);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await invoke<WeekContractStatus>("week_contract_status", { groupId });
      setStatus(s);
      if (s.contract) {
        setDays(s.contract.targetDays);
        setCards(s.contract.targetCards);
      }
      setErr("");
    } catch (e) {
      setErr(`周契约加载失败: ${e}`);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await invoke<unknown>("upsert_week_contract", { groupId, targetDays: days, targetCards: cards });
      setEditing(false);
      await load();
    } catch (e) {
      setErr(`契约保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const c = status?.contract ?? null;
  const dayRatio = status && c ? status.actualDays / c.targetDays : 0;
  const cardRatio = status && c ? status.actualCards / c.targetCards : 0;

  return (
    <div style={{ marginTop: 8, padding: 8, background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: "#374151", fontSize: 12 }}>📅 周契约</span>
        {status?.minimalDayMet && (
          <span style={{ fontSize: 10, color: "#047857", background: "#ecfdf5", borderRadius: 8, padding: "0 5px" }}>
            ✓ 本周成立
          </span>
        )}
        {status && (
          <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>
            本周自 {formatWeekStart(status.weekStart)} 起
          </span>
        )}
      </div>

      {/* 未立约：设定表单 */}
      {!c && !editing && (
        <div>
          <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 6px" }}>
            给自己一个本周目标——断签不清零，欠账不追。
          </p>
          <button
            onClick={() => setEditing(true)}
            style={{ fontSize: 11, cursor: "pointer", padding: "2px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}
          >
            ✍ 设定本周目标
          </button>
        </div>
      )}

      {/* 设定/修改表单 */}
      {editing && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ fontSize: 11, padding: "2px 4px", border: "1px solid #e5e7eb", borderRadius: 4 }}
            title="本周承诺复习天数"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>{d} 天</option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={200}
            value={cards}
            onChange={(e) => setCards(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 64, fontSize: 11, padding: "2px 4px", border: "1px solid #e5e7eb", borderRadius: 4 }}
            title="本周承诺复习卡数"
          />
          <span style={{ fontSize: 11, color: "#6b7280" }}>卡/周</span>
          <button
            onClick={() => void save()}
            disabled={saving}
            style={{ fontSize: 11, cursor: "pointer", padding: "2px 10px", borderRadius: 4, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}
          >
            {saving ? "保存中…" : c ? "✓ 改目标" : "✓ 立约"}
          </button>
          <button
            onClick={() => { setEditing(false); if (c) { setDays(c.targetDays); setCards(c.targetCards); } }}
            style={{ fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}
          >
            取消
          </button>
        </div>
      )}

      {/* 已立约：承诺 vs 实际（断签不清零——进度按周独立） */}
      {status && c && !editing && (
        <div>
          <div style={{ margin: "2px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280" }}>
              <span>天数 {status.actualDays}/{c.targetDays}</span>
              <span>卡数 {status.actualCards}/{c.targetCards}</span>
            </div>
            <div style={{ background: "#f3f4f6", borderRadius: 3, marginTop: 2 }}>
              <div style={bar(dayRatio)} />
            </div>
            <div style={{ background: "#f3f4f6", borderRadius: 3, marginTop: 2 }}>
              <div style={bar(cardRatio)} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>弹性承诺：无连续打卡 · 断签不清零</span>
            <button
              onClick={() => setEditing(true)}
              style={{ marginLeft: "auto", fontSize: 10, cursor: "pointer", padding: "1px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}
            >
              改目标
            </button>
          </div>
        </div>
      )}

      {err && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{err}</p>}
    </div>
  );
}
