/**
 * ProfileDetector — 视频档案检测卡 v2（v0.9.0 M5，REQ-192 三维一体交互）。
 *
 * @ai-context: 四维解耦后检测卡展示三维（形态/画面/领域）——各自可点击下拉修改，
 *              修改即记忆（同标题/同系列下次直接生效）；置信不足维度高亮"待确认"；
 *              未知维度显示"识别中"（不阻塞会话开始）；档案卡不含"开始捕获"按钮
 *              （开始按钮归课堂助手采集控制区——用户裁决 2026-08-21）。
 * @ai-context: 询问门禁=错判代价：形态（产物模板错）低置信必问；画面价值
 *              （开始前默认中档）通常不问；领域（增强项）不问可改。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ContentForm,
  DetectResult,
  DomainDetection,
  DomainFineOption,
  ProfileKind,
  VideoProfile,
  VisualTier,
} from "../types";
// 审查修复（领域枚举漂移）：共享常量替换本地定义——与 Rust ALL_DOMAINS 20 类
// 同口径（新建组/改判共用），本地重复定义删除
import { DOMAIN_OPTIONS } from "../utils/domainOptions";

/** 形态标签映射（Rust ContentForm::label 同源） */
export const FORM_LABELS: Record<ContentForm, string> = {
  lecture: "讲授",
  "hands-on": "实操",
  explainer: "解说",
  dialog: "对话",
  exercise: "题目",
  coding: "代码",
  audio: "音频",
  meeting: "会议",
  live: "直播",
  narrative: "影视",
};

/** 画面档标签映射（Rust VisualTier::label 同源） */
export const TIER_LABELS: Record<VisualTier, string> = {
  rich: "高",
  medium: "中",
  low: "低",
  none: "无",
};

/** 全 10 形态（检测卡下拉选项；v0.13.6 形态展平 +3；自 FORM_LABELS 派生——单源，
 *  审查 L7 修复：原独立列表与 Object.keys(FORM_LABELS)（LiveProfileStrip 用）双写易漂移） */
const ALL_FORMS: ContentForm[] = Object.keys(FORM_LABELS) as ContentForm[];

/** 全 4 画面档（检测卡下拉选项） */
const ALL_TIERS: VisualTier[] = ["rich", "medium", "low", "none"];

/** 旧 13 类 → 新 10 形态映射（Rust ProfileKind::to_form 同源；unknown → null；
 *  v0.13.6：meeting/live 回归独立形态——不再折叠进对话/音频） */
export const KIND_TO_FORM: Partial<Record<ProfileKind, ContentForm>> = {
  lecture: "lecture",
  whiteboard: "lecture",
  "hands-on": "hands-on",
  "follow-along": "hands-on",
  "game-tutorial": "hands-on",
  "talking-head": "explainer",
  interview: "dialog",
  meeting: "meeting",
  exercise: "exercise",
  coding: "coding",
  podcast: "audio",
  live: "live",
};

/** 旧 13 类 → 默认画面档（Rust ProfileKind::default_tier 同源） */
const KIND_TO_TIER: Partial<Record<ProfileKind, VisualTier>> = {
  lecture: "medium",
  whiteboard: "rich",
  "hands-on": "medium",
  "follow-along": "rich",
  "game-tutorial": "rich",
  "talking-head": "low",
  interview: "low",
  meeting: "low",
  exercise: "rich",
  coding: "rich",
  podcast: "none",
  // v0.13.6：直播浅画面（OCR 待命——不再短路画面链）
  live: "low",
};

