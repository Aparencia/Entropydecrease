/**
 * entityLabel.test — 语义标签纯函数单测（REQ-277 裸号治理）。
 */
import { describe, expect, it } from "vitest";
import { kindWord, refLabel } from "./entityLabel";

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
