// @vitest-environment jsdom
/**
 * ProfileDetector.test.tsx — 检测卡 v2 三维交互契约测试（v0.13.6 REQ-219~222）。
 *
 * @ai-context: 覆盖——形态下拉 10 项（会议/直播/影视新增）、领域下拉 20 项
 *              （美食烹饪等新增）、细目多选 chips（list_domain_fine 源 + 检测
 *              预选 + 切换即 preheat/remember——修改即记忆契约）、平台分区
 *              映射形态优先（platform_form 覆盖记忆/候选）。
 * @ai-context: 批 7 T19 补三块（验收「档位选完真生效」的前端侧机器判据）：
 *              ① 改档 ⇒ **真写后端** `remember_video_profile_tier`（含载荷逐字）+ 上报父级
 *              （父级据此把 tier 带给 start_live_session 的第 5 参）；
 *              ② 读端接线：`video_profile_for_spec`（形态 × 档位）是模板/采样行**真源**；
 *              ③ 兜底必须留（AGENTS.md §3.4）：后端失败 ⇒ 回落本地 `video_profiles`。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DetectResult, VideoProfile } from "../types";

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

/** 后端读端桩（video_profile_for_spec 的返回值——形态 × 档位 → 采样/模板） */
const specStub: VideoProfile = {
  kind: "lecture",
  detect_signals: { title_keywords: [], url_keywords: [], frame_switch_range: null, prefers_subtitle: true, min_duration_min: null },
  sampling_budget: { subtitle_every: 5, full_every: 60, silent_subtitle_every: 30, silent_full_every: 300 },
  signal_weights: { subtitle_priority: true, ocr_weight: 0.7, asr_weight: 1 },
  postprocess_rules: { chapter_detect: true, step_cards: false, verbal_normalize: false, highlight: true, speaker_detect: false, glossary: true },
  artifact_template: "lecture-notes",
  storage_tier: "balanced",
  disable_ocr: false,
  disable_asr: false,
};

