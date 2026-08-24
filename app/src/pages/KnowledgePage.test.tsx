// @vitest-environment jsdom
/**
 * KnowledgePage.test.tsx — 体系页空态示例入口 + 全局向导联动（v0.13.7 具象化）。
 *
 * @ai-context: 空态（systems.length === 0）渲染 KnowledgeSampleView——示例≠预填
 *              （纪律裁决 2026-08-24）：浏览是被动参照；复制需先有全局体系，
 *              无全局时 onNeedGlobal 打开全局创建向导（既有 handleCreated 流）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn().mockResolvedValue(true) }));

import KnowledgePage from "./KnowledgePage";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_knowledge_systems": return [];
      case "list_knowledge_nodes": return [];
      case "list_knowledge_concepts": return [];
      case "list_knowledge_models": return [];
      case "list_knowledge_links": return [];
      default: throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

describe("KnowledgePage 空态", () => {
  it("空态显示示例体系入口", async () => {
    render(<KnowledgePage />);
    const sample = await screen.findByTestId("sample-view");
    expect(sample.textContent).toContain("摄影");
    expect(screen.getByTestId("sample-copy")).toBeTruthy();
  });

  it("空态点示例复制（无全局）→ 打开全局创建向导", async () => {
    render(<KnowledgePage />);
    fireEvent.click(await screen.findByTestId("sample-copy"));
    await waitFor(() => expect(screen.getByTestId("knowledge-wizard")).toBeTruthy());
  });
});
