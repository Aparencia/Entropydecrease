/**
 * @ai-context src/ui/zIndex.ts（z-index 六档标尺）的单测（ADR-032 决策 5）。
 *
 * Why：17 个散值收敛成 6 档后，标尺的值、顺序与用途说明就是叠放语义的唯一依据 ——
 * 改值或删档会让叠放重新变成「涌现的」，故逐条钉住（顺序即语义）。
 */
import { describe, expect, it } from "vitest";
import { TIER_PURPOSE, Z_TIER, zIndex } from "./zIndex";
import type { ZTierName } from "./zIndex";

describe("z-index 标尺", () => {
  it("恰好六档（规范 §5.1：17 个不同值收敛到 6）", () => {
    expect(Object.keys(Z_TIER)).toHaveLength(6);
  });

  it("档位值与规范逐条一致", () => {
    expect(Z_TIER).toEqual({
      raised: 10,
      panel: 100,
      popover: 200,
      modal: 300,
      modalNested: 400,
      toast: 500,
    });
  });

  it("严格递增（顺序即语义，乱序会让叠放重新变成涌现的）", () => {
    const values = Object.values(Z_TIER);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i], `第 ${i} 档`).toBeGreaterThan(values[i - 1]);
    }
  });

  it("zIndex() 取值与常量一致", () => {
    const names = Object.keys(Z_TIER) as ZTierName[];
    for (const n of names) {
      expect(zIndex(n)).toBe(Z_TIER[n]);
    }
  });

  it("每一档都有用途说明（否则分档无法被遵循）", () => {
    for (const n of Object.keys(Z_TIER) as ZTierName[]) {
      expect(TIER_PURPOSE[n]?.length ?? 0, `${n} 缺用途说明`).toBeGreaterThan(0);
    }
  });

  it("模态档高于锚定弹层档（防菜单盖住 Modal）", () => {
    expect(Z_TIER.modal).toBeGreaterThan(Z_TIER.popover);
  });

  it("Toast 高于所有档（必须在最上层）", () => {
    const max = Math.max(...Object.values(Z_TIER));
    expect(Z_TIER.toast).toBe(max);
  });
});
