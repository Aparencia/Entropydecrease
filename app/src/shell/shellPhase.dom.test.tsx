// @vitest-environment jsdom
/**
 * @ai-context shellPhase.dom.test.tsx — 相变态通道的 **jsdom 面**（挂载 / 变更 / 卸载）。
 *
 * Why 必须单独一件：`shellPhase.test.ts` 是 **node 环境**文件（那里只能用**假元素**判「写了个叫
 *   data-shell-phase 的属性」，且「无 document ⇒ 静默降级」那条也只有 node 能判）—— 但**真 `<html>`**
 *   上的写入、以及 hook 的 **effect 生命周期**（挂载即写 / 变更跟手 / **卸载清回**）在 node 下不可判
 *   （`renderToString` 不执行 `useEffect`）。两侧互补，都不可删（先例 = T6 的 `intensity.test.ts`
 *   node 面 + T7 的 `MotionIntensityControl.test.tsx` jsdom 面）。
 *
 * 判据与它的牙（每条各带专属变异体）：
 *   ① 默认宿主 = 真 `<html>` ⇒ 变异体 = 把 `hostOf` 的默认分支改成 `null`（属性写不上去 ⇒ 红）；
 *   ② 挂载即写 ⇒ 变异体 = 删掉 effect 里的 `applyShellPhase(phase)`；
 *   ③ 变更跟手 ⇒ 变异体 = 把 effect 的依赖数组改成 `[]`（相位改了属性不动 ⇒ 红）；
 *   ④ 🔴 **卸载清回 "idle"** ⇒ 变异体 = 删掉 cleanup 的 `return () => applyShellPhase("idle")`
 *      （残留 "review" ⇒ 红）—— 这条防「切走后壳层永久停在该态」（保活挂载下页面不卸载，
 *      相位由页面自己写，残留即零 chrome 卡死）。
 *
 * 副作用：只写 jsdom 的 `<html data-shell-phase>`（每个用例前后各清一次，防残留属性让断言空真）。
 * 边界（诚实登记）：jsdom **不做样式级联** ⇒ 本文件判的是**属性与生命周期**，**判不了**「采集态顶栏
 *   真的变 58px」「复习态用户真的看不到顶栏」—— 像素面归 T18/T19 的消费方与 headless 抽检（本批不做）。
 *   `useShellPhase` **不读** `matchMedia` ⇒ 本文件不装 `test/motionHarness.ts` 的桩（装了也没人调）。
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SHELL_PHASE_ATTR, applyShellPhase, readShellPhase, useShellPhase } from "./shellPhase";
import type { ShellPhase } from "./shellPhase";

/** `<html>` 上的相位（逐字读真属性，不走 dataset 别名） */
const htmlPhase = (): string | null => document.documentElement.getAttribute(SHELL_PHASE_ATTR);
const clearPhase = (): void => document.documentElement.removeAttribute(SHELL_PHASE_ATTR);

beforeEach(clearPhase);
afterEach(() => {
  cleanup();
  clearPhase();
});

describe("真 DOM：默认宿主就是 `<html>`（假元素判不到这一层）", () => {
  it("不传元素 ⇒ `<html>` 上出现真属性 data-shell-phase，且 readShellPhase 读得回来", () => {
    expect(htmlPhase(), "起点必须干净，否则下面的断言会空真").toBeNull();
    applyShellPhase("review");
    expect(document.documentElement.getAttribute("data-shell-phase")).toBe("review");
    expect(readShellPhase()).toBe("review");
  });
});

describe("useShellPhase：挂载即写 / 变更跟手 / 卸载清回", () => {
  it("挂载即写 `<html>`：渲染前为空，渲染后 = review", () => {
    expect(htmlPhase()).toBeNull();
    renderHook(() => useShellPhase("review"));
    expect(htmlPhase()).toBe("review");
  });

  it("相位变更 ⇒ 属性跟手（读到的是新态，不是上一次的残留）", () => {
    const { rerender } = renderHook(({ p }: { p: ShellPhase }) => useShellPhase(p), {
      initialProps: { p: "capture" as ShellPhase },
    });
    expect(htmlPhase()).toBe("capture");
    rerender({ p: "idle" });
    expect(htmlPhase()).toBe("idle");
    rerender({ p: "review" });
    expect(htmlPhase()).toBe("review");
  });

  it('卸载 ⇒ 清回 "idle"（**不是**残留 review，也不是把属性删掉）—— 防切走后壳层永久零 chrome', () => {
    const { unmount } = renderHook(() => useShellPhase("review"));
    expect(htmlPhase()).toBe("review");
    unmount();
    expect(htmlPhase(), "残留 review ⇒ 顶栏与域导航都不在（零 chrome 卡死）").toBe("idle");
  });

  it("三态逐个挂载 ⇒ 卸载：卸载一律回 idle（cleanup 不许硬编码上一次的相位）", () => {
    for (const phase of ["capture", "review", "idle"] as const) {
      const { unmount } = renderHook(() => useShellPhase(phase));
      expect(htmlPhase()).toBe(phase);
      unmount();
      expect(htmlPhase(), `相位 ${phase} 卸载后没有回到 idle`).toBe("idle");
    }
  });
});
