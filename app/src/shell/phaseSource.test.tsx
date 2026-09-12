// @vitest-environment jsdom
/**
 * @ai-context phaseSource.test.tsx — 相变态**来源通道与唯一决策点**的 jsdom 面判据（批 6 T19）。
 *
 * Why 每条判据各带**专属变异体**（R8.6 / R41.7：主闸是**期望比对**，`ran > 0` 只是旁证）：
 *   · S1 **页面侧 `active` 门控**：`usePublishReviewSession(visible, sessionOpen)` 只在**两者都真**时
 *     发布事实 ⇒ 变异体 = 去掉 `visible &&`（保活挂载下带会话切走就会停在 review 相位 = 零 chrome 卡死）。
 *   · S2 **采集 > 复习 > 常态**的优先级：两态同时成立时采集赢（ADR-007 的跨页常驻采集可见性）
 *     ⇒ 变异体 = 把 `capturing ? …` 与 `onReviewPage && reviewing` 两块对调。
 *   · S3 **壳层侧 `active` 门控**（四格矩阵，逐序数组相等）：事实为真、`onReviewPage=false` ⇒ **idle**
 *     ⇒ 变异体 = 去掉 `onReviewPage &&`（页面不可见却进零 chrome = 计划 `:1527/:1542` 的原缺陷）。
 *   · S4 **卸载复位**：事实源与决策 hook 卸载后都不得留 residue（`<html>` 回 "idle"、事实回 false）
 *     ⇒ 变异体 = 删掉发布 hook 的卸载复位 effect / 删 `shellPhase` 的 cleanup（后者由 T17 的 dom 面覆盖）。
 *
 * 副作用：只写 jsdom 的 `<html data-shell-phase>` 与**模块级事实源**（每个用例前后各清一次，
 *   防残留让断言空真）。边界：jsdom 不做样式级联 ⇒ 本文件判的是**相位属性与门控语义**，
 *   **判不到**「复习态用户真的看不到顶栏」（像素面进报告 `## 诚实边界`）。
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getReviewSessionActive,
  setReviewSessionActive,
  usePublishReviewSession,
  useShellPhaseState,
} from "./phaseSource";
import { SHELL_PHASE_ATTR } from "./shellPhase";
import type { ShellPhase } from "./shellPhase";

/** `<html>` 上的相位（逐字读真属性，不走 dataset 别名）。 */
const htmlPhase = (): string | null => document.documentElement.getAttribute(SHELL_PHASE_ATTR);

beforeEach(() => {
  setReviewSessionActive(false);
  document.documentElement.removeAttribute(SHELL_PHASE_ATTR);
});
afterEach(() => {
  cleanup();
  setReviewSessionActive(false);
  document.documentElement.removeAttribute(SHELL_PHASE_ATTR);
});

/** 起一对「发布方 + 决策方」的探针（决策方模拟 `MainShell` 里那个唯一调用点）。 */
function mountPair(publish: { visible: boolean; sessionOpen: boolean }, decide: { capturing: boolean; onReviewPage: boolean }) {
  const publisher = renderHook(
    ({ visible, sessionOpen }: { visible: boolean; sessionOpen: boolean }) => usePublishReviewSession(visible, sessionOpen),
    { initialProps: publish },
  );
  const decider = renderHook(
    ({ capturing, onReviewPage }: { capturing: boolean; onReviewPage: boolean }) => useShellPhaseState(capturing, onReviewPage),
    { initialProps: decide },
  );
  return { publisher, decider };
}

describe("S1/S4 页面侧发布：`active` 门控 + 卸载复位（门控写在被测模块里，调用点只有一行）", () => {
  it("S1：visible=false ∧ sessionOpen=true ⇒ 事实为 false（**页面不可见就不许声称复习相位**）", () => {
    const publisher = renderHook(
      ({ visible, sessionOpen }: { visible: boolean; sessionOpen: boolean }) => usePublishReviewSession(visible, sessionOpen),
      { initialProps: { visible: false, sessionOpen: true } },
    );
    expect(getReviewSessionActive(), "页面不可见却发布了复习事实 ⇒ 切走后壳层会卡在零 chrome").toBe(false);
    // 反向对照（防空真）：同一支探针在 visible=true 时必须发布 true
    act(() => publisher.rerender({ visible: true, sessionOpen: true }));
    expect(getReviewSessionActive()).toBe(true);
  });

  it("S1 变体：会话没开（sessionOpen=false）时即使可见也不发布", () => {
    renderHook(() => usePublishReviewSession(true, false));
    expect(getReviewSessionActive(), "没有会话却发布复习事实 ⇒ 总览页也会零 chrome").toBe(false);
  });

  it("S4：发布 hook 卸载 ⇒ 事实复位 false（防「页面真被卸载后壳层停在 review」）", () => {
    const publisher = renderHook(() => usePublishReviewSession(true, true));
    expect(getReviewSessionActive()).toBe(true);
    publisher.unmount();
    expect(getReviewSessionActive(), "卸载后事实残留 ⇒ 壳层永久零 chrome").toBe(false);
  });

  it("S1+S4 逐序序列：(visible, sessionOpen) 的状态迁移必须逐序映射到事实（五步，逐序数组相等）", () => {
    const steps: ReadonlyArray<readonly [boolean, boolean]> = [
      [false, false], [true, true], [true, false], [false, true], [true, true],
    ];
    const publisher = renderHook(
      ({ visible, sessionOpen }: { visible: boolean; sessionOpen: boolean }) => usePublishReviewSession(visible, sessionOpen),
      { initialProps: { visible: steps[0][0], sessionOpen: steps[0][1] } },
    );
    const seen = steps.map(([visible, sessionOpen], i) => {
      if (i > 0) act(() => publisher.rerender({ visible, sessionOpen }));
      return getReviewSessionActive();
    });
    expect(seen).toEqual([false, true, false, false, true]);
  });
});

