// @vitest-environment jsdom
/**
 * @ai-context `shell/ShellFallback.tsx` 迁入 L1 原语（批 4 T9）的**迁移判据**（五条）。
 *
 * Why 单独立文件、而不动 `ShellFallback.test.tsx`：那个文件是批 3 的交付面，T9 的纪律是
 *   **既有断言一字不改**（它 5 条用例在迁移后原样全绿 —— 这是等价性的主证，见 `task-9-report.md`）；
 *   本文件只补「迁移这件事本身」的判据：自足内联 `<div style=…>` 换成 `Loading` / `StatusLine` 之后，
 *   **盘上的形态**与**渲染出的形态**各自都要有能失败的判据，否则「迁完了」只是一句话。
 *
 * 判据（每条各带**自己的**变异体，且每个变异**新解一棵导出树**；实测见 `task-9-report.md` §变异体）：
 *   ① 经 **barrel** 导入原语、无深导入（ADR-033 §1：深导入不带 `motion.css` ⇒ reduced-motion 静默失效）；
 *   ② 文件**零行内 `style`、零颜色字面量**（ADR-033 §4 的调用点侧：迁移后不该再自带排版与色值）；
 *   ③ 渲染级：加载态根节点**就是 `Loading` 的形态**（`.ed-loading` + `.ed-probe` + `role="status"`）；
 *   ④ 渲染级：失败卡片**就是 `StatusLine kind="error"` 的形态**（`.ed-status--error` + `data-kind="error"` + `role="alert"`）；
 *   ⑤ 语义色链：**从渲染出的修饰类反查 `StatusLine.css`** ⇒ 失败卡最终必须是 `var(--ed-stamp)` 文字色。
 *      `kind` 与色值**都不在测试里硬写**（修饰符取自 DOM、色值取自 CSS，两端各只有一处真源）；
 *      CSS 侧 `.ed-status--error → var(--ed-stamp)` 的既有判据在 `StatusLine.test.tsx:213`，此处不复制。
 *
 * ⚠️ 底座（照抄勿改）：`vitest.config.ts` 全局 `environment: "node"` ⇒ 首行必须 jsdom 指令；
 *   **未装** `jest-dom` / `user-event` ⇒ 原生 DOM API；无 `globals` ⇒ 显式 `afterEach(cleanup)`。
 * 仪器纪律：两条源文本判据**一律先剥注释** —— 本文件头与 `ShellFallback.tsx` 的文件头都**逐字引用**
 *   了迁移前的形态（`ShellFallback.tsx` 的头注释里就有 `<div style=…>`），不剥注释时 ② 在自家文件上
 *   就是红的；「剥注释承重」由 ② 的自证与 M6 变异体（注释里塞深导入）双向证明。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellFallback, SlotErrorBoundary } from "./ShellFallback";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 迁移面源码 —— ① ② 的唯一对象 */
const TSX = readFileSync(join(HERE, "ShellFallback.tsx"), "utf8");
/** 语义色的真源（⑤ 反查它；本文件不硬写任何色值） */
const STATUS_CSS = readFileSync(join(HERE, "..", "ui", "primitives", "StatusLine.css"), "utf8");

/** 剥块注释与整行 `//` 注释（与 `ui/primitives/dialogMigration.a1.test.ts:67` 同一口径） */
const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const CODE = strip(TSX);

