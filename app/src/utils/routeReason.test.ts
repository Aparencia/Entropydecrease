/**
 * routeReason.test.ts — 组路由理由纯函数单测（v0.12.2 ⓘ 弹层共用口径）。
 *
 * @ai-context: AAA 结构；node 环境（Vitest），无 DOM 依赖。
 */
import { describe, expect, it } from "vitest";
import { humanRouteLine, parseRouteReason, routeLineState } from "./routeReason";

describe("parseRouteReason", () => {
  it("null/损坏 JSON 防御性回退空对象", () => {
    expect(parseRouteReason(null)).toEqual({});
    expect(parseRouteReason("{ not json !!")).toEqual({});
    expect(parseRouteReason("42")).toEqual({});
  });

  it("合法 JSON 解析为对象", () => {
    const r = parseRouteReason('{"action":"topic","needsConfirm":true,"reasons":["术语表成块"]}');
    expect(r.action).toBe("topic");
    expect(r.needsConfirm).toBe(true);
    expect(r.reasons).toEqual(["术语表成块"]);
  });
});

describe("routeLineState（组行小字）", () => {
  it("已改判优先于待确认（用户裁决最高状态）", () => {
    const s = routeLineState({ needsConfirm: true }, 1);
    expect(s.label).toBe("已改判");
    expect(s.needsConfirm).toBe(false);
  });

  it("待确认显示 ⚠ 小字（淡橙描边信号）", () => {
    const s = routeLineState({ needsConfirm: true }, 0);
    expect(s.label).toBe("⚠ 待确认");
    expect(s.needsConfirm).toBe(true);
  });

  it("无标记 = 系统自动归类", () => {
    const s = routeLineState({}, 0);
    expect(s.label).toBe("系统自动归类");
    expect(s.needsConfirm).toBe(false);
  });
});

describe("humanRouteLine（ⓘ 人话归因一行）", () => {
  it("待确认转述决策状态（不铺算法原文）", () => {
    const line = humanRouteLine({ needsConfirm: true, reasons: ["独特信号XYZ"] }, "topic");
    expect(line).toContain("有待确认");
    expect(line).not.toContain("独特信号XYZ");
  });

  it("有首条信号时取信号（与规划示例同构：画面以术语表为主（60 条术语））", () => {
    const line = humanRouteLine({ action: "topic", reasons: ["画面以术语表为主（60 条术语）"] }, "topic");
    expect(line).toBe("系统按内容特征归入：画面以术语表为主（60 条术语）");
  });

  it("无信号按 action 语义转述", () => {
    expect(humanRouteLine({ action: "course" }, "topic")).toBe("系统按内容特征归入：课程组（系列连续内容）");
    expect(humanRouteLine({ action: "own" }, "topic")).toBe("系统按内容特征归入：独立组（无系列/领域信号）");
  });

  it("无任何路由信号诚实说明无归因", () => {
    const line = humanRouteLine({}, "standalone");
    expect(line).toBe("系统未给出明确归因（无路由信号）");
  });

  it("reasons 全空白不取（回退 action 语义）", () => {
    const line = humanRouteLine({ action: "topic", reasons: ["  ", ""] }, "topic");
    expect(line).toBe("系统按内容特征归入：主题组（领域信号明确）");
  });
});
