// @vitest-environment jsdom
/**
 * toastMigration.test.tsx — 批 4 Task 10「四套自绘 toast → 1 个 `Toast` 原语」的机器判据。
 *
 * @ai-context 域（**实测**，非计划原文）：仓内的自绘**浮动** toast 实现是三处 ——
 *   ① `App.tsx`（全局 AI toast，3500ms）② `pages/SessionsPage.tsx`（页级，3000ms）
 *   ③ `hooks/useTransientToast.tsx`（hook 式，默认 3000ms；`SessionsPage` 直接消费、
 *   `NotesPage` 经 `useNotesBatchActions` 消费）。计划 Task 10 记的第 ④ 套
 *   `components/SessionListPanel.tsx` **实测不是实现**（`showToast` 是 prop，判据在 §②）；
 *   真正的第 4 处是**面板级内联 banner**（`useSessionDetailData.ts` 4000ms 计时 +
 *   `SessionScreenCards.tsx` 在匹配屏卡片内渲染）——它**不迁**、带理由登记在 §⑥（迁到浮动
 *   toast 会丢掉「哪张屏刚保存」的锚定 = 用户可见语义变化，且 T10 的授权文件清单不含它）。
 *
 * 判据（每条各带自己的变异体，见 `task-10-report.md`）：
 *   ① 三个实现文件剥注释后 0 处自绘浮动特征（`role="status"` / `position:"fixed"` / `zIndex(`）
 *      —— 附**双侧仪器自证**（合成正样本必须命中 3 项、负样本必须 0 命中）；
 *   ② 三条链路都经 **barrel** 到达 `<Toast>`（ADR-033 §1；深导入禁止）· 第 ④ 套实测是消费者；
 *   ③ `durationMs` **逐处显式**（App 3500 / SessionsPage 3000 / hook 的 `durationMs={0}`）+
 *      **行为级**证明 3500 真生效（到点才退场 → 退场 → `onDismiss` **恰好一次**）；
 *   ④ 全仓 `role="status"` 源码命中 ⊆ 白名单，且两个原语侧**必须**命中（防空名单式空真）；
 *   ⑤ B15 ②：`data-testid="ai-toast"` 用**渲染级**断言保住（渲染 App.tsx 的真实装配件 `AiToast`，
 *      **不是**断言源码里出现过这个字符串）；
 *   ⑥ 登记例外（面板 banner）：带理由 + 「它今天仍未浮动」的可失败判据。
 *
 * 副作用：只读磁盘（`app/src/**`）+ 挂一棵 React 树；不写文件、不发请求。
 * 边界：jsdom 不排版 ⇒ 只判 DOM / 类名 / CSS **文本**；`shell/ShellFallback.tsx` 的
 *   `role="status"` 属 **T9 在飞**的迁移点 ⇒ §④ 记成委托项（它消失**不算**红，新出现才算）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiToast } from "../App";
import { Z_TIER } from "../ui/zIndex";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, ".."); // = app/src
const read = (rel: string): string => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
/** 剥注释（块注释 + 整行 `//`）—— 与 `shell/TopBar.test.tsx:43` 同口径；注释里提到旧写法不算犯规 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** 自绘浮动 toast 的三条特征（合成样本自证用**同一条**判据 ⇒ 证明它有区分度） */
const SELF_DRAWN: readonly (string | RegExp)[] = [
  'role="status"',
  /position:\s*["']fixed["']/,
  /zIndex\(/,
];
const selfDrawnHits = (s: string): string[] =>
  SELF_DRAWN.filter((p) => (typeof p === "string" ? s.includes(p) : p.test(s))).map(String);

/** 三个实现文件（页级/hook 式/全局）—— 第 ④ 套是消费者，另有判据 */
const IMPL_FILES = ["App.tsx", "pages/SessionsPage.tsx", "hooks/useTransientToast.tsx"] as const;
const CODE: Readonly<Record<string, string>> = Object.fromEntries(
  IMPL_FILES.map((f) => [f, stripComments(read(f))]),
);

/** barrel 名字表 / 深导入（`./ui/primitives` 与 `../ui/primitives` 都算 barrel） */
const RE_BARREL = /import\s*\{([^}]*)\}\s*from\s*"(?:\.\.?\/)+ui\/primitives"/;
const RE_DEEP = /from\s*"(?:\.\.?\/)+ui\/primitives\/[A-Za-z]+"/;
const barrelNames = (s: string): string[] => {
  const m = RE_BARREL.exec(s);
  return m ? m[1].split(",").map((x) => x.trim()) : [];
};

const ROLE_STATUS = 'role="status"';
/** 白名单：`role="status"` 的唯一合法持有者（toast 与加载态两个原语） */
const WHITELIST: readonly string[] = ["ui/primitives/Toast.tsx", "ui/primitives/Loading.tsx"];
/** 委托项（**T9 在飞**）：`ShellFallback.tsx` 今日仍自带 `role="status"`，T9 把它换成 `Loading`。
 *  它**消失不算红**（T9 落地即消失）、**新出现**必须红 —— 故单列，不算白名单成员。 */
const DELEGATED: readonly string[] = ["shell/ShellFallback.tsx"];

/** 递归收集 `app/src` 下的 `.ts`/`.tsx`（相对正斜杠路径） */
function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(relative(SRC, full).split(sep).join("/"));
  }
  return out;
}

