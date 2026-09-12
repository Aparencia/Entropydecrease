// @vitest-environment jsdom
/**
 * @ai-context Modal.scroll-lock.test.tsx —— `Modal` 的 **body 滚动锁**行为契约（批 4 T2；B6 缺口 A）。
 *
 * Why 单列一个文件：`Modal.test.tsx` 296/300、`Modal.exit.test.tsx` 91，两者都在 300 硬红线附近；
 * 而滚动锁是**行为**（不是 prop、不是类），判据形态与它们都不同。
 *
 * Why 这五条（B6 裁决「20 个调用点共用 ⇒ 改原语」的可失败判据）：
 *   ① 开弹层 ⇒ `body` 被锁（`overflow: hidden`）；
 *   ② 锁随 `presence.mounted` 而不是 `open` —— `open=false` 之后还有 160ms 退场（面板仍在屏上），
 *      提前解锁会让背景在弹层还在时就能滚（与 §5.2 第 2 条「退场相位禁指针事件」同源）；
 *   ③ **嵌套**：弹层内再弹（`tier="modalNested"`）时关内层**不得**解锁（否则背景跳一下）；
 *   ④ 恢复的是**原值快照**而不是空串 —— 宿主页自己设过的 `overflow` 被抹掉是"看不见的破坏"；
 *   ⑤ 无 `transitionend` 的兜底路径（reduced-motion / jsdom 不派发事件）到点也必须恢复。
 *
 * 副作用：无（只挂 React 树）；假计时器只用在第 ⑤ 条。
 * 边界：不用 jest-dom（本仓未装），一律原生 `style` 断言；`document.body.style.overflow` 是
 * **既有的 app 级共享状态** ⇒ 每个用例前后都复位，防用例间串味。
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";
import type { ReactElement } from "react";

const noop = (): void => undefined;
/** 与 `Modal.tsx` 的 `EXIT_MS` / `usePresence` 的 `timeoutSlackMs` 同源：兜底窗口 = 160 + 80 */
const EXIT_FALLBACK_MS = 240;

const overflow = (): string => document.body.style.overflow;
const panel = (): HTMLElement => screen.getByRole("dialog");
/** 「当前有没有面板」的判据 —— 多条用例用它当**前提断言**（防判据在空转） */
const panelOrNull = (): Element | null => document.body.querySelector('[role="dialog"]');

/**
 * 让弹层真正走到 `entered`：`usePresence` 的 `enter → entered` 要等**下一个宏任务**
 * （`ENTER_TICK_MS = 0`，为的是让出一次绘制机会）—— 没走到 `entered` 时关闭是**直接卸载**
 * （`usePresence` 边界④：一次绘制都没发生过就不排退场窗口），退场相位根本不会出现。
 */
const tick = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

/** 卸载整个树（含 portal）并把共享的 `body` 样式复位 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.style.overflow = "";
});

function Host({ open, testId = "m" }: { open: boolean; testId?: string }) {
  return (
    <Modal open={open} onClose={noop} title="标题文本" testId={testId}>
      正文内容
    </Modal>
  );
}

/** 两层弹层：外层由 `outer` 驱动、内层由 `inner` 驱动（`tier` 各按真实层级的语义给） */
function Nested({ outer, inner }: { outer: boolean; inner: boolean }) {
  return (
    <Modal open={outer} onClose={noop} title="外层" testId="outer" tier="modal">
      <Modal open={inner} onClose={noop} title="内层" testId="inner" tier="modalNested">
        内层正文
      </Modal>
    </Modal>
  );
}

/** 关掉一层：rerender 到 `open=false` 再派发该面板自己的 `transitionend`（= 退场真结束） */
function closeAndSettle(rerender: (ui: ReactElement) => void, ui: ReactElement, testId = "m"): void {
  rerender(ui);
  const el = screen.getByTestId(testId);
  fireEvent.transitionEnd(el, { target: el, currentTarget: el });
}

describe("① 开弹层 ⇒ body 被锁（B6：20 个调用点共用，故锁在 Modal 里）", () => {
  it("未打开时不动 body；open=true 且已挂载 ⇒ overflow:'hidden'", () => {
    const { rerender } = render(<Host open={false} />);
    expect(overflow(), "没打开弹层时不得碰 body（原语不许有隐藏副作用）").toBe("");

    rerender(<Host open />);
    expect(screen.getByTestId("m-overlay").parentElement).toBe(document.body); // 前提：确实挂上了 portal
    expect(overflow()).toBe("hidden");
  });
});

