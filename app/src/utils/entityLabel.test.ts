/**
 * entityLabel.test — 语义标签纯函数单测（REQ-277 裸号治理）。
 * 2026-09-09 批 1：taskRefKind/taskRefLabel（AI 任务标题按 target_kind 分发）。
 */
import { describe, expect, it } from "vitest";
import { kindWord, refLabel, taskRefKind, taskRefLabel } from "./entityLabel";

describe("refLabel（标题优先，缺标题语义占位——绝不回退裸 # 数字）", () => {
  it("有标题 → 原样返回（含空白裁剪）", () => {
    expect(refLabel("session", "直播间的朋友们大家好")).toBe("直播间的朋友们大家好");
    expect(refLabel("note", "  《CSS 入门》  ")).toBe("《CSS 入门》");
  });

  it("缺标题 → 按类别中性占位（未载入与已删除无法本地区分——不妄断）", () => {
    expect(refLabel("session", null)).toBe("会话（标题不可用）");
    expect(refLabel("note", undefined)).toBe("笔记（标题不可用）");
    expect(refLabel("session", "  ")).toBe("会话（标题不可用）");
  });

  it("自定义 fallback 优先（未命名场景）", () => {
    expect(refLabel("note", null, "未命名笔记")).toBe("未命名笔记");
    expect(refLabel("session", "", "未命名会话")).toBe("未命名会话");
  });
});

describe("kindWord（类别词——无 id）", () => {
  it("会话/笔记类别词", () => {
    expect(kindWord("session")).toBe("会话");
    expect(kindWord("note")).toBe("笔记");
  });
});

describe("taskRefKind（AI 任务来源类别——2026-09-09 批 1 双入口分发）", () => {
  it("会话级精修（targetKind=session/NULL 旧数据）→ session", () => {
    expect(taskRefKind({ opType: "refine", refId: 1 })).toBe("session");
    expect(taskRefKind({ opType: "refine", targetKind: null, refId: 1 })).toBe("session");
    expect(taskRefKind({ opType: "refine", targetKind: "session", refId: 1 })).toBe("session");
  });

  it("笔记级精修（targetKind=note）→ note（ref_id=笔记 id，仅按 opType 会错查会话标题）", () => {
    expect(taskRefKind({ opType: "refine", targetKind: "note", refId: 5 })).toBe("note");
  });

  it("补充恒为笔记级（含 v0.17.0 前 target_kind=NULL 旧数据——入参即 note_id 不猜 session）", () => {
    expect(taskRefKind({ opType: "enrich", refId: 5 })).toBe("note");
    expect(taskRefKind({ opType: "enrich", targetKind: "note", refId: 5 })).toBe("note");
  });
});

describe("taskRefLabel（AI 任务标题查表——按类别取对应标题映射）", () => {
  const sessionTitles = new Map<number, string>([[1, "会话甲"], [2, "会话乙"]]);
  const noteTitles = new Map<number, string>([[5, "笔记五"]]);

  it("会话级精修 → 会话标题；笔记级精修 → 笔记标题（不复用对方表）", () => {
    expect(taskRefLabel({ opType: "refine", targetKind: "session", refId: 1 }, sessionTitles, noteTitles)).toBe("会话甲");
    expect(taskRefLabel({ opType: "refine", targetKind: "note", refId: 5 }, sessionTitles, noteTitles)).toBe("笔记五");
    // 修复回归形状：笔记级任务 id 恰好与会话 id 同名时不得串表（note=5 在会话表缺位 → 中性占位）
    expect(taskRefLabel({ opType: "refine", targetKind: "note", refId: 5 }, sessionTitles)).toBe("笔记（标题不可用）");
    expect(taskRefLabel({ opType: "refine", targetKind: "session", refId: 5 }, sessionTitles, noteTitles)).toBe("会话（标题不可用）");
  });

  it("缺标题 → 类别中性占位；查表缺失与空映射一致", () => {
    expect(taskRefLabel({ opType: "refine", targetKind: "note", refId: 999 }, sessionTitles, noteTitles)).toBe("笔记（标题不可用）");
    expect(taskRefLabel({ opType: "enrich", refId: 999 }, sessionTitles)).toBe("笔记（标题不可用）");
  });
});
