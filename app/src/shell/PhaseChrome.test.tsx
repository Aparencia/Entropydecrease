// @vitest-environment jsdom
/**
 * @ai-context PhaseChrome.test.tsx — 相变 chrome 的两态叠层 + LIVE 仪表**接线宿主**的 jsdom 面判据
 *   （批 6 T19；规格 §6.3 / §8.4 / R4.4 / R46②）。
 *
 * Why 每条判据各带**专属变异体**（R8.6 / R41.7：主闸是**期望比对**，`ran > 0` 只是旁证）：
 *   · C1 叠层**恰两层、逐序**（`[idle, live]`）且三层类名逐字来自导出的常量
 *     ⇒ 变异体 = 对调两层顺序（交叉淡入的方向语义随之反转）。
 *   · C2 三个相位下 `inert` 的**逐序矩阵**（含回切）⇒ 变异体 = 给两层写同一个 `inert={false}`
 *     （不可见的那层会变成可 Tab 聚焦 = 「零 chrome」变成视觉假话）。
 *   · C3 常态 chrome 的 children 只落在 idle 层里 ⇒ 变异体 = 把 children 渲染到 live 层。
 *   · C4 三键各自打到**自己的**动作上、`onMark` 打的是**既有命令名** `save_user_screenshot`
 *     （逐序计数数组）⇒ 变异体 = 把 `onStop` 接到 `pause()`（停止键会变成暂停）。
 *   · C5 `paused` 的两处语义（`data-paused` + 暂停键可访问名翻转）逐序 ⇒ 变异体 = 恒传 `paused={false}`。
 *   · C6 `elapsedMs` **只在采集中**走表（不采集时连计时器都不起）⇒ 变异体 = 删掉 `if (!active)` 那一支
 *     （不采集也在走表 = 仪表报假读数）。
 *
 * 副作用：只挂 jsdom 容器；`@tauri-apps/api/{core,event}` 与**采集单一状态源**按仓内既有范式桩掉
 *   （`LiveBar.test.tsx` / `KnowledgePage.test.tsx` 同款），绝不连真后端。
 * 边界：jsdom 无排版引擎 ⇒ 判得到「层序 / 类名 / 属性 / 接线」，**判不到**「真的交叉淡入了 220ms」
 *   「真的零 chrome」（像素与合成器面进报告 `## 诚实边界`）。
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { fmtMs } from "../utils/fmt";
import PhaseChrome, {
  LiveBarHost,
  PHASE_CHROME_CLASS,
  PHASE_IDLE_CLASS,
  PHASE_LIVE_CLASS,
} from "./PhaseChrome";
import type { ShellPhase } from "./shellPhase";

/** 采集单一状态源的桩：`LiveBarHost` 只消费 `active` / `pausedReason` / 三个动作（其余面不碰）。 */
const host = vi.hoisted(() => ({
  control: {
    active: false,
    pausedReason: null as "manual" | "media" | "foreground" | null,
    pause: vi.fn(() => Promise.resolve({ ok: true })),
    resume: vi.fn(() => Promise.resolve({ ok: true })),
    stop: vi.fn(() => Promise.resolve({ ok: true })),
  },
}));
vi.mock("../hooks/useLiveCaptureControl", () => ({ useCaptureControl: () => host.control }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve("ok")) }));

beforeEach(() => {
  host.control.active = false;
  host.control.pausedReason = null;
  host.control.pause.mockClear();
  host.control.resume.mockClear();
  host.control.stop.mockClear();
  vi.mocked(invoke).mockClear();
});
afterEach(cleanup);

/** 取一个必须存在的元素（缺了就抛 —— 不许用 `!` 把缺失静默成 `undefined`）。 */
function need(selector: string): HTMLElement {
  const el = document.body.querySelector<HTMLElement>(selector);
  if (el === null) throw new Error(`找不到元素：${selector}`);
  return el;
}
const byId = (id: string): HTMLElement => need(`[data-testid="${id}"]`);
/** 一次快照：`[idle 层 inert?, live 层 inert?, 容器 data-phase]`（逐序比对用）。 */
const snapshot = (): readonly [boolean, boolean, string | null] => [
  byId("phase-idle").hasAttribute("inert"),
  byId("phase-live").hasAttribute("inert"),
  byId("phase-chrome").getAttribute("data-phase"),
];

