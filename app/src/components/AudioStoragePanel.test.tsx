// @vitest-environment jsdom
/**
 * AudioStoragePanel.test.tsx — 批 8 T27 的**过桥判据面**：落盘开关真的读写后端配置。
 *
 * @ai-context 被测对象 = 面板的开关桥：`invoke(session_audio_config_set, { enabled })` →
 *   **用后端回读的状态**刷 UI。jsdom 里没有真 Tauri ⇒ 只 mock 模块边界（同
 *   `session-detail/useSessionAudio.test.tsx` 先例），**不连真 IPC、不写盘、不连库**。
 * @ai-context 断言走 DOM（`data-testid` / 文案）而不是组件内部 state ⇒ 判据落在真实渲染路径上
 *   （含「失败不假装成功」）。**无 jest-dom / 无 user-event** ⇒ 原生 DOM API + `act` + `waitFor`。
 * @ai-context ⚠️ 诚实边界（真机不可达，用户裁决 U5 跳过）：① 本件**不声称**「跨重启保持」——
 *   持久化判据在 Rust 侧（`audio_store_config::tests::user_toggle_persists_disabled`，
 *   机器代替品 = 重新 `load` 同一文件）；② 「死分支复活」（`enabled === false` 的提示条）
 *   **只在 jsdom 层可证**；③ 真机 WebView2 的按钮交互与 env 覆盖显示未验证。
 * @ai-context 结构判据：开关必须是 `Button` 原语（类 `ed-btn`），且面板内 `<button>` 总数
 *   **恰 2**（= 原语开关 + 既有的原生「立即清理」）——多一个原生按钮会让
 *   `nativeButtonBaseline` 的逐文件键 1 → 2（棘轮红）。
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import AudioStoragePanel, { SET_ENABLED_COMMAND } from "./AudioStoragePanel";

/** 后端状态载荷（线格式 camelCase；字段与 `commands_audio::SessionAudioStatus` 同集） */
function statusOf(enabled: boolean, effective = enabled, over: Record<string, number> = {}) {
  return {
    fileCount: 3,
    totalBytes: 2048,
    retentionDays: 30,
    diskBudgetBytes: 4_294_967_296,
    enabled,
    effective,
    ...over,
  };
}

/** 「未启用」提示条的可判文本（前端 `enabled === false` 分支） */
const HINT_OFF = "音频落盘未启用——会话原始音频不会保存";
/** 开关文案（`enabled === false` ⇒ 「落盘：关」） */
const LABEL_ON = "落盘：开";
const LABEL_OFF = "落盘：关";

const toggle = (): HTMLElement => screen.getByTestId("audio-store-toggle");
const hasText = (needle: string): boolean => (document.body.textContent ?? "").includes(needle);
const bodyText = (): string => document.body.textContent ?? "";

beforeEach(() => {
  invokeMock.mockReset();
});
afterEach(() => cleanup());

describe("T27 · 音频落盘开关（读写真实配置通道）", () => {
  it("S1 状态来自 `session_audio_status`：`enabled=false` 时「未启用」提示条**真的出现**（死分支复活）", async () => {
    invokeMock.mockResolvedValue(statusOf(false));
    render(<AudioStoragePanel />);
    // Act：等首帧取数落地（提示条由 `!status.enabled` 渲染）
    await waitFor(() => expect(hasText(LABEL_OFF)).toBe(true));
    // Assert：提示条在 → 这条分支今天可达（T27 前 `enabled` 恒 true ⇒ 永不渲染）
    expect(hasText(HINT_OFF), "enabled=false 时未启用提示条必须出现").toBe(true);
    expect(bodyText()).toContain("3 个文件");
    expect(invokeMock).toHaveBeenCalledWith("session_audio_status");
  });

  it("S2 提示条是**条件**渲染：`enabled=true` 时不得出现（反例守卫）", async () => {
    invokeMock.mockResolvedValue(statusOf(true));
    render(<AudioStoragePanel />);
    await waitFor(() => expect(hasText(LABEL_ON)).toBe(true));
    expect(hasText(HINT_OFF), "enabled=true 却显示了未启用提示").toBe(false);
  });

  it("S3 点击开关 ⇒ `session_audio_config_set` 恰一次且入参为 `{ enabled }`；UI 用**后端回读值**更新", async () => {
    invokeMock.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === SET_ENABLED_COMMAND ? statusOf(false) : statusOf(true),
      ),
    );
    render(<AudioStoragePanel />);
    await waitFor(() => expect(hasText(LABEL_ON)).toBe(true));
    // Act
    await act(async () => {
      toggle().click();
    });
    // Assert：命令名 + 入参逐字；UI 已按**返回值**（enabled=false）翻转
    expect(invokeMock).toHaveBeenCalledWith(SET_ENABLED_COMMAND, { enabled: false });
    expect(invokeMock.mock.calls.filter(([c]) => c === SET_ENABLED_COMMAND)).toHaveLength(1);
    expect(hasText(LABEL_OFF), "开关文案未按后端返回值更新").toBe(true);
    expect(hasText(HINT_OFF), "后端回报关闭后，提示条必须出现").toBe(true);
  });

  it("S4 入参 = **当前值的反**（连点两次 ⇒ false 再 true），不做本地乐观翻转", async () => {
    invokeMock.mockImplementation((cmd: string, args: { enabled: boolean }) =>
      Promise.resolve(cmd === SET_ENABLED_COMMAND ? statusOf(args.enabled) : statusOf(true)),
    );
    render(<AudioStoragePanel />);
    await waitFor(() => expect(hasText(LABEL_ON)).toBe(true));
    await act(async () => {
      toggle().click();
    });
    await act(async () => {
      toggle().click();
    });
    const sent = invokeMock.mock.calls.filter(([c]) => c === SET_ENABLED_COMMAND).map(([, a]) => a);
    expect(sent).toEqual([{ enabled: false }, { enabled: true }]);
  });

  it("S5 写盘失败 ⇒ 走既有错误行体例，且**不假装成功**（文案与提示条保持原状）", async () => {
    invokeMock.mockImplementation((cmd: string) =>
      cmd === SET_ENABLED_COMMAND
        ? Promise.reject(new Error("磁盘只读"))
        : Promise.resolve(statusOf(true)),
    );
    render(<AudioStoragePanel />);
    await waitFor(() => expect(hasText(LABEL_ON)).toBe(true));
    // Act
    await act(async () => {
      toggle().click();
    });
    // Assert：入口错误行 + 未启用提示条都**不得**出现（成功态未被伪造）
    expect(hasText("音频落盘开关保存失败")).toBe(true);
    expect(bodyText()).toContain("磁盘只读");
    expect(hasText(LABEL_OFF), "失败却把开关翻成了关（本地乐观值）").toBe(false);
    expect(hasText(HINT_OFF), "失败却显示了未启用提示条").toBe(false);
  });

  it("S6 结构判据：开关是 `Button` 原语（类 `ed-btn`），面板内 `<button>` 恰 2 个", async () => {
    invokeMock.mockResolvedValue(statusOf(true));
    const { container } = render(<AudioStoragePanel />);
    await waitFor(() => expect(hasText(LABEL_ON)).toBe(true));
    expect(toggle().tagName).toBe("BUTTON");
    expect(toggle().className, "开关不是 L1 `Button` 原语（缺 ed-btn 类）").toContain("ed-btn");
    // 2 = 原语开关 + 既有的原生「立即清理」；多一个原生按钮 ⇒ nativeButton 棘轮逐文件键 1 → 2
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(container.querySelectorAll("button.ed-btn")).toHaveLength(1);
  });
});
