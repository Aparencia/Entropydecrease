/**
 * DiscoverySuggestSection — 概念「相关素材建议」（v0.19.3 REQ-261 发现路径）。
 *
 * @ai-context: 建议制·默认关：feature flag kb_discovery 关 → 本区不渲染（后端
 *              command 同步把关——后端不信前端隐藏）；开启后每次概念进入拉取
 *              kb_discovery_suggest：证据候选（排除已链接）逐条勾选 → 确认仅经
 *              既有 link_knowledge_target 落库（白名单 note/fragment，零迁移，
 *              幂等——建议零双写，ADR-024）；跨体系相似概念为提示型只展示。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { KbDiscoveryResult, KbHit } from "../types";
import { hitLabel } from "../utils/kbHits";

interface Props {
  systemId: number;
  conceptId: number;
  /** 落库成功回调（父层刷新引用/图谱） */
  onChanged: () => void;
}

interface Flags {
  feedCapture: boolean;
  kbDiscovery: boolean;
}

export default function DiscoverySuggestSection({ systemId, conceptId, onChanged }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [result, setResult] = useState<KbDiscoveryResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await invoke<KbDiscoveryResult>("kb_discovery_suggest", { conceptId });
      setResult(r);
      setSelected(new Set());
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }, [enabled, conceptId]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const f = await invoke<Flags>("get_feature_flags");
        if (disposed) return;
        setEnabled(f.kbDiscovery);
      } catch {
        if (!disposed) setEnabled(false);
      }
    })();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (enabled === true) void load();
    // 概念切换 → 清旧建议（enabled 常驻变化才拉取；依赖包含 enabled 防竞态陈旧）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, conceptId]);

  // 默认关 → 零噪音（设置 → 学习库开启后才出现）
  if (enabled === false || enabled === null) return null;

  const toggleHit = (h: KbHit) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(h.chunkId)) next.delete(h.chunkId);
      else next.add(h.chunkId);
      return next;
    });
  };

  const targetIdOf = (h: KbHit): number | null =>
    h.sourceKind === "note" ? h.noteId : h.sourceKind === "fragment" ? h.fragmentId : null;

  const confirmLink = async () => {
    if (selected.size === 0 || !result) return;
    setBusy(true);
    setMsg("");
    try {
      for (const chunkId of selected) {
        const h = result.evidence.find((x) => x.chunkId === chunkId);
        if (!h) continue;
        const tid = targetIdOf(h);
        if (tid == null) continue;
        await invoke("link_knowledge_target", {
          systemId,
          conceptId,
          targetType: h.sourceKind, // note|fragment（白名单内）
          targetId: tid,
        });
      }
      onChanged();
      setMsg(`已挂接 ${selected.size} 条引用——建议不落库，仅在确认后经引用通道落库`);
      await load();
    } catch (e) {
      setMsg(`挂接失败（部分成功需重试）: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="discovery-suggest" style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
        📎 相关素材建议
        <span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>
          本地检索候选 · 人工确认后经引用通道落库（零双写）
        </span>
      </div>
      <button onClick={() => void load()} disabled={busy} style={{ fontSize: 11, color: "#0d9488", cursor: "pointer", border: "none", background: "none", padding: 0 }}>
        {busy ? "计算中…" : result ? "⟳ 重新建议" : "🔍 生成建议"}
      </button>
      {result && (
        <>
          {result.evidence.length === 0 && (
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0" }}>
              暂无未挂接的候选素材——可先沉淀相关笔记/碎片再试
            </p>
          )}
          {result.evidence.map((h) => (
            <label
              key={h.chunkId}
              style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, padding: "3px 0", cursor: "pointer" }}
            >
              <input type="checkbox" checked={selected.has(h.chunkId)} onChange={() => toggleHit(h)} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "#0f766e" }}>{hitLabel(h)}</span>
                <span style={{ color: "#6b7280", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                  {(h.snippet ?? "").replace(/==/g, "")}
                </span>
              </span>
            </label>
          ))}
          {result.evidence.length > 0 && (
            <button
              data-testid="discovery-confirm"
              onClick={() => void confirmLink()}
              disabled={busy || selected.size === 0}
              style={{
                marginTop: 4,
                fontSize: 12,
                cursor: busy || selected.size === 0 ? "default" : "pointer",
                padding: "3px 12px",
                borderRadius: 6,
                border: "1px solid #0f766e",
                background: selected.size > 0 && !busy ? "#f0fdfa" : "#f9fafb",
                color: selected.size > 0 && !busy ? "#0f766e" : "#9ca3af",
              }}
            >
              确认挂接（{selected.size}）
            </button>
          )}
        </>
      )}
      {result && result.similar.length > 0 && (
        <div style={{ marginTop: 6, padding: "6px 8px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, fontSize: 11.5, color: "#92400e" }}>
          <div style={{ fontWeight: 600 }}>⚠ 可能与已有概念相似（跨体系提示——人工处置，不自动合并）</div>
          {result.similar.map((s) => (
            <div key={s.conceptId}>
              「{s.conceptName}」 · 体系「{s.systemName}」（{s.reason}）
            </div>
          ))}
        </div>
      )}
      {msg && <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0" }}>{msg}</p>}
    </div>
  );
}