describe("C1~C3 两态叠层的结构、`inert` 矩阵与 children 归属", () => {
  it("C1：容器恰两层、逐序 [phase-idle, phase-live]，三层类名逐字 == 导出的常量", () => {
    const { container } = render(
      <PhaseChrome phase="idle">
        <span data-testid="idle-probe">A′ 顶栏</span>
      </PhaseChrome>,
    );
    const chrome = container.querySelector<HTMLElement>('[data-testid="phase-chrome"]');
    if (chrome === null) throw new Error("相变容器没渲染出来");
    const layers = [...chrome.children] as HTMLElement[];
    expect(layers.map((l) => l.getAttribute("data-testid")), "两态叠层的层序变了（交叉淡入方向随之反转）").toEqual([
      "phase-idle",
      "phase-live",
    ]);
    expect(
      [chrome.className, ...layers.map((l) => l.className)],
      "类名是**跨文件契约**：相位块的选择器靠它们命中（改一边必红）",
    ).toEqual([PHASE_CHROME_CLASS, PHASE_IDLE_CLASS, PHASE_LIVE_CLASS]);
    expect(layers.length, "多出第三层 = 容器高度出现第二个竞争者").toBe(2);
  });

  it("C2：`inert` 在三个相位下的逐序矩阵（含回切）—— 不可见的那层必须不可聚焦", () => {
    const phases: readonly ShellPhase[] = ["idle", "capture", "review", "capture", "idle"];
    const { rerender } = render(
      <PhaseChrome phase="idle">
        <i />
      </PhaseChrome>,
    );
    const rows = phases.map((phase, i) => {
      if (i > 0) rerender(<PhaseChrome phase={phase}><i /></PhaseChrome>);
      return snapshot();
    });
    expect(rows, "idle ⇒ 常态层可交互；capture ⇒ 采集层可交互；review ⇒ 两层都不可交互").toEqual([
      [false, true, "idle"],
      [true, false, "capture"],
      [true, true, "review"],
      [true, false, "capture"],
      [false, true, "idle"],
    ]);
  });

  it("C3：常态 chrome（children）只落在 idle 层里，live 层里只有 LIVE 仪表", () => {
    render(
      <PhaseChrome phase="capture">
        <span data-testid="idle-probe">A′ 顶栏</span>
      </PhaseChrome>,
    );
    expect(byId("phase-idle").querySelector('[data-testid="idle-probe"]'), "常态 chrome 丢了").toBeTruthy();
    expect(byId("phase-live").querySelector('[data-testid="idle-probe"]'), "常态 chrome 落进了采集层").toBeNull();
    expect(byId("phase-live").querySelector('[data-testid="live-bar"]'), "采集层里没有 LIVE 仪表").toBeTruthy();
    expect(byId("phase-idle").querySelector('[data-testid="live-bar"]')).toBeNull();
  });
});

describe("C4~C6 LIVE 仪表接线宿主：三键 / 暂停语义 / 计时窗口", () => {
  it("C4：三键各自打到自己的动作上，`onMark` 打的是**既有命令名**（逐序计数数组）", () => {
    host.control.active = true;
    render(<LiveBarHost />);
    fireEvent.click(byId("live-pause"));
    fireEvent.click(byId("live-mark"));
    fireEvent.click(byId("live-stop"));
    expect([
      host.control.pause.mock.calls.length,
      host.control.resume.mock.calls.length,
      host.control.stop.mock.calls.length,
      vi.mocked(invoke).mock.calls.map((c) => c[0]),
    ]).toEqual([1, 0, 1, ["save_user_screenshot"]]);
  });

  it("C4 变体：暂停中按「继续」走 resume（不串台到 pause）", () => {
    host.control.active = true;
    host.control.pausedReason = "manual";
    render(<LiveBarHost />);
    fireEvent.click(byId("live-pause"));
    expect([host.control.resume.mock.calls.length, host.control.pause.mock.calls.length]).toEqual([1, 0]);
  });

  it("C5：`pausedReason` 逐序映射到 `data-paused` + 暂停键可访问名（null ⇒ 暂停 / 非 null ⇒ 继续）", () => {
    const cases: ReadonlyArray<"manual" | null> = [null, "manual", null];
    const { rerender } = render(<LiveBarHost />);
    const rows = cases.map((reason, i) => {
      host.control.pausedReason = reason;
      if (i > 0) rerender(<LiveBarHost />);
      const bar = byId("live-bar");
      return [bar.getAttribute("data-paused"), byId("live-pause").textContent ?? ""] as const;
    });
    expect(rows).toEqual([
      ["false", "暂停"],
      ["true", "继续"],
      ["false", "暂停"],
    ]);
  });

  it("C6：`elapsedMs` 只在采集进行中走表（不采集时连计时器都不起）", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<LiveBarHost />);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      const idleReading = byId("live-elapsed").textContent ?? "";
      host.control.active = true;
      rerender(<LiveBarHost />);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      const liveReading = byId("live-elapsed").textContent ?? "";
      expect([idleReading, liveReading], "不采集也在走表 = 仪表报假读数").toEqual([fmtMs(0), fmtMs(3000)]);
      expect([idleReading, liveReading]).toEqual(["00:00", "00:03"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