/** 全仓（非测试文件）`role="status"` 的命中文件集（剥注释后判） */
const roleStatusFiles = (): string[] =>
  collect(SRC)
    .filter((rel) => !/\.test\.tsx?$/.test(rel))
    .filter((rel) => stripComments(read(rel)).includes(ROLE_STATUS));

const noop = (): void => {};
const tick = (ms: number): void => void act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("① 三个实现文件剥注释后 0 处自绘浮动 toast 特征", () => {
  it("仪器双侧自证：合成正样本命中 3 项、负样本 0 命中", () => {
    const positive = 'const el = <div role="status" style={{ position: "fixed", zIndex: zIndex("toast") }} />;';
    const negative = 'const el = <div role="log" style={{ position: "relative" }} />;';
    expect(selfDrawnHits(positive).length, "正样本未被命中 ⇒ 判据无牙").toBe(3);
    expect(selfDrawnHits(negative), "负样本被误伤 ⇒ 判据会假红").toEqual([]);
  });

  it("逐文件 0 命中（命中即点名 文件 + 特征）", () => {
    const hits = IMPL_FILES.flatMap((f) => selfDrawnHits(CODE[f]).map((h) => `${f}  ${h}`));
    expect(hits, `自绘 toast 特征仍在：\n${hits.join("\n")}`).toEqual([]);
  });

  it("非空真兜底：三个文件都还没被改废，且各自留着新的接缝", () => {
    for (const f of IMPL_FILES) expect(CODE[f].length, `${f} 内容异常`).toBeGreaterThan(500);
    expect(CODE["App.tsx"]).toContain("<AiToast");
    expect(CODE["pages/SessionsPage.tsx"]).toContain("{toast}");
    expect(CODE["hooks/useTransientToast.tsx"]).toContain("<Toast");
  });
});

describe("② 三条链路都经 barrel 到达 `Toast`（ADR-033 §1；深导入禁止）", () => {
  it("App.tsx / useTransientToast.tsx 的 barrel 名字表含 Toast，且无深导入", () => {
    for (const f of ["App.tsx", "hooks/useTransientToast.tsx"]) {
      expect(barrelNames(CODE[f]), `${f} 未走 barrel`).toContain("Toast");
      expect(RE_DEEP.test(CODE[f]), `${f} 深导入了原语（会漏掉 motion.css 的 reduced-motion 块）`).toBe(false);
    }
  });

  it("SessionsPage 经 useTransientToast 到达原语（页级自绘实现已删）", () => {
    expect(CODE["pages/SessionsPage.tsx"]).toContain('from "../hooks/useTransientToast"');
    expect(CODE["pages/SessionsPage.tsx"]).toContain("useTransientToast(3000)");
  });

  it("计划记的第 4 套 SessionListPanel 实测是**消费者**（prop），不是第二套实现", () => {
    const panel = stripComments(read("components/SessionListPanel.tsx"));
    expect(selfDrawnHits(panel), "SessionListPanel 里出现了自绘 toast 特征").toEqual([]);
    expect(/showToast:\s*\(msg: string, kind: "ok" \| "err"\) => void/.test(panel), "它不再收 showToast prop").toBe(true);
    expect(/<Toast\b/.test(panel), "它不该自己渲染 toast").toBe(false);
  });
});

