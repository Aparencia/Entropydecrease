// @vitest-environment jsdom
/**
 * SessionDetailHeader.test.tsx — 批 5 · T11（C13）的判据面（该文件**在批 5 开工时无同名测试**）。
 *
 * @ai-context: C13 逐字「先补 1 条行为级判据（该文件无同名测试），判据形态 = 静态结构级
 *              （`position: sticky` ∧ `top` 来自 token）」⇒ 粘性改在**无网处**，本文件先立网。
 *              D1 **行为级**（改前就该绿、改后必须仍绿）：标题/状态行/动作区可达 · ✎ 进改名 ·
 *              Esc 取消 · Enter 提交时 `update_session_title` 的**实参与调用时机**逐字不变
 *              （Enter 前 0 次 / Enter 后恰 1 次 / 同标题值 ⇒ 0 次）—— 粘性只许改样式，
 *              **不许碰这条路径**（V2 的「invoke 调用点与时机零 diff」由 D1-c/D1-d 顶住）。
 *              D2/D3 **静态结构级**（改前应红、改后绿）：`position: sticky` ∧ `top` 走
 *              **已在 `ui/tokens.css` 声明**的 token（不是裸数字、也不是编造的 var 名）∧
 *              `z-index` 走 `zIndex("raised")` 档位 ∧ 底色走 canvas token（防正文透出）。
 *
 * @ai-context 仪器边界（**已写进 T11 报告的「未验证」单列**）：jsdom **不排版** —— 它只把行内
 *              `style` 序列化成 attribute。`position: sticky` 与 `top` 是否**真的吸顶**、
 *              4px 的观感、滚动时底色是否挡住正文，**本文件一行都测不出**；这是 C15「只能登记」
 *              清单里的 `sticky 真实粘性`。⇒ D2/D3 是**结构判据**，不是粘性判据，**不许**当成
 *              「粘性已验证」。
 * @ai-context 已知分辨力缺口（诚实登记）：`z-index` 的**数值**在 DOM 上与裸等值数字（`10`）
 *              **不可分辨** ⇒ D3 只能证明「等于 raised 档、且不等于相邻档」；「源码里写的是档位
 *              函数而非字面量」由 `ui/zIndex.guard.test.ts`（源码扫描，见其文件头 ④ 的口径）
 *              补 —— 两条仪器同批同变异体的读数见 T11 报告 §判据与变异。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionDetail } from "../../types";
import { zIndex } from "../../ui/zIndex";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import SessionDetailHeader from "./SessionDetailHeader";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `ui/tokens.css` 里是否**声明**了该 token（`--ed-x:` / `--ed-x :` 两种写法都认） */
function declaresToken(name: string): boolean {
  const css = readFileSync(join(HERE, "..", "..", "ui", "tokens.css"), "utf8");
  return new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(css);
}

function detailOf(over: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: 1042,
      title: "化学反应速率",
      source_window: "Chrome",
      started_at: 1_700_000_000_000,
      ended_at: 1_700_000_600_000,
      status: "finished",
      kind: null,
    },
    segments: [
      { id: 7001, session_id: 1042, start_ms: 0, end_ms: 2500, text: "第一段讲述", source: "subtitle", confidence: 0.9 },
      { id: 7002, session_id: 1042, start_ms: 2500, end_ms: 5000, text: "第二段讲述", source: "asr", confidence: 0.7 },
    ],
    ocr_blocks: [],
    screens: [],
    ...over,
  };
}

const noop = () => {};
const Header = (over: Record<string, unknown> = {}) => (
  <SessionDetailHeader
    detail={detailOf()}
    fusing={false}
    degradedBanner={null}
    onToNote={noop}
    onRemove={noop}
    onRefreshDetail={noop}
    {...over}
  />
);

/** 粘性锚点的**行内** style（D2/D3 的唯一取数口；锚点不存在 ⇒ `getByTestId` 自己红，不静默返回空串） */
const headerStyle = (): CSSStyleDeclaration => (screen.getByTestId("session-header") as HTMLElement).style;

/** 从 `var(--ed-x, fallback)` 里取出 token 名；形态不对 ⇒ 显式抛（断言失败要可归因） */
function tokenNameOf(value: string): string {
  const m = /^var\(\s*(--ed-[\w-]+)\s*(?:,[\s\S]*)?\)$/.exec(value);
  if (!m) throw new Error(`不是 token 形态：${JSON.stringify(value)}`);
  return m[1];
}

beforeEach(() => {
  invokeMock.mockReset();
  // 缺省 reject（与 `SessionDetailPanel.test.tsx` 同款）：改名失败分支的断言只显式 resolve 的用例覆盖
  invokeMock.mockImplementation((cmd: string) => Promise.reject(new Error(`invoke not mocked: ${cmd}`)));
});
afterEach(() => cleanup());

