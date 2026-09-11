/**
 * @ai-context usePresence.node.test.ts — **真 node 环境**（**无** jsdom 环境指令）的守卫用例
 * （批 0-D Task 6 评审 Important ① 补充）。
 *
 * Why 单开一个文件：`usePresence.test.tsx` 是 jsdom（`renderHook` 需要 `document`），那里只能把
 * `matchMedia` **桩成 `undefined`** 来模拟"无 matchMedia"，**覆盖不到** `getMediaQueryList()` 的第一道
 * 守卫 `typeof window === "undefined"`（真 node 环境根本不存在 `window`）。而计划 Task 6 的验收项明写
 * 「**node 环境下不抛错**」⇒ 本文件就是那条验收的机器判据（评审者独立探针 `tmp/review-t6/node-guard-probe.mjs`
 * 已先证明可行，本文件把它固化成随 CI 跑的用例）。
 *
 * 手段：`react-dom/server` 的 `renderToString` —— node 无 DOM，`@testing-library/react` 用不了；但 SSR 会
 * 跑完**渲染阶段**（含 `useState` 的惰性初始化，那正是媒体查询的读取点）。断言全部落在渲染产物上（不靠
 * 外部变量捕获，避免 TS 控制流把捕获变量收窄成 `never`）。
 * **局限（诚实标注）**：SSR **不执行 `useEffect`** ⇒ 本文件只覆盖渲染路径；effect 路径的守卫由
 * 「`getMediaQueryList()` 是模块内唯一读取点、且自带两道守卫」这一点保证（`useReducedMotion` 的 effect 也调它）。
 *
 * 副作用：无（纯内存渲染；不写磁盘、不发请求、不挂计时器）。
 * 边界：**不得**加 jsdom 环境指令（仓规写法是 `@` + `vitest-environment` + 环境名）—— 加了就退化回 jsdom，
 * 两道守卫里的第一道 `typeof window === "undefined"` 测不到。⚠️ **该指令是「全文件文本扫描」的**：
 * 连注释里写出完整指令串都会被 vitest 当成指令识别（本文件初版就因此在 jsdom 下跑、`typeof window` 变成
 * `object`）⇒ 本文件刻意**不出现**该指令串（本段只用拆开的写法指代它）。
 * 本文件是 `.ts`（SSR 渲染无需 JSX），故用 `createElement` 而不是 JSX 语法。
 */
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { usePresence } from "./usePresence";

/** 把 hook 的返回值全部摊到 DOM 属性上（`renderToString` 不允许外部捕获，属性即观测面） */
function Probe({ open }: { open: boolean }): ReactElement {
  const presence = usePresence(open);
  return createElement("i", {
    "data-phase": presence.phase,
    "data-mounted": String(presence.mounted),
    "data-reduced": String(presence.reducedMotion),
    "data-handler": typeof presence.onTransitionEnd,
  });
}

describe("真 node 环境（无 window / document）：usePresence 不抛错", () => {
  it("环境事实：本文件确实跑在无 DOM 的 node 环境（否则下面的守卫分支根本没被测到）", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("open=true：renderToString 不抛错；reducedMotion=false（守卫按「不命中」处理，不是抛错）", () => {
    const html = renderToString(createElement(Probe, { open: true }));
    expect(html).toContain('data-reduced="false"');
    expect(html).toContain('data-mounted="true"');
    expect(html).toContain('data-phase="enter"');
    expect(html, "onTransitionEnd 即使是纯逻辑件也必须可用（T7 挂它，不需要 DOM）").toContain(
      'data-handler="function"',
    );
  });

  it("open=false：不抛错；初始态即终态（mounted=false / phase='exit'）", () => {
    const html = renderToString(createElement(Probe, { open: false }));
    expect(html).toContain('data-reduced="false"');
    expect(html).toContain('data-mounted="false"');
    expect(html).toContain('data-phase="exit"');
  });

  it("自定义 reducedMotionQuery 在 node 下同样不抛错（查询串照传，只是读不到环境）", () => {
    function Custom(): ReactElement {
      const presence = usePresence(true, { reducedMotionQuery: "(prefers-contrast: more)" });
      return createElement("i", { "data-reduced": String(presence.reducedMotion) });
    }
    expect(renderToString(createElement(Custom, {}))).toContain('data-reduced="false"');
  });
});
