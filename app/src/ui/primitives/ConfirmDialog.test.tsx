// @vitest-environment jsdom
/**
 * @ai-context ConfirmDialog.test.tsx —— 危险确认的**语义契约**测试（批 0-D Task 8；规格 §5.3）。
 *
 * Why jsdom：弹层经 `Modal` 走 portal 且带焦点陷阱 ⇒ 要真容器与 `document.activeElement`（同理，
 * 样式判据只能读文本：`vitest.config.ts` 的 `css` 为 false ⇒ 测试环境不加载样式表，范式 C）。
 * 本文件钉住五件事：① §5.3「框内必须列明级联影响与保留项」；② **危险语义用色**：确认按钮保持中性、
 * `--ed-stamp` 绝不出现在任何 `background*` 声明里（裁决③ · 与 Task 14 第 4 条守卫**同向**）；③ **复用
 * Modal 内核**（扫源码作证据：含 `from "./Modal"`、不含 Portal 与层级标尺符号，且本原语 CSS 无层级无定位）；
 * ④ 可中断 / 可反向 / 重复触发」的确定行为（§8.6.1 第 3 条）；⑤ 退场相位（`open=false` 仍在淡出的 160ms）
 * 内整个对话框失活 —— 点击即时、退场异步 ⇒ 第二次点击会落到按钮上（评审 I-1，见该 describe 的用例）。
 *
 * 副作用：无（只挂 React 树 + 读三个文本文件）；假计时器只用在推进 presence 计时的那个 describe。
 * 边界：不用 jest-dom（本仓未装）—— 一律 `getAttribute` / `textContent` / `document.activeElement`。
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import type { ConfirmDialogProps, ConfirmImpact } from "./ConfirmDialog";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 归一 EOL（本仓无 `.gitattributes` 且 `core.autocrlf=true`，逐字节断言会在别人机器上假阳性） */
const readText = (n: string): string => readFileSync(join(HERE, n), "utf8").replace(/\r\n/g, "\n");
const CONFIRM_TSX = readText("ConfirmDialog.tsx");
const CONFIRM_CSS = readText("ConfirmDialog.css");
const BUTTON_CSS = readText("Button.css");
const noop = (): void => {};

/** 规格 §5.3 的范例：级联删除项 + 保留项（保留项必须与删除项一眼可分） */
const IMPACTS: readonly ConfirmImpact[] = [
  { text: "将删除 1 个组" },
  { text: "3 条排序记录" },
  { text: "笔记 7 篇保留", keep: true },
];

/** 宿主 props：派生自原语契约（`Partial` + 必需的 `open`）；受控形态，`open` 由测试 rerender 驱动 */
type HostProps = Partial<ConfirmDialogProps> & { open: boolean };

function Host({ open, title = "删除「高数」？", onConfirm = noop, onCancel = noop, ...rest }: HostProps) {
  return <ConfirmDialog open={open} title={title} onConfirm={onConfirm} onCancel={onCancel} testId="cd" {...rest} />;
}

const panel = (): HTMLElement => screen.getByRole("dialog");
const panelOrNull = (): Element | null => document.body.querySelector('[role="dialog"]');
const confirmBtn = (): HTMLElement => screen.getByTestId("cd-confirm");
const cancelBtn = (): HTMLElement => screen.getByTestId("cd-cancel");
const sealOrNull = (): Element | null => document.body.querySelector(".ed-confirm-seal");
const cls = (el: Element): string => el.getAttribute("class") ?? "";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("① 复用 Modal 内核：本原语不自建第二套 Portal / 层叠 / 键盘", () => {
  it("源码证据：import Modal；不出现 createPortal / zIndex", () => {
    expect(CONFIRM_TSX, "必须消费 Modal（弹层唯一实现）").toContain('from "./Modal"');
    expect(CONFIRM_TSX, "自建 portal = 第二套弹层实现").not.toContain("createPortal");
    expect(CONFIRM_TSX, "自建层级 = 绕过 z-index 标尺").not.toContain("zIndex");
  });

  it("样式证据：ConfirmDialog.css 无 z-index、无 position（自建遮罩的两个特征）", () => {
    expect(CONFIRM_CSS).not.toMatch(/z-index/);
    expect(CONFIRM_CSS).not.toMatch(/position\s*:/);
  });

  it("open=false 不渲染；open=true 时 role=dialog + aria-modal + aria-labelledby==title", () => {
    const { rerender } = render(<Host open={false} />);
    expect(panelOrNull()).toBeNull();
    rerender(<Host open />);
    expect(panel().getAttribute("aria-modal")).toBe("true");
    const id = panel().getAttribute("aria-labelledby");
    expect(document.getElementById(id as string)?.textContent).toBe("删除「高数」？");
  });
});

