// @vitest-environment jsdom
/**
 * RefineLaunchDialog.vision.test.tsx — 画面理解开关入精修弹层（REQ-284，v0.19.7）。
 *
 * @ai-context: 契约——会话级模式显示开关且初值=全局默认；勾选变化=本次覆写
 *              （confirm 携带 visionRefine）；「设为默认」显式写回全局（单向）；
 *              未覆写时 payload 不带 visionRefine（null=后端跟随全局）；笔记级
 *              模式（纯文本语境）整行隐藏。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RefineLaunchDialog from "./RefineLaunchDialog";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const meta = {
  strategyDims: [],
  ladderPresets: [
    { id: "standard", name: "标准精修", desc: "", instruction: "", dimValues: {} },
  ],
  intents: [],
};

function settingsOf(visionRefineEnabled: boolean) {
  return {
    enabled: true, authorized: true, baseUrl: "https://x", model: "m", lowBalanceThreshold: 1,
    rememberCostChoice: false, visionRefineEnabled,
    refineStrategy: { defaultLadder: "", dimOverrides: {} }, hasKey: true, keySource: "credential",
  };
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "ai_get_settings": return Promise.resolve(settingsOf(false));
      case "ai_refine_strategy_meta": return Promise.resolve(meta);
      case "ai_refine_estimate": return Promise.resolve({ estimate: { estTokens: 100, estCostYuan: 0, pricePer1m: 0, priceKnown: true }, rememberCostChoice: false });
      case "ai_get_balance": return Promise.resolve({ balance: { totalBalance: 10, grantsBalance: 10, toppedUpBalance: 0, currency: "CNY" }, lowBalanceWarning: null });
      case "ai_refine_prompt_preview": return Promise.resolve("preview");
      case "ai_refine_start": return Promise.resolve({ taskId: 9, state: "Pending" });
      case "ai_set_vision_refine": return Promise.resolve(null);
      default: return Promise.resolve(null);
    }
  });
});

afterEach(cleanup);

async function findStartCall(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const call = invokeMock.mock.calls.find((c) => c[0] === "ai_refine_start");
      if (call) { resolve(call[1] as Record<string, unknown>); return; }
      if (Date.now() - started > 2000) { reject(new Error("未捕获 ai_refine_start 调用")); return; }
      setTimeout(poll, 20);
    };
    poll();
  });
}

describe("画面理解开关（REQ-284）", () => {
  it("会话级：初值=全局关；勾选=本次覆写，confirm 携带 visionRefine=true", async () => {
    render(<RefineLaunchDialog sessionId={5} onClose={vi.fn()} onStarted={vi.fn()} />);
    const toggle = (await screen.findByTestId("vision-refine-toggle")) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.getByText(/跟随全局默认（关）——勾选即本次覆写/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByText(/本次：开（全局默认：关）/)?.textContent).toBeTruthy();
    // 开启时的耗时提示与「设为默认」写回全局
    expect(screen.getByText(/⚠ 开启会显著增加耗时与费用/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("vision-set-default"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("ai_set_vision_refine", { refineEnabled: true });
    });
    // 确认启动 → 任务级覆写随请求下发
    fireEvent.click(screen.getByText("确认并精修 →"));
    const args = await findStartCall();
    expect(args).toMatchObject({ sessionId: 5, visionRefine: true });
  });

  it("会话级：未覆写（跟随全局）时 payload 不带 visionRefine 键", async () => {
    render(<RefineLaunchDialog sessionId={5} onClose={vi.fn()} onStarted={vi.fn()} />);
    await screen.findByTestId("vision-refine-toggle");
    fireEvent.click(screen.getByText("确认并精修 →"));
    const args = await findStartCall();
    expect((args as { visionRefine?: unknown }).visionRefine).toBeUndefined();
  });

  it("笔记级（纯文本语境）：开关整行不显示", async () => {
    render(
      <RefineLaunchDialog
        noteId={6}
        noteContent="手写笔记内容"
        onClose={vi.fn()}
        onStarted={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("vision-refine-toggle")).toBeNull();
    });
  });
});
