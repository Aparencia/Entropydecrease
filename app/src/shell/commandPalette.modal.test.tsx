// @vitest-environment jsdom
/**
 * @ai-context `shell/CommandPalette.tsx` 迁入 `Modal` + 原语内容层（批 4 T9 · 控制方选项 (b)）的
 *   **渲染级判据**。
 *
 * Why 单独立文件：`CommandPalette.test.tsx`（批 3 T11 的交付面）里的判据是**源码文本级 + 少量渲染级**，
 *   本轮只做**最小改写**（逐条见 `task-9-report.md` §6.2）；迁移本身需要的是「渲染出来到底是不是
 *   只有一套弹层、键盘还通不通、内容层是不是原语」这三件**只有真渲染才能证**的事 ⇒ 另立本文件
 *   （与 `dialogMigration.{a1,a2,b,e}.test.ts` 的分居理由同源）。
 *
 * 判据（每条各带**自己的**变异体，且每个变异**新解一棵导出树**；实测见 `task-9-report.md` §6.2）：
 *   ① **单实现**：整个面板恰有 **1 个** `role="dialog"`（不出现第二套弹层语义），它带 `aria-modal`，
 *      遮罩是 `Modal` 的三段式 testid（`command-palette-overlay`，与原自建遮罩**恰好同名**）；
 *   ② **键盘可达性**（选项 (b) 的硬要求：改内容层不许把键盘弄丢）：打开即聚焦搜索框 ·
 *      ↑↓ 在 **11** 项上循环移动 `aria-selected` · Enter 执行并关闭；
 *   ③ **项数正确**：`role="option"` 恰 `ALL_ENTRIES.length + 2`（9 页 + 对话面板 + 新建体系），
 *      且每项都能被 `getByTestId("command-<id>")` 定位（注册表逐条对拍，不硬编码 label）；
 *   ④ **内容层由既有原语表达**：选项正文是 `Text`（`.ed-text`，hint 走 `ink-3` 墨度）·
 *      空态是 `EmptyState`（`.ed-empty`）· 降级行是 `StatusLine`（`.ed-status--warn`）。
 *
 * ⚠️ 底座（照抄勿改）：全局 `environment: "node"` ⇒ 首行必须 jsdom 指令；**未装** `jest-dom` /
 *   `user-event` ⇒ 原生 DOM API + `fireEvent`；无 `globals` ⇒ 显式 `afterEach(cleanup)`。
 * ⚠️ 本文件**不得出现** `role="dialog"` 的字面量：`ui/primitives/dialogMigration.a2.test.ts` 扫全仓
 *   非原语 `.ts/.tsx`（**含测试文件**）的该形态，出现即被判为「又一次自建 dialog」。故一律用
 *   `getAllByRole("dialog")` / `getAttribute("role")` 这类**运行期**读法。
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { CommandPalette } from "./CommandPalette";
import { ALL_ENTRIES } from "./navRegistry";

const base = { open: true, onClose: vi.fn(), onPick: vi.fn() };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]); // 默认零命中（阴性基线；空查询根本不发 IPC）
});
afterEach(cleanup);

describe("① 单实现：整个面板只有 `Modal` 一个 dialog（ADR-033 §7）", () => {
  it("恰有 1 个 dialog，它带 aria-modal，且遮罩是 `Modal` 的三段式 testid", () => {
    render(<CommandPalette {...base} />);
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs, "出现两个 dialog ⇒ 面板自建了第二套弹层").toHaveLength(1);
    expect(dialogs[0].getAttribute("aria-modal")).toBe("true");
    expect(dialogs[0].getAttribute("data-testid")).toBe("command-palette");
    // 遮罩与原自建遮罩**同名**（`Modal` 的 `${testId}-overlay`）⇒ 调用点测试锚点零迁移成本
    expect(screen.getByTestId("command-palette-overlay").contains(dialogs[0]), "面板不在遮罩里").toBe(true);
    // 仪器自证：`getAllByRole` 真的能数出多份（否则「恰 1 个」可能只是这个 role 根本读不到）
    const probe = document.createElement("div");
    probe.setAttribute("role", "dialog");
    document.body.appendChild(probe);
    expect(screen.getAllByRole("dialog"), "role 读法失效（加一份都数不出来）").toHaveLength(2);
    probe.remove();
  });
});

describe("② 键盘可达性不因内容层改写而降级（选项 (b) 的硬要求）", () => {
  it("打开即把焦点钉在搜索框（`Modal` 的陷阱给的是头部关闭钮 ⇒ 调用点补的初始焦点生效）", () => {
    render(<CommandPalette {...base} />);
    expect(document.activeElement, "焦点没落在搜索框").toBe(screen.getByTestId("command-palette-input"));
  });

  it("↑↓ 在 11 项上循环移动 aria-selected；Enter 执行并关闭", () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} onPick={onPick} />);
    const input = screen.getByTestId("command-palette-input");
    const idOf = (i: number): string | null => screen.getAllByRole("option")[i].getAttribute("data-testid");
    const selected = (): string | null =>
      screen.getAllByRole("option").find((o) => o.getAttribute("aria-selected") === "true")?.getAttribute("data-testid") ?? null;

    expect(selected(), "首项不是默认选中项").toBe(idOf(0));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selected(), "↓ 没有移动选中项").toBe(idOf(1));
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(selected(), "↑ 没有回到首项").toBe(idOf(0));
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(selected(), "↑ 在首项没有回绕到末项").toBe(idOf(10));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick, "Enter 没有执行末项命令").toHaveBeenCalledWith({ kind: "create-system" });
    expect(onClose, "执行后没有关面板").toHaveBeenCalledTimes(1);
  });
});

describe("③ 项数正确：注册表逐条可定位（不硬编码 label）", () => {
  it("role=option 恰 ALL_ENTRIES.length + 2，且 9 页逐条有 testid", () => {
    render(<CommandPalette {...base} />);
    expect(screen.getAllByRole("option"), "列表项数不对（9 页 + 对话面板 + 新建体系）").toHaveLength(
      ALL_ENTRIES.length + 2,
    );
    for (const e of ALL_ENTRIES) expect(screen.getByTestId(`command-page:${e.key}`), e.key).toBeTruthy();
    expect(screen.getByTestId("command-dock")).toBeTruthy();
    expect(screen.getByTestId("command-focus:create-system")).toBeTruthy();
    expect(screen.queryByTestId("command-page:not-a-page"), "阴性样本：不存在的命令不该被找到").toBeNull();
  });
});

describe("④ 内容层由既有原语表达（选项 (b)：不留自带 CSS，也不许行内 style）", () => {
  it("选项正文是 `Text`（hint 走 ink-3 墨度），且调用点渲染的节点都不带行内 style", () => {
    render(<CommandPalette {...base} />);
    const first = screen.getByTestId(`command-page:${ALL_ENTRIES[0].key}`);
    // 判据钉在**首个元素子节点**上（= 标签本身）：只写 `querySelector(".ed-text")` 会被**同一行里的
    // hint** 满足（hint 也是 `Text`）⇒ 那是空真（P14 变异体实测：标签换成裸 `<span>` 时它照旧绿）。
    const labelEl = first.firstElementChild;
    expect(labelEl?.classList.contains("ed-text"), "选项正文不是 Text 原语渲染的").toBe(true);
    expect(first.querySelector(".ed-text--ink-3"), "hint 没有走 ink-3 墨度（自行挑了颜色？）").toBeTruthy();
    // 行内 `style` 禁止（ADR-033 §4）：**调用点渲染的每一个节点**都不得自带 style 属性。
    // （只判调用点自己的节点 —— `Modal` 遮罩上那条 `zIndex` 是原语的事，钉在 `CommandPalette.test.tsx` ②。）
    const owned = [screen.getByTestId("command-palette-input"), screen.getByTestId("command-palette-list"), first];
    const styled = owned.filter((el) => el.hasAttribute("style")).map((el) => el.getAttribute("data-testid"));
    expect(styled, `调用点给这些节点写了行内 style：${styled.join(" / ")}`).toEqual([]);
  });

  it("降级行是 `StatusLine`（warn 档）、空态是 `EmptyState`（.ed-empty）", async () => {
    invokeMock.mockRejectedValueOnce("学习库索引未就绪");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      render(<CommandPalette {...base} />);
      const input = screen.getByTestId("command-palette-input");
      fireEvent.change(input, { target: { value: "眼影" } });
      await act(async () => { vi.advanceTimersByTime(200); });
      await act(async () => { await Promise.resolve(); });
      const degraded = screen.getByTestId("command-palette-degraded");
      expect(degraded.classList.contains("ed-status"), "降级行不是 StatusLine 渲染的").toBe(true);
      expect(degraded.classList.contains("ed-status--warn"), "降级行不是 warn 档").toBe(true);
      expect(degraded.getAttribute("role")).toBe("status");
      // 零命中（IPC 失败 ⇒ 无命中 + 查询词不匹配页面名）⇒ 空态是 `EmptyState`
      fireEvent.change(input, { target: { value: "zzz-不存在的命令" } });
      await act(async () => { vi.advanceTimersByTime(200); });
      await act(async () => { await Promise.resolve(); });
      const empty = screen.getByTestId("command-palette-empty");
      expect(empty.classList.contains("ed-empty"), "空态不是 EmptyState 渲染的").toBe(true);
      expect(empty.textContent).toContain("没有匹配的命令");
      expect(warn, "降级没有留下日志（等于空 catch）").toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      warn.mockRestore();
    }
  });
});
