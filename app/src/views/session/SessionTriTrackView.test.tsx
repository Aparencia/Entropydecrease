// @vitest-environment jsdom
/**
 * SessionTriTrackView.test.tsx — 会话「三轨对齐」视图的**行为级契约**（批 5 · T7 · C2/C14/C15）。
 *
 * @ai-context 五条判据（对计划 Task 7 Step 3 的 T1–T5 逐条兑现，编号一一对应）。
 *   **C14② 要求「每个视图组件的第一条判据是不 invoke」⇒ 文件里 `it` 的**物理首条**是 T4**
 *   （计划表格里的第 4 行）—— 编号照计划、次序照裁决，两者不冲突。
 *   T4 不 invoke 且不带 Tauri：① 注入 `invoke` spy 后把**三轨非空**与**整块空态**两条路径都渲染
 *      一遍 ⇒ `invoke` **零调用**（视图不取数的机器判据）；② 源码级：`views/**` 的**生产文件**
 *      `@tauri-apps` **import 边** = 0（含 `import type`）—— 带阳性对照（已知有 `convertFileSrc` 的
 *      `components/session-detail/SessionScreenCards.tsx` 必命中）与两条阴性对照（注释提及 / 裸字符串
 *      必 0）。**两个面各自收集问题、最后一次性断言**：见该用例内的 `problems` 注释（硬 `expect`
 *      会在第一个面上中止 ⇒ 第二个面拿不到「有没有牙」的读数）。
 *   T1 条目数：三条轨各自的**直接子项数** == `segments` / `screens` / `ocr_blocks` 的长度；
 *      单轨为空时该轨**照常渲染**（列在、列内 0 条）—— 两套夹具，避免把长度写死。
 *   T2 纵向顺序：同一 ms（9000）三条目在 DOM 里的顺序 = 转写 → 画面 → OCR
 *      （`compareDocumentPosition` 判 `DOCUMENT_POSITION_FOLLOWING`）；且每轨内按 ms 升序。
 *   T3 空态走原语：三数组都空 ⇒ `EmptyState`（`.ed-empty` + 标题断言），**0 裸灰字节点**
 *      （子树里任何元素的**行内 style 不得出现颜色字面量**）；非空时不得出现空态（反向）。
 *   T5 时间码格式：每个条目的**首个文本子节点**逐字等于 `fmtMs(ms)`；夹具含 `3_725_000 ms`
 *      （> 1h ⇒ `fmtMs` 出 `1:02:05`，而「手写 `Math.floor(ms/1000)`」会出 `3725s`）⇒ 该夹具
 *      让「自己实现一个格式化」不可能冒充（夹具自证写在同一用例里）。
 *
 * @ai-context 仪器边界：jsdom **不是真浏览器** —— 三轨的真实视觉对齐（同 ms 是否落在同一水平线）
 *   属「视图密度观感」，按 C15 只登记、不验（见 T7 报告 §未验证）。本文件只断言 DOM 事实。
 * @ai-context 域口径（T4② 的扫描器）：**排除 `*.test.tsx`**。理由不是"图省事"：mock 一行
 *   `vi.mock("@tauri-apps/api/core", …)` 必须写出**模块 id 字面量**（vitest 要求静态可分析），
 *   而本文件就在 `views/**` 里 ⇒ 不排除测试文件的话，**判据会被自己的 mock 行弄红**（自引用空真）。
 *   这与全仓每一支棘轮的域口径一致（`!/\.test\.tsx?$/`）。
 * 副作用：只挂 React 树 + 只读 `app/src/views/**` 与一个阳性对照文件；不写盘、不发请求。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionDetail } from "../../types";
import { fmtMs } from "../../utils/fmt";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import SessionTriTrackView from "./SessionTriTrackView";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWS = join(HERE, "..");
const ROOT = '[data-testid="session-tritrack-view"]';

/** 三轨夹具：**故意乱序**（9000 在 0 之后、3_725_000 在最后）⇒ 排序是判据而不是巧合 */
function detailOf(over: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: 1042,
      title: "构图与调色",
      source_window: "Chrome",
      started_at: 1_700_000_000_000,
      ended_at: 1_700_003_800_000,
      status: "finished",
      kind: null,
    },
    segments: [
      { id: 9001, session_id: 1042, start_ms: 0, end_ms: 2_500, text: "开场：构图三要素", source: "subtitle", confidence: 0.9 },
      { id: 9002, session_id: 1042, start_ms: 3_725_000, end_ms: 3_728_000, text: "一小时后的复盘", source: "asr", confidence: 0.7 },
      { id: 9003, session_id: 1042, start_ms: 9_000, end_ms: 12_000, text: "第二段：色轮", source: "fused", confidence: 0.8 },
    ],
    screens: [
      { session_id: 1042, screen_id: 1, first_seen_ms: 9_000, last_seen_ms: 12_000, title: "调色面板", body: ["色相环"], labels: [], image_ref: "full/a.webp", structure: [] },
      { session_id: 1042, screen_id: 2, first_seen_ms: 3_725_000, last_seen_ms: 3_730_000, title: null, body: ["图层面板"], labels: [], image_ref: null, structure: [] },
    ],
    ocr_blocks: [
      { id: 5001, session_id: 1042, timestamp_ms: 9_000, text: "色相 / 饱和度", score: 0.93, region: "full" },
      { id: 5002, session_id: 1042, timestamp_ms: 500, text: "课程封面", score: 0.81, region: "subtitle" },
    ],
    ...over,
  };
}
const EMPTY: Partial<SessionDetail> = { segments: [], screens: [], ocr_blocks: [] };

