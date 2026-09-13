// @vitest-environment jsdom
/**
 * @ai-context proofreadMode.dom.test.tsx — 审校模式通道的 **jsdom 面**（真 `<html>` 挂载 / 切换 / 卸载）。
 *
 * Why 必须单独一件：`proofreadMode.test.ts` 是 **node 环境**文件（那里只能用**假元素**判「写了个叫
 *   data-proofread-mode 的属性」，且「无 document ⇒ 静默降级」那条也只有 node 能判）—— 但**真 `<html>`**
 *   上的写入、以及 hook 的 **effect 生命周期**（挂载不落属性 / 切换跟手 / **卸载清回**）在 node 下不可判
 *   （`renderToString` 不执行 `useEffect`）。两侧互补，都不可删（先例 = `shellPhase.dom.test.tsx`）。
 *
 * 判据与它的牙（每条各带专属变异体）：
 *   ① 缺省**不落属性**（规格 §4.3④ 逐字）⇒ 变异体 = effect 里写 `applyProofreadMode("off")` 之外
 *      还 `setAttribute(ATTR, "off")`（首屏就多一个属性 ⇒ 红）；
 *   ② 切换跟手 ⇒ 变异体 = 把 effect 的依赖数组改成 `[]`（切了一次属性就不再动 ⇒ 红）；
 *   ③ 🔴 **卸载清回** ⇒ 变异体 = 删掉 cleanup 的 `return () => applyProofreadMode("off")`
 *      （残留 `data-proofread-mode="on"` ⇒ 红）—— 防「离开阅读面后墨度永久停在审校档」。
 *
 * 副作用：只写 jsdom 的 `<html data-proofread-mode>`（每个用例前后各清一次，防残留属性让断言空真）。
 * 边界（诚实登记）：jsdom **不做样式级联**、也**不解析 `var()`** ⇒ 本文件判的是**属性与生命周期**，
 *   **判不了**「墨度真的变深了」（真解算值与像素面归 T12–T15 的 CDP 读数，本批不判）。
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROOFREAD_MODE_ATTR, applyProofreadMode, readProofreadMode, useProofreadMode } from "./proofreadMode";

/** `<html>` 上的模式位（逐字读真属性，不走 dataset 别名） */
const htmlMode = (): string | null => document.documentElement.getAttribute(PROOFREAD_MODE_ATTR);
const htmlHas = (): boolean => document.documentElement.hasAttribute(PROOFREAD_MODE_ATTR);
const clearMode = (): void => document.documentElement.removeAttribute(PROOFREAD_MODE_ATTR);

beforeEach(clearMode);
afterEach(() => {
  cleanup();
  clearMode();
});

describe("真 DOM：默认宿主就是 `<html>`（假元素判不到这一层）", () => {
  it("不传元素 ⇒ `<html>` 上出现真属性，且 readProofreadMode 读得回来", () => {
    expect(htmlMode(), "起点必须干净，否则下面的断言会空真").toBeNull();
    applyProofreadMode("on");
    expect(document.documentElement.getAttribute("data-proofread-mode")).toBe("on");
    expect(readProofreadMode()).toBe("on");
    applyProofreadMode("off");
    expect(htmlHas(), "off 之后 `<html>` 上仍留着属性").toBe(false);
  });
});

describe("useProofreadMode：挂载不落属性 / 切换跟手 / 卸载清回", () => {
  it("挂载 ⇒ **缺省不落属性**（首屏 DOM 上不该多一个属性）", () => {
    expect(htmlHas()).toBe(false);
    renderHook(() => useProofreadMode());
    expect(htmlHas(), "缺省态就落了属性 ⇒ 违反规格 §4.3④「缺省不落属性」").toBe(false);
  });

  it("toggle 一次 ⇒ 属性出现且值逐字 \"on\"；再 toggle ⇒ **摘掉**（不是 \"off\"）", () => {
    const { result } = renderHook(() => useProofreadMode());
    expect(result.current[0]).toBe("off");
    act(() => result.current[1]());
    expect(htmlMode()).toBe("on");
    expect(result.current[0]).toBe("on");
    act(() => result.current[1]());
    expect(htmlHas(), "第二次 toggle 后属性还在（写成 \"off\" 也算落属性）").toBe(false);
    expect(readProofreadMode()).toBeNull();
  });

  it("卸载 ⇒ 清回常态（属性不残留）—— 防离开阅读面后墨度永久停在审校档", () => {
    const { result, unmount } = renderHook(() => useProofreadMode());
    act(() => result.current[1]());
    expect(htmlMode()).toBe("on");
    unmount();
    expect(htmlHas(), "卸载后残留 data-proofread-mode ⇒ 覆盖块对下一屏仍生效").toBe(false);
  });

  it("单一写入方：第二个实例挂载会按**自己的**缺省态把 `<html>` 清回常态 ⇒ 生产只许一处调用", () => {
    // 这条判的不是「多实例很安全」，恰恰相反：属性是**全局唯一**的载体，两个实例各持一份 state 必然互擦。
    // ⇒ T11 的入口按钮**必须**复用 `App.tsx` 的 `toggleProofread`（`useProofreadMode` 只调一次）。
    const a = renderHook(() => useProofreadMode());
    act(() => a.result.current[1]());
    expect(htmlMode()).toBe("on");
    const b = renderHook(() => useProofreadMode());
    expect(b.result.current[0], "第二个实例自持一份状态（缺省 off）").toBe("off");
    expect(htmlMode(), "第二个实例挂载即写 ⇒ 把第一个实例打开的模式位清掉了").toBeNull();
    b.unmount();
    a.unmount();
  });
});
