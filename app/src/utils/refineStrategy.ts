/**
 * refineStrategy — 精修策略草稿纯函数（v0.17.0 REQ-245；REQ-279 净化修订）。
 *
 * @ai-context: 发起对话框/设置页共用同一草稿形态：基准档位（presetId，
 *              intent 基准="intent:xxx"，自定义="custom"，无基准=""）+ 每维
 *              当前值（dims）+ 自定义自由文本（customText，仅 custom 档）。
 *              声明（meta）来自后端 ai_refine_strategy_meta——前端零硬编码；
 *              提交时转 StrategyOverride 传后端 resolve（非法值后端回退默认）。
 * @ai-context: REQ-279 三通道净化（标准恒纯净）：
 *              ①换档=替换语义——applyPreset/applyIntent 以「声明默认 + 新基准
 *                组合」重建 dims，清空旧档残留与 customText（不再并集合并）；
 *              ②记忆=仅显式偏离生效——sanitizeDraft 拒绝「standard 档却偏离」
 *                「未知档位」等被旧版污染的存量记忆；
 *              ③偏好派生——prefsFromDraft 对 intent/custom 基准一律产出纯净
 *                标准偏好（不把全维写入 dimOverrides）；后端 resolve 另有
 *                standard/custom 不叠加全局覆盖的兜底（见 ai_strategy.rs）。
 * @ai-context: 记忆=localStorage（知识补充九子项先例——上次选择恢复）；
 *              损坏/缺失回退设置偏好 > standard。
 */
import type {
  IntentPresetDef,
  LadderPresetDef,
  RefineStrategyInfo,
  RefineStrategyMeta,
  RefineStrategyPrefs,
  StrategyOverride,
} from "../types";

export const REFINE_STRATEGY_STORAGE_KEY = "entropy.refine.strategy.v1";

/** 自定义档 id（与 note_refine.json ladder_presets 声明一致——仅此处特判用） */
export const CUSTOM_PRESET_ID = "custom";

/** 策略草稿（UI 状态） */
export interface StrategyDraft {
  /** 基准档位 id（intent 基准="intent:xxx"；无基准=""） */
  presetId: string;
  /** 每维当前值（key → value） */
  dims: Record<string, string>;
  /** 自定义档自由文本（仅 presetId=custom 时有意义；缺省=""） */
  customText?: string;
}

/** meta 各维默认值（无档位/存储时的兜底：standard） */
export function defaultsFromMeta(meta: RefineStrategyMeta | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of meta?.strategyDims ?? []) out[d.key] = d.default;
  return out;
}

