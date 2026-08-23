// @vitest-environment jsdom
/**
 * ProfileDetector.test.tsx — 检测卡 v2 三维交互契约测试（v0.13.6 REQ-219~222）。
 *
 * @ai-context: 覆盖——形态下拉 10 项（会议/直播/影视新增）、领域下拉 20 项
 *              （美食烹饪等新增）、细目多选 chips（list_domain_fine 源 + 检测
 *              预选 + 切换即 preheat/remember——修改即记忆契约）、平台分区
 *              映射形态优先（platform_form 覆盖记忆/候选）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DetectResult } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import ProfileDetector from "./ProfileDetector";

/** 检测结果桩（映射命中——经济管理 + invest 预选 + 映射形态讲授） */
const detectResult: DetectResult = {
  candidates: [{ kind: "talking-head", score: 1.0 }],
  needs_confirmation: false,
  memory_hit: null,
  memory_form: null,
  memory_conflict: null,
  platform_form: "lecture",
  domain: { kind: "economy", fine_tags: [], fine_ids: ["invest"], source: "platform-map", confidence: 1.0 },
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "video_profiles":
        return [];
      case "list_domain_fine":
        return [["economy", [{ id: "invest", label: "投资理财" }, { id: "accounting", label: "会计财务" }]]];
      case "detect_video_profile":
        return detectResult;
      case "preheat_domain_hotwords":
        return 0;
      case "remember_video_profile_domain":
        return null;
      default:
        return null;
    }
  });
});

afterEach(() => cleanup());

describe("ProfileDetector v0.13.6 三维交互", () => {
  it("形态下拉含 10 项（会议/直播/影视）；平台映射形态优先于候选", async () => {
    render(<ProfileDetector windowTitle="某视频_哔哩哔哩_bilibili" />);
    // 三个下拉按 DOM 顺序：形态/画面/领域
    const combos = await screen.findAllByRole("combobox");
    const formSelect = combos[0] as HTMLSelectElement;
    await waitFor(() => expect(formSelect.textContent).toContain("会议"));
    expect(formSelect.textContent).toContain("直播");
    expect(formSelect.textContent).toContain("影视");
    // 平台映射优先：正文候选 talking-head（解说）被 platform_form=讲授 覆盖
    await waitFor(() => expect(formSelect.value).toBe("lecture"));
  });

  it("领域下拉 20 项 + 细目 chips：检测预选、多选切换触发 preheat/remember", async () => {
    render(<ProfileDetector windowTitle="某视频_哔哩哔哩_bilibili" />);
    const combos = await screen.findAllByRole("combobox");
    const domainSelect = combos[2] as HTMLSelectElement;
    // 新增粗类出现在下拉 + 检测结果预选 economy
    await waitFor(() => expect(domainSelect.textContent).toContain("美食烹饪"));
    await waitFor(() => expect(domainSelect.value).toBe("economy"));
    // 细目 chips：检测预选 invest；点 accounting → 多选并写记忆（修改即记忆契约）
    await waitFor(() => expect(screen.getByRole("button", { name: "投资理财" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "会计财务" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("preheat_domain_hotwords", { kind: "economy", fine: ["invest", "accounting"] }),
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("remember_video_profile_domain", {
        title: "某视频_哔哩哔哩_bilibili",
        coarse: "economy",
        fine: ["invest", "accounting"],
      }),
    );
  });
});