describe("② 级联影响清单（§5.3：高危不可逆动作必须列明级联影响与保留项）", () => {
  it("impacts 逐条渲染且顺序不变；keep 项带 `ed-confirm-keep` 类与 `data-keep`", () => {
    render(<Host open impacts={IMPACTS} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["将删除 1 个组", "3 条排序记录", "笔记 7 篇保留"]);
    expect(items[0].getAttribute("class")).toBeNull();
    expect(items[0].getAttribute("data-keep")).toBeNull();
    expect(items[2].getAttribute("class")).toBe("ed-confirm-keep");
    expect(items[2].getAttribute("data-keep")).toBe("true");
  });

  it("保留项前缀是正向标记（「›」+ --ed-ok），删除项是中性「·」", () => {
    expect(CONFIRM_CSS).toMatch(/li\.ed-confirm-keep::before\s*\{[^}]*content:\s*"›"/);
    expect(CONFIRM_CSS).toMatch(/li\.ed-confirm-keep::before\s*\{[^}]*color:\s*var\(--ed-ok\)/);
  });

  it("不传 impacts / 传空数组 ⇒ 不渲染列表；message 传了才渲染", () => {
    const { rerender } = render(<Host open />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("此操作不可撤销。")).toBeNull();
    rerender(<Host open impacts={[]} />);
    expect(screen.queryByRole("list")).toBeNull();
    rerender(<Host open message="此操作不可撤销。" />);
    expect(screen.getByText("此操作不可撤销。")).toBeTruthy();
  });
});

describe("③ 危险语义用色（控制方裁决③ · 与 Task 14 第 4 条守卫同向）", () => {
  it("两个按钮都是 secondary（中性），确认按钮不得是 primary / danger", () => {
    render(<Host open />);
    for (const btn of [cancelBtn(), confirmBtn()]) {
      expect(cls(btn)).toContain("ed-btn--secondary");
      expect(cls(btn)).not.toContain("ed-btn--primary");
      expect(cls(btn)).not.toContain("danger");
    }
  });

  it("`--ed-stamp` 绝不作底色：任何 background* 声明都不得含它", () => {
    const offenders = CONFIRM_CSS.split("\n").filter(
      (line) => /^\s*background[a-z-]*\s*:/.test(line) && line.includes("var(--ed-stamp)"),
    );
    expect(offenders, "该 token 出现在 background 声明里（§4.1「绝不用于按钮」）").toEqual([]);
  });

  it("`--ed-stamp` 在本原语里只作文字色与描边（印章标记）", () => {
    const tail = CONFIRM_CSS.slice(CONFIRM_CSS.indexOf(".ed-confirm-seal {"));
    const rule = tail.slice(0, tail.indexOf("}"));
    expect(rule).toMatch(/color:\s*var\(--ed-stamp\)/);
    expect(rule).toMatch(/border:\s*1px solid var\(--ed-stamp\)/);
  });

  it("Button.css 内 `--ed-stamp` 计数为 0（Task 14 同向：按钮层不得出现危险色）", () => {
    expect((BUTTON_CSS.match(/--ed-stamp/g) ?? []).length).toBe(0);
  });

  it("印章标记存在、`aria-hidden`、有可见字符（装饰性；危险语义由清单的**文字**承载）", () => {
    render(<Host open />);
    const seal = sealOrNull();
    expect(seal, "缺印章标记 ⇒ 危险信号只剩按钮与文案").not.toBeNull();
    expect(seal?.getAttribute("aria-hidden")).toBe("true");
    expect((seal?.textContent ?? "").length).toBeGreaterThan(0);
  });
});

