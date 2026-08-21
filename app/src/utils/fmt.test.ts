/**
 * fmt.test.ts — utils/fmt.ts 时间格式化纯函数测试（M9 首批单测，AAA 结构）。
 */
import { describe, expect, it } from "vitest";
import { fmtDate, fmtDuration, fmtMs } from "./fmt";

describe("fmtMs", () => {
  it("不足 1 小时：mm:ss 且补零", () => {
    // Arrange / Act
    const out = fmtMs(65_000);
    // Assert
    expect(out).toBe("01:05");
  });

  it("超过 1 小时：h:mm:ss", () => {
    // Arrange：1h2m3s
    const out = fmtMs((1 * 3600 + 2 * 60 + 3) * 1000);
    // Assert
    expect(out).toBe("1:02:03");
  });

  it("零毫秒：00:00", () => {
    expect(fmtMs(0)).toBe("00:00");
  });

  it("毫秒尾数向下取整（999ms 不计入秒）", () => {
    // Arrange / Act
    const out = fmtMs(1_999);
    // Assert
    expect(out).toBe("00:01");
  });
});

describe("fmtDuration", () => {
  it("小时级：XhYm（省略秒）", () => {
    // Arrange：2h15m30s
    const out = fmtDuration((2 * 3600 + 15 * 60 + 30) * 1000);
    // Assert
    expect(out).toBe("2h15m");
  });

  it("分钟级：YmZs", () => {
    // Arrange：3m42s
    const out = fmtDuration((3 * 60 + 42) * 1000);
    // Assert
    expect(out).toBe("3m42s");
  });

  it("秒级：Xs", () => {
    expect(fmtDuration(45_000)).toBe("45s");
  });

  it("负值钳制为 0s（防御异常时长）", () => {
    expect(fmtDuration(-5_000)).toBe("0s");
  });
});

describe("fmtDate", () => {
  it("跨年日期补年份（格式 YYYY-MM-DD）", () => {
    // Arrange：2000-01-02（本地时区解析；年份必然 ≠ 当前年份）
    const unixSec = new Date(2000, 0, 2).getTime() / 1000;
    // Act
    const out = fmtDate(unixSec);
    // Assert
    expect(out).toBe("2000-01-02");
  });

  it("当年日期：MM-DD HH:mm", () => {
    // Arrange：构造当年固定时刻（避免硬编码导致跨年失效）
    const d = new Date(new Date().getFullYear(), 0, 5, 9, 7);
    // Act
    const out = fmtDate(d.getTime() / 1000);
    // Assert
    expect(out).toBe("01-05 09:07");
  });
});
