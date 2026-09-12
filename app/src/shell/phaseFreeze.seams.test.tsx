// @vitest-environment jsdom
/**
 * @ai_context phaseFreeze.seams.test.tsx — #3「相变凝固」的**接缝面**判据（批 6 波 C · T29）。
 *
 * Why 与 `usePhaseFreeze.test.tsx` 分成两件（判据纪律：新文件一律 ≤300，按语义拆）：那个文件判**编排层的
 *   行为**（持有 / 可反向 / 可中断 / 三档 / 降级 / 属性集合，全部走 `paused` + `freezeAt` 的确定性时基）；
 *   本文件判**两处接缝**——① `motion.css` 的「琥珀退去」节（R4.5 逐字锁，纯文本面）；
 *   ② `LiveBar` 的真实接线（墨度层 = GSAP 目标、波形吃到 `freeze`、LIVE 仪表走琥珀族）。
 *
 * 每条判据 ↔ 专属变异体（读数见 task-29-report.md；变异体只在 `git archive` 导出副本里做）：
 *   S1 ↔ 退去规则写 `#d97706`（新造琥珀值）· S1b ↔ 写 `--ed-ink-2`（越出 `--ed-due` 族）·
 *   S2 ↔ 摘掉 `PhaseChrome` 的 `phase` 转发（`LiveBar` 恒 capture ⇒ 墨度层永不被写）。
 *
 * 副作用：挂载 jsdom 容器（`LiveBar` 内部订阅 `live:audio-level` —— 按仓内既有范式桩掉，绝不连真后端）。
 * 边界：jsdom **不做 CSS 级联** ⇒ S1 判的是规则文本（不是"真的退成了 0.72"）；像素面进报告 `## 诚实边界`。
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { DUE_INK_NORMAL } from "./usePhaseFreeze";
import LiveBar from "./LiveBar";
import PhaseChrome from "./PhaseChrome";
import type { ShellPhase } from "./shellPhase";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve("ok")) }));
vi.mock("../hooks/useLiveCaptureControl", () => ({
  useCaptureControl: () => ({
    active: false, pausedReason: null,
    pause: () => Promise.resolve({ ok: true }), resume: () => Promise.resolve({ ok: true }), stop: () => Promise.resolve({ ok: true }),
  }),
}));
afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const MOTION_CSS = readFileSync(join(HERE, "..", "ui", "primitives", "motion.css"), "utf8");
const HOOK_SRC = readFileSync(join(HERE, "usePhaseFreeze.ts"), "utf8");
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
/** 琥珀的既有字面量（这三个只在 `AudioLevelMeter.tsx` 里是存量；R4.5 逐字「不许新造琥珀值」）。 */
const AMBER_LITERALS = /#f59e0b|#d97706|#b45309/gi;
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/;
const BEGIN = "/* ▼▼▼ 琥珀退去（T29";
const END = "▲▲▲ 琥珀退去结束（T29）▲▲▲ */";

/** `motion.css` 里「琥珀退去」节的**规则文本**（剥注释；切片标记缺失即抛，守卫不许静默退化成空真）。 */
function retreatSection(): string {
  const at = MOTION_CSS.indexOf(BEGIN);
  const end = MOTION_CSS.indexOf(END);
  if (at < 0 || end < at) throw new Error("motion.css 里找不到「琥珀退去」节（切片标记被改名？）");
  return stripComments(MOTION_CSS.slice(at, end + END.length));
}

const need = (sel: string): HTMLElement => {
  const el = document.body.querySelector<HTMLElement>(sel);
  if (el === null) throw new Error(`找不到元素：${sel}`);
  return el;
};
/**
 * 动态 import 的等待窗口（**不是**动画的等待窗口）：`controls.ts` 首次被转换要连带 `gsap` 家族，
 * 全量并行跑时实测可超过 `waitFor` 的 1000ms 默认值（本批已知 6 个负载敏感 flake 的同族：
 * 首轮提交树全量里本文件恰因它红过一次）⇒ 只放宽**等待上限**，断言一字不改。
 */
const WAIT = { timeout: 5000 } as const;

