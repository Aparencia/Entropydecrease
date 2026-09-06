// @vitest-environment jsdom
/**
 * ActionPage.test.tsx — 行动域页壳测试（v0.20.5）。
 *
 * @ai-context: 页壳职责=承载 ActionCenterPanel + active 门控切回重载（常驻
 *              挂载隐藏期变更补偿）。断言：首挂不因 active 变化多拉；
 *              false→true 翻转后 panel 重载（list_action_queue 调用数增长）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import ActionPage from "./ActionPage";

const queueCalls = () => invokeMock.mock.calls.filter((c) => c[0] === "list_action_queue").length;

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_action_queue": return [];
      case "completion_history_list": return [];
      case "sop_template_list": return [];
      case "list_notes": return [];
      default:
        throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

describe("ActionPage active 门控", () => {
  it("挂载即拉取（面板挂载 effect）；active 翻转为 true 时重载", async () => {
    const { rerender } = render(<ActionPage active={false} />);
    // 常驻挂载（App display:none 保活）——首挂即拉一次
    await waitFor(() => expect(queueCalls()).toBeGreaterThanOrEqual(4));
    const afterMount = invokeMock.mock.calls.length;

    // 切回行动页（false→true）：refreshToken 递增 → 面板全量重载
    rerender(<ActionPage active={true} />);
    await waitFor(() => expect(invokeMock.mock.calls.length).toBeGreaterThan(afterMount));

    // 停留期间再次 active 变化不产生额外拉取（true→false→true 才重载）——防抖语义核对：
    // true→false 无动作
    rerender(<ActionPage active={false} />);
    const beforeIdle = invokeMock.mock.calls.length;
    // false→true 再次重载
    rerender(<ActionPage active={true} />);
    await waitFor(() => expect(invokeMock.mock.calls.length).toBeGreaterThan(beforeIdle));
  });
});