describe("D1 · 行为级（改前就该绿；粘性改动不许动这条路径）", () => {
  it("D1-a 渲染即可达：标题 / 状态行 / 动作区 / ✎ 全在位，且渲染本身**零 IPC**", () => {
    render(<Header />);
    expect(screen.getByText("化学反应速率")).toBeTruthy();
    expect(screen.getByTestId("session-rename-open")).toBeTruthy();
    expect(screen.getByText("📝 转为笔记")).toBeTruthy();
    expect(screen.getByText("删除")).toBeTruthy();
    // 状态行是 header 的一部分（粘性后仍在头里，不被裁掉）
    expect(document.body.textContent).toContain("已完成 · 2 段转写 · 0 块画面");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("D1-b ✎ 进改名（预填原标题）· Esc 取消 ⇒ 输入框消失、标题回来、**零 IPC**", () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId("session-rename-open"));
    const input = screen.getByTestId("session-title-input") as HTMLInputElement;
    expect(input.value).toBe("化学反应速率");
    fireEvent.change(input, { target: { value: "改了一半就反悔" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("session-title-input")).toBeNull();
    expect(screen.getByText("化学反应速率")).toBeTruthy();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("D1-c Enter 提交：**时机**（Enter 前 0 次 → Enter 后恰 1 次）+ 实参逐字（已 trim）+ 成功后退出并重拉", async () => {
    const onRefreshDetail = vi.fn();
    invokeMock.mockResolvedValue(undefined);
    render(<Header onRefreshDetail={onRefreshDetail} />);
    fireEvent.click(screen.getByTestId("session-rename-open"));
    const input = screen.getByTestId("session-title-input");
    fireEvent.change(input, { target: { value: "  速率与平衡  " } });
    expect(invokeMock, "改值本身不该发 IPC").toHaveBeenCalledTimes(0);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("update_session_title", { id: 1042, title: "速率与平衡" });
    await waitFor(() => expect(screen.queryByTestId("session-title-input")).toBeNull());
    expect(onRefreshDetail).toHaveBeenCalledWith(1042);
    expect(invokeMock, "成功后不该补发第二次 IPC").toHaveBeenCalledTimes(1);
  });

  it("D1-d 不变量：trim 后与原标题相同 ⇒ **零 IPC** 且退出改名（拆分前的早退逐字保留）", () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId("session-rename-open"));
    const input = screen.getByTestId("session-title-input");
    fireEvent.change(input, { target: { value: "  化学反应速率  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(invokeMock).toHaveBeenCalledTimes(0);
    expect(screen.queryByTestId("session-title-input")).toBeNull();
  });

  it("D1-e 失败面未被顺手改动：reject ⇒ 留在改名态 + 错误行出现（逐字「改名失败: …」）", async () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId("session-rename-open"));
    const input = screen.getByTestId("session-title-input");
    fireEvent.change(input, { target: { value: "新标题" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(document.body.textContent).toContain("改名失败: Error: invoke not mocked: update_session_title"));
    expect(screen.getByTestId("session-title-input")).toBeTruthy();
  });
});

describe("D2 · 静态结构级（C13：`position: sticky` ∧ `top` 来自 token）", () => {
  it("D2-a `session-header` 是粘性头：`position: sticky`（行内 style 序列化里逐字可见）", () => {
    render(<Header />);
    expect(headerStyle().position).toBe("sticky");
    expect(screen.getByTestId("session-header").getAttribute("style")).toContain("position: sticky");
  });

  it("D2-b `top` 来自 token：`var(--ed-…)` ∧ **该 token 在 tokens.css 已声明**（不许裸数字 / 编造 var 名）", () => {
    render(<Header />);
    const top = headerStyle().top;
    expect(top, `top 实测 ${JSON.stringify(top)}`).toMatch(/^var\(\s*--ed-[\w-]+/);
    expect(top, "top 不许是裸数字 / 裸像素").not.toMatch(/^-?[\d.]/);
    const name = tokenNameOf(top);
    expect(declaresToken(name), `top 引用的 ${name} 在 ui/tokens.css 里没有声明`).toBe(true);
    // 反例控制：编造的 var 名必须查不到（否则上一条是空真）
    expect(declaresToken("--ed-no-such-token-xyzq")).toBe(false);
    // 兜底值只许是**长度**（不是 `0` 那种"没写"的形态；兜底的存在理由见 T11 报告）
    expect(top).toContain(",");
  });

  it("D2-c 底色走 canvas token（防正文从粘性头下透出；不许写色值字面量）", () => {
    render(<Header />);
    const bg = headerStyle().background;
    expect(declaresToken(tokenNameOf(bg)), `background = ${JSON.stringify(bg)}`).toBe(true);
    expect(bg, "底色不许出现色值字面量").not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });
});

describe("D3 · 层级走标尺（ADR-032 决策 5：不得写裸数字 z-index）", () => {
  it("D3 `session-header` 的 z-index = `zIndex(\"raised\")` 档位值，且与相邻档不同（有分辨力）", () => {
    render(<Header />);
    const z = headerStyle().zIndex;
    // 反例控制：仪器能分辨档位（否则「等于 raised」这条对任何值都成立 ⇒ 空真）
    expect(zIndex("raised")).not.toBe(zIndex("panel"));
    expect(z).toBe(String(zIndex("raised")));
    expect(z).not.toBe(String(zIndex("panel")));
  });
});
