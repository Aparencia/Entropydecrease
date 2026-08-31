// @vitest-environment jsdom
/**
 * BrowserChrome.test.tsx — 浏览器痕迹去除前端层（v0.16.1）。AAA 模式。
 *
 * @ai-context: 覆盖三契约——① 任意位置右键都 preventDefault（原生菜单不出现在
 *              应用内）；② 文本控件右键弹应用内小菜单（剪切/复制/粘贴/全选）；
 *              ③ 粘贴 = 剪贴板文本插入光标处（异步 readText）。原生事件监听器
 *              触发的 setState 需 act 包裹（非 React 事件路径）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import BrowserChrome from "./BrowserChrome";

const readTextMock = vi.fn();

/** 追加到 body 的原生元素（脱离 React 树——单独清理避免跨测试残留） */
function append<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  readTextMock.mockReset();
  readTextMock.mockResolvedValue("剪贴板文本");
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { readText: readTextMock },
    configurable: true,
  });
  // jsdom 无 execCommand——模拟浏览器环境提供（复制/剪切走它）
  document.execCommand = vi.fn(() => true) as unknown as typeof document.execCommand;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("BrowserChrome 浏览器痕迹去除", () => {
  it("非文本区域右键：不弹菜单（原生菜单已被 preventDefault 抑制）", () => {
    render(<BrowserChrome />);
    const box = append(document.createElement("div"));
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    box.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(screen.queryByTestId("browser-chrome-menu")).toBeNull();
  });

  it("textarea 右键：弹出应用内菜单（剪切/复制/粘贴/全选）", () => {
    render(<BrowserChrome />);
    const ta = append(document.createElement("textarea"));
    act(() => {
      ta.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    });
    expect(screen.getByTestId("browser-chrome-menu")).toBeTruthy();
    for (const label of ["剪切", "复制", "粘贴", "全选"]) {
      expect(screen.getByTestId(`browser-chrome-${label}`)).toBeTruthy();
    }
  });

  it("粘贴：读取剪贴板并插入光标处（setRangeText + input 事件）", async () => {
    render(<BrowserChrome />);
    const ta = append(document.createElement("textarea"));
    ta.value = "ab";
    ta.setSelectionRange(1, 1); // 光标在 a|b
    act(() => {
      ta.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    });
    fireEvent.click(screen.getByTestId("browser-chrome-粘贴"));
    await vi.waitFor(() => {
      expect(ta.value).toBe("a剪贴板文本b");
    });
    expect(readTextMock).toHaveBeenCalled();
    // 菜单已收起
    expect(screen.queryByTestId("browser-chrome-menu")).toBeNull();
  });

  it("无选区：剪切/复制禁用；全选可点", () => {
    render(<BrowserChrome />);
    const inp = append(document.createElement("input"));
    inp.value = "hello";
    inp.setSelectionRange(0, 0);
    act(() => {
      inp.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    });
    expect((screen.getByTestId("browser-chrome-剪切") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("browser-chrome-复制") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("browser-chrome-全选"));
    expect(inp.selectionStart).toBe(0);
    expect(inp.selectionEnd).toBe(5);
  });

  it("ESC 关闭菜单", () => {
    render(<BrowserChrome />);
    const inp = append(document.createElement("input"));
    act(() => {
      inp.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    });
    expect(screen.getByTestId("browser-chrome-menu")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("browser-chrome-menu")).toBeNull();
  });
});
