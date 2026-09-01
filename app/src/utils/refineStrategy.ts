/**
 * refineStrategy — 精修策略草稿纯函数（v0.17.0 REQ-245）。
 *
 * @ai-context: 发起对话框/设置页共用同一草稿形态：基准档位（presetId，
 *              intent 基准="intent:xxx"，无基准=""）+ 每维当前值（dims）。
 *              声明（meta）来自后端 ai_refine_strategy_meta——前端零硬编码；
 *              提交时转 StrategyOverride 传后端 resolve（非法值后端回退默认）。
 * @ai-context: 记忆=localStorage（知识补充九子项先例——上次选择恢复）；
 *              损坏/缺失回退设置偏好 > standard。
 */
import type {
  IntentPresetDef,
  LadderPresetDef,
  RefineStrategyMeta,
  RefineStrategyPrefs,
  StrategyOverride,
} from "../types";

export const REFINE_STRATEGY_STORAGE_KEY = "entropy.refine.strategy.v1";

/** 策略草稿（UI 状态） */
export interface StrategyDraft {
  /** 基准档位 id（intent 基准="intent:xxx"；无基准=""） */
  presetId: string;
  /** 每维当前值（key → value） */
  dims: Record<string, string>;
}

/** meta 各维默认值（无档位/存储时的兜底：standard） */
export function defaultsFromMeta(meta: RefineStrategyMeta | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of meta?.strategyDims ?? []) out[d.key] = d.default;
  return out;
}

/** 从全局偏好构建初始草稿（设置默认档位 + 逐维覆盖应用其上） */
export function draftFromPrefs(
  prefs: RefineStrategyPrefs | undefined,
  meta: RefineStrategyMeta | null,
): StrategyDraft {
  const presetId = prefs?.defaultLadder ?? "";
  const preset = meta?.ladderPresets.find((p) => p.id === presetId);
  const dims: Record<string, string> = {
    ...defaultsFromMeta(meta),
    ...(preset?.dimValues ?? {}),
    ...(prefs?.dimOverrides ?? {}),
  };
  return { presetId: preset ? presetId : "", dims };
}

/** 点击档位 → 该档组合为基准 */
export function applyPreset(draft: StrategyDraft, preset: LadderPresetDef): StrategyDraft {
  return { presetId: preset.id, dims: { ...draft.dims, ...preset.dimValues } };
}

/** 点击目标 chip → 意图组合为基准（presetId="intent:xxx"——不占档位语义） */
export function applyIntent(draft: StrategyDraft, intent: IntentPresetDef): StrategyDraft {
  return { presetId: `intent:${intent.id}`, dims: { ...draft.dims, ...intent.dimValues } };
}

/** 单维微调（基准档位保持——偏离徽标据此判定） */
export function applyDim(draft: StrategyDraft, key: string, value: string): StrategyDraft {
  return { presetId: draft.presetId, dims: { ...draft.dims, [key]: value } };
}

/** 自由输入 → 意图（本地关键词 contains 匹配；未命中 null——诚实提示不瞎猜） */
export function matchIntent(text: string, meta: RefineStrategyMeta | null): IntentPresetDef | null {
  const t = text.trim().toLowerCase();
  if (!t || !meta) return null;
  return (
    meta.intents.find((i) => i.keywords.some((k) => t.includes(k))) ?? null
  );
}

/** 偏离徽标：当前草稿是否偏离基准组合（基准=默认值+档位预设组合——
 * 未在预设中声明的维以声明默认计；无基准/全组合相同 → false） */
export function isDeviating(draft: StrategyDraft, meta: RefineStrategyMeta | null): boolean {
  if (!draft.presetId || !meta) return false;
  let base: Record<string, string>;
  if (draft.presetId.startsWith("intent:")) {
    const intent = meta.intents.find((i) => `intent:${i.id}` === draft.presetId);
    if (!intent) return false;
    base = intent.dimValues;
  } else {
    const preset = meta.ladderPresets.find((p) => p.id === draft.presetId);
    if (!preset) return false;
    base = preset.dimValues;
  }
  const full = { ...defaultsFromMeta(meta), ...base };
  return Object.entries(full).some(([k, v]) => draft.dims[k] !== v);
}

/** 提交给后端的 StrategyOverride（intent 基准只传 dims——后端 resolve 以全局基准 + dims 覆盖） */
export function toOverride(draft: StrategyDraft): StrategyOverride {
  return { presetId: draft.presetId.startsWith("intent:") ? null : draft.presetId || null, dims: draft.dims };
}

/** 草稿 → 全局偏好（设置页保存：仅存偏离基准档的组合——最小集语义） */
export function prefsFromDraft(
  draft: StrategyDraft,
  meta: RefineStrategyMeta | null,
): RefineStrategyPrefs {
  const base = meta?.ladderPresets.find((p) => p.id === draft.presetId)?.dimValues ?? {};
  const dimOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft.dims)) {
    if (base[k] !== v) dimOverrides[k] = v;
  }
  return {
    defaultLadder: draft.presetId.startsWith("intent:") ? "" : draft.presetId,
    dimOverrides,
  };
}

/** 草稿持久化（失败静默——偏好丢失不影响功能） */
export function saveDraft(draft: StrategyDraft): void {
  try {
    localStorage.setItem(REFINE_STRATEGY_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* 存储失败静默 */
  }
}

/** 读取草稿（损坏/缺失 → null——调用方回退默认） */
export function loadDraft(): StrategyDraft | null {
  try {
    const raw = localStorage.getItem(REFINE_STRATEGY_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StrategyDraft;
    if (typeof v !== "object" || v === null || typeof v.dims !== "object") return null;
    return { presetId: typeof v.presetId === "string" ? v.presetId : "", dims: v.dims };
  } catch {
    return null;
  }
}
