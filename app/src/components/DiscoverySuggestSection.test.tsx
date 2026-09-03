// @vitest-environment jsdom
/**
 * DiscoverySuggestSection.test.tsx — 相关素材建议区（v0.19.3 REQ-261）。AAA。
 *
 * @ai-context: 锁契约——① 开关关 → 不渲染（默认关零噪音）；② 开启 → 候选
 *              逐条勾选 → 确认仅经 link_knowledge_target 落库（conceptId +
 *              note/fragment target）→ onChanged + 刷新；③ 无候选空态文案。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import DiscoverySuggestSection from "./DiscoverySuggestSection";
import type { KbDiscoveryResult, KbHit } from "../types";

const hit: KbHit = {
  chunkId: 11,
  sourceKind: "note",
  noteId: 7,
  fragmentId: null,
  noteTitle: "眼影入门",
  groupName: null,
  heading: "晕染手法",
  snippet: "…==眼影晕染手法==要点…",
  scoreKind: "fts",
};

const fragHit: KbHit = { ...hit, chunkId: 12, sourceKind: "fragment", fragmentId: 9, noteId: null, noteTitle: null, heading: null, snippet: "碎片==眼影晕染手法==内容" };

const result: KbDiscoveryResult = { evidence: [hit, fragHit], similar: [] };

function setup(flags = { feedCapture: true, kbDiscovery: true }) {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "get_feature_flags") return Promise.resolve(flags);
    if (cmd === "kb_discovery_suggest") return Promise.resolve(result);
    if (cmd === "link_knowledge_target") return Promise.resolve({ id: 1 });
    return Promise.reject(new Error(`unexpected cmd ${cmd}`));
  });
}

afterEach(cleanup);

describe("DiscoverySuggestSection", () => {
  it("开关关 → 不渲染（默认关零噪音）", async () => {
    // Arrange
    setup({ feedCapture: true, kbDiscovery: false });
    const onChanged = vi.fn();
    // Act
    const { container } = render(<DiscoverySuggestSection systemId={1} conceptId={2} onChanged={onChanged} />);
    // Assert
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_feature_flags"));
    expect(container.querySelector('[data-testid="discovery-suggest"]')).toBeNull();
    expect(invokeMock).not.toHaveBeenCalledWith("kb_discovery_suggest", expect.anything());
  });

  it("开启后渲染候选；确认仅经 link_knowledge_target 落库并回调", async () => {
    // Arrange
    setup();
    const onChanged = vi.fn();
    // Act
    render(<DiscoverySuggestSection systemId={1} conceptId={2} onChanged={onChanged} />);
    // Assert：候选渲染 + 逐条勾选
    await screen.findByTestId("discovery-confirm");
    expect(screen.getByText(/眼影入门 · 晕染手法/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /眼影入门/ }) as HTMLInputElement);
    fireEvent.click(screen.getByRole("checkbox", { name: /碎片/ }) as HTMLInputElement);
    fireEvent.click(screen.getByTestId("discovery-confirm"));
    // 确认 → 两条 link（concept 指向 note/fragment 白名单）+ onChanged + 重拉建议
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 1,
        conceptId: 2,
        targetType: "note",
        targetId: 7,
      });
      expect(invokeMock).toHaveBeenCalledWith("link_knowledge_target", {
        systemId: 1,
        conceptId: 2,
        targetType: "fragment",
        targetId: 9,
      });
    });
    expect(onChanged).toHaveBeenCalled();
    expect(invokeMock.mock.calls.filter((c) => c[0] === "kb_discovery_suggest").length).toBeGreaterThanOrEqual(2);
  });

  it("无候选空态诚实文案", async () => {
    // Arrange
    setup();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_feature_flags") return Promise.resolve({ feedCapture: true, kbDiscovery: true });
      if (cmd === "kb_discovery_suggest") return Promise.resolve({ evidence: [], similar: [] });
      return Promise.reject(new Error(`unexpected cmd ${cmd}`));
    });
    // Act
    render(<DiscoverySuggestSection systemId={1} conceptId={2} onChanged={vi.fn()} />);
    // Assert
    await waitFor(() => expect(screen.getByText(/暂无未挂接的候选素材/)).toBeTruthy());
  });
});