describe("④ 回调契约（含文案默认值与 testId 透传）", () => {
  it("确认 → onConfirm 一次；取消 → onCancel 一次", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Host open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(cancelBtn());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("默认文案「确认」/「取消」；可逐项自定义", () => {
    const { rerender } = render(<Host open />);
    expect(confirmBtn().textContent).toBe("确认");
    expect(cancelBtn().textContent).toBe("取消");
    rerender(<Host open confirmLabel="删除" cancelLabel="再想想" />);
    expect(confirmBtn().textContent).toBe("删除");
    expect(cancelBtn().textContent).toBe("再想想");
  });
});

describe("⑤ 退出路径永不产生确认（ESC / 遮罩都走 onCancel）", () => {
  it("ESC → onCancel；长按（repeat）不重复触发；onConfirm 始终 0", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Host open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape", repeat: true });
    expect(onCancel, "自动重复的 keydown 不得连关").not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("点遮罩 → onCancel；面板内 mousedown 不触发（防「面板内按下、遮罩上松开」误关）", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Host open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.mouseDown(panel());
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId("cd-overlay"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("⑥ 可中断 / 可反向 / 重复触发（§8.6.1 第 3 条）", () => {
  it("打开后焦点落在「取消」而非「确认」（危险动作不能因一个回车就发生）", () => {
    render(<Host open impacts={IMPACTS} />);
    expect(document.activeElement, "焦点必须在面板内").toBe(cancelBtn());
    expect(document.activeElement).not.toBe(confirmBtn());
  });

  it("Tab 循环仍由 Modal 的陷阱接管：焦点不逃出面板（取消 → 确认 → 回卷）", () => {
    render(<Host open />);
    expect(document.activeElement).toBe(cancelBtn());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement, "footer 内顺序：危险在右").toBe(confirmBtn());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(panel().contains(document.activeElement), "末元素必须回卷").toBe(true);
  });

  it("busy=true：两个按钮 aria-disabled，各连点 3 次仍 0 回调（重复触发的第一道防线）", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Host open busy onConfirm={onConfirm} onCancel={onCancel} />);
    for (const btn of [confirmBtn(), cancelBtn()]) {
      expect(btn.getAttribute("aria-disabled")).toBe("true");
      for (let i = 0; i < 3; i += 1) fireEvent.click(btn);
    }
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("busy 不改变退出语义（确定行为）：只有按钮被拦，ESC / 遮罩仍走 onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Host open busy onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("cd-overlay"));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("非 busy 时连点确认两次 ⇒ 恰好两次（**不做去抖**：防重复是父级 busy 的职责，见上条）", () => {
    const onConfirm = vi.fn();
    render(<Host open onConfirm={onConfirm} />);
    fireEvent.click(confirmBtn());
    fireEvent.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});

describe("⑦ 进出场时机（presence 由 Modal 承载）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const tick = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };

  it("关闭：先 exit 且仍挂载；面板收到 transitionend ⇒ 立即卸载", () => {
    const { rerender } = render(<Host open />);
    tick(0);
    rerender(<Host open={false} />);
    expect(panel().getAttribute("data-phase")).toBe("exit");
    const el = panel();
    fireEvent.transitionEnd(el, { target: el, currentTarget: el });
    expect(panelOrNull()).toBeNull();
  });

  it("可反向：出场期间 open 回 true ⇒ 不卸载、回 entered，且不产生任何回调（动效不带动作语义）", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(<Host open onConfirm={onConfirm} onCancel={onCancel} />);
    tick(0);
    rerender(<Host open={false} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(panel().getAttribute("data-phase")).toBe("exit");
    rerender(<Host open onConfirm={onConfirm} onCancel={onCancel} />);
    expect(panel().getAttribute("data-phase")).toBe("entered");
    tick(10_000);
    expect(panelOrNull(), "退场兜底计时器必须已被接管（不排队）").not.toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("反例守门：退场相位（open=false 且仍挂载）内点确认 / 取消 / 遮罩 **一个回调都不产生**", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(<Host open onConfirm={onConfirm} onCancel={onCancel} />);
    tick(0);
    rerender(<Host open={false} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(panel().getAttribute("data-phase")).toBe("exit");
    fireEvent.click(confirmBtn()); // 批 4 的误触面：点了删除、弹层在淡出、手一抖又点到确认
    fireEvent.click(cancelBtn());
    fireEvent.mouseDown(screen.getByTestId("cd-overlay"));
    expect([onConfirm.mock.calls.length, onCancel.mock.calls.length], "退场期不得再接受任何交互").toEqual([0, 0]);
  });

  it("对照组：**打开态**下三条路径各仍触发一次（防「把功能一起关掉」）", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Host open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(confirmBtn());
    fireEvent.click(cancelBtn());
    fireEvent.mouseDown(screen.getByTestId("cd-overlay"));
    // confirm 1 次；cancel 2 次 = 取消钮 1 + 遮罩 1
    expect([onConfirm.mock.calls.length, onCancel.mock.calls.length], "confirm/cancel 次数").toEqual([1, 2]);
  });
});