/** 渲染并返回「根 + 轨道查询器」（`cleanup` 由 afterEach 统一做） */
function mount(over: Partial<SessionDetail> = {}): { root: Element; items: (track: string) => HTMLElement[] } {
  const { container } = render(<SessionTriTrackView detail={detailOf(over)} />);
  const root = container.querySelector(ROOT);
  if (!root) throw new Error(`没有渲染出 ${ROOT}`);
  const items = (track: string): HTMLElement[] => {
    const lane = root.querySelector(`[data-track="${track}"]`);
    if (!lane) throw new Error(`没有渲染出轨道 ${track}`);
    return [...lane.children] as HTMLElement[];
  };
  return { root, items };
}
afterEach(cleanup);

/** 递归收集 `dir` 下的文件（正斜杠相对路径 + 绝对路径） */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}
/** 相对 `views/` 的展示路径（域锚用 `registry.ts` 这种短名，跨仪器对拍时不带盘符） */
const relOf = (abs: string): string => abs.slice(VIEWS.length + 1).replace(/\\/g, "/");

describe("T4 不 invoke 且不带 Tauri（C14② 的第一条判据）", () => {
  it("T4① 三轨非空 + 整块空态两条路径都渲染 ⇒ `invoke` 零调用；T4② `views/**` 生产文件 0 个 `@tauri-apps` import 边（含 import type）", () => {
    // ★ 两个面各自收集问题、最后一次性断言：本判据有两个**可独立变异**的面（行为面 = spy、
    //   源码面 = import 边）。若写成两条连续的硬 `expect`，`it` 会在第一个面上中止 ⇒
    //   第二个面「有没有牙」永远拿不到读数（C15 要求的正是「这条判据自己能红」）。
    const problems: string[] = [];

    const nonEmpty = mount();
    const lanes = nonEmpty.items("transcript").length;
    cleanup();
    mount(EMPTY); // 空态路径也要渲染一遍：两条路径都不许取数
    cleanup();
    if (lanes !== 3 || invokeMock.mock.calls.length > 0) {
      problems.push(`① 不 invoke：渲染了 ${lanes} 条转写却调用了 invoke ${invokeMock.mock.calls.length} 次`);
    }

    const prod = walk(VIEWS).filter((abs) => /\.tsx?$/.test(abs) && !/\.test\.tsx?$/.test(abs));
    // 域非空自证：扫描器要是把域走空了，「0 命中」就是空真
    expect(prod.length, "views/** 的生产文件数为 0（域过滤失效 ⇒ 判据空真）").toBeGreaterThan(0);
    expect(prod.map(relOf)).toContain("registry.ts");
    expect(prod.some((abs) => abs.endsWith("SessionTriTrackView.tsx")), "被测文件自己不在扫描域里").toBe(true);

    const readers = (src: string): boolean =>
      src
        .split(/\r?\n/)
        // 先滤注释行（`//` / `*` / `/*` 起首）：v1 用裸 `includes("@tauri-apps")` 时，
        // `registry.ts` 的**头注释**（"零 `@tauri-apps`（C14②）"）与两个并行单元的注释都被误判成 import
        // ⇒ 本判据要的是**模块边**，不是「文件里出现过这个词」。批 1 的「文本扫描先剥注释」纪律。
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .some(
          (line) =>
            /\bfrom\s*["']@tauri-apps(\/[^"']*)?["']/.test(line) ||
            /\b(?:import|require)\s*\(\s*["']@tauri-apps/.test(line),
        );
    const hits = prod.filter((abs) => readers(readFileSync(abs, "utf8"))).map(relOf);
    if (hits.length > 0) problems.push(`② 不带 Tauri：views/** 出现 @tauri-apps import 边 -> ${hits.join(", ")}`);

    // 仪器自证（这几条**不并入** `problems`：它们证明扫描器可信，不是被测对象的行为）
    const positiveSrc = readFileSync(join(VIEWS, "..", "components", "session-detail", "SessionScreenCards.tsx"), "utf8");
    expect(readers(positiveSrc), "阳性对照没命中 ⇒ 扫描器不可信（0 命中不算数）").toBe(true);
    expect(
      readers('// import { invoke } from "@tauri-apps/api/core";\n/** 零 `@tauri-apps` import */'),
      "注释里的提及被当成了 import 边（假阳性通道）",
    ).toBe(false);
    expect(readers('const s = "本层零 @tauri-apps 依赖";'), "裸字符串被当成了 import 边").toBe(false);
    expect(readers('import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";'), "`import type` 没被算成边（C14② 明文要求含它）").toBe(true);

    expect(problems, "「不 invoke 且不带 Tauri」的两个面各自独立成立").toEqual([]);
  });
});

describe("T1 条目数：三轨各自的直接子项数 == 数据长度", () => {
  it("满轨夹具 3/2/2 各就各位；单轨为空时该轨照常渲染（列在、列内 0 条）", () => {
    const full = mount();
    expect(full.items("transcript")).toHaveLength(3);
    expect(full.items("screen")).toHaveLength(2);
    expect(full.items("ocr")).toHaveLength(2);
    // 每个条目都带对齐锚 `data-ms`（三轨共轴的唯一凭据）
    for (const track of ["transcript", "screen", "ocr"]) {
      expect(full.items(track).filter((el) => el.hasAttribute("data-ms"))).toHaveLength(full.items(track).length);
    }
    cleanup();

    // 换一套长度（1/0/4）：把长度写死的实现会在这里红
    const oneOfEach = detailOf().segments.slice(0, 1);
    const ocr = detailOf().ocr_blocks.concat(detailOf().ocr_blocks);
    const { items } = mount({ segments: oneOfEach, screens: [], ocr_blocks: ocr });
    expect(items("transcript")).toHaveLength(1);
    expect(items("screen"), "单轨为空被整块空态顶掉了（用户看不到「哪一轨是空的」）").toHaveLength(0);
    expect(items("ocr")).toHaveLength(ocr.length);
  });
});

describe("T2 纵向顺序：同 ms 三条目 = 转写 → 画面 → OCR，且每轨内按 ms 升序", () => {
  it("ms=9000 的三条目在 DOM 里依次 FOLLOWING；三条轨的 data-ms 序列各自非降", () => {
    const { items } = mount();
    const at = (track: string): HTMLElement => {
      const el = items(track).find((x) => x.dataset.ms === "9000");
      if (!el) throw new Error(`轨道 ${track} 里没有 ms=9000 的条目`);
      return el;
    };
    const following = (a: Element, b: Element): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(following(at("transcript"), at("screen")), "转写没有排在画面之前").toBe(true);
    expect(following(at("screen"), at("ocr")), "画面没有排在 OCR 之前").toBe(true);
    expect(following(at("transcript"), at("ocr")), "转写没有排在 OCR 之前").toBe(true);

    for (const track of ["transcript", "screen", "ocr"]) {
      const mss = items(track).map((el) => Number(el.dataset.ms));
      expect(mss.length, `轨道 ${track} 是空的（升序判据会空真）`).toBeGreaterThan(1);
      expect(mss, `轨道 ${track} 没有按 ms 升序`).toEqual([...mss].sort((a, b) => a - b));
    }
  });
});

describe("T3 空态走原语（不是裸灰字）", () => {
  it("三数组都空 ⇒ `.ed-empty` + 标题逐字，0 个带颜色字面量的行内 style 节点；非空时不得出现空态", () => {
    const { root } = mount(EMPTY);
    expect(root.classList.contains("ed-empty"), "空态没走 EmptyState 原语").toBe(true);
    expect(root.textContent ?? "").toContain("本会话三轨无内容");
    expect(root.querySelectorAll("[data-track]"), "空态里还渲染着轨道").toHaveLength(0);
    const COLOR = /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/;
    const colored = [...root.querySelectorAll("*")].filter((el) => COLOR.test(el.getAttribute("style") ?? ""));
    expect(colored.map((el) => el.outerHTML.slice(0, 80)), "空态里出现了裸色值（不许用行内 style 写灰字）").toEqual([]);
    cleanup();

    const { root: full } = mount();
    expect(full.classList.contains("ed-empty"), "非空会话被渲染成空态").toBe(false);
    expect(full.querySelectorAll("[data-track]")).toHaveLength(3);
  });
});

describe("T5 时间码格式：逐字等于 `fmtMs` 的输出", () => {
  it("每个条目首个子节点 == fmtMs(data-ms)；含 >1h 夹具（1:02:05）使「自己实现一个格式化」无法冒充", () => {
    const detail = detailOf();
    const { items } = mount();
    for (const track of ["transcript", "screen", "ocr"]) {
      for (const el of items(track)) {
        const ms = Number(el.dataset.ms);
        const time = el.children[0];
        expect(time.textContent, `${track}@${ms}：时间码不是 fmtMs 的输出`).toBe(fmtMs(ms));
      }
    }
    // 夹具自证：这条 >1h 的段存在，且它的时间码是 h:mm:ss 形态（naive `ms/1000` 给不出它）
    const overHour = items("transcript").find((el) => el.dataset.ms === "3725000");
    expect(overHour, "夹具里没有 >1h 的转写段（时间码判据会退化成 mm:ss 同形态 ⇒ 无区分力）").toBeDefined();
    expect(overHour?.children[0].textContent).toBe(fmtMs(3_725_000));
    expect(overHour?.children[0].textContent).not.toBe(`${Math.floor(3_725_000 / 1000)}s`);
    // 画面轨的区间尾码同样经 fmtMs（`first_seen_ms`–`last_seen_ms`）
    for (const [i, screen] of detail.screens.entries()) {
      const el = items("screen").find((x) => x.dataset.ms === String(screen.first_seen_ms));
      expect(el?.children[1].textContent, `屏 ${i} 的区间尾码`).toBe(`– ${fmtMs(screen.last_seen_ms)}`);
    }
  });
});
