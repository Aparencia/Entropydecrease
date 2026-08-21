/**
 * LiveProfileStrip — 采集态视频档案条（v0.9.0 验收缺陷修复）。
 *
 * @ai-context: 采集时右栏由 LiveActivityPanel 独占、档案卡（ProfileDetector）
 *              被隐藏——但 M2（REQ-189）引入"会话中画面档每 2-3 分钟自动重评"
 *              后档位成为采集中动态信息，且降档需用户裁决。本组件在采集态
 *              常显档案摘要（形态×画面档×领域），并接线 live:tier-changed /
 *              live:tier-downgrade-request → confirm_tier_downgrade，
 *              补齐 M2 前端断链（此前降档请求无人应答，降档永不生效）。
 * @ai-context: 形态/领域挂载时重跑 detect_video_profile（与档案卡同源同口径，
 *              确定性本地检测；失败静默——档位信息不依赖它）；档位挂载拉取
 *              live_session_status.tier（事件可能早于挂载——session-info 同款
 *              拉取兜底模式）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DOMAIN_OPTIONS, FORM_LABELS, KIND_TO_FORM, TIER_LABELS } from "./ProfileDetector";
import type { ContentForm, DetectResult, DomainDetection, VisualTier } from "../types";

/** 升档提示停留时长（ms）——简要设计：瞬时提示不占常驻空间 */
const NOTE_TTL_MS = 3000;

/** tier-changed 事件载荷（Rust serde_json 结构） */
interface TierChangedPayload {
  tier: string;
  reason: "upgrade-silent" | "downgrade-confirmed";
}

/** 降档请求事件载荷（Rust serde_json 结构；from=当前档，to=建议档） */
interface TierDowngradeRequest {
  from: string | null;
  to: string;
}

/** 领域 kind → 中文展示名（DOMAIN_OPTIONS 同源；未命中兜底原文） */
function domainLabel(kind: string): string {
  return DOMAIN_OPTIONS.find(([k]) => k === kind)?.[1] ?? kind;
}

