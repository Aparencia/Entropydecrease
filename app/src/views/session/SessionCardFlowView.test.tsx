// @vitest-environment jsdom
/**
 * SessionCardFlowView.test.tsx — 批 5 · T9 的**行为级判据 K1–K6**（每个新生产文件 ≥2 条，
 * 每条自带变异体：C15）。
 *
 * @ai-context 为什么这些判据长这样：
 *   · **K1 不 invoke** 是 C14② 逐字要求的「每个视图组件的第一条判据」——注入 spy 断言 `invoke`
 *     零调用，**外加**源码级一条（`views/**` 零 `@tauri-apps`，含 `import type`），两条腿一行为一图级；
 *   · **K2 复用证明**是本任务的核心（C3 逐字「抽单卡子件供两个视图复用」；规格 §5.1 的病灶是
 *     「同一件事两处写」）。仪器 = 把**真卡**包一层带 `data-testid="screen-card"` 的壳
 *     （`vi.mock` + `vi.importActual`）⇒ ① 锚点数 == 屏数 证明「随屏渲染的恰是那个模块」
 *     ② 标题/正文文本在全 DOM 各**恰出现 1 次** 证明「没有第二份卡渲染路径」。若只写 ①，
 *     「自己写一份 + 也 import 单卡」会漏网；两条腿合取才排除。
 *   · **K3/K5** 把「另一种容器」变成可判的差：卡片计数（含 0 屏边界）+ **跨文件对拍**
 *     （同一 fixture 下容器**有**结构徽标/块级明细/`ocr-` 锚点，本视图**都没有**）——
 *     两侧各有阳性对照，防「一个选择器静默失效 ⇒ 两边都空 ⇒ 对拍通过」。
 *   · **K6** 钉「配图走容器注入的 `imageUrl()`」（视图自己 `convertFileSrc` 会同时破 K1 的图级腿）。
 *   · **K4** 钉只读（0 button / 0 details / 0 toast 痕迹 / 0 框选遮罩）——框选与单屏 toast 是
 *     容器的职责（C3），本视图的 props 里根本没有它们。
 *
 * @ai-context 仪器边界（诚实清单）：① 只 mock **模块边界**（`@tauri-apps/api/core`）；真卡与
 *   `SessionScreenCards`（只读 import，用于 K5 对拍）都跑真实实现。② 不设快照、不设源码文本断言
 *   （C15）——唯一的源码级断言是 K1 的 `@tauri-apps` 扫描，它是 brief 硬要求④逐字点名的形态，
 *   且自带「剥注释三向 + 有意义串必中 + 无意义串必 0」四项自证。③ jsdom 测不出真实排版密度
 *   （观感属 C15 的「只能登记」）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { SessionDetail, SessionOcrBlock, SessionScreen } from "../../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));
/**
 * K2 的仪器：**不替换真卡**，只在它外面加一层可计数的锚点（`vi.importActual` 取真实现）。
 * ⇒ 其它判据看到的仍是真卡的渲染结果（集成不被 mock 掉），而 K2 有了「这个模块被用了几次」的读数。
 */
vi.mock("../../components/session-detail/SessionScreenCard", async () => {
  const actual = await vi.importActual<{ default: ComponentType<{ screen: SessionScreen }> }>(
    "../../components/session-detail/SessionScreenCard",
  );
  return {
    default: ({ screen }: { screen: SessionScreen }) => (
      <div data-testid="screen-card">
        <actual.default screen={screen} />
      </div>
    ),
  };
});

import SessionCardFlowView from "./SessionCardFlowView";
import SessionScreenCards from "../../components/session-detail/SessionScreenCards";

const SESSION_ID = 2048;
const noop = () => {};

/** 三屏 fixture（与 T3 的容器 fixture 不同值：两文件互不依赖，跨文件对拍才有力） */
function screenOf(over: Partial<SessionScreen>): SessionScreen {
  return {
    session_id: SESSION_ID,
    screen_id: 1,
    first_seen_ms: 1000,
    last_seen_ms: 4000,
    title: null,
    body: [],
    labels: [],
    image_ref: null,
    structure: [],
    ...over,
  };
}

