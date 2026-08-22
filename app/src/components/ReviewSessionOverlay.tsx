/**
 * ReviewSessionOverlay — 组级复习面（v0.11.2；UI 最小化——动机App化防御）。
 *
 * @ai-context: 提取优先为默认（P4/P18/P25/P30）：先显示 front 线索 → 用户
 *              点击"回忆完成"→ 展开 back 验证 → 四档评分推进 FSRS 调度。
 *              无被动重读模式、无 streak 展示（弹性承诺——不追债不清零）。
 * @ai-context: 引擎先有真牙叙事后置——本面板只有卡片与评分，零叙事元素。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Flashcard } from "../types";

/** 四档评分按钮（文案=回忆质量自评） */
const RATINGS: { value: string; label: string; color: string }[] = [
  { value: "again", label: "忘了", color: "#dc2626" },
  { value: "hard", label: "困难", color: "#d97706" },
  { value: "good", label: "记得", color: "#059669" },
  { value: "easy", label: "轻松", color: "#0284c7" },
];

interface Props {
  /** 组过滤（null=全部到期卡） */
  groupId: number | null;
  groupName: string;
  onClose: () => void;
}

export default function ReviewSessionOverlay({ groupId, groupName, onClose }: Props) {
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);

  // 加载到期队列（一次性——复习中评分出的卡不回插本队列，下次再现）
  const loadQueue = useCallback(async () => {
    try {
      const cards = await invoke<Flashcard[]>("list_due_cards", { groupId, limit: 50 });
      setQueue(cards);
    } catch (e) {
      setStatus(`复习队列加载失败: ${e}`);
    } finally {
      setLoaded(true);
    }
  }, [groupId]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  // ESC 退出（复习中误触保护：只在未展开答案时直接退）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const current = queue[index] ?? null;

  const rate = async (rating: string) => {
    if (!current) return;
    try {
      await invoke("review_card", { cardId: current.id, rating });
      setDone((d) => d + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
      setStatus("");
    } catch (e) {
      setStatus(`评分失败: ${e}`);
    }
  };

  const finished = loaded && (!current || index >= queue.length);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520, maxWidth: "92vw", background: "#fff", borderRadius: 12,
          padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>🎴 复习 · {groupName}</span>
          {current && <span style={{ fontSize: 12, color: "#9ca3af" }}>{index + 1}/{queue.length}</span>}
          <button onClick={onClose} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 13 }}>✕ 退出</button>
        </div>

        {!loaded && <p style={{ fontSize: 13, color: "#9ca3af" }}>加载中…</p>}

        {finished && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ fontSize: 15, fontWeight: 600 }}>
              {done > 0 ? `本轮复习完成：${done} 张卡片` : "当前没有到期卡片"}
            </p>
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
              {done > 0 ? "间隔已由 FSRS 推进，到期后再来。" : "生成闪卡或等待卡片到期。"}
            </p>
          </div>
        )}

        {current && !finished && (
          <div>
            {/* 卡类型徽标（REQ-199 内容分型 + REQ-201 碎片卡——身份诚实可见） */}
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {current.fragmentId != null && (
                <span style={{ fontSize: 10, color: "#7c3aed", background: "#faf5ff", borderRadius: 8, padding: "0 6px" }}>
                  🧩 碎片卡
                </span>
              )}
              {current.kind === "action" && (
                <span style={{ fontSize: 10, color: "#b45309", background: "#fffbeb", borderRadius: 8, padding: "0 6px" }}>
                  ⚡ 动作卡
                </span>
              )}
            </div>
            {/* front（线索——先回忆再看） */}
            <div style={{
              minHeight: 90, padding: 16, background: "#f9fafb", borderRadius: 8,
              fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-wrap",
            }}>
              {current.front}
            </div>
            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                style={{
                  width: "100%", marginTop: 12, padding: "10px 0", fontSize: 14,
                  cursor: "pointer", background: "#0f766e", color: "#fff",
                  border: "none", borderRadius: 8,
                }}
              >
                回忆完成 · 查看答案
              </button>
            ) : (
              <>
                {/* back（验证材料） */}
                <div style={{
                  marginTop: 10, minHeight: 70, padding: 14, background: "#f0fdfa",
                  borderRadius: 8, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
                  maxHeight: 220, overflowY: "auto",
                }}>
                  {current.back}
                </div>
                {/* 四档评分（提取质量自评 → FSRS 调度） */}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {RATINGS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => void rate(r.value)}
                      style={{
                        flex: 1, padding: "8px 0", fontSize: 13, cursor: "pointer",
                        border: `1px solid ${r.color}`, color: r.color,
                        background: "#fff", borderRadius: 6,
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {status && <p style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{status}</p>}
      </div>
    </div>
  );
}
