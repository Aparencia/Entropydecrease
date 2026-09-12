// @vitest-environment jsdom
/**
 * @ai-context LiveBar.test.tsx — 采集态 LIVE 仪表条的 **jsdom 面**判据（批 6 Task 18 Step 4）。
 *
 * Why 每条判据各带**专属变异体**（R8.6 / R41.7：主闸是**期望比对**，`ran > 0` 只是旁证）：
 *   · L1 高度消费 **T17 落真的新 token**：根元素 `style.height` 逐字 == `var(--ed-nav-h-live, 58px)`
 *     ∧ 该 token 在真源 `ui/tokens.css` 里定值 58px ∧ **旧 token 仍是 56px**（R4.1 的要点 = 不改旧值
 *     就能拿到采集态 58px ⇒ 零既有断言改动）⇒ 变异体 = 改回 `var(--ed-nav-h, 56px)`。
 *   · L2 四件落点齐备（波形 / 计时 / 暂停 / 标记 / 停止），计时经 `utils/fmt.ts` 的 **`fmtMs` 唯一出口**
 *     ⇒ 变异体 = 把 `fmtMs(elapsedMs)` 换成字面量 `"00:00"`。
 *   · L3 三键各自的回调**各被调用一次**且不串台（逐序计数数组）⇒ 变异体 = 对调「标记 / 停止」两个 handler。
 *   · L4 `paused` 的三处语义（`data-paused` / 琥珀徽标**仅在暂停时存在** / 暂停键可访问名翻转）
 *     ⇒ 变异体 = 去掉徽标的存在性门控（恒渲染 ⇒ 未暂停态红）。
 *   · L5 `live:audio-level` 的接线与**卸载退订**（照 `AudioLevelMeter.tsx:50-56` 的既有范式）
 *     ⇒ 变异体 = 删掉 cleanup 里的 `void unlisten.then((fn) => fn())`。
 *   · L6 环境层落点在**三档下都存在**（§8.5：节能档只留响应层 ⇒ 脉冲必须仍被 eco 块覆写到 1ms/1 次）
 *     ∧ 标准档周期落在 §8.1 的 **2–6s 带** ⇒ 变异体 = 从 className 里摘掉脉冲修饰类。
 *
 * 副作用：无（只挂载 jsdom 容器；`@tauri-apps/api/event` 的 `listen` **按仓内既有范式桩掉**，
 *   绝不连真后端）。边界：jsdom 无排版引擎 ⇒ 判得到「属性 / 文案 / 类名 / 交叉文件契约」，
 *   **判不到**「真的 58px」「真的零 chrome」（像素面归 headless 抽检与批 8；报告 `## 诚实边界` 单列）。
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { AMBIENT_ITEMS } from "../motion/env";
import LiveBar, { LIVE_BAR_HEIGHT, LIVE_PAUSE_LABELS, LIVE_PULSE_CLASS } from "./LiveBar";
import type { LiveBarProps } from "./LiveBar";

/** 订阅按仓内既有范式桩掉（`confirmMigration.test.tsx` / `KnowledgePage.test.tsx` 同款）。 */
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

afterEach(() => {
  cleanup();
  vi.mocked(listen).mockClear();
});

const HERE = dirname(fileURLToPath(import.meta.url));
/** 唯一真源产物（T17 落真的 58px 在这里，不在任何 `.tsx` 里）。 */
const TOKENS_CSS = readFileSync(join(HERE, "..", "ui", "tokens.css"), "utf8");
/** T13 落的环境层 seam 与三档块都在这里（`.css` 不在门禁视野 ⇒ 交叉文件绑定只能由判据承担）。 */
const MOTION_CSS = readFileSync(join(HERE, "..", "ui", "primitives", "motion.css"), "utf8");

/** `live:audio-level` 的载荷（与组件内的接口同形；测试侧独立声明，避免从实现里取类型）。 */
type LevelEvent = { payload: { rms: number; clipping: boolean } };

const noop = (): void => undefined;

/** 挂载一条仪表并返回它的根元素（`data-testid="live-bar"`）。 */
function renderBar(props: Partial<LiveBarProps> = {}): HTMLElement {
  render(<LiveBar elapsedMs={0} paused={false} onTogglePause={noop} onMark={noop} onStop={noop} {...props} />);
  const el = document.body.querySelector<HTMLElement>('[data-testid="live-bar"]');
  if (el === null) throw new Error("找不到仪表条根元素（data-testid=live-bar）");
  return el;
}