/** 基准组合全值 = 声明默认 + 档位预设值（偏离判定与偏好派生的统一口径） */
function fullBase(presetId: string, meta: RefineStrategyMeta | null): Record<string, string> {
  const base =
    meta?.ladderPresets.find((p) => p.id === presetId)?.dimValues ??
    meta?.intents.find((i) => `intent:${i.id}` === presetId)?.dimValues ??
    {};
  return { ...defaultsFromMeta(meta), ...base };
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

/** 点击档位 → 该档组合为基准（REQ-279 替换语义：清旧档残留与自定义文本；
 * _draft 仅保持调用签名一致——替换语义不再读取旧草稿） */
export function applyPreset(
  _draft: StrategyDraft,
  preset: LadderPresetDef,
  meta: RefineStrategyMeta | null,
): StrategyDraft {
  return {
    presetId: preset.id,
    dims: { ...defaultsFromMeta(meta), ...preset.dimValues },
    customText: "",
  };
}

/** 点击目标 chip → 意图组合为基准（presetId="intent:xxx"——不占档位语义；
 * 同样替换语义清残留） */
export function applyIntent(
  _draft: StrategyDraft,
  intent: IntentPresetDef,
  meta: RefineStrategyMeta | null,
): StrategyDraft {
  return {
    presetId: `intent:${intent.id}`,
    dims: { ...defaultsFromMeta(meta), ...intent.dimValues },
    customText: "",
  };
}

/** 自定义档：写入自由文本（其余状态不动——dims 仍为基准默认） */
export function applyCustomText(draft: StrategyDraft, text: string): StrategyDraft {
  return { ...draft, customText: text };
}

/** 单维微调（基准档位保持——偏离徽标据此判定） */
export function applyDim(draft: StrategyDraft, key: string, value: string): StrategyDraft {
  return { presetId: draft.presetId, dims: { ...draft.dims, [key]: value }, customText: draft.customText ?? "" };
}

/** 自由输入 → 意图（本地关键词 contains 匹配；未命中 null——诚实提示不瞎猜） */
export function matchIntent(text: string, meta: RefineStrategyMeta | null): IntentPresetDef | null {
  const t = text.trim().toLowerCase();
  if (!t || !meta) return null;
  return (
    meta.intents.find((i) => i.keywords.some((k) => t.includes(k))) ?? null
  );
}

/** 偏离徽标：当前草稿是否偏离基准组合（基准=默认值+基准预设组合；
 * 无基准/未知基准 → false） */
export function isDeviating(draft: StrategyDraft, meta: RefineStrategyMeta | null): boolean {
  if (!draft.presetId || !meta) return false;
  const isLadder = meta.ladderPresets.some((p) => p.id === draft.presetId);
  const isIntent =
    draft.presetId.startsWith("intent:")
    && meta.intents.some((i) => `intent:${i.id}` === draft.presetId);
  if (!isLadder && !isIntent) return false; // 未知基准（后端会回退）
  const full = fullBase(draft.presetId, meta);
  return Object.entries(full).some(([k, v]) => draft.dims[k] !== v);
}

/** 提交给后端的 StrategyOverride（intent 基准只传 dims——后端 resolve 以全局
 * 基准 + dims 覆盖；custom 档带自由文本） */
export function toOverride(draft: StrategyDraft): StrategyOverride {
  const isIntent = draft.presetId.startsWith("intent:");
  const presetId = isIntent ? null : draft.presetId || null;
  const customText =
    !isIntent && draft.presetId === CUSTOM_PRESET_ID
      ? (draft.customText ?? "").trim() || undefined
      : undefined;
  return { presetId, dims: draft.dims, customText };
}

/** 从任务溯源信息还原 override（「重新生成·沿用本次档位」——P1 审查修复：
 * 依赖 result.strategy 而非回退全局默认，保重生成与首版同档位；
 * REQ-279：custom 档文本随溯源带回，重生成不丢自由要求） */
export function overrideFromInfo(info: RefineStrategyInfo): StrategyOverride {
  const isIntent = info.presetId.startsWith("intent:");
  const presetId = isIntent ? null : info.presetId || null;
  const customText =
    !isIntent && info.presetId === CUSTOM_PRESET_ID
      ? info.customText?.trim() || undefined
      : undefined;
  return { presetId, dims: { ...info.dims }, customText };
}

/** 草稿 → 全局偏好（设置页保存：仅存偏离基准档的组合——最小集语义）。
 * REQ-279：intent/custom 基准无法表达为全局档位 → 产出纯净标准偏好
 * （旧版曾把全维写进 dimOverrides 且 defaultLadder 置空 = 污染通道③根源） */
export function prefsFromDraft(
  draft: StrategyDraft,
  meta: RefineStrategyMeta | null,
): RefineStrategyPrefs {
  if (!draft.presetId || draft.presetId.startsWith("intent:") || draft.presetId === CUSTOM_PRESET_ID) {
    return { defaultLadder: "", dimOverrides: {} };
  }
  const full = fullBase(draft.presetId, meta);
  const dimOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft.dims)) {
    if (full[k] !== v) dimOverrides[k] = v;
  }
  return { defaultLadder: draft.presetId, dimOverrides };
}

/** 存量记忆净化：拒绝会被后端判定为污染/无效的草稿（→ 调用方回退偏好）。
 * 规则：未知档位；standard 档却偏离（旧版并集合并残留）；custom 档无文本
 * （无文本 = 无效档，后端同样回退 standard——早拒绝早诚实）。 */
export function sanitizeDraft(
  draft: StrategyDraft | null,
  meta: RefineStrategyMeta | null,
): StrategyDraft | null {
  if (!draft) return null;
  if (!meta) return draft; // 声明未加载：不判（后端 resolve 兜底净化）
  const { presetId } = draft;
  const knownLadder = meta.ladderPresets.some((p) => p.id === presetId);
  const knownIntent = presetId.startsWith("intent:")
    && meta.intents.some((i) => `intent:${i.id}` === presetId);
  if (presetId !== "" && !knownLadder && !knownIntent) return null;
  if (presetId === CUSTOM_PRESET_ID && !(draft.customText ?? "").trim()) return null;
  if (presetId === "standard" && isDeviating(draft, meta)) return null;
  return draft;
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
    return {
      presetId: typeof v.presetId === "string" ? v.presetId : "",
      dims: v.dims,
      customText: typeof v.customText === "string" ? v.customText : "",
    };
  } catch {
    return null;
  }
}