export default function LiveProfileStrip({ windowTitle }: { windowTitle: string | null }) {
  const [form, setForm] = useState<ContentForm | null>(null);
  const [domain, setDomain] = useState<DomainDetection | null>(null);
  const [tier, setTier] = useState<VisualTier | null>(null);
  // 档位变化提示（升档静默 → 短暂可见化；降档确认后由 tier-changed 同步）
  const [note, setNote] = useState<string | null>(null);
  // 降档确认条（建议档；null=无待确认）
  const [downgrade, setDowngrade] = useState<VisualTier | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 提示计时器句柄（后到提示清除前一个定时器——防旧 timer 提前清掉新提示）
  const noteTimer = useRef<number | null>(null);
  // 档位镜像（事件闭包读最新档位——首次定档判定用，审查 M2）
  const tierRef = useRef<VisualTier | null>(null);
  // 已忽略的降档建议档（保持现状——后端每采样 tick 重发，按建议档去重防重复弹条，审查 M1）
  const dismissedRef = useRef<VisualTier | null>(null);

  // 档位事件：升档静默可见化；降档请求 → 确认条（幂等去重）。
  // 审查 L1：监听先于挂载拉取注册——事件落在（快照、监听）间隙会丢失
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<TierChangedPayload>("live:tier-changed", (e) => {
        const t = e.payload.tier as VisualTier;
        // 首次定档（此前未定档）不是升档——不展示升档文案（审查 M2）
        const isInitial = tierRef.current === null;
        tierRef.current = t;
        setTier(t);
        setDowngrade(null); // 档位已变化（含降档确认后），确认条使命完成
        dismissedRef.current = null; // 档位已变，降档可重新询问
        if (e.payload.reason === "upgrade-silent" && !isInitial) {
          setNote(`画面档已自动升为「${TIER_LABELS[t] ?? t}档」`);
          if (noteTimer.current) window.clearTimeout(noteTimer.current);
          noteTimer.current = window.setTimeout(() => setNote(null), NOTE_TTL_MS);
        }
      }),
      listen<TierDowngradeRequest>("live:tier-downgrade-request", (e) => {
        // 幂等：同一降档请求重复询问不重复弹（保持现状后按建议档去重；审查 M1）
        const to = e.payload.to as VisualTier;
        if (dismissedRef.current !== to) setDowngrade(to);
      }),
      // 停止过渡期清空确认条（confirm 命令要求活动会话，停止后必失败——审查 L2）
      listen<string>("live:status", (e) => {
        if (e.payload === "stopped") {
          setDowngrade(null);
          dismissedRef.current = null;
        }
      }),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
      if (noteTimer.current) window.clearTimeout(noteTimer.current);
    };
  }, []);

  // 挂载：档位拉取兜底（事件可能早于本组件挂载——同 session-info 模式）；
  // 形态/领域重跑检测（与档案卡同口径，窗口标题确定性输入）
  useEffect(() => {
    void invoke<{ tier: string | null }>("live_session_status")
      .then((s) => {
        if (s.tier) {
          const t = s.tier as VisualTier;
          tierRef.current = t;
          setTier(t);
        }
      })
      .catch(() => undefined);
    if (!windowTitle) return;
    let cancelled = false;
    void invoke<DetectResult>("detect_video_profile", { title: windowTitle, platformTags: [] })
      .then((r) => {
        if (cancelled) return;
        const top = r.candidates[0]?.kind;
        setForm(r.memory_form ?? (top ? (KIND_TO_FORM[top] ?? null) : null));
        if (r.domain?.kind || r.domain?.fine_tags?.length) setDomain(r.domain);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [windowTitle]);

  /** 确认降档：写入共享 override → worker 下轮检测消费并 retune；档位由
   *  随后的 tier-changed 事件同步（乐观关闭确认条） */
  const confirmDowngrade = useCallback(async () => {
    if (!downgrade || busy) return;
    setBusy(true);
    setError("");
    try {
      await invoke("confirm_tier_downgrade", { tier: downgrade });
      setDowngrade(null);
    } catch (e) {
      setError(`降档确认失败: ${e}`);
    } finally {
      setBusy(false);
    }
  }, [downgrade, busy]);

  return (
    <div
      style={{
        borderBottom: "1px solid #e5e7eb",
        padding: "6px 14px",
        fontSize: 11,
        color: "#6b7280",
        flexShrink: 0,
      }}
    >
      {/* 常显档案摘要（采集态信息透明——形态×画面档×领域） */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span title="内容形态（采集前检测/记忆）">
          📋 {form ? FORM_LABELS[form] : "形态识别中"}
        </span>
        <span title="画面价值档（会话中自动重评：升档静默/降档确认）">
          🎨 画面 {tier ? `${TIER_LABELS[tier] ?? tier}档` : "未定档"}
        </span>
        <span title="内容领域（标题/平台信号；增强项）">
          🏷 {domain?.kind ? domainLabel(domain.kind) : "领域未定"}
        </span>
        {domain?.fine_tags?.length ? (
          <span style={{ color: "#9ca3af" }}>细标签：{domain.fine_tags.join(" / ")}</span>
        ) : null}
      </div>

      {/* 升档提示（瞬时，3s 自动消失） */}
      {note && <div style={{ color: "#0f766e", marginTop: 2 }}>↑ {note}</div>}

      {/* 降档确认条（降采样可能丢信息——用户裁决；保持=下轮重评再询） */}
      {downgrade && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
            background: "#fffbeb",
            border: "1px solid #f59e0b",
            borderRadius: 6,
            padding: "4px 8px",
          }}
        >
          <span style={{ color: "#b45309" }}>画面价值降低，是否降为「{TIER_LABELS[downgrade] ?? downgrade}档」？</span>
          <button
            onClick={() => void confirmDowngrade()}
            disabled={busy}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              cursor: busy ? "default" : "pointer",
              border: "none",
              borderRadius: 4,
              background: "#b45309",
              color: "#fff",
            }}
          >
            {busy ? "确认中…" : "确认降档"}
          </button>
          <button
            onClick={() => {
              // 保持现状：记录已忽略的建议档（后端每采样 tick 重发——同档不再弹条，审查 M1）
              dismissedRef.current = downgrade;
              setDowngrade(null);
            }}
            disabled={busy}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              cursor: busy ? "default" : "pointer",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              background: "#fff",
            }}
          >
            保持现状
          </button>
        </div>
      )}
      {error && <div style={{ color: "#dc2626", marginTop: 2 }}>{error}</div>}
    </div>
  );
}
