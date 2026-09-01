/**
 * refineStrategy.test — 精修策略草稿纯函数单测（v0.17.0 REQ-245）。
 * AAA 模式：档位点击联动 / intent 匹配 / 偏离徽标 / 偏好往返。
 */
import { describe, expect, it } from "vitest";
import type { RefineStrategyMeta } from "../types";
import {
  applyDim,
  applyIntent,
  applyPreset,
  draftFromPrefs,
  isDeviating,
  matchIntent,
  prefsFromDraft,
  toOverride,
} from "./refineStrategy";

/** 最小声明 fixture（两维：例子密度 + 概念表达；两档：standard/minimal；一 intent） */
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
  ],
  intents: [
    { id: "exam", label: "考点浓缩", keywords: ["背", "考点", "复习"], instruction: "", dimValues: { examples: "condensed" } },
  ],
};

describe("applyPreset / applyDim / intent 联动", () => {
  it("点档位 → 该档组合为基准（其余维保留默认）", () => {
    const d0 = draftFromPrefs(undefined, meta);
    const d1 = applyPreset(d0, meta.ladderPresets[1]);
    expect(d1.presetId).toBe("minimal");
    expect(d1.dims.examples).toBe("condensed");
    expect(d1.dims.concept).toBe("original"); // 非覆盖维保持默认
  });

  it("单维微调保持档位基准", () => {
    const d = applyDim({ presetId: "minimal", dims: { examples: "condensed" } }, "concept", "plain");
    expect(d.presetId).toBe("minimal");
    expect(d.dims.concept).toBe("plain");
  });

  it("intent 基准不占档位语义（presetId=intent:xxx）", () => {
    const d = applyIntent(draftFromPrefs(undefined, meta), meta.intents[0]);
    expect(d.presetId).toBe("intent:exam");
    expect(d.dims.examples).toBe("condensed");
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
    const base = applyPreset(draftFromPrefs(undefined, meta), meta.ladderPresets[1]);
    expect(isDeviating(base, meta)).toBe(false);
    const dev = applyDim(base, "concept", "plain");
    expect(isDeviating(dev, meta)).toBe(true);
  });
  it("无基准 → false", () => {
    expect(isDeviating({ presetId: "", dims: { examples: "condensed" } }, meta)).toBe(false);
  });
});

describe("toOverride / prefsFromDraft（前后端契约）", () => {
  it("intent 基准只传 dims（后端以全局基准融合）", () => {
    const d = applyIntent(draftFromPrefs(undefined, meta), meta.intents[0]);
    expect(toOverride(d)).toEqual({ presetId: null, dims: { examples: "condensed", concept: "original" } });
  });
  it("prefsFromDraft 仅存偏离最小集", () => {
    const d = applyDim(applyPreset(draftFromPrefs(undefined, meta), meta.ladderPresets[1]), "concept", "plain");
    const prefs = prefsFromDraft(d, meta);
    expect(prefs.defaultLadder).toBe("minimal");
    expect(prefs.dimOverrides).toEqual({ concept: "plain" }); // examples 与基准一致不重复存
  });
  it("prefs → 草稿往返保留档位与覆盖", () => {
    const d = draftFromPrefs({ defaultLadder: "minimal", dimOverrides: { concept: "plain" } }, meta);
    expect(d.presetId).toBe("minimal");
    expect(d.dims.concept).toBe("plain");
  });
});
