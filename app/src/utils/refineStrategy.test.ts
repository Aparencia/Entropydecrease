/**
 * refineStrategy.test — 精修策略草稿纯函数单测（v0.17.0 REQ-245；
 * REQ-279 净化修订：替换语义/标准恒纯净/自定义档）。
 * AAA 模式：档位点击联动 / intent 匹配 / 偏离徽标 / 偏好往返。
 */
import { describe, expect, it } from "vitest";
import type { RefineStrategyMeta } from "../types";
import {
  applyCustomText,
  applyDim,
  applyIntent,
  applyPreset,
  draftFromPrefs,
  isDeviating,
  matchIntent,
  overrideFromInfo,
  prefsFromDraft,
  sanitizeDraft,
  toOverride,
} from "./refineStrategy";

/** 最小声明 fixture（两维：例子密度 + 概念表达；三档：standard/minimal/custom；一 intent） */
const meta: RefineStrategyMeta = {
  strategyDims: [
    {
      key: "examples", label: "例子密度", default: "standard",
      options: [
        { value: "keep_all", label: "全保留", instruction: "" },
        { value: "standard", label: "标准", instruction: "" },
        { value: "condensed", label: "浓缩", instruction: "" },
      ],
    },
    {
      key: "concept", label: "概念表达", default: "original",
      options: [
        { value: "original", label: "原文术语", instruction: "" },
        { value: "plain", label: "通俗白话", instruction: "" },
      ],
    },
  ],
  ladderPresets: [
    { id: "standard", name: "标准精修", desc: "", instruction: "", dimValues: {} },
    { id: "minimal", name: "极简提取", desc: "", instruction: "", dimValues: { examples: "condensed" } },
    { id: "custom", name: "自定义", desc: "", instruction: "", dimValues: {} },
  ],
  intents: [
    { id: "exam", label: "考点浓缩", keywords: ["背", "考点", "复习"], instruction: "", dimValues: { examples: "condensed" } },
  ],
};

describe("applyPreset / applyDim / intent 联动（REQ-279 替换语义）", () => {
  it("点档位 → 该档组合为基准（其余维保持声明默认）", () => {
    const d0 = draftFromPrefs(undefined, meta);
    const d1 = applyPreset(d0, meta.ladderPresets[1], meta);
    expect(d1.presetId).toBe("minimal");
    expect(d1.dims.examples).toBe("condensed");
    expect(d1.dims.concept).toBe("original"); // 非覆盖维保持默认
  });

  it("换档 = 替换而非并集：旧档残留清空（standard 恒纯净）", () => {
    const d0 = draftFromPrefs(undefined, meta);
    // 在 minimal 上把 concept 拧成 plain → 切回 standard
    const dirty = applyDim(applyPreset(d0, meta.ladderPresets[1], meta), "concept", "plain");
    const back = applyPreset(dirty, meta.ladderPresets[0], meta);
    expect(back.presetId).toBe("standard");
    expect(back.dims).toEqual({ examples: "standard", concept: "original" }); // 声明默认——零残留
    expect(isDeviating(back, meta)).toBe(false);
  });

  it("换档/换意图清自定义文本；旋钮微调保留", () => {
    const d0 = draftFromPrefs(undefined, meta);
    const custom = applyCustomText(applyPreset(d0, meta.ladderPresets[2], meta), "多举例子");
    expect(custom.presetId).toBe("custom");
    const std = applyPreset(custom, meta.ladderPresets[0], meta);
    expect(std.customText).toBe("");
    const intent = applyIntent(custom, meta.intents[0], meta);
    expect(intent.customText).toBe("");
    expect(applyDim(custom, "concept", "plain").customText).toBe("多举例子");
  });

  it("intent 基准不占档位语义（presetId=intent:xxx），残留同清", () => {
    const d0 = applyPreset(draftFromPrefs(undefined, meta), meta.ladderPresets[1], meta);
    const d1 = applyIntent(d0, meta.intents[0], meta);
    expect(d1.presetId).toBe("intent:exam");
    expect(d1.dims.examples).toBe("condensed");
    expect(d1.dims.concept).toBe("original");
  });

  it("单维微调保持档位基准", () => {
    const d = applyDim({ presetId: "minimal", dims: { examples: "condensed" } }, "concept", "plain");
    expect(d.presetId).toBe("minimal");
    expect(d.dims.concept).toBe("plain");
  });
});

describe("matchIntent（本地关键词——未命中诚实提示）", () => {
  it("命中关键词（含大小写/空白）", () => {
    expect(matchIntent("要能考前背的", meta)?.id).toBe("exam");
    expect(matchIntent("  复习重点", meta)?.id).toBe("exam");
  });
  it("未命中返回 null（不瞎猜）", () => {
    expect(matchIntent("随便来点", meta)).toBeNull();
    expect(matchIntent("", meta)).toBeNull();
  });
});

describe("isDeviating（偏离徽标）", () => {
  it("与预设组合一致 → false；被改过 → true", () => {
    const base = applyPreset(draftFromPrefs(undefined, meta), meta.ladderPresets[1], meta);
    expect(isDeviating(base, meta)).toBe(false);
    const dev = applyDim(base, "concept", "plain");
    expect(isDeviating(dev, meta)).toBe(true);
  });
  it("无基准/未知基准 → false", () => {
    expect(isDeviating({ presetId: "", dims: { examples: "condensed" } }, meta)).toBe(false);
    expect(isDeviating({ presetId: "no-such", dims: { examples: "condensed" } }, meta)).toBe(false);
  });
});