describe("③ durationMs 逐处显式（防「统一成默认 3000」）", () => {
  it("App.tsx 显式 3500（原值逐字保留）· SessionsPage 显式 3000 · hook 的原语时长为 0", () => {
    expect(CODE["App.tsx"]).toContain("durationMs={3500}");
    expect(CODE["App.tsx"]).not.toContain("durationMs={3000}");
    expect(CODE["pages/SessionsPage.tsx"]).toContain("useTransientToast(3000)");
    // hook 保留自己的状态机（计时权在 hook，单计时器）⇒ 原语侧显式 0（边界④「不自动消失」）
    expect(CODE["hooks/useTransientToast.tsx"]).toContain("durationMs={0}");
    expect(CODE["hooks/useTransientToast.tsx"]).toMatch(/useTransientToast\(durationMs = 3000\)/);
  });

  it("行为级：AiToast 到 3500ms 才退场，退场结束回调 onDismiss **恰好一次**", () => {
    const onDismiss = vi.fn();
    render(
      <AiToast
        toast={{ text: "✨ AI 任务已完成——可到内联卡片或「AI 任务中心」查看结果并采纳", kind: "ok" }}
        onDismiss={onDismiss}
      />,
    );
    tick(0); // ENTER_TICK_MS = 0：进入 entered 后才开始倒计时（原语边界①）
    tick(3499);
    // ⚠️ 判**相位**而不是「元素还在不在」：提前退场时退场兜底计时器（140+80）未必在同一批
    //    act 里跑完 ⇒ 只判存在性会漏掉「时长被改短」（变异 M4 实测过这个洞，本断言是补的）
    expect(
      screen.getByTestId("ai-toast").getAttribute("data-phase"),
      "不到 3500ms 就退场 ⇒ 时长被改短或吃了原语默认 3000",
    ).toBe("entered");
    expect(onDismiss, "还没到点就回调").not.toHaveBeenCalled();
    tick(1);
    const exiting = screen.getByTestId("ai-toast");
    expect(exiting.getAttribute("data-phase"), "到点没有进退场（出场永不触发）").toBe("exit");
    expect(onDismiss, "退场还没结束就回调").not.toHaveBeenCalled();
    fireEvent.transitionEnd(exiting, { target: exiting, currentTarget: exiting });
    expect(screen.queryByTestId("ai-toast"), "退场结束后仍挂在屏上").toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("④ 全仓 `role=\"status\"` 命中 ⊆ 白名单（原语侧必须命中）", () => {
  it("扫描器自证：原语命中、合成负样本 0 命中", () => {
    expect(stripComments(read("ui/primitives/Toast.tsx")).includes(ROLE_STATUS)).toBe(true);
    expect(stripComments('<div role="log" />').includes(ROLE_STATUS)).toBe(false);
  });

  it("白名单外的命中 = 0；且两个原语**必须在**命中集里（防空名单式空真）", () => {
    const hits = roleStatusFiles();
    const outside = hits.filter((f) => !WHITELIST.includes(f) && !DELEGATED.includes(f));
    expect(outside, `白名单外出现了 role="status"：\n${outside.join("\n")}`).toEqual([]);
    for (const rel of WHITELIST) expect(hits, `${rel} 掉出了命中集`).toContain(rel);
  });
});

describe("⑤ B15 ②：`ai-toast` 的 testid 由**渲染**证明（不是源码字符串）", () => {
  it("AI toast 渲染出的元素带 data-testid=\"ai-toast\"，且走 belowNav 档（类，无行内 top）", () => {
    render(<AiToast toast={{ text: "❌ AI 任务失败（other）：未知错误", kind: "err" }} onDismiss={noop} />);
    const el = screen.getByTestId("ai-toast");
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live"), "err 档必须 assertive").toBe("assertive");
    expect(el.getAttribute("class")).toContain("ed-toast--below-nav");
    expect(el.style.top, "行内 top ⇒ 位置语义脱离类（ADR-033 §4）").toBe("");
    expect(el.style.zIndex).toBe(String(Z_TIER.toast));
  });

  it("无 toast 时不渲染 ai-toast（受控 open 语义）", () => {
    render(<AiToast toast={null} onDismiss={noop} />);
    expect(screen.queryByTestId("ai-toast")).toBeNull();
  });
});

describe("⑥ 登记例外：面板级内联 banner 未迁（B2 式带理由的例外）", () => {
  const EXCEPTION = {
    file: "components/session-detail/SessionScreenCards.tsx",
    why: "面板级单屏保存反馈：渲染在**匹配屏的卡片内部**（行内 banner，无 fixed / 无 role），"
      + "锚定语义是「哪张屏刚保存」；迁到 Toast 会变成视口浮动通知（丢掉屏键锚定）= 用户可见"
      + "语义变化，且 T10 的授权文件清单不含它 ⇒ 登记不迁，等原语有位置档时再议",
  };

  it("理由非空且 >20 字（例外不许静默）", () => {
    expect(EXCEPTION.why.trim().length).toBeGreaterThan(20);
  });

  it("它今天**必须仍未浮动**：一旦变成浮动 toast，本例外必须重议（判据变红）", () => {
    const src = stripComments(read(EXCEPTION.file));
    expect(selfDrawnHits(src), `${EXCEPTION.file} 已变成浮动实现 ⇒ 例外失效，须重议`).toEqual([]);
    expect(src).toContain("panelToast && panelToast.screenKey");
  });

  it("计时器仍留在它自己的状态宿主里（未迁形态可核：4000ms）", () => {
    const host = stripComments(read("hooks/useSessionDetailData.ts"));
    expect(host).toContain("setPanelToast");
    expect(/setTimeout\(\(\) => setPanelToast\(null\), 4000\)/.test(host)).toBe(true);
  });
});
