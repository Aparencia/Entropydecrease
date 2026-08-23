/**
 * floatWindow.test — 浮窗几何/偏好纯函数单测（v0.12.3）。
 *
 * @ai-context: AAA 模式；覆盖吸附阈值边界、钳制极端（多屏/尺寸越界）与
 *              偏好存取损坏路径（JSON 坏数据回退——防御性编程要求）。
 */
import { describe, expect, it } from "vitest";
import {
  clampOpacity,
  clampToWorkArea,
  loadFloatPrefs,
  saveFloatPrefs,
  snapToEdge,
  FLOAT_PREFS_DEFAULT,
  FLOAT_PREFS_KEY,
} from "./floatWindow";

const AREA = { x: 0, y: 0, width: 1920, height: 1080 };
const SIZE = { width: 360, height: 240 };

function fakeStorage(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("clampToWorkArea", () => {
  it("工作区内原样返回", () => {
    expect(clampToWorkArea({ x: 100, y: 100 }, SIZE, AREA)).toEqual({ x: 100, y: 100 });
  });

  it("越界（负坐标）钳制到工作区左/上边界", () => {
    expect(clampToWorkArea({ x: -50, y: -30 }, SIZE, AREA)).toEqual({ x: 0, y: 0 });
  });

  it("越界（超出右下）钳制到 max 边界", () => {
    expect(clampToWorkArea({ x: 5000, y: 3000 }, SIZE, AREA)).toEqual({ x: 1920 - 360, y: 1080 - 240 });
  });

  it("窗口大于工作区时上限不为负（贴左上）", () => {
    const tiny = { x: 0, y: 0, width: 100, height: 100 };
    expect(clampToWorkArea({ x: 10, y: 10 }, { width: 300, height: 300 }, tiny)).toEqual({ x: 0, y: 0 });
  });
});

describe("snapToEdge", () => {
  it("距左边 8px 内吸附到左边界", () => {
    expect(snapToEdge({ x: 6, y: 100 }, SIZE, AREA)).toEqual({ x: 0, y: 100 });
  });

  it("距右边缘 8px 内吸附（按窗口右缘距工作区右缘计）", () => {
    expect(snapToEdge({ x: 1920 - 360 - 5, y: 100 }, SIZE, AREA)).toEqual({ x: 1920 - 360, y: 100 });
  });

  it("距上/下边缘 8px 内吸附", () => {
    expect(snapToEdge({ x: 100, y: 1080 - 240 - 4 }, SIZE, AREA)).toEqual({ x: 100, y: 1080 - 240 });
  });

  it("中间位置不吸附（坐标不变）", () => {
    expect(snapToEdge({ x: 800, y: 500 }, SIZE, AREA)).toEqual({ x: 800, y: 500 });
  });
});

describe("loadFloatPrefs / saveFloatPrefs", () => {
  it("无存储时回退默认", () => {
    expect(loadFloatPrefs(fakeStorage())).toEqual(FLOAT_PREFS_DEFAULT);
  });

  it("损坏 JSON 回退默认（不抛）", () => {
    expect(loadFloatPrefs(fakeStorage({ [FLOAT_PREFS_KEY]: "{bad json" }))).toEqual(FLOAT_PREFS_DEFAULT);
  });

  it("往返一致（含位置）", () => {
    const prefs = { mode: "bar" as const, topmost: false, opacity: 0.7, pos: { x: 100, y: 200 } };
    const storage = fakeStorage();
    saveFloatPrefs(prefs, storage);
    expect(loadFloatPrefs(storage)).toEqual(prefs);
  });

  it("opacity 越界值被钳制（0.1→0.35；2→1）", () => {
    expect(loadFloatPrefs(fakeStorage({ [FLOAT_PREFS_KEY]: JSON.stringify({ opacity: 0.1 }) })).opacity).toBe(0.35);
    expect(loadFloatPrefs(fakeStorage({ [FLOAT_PREFS_KEY]: JSON.stringify({ opacity: 2 }) })).opacity).toBe(1);
  });

  it("部分损坏字段合并（mode 非法回退 panel，位置无效回退 null）", () => {
    const prefs = loadFloatPrefs(
      fakeStorage({
        [FLOAT_PREFS_KEY]: JSON.stringify({ mode: "invalid", pos: { x: "bad", y: 1 } }),
      }),
    );
    expect(prefs.mode).toBe("panel");
    expect(prefs.pos).toBeNull();
  });
});

describe("clampOpacity", () => {
  it("边界与越界", () => {
    expect(clampOpacity(0.5)).toBe(0.5);
    expect(clampOpacity(0.1)).toBe(0.35);
    expect(clampOpacity(5)).toBe(1);
  });
});
