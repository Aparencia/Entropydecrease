// @vitest-environment jsdom
/**
 * clipboardWrite.test.ts — 剪贴板写入 util（REQ-317）。
 * 覆盖：主路径（clipboard API）成功；主路径拒绝 → 兜底 execCommand 成功；
 *       双路径皆不可用 → false（不抛异常）；navigator 缺失环境守卫。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeClipboardText } from "./clipboardWrite";

const originalClipboard = navigator.clipboard;

/** jsdom 未实现 document.execCommand——按需以 stub 属性注入（afterEach 清理） */
function stubExecCommand(impl: () => boolean) {
  Object.defineProperty(document, "execCommand", { configurable: true, value: impl });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  Object.defineProperty(document, "execCommand", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
});

describe("writeClipboardText", () => {
  it("clipboard API 可用 → 写入成功返回 true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await expect(writeClipboardText("片段")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("片段");
  });

  it("clipboard API 拒绝 → 兜底 execCommand 路径", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const exec = vi.fn().mockReturnValue(true);
    stubExecCommand(exec);
    await expect(writeClipboardText("片段")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    // 兜底临时 textarea 已清理（不留 DOM 残渣）
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("双路径不可用 → false（不抛异常）", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    stubExecCommand(() => false);
    await expect(writeClipboardText("x")).resolves.toBe(false);
  });

  it("execCommand 抛异常（极端宿主）→ false", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    stubExecCommand(() => {
      throw new Error("no exec");
    });
    await expect(writeClipboardText("x")).resolves.toBe(false);
  });

  it("兜底路径不毁宿主选区：removeChild 后原 Range 恢复（审查 P3-1）", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    stubExecCommand(() => true);
    // 宿主预置文档选区（阅读态正文高亮 / 编辑态光标锚定同经文档 Selection）
    const host = document.createElement("div");
    host.textContent = "宿主选中文字";
    document.body.appendChild(host);
    const sel = window.getSelection();
    expect(sel).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(host);
    sel!.removeAllRanges();
    sel!.addRange(range);
    expect(sel!.toString()).toBe("宿主选中文字");
    await expect(writeClipboardText("片段")).resolves.toBe(true);
    // ta.select() 覆盖 + 兜底 textarea 移除后——原选区按快照恢复，无残留
    expect(sel!.rangeCount).toBe(1);
    expect(sel!.toString()).toBe("宿主选中文字");
    expect(sel!.anchorNode).toBe(host);
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    document.body.removeChild(host);
  });
});
