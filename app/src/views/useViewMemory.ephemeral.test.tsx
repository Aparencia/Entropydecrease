// @vitest-environment jsdom
/**
 * useViewMemory.ephemeral.test.tsx — **非持久切换路径**的判据（批 7 T17 · §C11.2）。
 *
 * @ai-context 为什么单独一件：`useViewMemory.test.ts`（206 行）是 `@vitest-environment node` 的
 *   **SSR** 判据 —— 它自己写明「SSR 的 `useState` setter 是 no-op ⇒ setter 触发的重渲染不可观测」，
 *   而「非持久切换」的证据**恰恰是**「setter 跑了、视图键变了、但盘上没写」。故这里用 jsdom +
 *   真 `localStorage`（hook 的默认注入值）把两半都观测到：**键变了** ∧ **盘没写**。
 * @ai-context 两条对照（防「什么都没发生」的空真）：① `persist` 缺省（单参调用，= 既有全部调用点
 *   的形态）**必须写盘** —— 证明本件的观测面看得见写入；② 深链形态（`{persist:false}`）**不写盘**。
 *   两条走的是同一个选择器 ⇒ 差异只能来自那个选项。
 * 边界：只判「`view:default:{objectType}` 这个键」；hook 的其它语义（垃圾值回退 / Storage 抛异常
 *   降级）归 `useViewMemory.test.ts`，本件不重复。
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useViewMemory } from "./useViewMemory";

const KEY = "view:default:session";
const KEYS = ["raw", "tritrack", "proof"] as const;

/** 观测面：当前视图键 + 两个出口（缺省持久 / 深链非持久） */
function Probe() {
  const [key, select] = useViewMemory("session", "raw", KEYS);
  return (
    <div>
      <span data-testid="key">{key}</span>
      <button data-testid="persist" onClick={() => select("proof")} />
      <button data-testid="ephemeral" onClick={() => select("tritrack", { persist: false })} />
    </div>
  );
}

const shown = (): string => screen.getByTestId("key").textContent ?? "";
const click = (testId: string): void => {
  act(() => {
    screen.getByTestId(testId).click();
  });
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("§C11.2 非持久视图切换（T17）", () => {
  it("① 深链形态 `{persist:false}`：视图键切了，但 `localStorage` 一个键都没写", () => {
    render(<Probe />);
    expect(shown()).toBe("raw");
    click("ephemeral");
    expect(shown(), "非持久路径必须**切得动**（否则这条判据会被「什么都没发生」蒙过）").toBe("tritrack");
    expect(window.localStorage.getItem(KEY), "深链切视图写进了视图记忆（§C11.2 逐字禁止）").toBeNull();
    expect(window.localStorage.length, "非持久路径不得产生任何 storage 键").toBe(0);
  });

  it("② 既有形态（单参调用）**必须写盘** —— 证明观测面看得见写入（对照）", () => {
    render(<Probe />);
    click("persist");
    expect(shown()).toBe("proof");
    expect(window.localStorage.getItem(KEY), "缺省语义变了（既有调用点都靠它持久化）").toBe("proof");
  });

  it("③ 已有记忆不被改写：非持久切换后盘上仍是原值（「未被写入」与「未被改变」两半都钉住）", () => {
    window.localStorage.setItem(KEY, "proof");
    render(<Probe />);
    expect(shown(), "有记忆 ⇒ 取记忆值（既有语义）").toBe("proof");
    click("ephemeral");
    expect(shown()).toBe("tritrack");
    expect(window.localStorage.getItem(KEY), "一次深链把用户的默认视图改掉了").toBe("proof");
  });
});