/** 深导入 = `ui/primitives/<X>`（barrel 之外的入口，ADR-033 §1 禁止） */
const RE_DEEP = /from\s*"(?:\.\.\/)+ui\/primitives\/[A-Za-z]+"/;
/** barrel 导入（名字表在捕获组里，供 ① 断言导入的是哪几个） */
const RE_BARREL = /import\s*\{([^}]*)\}\s*from\s*"(?:\.\.\/)+ui\/primitives"/;
/** 行内 `style=` —— 只认紧跟 `{` 的形态（`style={` / `style={{`） */
const RE_INLINE_STYLE = /\bstyle\s*=\s*\{/;
/** 颜色字面量：#hex / rgb() / rgba() / hsl() / hsla() */
const RE_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

afterEach(cleanup);

/** 模拟懒 chunk 加载失败（渲染期抛错 ⇒ React 落到最近的上层边界） */
function Boom(): never {
  throw new Error("模拟懒 chunk 加载失败");
}

/**
 * 触发叶级边界并返回失败卡片根节点。
 * 抛错时 React 仍会 `console.error` ⇒ 抑制后还原（与 `ShellFallback.test.tsx:51` 同款）。
 */
function mountFailedCard(): HTMLElement {
  function Wrap({ bad }: { bad: boolean }) {
    return (
      <SlotErrorBoundary>
        <span data-testid="child-marker">子内容</span>
        {bad ? <Boom /> : null}
      </SlotErrorBoundary>
    );
  }
  const { rerender } = render(<Wrap bad={false} />);
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    rerender(<Wrap bad />);
  } finally {
    spy.mockRestore();
  }
  return screen.getByTestId("slot-error");
}

/** 从类名里取出 `<base>--<kind>` 的 `<kind>`（档名只有 DOM 一处真源，测试不硬写） */
function modifierOf(el: Element, base: string): string | null {
  for (const cls of Array.from(el.classList)) {
    if (cls.startsWith(`${base}--`)) return cls.slice(base.length + 2);
  }
  return null;
}

/** 取一条 CSS 规则的原文（到第一个 `}` 为止；本仓规则体内没有花括号） */
function cssRule(css: string, selector: string): string | null {
  const at = css.indexOf(selector);
  if (at < 0) return null;
  return css.slice(at, css.indexOf("}", at) + 1);
}

describe("① 迁移面经 barrel 导入原语（ADR-033 §1）", () => {
  it("barrel 名字表含 Loading 与 StatusLine，且无深导入", () => {
    expect(RE_BARREL.test(CODE), "ShellFallback 不再从 barrel 导入原语").toBe(true);
    const names = (RE_BARREL.exec(CODE)?.[1] ?? "").split(",").map((s) => s.trim());
    expect(names, "barrel 名字表里没有 Loading").toContain("Loading");
    expect(names, "barrel 名字表里没有 StatusLine").toContain("StatusLine");
    expect(CODE.match(RE_DEEP), "出现深导入（ADR-033 §1 禁止：深导入不带 motion.css）").toBeNull();
  });

  it("仪器自证：RE_BARREL / RE_DEEP 能区分 barrel 与深导入，且对无意义串报 0", () => {
    expect(RE_BARREL.test('import { Loading } from "../ui/primitives";')).toBe(true);
    expect(RE_DEEP.test('import { Loading } from "../ui/primitives";'), "barrel 被误判成深导入").toBe(false);
    expect(RE_DEEP.test('import { Loading } from "../ui/primitives/Loading";')).toBe(true);
    expect(RE_DEEP.test('import { Loading } from "../ui/primitivesX";'), "同前缀的另一目录被误判").toBe(false);
    expect(RE_BARREL.test("const k = 1;"), "无意义串命中").toBe(false);
  });
});

describe("② 迁移面零行内 style / 零颜色字面量（ADR-033 §4 调用点侧）", () => {
  it("剥注释后既无行内 style，也无任何颜色字面量", () => {
    expect(RE_INLINE_STYLE.test(CODE), "ShellFallback 又出现行内 style").toBe(false);
    expect(RE_COLOR.test(CODE), "ShellFallback 又写死了颜色（色值只许在 tokens 侧）").toBe(false);
  });

  it("仪器自证：剥注释承重 —— 合成样本剥离前必须命中、剥离后必须归零", () => {
    const sample = '/* <div style={{ color: "#b91c1c" }} /> */\nconst k = 1;\n';
    expect(RE_INLINE_STYLE.test(sample), "剥离前没命中 ⇒ 本判据测不到注释里的形态").toBe(true);
    expect(RE_COLOR.test(sample), "剥离前没命中颜色字面量").toBe(true);
    expect(RE_INLINE_STYLE.test(strip(sample)), "剥注释没生效（注释里的 style 仍被当代码）").toBe(false);
    expect(RE_COLOR.test(strip(sample)), "剥注释没生效（注释里的色值仍被当代码）").toBe(false);
  });
});

