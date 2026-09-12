/**
 * screensFor.test.ts — 「掠过哪几帧缩略」**口径真源**的行为级判据（批 6 波 C · T31）。
 *
 * @ai-context 环境：**node**（本件不碰 DOM —— 纯函数；⚠️ 全文**不写**那条 jsdom 指令串，否则
 *   vitest 的「全文件文本扫描」会把它当成真的环境头）。计划 Task 31 Step 1 的判据 = V1。
 * @ai-context 仪器纪律：凡「恰 N 个 / 按序」处**一律逐序数组相等**（`toEqual` 整数组，不用长度）；
 *   每条判据各带自己的变异体，读数见 `task-31-report.md`（变异体只在导出副本里做）：
 *   M1a `screensAround` 返回全部屏 · M1b 不过滤 `image_ref === null` · M1c `capFrames` 退化成恒等
 *   （**声明：计划点名的 M7「rich 设成 20」在本实现下是等价变异体 —— `Math.min` 兜住了 ⇒ 仍 6；
 *   硬限的牙改由 M1c 承担**，同 T30 的先例）· M1d `thumbRefOf` 不换前缀。
 * 副作用：无（纯读常量与纯函数）。边界：夹具的 `first_seen_ms` 全部互不相同 ⇒ 排序稳定性的
 *   「同 ms 保序」这一条**本件未覆盖**（已在报告「未验证」单列）。
 */
import { describe, expect, it } from "vitest";
import type { SessionScreen } from "../../types/session";
import {
  FRAMES_BY_TIER, FRAMES_MAX, FULL_PREFIX, THUMB_PREFIX, capFrames, framesFor, screensAround, thumbRefOf,
} from "./screensFor";

/** 一屏（只填判据用得到的字段）：`ref === null` = 这一屏没有归档图 */
function scr(firstSeenMs: number, ref: string | null): SessionScreen {
  return {
    session_id: 1,
    screen_id: firstSeenMs,
    first_seen_ms: firstSeenMs,
    last_seen_ms: firstSeenMs + 500,
    title: null,
    body: [],
    labels: [],
    image_ref: ref,
    structure: [],
  };
}
/** 五屏、每屏都有图（间隔 10s）—— 窗口口径的干净夹具 */
const WINDOW: readonly SessionScreen[] = [10, 20, 30, 40, 50].map((s) => scr(s * 1_000, `full/${s}.webp`));
/** 四屏，第 2 屏 `image_ref === null`（跳过的唯一因） */
const WITH_HOLE: readonly SessionScreen[] = [scr(1_000, "full/a.webp"), scr(2_000, null), scr(3_000, "full/c.webp"), scr(4_000, "full/d.webp")];
/** 全空 ref（图文/无关键帧会话的实际形态） */
const NO_IMAGE: readonly SessionScreen[] = [scr(1_000, null), scr(2_000, null)];
const ms = (list: readonly SessionScreen[]): number[] => list.map((s) => s.first_seen_ms);

describe("V1a 窗口口径：锚 = `first_seen_ms <= activeMs` 的最后一屏，返回以它结尾的最近 max 屏", () => {
  it("落在第 3 屏区间 ⇒ 以第 3 屏结尾的 3 屏；末屏/早于所有屏/超上限/非正 max 逐例逐序", () => {
    expect(ms(screensAround(WINDOW, 35_000, 3)), "activeMs=35s 落在第 3 屏（30s）区间 ⇒ 以它结尾的最近 3 屏").toEqual([10_000, 20_000, 30_000]);
    expect(ms(screensAround(WINDOW, 50_000, 2)), "落在末屏 ⇒ 只取它与其前一屏").toEqual([40_000, 50_000]);
    expect(ms(screensAround(WINDOW, 5_000, 3)), "早于所有屏 ⇒ 锚退化为最小 first_seen_ms 的那一屏（不是空、也不是全部）").toEqual([10_000]);
    expect(ms(screensAround(WINDOW, 0, 3)), "0ms 同属上一行（锚取首屏）").toEqual([10_000]);
    expect(ms(screensAround(WINDOW, 99_999, 6)), "max 大于屏数 ⇒ 有多少给多少（不复制、不补齐）").toEqual([10_000, 20_000, 30_000, 40_000, 50_000]);
    expect([ms(screensAround(WINDOW, 35_000, 0)), ms(screensAround(WINDOW, 35_000, -1))], "max <= 0 ⇒ 空（不许当成「全部」）").toEqual([[], []]);
  });
});

describe("V1b 空 ref 的屏被跳过；空数据面 / 全空 ref ⇒ 空（稀疏降级不占位）", () => {
  it("含 `image_ref === null` 的屏：它既不进结果、也不当锚；空数组与全空 ref 都返回 []", () => {
    expect(ms(screensAround(WITH_HOLE, 3_500, 3)), "2s 那屏没有归档图 ⇒ 跳过（不是占位、不是拉伸）").toEqual([1_000, 3_000]);
    expect(ms(screensAround(WITH_HOLE, 9_999, 9)), "窗口上限大于可用屏数 ⇒ 给全部可用屏（两屏，不含空 ref 那屏）").toEqual([1_000, 3_000, 4_000]);
    expect([ms(screensAround([], 1_000, 3)), ms(screensAround(NO_IMAGE, 1_000, 3)), ms(screensAround(NO_IMAGE, 99_999, 3))], "空面 / 全空 ref ⇒ 三例都是 []").toEqual([[], [], []]);
  });
});

describe("V1c 帧数：三档 1/3/6、硬限 6、reduce ⇒ 恰 1 帧", () => {
  it("`framesFor` 三档逐序；`capFrames` 是硬限本身（越限即夹回，不是「再加一点」）；reduce 与 eco 同形", () => {
    expect([framesFor("eco", false), framesFor("standard", false), framesFor("rich", false)], "三档帧数逐序（V7 的读数口）").toEqual([1, 3, 6]);
    expect([framesFor("eco", true), framesFor("standard", true), framesFor("rich", true)], "reduced-motion 命中 ⇒ 恰 1 帧（三个档位都一样，系统偏好优先于档位）").toEqual([1, 1, 1]);
    expect([capFrames(1), capFrames(3), capFrames(6), capFrames(7), capFrames(20)], "硬限：≤6 原样、>6 一律夹回 6").toEqual([1, 3, 6, 6, 6]);
    expect(FRAMES_MAX, "硬限的字面值（「丰富」档的上界就是它，不是另设一个更大的数）").toBe(6);
    expect([FRAMES_BY_TIER.eco, FRAMES_BY_TIER.standard, FRAMES_BY_TIER.rich].filter((n) => n > FRAMES_MAX), "档位表里出现了越限值 ⇒ 硬限被绕过").toEqual([]);
  });
});

describe("V1d 掠过只取 320px 级缩略图（`full/` → `thumb/`），其余相对路径原样", () => {
  it("`full/a.webp` → `thumb/a.webp`；已是 `thumb/` / 别的目录 / 空串都不改", () => {
    expect([thumbRefOf("full/a.webp"), thumbRefOf("full/1740000000000.webp")], "归档的两层约定（PB1 逐字）").toEqual(["thumb/a.webp", "thumb/1740000000000.webp"]);
    expect([thumbRefOf("thumb/a.webp"), thumbRefOf("screens/a.png"), thumbRefOf("")], "非 full/ 前缀一律原样（幂等，不叠前缀）").toEqual(["thumb/a.webp", "screens/a.png", ""]);
    expect([FULL_PREFIX, THUMB_PREFIX], "两个前缀是判据的锚，改一个就得同时改这里").toEqual(["full/", "thumb/"]);
  });
});
