/**
 * routeReason.ts — 组路由理由纯函数（v0.12.2 ⓘ 弹层）。
 *
 * @ai-context: REQ-198 "可见"重释（v0.12.2 关键决策 3——Gmail/Apple Photos
 *               市场先例）：结果可见、原因不展示——组行小字一句人话归因
 *               （决策结果可感知），ⓘ 弹层"查看明细"折叠原文信号
 *               （原因可按需），误判可一键纠正（可改）。
 * @ai-context: 纯函数零副作用——组行小字与弹层归因共用同一套口径，
 *               保证"行内外一致"（避免两处文案漂移）。
 */
import type { GroupRouteReason } from "../types";

/** 解析路由理由 JSON（损坏防御性回退空对象——诚实不猜）。 */
export function parseRouteReason(raw: string | null): GroupRouteReason {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? (v as GroupRouteReason) : {};
  } catch {
    return {};
  }
}

/** 组行小字状态（对应三种状态：系统自动归类 / ⚠ 待确认 / 已改判）。 */
export interface RouteLineState {
  /** 状态文案（ⓘ 后缀由渲染层拼） */
  label: string;
  /** 是否待确认（⚠ 淡橙描边） */
  needsConfirm: boolean;
}

/**
 * 组行小字：结果可见的一句话（不展示算法原文——Gmail/Photos 先例）。
 * 已改判优先（用户裁决是最高优先级状态），其次待确认，最后系统自动归类。
 */
export function routeLineState(
  reason: GroupRouteReason,
  routeOverridden: number,
): RouteLineState {
  if (routeOverridden !== 0) return { label: "已改判", needsConfirm: false };
  if (reason.needsConfirm) return { label: "⚠ 待确认", needsConfirm: true };
  return { label: "系统自动归类", needsConfirm: false };
}

/**
 * ⓘ 弹层人话归因一行（按 action 转述决策结果，非算法原文）。
 * @ai-context: 有信号明细时优先取首条信号（与规划示例
 *              「系统按内容特征归入：画面以术语表为主（60 条术语）」同构）；
 *              无信号回退 action 语义，最后诚实说明无归因。
 */
export function humanRouteLine(reason: GroupRouteReason, kind: string): string {
  if (reason.needsConfirm) {
    return "系统判断有待确认——信号冲突或低结构无领域，请核验归属";
  }
  const first = (reason.reasons ?? []).find((r) => r.trim().length > 0);
  if (first) return `系统按内容特征归入：${first}`;
  const action = reason.action ?? kind;
  if (action === "course") return "系统按内容特征归入：课程组（系列连续内容）";
  if (action === "topic") return "系统按内容特征归入：主题组（领域信号明确）";
  if (action === "own") return "系统按内容特征归入：独立组（无系列/领域信号）";
  return "系统未给出明确归因（无路由信号）";
}
