// @vitest-environment jsdom
/**
 * @ai-context ChatLaunchMenu.test.tsx —— T13-b「拆件」提交的**行为等价性证据**（B7）。
 *
 * Why（这条判据为什么必须在拆件提交里）：`ChatPage.tsx` 只有间接覆盖，而拆件动的是可交互的
 * JSX（开合状态 + 两处回调 + 三个 testid）。若拆件与迁移合并成一个提交，「行为等价」就只能靠
 * 读 diff 断言 —— B7 的裁决理由逐字就是这一点。故本文件在**拆件提交**里落地，并把拆件前的
 * 三条可观察行为（开合 / 选中 / 点空白收起）钉成判据。
 *
 * 五条判据：
 *   ① 初始**收起**：面板与两个条目都不在树上（`queryByTestId` 为 null），只有触发钮；
 *   ② 点触发钮 ⇒ 面板出现，且**两个条目都在**、`data-app-menu` 标记保留（拆件前逐字有）；
 *   ③ 点「AI 精修」⇒ `onLaunch("refine")` **恰好一次**，且面板**自行收起**；
 *   ④ 点「AI 知识补充」⇒ `onLaunch("enrich")` **恰好一次**，且面板**自行收起**；
 *   ⑤ 点透明点击层 ⇒ `onLaunch` **零次**（它不是选中），面板收起。
 *
 * 副作用：只挂 React 树（jsdom），不读 store、不发 IPC。边界：本仓未装 jest-dom ⇒ 只用原生 DOM API。
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatLaunchMenu from "./ChatLaunchMenu";

afterEach(cleanup);

const OPEN = "task-launch-open";
const MENU = "task-launch-menu";
const REFINE = "task-launch-refine";
const ENRICH = "task-launch-enrich";

describe("ChatLaunchMenu：拆件后的行为与拆件前逐条一致", () => {
  it("① 初始收起：只有触发钮在树上，面板与两个条目都不存在", () => {
    render(<ChatLaunchMenu onLaunch={() => undefined} />);
    expect(screen.getByTestId(OPEN).textContent).toBe("✨ 发起任务 ▾");
    expect(screen.queryByTestId(MENU)).toBeNull();
    expect(screen.queryByTestId(REFINE)).toBeNull();
    expect(screen.queryByTestId(ENRICH)).toBeNull();
  });

  it("② 点触发钮 ⇒ 面板打开；两个条目都在；`data-app-menu` 标记保留", () => {
    render(<ChatLaunchMenu onLaunch={() => undefined} />);
    fireEvent.click(screen.getByTestId(OPEN));
    const menu = screen.getByTestId(MENU);
    expect(menu.getAttribute("data-app-menu")).toBe("");
    expect(screen.getByTestId(REFINE).textContent).toBe("✨ AI 精修（会话 → 精修成笔记）");
    expect(screen.getByTestId(ENRICH).textContent).toBe("📚 AI 知识补充（笔记 → 补外部知识）");
  });

  it("③ 点「AI 精修」⇒ 回调恰一次 refine，且面板自行收起", () => {
    const onLaunch = vi.fn();
    render(<ChatLaunchMenu onLaunch={onLaunch} />);
    fireEvent.click(screen.getByTestId(OPEN));
    fireEvent.click(screen.getByTestId(REFINE));
    expect(onLaunch.mock.calls).toEqual([["refine"]]);
    expect(screen.queryByTestId(MENU)).toBeNull();
  });

  it("④ 点「AI 知识补充」⇒ 回调恰一次 enrich，且面板自行收起", () => {
    const onLaunch = vi.fn();
    render(<ChatLaunchMenu onLaunch={onLaunch} />);
    fireEvent.click(screen.getByTestId(OPEN));
    fireEvent.click(screen.getByTestId(ENRICH));
    expect(onLaunch.mock.calls).toEqual([["enrich"]]);
    expect(screen.queryByTestId(MENU)).toBeNull();
  });

  it("⑤ 点透明点击层 ⇒ 不触发选中，面板收起", () => {
    const onLaunch = vi.fn();
    const { container } = render(<ChatLaunchMenu onLaunch={onLaunch} />);
    fireEvent.click(screen.getByTestId(OPEN));
    // 点击层是根节点的**首个子节点的首个子节点**（`relative` 壳 → 触发钮 / 点击层 / 面板）：
    // 用结构定位而不是类名 —— 拆件后没有类名，testid 也不该为点击层新造（原来就没有）。
    const scrim = container.firstElementChild?.children[1] as HTMLElement | undefined;
    expect(scrim, "点击层不在预期位置（结构变了，判据要跟着改）").toBeTruthy();
    expect(scrim?.getAttribute("data-testid")).toBeNull();
    fireEvent.click(scrim as HTMLElement);
    expect(onLaunch.mock.calls).toEqual([]);
    expect(screen.queryByTestId(MENU)).toBeNull();
  });
});