describe("② 锁随 presence.mounted，不随 open（退场窗口内仍锁）", () => {
  it("open=false 且退场未结束（未派发 transitionend）⇒ 仍锁；退场结束 ⇒ 恢复", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Host open />);
    tick(0); // enter → entered（见 tick 的注释）
    expect(overflow()).toBe("hidden");

    rerender(<Host open={false} />);
    expect(panel().getAttribute("data-phase"), "前提：此时正处于退场相位").toBe("exit");
    expect(overflow(), "面板还在屏上就解锁 ⇒ 背景在弹层未消失时就能滚").toBe("hidden");

    const el = panel();
    fireEvent.transitionEnd(el, { target: el, currentTarget: el });
    expect(panelOrNull(), "前提：退场确实结束了").toBeNull();
    expect(overflow()).toBe("");
  });
});

describe("③ 嵌套：关内层不解锁，关外层才恢复（引用计数）", () => {
  it("两层同开 ⇒ 关内层仍锁；关外层 ⇒ 恢复", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Nested outer={false} inner={false} />);
    tick(0);
    rerender(<Nested outer inner />);
    tick(0);
    expect(overflow()).toBe("hidden");

    // 关内层：它自己的 transitionend 到达 ⇒ 内层被卸载，但外层还在屏上
    closeAndSettle(rerender, <Nested outer inner={false} />, "inner");
    expect(screen.queryByTestId("inner"), "前提：内层确实已卸载").toBeNull();
    expect(screen.getByTestId("outer"), "前提：外层仍在屏上").not.toBeNull();
    expect(overflow(), "内层关闭时外层还在 ⇒ 解锁会让背景跳一下").toBe("hidden");

    closeAndSettle(rerender, <Nested outer={false} inner={false} />, "outer");
    expect(panelOrNull(), "前提：外层退场结束").toBeNull();
    expect(overflow(), "最后一层关闭必须恢复").toBe("");
  });
});

describe("④ 恢复的是原值快照，不是空串", () => {
  it("开工前 body 已有 overflow:'auto' ⇒ 关完后仍是 'auto'", () => {
    vi.useFakeTimers();
    document.body.style.overflow = "auto";
    const { rerender } = render(<Host open />);
    tick(0);
    expect(overflow(), "锁期间必须是 hidden").toBe("hidden");

    closeAndSettle(rerender, <Host open={false} />);
    expect(overflow(), "恢复成空串 = 抹掉宿主页设过的值（看不见的破坏）").toBe("auto");
  });
});

describe("⑤ 无 transitionend 的兜底路径（reduced-motion / jsdom 不派发）", () => {
  it("推进 EXIT_MS + slack + 1 ms ⇒ 恢复（不派发任何事件）", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Host open />);
    tick(0);
    expect(overflow()).toBe("hidden");

    rerender(<Host open={false} />);
    tick(EXIT_FALLBACK_MS - 1);
    expect(panelOrNull(), "前提：兜底窗口未到，面板仍在").not.toBeNull();
    expect(overflow(), "面板仍在时不得提前解锁").toBe("hidden");

    tick(1);
    expect(panelOrNull(), "前提：兜底窗口到点后确实卸载了").toBeNull();
    expect(overflow()).toBe("");
  });
});

describe("⑥ 原值快照属于**第一个**持锁者（弹层交接时不许被改写成 'hidden'）", () => {
  /**
   * 交接场景：A 正在退场（`open=false` 但未收到 `transitionend`）而 B 已打开。
   * A 与 B **必须是两个独立实例** —— 同一个 `Modal` 只改 `open`/`testId` 是"同一个持锁者"，
   * 测不出快照归属（第一版正是这样写的，被"`a` 找不到"当场证伪）。
   */
  function Handoff({ a, b }: { a: boolean; b: boolean }) {
    return (
      <>
        <Modal open={a} onClose={noop} title="弹层 A" testId="a">
          A
        </Modal>
        <Modal open={b} onClose={noop} title="弹层 B" testId="b">
          B
        </Modal>
      </>
    );
  }

  it("A 退场未结束时 B 接手 ⇒ 全程锁住，且最终恢复成最初的原值 'auto'", () => {
    vi.useFakeTimers();
    document.body.style.overflow = "auto";
    const { rerender } = render(<Handoff a b={false} />);
    tick(0);

    // A 开始退场（未收到 transitionend）⇒ 仍持锁；B 随即打开 ⇒ 两个持锁者并存
    rerender(<Handoff a={false} b={false} />);
    expect(screen.getByTestId("a").getAttribute("data-phase")).toBe("exit");
    rerender(<Handoff a={false} b />);
    tick(0); // B 是**新挂载**的实例：它也要走一次 enter → entered（见 tick 的注释）
    expect(overflow(), "交接期间不得出现「背景能滚」的窗口").toBe("hidden");

    // A 的退场结束 ⇒ 释放一次；B 仍持锁 ⇒ 仍 hidden
    const panelA = screen.getByTestId("a");
    fireEvent.transitionEnd(panelA, { target: panelA, currentTarget: panelA });
    expect(screen.queryByTestId("a"), "前提：A 已卸载").toBeNull();
    expect(screen.getByTestId("b"), "前提：B 仍在屏上").not.toBeNull();
    expect(overflow(), "B 仍在 ⇒ 不许解锁").toBe("hidden");

    // B 也退场 ⇒ 恢复的必须是**最初**的原值（若第二个持锁者改写了快照，这里会是 'hidden'）
    closeAndSettle(rerender, <Handoff a={false} b={false} />, "b");
    expect(overflow(), "快照被后来者改写 ⇒ 宿主页的 'auto' 永久丢失").toBe("auto");
  });
});