const byId = (id: string): HTMLElement => {
  const el = document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (el === null) throw new Error(`找不到 ${id}`);
  return el;
};

/** 最近一次订阅的 `[事件名, 回调]`（`listen` 在挂载 effect 里被同步调用）。 */
function lastSubscription(): [unknown, (e: LevelEvent) => void] {
  const calls = vi.mocked(listen).mock.calls;
  expect(calls.length, "本组件根本没订阅 live:audio-level").toBeGreaterThan(0);
  return calls[calls.length - 1] as unknown as [unknown, (e: LevelEvent) => void];
}

/** `motion.css` 里某条规则的规则体（`selector {` → 首个 `}`）。 */
function ruleBody(selector: string): string {
  const at = MOTION_CSS.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`motion.css 里找不到规则 ${selector}`);
  return MOTION_CSS.slice(at, MOTION_CSS.indexOf("}", at));
}

describe("L1 · 高度消费 T17 的新 token（逐字）", () => {
  it("根元素 style.height 逐字 == var(--ed-nav-h-live, 58px)，且该 token 在真源里定值 58px", () => {
    const el = renderBar();
    expect(el.style.height, "高度必须逐字走新 token（连同值兜底）").toBe(LIVE_BAR_HEIGHT);
    expect(LIVE_BAR_HEIGHT).toBe("var(--ed-nav-h-live, 58px)");
    expect(TOKENS_CSS, "真源里没有 --ed-nav-h-live: 58px ⇒ 上面的兜底变成唯一真源").toContain(
      "--ed-nav-h-live: 58px;",
    );
    expect(TOKENS_CSS, "R4.1：旧 token 必须仍是 56px（改它会让既有兜底绑定判据无处成立）").toContain(
      "--ed-nav-h: 56px;",
    );
  });
});

describe("L2 · 四件落点齐备（波形 / 计时 / 暂停 / 标记 / 停止）", () => {
  it("波形子件在位 · 三键文案逐序 · 计时经 fmtMs 唯一出口（三个读数）", () => {
    const el = renderBar({ elapsedMs: 0 });
    expect(el.querySelector('[data-testid="live-waveform"]'), "波形（R4.3 的承载面）不在条上").not.toBeNull();
    expect(["live-pause", "live-mark", "live-stop"].map((id) => byId(id).textContent)).toEqual([
      LIVE_PAUSE_LABELS.running, "标记", "停止",
    ]);
    expect(byId("live-elapsed").textContent).toBe("00:00");
    cleanup();
    renderBar({ elapsedMs: 65_000 });
    expect(byId("live-elapsed").textContent, "65s ⇒ mm:ss").toBe("01:05");
    cleanup();
    renderBar({ elapsedMs: 3_600_000 });
    expect(byId("live-elapsed").textContent, "≥1h ⇒ h:mm:ss（fmtMs 的第二分支）").toBe("1:00:00");
  });
});

describe("L3 · 三键各自的回调（各一次 · 不串台）", () => {
  it("逐键点击 ⇒ 逐序计数数组 [暂停, 标记, 停止] 各出现一次", () => {
    const calls: string[] = [];
    renderBar({
      onTogglePause: () => calls.push("pause"),
      onMark: () => calls.push("mark"),
      onStop: () => calls.push("stop"),
    });
    fireEvent.click(byId("live-pause"));
    expect(calls, "点暂停键只许触发 onTogglePause").toEqual(["pause"]);
    fireEvent.click(byId("live-mark"));
    expect(calls).toEqual(["pause", "mark"]);
    fireEvent.click(byId("live-stop"));
    expect(calls, "三键各一次、顺序 = 点击顺序（串台 / 漏接都红在这条）").toEqual([
      "pause", "mark", "stop",
    ]);
  });
});