describe("③ 加载态 = Loading 原语（渲染级）", () => {
  it("根节点带 .ed-loading 与探针 .ed-probe，role=status，文案逐字未改", () => {
    render(<ShellFallback />);
    const el = screen.getByTestId("shell-fallback");
    expect(el.classList.contains("ed-loading"), "加载态不是 Loading 原语渲染的（缺 .ed-loading）").toBe(true);
    expect(el.querySelector(".ed-probe"), "Loading 的探针没渲染出来 ⇒ 不是原语形态").toBeTruthy();
    expect(el.getAttribute("role")).toBe("status");
    expect(el.textContent, "加载文案被改动").toBe("正在载入…");
    expect(screen.queryByTestId("slot-error"), "加载态不是错误态").toBeNull();
  });
});

describe("④ 失败卡片 = StatusLine kind=error（渲染级）", () => {
  it("根节点带 .ed-status--error、data-kind=error、role=alert，文案逐字未改", () => {
    const card = mountFailedCard();
    expect(card.classList.contains("ed-status"), "失败卡片不是 StatusLine 渲染的（缺 .ed-status）").toBe(true);
    expect(card.classList.contains("ed-status--error"), "kind 不是 error（危险档被降级）").toBe(true);
    expect(card.getAttribute("data-kind"), "机器可读的语义锚点不是 error").toBe("error");
    expect(card.getAttribute("role"), "错误档必须即时播报（alert）").toBe("alert");
    expect(card.textContent, "失败卡文案被改动（四处共用的措辞已冻结）").toBe(
      "此处加载失败——其余区域仍可使用；重启应用可恢复。",
    );
    expect(screen.queryByTestId("shell-fallback"), "失败态误用了加载态").toBeNull();
    expect(screen.queryByTestId("child-marker"), "children 仍挂着 ⇒ 没被边界卸载").toBeNull();
  });
});

describe("⑤ 语义色链：渲染出的修饰类 → StatusLine.css 的 var(--ed-stamp)", () => {
  it("失败卡的 ed-status--<kind> 在 CSS 里映射到 var(--ed-stamp) 文字色", () => {
    const kind = modifierOf(mountFailedCard(), "ed-status") ?? "";
    expect(kind, "失败卡片没有 ed-status--<kind> 修饰类（语义色无处落地）").not.toBe("");
    const rule = cssRule(STATUS_CSS, `.ed-status--${kind}`);
    expect(rule, `StatusLine.css 里没有 .ed-status--${kind} 规则`).not.toBeNull();
    expect(rule, `失败卡的语义色不是 var(--ed-stamp)（实得 ${String(rule)}）`).toContain("var(--ed-stamp)");
  });

  it("仪器自证：cssRule / modifierOf 读法能区分四档、对无意义串必须读不到", () => {
    expect(cssRule(STATUS_CSS, ".ed-status--warn")).toContain("var(--ed-due)");
    expect(cssRule(STATUS_CSS, ".ed-status--ok")).toContain("var(--ed-ok)");
    expect(cssRule(STATUS_CSS, ".ed-status--nope"), "无意义修饰符必须读不到（否则 ⑤ 是空真）").toBeNull();
    // 修饰类读法：`ed-status` 基类本身**不是**修饰符（前缀要求 `--`），空 classList 读到 null
    const probe = document.createElement("div");
    probe.className = "ed-status";
    expect(modifierOf(probe, "ed-status"), "基类被误当成修饰符").toBeNull();
    probe.className = "ed-status ed-status--warn";
    expect(modifierOf(probe, "ed-status")).toBe("warn");
  });
});