const SCREENS: SessionScreen[] = [
  screenOf({
    screen_id: 1, first_seen_ms: 1000, last_seen_ms: 4000, title: "卡片流标题一",
    body: ["卡片流正文甲"], labels: ["标签甲"], image_ref: "screens/a.png",
    structure: [{ kind: "table", text: "表格原文", rendered: "|a|b|" }],
  }),
  // screen_id === null ⇒ 走 `i + 1` 兜底；无标题/无标签/无图/无结构（降级路径）
  screenOf({ screen_id: null, first_seen_ms: 7000, last_seen_ms: 9000, body: ["卡片流正文乙"] }),
  screenOf({
    screen_id: 3, first_seen_ms: 12000, last_seen_ms: 15000, title: "卡片流标题三",
    labels: ["标签丙", "标签丁"], image_ref: "screens/c.png",
  }),
];

function blockOf(id: number, ms: number, text: string): SessionOcrBlock {
  return { id, session_id: SESSION_ID, timestamp_ms: ms, text, score: 0.9, region: "top" };
}

/** 屏→块分组（调用方 memo 预构建的语义；本视图只取 `length`） */
const BLOCKS: Map<number, SessionOcrBlock[]> = new Map([
  [1000, [blockOf(1, 1000, "块文本甲"), blockOf(2, 2000, "块文本乙")]],
  [12000, [blockOf(3, 12000, "块文本丙")]],
]);

const DETAIL: SessionDetail = {
  session: {
    id: SESSION_ID, title: "卡片流会话", source_window: null,
    started_at: 1_700_000_000, ended_at: 1_700_000_600, status: "finished", kind: null,
  },
  segments: [], ocr_blocks: [...BLOCKS.values()].flat(), screens: SCREENS,
};

/** 视图 props：`imageUrl` 默认给一个**注入式**实现（视图不许自己碰 Tauri —— K1/K6 都盯这一点） */
function propsOf(over: Partial<Parameters<typeof SessionCardFlowView>[0]> = {}) {
  return {
    detail: DETAIL,
    imageUrl: (ref: string | null) => (ref === null ? null : `asset://injected/${ref}`),
    ocrBlocksByScreen: BLOCKS,
    ...over,
  };
}

/** 容器（`SessionScreenCards`）的 props —— 只为 K5 的跨文件对拍而构造 */
function containerProps() {
  return {
    sessionId: SESSION_ID, kind: null as string | null, screens: SCREENS, ocrBlockCount: 3,
    baseUrl: "asset://localhost/screens", ocrBlocksByScreen: BLOCKS, selectingScreen: null as number | null,
    onSelectScreen: noop, panelToast: null as { screenKey: number; msg: string } | null,
    onShowToast: noop, onClearToast: noop,
  };
}

const items = (): Element[] => [...document.querySelectorAll("[data-card-flow-item]")];
const cards = (): Element[] => [...document.querySelectorAll("[data-testid='screen-card']")];
const bodyText = (): string => document.body.textContent ?? "";
/** 某个串在 DOM 文本里的出现次数（K2 腿②的仪器） */
const occurrences = (needle: string): number => bodyText().split(needle).length - 1;

/** 剥注释（状态机；字符串内的 `//` 不动）。与 `ui/primitives/sliceScan.ts` 同口径的最小实现 */
function stripComments(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i += 1) {
    const c = src.charAt(i);
    const next = src.charAt(i + 1);
    if (quote !== null) {
      out += c;
      if (c === "\\" && next !== undefined) { out += next; i += 1; }
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") { quote = c; out += c; }
    else if (c === "/" && next === "/") { while (i < src.length && src.charAt(i) !== "\n") i += 1; out += "\n"; }
    else if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src.charAt(i) === "*" && src.charAt(i + 1) === "/")) i += 1;
      i += 1;
    } else out += c;
  }
  return out;
}