/** 本地兜底桩（video_profiles 的返回值——离线/后端失败时的那条路） */
const localStub: VideoProfile = { ...specStub, artifact_template: "summary" };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "video_profiles":
        return [localStub];
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
    // 审查 L4 修复：显式断言 10 项（不只抽查 3 项）+ 选项文本
    expect(formSelect.options.length).toBe(11); // 10 形态 + "识别中…" 占位
    expect(formSelect.textContent).toContain("会议");
    expect(formSelect.textContent).toContain("直播");
    expect(formSelect.textContent).toContain("影视");
    // 平台映射优先：正文候选 talking-head（解说）被 platform_form=讲授 覆盖
    await waitFor(() => expect(formSelect.value).toBe("lecture"));
  });

  it("领域下拉 20 项 + 细目 chips：检测预选、多选切换触发 preheat/remember", async () => {
    render(<ProfileDetector windowTitle="某视频_哔哩哔哩_bilibili" />);
    const combos = await screen.findAllByRole("combobox");
    const domainSelect = combos[2] as HTMLSelectElement;
    // 新增粗类出现在下拉 + 检测结果预选 economy（显式 waitFor——不依赖前序 await 冲刷）
    expect(domainSelect.options.length).toBe(21); // 20 粗类 + "未定" 占位
    expect(domainSelect.textContent).toContain("美食烹饪");
    await waitFor(() => expect(domainSelect.value).toBe("economy"));
    // 细目 chips：检测预选 invest；点 accounting → 多选并写记忆（修改即记忆契约）
    await waitFor(() => expect(screen.getByRole("button", { name: "投资理财" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "会计财务" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("preheat_domain_hotwords", {
        kind: "economy",
        fine: ["invest", "accounting"],
        title: "某视频_哔哩哔哩_bilibili",
      }),
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("remember_video_profile_domain", {
        title: "某视频_哔哩哔哩_bilibili",
        coarse: "economy",
        fine: ["invest", "accounting"],
      }),
    );
  });

  it("批 7 T19 ①：改档 ⇒ 真写后端记忆（载荷逐字）+ 上报父级（start 第 5 参的来源）", async () => {
    const onTierChange = vi.fn();
    render(<ProfileDetector windowTitle="某视频_哔哩哔哩_bilibili" onTierChange={onTierChange} />);
    const combos = await screen.findAllByRole("combobox");
    const tierSelect = combos[1] as HTMLSelectElement; // 形态/画面/领域
    await waitFor(() => expect(tierSelect.value).toBe("low")); // 候选 talking-head 的默认档
    // Act：用户显式改档（高）
    fireEvent.change(tierSelect, { target: { value: "rich" } });
    // Assert：① 真写后端记忆（跨会话通道）；② 上报父级（父级带进 start_live_session）
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("remember_video_profile_tier", {
        title: "某视频_哔哩哔哩_bilibili",
        tier: "rich",
      }),
    );
    expect(onTierChange).toHaveBeenCalledWith("rich");
    // 文案不再说谎（旧「仅本次会话生效」已随真写后端更正）
    expect(await screen.findByText("画面档已记住（同标题/同系列下次生效）")).toBeTruthy();
  });

  it("批 7 T19 ②：模板/采样行以后端 video_profile_for_spec 为真源（形态 × 档位）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "video_profiles") return [localStub];
      if (cmd === "detect_video_profile") return detectResult;
      if (cmd === "video_profile_for_spec") return specStub;
      return null;
    });
    render(<ProfileDetector windowTitle="某视频_哔哩哔哩_bilibili" />);
    // Assert：生产调用点（形态 × 档位）+ **用其返回值**（lecture-notes / 5s / 60s
    // 来自后端；本地兜底桩是 summary ⇒ 两者可区分，防"只调不用"的假接线）
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("video_profile_for_spec", { form: "lecture", tier: "low" }),
    );
    expect(await screen.findByText(/lecture-notes 模板 · 5s\/字幕 · 60s\/全帧/)).toBeTruthy();
  });

  it("批 7 T19 ③：读端失败 ⇒ 回落本地映射（兜底必须留——AGENTS.md §3.4）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "video_profiles") return [localStub];
      if (cmd === "detect_video_profile") return detectResult;
      if (cmd === "video_profile_for_spec") throw new Error("offline");
      return null;
    });
    render(<ProfileDetector windowTitle="某视频_哔哩哔哩_bilibili" />);
    expect(await screen.findByText(/summary 模板/)).toBeTruthy();
  });

  it("批 7 T19 V6′/V7：前端映射仍在（角色=离线兜底）+ 文案注释不再说谎", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "ProfileDetector.tsx"), "utf8");
    // V6′①：KIND_TO_FORM/KIND_TO_TIER **不得删除**（§C11.4：并行真源 → 离线降级路径）
    expect(src, "KIND_TO_FORM 被删（兜底路径没了）").toContain("export const KIND_TO_FORM");
    expect(src, "KIND_TO_TIER 被删（兜底路径没了）").toContain("const KIND_TO_TIER");
    // V7：旧注释/旧文案已更正（拼接写法：避免本文件自身被后续全仓字面量扫描误伤）
    expect(src.includes("TODO(" + "后端)"), "TODO(后端) 未删（它说的命令已存在）").toBe(false);
    expect(src.includes("仅本次" + "会话生效"), "旧文案仍在（写后端之后它是谎话）").toBe(false);
  });

  it("批 7 T19 U2：档位下拉初值取后端记忆——「生效档 ≠ 本地映射档」时显示真值", async () => {
    // Arrange：候选 talking-head ⇒ 本地 KIND_TO_TIER 会是 "low"（该值由紧随其后的负控用例
    //   用**同一份检测结果**（仅去掉 memory_tier）独立钉住）；后端记忆 = "rich"（用户上次选的）
    //   ⇒ 「生效档(记忆 rich) ≠ 本地映射档(low)」，两者可区分。
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "video_profiles") return [localStub];
      if (cmd === "detect_video_profile") return { ...detectResult, memory_tier: "rich" };
      if (cmd === "video_profile_for_spec") return specStub;
      return null;
    });
    render(<ProfileDetector windowTitle="某视频_哔哩哔哩_bilibili" />);
    const combos = await screen.findAllByRole("combobox");
    const tierSelect = combos[1] as HTMLSelectElement;
    // Assert：显示档 == 后端记忆档（§C11.4 后端为真源；新会话实际生效档同源：显式 > 记忆）
    await waitFor(() => expect(tierSelect.value).toBe("rich"));
    expect(tierSelect.value, "不得显示本地映射档（= 显示/生效不一致，U2 要修的正是这个）").not.toBe("low");
  });

  it("批 7 T19 U2 负控：无记忆档 ⇒ 回落本地映射（兜底必须留）", async () => {
    // Arrange：detect 响应无 memory_tier（旧后端/无记忆）⇒ 走本地映射
    render(<ProfileDetector windowTitle="某视频_哔哩哔哩_bilibili" />);
    const combos = await screen.findAllByRole("combobox");
    const tierSelect = combos[1] as HTMLSelectElement;
    await waitFor(() => expect(tierSelect.value).toBe("low"));
    expect(tierSelect.value).not.toBe("rich");
  });
});
