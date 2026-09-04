/**
 * LearningLibraryPanel — 设置页「学习库」段（v0.19 REQ-258/REQ-260/REQ-262）。
 *
 * @ai-context: 检索与发现层的治理面：①引擎状态如实展示（FTS5 恒可用；
 *              embedding v0.19.5 起按引擎槽与回填态展示——诚实不装）；②「学习
 *              库问答生成」开关 + 预算档位（双闸门之二，默认关——命中列表
 *              不受其约束）；③索引统计/全量重建（脏源/失败角标可见 + 重建兜
 *              底；进度经 Channel 事件流——与聊天流同构）；④v0.19.5（REQ-259/
 *              REQ-262）：本地语义引擎治理整块迁至 LearningLibraryEngineSection
 *              （低4 审查拆分——状态/下载/加载/就绪徽标自管，本面板行数回归）。
 */
import { useCallback, useEffect, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { AiSettingsView } from "../types/ai";
import type { KbIndexStats, KbReindexEvent } from "../types/kb";
import LearningLibraryEngineSection from "./LearningLibraryEngineSection";

const TIERS = [
  { id: "light", label: "轻量（~4K）" },
  { id: "standard", label: "标准（~10K，推荐）" },
  { id: "deep", label: "深度（~30K）" },
];

export default function LearningLibraryPanel({ active = true }: { active?: boolean }) {
  const [qaEnabled, setQaEnabled] = useState(false);
  const [tier, setTier] = useState("standard");
  // v0.19.3（REQ-261/262）：相关素材建议（发现路径）开关——feature_flags 持久化
  const [discoveryEnabled, setDiscoveryEnabled] = useState(false);
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
      try {
        const f = await invoke<{ feedCapture: boolean; kbDiscovery: boolean }>("get_feature_flags");
        setDiscoveryEnabled(f.kbDiscovery);
      } catch (e) {
        setMsg({ kind: "err", text: `功能开关读取失败: ${e}` });
      }
    })();
    void loadStats();
  }, [loadStats]);

  // 轻量轮询（审查 L2 修复）：设置页随应用常驻挂载（display:none 不卸载）——
  // 轮询只在页面可见时运行（对齐 SessionsPage active 门控先例；进入设置页即
  // 启动首轮，离开即停——索引随保存演进，统计静默自新，COUNT 级毫秒成本）
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void loadStats(), 8000);
    return () => clearInterval(timer);
  }, [active, loadStats]);

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

  // v0.19.3（REQ-261/262）：相关素材建议开关（feature_flags 持久化；建议制·默认关）
  const saveDiscovery = async (nextEnabled: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      await invoke("set_feature_flag", { name: "kb_discovery", value: nextEnabled });
      setDiscoveryEnabled(nextEnabled);
      setMsg({
        kind: "ok",
        text: nextEnabled
          ? "已开启——概念详情出现「📎 相关素材建议」，勾选确认后经引用通道落库"
          : "已关闭——本地检索与学习库问答不受影响",
      });
    } catch (e) {
      setMsg({ kind: "err", text: `开关保存失败: ${e}` });
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
      {/* 引擎状态（如实——FTS5 恒可用；语义引擎按槽位/回填态展示） */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6, fontSize: 12 }}>
        <span style={{ color: "#047857", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: "1px 8px" }}>
          ✓ 本地词法引擎（FTS5）就绪
        </span>
        {stats?.embeddingReady ? (
          <span style={{ color: "#047857", background: "#ecfdf5", borderRadius: 10, padding: "1px 8px" }}>✓ 语义检索已接入（{stats.engine}）</span>
        ) : (
          <span style={{ color: "#6b7280", background: "#f3f4f6", borderRadius: 10, padding: "1px 8px" }} title="下载模型并加载后全量重建即回填向量">
            ○ 语义检索未回填（当前词法精度）
          </span>
        )}
      </div>

      {/* 本地语义引擎治理（低4 拆分：状态/下载/加载/msg 自管于独立组件——
          面板只留语义徽标行 stats.embeddingReady 于上方原处） */}
      <LearningLibraryEngineSection />

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

      {/* v0.19.3（REQ-261）：相关素材建议开关（建议制·默认关——本地检索恒可用） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "#374151" }}>📎 相关素材建议</span>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            data-testid="kb-discovery-toggle"
            type="checkbox"
            checked={discoveryEnabled}
            disabled={busy}
            onChange={(e) => void saveDiscovery(e.target.checked)}
          />
          开启（默认关）
        </label>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          概念详情建议候选 · 勾选确认后经引用通道落库（建议零双写）
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
