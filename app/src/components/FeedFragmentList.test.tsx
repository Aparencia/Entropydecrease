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

/** 碎片的家：feed 地形组（V7 正控；id 11 与容器组 9 并列，绝不共号） */
const feedGroup: NoteGroup = { ...containerGroup, id: 11, name: "美妆碎片", terrain: "feed" };

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
        // 桩按 terrain 分派（promote 要容器组 / 碎片归组要 feed 组）；🔴 feed 查询**故意多回一个容器组** = V7 负控
        return args.terrain === "feed" ? [feedGroup, containerGroup] : [containerGroup];
      case "promote_fragment_to_note":
        dbFragments = dbFragments.filter((f) => f.id !== args.fragmentId);
        return { note: noteStub, autoCleanedGroups: [] };
      case "promote_fragment_to_card":
        return 1;
      case "delete_fragment":
        dbFragments = dbFragments.filter((f) => f.id !== args.fragmentId);
        return { deleted: true, autoCleanedGroups: [] };
      // 批 7 C11：碎片归组（桩把 groupId 真的挪过去 —— 重载后行内状态才对得上）
      case "update_fragment_group":
        dbFragments = dbFragments.map((f) => (f.id === args.fragmentId ? { ...f, groupId: args.groupId as number | null } : f));
        return { moved: true, autoCleanedGroups: [] };
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
    // 批 4 T11：确认从 `window.confirm` 迁到 `ConfirmDialog` ⇒ 打桩改成**点按钮**；
    // 桩仍在位、但断言它**一次都没被调用**（比原来的 mockReturnValue 更强：旧写法证不了"没走命令式确认"）。
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<FeedFragmentList onChanged={vi.fn()} onPromoted={vi.fn()} />);
    await screen.findByTestId("fragment-card-2");

    const card2 = screen.getByTestId("fragment-card-2");
    fireEvent.click(within(card2).getByText("🗑 删除"));
    // 二次确认：原文案三行逐字进弹层（标题 / 碎片预览 / 保留项）
    const dialog = await screen.findByTestId("fragment-delete-confirm");
    expect(dialog.textContent).toContain("删除这条碎片？");
    expect(dialog.textContent).toContain("「单句灵感…」");
    expect(dialog.textContent).toContain("绑定的闪卡会保留");
    fireEvent.click(screen.getByTestId("fragment-delete-confirm-confirm"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_fragment", { fragmentId: 2 });
    });
    await waitFor(() => expect(screen.queryByTestId("fragment-card-2")).toBeNull());

    // 取消：确认框取消 → 不触发删除（碎片仍在）
    invokeMock.mockClear();
    const card1 = screen.getByTestId("fragment-card-1");
    fireEvent.click(within(card1).getByText("🗑 删除"));
    fireEvent.click(await screen.findByTestId("fragment-delete-confirm-cancel"));
    await new Promise((r) => setTimeout(r, 0));
    expect(invokeMock).not.toHaveBeenCalledWith("delete_fragment", { fragmentId: 1 });
    expect(screen.getByTestId("fragment-card-1")).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("删除进行中：重复点击只执行一次（busy 门 —— 批 4 T11 的 M3 判据）", async () => {
    // Arrange：让 delete_fragment 挂起（动作「在飞」）
    let release: (v: unknown) => void = () => undefined;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_fragments") return dbFragments;
      if (cmd === "resolve_fragment_image") return null;
      if (cmd === "delete_fragment") return new Promise((r) => { release = r; });
      throw new Error(`unexpected command: ${cmd}`);
    });
    const count = (): number => invokeMock.mock.calls.filter((c) => c[0] === "delete_fragment").length;
    render(<FeedFragmentList onChanged={vi.fn()} onPromoted={vi.fn()} />);
    await screen.findByTestId("fragment-card-2");
    const trigger = (): HTMLButtonElement =>
      within(screen.getByTestId("fragment-card-2")).getByText("🗑 删除").closest("button") as HTMLButtonElement;

    // Act：确认一次（invoke 在飞）→ 再点触发钮 + 再点确认钮
    fireEvent.click(trigger());
    fireEvent.click(await screen.findByTestId("fragment-delete-confirm-confirm"));
    await waitFor(() => expect(count()).toBe(1));
    expect(trigger().hasAttribute("disabled"), "动作在飞时触发钮必须 disabled").toBe(true);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByTestId("fragment-delete-confirm-confirm"));

    // Assert：**只执行一次**（若 busy 未接：触发钮可再点 ⇒ 新弹层 open=true 且按钮不 busy ⇒ 第二次 invoke）
    expect(count()).toBe(1);
    release({ deleted: true, autoCleanedGroups: [] });
    await waitFor(() => expect(trigger().hasAttribute("disabled")).toBe(false));
    expect(count()).toBe(1);
  });
});

/** 批 7 C11：片段行归组入口。与 `batch7UiWiring.test.tsx` 第 ⑦ 条分工：那条管「生产侧有调用点」，
 *  本组管「点得到 + 载荷逐字 + 正/负控 + 失败不静默 + 候选只含 feed 组（V7）」。
 *  载荷键名按 Rust 真身 camelCase：`fragment_id` ⇒ `fragmentId`（计划 C11 那格写的 `id` 是勘误）。 */