describe("toOverride / overrideFromInfo（前后端契约 + custom 文本）", () => {
  it("intent 基准只传 dims（后端以全局基准融合）；无 customText", () => {
    const d = applyIntent(draftFromPrefs(undefined, meta), meta.intents[0], meta);
    expect(toOverride(d)).toEqual({ presetId: null, dims: { examples: "condensed", concept: "original" } });
  });
  it("custom 档带自由文本（空文本 → 不带——后端按标准兜底）", () => {
    const d0 = draftFromPrefs(undefined, meta);
    const withText = applyCustomText(applyPreset(d0, meta.ladderPresets[2], meta), "  多举例子  ");
    expect(toOverride(withText)).toEqual({
      presetId: "custom",
      dims: { examples: "standard", concept: "original" },
      customText: "多举例子",
    });
    const empty = applyPreset(d0, meta.ladderPresets[2], meta);
    expect(toOverride(empty).customText).toBeUndefined();
  });
  it("overrideFromInfo（重生成沿用本次档位——含 custom 文本带回）", () => {
    expect(overrideFromInfo({ presetId: "deep", dims: { examples: "condensed" } }))
      .toEqual({ presetId: "deep", dims: { examples: "condensed" } });
    expect(overrideFromInfo({ presetId: "intent:exam", dims: { examples: "condensed" } }))
      .toEqual({ presetId: null, dims: { examples: "condensed" } });
    expect(overrideFromInfo({ presetId: "custom", dims: {}, customText: "少点例子" }))
      .toEqual({ presetId: "custom", dims: {}, customText: "少点例子" });
    expect(overrideFromInfo({ presetId: "custom", dims: {}, customText: "  " }).customText).toBeUndefined();
  });
});

describe("prefsFromDraft（设置页最小集 + intent/custom 净化）", () => {
  it("阶梯基准仅存偏离最小集", () => {
    const d = applyDim(applyPreset(draftFromPrefs(undefined, meta), meta.ladderPresets[1], meta), "concept", "plain");
    const prefs = prefsFromDraft(d, meta);
    expect(prefs.defaultLadder).toBe("minimal");
    expect(prefs.dimOverrides).toEqual({ concept: "plain" }); // examples 与基准一致不重复存
  });
  it("intent 基准 → 纯净标准偏好（不再全维写 overrides——污染通道③根治）", () => {
    const d = applyIntent(draftFromPrefs(undefined, meta), meta.intents[0], meta);
    expect(prefsFromDraft(d, meta)).toEqual({ defaultLadder: "", dimOverrides: {} });
  });
  it("custom 基准无法表达为全局默认 → 纯净标准偏好", () => {
    const d = applyPreset(draftFromPrefs(undefined, meta), meta.ladderPresets[2], meta);
    expect(prefsFromDraft(d, meta)).toEqual({ defaultLadder: "", dimOverrides: {} });
  });
  it("显式「标准+微调」组合仍可存（defaultLadder=standard + 偏离）", () => {
    const d = applyDim(applyPreset(draftFromPrefs(undefined, meta), meta.ladderPresets[0], meta), "concept", "plain");
    expect(prefsFromDraft(d, meta)).toEqual({ defaultLadder: "standard", dimOverrides: { concept: "plain" } });
  });
  it("prefs → 草稿往返保留档位与覆盖", () => {
    const d = draftFromPrefs({ defaultLadder: "minimal", dimOverrides: { concept: "plain" } }, meta);
    expect(d.presetId).toBe("minimal");
    expect(d.dims.concept).toBe("plain");
  });
});

describe("sanitizeDraft（存量记忆净化——REQ-279 污染治理）", () => {
  const pristine = draftFromPrefs(undefined, meta);
  it("standard 档却偏离（旧版并集残留）→ null（回退偏好）", () => {
    const legacy = { presetId: "standard", dims: { examples: "standard", concept: "plain" } };
    expect(sanitizeDraft(legacy, meta)).toBeNull();
  });
  it("standard 纯净记忆保留；custom 空文本 → null、有文本保留", () => {
    expect(sanitizeDraft(pristine, meta)).not.toBeNull();
    const customEmpty = { presetId: "custom", dims: {}, customText: "" };
    expect(sanitizeDraft(customEmpty, meta)).toBeNull();
    const customOk = { presetId: "custom", dims: {}, customText: "多举例子" };
    expect(sanitizeDraft(customOk, meta)?.customText).toBe("多举例子");
  });
  it("未知档位/未知 intent → null；meta 未加载不判（后端兜底）", () => {
    expect(sanitizeDraft({ presetId: "no-such", dims: {} }, meta)).toBeNull();
    expect(sanitizeDraft({ presetId: "intent:ghost", dims: {} }, meta)).toBeNull();
    const dirty = { presetId: "standard", dims: { concept: "plain" } };
    expect(sanitizeDraft(dirty, null)).toEqual(dirty);
  });
});
