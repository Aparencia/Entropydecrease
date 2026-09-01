// @vitest-environment jsdom
/**
 * RefineLaunchDialog.test.tsx — 精修发起对话框（v0.17.0 REQ-245）关键契约。
 *
 * @ai-context: ① 目标 chips 落位 → 确认时策略随 ai_refine_start 透传（所见
 *              即所发——参数契约）；② 未授权 → 同意卡（红线前置）。
 *              invode/event 全 mock（AAA；纯交互不触真实后端）。
 */
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RefineLaunchDialog from "./RefineLaunchDialog";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const meta = {
  strategyDims: [
    { key: "examples", label: "例子密度", default: "standard",
      options: [
        { value: "keep_all", label: "全保留", instruction: "" },
        { value: "standard", label: "标准", instruction: "" },
        { value: "condensed", label: "浓缩", instruction: "" },
      ] },
  ],
  ladderPresets: [
    { id: "standard", name: "标准精修", desc: "", instruction: "", dimValues: {} },
    { id: "minimal", name: "极简提取", desc: "", instruction: "", dimValues: { examples: "condensed" } },
  ],
  intents: [
    { id: "exam", label: "考点浓缩", keywords: ["背", "考点", "复习"], instruction: "", dimValues: { examples: "condensed" } },
  ],
};

const okSettings = {
  enabled: true, authorized: true, baseUrl: "https://x", model: "m", lowBalanceThreshold: 1,
  rememberCostChoice: false, visionRefineEnabled: false,
  refineStrategy: { defaultLadder: "", dimOverrides: {} }, hasKey: true, keySource: "credential",
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "ai_get_settings": return Promise.resolve(okSettings);
      case "ai_refine_strategy_meta": return Promise.resolve(meta);
      case "ai_refine_estimate": return Promise.resolve({ estimate: { estTokens: 100, estCostYuan: 0, pricePer1m: 0, priceKnown: true }, rememberCostChoice: false });
      case "ai_get_balance": return Promise.resolve({ balance: { totalBalance: 10, grantsBalance: 10, toppedUpBalance: 0, currency: "CNY" }, lowBalanceWarning: null });
      case "ai_refine_prompt_preview": return Promise.resolve("system prompt…");
      case "ai_refine_start": return Promise.resolve({ taskId: 9, state: "Pending" });
      default: return Promise.resolve(null);
    }
  });
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

function renderDialog() {
  return render(
    <RefineLaunchDialog sessionId={5} onClose={vi.fn()} onStarted={vi.fn()} />,
  );
}

describe("RefineLaunchDialog 策略透传契约", () => {
  it("点目标 chips（考点浓缩）→ 确认时 ai_refine_start 携带该策略（presetId=null + dims 覆盖）", async () => {
    renderDialog();
    // 等 chips 渲染（meta 异步装载——waitFor 目标按钮出现）
    const chip = await screen.findByText("考点浓缩");
    fireEvent.click(chip);
    const confirm = screen.getByText("确认并精修 →");
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("ai_refine_start", expect.objectContaining({
        sessionId: 5,
        authorized: true,
        strategy: expect.objectContaining({ presetId: null, dims: expect.objectContaining({ examples: "condensed" }) }),
      }));
    });
  });

  it("未授权 → 同意卡可见，同意后继续（ai_set_authorized 落库）", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "ai_get_settings") {
        return Promise.resolve({ ...okSettings, authorized: false });
      }
      return Promise.resolve(null);
    });
    renderDialog();
    const consent = await screen.findByText("首次使用需授权");
    expect(consent).toBeTruthy();
    fireEvent.click(screen.getByText("同意并继续"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("ai_set_authorized", { authorized: true });
    });
  });
});