describe("S2/S3 唯一决策点：优先级与**壳层侧**的 active 门控", () => {
  it("S2：采集 ∧ 复习同时成立 ⇒ capture（采集是跨页常驻的系统级状态，不许被零 chrome 藏掉）", () => {
    const { decider } = mountPair(
      { visible: true, sessionOpen: true },
      { capturing: true, onReviewPage: true },
    );
    expect([decider.result.current, htmlPhase()]).toEqual(["capture", "capture"]);
    // 反向：采集结束 ⇒ 立刻回到 review（不是 idle —— 说明 capture 那一支只是**优先级**更高）
    act(() => decider.rerender({ capturing: false, onReviewPage: true }));
    expect([decider.result.current, htmlPhase()]).toEqual(["review", "review"]);
  });

  it("S3：四格矩阵 (onReviewPage × 事实) 逐序相等 —— 门控缺一半就会漏成 review", () => {
    renderHook(
      ({ visible, sessionOpen }: { visible: boolean; sessionOpen: boolean }) => usePublishReviewSession(visible, sessionOpen),
      { initialProps: { visible: false, sessionOpen: false } },
    );
    const decider = renderHook(
      ({ capturing, onReviewPage }: { capturing: boolean; onReviewPage: boolean }) => useShellPhaseState(capturing, onReviewPage),
      { initialProps: { capturing: false, onReviewPage: false } },
    );
    const grid: ReadonlyArray<readonly [boolean, boolean]> = [
      [false, false], [false, true], [true, false], [true, true],
    ];
    const seen: Array<readonly [ShellPhase, string | null]> = grid.map(([onReviewPage, fact]) => {
      act(() => {
        setReviewSessionActive(fact); // 直接摆事实源（发布侧的门控由 S1 单独判）
        decider.rerender({ capturing: false, onReviewPage });
      });
      return [decider.result.current, htmlPhase()] as const;
    });
    expect(seen).toEqual([
      ["idle", "idle"],
      ["idle", "idle"],   // ← 事实为真、页面不可见 ⇒ 必须 idle（plan :1527 的原缺陷就在这一格）
      ["idle", "idle"],
      ["review", "review"],
    ]);
  });

  it("S4：决策 hook 卸载 ⇒ `<html>` 回 idle（T17 的 cleanup 在唯一写入方这条路径上仍然生效）", () => {
    const { decider } = mountPair({ visible: true, sessionOpen: true }, { capturing: false, onReviewPage: true });
    expect(htmlPhase()).toBe("review");
    decider.unmount();
    expect(htmlPhase(), "残留 review ⇒ 顶栏与域导航都不在（零 chrome 卡死）").toBe("idle");
  });

  it("S3 变体：三态都经由唯一决策点写出（逐序：idle → capture → review → idle）", () => {
    renderHook(() => usePublishReviewSession(true, true));
    const decider = renderHook(
      ({ capturing, onReviewPage }: { capturing: boolean; onReviewPage: boolean }) => useShellPhaseState(capturing, onReviewPage),
      { initialProps: { capturing: false, onReviewPage: false } },
    );
    const seq: Array<readonly [boolean, boolean]> = [
      [false, false], [true, false], [false, true], [false, false],
    ];
    const seen = seq.map(([capturing, onReviewPage]) => {
      act(() => decider.rerender({ capturing, onReviewPage }));
      return htmlPhase();
    });
    expect(seen).toEqual(["idle", "capture", "review", "idle"]);
    expect(seen.every((p) => p !== null && (["idle", "capture", "review"] as readonly string[]).includes(p))).toBe(true);
  });
});
