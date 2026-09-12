/**
 * @ai-context 主窗尺寸守卫：`tauri.conf.json` 与 `windowSize.ts` 必须逐字一致。
 *
 * Why 读 JSON 而不是信任常量：真值在 JSON 里，常量是**影子**。只有把两者钉在一起，
 *   「改了 JSON 忘了常量」才是红的（反之亦然）。规格 §1 决策 17 的两个数字是本测试的断言对象。
 *
 * 口径：只断言四个数字与存在性；**不**断言 JSON 里的其它字段（批 4/8 会动它们）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NAV_MIN_WIDTH, WINDOW_SIZE } from "./windowSize";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONF = join(APP, "src-tauri", "tauri.conf.json");

describe("主窗尺寸（规格 §1 决策 17）", () => {
  const conf = JSON.parse(readFileSync(CONF, "utf8"));
  const win = conf.app.windows[0];

  it("默认 1280×800", () => {
    expect(win.width).toBe(WINDOW_SIZE.defaultWidth);
    expect(win.height).toBe(WINDOW_SIZE.defaultHeight);
  });

  it("最小 1024×640（J1-1：今天完全没有 min 尺寸）", () => {
    expect(win.minWidth).toBe(WINDOW_SIZE.minWidth);
    expect(win.minHeight).toBe(WINDOW_SIZE.minHeight);
  });

  it("窗口可缩放（否则 min 尺寸无意义）", () => {
    expect(win.resizable ?? true).toBe(true);
  });

  it("断点下限 = 最小窗宽（防止两处各写一个 1024）", () => {
    expect(NAV_MIN_WIDTH).toBe(1024);
    expect(NAV_MIN_WIDTH).toBe(win.minWidth);
  });
});
