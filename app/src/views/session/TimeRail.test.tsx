// @vitest-environment jsdom
/**
 * TimeRail.test.tsx — 共享时间轴尺的**行为级契约**（批 6 T25 Step 1 · R5.5 #5 的承载面）。
 *
 * @ai-context 本件覆盖「尺」这一半：刻度的**序列**（逐序相等，不是「约等于」）· 刻度文案
 *   = `fmtMs` 的输出 · 轨道宽度 = 总长的像素换算（换总长就换宽度）。播放头、`<audio>` 属性契约
 *   与降级提示行是 T25 的第二步（同一个文件里随后追加，见 `task-25-report.md` 的 V1–V7）。
 * @ai-context 仪器边界：jsdom **不排版** ⇒ 只判结构事实（`data-tick-ms` 序列、行内宽度、
 *   DOM 归属），**不判**「刻度看起来在哪」。
 * 副作用：只挂 React 树；不写盘、不发请求、不碰媒体。
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TimeRail, { pxOf, ticksOf } from "./TimeRail";

const RAIL = '[data-testid="session-timerail"]';
const VIEWPORT = '[data-testid="session-timerail-viewport"]';

function mount(totalMs: number) {
  const view = render(<TimeRail totalMs={totalMs} />);
  const ticks = [...view.container.querySelectorAll("[data-tick-ms]")] as HTMLElement[];
  return { ...view, ticks };
}
afterEach(cleanup);

describe("尺的刻度：序列与文案都逐字（自己实现一个格式化会当场露馅）", () => {
  it("130000ms ⇒ 刻度逐序 [0,60000,120000]、文案逐序 [00:00,01:00,02:00]；单测 `ticksOf`", () => {
    const { ticks } = mount(130_000);
    expect(ticks.map((el) => Number(el.dataset.tickMs)), "刻度序列漂了（或漏了末格前的一格）").toEqual([0, 60_000, 120_000]);
    expect(ticks.map((el) => el.textContent), "刻度文案不是 `fmtMs` 的输出").toEqual(["00:00", "01:00", "02:00"]);
    expect(ticksOf(130_000)).toEqual([0, 60_000, 120_000]);
    expect(ticksOf(0)).toEqual([0]);
    // 反例守卫：过一小时的会话出 h:mm:ss（`Math.floor(ms/1000)+"s"` 给不出它）
    cleanup();
    const hour = mount(3_725_000);
    expect(hour.ticks.at(-1)?.textContent).toBe("1:02:00");
  });
});

describe("轨的宽度 = 总长的像素换算（不是常量、也不是视口宽）", () => {
  it("120000ms ⇒ 120px；换 30000ms ⇒ 30px（常数实现当场红），且刻度都在轨子树里", () => {
    const { container } = mount(120_000);
    const track = container.querySelector(".ed-timerail__track");
    if (track === null) throw new Error("没有渲染出轨道");
    expect((track as HTMLElement).style.width).toBe("120px");
    expect(track.querySelectorAll("[data-tick-ms]").length, "刻度不在轨道子树里（尺就没画出来）").toBe(3);
    expect(container.querySelector(RAIL)?.contains(container.querySelector(VIEWPORT))).toBe(true);
    expect([0, 52_500, 90_000, 120_000].map(pxOf)).toEqual([0, 52.5, 90, 120]);

    cleanup();
    const short = mount(30_000);
    expect((short.container.querySelector(".ed-timerail__track") as HTMLElement).style.width, "轨宽是常量/写死的").toBe("30px");
    expect(short.ticks.map((el) => el.textContent)).toEqual(["00:00"]);
  });
});