export default function ProfileDetector({
  windowTitle,
  onProfileChange,
}: {
  windowTitle: string | null;
  /** 档案变化回调（父组件用于 start_live_session 携带 profile——兼容 v1 通道） */
  onProfileChange?: (kind: ProfileKind) => void;
}) {
  const [result, setResult] = useState<DetectResult | null>(null);
  // v0.13.6（审查 L5）：onProfileChange 经 ref——回调标识变化不触发 detect effect 重跑
  const onProfileChangeRef = useRef(onProfileChange);
  useEffect(() => { onProfileChangeRef.current = onProfileChange; }, [onProfileChange]);
  // 三维状态（v2）：形态/画面/领域各自可调
  const [form, setForm] = useState<ContentForm | null>(null);
  const [tier, setTier] = useState<VisualTier>("medium");
  const [domain, setDomain] = useState<DomainDetection | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  // M3 诚实化：画面档修改的轻提示（仅本次会话生效——后端无 tier 记忆通道）
  const [tierNotice, setTierNotice] = useState("");
  const [profiles, setProfiles] = useState<VideoProfile[]>([]);
  // v0.13.6（REQ-220）：细目选项表（粗领域 → 细目列表；单一数据源 list_domain_fine）
  const [fineMap, setFineMap] = useState<Record<string, DomainFineOption[]>>({});
  // v0.13.6：已选细目 id（检测预选；用户 chips 可改；与 domain.kind 联动）
  const [fineSel, setFineSel] = useState<string[]>([]);

  // 档案列表（只读展示当前配置；一次加载）
  useEffect(() => {
    void invoke<VideoProfile[]>("video_profiles")
      .then(setProfiles)
      .catch((e) => setError(`档案加载失败: ${e}`));
    // 细目选项表（chips 源；失败静默——仅粗领域也可用，不阻塞）
    void invoke<Array<[string, DomainFineOption[]]>>("list_domain_fine")
      .then((rows) => setFineMap(Object.fromEntries(rows)))
      .catch(() => undefined);
  }, []);

  // 窗口标题变化 → 自动检测（标题信号 + 记忆偏好 + 平台/领域信号）
  useEffect(() => {
    if (!windowTitle) return;
    let cancelled = false;
    setDetecting(true);
    setError("");
    void invoke<DetectResult>("detect_video_profile", {
      title: windowTitle,
      platformTags: [],
    })
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        // 三维回填（v2）：形态=平台分区映射 > 记忆命中 > 候选首位映射（v0.13.6
        // REQ-221：影视/直播分区映射为最强检测信号）；画面档=默认中档
        // （开始前默认+诚实声明——REQ-189）；领域=检测结果（平台/标题来源）
        const top = r.candidates[0]?.kind ?? "unknown";
        const fromMemory = r.platform_form ?? r.memory_form ?? KIND_TO_FORM[top] ?? null;
        setForm(fromMemory);
        setTier(KIND_TO_TIER[top] ?? "medium");
        // 领域检测结果（detect_video_profile 内已含平台/标题领域检测）
        if (r.domain?.kind || r.domain?.fine_tags?.length || r.domain?.fine_ids?.length) {
          setDomain(r.domain);
          // v0.13.6：细目预选 = 检测 hits（curated id）
          setFineSel(r.domain?.fine_ids ?? []);
        } else {
          setDomain(null);
          setFineSel([]);
        }
        // 兼容 v1 通道：高置信/记忆命中自动生效（无确认门禁——形态低置信必问）
        if (!r.needs_confirmation && top !== "unknown") {
          onProfileChangeRef.current?.(top);
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

  /** 形态修改（错判代价最高——低置信必问由 needs_confirmation 驱动；修改即记忆） */
  const changeForm = useCallback(
    async (f: ContentForm) => {
      setForm(f);
      // 形态 → 兼容 v1 kind（代表旧类；start_live_session 走既有通道）
      const kind = formToKind(f);
      onProfileChangeRef.current?.(kind);
      if (!windowTitle) return;
      try {
        await invoke("remember_video_profile_form", { title: windowTitle, form: f });
        setError("");
      } catch (e) {
        setError(`记忆形态失败: ${e}`);
      }
    },
    [windowTitle],
  );

  /**
   * 画面档修改（默认中档通常不问；修改即生效——采样策略随档位切换）。
   * M3 诚实化：后端当前**无 tier 记忆通道**（remember_video_profile_form 只记形态），
   * 故此处不再调用该命令伪装记忆——仅本地生效并轻提示；
   * TODO(后端): 需新增如 remember_video_profile_tier 命令后才能跨会话记忆画面档。
   */
  const changeTier = useCallback((t: VisualTier) => {
    setTier(t);
    setError("");
    setTierNotice("画面档修改仅本次会话生效");
  }, []);

  /** 领域修改（增强项——不问可改；修改即记忆 v0.13.6：coarse+细目多选一起记） */
  const changeDomain = useCallback(
    async (d: DomainDetection | null, fineIds: string[]) => {
      setDomain(d);
      setFineSel(fineIds);
      if (!windowTitle || !d?.kind) return;
      // 审查 L2 修复：preheat 与 remember 相互独立（热词失败不阻断记忆写）
      let warmErr = "";
      try {
        // REQ-266（v0.20.1）：标题主题词随预热注入（后端 title_hotword_candidates 提取）
        await invoke("preheat_domain_hotwords", { kind: d.kind, fine: fineIds, title: windowTitle });
      } catch (e) {
        warmErr = `领域热词预热失败: ${e}`;
      }
      try {
        await invoke("remember_video_profile_domain", { title: windowTitle, coarse: d.kind, fine: fineIds });
      } catch (e) {
        setError(warmErr || `领域记忆失败: ${e}`);
        return;
      }
      setError(warmErr || "");
    },
    [windowTitle],
  );

  if (!windowTitle) return null;
  const needConfirm = result?.needs_confirmation ?? false;
  const fromMemory = result?.memory_hit ?? null;
  // v0.11.5（Task 5）：记忆与检测高置信冲突 → 检测为准 + 展示冲突提示（可手动修改）
  const conflictKind = result?.memory_conflict ?? null;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        视频档案（三维一体 · v0.9.0）
      </div>
      {detecting ? (
        <div style={{ fontSize: 11, color: "#9ca3af" }}>检测中…</div>
      ) : (
        <div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            检测为：
            {conflictKind ? (
              <span style={{ color: "#b45309" }}>
                （记忆「{KIND_TO_FORM[conflictKind] ?? conflictKind}」与检测冲突，已按检测结果——可手动修改）
              </span>
            ) : needConfirm ? (
              <span style={{ color: "#b45309" }}>（信号不足/冲突，请确认）</span>
            ) : fromMemory ? (
              <span style={{ color: "#0d9488" }}>（记忆偏好生效）</span>
            ) : null}
          </div>
          {/* 维度①：内容形态（10 类下拉——点击可调；v0.13.6 展平 +3） */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7280", width: 56 }}>形态</span>
            <select
              value={form ?? ""}
              onChange={(e) => {
                const f = e.target.value as ContentForm;
                if (f) void changeForm(f);
              }}
              style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4, border: "1px solid #d1d5db" }}
            >
              <option value="">识别中…</option>
              {ALL_FORMS.map((f) => (
                <option key={f} value={f}>
                  {FORM_LABELS[f]}
                </option>
              ))}
            </select>
            {needConfirm && form === null && (
              <span style={{ fontSize: 10, color: "#b45309" }}>待确认</span>
            )}
            {form === null && !needConfirm && (
              <span style={{ fontSize: 10, color: "#9ca3af" }}>识别中（不阻塞）</span>
            )}
          </div>
          {/* 维度②：画面价值（4 档下拉——默认中档+诚实声明） */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7280", width: 56 }}>画面</span>
            <select
              value={tier}
              onChange={(e) => void changeTier(e.target.value as VisualTier)}
              style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4, border: "1px solid #d1d5db" }}
            >
              {ALL_TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}档
                </option>
              ))}
            </select>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>会话中自动重评 · 升档静默/降档确认</span>
          </div>
          {/* M3 诚实化：画面档无后端记忆通道——明示仅本次会话生效 */}
          {tierNotice && (
            <div style={{ fontSize: 10, color: "#b45309", marginBottom: 6, marginLeft: 64 }}>{tierNotice}</div>
          )}
          {/* 维度③：内容领域（粗 20 下拉 + 细目多选 chips——不问可改；命中即预热 hotwords） */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7280", width: 56 }}>领域</span>
            <select
              value={domain?.kind ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                void changeDomain(
                  v ? { kind: v, fine_tags: [], fine_ids: [], source: "user", confidence: 1 } : null,
                  [],
                );
              }}
              style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4, border: "1px solid #d1d5db" }}
            >
              <option value="">未定（不阻塞）</option>
              {DOMAIN_OPTIONS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {/* 细目多选 chips（v0.13.6 REQ-220：curated 表——list_domain_fine 单一数据源；
              检测预选；0 个=仅粗领域合法（不阻塞）） */}
          {domain?.kind && (fineMap[domain.kind]?.length ?? 0) > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6, marginLeft: 64 }}>
              {fineMap[domain.kind]!.map((f) => {
                const on = fineSel.includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      const next = on ? fineSel.filter((x) => x !== f.id) : [...fineSel, f.id];
                      // 审查 L3 修复：chip 变更同步回写 domain.fine_ids（fineSel 唯一真源）
                      void changeDomain({ ...domain!, fine_ids: next }, next);
                    }}
                    style={{
                      fontSize: 11, padding: "1px 8px", borderRadius: 10, cursor: "pointer",
                      border: on ? "1px solid #0d9488" : "1px solid #d1d5db",
                      background: on ? "#f0fdfa" : "#fff", color: on ? "#0d9488" : "#6b7280",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}
          {domain?.fine_tags?.length ? (
            <div style={{ fontSize: 10, color: "#6b7280", marginLeft: 64, marginBottom: 6 }}>
              细标签（原始）：{domain.fine_tags.join(" / ")}
            </div>
          ) : null}
          {result && result.candidates.length > 1 && (
            <div style={{ fontSize: 10, color: "#9ca3af" }}>
              候选：{result.candidates.map((c) => `${KIND_TO_FORM[c.kind] ?? c.kind}(${(c.score * 100) | 0}%)`).join(" / ")}
            </div>
          )}
          {profiles.length > 0 && form && (
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
              {profiles.find((p) => p.kind === formToKind(form))?.artifact_template ?? ""} 模板 ·{" "}
              {(() => {
                const b = profiles.find((p) => p.kind === formToKind(form))?.sampling_budget;
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

/** 形态 → 兼容 v1 kind（代表旧类；Rust legacy_kind_for_form 同源） */
function formToKind(form: ContentForm): ProfileKind {
  switch (form) {
    case "lecture":
      return "lecture";
    case "hands-on":
      return "hands-on";
    case "explainer":
      return "talking-head";
    case "dialog":
      return "interview";
    case "exercise":
      return "exercise";
    case "coding":
      return "coding";
    case "audio":
      return "podcast";
    case "meeting":
      return "meeting";
    case "live":
      return "live";
    case "narrative":
      return "talking-head";
  }
}

