/**
 * LearningLibraryPanel — 设置页「学习库」段（v0.19 REQ-258/REQ-260/REQ-262）。
 *
 * @ai-context: 检索与发现层的治理面：①引擎状态如实展示（FTS5 恒可用；
 *              embedding v0.19.3 前恒"未接入"——诚实不装）；②「学习库问答
 *              生成」开关 + 预算档位（双闸门之二，默认关——命中列表不受
 *              其约束）；③索引统计/全量重建（脏源/失败角标可见 + 重建兜底；
 *              进度经 Channel 事件流——与聊天流同构，不做全局监听）。
 */
import { useCallback, useEffect, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { AiSettingsView } from "../types/ai";
import type { KbIndexStats, KbReindexEvent } from "../types/kb";

const TIERS = [
  { id: "light", label: "轻量（~4K）" },
  { id: "standard", label: "标准（~10K，推荐）" },
  { id: "deep", label: "深度（~30K）" },
];

export default function LearningLibraryPanel() {
  const [qaEnabled, setQaEnabled] = useState(false);
  const [tier, setTier] = useState("standard");
  const [stats, setStats] = useState<KbIndexStats | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setStats(await invoke<KbIndexStats>("kb_index_stats"));
    } catch (e) {
      setMsg({ kind: "err", text: `索引统计读取失败: ${e}` });
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const s = await invoke<AiSettingsView>("ai_get_settings");
        setQaEnabled(s.kbQaEnabled);
        setTier(s.kbQaTier || "standard");
      } catch (e) {
        setMsg({ kind: "err", text: `学习库设置读取失败: ${e}` });
      }
    })();
    void loadStats();
    // 轻量轮询：设置页常驻（display:none 不卸载）——索引随笔记/碎片保存演进，
    // 统计静默自新（COUNT 级查询，个人库毫秒级）
    const timer = setInterval(() => void loadStats(), 8000);
    return () => clearInterval(timer);
  }, [loadStats]);

  const saveQa = async (nextEnabled: boolean, nextTier: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await invoke("ai_set_kb_qa", { enabled: nextEnabled, tier: nextTier });
      setQaEnabled(nextEnabled);
      setTier(nextTier);
      setMsg({
        kind: "ok",
        text: nextEnabled
          ? "已开启——学习库问答会话的生成将附带本地命中片段（仅最小片段上云）"
          : "已关闭——命中片段列表照常可用（本地零成本）",
      });
    } catch (e) {
      setMsg({ kind: "err", text: `保存失败: ${e}` });
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setProgress({ done: 0, total: 0 });
    try {
      const channel = new Channel<KbReindexEvent>();
      channel.onmessage = (ev) => {
        if (ev.kind === "progress") {
          setProgress({ done: ev.done, total: ev.total });
        } else if (ev.kind === "done") {
          setProgress(null);
          void loadStats();
          setMsg({
            kind: ev.report.failed > 0 ? "err" : "ok",
            text:
              ev.report.failed > 0
                ? `重建完成：${ev.report.succeeded}/${ev.report.sourcesTotal} 成功，${ev.report.failed} 个失败（角标可见，可重试）`
                : `重建完成：${ev.report.succeeded} 个源全部成功`,
          });
        } else {
          setProgress(null);
          setMsg({ kind: "err", text: `重建失败: ${ev.message}` });
        }
      };
      await invoke("kb_reindex_all", { channel });
    } catch (e) {
      setProgress(null);
      setMsg({ kind: "err", text: `重建启动失败: ${e}` });
    } finally {
      setBusy(false);
    }
  };

  const needsRebuild =
    stats != null &&
    (stats.dirtySources > 0 || (stats.errorCount > 0 || stats.indexVersion !== stats.currentIndexVersion));

  return (
    <div data-testid="learning-library-panel" style={{ padding: 8 }}>
      {/* 引擎状态（如实——FTS5 恒可用；embedding 未接入不伪装） */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6, fontSize: 12 }}>
        <span style={{ color: "#047857", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: "1px 8px" }}>
          ✓ 本地词法引擎（FTS5）就绪
        </span>
        {stats?.embeddingReady ? (
          <span style={{ color: "#047857", background: "#ecfdf5", borderRadius: 10, padding: "1px 8px" }}>✓ 语义检索已接入</span>
        ) : (
          <span style={{ color: "#6b7280", background: "#f3f4f6", borderRadius: 10, padding: "1px 8px" }} title="语义检索接入属 v0.19.3（embedding 选型 spike 后）——当前按词法精度工作，能力如实">
            ○ 语义检索未接入（当前词法精度）
          </span>
        )}
      </div>

      {/* 生成开关 + 预算档位 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "#374151" }}>📚 学习库问答生成</span>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            data-testid="kb-qa-toggle"
            type="checkbox"
            checked={qaEnabled}
            disabled={busy}
            onChange={(e) => void saveQa(e.target.checked, tier)}
          />
          开启（默认关）
        </label>
        <select
          data-testid="kb-qa-tier"
          value={tier}
          disabled={busy || !qaEnabled}
          onChange={(e) => void saveQa(qaEnabled, e.target.value)}
          style={{ fontSize: 11, padding: "2px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}
        >
          {TIERS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          双闸门（AI 授权之上）；片段预算硬顶；命中列表恒可用
        </span>
      </div>

      {/* 索引统计 + 重建 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11, color: "#6b7280", marginTop: 6 }}>
        <span data-testid="kb-index-summary">
          {stats
            ? `块 ${stats.chunksTotal}（笔记 ${stats.noteChunks} / 碎片 ${stats.fragmentChunks}）· 源 ${stats.sourcesIndexed}/${stats.sourcesTotal}`
            : "统计加载中…"}
        </span>
        {stats?.reindexAllAt != null && (
          <span>上次全量重建 {new Date(stats.reindexAllAt * 1000).toLocaleString()}</span>
        )}
        {needsRebuild && (
          <span data-testid="kb-needs-rebuild" style={{ color: "#b45309", fontWeight: 600 }}>
            ⚠ 索引待重建{stats.dirtySources > 0 ? `（${stats.dirtySources} 个源未入块）` : ""}
            {stats.lastError ? `：${stats.lastError.slice(0, 60)}` : ""}
          </span>
        )}
        <button
          data-testid="kb-reindex-button"
          onClick={() => void rebuild()}
          disabled={busy}
          style={{ marginLeft: "auto", fontSize: 12, cursor: busy ? "wait" : "pointer", padding: "3px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151" }}
          title="按笔记与碎片全量重建派生索引（损坏/版本升级后一键修复）"
        >
          {progress ? `重建中 ${progress.done}/${progress.total}` : "🔄 全量重建"}
        </button>
      </div>
      {progress && progress.total > 0 && (
        <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, (progress.done / progress.total) * 100)}%`, background: "#0d9488", transition: "width 0.2s" }} />
        </div>
      )}
      {msg && <p style={{ fontSize: 11, color: msg.kind === "ok" ? "#047857" : "#dc2626", margin: "4px 0 0" }}>{msg.text}</p>}
    </div>
  );
}