/** 源码里的 `@tauri-apps/*` 模块说明符（**先剥注释**；字符串说明符形态 ⇒ 静态与动态 import 都算） */
function tauriSpecifiersIn(source: string): string[] {
  return [...stripComments(source).matchAll(/["'](@tauri-apps\/[^"']*)["']/g)].map((m) => m[1] ?? "");
}

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
/** `views/**` 的生产文件（**.test 排除**：测试要 `vi.mock("@tauri-apps/api/core")`，那是测试基建） */
function viewSources(dir = join(SRC, "views")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return viewSources(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

beforeEach(() => invokeMock.mockReset());
afterEach(() => cleanup());

describe("SessionCardFlowView（批 5 T9）", () => {
  it("K1 不 invoke：渲染全程 `invoke` 零调用；且 `views/**` 生产文件零 `@tauri-apps`（含 import type）", () => {
    render(<SessionCardFlowView {...propsOf()} />);
    expect(invokeMock).toHaveBeenCalledTimes(0);
    // 图级腿：整目录扫描（不是只扫本文件 —— 视图层新增的 Tauri 边一律不许）
    expect(viewSources().map((f) => [f, tauriSpecifiersIn(readFileSync(f, "utf8"))] as const)
      .filter(([, sites]) => sites.length > 0)).toEqual([]);
    // 仪器四项自证：静态 / `import type` / 剥注释 / 无意义串
    expect(tauriSpecifiersIn('import { invoke } from "@tauri-apps/api/core";')).toEqual(["@tauri-apps/api/core"]);
    expect(tauriSpecifiersIn('import type { X } from "@tauri-apps/api/core";')).toEqual(["@tauri-apps/api/core"]);
    expect(tauriSpecifiersIn('// import { invoke } from "@tauri-apps/api/core";')).toEqual([]);
    expect(tauriSpecifiersIn('import { a } from "@nowhere/nothing";')).toEqual([]);
    // 阳性对照：同一支仪器在**已知有 convertFileSrc** 的容器源码上必须命中（域不是空的）
    expect(tauriSpecifiersIn(readFileSync(join(SRC, "components", "session-detail", "SessionScreenCards.tsx"), "utf8")))
      .toEqual(["@tauri-apps/api/core"]);
  });

  it("K2 复用证明：卡内容只经 `SessionScreenCard` 到达 DOM（每屏恰一次），无第二份卡渲染", () => {
    render(<SessionCardFlowView {...propsOf()} />);
    // 腿①：单卡模块被渲染恰 `screens.length` 次（锚点在 `vi.mock` 壳上 —— 见文件头）
    expect(cards()).toHaveLength(SCREENS.length);
    expect(cards()[0]?.textContent).toContain("卡片流标题一");
    expect(cards()[1]?.textContent).toContain("卡片流正文乙");
    // 腿②：标题/正文文本各**恰出现 1 次** ⇒ 视图没有自己再写一份（否则 2 次）
    expect(occurrences("卡片流标题一")).toBe(1);
    expect(occurrences("卡片流正文甲")).toBe(1);
    // 阳性对照：同一支计数器在**确实出现多次**的串上必须数到 > 1（否则腿②是空真）
    expect(occurrences("屏 ")).toBe(SCREENS.length);
  });

  it("K3 卡片数 = `detail.screens.length`（含 0 屏边界：0 卡 + 空态原语 + 根锚点仍在）", () => {
    render(<SessionCardFlowView {...propsOf()} />);
    expect(items()).toHaveLength(SCREENS.length);
    // 阳性对照：同一支选择器在**已知带该属性**的样本上必须命中（防「选择器失效 ⇒ 空集绿」）
    const probe = document.createElement("div");
    probe.setAttribute("data-card-flow-item", "");
    document.body.appendChild(probe);
    expect(items()).toHaveLength(SCREENS.length + 1);
    probe.remove();
    // 0 屏：不产出空卡；空态走 `EmptyState` 原语（`emptyStateRatchet` 的口径）
    cleanup();
    render(<SessionCardFlowView {...propsOf({ detail: { ...DETAIL, screens: [] } })} />);
    expect(items()).toHaveLength(0);
    expect(document.querySelector("[data-testid='session-card-flow-view']")).not.toBeNull();
  });

  it("K4 只读：0 button / 0 details / 0 toast 痕迹 / 0 框选遮罩（框选与单屏 toast 归容器，C3）", () => {
    render(<SessionCardFlowView {...propsOf()} />);
    expect([...document.querySelectorAll("button")]).toHaveLength(0);
    expect([...document.querySelectorAll("details")]).toHaveLength(0);
    expect([...document.querySelectorAll("[data-testid*='toast']")]).toHaveLength(0);
    expect(document.querySelector('[title="拖拽框选要截取的结构区域"]')).toBeNull();
    // 阳性对照：把这三样装进 DOM，同一批选择器必须看得见（否则上面四条是空真）
    const probe = document.createElement("div");
    probe.innerHTML = '<button data-testid="probe-toast"></button><details></details>';
    document.body.appendChild(probe);
    expect([...document.querySelectorAll("button")]).toHaveLength(1);
    expect([...document.querySelectorAll("details")]).toHaveLength(1);
    expect([...document.querySelectorAll("[data-testid*='toast']")]).toHaveLength(1);
    probe.remove();
  });

  it("K5 与 `SessionScreenCards` 不是同一形态的两份拷贝（跨文件对拍 + 两侧阳性对照）", () => {
    const first = render(<SessionScreenCards {...containerProps()} />);
    // 阳性对照：容器**确实**渲染结构徽标 / 块级明细 / `ocr-` 滚动锚点
    expect(bodyText()).toContain("📊 table");
    expect(bodyText()).toContain("块级明细（2 块，可复查误合并）");
    expect([...document.querySelectorAll("[id^='ocr-']")]).toHaveLength(SCREENS.length);
    expect(items()).toHaveLength(0); // 容器没有本视图的锚点
    first.unmount();

    render(<SessionCardFlowView {...propsOf()} />);
    expect(bodyText()).not.toContain("📊 table"); // 无结构徽标
    expect(bodyText()).not.toContain("块级明细（"); // 无块级明细展开
    expect([...document.querySelectorAll("[id^='ocr-']")]).toHaveLength(0); // 不复制 scrollIntoView 契约
    expect([...document.querySelectorAll("details")]).toHaveLength(0);
    expect(items()).toHaveLength(SCREENS.length);
    // 对拍不是「什么都不同」：共同的数据语义面（同一 fixture 的标题）两边都在
    expect(bodyText()).toContain("卡片流标题一");
  });

  it("K6 配图走注入的 `imageUrl()`：实参 = 原始 `image_ref`；返回 `null` ⇒ 不渲染 img（降级）", () => {
    const imageUrl = vi.fn((ref: string | null) => (ref === null ? null : `asset://injected/${ref}`));
    render(<SessionCardFlowView {...propsOf({ imageUrl })} />);
    expect(imageUrl).toHaveBeenCalledTimes(SCREENS.length);
    expect(imageUrl.mock.calls.map((c) => c[0])).toEqual(["screens/a.png", null, "screens/c.png"]);
    const imgs = [...document.querySelectorAll("img")];
    expect(imgs).toHaveLength(2); // 中间那屏 `image_ref = null` ⇒ 无图位
    expect(imgs.map((el) => el.getAttribute("src")))
      .toEqual(["asset://injected/screens/a.png", "asset://injected/screens/c.png"]);
    // 反向：注入器对**非空** ref 也返回 null ⇒ 0 个 img（判据看返回值，不是看 `image_ref` 的字面）
    cleanup();
    render(<SessionCardFlowView {...propsOf({ imageUrl: () => null })} />);
    expect([...document.querySelectorAll("img")]).toHaveLength(0);
  });
});
