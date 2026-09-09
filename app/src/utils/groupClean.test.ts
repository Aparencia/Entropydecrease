/**
 * groupClean.test.ts — 空组自动清理留痕文案纯函数（REQ-316 批 7）。AAA 模式。
 */
import { describe, expect, it } from "vitest";
import { AUTO_CLEAN_TOAST_PREFIX, autoCleanNotice } from "./groupClean";

describe("autoCleanNotice 空组清理 toast 文案", () => {
  it("无清理（空数组）→ null——调用方零变化", () => {
    // Arrange / Act / Assert
    expect(autoCleanNotice([])).toBeNull();
  });

  it("null/undefined 防御 → null（后端旧契约/异常返回不崩）", () => {
    expect(autoCleanNotice(null)).toBeNull();
    expect(autoCleanNotice(undefined)).toBeNull();
  });

  it("单组 → 「已自动清理空组：X」", () => {
    expect(autoCleanNotice(["化妆"])).toBe(`已自动清理空组：化妆`);
    expect(autoCleanNotice(["化妆"])).toBe(`${AUTO_CLEAN_TOAST_PREFIX}化妆`);
  });

  it("多组按「、」连接且保持后端清理顺序", () => {
    // Arrange
    const names = ["化妆", "摄影课", "灵感碎片"];
    // Act
    const msg = autoCleanNotice(names);
    // Assert
    expect(msg).toBe("已自动清理空组：化妆、摄影课、灵感碎片");
  });
});
