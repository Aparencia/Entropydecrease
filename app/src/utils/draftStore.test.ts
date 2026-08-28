/**
 * draftStore.test.ts — utils/draftStore.ts 单测（spec §6.1）。
 * 用内存 Storage 桩隔离 localStorage（node 环境无 localStorage）。
 */
import { describe, expect, it, vi } from "vitest";
import { clearDraft, draftKey, readDraft, writeDraft } from "./draftStore";

/** 最小 Storage 桩：Map 实现 getItem/setItem/removeItem */
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

describe("draftStore", () => {
  it("draftKey 带笔记 id 前缀", () => {
    expect(draftKey(42)).toBe("note-draft:42");
  });

  it("写入后可读出完整载荷", () => {
    const storage = makeStorage();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    writeDraft(7, "标题", "正文", storage);
    vi.useRealTimers();
    const draft = readDraft(7, storage);
    expect(draft).toEqual({ title: "标题", content: "正文", updatedAt: 1_700_000_000_000 });
  });

  it("清除后读不到", () => {
    const storage = makeStorage();
    writeDraft(7, "t", "c", storage);
    clearDraft(7, storage);
    expect(readDraft(7, storage)).toBeNull();
  });

  it("无草稿返回 null", () => {
    expect(readDraft(99, makeStorage())).toBeNull();
  });

  it("损坏 JSON 降级为 null", () => {
    const storage = makeStorage();
    storage.setItem(draftKey(1), "{not-json");
    expect(readDraft(1, storage)).toBeNull();
  });

  it("结构不符（缺字段/类型错）降级为 null", () => {
    const storage = makeStorage();
    storage.setItem(draftKey(1), JSON.stringify({ title: "t" }));
    expect(readDraft(1, storage)).toBeNull();
    storage.setItem(draftKey(1), JSON.stringify({ title: "t", content: "c", updatedAt: "2026" }));
    expect(readDraft(1, storage)).toBeNull();
  });

  it("setItem 抛异常（配额满）静默失败不抛", () => {
    const storage = makeStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    expect(() => writeDraft(1, "t", "c", storage)).not.toThrow();
    expect(readDraft(1, storage)).toBeNull();
    vi.restoreAllMocks();
  });

  it("不同笔记 id 草稿隔离", () => {
    const storage = makeStorage();
    writeDraft(1, "A", "a", storage);
    writeDraft(2, "B", "b", storage);
    expect(readDraft(1, storage)?.title).toBe("A");
    expect(readDraft(2, storage)?.title).toBe("B");
  });
});
