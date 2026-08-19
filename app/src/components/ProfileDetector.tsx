/**
 * ProfileDetector — 视频类型档案检测卡（v0.5.0 M1，REQ-043 混合检测）。
 *
 * @ai-context: 会话开始前展示"检测为：网课（可改）"——选择窗口后自动检测（标题信号
 *              + 记忆偏好），置信度低/信号冲突时才需要用户确认（可改下拉始终可用）；
 *              用户确认/修改后写入记忆偏好（同窗口标题下次直接生效）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DetectResult, ProfileKind, VideoProfile } from "../types";

const KIND_LABELS: Record<ProfileKind, string> = {
  lecture: "网课",
  "hands-on": "实操",
  "talking-head": "口播",
  interview: "访谈",
  meeting: "会议",
  podcast: "播客/有声书",
  live: "直播",
  whiteboard: "白板",
  "game-tutorial": "游戏教程",
  exercise: "题目讲解",
  "follow-along": "跟练",
  coding: "编程实战",
};

const ALL_KINDS: ProfileKind[] = [
  "lecture",
  "hands-on",
  "talking-head",
  "interview",
  "meeting",
  "podcast",
  "live",
  "whiteboard",
  "game-tutorial",
  "exercise",
  "follow-along",
  "coding",
];

export default function ProfileDetector({
  windowTitle,
  onProfileChange,
}: {
  windowTitle: string | null;
  /** 档案变化回调（父组件用于 start_live_session 携带 profile） */
  onProfileChange?: (kind: ProfileKind) => void;
}) {
  const [result, setResult] = useState<DetectResult | null>(null);
  const [selected, setSelected] = useState<ProfileKind>("lecture");
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<VideoProfile[]>([]);

  // 档案列表（只读展示当前配置；一次加载）
  useEffect(() => {
    void invoke<VideoProfile[]>("video_profiles")
      .then(setProfiles)
      .catch((e) => setError(`档案加载失败: ${e}`));
  }, []);

  // 窗口标题变化 → 自动检测（标题信号 + 记忆偏好）
  useEffect(() => {
    if (!windowTitle) return;
    let cancelled = false;
    setDetecting(true);
    setError("");
    void invoke<DetectResult>("detect_video_profile", { title: windowTitle })
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        // 审查 M5 修复（v0.7.0 新增代码审查）：needs_confirmation=true（低置信/
        // 多候选）时**不自动预选**——原实现直接取 candidates[0] 并 onProfileChange，
        // 用户尚未确认档案已生效（"检测→确认闭环"被绕过）；仅高置信（无需确认）
        // 或记忆命中时自动生效。展示候选由用户确认后生效。
        if (!r.needs_confirmation) {
          const top = r.candidates[0]?.kind ?? "lecture";
          setSelected(top);
          onProfileChange?.(top);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(`档案检测失败: ${e}`);
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowTitle]);

  /** 用户确认/修改档案（写入记忆偏好，同窗口标题下次直接生效） */
  const confirmProfile = useCallback(
    async (kind: ProfileKind) => {
      setSelected(kind);
      onProfileChange?.(kind);
      if (!windowTitle) return;
      setError("");
      try {
        await invoke("remember_video_profile", { title: windowTitle, kind });
        setResult((prev) =>
          prev
            ? { ...prev, candidates: [{ kind, score: 1 }], needs_confirmation: false, memory_hit: kind }
            : { candidates: [{ kind, score: 1 }], needs_confirmation: false, memory_hit: kind },
        );
      } catch (e) {
        setError(`记忆档案失败: ${e}`);
      }
    },
    [windowTitle],
  );

  if (!windowTitle) return null;
  const needConfirm = result?.needs_confirmation ?? false;
  const fromMemory = result?.memory_hit ?? null;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>视频类型档案（v0.5.0）</div>
      {detecting ? (
        <div style={{ fontSize: 11, color: "#9ca3af" }}>检测中…</div>
      ) : (
        <div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            检测为：
            {needConfirm ? (
              <span style={{ color: "#b45309" }}>（信号不足/冲突，请确认）</span>
            ) : fromMemory ? (
              <span style={{ color: "#0d9488" }}>（记忆偏好生效）</span>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {ALL_KINDS.map((kind) => (
              <button
                key={kind}
                onClick={() => void confirmProfile(kind)}
                style={{
                  padding: "3px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                  borderRadius: 4,
                  border: selected === kind ? "1px solid #0d9488" : "1px solid #e5e7eb",
                  background: selected === kind ? "#ccfbf1" : "#fff",
                  color: selected === kind ? "#0f766e" : "#374151",
                }}
              >
                {KIND_LABELS[kind]}
              </button>
            ))}
          </div>
          {result && result.candidates.length > 1 && (
            <div style={{ fontSize: 10, color: "#9ca3af" }}>
              候选：{result.candidates.map((c) => `${KIND_LABELS[c.kind]}(${(c.score * 100) | 0}%)`).join(" / ")}
            </div>
          )}
          {profiles.length > 0 && (
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
              {profiles.find((p) => p.kind === selected)?.artifact_template ?? ""} 模板 · 采样档位{" "}
              {(() => {
                const b = profiles.find((p) => p.kind === selected)?.sampling_budget;
                return b ? `${b.subtitle_every}s/字幕 · ${b.full_every}s/全帧` : "";
              })()}
            </div>
          )}
          {error && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
