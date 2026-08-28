/**
 * 组侧栏纯函数测试（v0.14 C1 Obsidian 式改造）。
 *
 * @ai-context: spec §6——filterGroups 关键词过滤；pushRecentGroup LRU 推进；
 *              最近使用/折叠态 storage 读写（mock storage 注入，node 环境）。
 */
import { describe, expect, it } from "vitest";
import {
  filterGroups,
  foldedKey,
  pushRecentGroup,
  readFolded,
  readRecentGroupIds,
  writeFolded,
  writeRecentGroupIds,
} from "./groupSidebar";

/** 内存 storage mock（node 环境无 localStorage） */
function memStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}

const groups = [
  { id: 1, name: "化妆课 A", kind: "course" },
  { id: 2, name: "手账 B", kind: "standalone" },
  { id: 3, name: "化妆进阶", kind: "topic" },
];

describe("filterGroups", () => {
  it("关键词命中组名（大小写不敏感）", () => {
    expect(filterGroups(groups, "化妆").map((g) => g.id)).toEqual([1, 3]);
  });

  it("空查询/空白查询原样返回", () => {
    expect(filterGroups(groups, "")).toEqual(groups);
    expect(filterGroups(groups, "   ")).toEqual(groups);
  });

  it("无命中返回空数组", () => {
    expect(filterGroups(groups, "不存在")).toEqual([]);
  });
});

describe("pushRecentGroup LRU", () => {
  it("访问 id 移到队首", () => {
    expect(pushRecentGroup([2, 1], 3)).toEqual([3, 2, 1]);
  });

  it("重复访问去重并置顶", () => {
    expect(pushRecentGroup([2, 1, 3], 2)).toEqual([2, 1, 3]);
  });

  it("超过上限截断（默认 5）", () => {
    expect(pushRecentGroup([1, 2, 3, 4, 5], 6)).toEqual([6, 1, 2, 3, 4]);
  });

  it("自定义上限", () => {
    expect(pushRecentGroup([1, 2], 3, 2)).toEqual([3, 1]);
  });
});

describe("最近使用 storage 读写", () => {
  it("roundtrip：写后读一致", () => {
    const s = memStorage();
    writeRecentGroupIds(s, [3, 1]);
    expect(readRecentGroupIds(s)).toEqual([3, 1]);
  });

  it("损坏 JSON / 缺失回退空数组", () => {
    const s = memStorage();
    expect(readRecentGroupIds(s)).toEqual([]);
    s.setItem("group-sidebar-recent", "{broken");
    expect(readRecentGroupIds(s)).toEqual([]);
    s.setItem("group-sidebar-recent", '["a", 1]');
    expect(readRecentGroupIds(s)).toEqual([1]);
  });
});

describe("折叠态 storage 读写", () => {
  it("roundtrip：折叠=1 展开=0 缺失=false", () => {
    const s = memStorage();
    expect(readFolded(s, "course")).toBe(false);
    writeFolded(s, "course", true);
    expect(readFolded(s, "course")).toBe(true);
    writeFolded(s, "course", false);
    expect(readFolded(s, "course")).toBe(false);
  });

  it("foldedKey 按 kind 区分", () => {
    expect(foldedKey("course")).toBe("group-sidebar-folded:course");
    expect(foldedKey("feed")).toBe("group-sidebar-folded:feed");
  });
});
