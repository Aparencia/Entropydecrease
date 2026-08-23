// @vitest-environment jsdom
/**
 * FeedFragmentList.test.tsx — 收件箱状态机组件测试（v0.12.2 验收标准 2）。
 *
 * @ai-context: 状态机覆盖 捕获→升笔记→移除（升卡幂等语义 + 删除二次确认 +
 *               空态引导）——invoke 全 mock（不触碰真实后端），断言命令参数
 *               契约（fragmentId/title/groupId）与回调时序。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Fragment, Note, NoteGroup } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (p: string) => `asset://${p}`,
}));

import FeedFragmentList from "./FeedFragmentList";

/** 最小 Fragment 桩 */
function frag(id: number, text: string, groupId: number | null = null): Fragment {
  return {
    id, text, imagePath: null, domainTag: null, groupId,
    source: "manual", status: "active", createdAt: 1000,
  };
}

const containerGroup: NoteGroup = {
  id: 9, name: "化妆美妆", terrain: "container", kind: "topic", domainTag: "beauty",
  source: "route", seriesKey: null, routeReason: null, routeOverridden: 0,
  noteCount: 0, createdAt: 0, updatedAt: 0,
};

const noteStub: Note = {
  id: 42, title: "晕染笔记", content: "眼影要晕染。第二步定妆。", source: "manual",
  tags: "[]", pin: 0, group_id: 9, created_at: 2000, updated_at: 2000,
};

let dbFragments: Fragment[];

beforeEach(() => {
  dbFragments = [frag(1, "眼影要晕染。第二步定妆。", 9), frag(2, "单句灵感", null)];
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) => {
    switch (cmd) {
      case "list_fragments":
        return dbFragments;
      case "list_note_groups":
        return [containerGroup];
      case "promote_fragment_to_note":
        dbFragments = dbFragments.filter((f) => f.id !== args.fragmentId);
        return noteStub;
      case "promote_fragment_to_card":
        return 1;
      case "delete_fragment":
        dbFragments = dbFragments.filter((f) => f.id !== args.fragmentId);
        return true;
      case "resolve_fragment_image":
        return null;
      default:
        throw new Error(`unexpected command: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

describe("FeedFragmentList 收件箱状态机", () => {
  it("捕获展示：碎片卡渲染 + 空态引导三种归宿", async () => {
    const { unmount } = render(<FeedFragmentList onChanged={vi.fn()} onPromoted={vi.fn()} />);
    // Arrange/Act：两条 fragments
    expect(await screen.findByTestId("fragment-card-1")).toBeTruthy();
    expect(screen.getByTestId("fragment-card-2")).toBeTruthy();
    unmount();
    // Arrange：空收件箱
    dbFragments = [];
    render(<FeedFragmentList onChanged={vi.fn()} onPromoted={vi.fn()} />);
    // Assert：空态文案（三种归宿引导）
    expect((await screen.findByTestId("inbox-empty")).textContent).toContain("升为笔记沉淀它");
  });

  it("升笔记：表单预填首句 → 确认 → 碎片移除 + 父层打开新笔记", async () => {
    const onPromoted = vi.fn();
    const onChanged = vi.fn();
    render(<FeedFragmentList onChanged={onChanged} onPromoted={onPromoted} />);
    await screen.findByTestId("fragment-card-1");

    // 打开轻确认表单：标题预填首句（可改），归组默认未归组
    fireEvent.click(screen.getByTestId("promote-note-1"));
    const titleInput = (await screen.findByTestId("promote-title")) as HTMLInputElement;
    expect(titleInput.value).toBe("眼影要晕染");
    const groupSelect = screen.getByTestId("promote-group") as HTMLSelectElement;
    expect(groupSelect.value).toBe("");

    // 改标题 + 选组 → 确认
    fireEvent.change(titleInput, { target: { value: "晕染笔记" } });
    fireEvent.change(groupSelect, { target: { value: "9" } });
    fireEvent.click(screen.getByTestId("promote-confirm"));

    // 命令契约：事务建笔记+删碎片（fragmentId/title/groupId）
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("promote_fragment_to_note", {
        fragmentId: 1, title: "晕染笔记", groupId: 9,
      });
    });
    // 碎片从收件箱移除（列表已重载）
    await waitFor(() => {
      expect(screen.queryByTestId("fragment-card-1")).toBeNull();
    });
    // 回调：父层右侧自动打开新笔记 + 刷新侧栏计数
    expect(onPromoted).toHaveBeenCalledWith(noteStub);
    expect(onChanged).toHaveBeenCalled();
  });

  it("升闪卡：成功后刷新；已升级（返回 0）不打扰——幂等可重复触发", async () => {
    const onChanged = vi.fn();
    render(<FeedFragmentList onChanged={onChanged} onPromoted={vi.fn()} />);
    await screen.findByTestId("fragment-card-2");

    // 首次：升卡成功（新卡 1 张）→ 刷新
    fireEvent.click(screen.getByTestId("promote-card-2"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("promote_fragment_to_card", { fragmentId: 2 });
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());

    // 幂等：再触发（backend 返回 0——已升级过）→ 不报错不刷新
    onChanged.mockClear();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "promote_fragment_to_card") return 0;
      if (cmd === "list_fragments") return dbFragments;
      if (cmd === "list_note_groups") return [containerGroup];
      if (cmd === "resolve_fragment_image") return null;
      throw new Error(`unexpected: ${cmd}`);
    });
    fireEvent.click(screen.getByTestId("promote-card-2"));
    await new Promise((r) => setTimeout(r, 0));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("删除：二次确认后移除（取消则保留）", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<FeedFragmentList onChanged={vi.fn()} onPromoted={vi.fn()} />);
    await screen.findByTestId("fragment-card-2");

    const card2 = screen.getByTestId("fragment-card-2");
    fireEvent.click(within(card2).getByText("🗑 删除"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_fragment", { fragmentId: 2 });
    });
    await waitFor(() => expect(screen.queryByTestId("fragment-card-2")).toBeNull());

    // 取消：确认框拒绝 → 不触发删除
    confirmSpy.mockReturnValue(false);
    invokeMock.mockClear();
    const card1 = screen.getByTestId("fragment-card-1");
    fireEvent.click(within(card1).getByText("🗑 删除"));
    await new Promise((r) => setTimeout(r, 0));
    expect(invokeMock).not.toHaveBeenCalledWith("delete_fragment", { fragmentId: 1 });
    confirmSpy.mockRestore();
  });
});