describe("L4 · paused 的三处语义（受控：本件不自己翻转状态）", () => {
  it("未暂停：data-paused=false · 无琥珀徽标 · 暂停键文案 = 暂停", () => {
    const el = renderBar({ paused: false });
    expect(el.getAttribute("data-paused")).toBe("false");
    expect(el.querySelector('[data-testid="live-paused-badge"]'), "未暂停时不许有暂停徽标").toBeNull();
    expect(byId("live-pause").textContent).toBe(LIVE_PAUSE_LABELS.running);
  });

  it("暂停：data-paused=true · 徽标在且走琥珀族类 `ed-text--due`（R4.5）· 文案翻成「继续」", () => {
    const el = renderBar({ paused: true });
    expect(el.getAttribute("data-paused")).toBe("true");
    const badge = byId("live-paused-badge");
    expect(badge.className.split(/\s+/), "暂停徽标必须走 --ed-due 族（R4.5 逐字「采集暂停色也是琥珀族」）").toContain(
      "ed-text--due",
    );
    expect(byId("live-pause").textContent, "播放/暂停控制换可访问名（不用 aria-pressed）").toBe(
      LIVE_PAUSE_LABELS.paused,
    );
  });

  it("可访问名与 `data-paused` **必须同步翻转**（只翻其中一个 ⇒ 本条红 —— 名翻转本身有牙）", () => {
    const pairs = [false, true].map((p) => {
      cleanup();
      const el = renderBar({ paused: p });
      return [el.getAttribute("data-paused"), byId("live-pause").textContent];
    });
    expect(pairs, "逐序成对 [data-paused, 可访问名]：两态都必须换（只翻属性不换名 = 屏幕阅读器读到旧动作）").toEqual([
      ["false", LIVE_PAUSE_LABELS.running],
      ["true", LIVE_PAUSE_LABELS.paused],
    ]);
  });
});

describe("L5 · live:audio-level 接线（内部订阅）与卸载退订", () => {
  it("订阅名逐字 · 载荷接到波形（data-lit / data-clipping）", () => {
    renderBar();
    const [event, handler] = lastSubscription();
    expect(event, "订阅的事件名逐字").toBe("live:audio-level");
    act(() => handler({ payload: { rms: 1, clipping: true } }));
    const wave = byId("live-waveform");
    expect(wave.getAttribute("data-clipping")).toBe("true");
    expect(wave.getAttribute("data-lit"), "rms=1 ⇒ 满格（载荷真的到了波形上）").toBe(wave.getAttribute("data-bars"));
    act(() => handler({ payload: { rms: 0, clipping: false } }));
    expect(byId("live-waveform").getAttribute("data-lit")).toBe("0");
  });

  it("卸载 ⇒ 调用 unlisten 恰一次（照 AudioLevelMeter.tsx:50-56 的清理范式，防卸载后 setState）", async () => {
    const off = vi.fn();
    vi.mocked(listen).mockImplementationOnce(
      (() => Promise.resolve(off)) as unknown as typeof listen,
    );
    const { unmount } = render(
      <LiveBar elapsedMs={0} paused={false} onTogglePause={noop} onMark={noop} onStop={noop} />,
    );
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(off, "卸载没有退订（`void unlisten.then((fn) => fn())` 被删掉了？）").toHaveBeenCalledTimes(1);
  });
});

describe("L6 · 环境层落点在**三档下都存在**（§8.5）+ 周期守 §8.1 的 2–6s 带", () => {
  it("脉冲修饰类落在真 DOM 上，且它=T13 登记的环境层 seam（keyframes ↔ 选择器逐序绑定）", () => {
    const el = renderBar();
    expect(el.className.split(/\s+/), "脉冲落点不在根元素上 ⇒ 采集态「不呼吸」").toContain(LIVE_PULSE_CLASS);
    expect(
      AMBIENT_ITEMS.map((i) => `${i.keyframes}@${i.selector}`),
      "环境层登记表里没有这条 seam ⇒ 本件消费的是个未登记的名字",
    ).toContain(`ed-capture-pulse@.${LIVE_PULSE_CLASS}`);
  });

  it("三档块都覆写它（eco ⇒ 1ms/1 次即止）· reduced-motion 名单含它 · 标准档周期 ∈ [2000, 6000]ms", () => {
    expect(MOTION_CSS).toContain(`html[data-motion="eco"] .${LIVE_PULSE_CLASS}`);
    expect(MOTION_CSS).toContain(`html[data-motion="rich"] .${LIVE_PULSE_CLASS}`);
    expect(MOTION_CSS, "reduced-motion 名单漏了它 ⇒ 关掉动效的用户仍会看到脉冲").toContain(
      `.${LIVE_PULSE_CLASS},`,
    );
    const body = ruleBody(`.${LIVE_PULSE_CLASS}`);
    const period = /animation:\s*ed-capture-pulse\s+calc\(var\(--[a-z-]+,\s*(\d+)ms\)\s*\*\s*(\d+)\)/.exec(body);
    expect(period, "标准档周期必须从唯一真源以 calc() 倍数派生（R16.3④：不新造时长字面量）").not.toBeNull();
    const periodMs = Number(period?.[1]) * Number(period?.[2]);
    expect(periodMs >= 2000 && periodMs <= 6000, `环境层周期 ${periodMs}ms 必须落在 §8.1 的 2–6s 带`).toBe(true);
  });
});