describe("批 7 C11 · 片段归组入口（update_fragment_group）", () => {
  it("入口是真按钮 · 候选只含 feed 组（负控：容器组 9 不出现）⇒ 选组载荷逐字", async () => {
    const onChanged = vi.fn();
    render(<FeedFragmentList onChanged={onChanged} onPromoted={vi.fn()} />);
    await screen.findByTestId("fragment-card-2");
    // V7：查询按 feed 地形走（后端真源）+ 客户端再收一次口径 ⇒ 容器组 9 必须在候选之外
    const entry = screen.getByTestId("fragment-move-group-2");
    expect(entry.tagName, "归组入口必须是可点击的真按钮").toBe("BUTTON");
    fireEvent.click(entry);
    const option = await screen.findByTestId("fragment-move-group-2-11");
    expect(invokeMock).toHaveBeenCalledWith("list_note_groups", { terrain: "feed" });
    expect(screen.queryByTestId("fragment-move-group-2-9"), "容器组混进了碎片候选（V7 负控）").toBeNull();
    // 负控①：只展开清单不发命令
    expect(invokeMock.mock.calls.map((c) => c[0]), "展开清单本身不得发命令").not.toContain("update_fragment_group");

    // 正控：选中 feed 组 11 ⇒ 载荷逐字（fragmentId = Rust 侧 fragment_id 的 camelCase）
    fireEvent.click(option);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("update_fragment_group", { fragmentId: 2, groupId: 11 }));
    // 负控②：载荷里的 fragmentId 只能是点的那一行
    expect(invokeMock).not.toHaveBeenCalledWith("update_fragment_group", { fragmentId: 1, groupId: 11 });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("移出组：已归组的行有该出口且传 groupId: null；未归组的行**没有**该出口", async () => {
    render(<FeedFragmentList onChanged={vi.fn()} onPromoted={vi.fn()} />);
    await screen.findByTestId("fragment-card-1");
    fireEvent.click(screen.getByTestId("fragment-move-group-1"));
    const none = await screen.findByTestId("fragment-move-group-1-none");
    // 组名查不到时如实报 id（fragment 1 还在容器组 9 里）—— 不许谎报「未归组」
    expect(screen.getByTestId("fragment-move-group-1-current").textContent).toBe("当前组 #9");
    // 负控：未归组的行（fragment 2）不出现「移出组」，且如实报「当前未归组」
    fireEvent.click(screen.getByTestId("fragment-move-group-2"));
    await screen.findByTestId("fragment-move-group-2-11");
    expect(screen.queryByTestId("fragment-move-group-2-none"), "未归组的行不该有「移出组」").toBeNull();
    expect(screen.getByTestId("fragment-move-group-2-current").textContent).toBe("当前未归组");

    // 正控：移出组 ⇒ groupId: null（Rust Option<i64> 的 None 语义）
    fireEvent.click(none);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("update_fragment_group", { fragmentId: 1, groupId: null }));
  });

  it("失败路径不静默：命令 reject ⇒ 收件箱错误行可见，且带后端原因（父层既有 setErr 形态）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_fragments") return dbFragments;
      if (cmd === "list_note_groups") return [feedGroup, containerGroup];
      if (cmd === "resolve_fragment_image") return null;
      if (cmd === "update_fragment_group") throw new Error("feed 开关未开启");
      throw new Error(`unexpected command: ${cmd}`);
    });
    render(<FeedFragmentList onChanged={vi.fn()} onPromoted={vi.fn()} />);
    await screen.findByTestId("fragment-card-2");
    fireEvent.click(screen.getByTestId("fragment-move-group-2"));
    fireEvent.click(await screen.findByTestId("fragment-move-group-2-11"));
    await waitFor(() => expect(screen.getByTestId("inbox-error").textContent).toContain("移动到组失败"));
    expect(screen.getByTestId("inbox-error").textContent, "后端原因必须落到可见行").toContain("feed 开关未开启");
  });

  it("REQ-316：源组被自动清理 ⇒ 上抛组标题；无清理（空数组）⇒ 不打扰", async () => {
    const stub = (cleaned: string[]) => async (cmd: string): Promise<unknown> => {
      if (cmd === "list_fragments") return dbFragments;
      if (cmd === "list_note_groups") return [feedGroup, containerGroup];
      if (cmd === "resolve_fragment_image") return null;
      if (cmd === "update_fragment_group") return { moved: true, autoCleanedGroups: cleaned };
      throw new Error(`unexpected command: ${cmd}`);
    };
    const onCleanNotice = vi.fn();
    invokeMock.mockImplementation(stub(["旧主题组"]));
    const { unmount } = render(<FeedFragmentList onChanged={vi.fn()} onPromoted={vi.fn()} onCleanNotice={onCleanNotice} />);
    await screen.findByTestId("fragment-card-2");
    fireEvent.click(screen.getByTestId("fragment-move-group-2"));
    fireEvent.click(await screen.findByTestId("fragment-move-group-2-11"));
    await waitFor(() => expect(onCleanNotice).toHaveBeenCalledWith(["旧主题组"]));
    unmount();
    // 负控：结果为空 ⇒ 零变化，不上抛（与 runPromote / runDelete 同向）
    const quiet = vi.fn();
    invokeMock.mockImplementation(stub([]));
    render(<FeedFragmentList onChanged={vi.fn()} onPromoted={vi.fn()} onCleanNotice={quiet} />);
    await screen.findByTestId("fragment-card-2");
    fireEvent.click(screen.getByTestId("fragment-move-group-2"));
    fireEvent.click(await screen.findByTestId("fragment-move-group-2-11"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("update_fragment_group", { fragmentId: 2, groupId: 11 }));
    expect(quiet, "无清理 ⇒ 不上抛").not.toHaveBeenCalled();
  });
});