/* ── T17 / C10#14 追加段：解锁恢复滚动位置（**纯追加**：既有 6 个用例与既有 import 一行未动）──────
 * 判据形态（C15「只能登记」边界）：jsdom **不做布局** ⇒「恢复后用户看见的位置对不对」**不可验**；
 *   本段只钉两件**可观测**的事，**不作**"已在浏览器验证滚动恢复"的声称：① 两条**纯函数**的契约；
 *   ② **接线**：加锁时读宿主、解锁写回**快照**（不是当前值），且快照归**第一个**持锁者。
 * 宿主两条腿都覆盖（探针实测：jsdom 30 **没有** `document.scrollingElement` ⇒ 天然只走兜底腿）：
 *   主腿 = 注入的假宿主（`Object.defineProperty`，仓库既有注入先例）；兜底腿 = jsdom 的真 `body`
 *   （它**会存** `scrollTop`：探针实测写 251 读回 251 —— 是属性存储，**不是**布局）。
 */
import { restoreScroll, saveScroll } from "./Modal"; // 独立成行：既有那行 import 保持逐字原样

/** 假滚动宿主：`scrollTop` 是唯一契约面；`reads` 计读、`writes` 记写、`jump` = 外部挪动（不计写） */
function fakeHost(initial: number): { host: { scrollTop: number }; reads: () => number; writes: () => number[]; jump: (v: number) => void } {
  let value = initial;
  let reads = 0;
  const writes: number[] = [];
  const host = {
    get scrollTop(): number { reads += 1; return value; },
    set scrollTop(v: number) { writes.push(v); value = v; },
  };
  return { host, reads: () => reads, writes: () => writes, jump: (v) => { value = v; } };
}

describe("⑦ 解锁时恢复滚动位置（T17 / C10#14；规格 §7.3 第 2 条同族）", () => {
  afterEach(() => {
    delete (document as unknown as { scrollingElement?: unknown }).scrollingElement;
    document.body.scrollTop = 0;
  });

  it("纯函数契约：saveScroll 读宿主并原样返回；restoreScroll 写宿主（含 0 与覆盖）", () => {
    const { host, reads, writes } = fakeHost(250);
    expect(saveScroll(host), "保存 = 原样读回宿主的 scrollTop").toBe(250);
    expect(reads(), "saveScroll 必须真的读了宿主（否则它可以返回任何常量）").toBeGreaterThan(0);
    restoreScroll(host, 120);
    expect(host.scrollTop, "计划逐字的样例：restoreScroll(fakeHost, 120) ⇒ 120").toBe(120);
    restoreScroll(host, 0);
    expect(host.scrollTop, "恢复 0 也是合法写（宿主本来就可能在顶部）").toBe(0);
    expect(writes(), "两次恢复各写一次，写的都是传进来的值").toEqual([120, 0]);
  });

  it("接线主腿：加锁时读 scrollingElement；解锁写回**快照**（期间宿主被挪动 ⇒ 仍回快照）", () => {
    vi.useFakeTimers();
    const { host, reads, writes, jump } = fakeHost(250);
    Object.defineProperty(document, "scrollingElement", { configurable: true, get: () => host });
    const { rerender } = render(<Host open />);
    tick(0);
    expect(reads(), "前提：加锁时确实读了这个宿主（主腿优先于兜底腿）").toBeGreaterThan(0);
    jump(999); // 弹层期间宿主被别的东西挪动过
    closeAndSettle(rerender, <Host open={false} />);
    expect(writes(), "解锁时必须写回**打开前的快照**，不是当前值").toContain(250);
    expect(host.scrollTop, "恢复后宿主回到打开前的位置").toBe(250);
  });

  it("接线兜底腿 + 快照归属：无 scrollingElement ⇒ 写 document.body；关内层不恢复、关外层才恢复", () => {
    vi.useFakeTimers();
    document.body.scrollTop = 300; // 打开前"页面已滚了 300"
    const { rerender } = render(<Nested outer={false} inner={false} />);
    tick(0);
    rerender(<Nested outer inner />);
    tick(0);
    document.body.scrollTop = 888; // 期间被挪动
    closeAndSettle(rerender, <Nested outer inner={false} />, "inner");
    expect(document.body.scrollTop, "内层关闭时外层还在 ⇒ 不许恢复（快照归第一个持锁者）").toBe(888);
    closeAndSettle(rerender, <Nested outer={false} inner={false} />, "outer");
    expect(document.body.scrollTop, "最后一层关闭必须写回打开前的快照").toBe(300);
  });
});