describe("S1 · 琥珀退去（R4.5）：只引 `--ed-due` 族、零颜色字面量、零 `--ed-*` 定义", () => {
  it("退去规则逐条：琥珀族引用非空 · 越族引用为空 · 无色值字面量 · 覆盖复习态", () => {
    const sec = retreatSection();
    expect(sec.length, "本节读空了 ⇒ 下面是空真").toBeGreaterThan(120);
    const tokens = [...sec.matchAll(/var\((--ed-[A-Za-z0-9-]+)[,\s)]/g)].map((m) => m[1]);
    expect(tokens, "退去规则必须引用琥珀族（引用为空 = 锁没落地）").toContain("--ed-due");
    expect(tokens.filter((t) => !t.startsWith("--ed-due")), "退去只许引 `--ed-due` 族").toEqual([]);
    expect(sec, "退去规则出现颜色字面量（色值只在 tokens.css 与生成器）").not.toMatch(COLOR_LITERAL);
    expect(sec.match(/--ed-[a-z0-9-]+\s*:/g) ?? [], "motion.css 不许定义 --ed-* 变量").toEqual([]);
    // 相位侧必须覆盖**复习态**（计划 Step 3 写作 `="idle"` 会把零 chrome 的复习态漏成「仍在采集」）
    expect(sec, "退去的相位键写成 `idle` 会漏掉复习态").toContain(':not([data-shell-phase="capture"])');
  });

  it("全仓这两件里 `#f59e0b / #d97706 / #b45309` 0 命中（仪器双侧自证）", () => {
    const hits = [["motion.css", MOTION_CSS], ["usePhaseFreeze.ts", HOOK_SRC]].flatMap(([name, src]) =>
      [...stripComments(src).matchAll(AMBER_LITERALS)].map((m) => `${name}: ${m[0]}`),
    );
    expect(hits, "新造琥珀值（R4.5 明禁）").toEqual([]);
    expect(
      [..."background: #d97706".matchAll(AMBER_LITERALS)].map((m) => m[0]),
      "扫描器对已知样本必须报出来 ⇒ 上面的 0 命中才是证据",
    ).toEqual(["#d97706"]);
  });
});

describe("S2 · 接线：`LiveBar` 的墨度层与波形真的接上了编排层", () => {
  const noop = (): void => undefined;
  const bar = (phase: ShellPhase): ReactElement => (
    <LiveBar elapsedMs={0} paused={false} phase={phase} onTogglePause={noop} onMark={noop} onStop={noop} />
  );
  /** 最近一次订阅的载荷回调（照 `LiveBar.test.tsx` 的既有范式：桩掉 `listen` 后手动喂一帧读数）。 */
  function lastLevelHandler(): (e: { payload: { rms: number; clipping: boolean } }) => void {
    const calls = vi.mocked(listen).mock.calls;
    if (calls.length === 0) throw new Error("本件根本没订阅 live:audio-level");
    return calls[calls.length - 1][1] as unknown as (e: { payload: { rms: number; clipping: boolean } }) => void;
  }

  it("相位翻转 ⇒ 墨度层被编排层写（方向朝常态档）；LIVE 仪表走琥珀族；波形吃到 `freeze`", async () => {
    const view = render(bar("capture"));
    const layer = need('[data-testid="live-ink"]');
    expect(need('[data-testid="live-meter"]').className.split(/\s+/), "LIVE 仪表是琥珀族（R4.5）").toContain(
      "ed-status--warn",
    );
    const wave = need('[data-testid="live-waveform"]');
    expect(wave.getAttribute("data-bars"), "波形仍是 T18 的 32 条").toBe("32");
    expect(layer.style.opacity, "相位未变（capture）⇒ hook 零动作").toBe("");
    // 喂一帧真实读数的形态（rms 0.1 ⇒ 部分点亮）⇒ 条高必须**不止一个值**（= 波形还在，且 freeze=0）
    act(() => lastLevelHandler()({ payload: { rms: 0.1, clipping: false } }));
    const shapes = new Set([...wave.children].map((b) => (b as HTMLElement).style.transform));
    expect(shapes.size, "freeze=0 下条高只有一种 ⇒ 波形没接上（或已收束）").toBeGreaterThan(1);
    expect([...shapes].every((t) => t.startsWith("scaleY(")), "几何只经 scaleY 表达（R8.4）").toBe(true);

    view.rerender(bar("idle"));
    await waitFor(() => expect(layer.style.opacity, "相位翻转后墨度层必须被编排层写").not.toBe(""), WAIT);
    const v = Number.parseFloat(layer.style.opacity);
    // 生产侧时间线**不 paused**（ticker 驱动）⇒ 只断「落在 [常态档, 满墨] 之间、方向朝常态档」；
    // 逐端点的精确读数归 `usePhaseFreeze.test.tsx` 的 F2/F3（那是 paused + `freezeAt` 的确定性面）。
    expect(v, "退去方向：墨度只许落在 [常态档, 满墨] 之间").toBeGreaterThanOrEqual(DUE_INK_NORMAL - 0.005);
    expect(v).toBeLessThanOrEqual(1.005);
  });
});

describe("S3 · 相位从 `PhaseChrome` 真的转发到了编排层（缺这一条，接线可以静默断掉）", () => {
  it("`PhaseChrome` 的相位翻转 ⇒ 它内部 LIVE 仪表的墨度层被写（捕获 → 常态）", async () => {
    const view = render(<PhaseChrome phase="capture"><i /></PhaseChrome>);
    const layer = need('[data-testid="live-ink"]');
    expect(layer.style.opacity, "挂载时相位未变 ⇒ hook 零动作").toBe("");
    view.rerender(<PhaseChrome phase="idle"><i /></PhaseChrome>);
    await waitFor(
      () => expect(layer.style.opacity, "`LiveBarHost` 没拿到相位（转发断了）⇒ 编排层永远零动作").not.toBe(""),
      WAIT,
    );
    const v = Number.parseFloat(layer.style.opacity);
    expect(v, "退去方向朝常态档").toBeGreaterThanOrEqual(DUE_INK_NORMAL - 0.005);
    expect(v).toBeLessThanOrEqual(1.005);
  });
});
