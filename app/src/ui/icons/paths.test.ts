import { describe, expect, it } from "vitest";
import { ICON_NAMES, ICON_PATHS } from "./paths";
import type { IconName } from "./paths";
import { ICON_ELEMENT_TAGS } from "./types";
import { SCALE_TOKENS } from "../tokens";

// 类型层断言：若 IconName 塌回 string，本行编译失败（tsc --noEmit 覆盖测试文件）。
// 运行时的 24 元名单断言拦不住这种退化 —— 宽注解下 ICON_NAMES 依旧是 24 个键，
// 只有类型层能发现「键类型被抹成 string」。故意留一个 `_` 前缀变量承载该断言。
type _IconNameIsNarrow = string extends IconName ? never : true;
const _iconNameIsNarrow: _IconNameIsNarrow = true;
// tsconfig 开了 `noUnusedLocals`，而 TS 只豁免**参数**的下划线前缀 —— 该变量必须被读一次，
// 否则本行本身变成 TS6133，把一条类型守卫变成噪音。
void _iconNameIsNarrow;

describe("图标几何契约", () => {
  it("注册表非空，且 NAMES 与 PATHS 键集合一致", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ICON_PATHS).sort());
  });

  it("命名规范：kebab-case，只含小写字母、数字与连字符", () => {
    for (const name of ICON_NAMES) {
      expect(name, `非法图标名：${name}`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("每个图标至少有一个元素（空几何是无声的渲染失败）", () => {
    for (const name of ICON_NAMES) {
      expect(ICON_PATHS[name].elements.length, `${name} 几何为空`).toBeGreaterThan(0);
    }
  });

  it("元素只用白名单内的四种标签", () => {
    for (const name of ICON_NAMES) {
      for (const el of ICON_PATHS[name].elements) {
        expect(ICON_ELEMENT_TAGS, `${name} 含越界标签 ${el.tag}`).toContain(el.tag);
      }
    }
  });

  it("path 的 d 非空且不含换行", () => {
    for (const name of ICON_NAMES) {
      for (const el of ICON_PATHS[name].elements) {
        if (el.tag === "path") {
          expect(el.d.trim().length, `${name} 的 d 为空`).toBeGreaterThan(0);
          expect(el.d, `${name} 的 d 含换行`).not.toMatch(/[\r\n]/);
        }
      }
    }
  });

  it("坐标落在 24 网格内（允许 0..24，含半个像素的溢出容忍）", () => {
    const inGrid = (n: number) => n >= 0 && n <= 24;
    // 各标签的实际执行次数 —— 让「守卫把分支整条跳过」变成可见的失败，
    // 而不是一份永远全绿的空转测试（T1 之后注册表里只有 path，circle/rect 分支一次都没跑过）。
    // 计数器**由白名单派生**而非手写三键：手写的宽 `Record<string, number>` 在 ICON_ELEMENT_TAGS
    // 加入第四种标签时会累加成 NaN，并以「注册表里没有任何 X 元素」这种误导信息失败 ——
    // 真实原因只是计数器缺键，与被测的注册表无关。
    const visited = ICON_ELEMENT_TAGS.map(() => 0);
    for (const name of ICON_NAMES) {
      for (const el of ICON_PATHS[name].elements) {
        visited[ICON_ELEMENT_TAGS.indexOf(el.tag)] += 1;
        if (el.tag === "circle") {
          // 尺寸必须为正。r ≤ 0 的圆在 SVG 里**什么都渲染不出来**（静默的空图标），
          // 而这是下面四向网格检查**结构性拦不住**的逃逸：cx±r / cy±r 在负半径下会对称地
          // 落回网格内（cx12 / r-5 → 17 与 7，四向全部合法），故必须单独守。
          expect(el.r, `${name} 圆的 r 必须为正（当前 ${el.r}）`).toBeGreaterThan(0);
          // 四向都要验：只验 cx-r / cy+r 时，「向右/向上溢出」的圆会漏过
          const fits = inGrid(el.cx - el.r) && inGrid(el.cx + el.r) && inGrid(el.cy - el.r) && inGrid(el.cy + el.r);
          expect(fits, `${name} 圆越界（cx${el.cx} cy${el.cy} r${el.r}）`).toBe(true);
        }
        if (el.tag === "rect") {
          // 与圆对称：w/h 也必须为正。零尺寸**同样渲染不出东西**，且下面的网格检查对它是瞎的
          // （x+0 = x 仍落在网格内）。负值也并非总能被拦下 —— x18 / w-3 满足 x+w=15 且在网格内，
          // 只有「正数」这一条能同时堵住零与负。
          expect(el.w, `${name} 矩形的 w 必须为正（当前 ${el.w}）`).toBeGreaterThan(0);
          expect(el.h, `${name} 矩形的 h 必须为正（当前 ${el.h}）`).toBeGreaterThan(0);
          expect(inGrid(el.x) && inGrid(el.y) && inGrid(el.x + el.w) && inGrid(el.y + el.h), `${name} 矩形越界`).toBe(true);
        }
        if (el.tag === "path") {
          // 起点必须显式落在网格内：`d` 的第一个锚点是唯一能廉价校验的绝对坐标
          const m = /^M\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/.exec(el.d);
          expect(m, `${name} 的 d 未以「M x y」起始：${el.d}`).not.toBeNull();
          const [sx, sy] = [Number(m?.[1]), Number(m?.[2])];
          expect(inGrid(sx) && inGrid(sy), `${name} 的 d 起点越界：${sx},${sy}`).toBe(true);
          // 相对命令（a/l/v/h）的负增量是合法语法，故这里守的是**绝对值上界**而非「全部 ≥ 0」；
          // 网格是 24，任何超过 24 的量级都意味着某个坐标或半径已经跑到画布之外。
          const nums = el.d.match(/-?\d+(?:\.\d+)?/g) ?? [];
          const maxAbs = Math.max(...nums.map((n) => Math.abs(Number(n))));
          expect(maxAbs, `${name} 的 d 含超出网格量级的数值`).toBeLessThanOrEqual(24);
        }
      }
    }
    ICON_ELEMENT_TAGS.forEach((tag, i) => {
      expect(visited[i], `注册表里没有任何 ${tag} 元素，本测试在该分支上仍是空转`).toBeGreaterThan(0);
    });
  });

  it("几何数据里不得出现任何颜色（颜色只由 currentColor 决定）", () => {
    // 把几何序列化成字符串再搜颜色痕迹 —— 结构化数据本该没有颜色字段，
    // 这条守的是「将来有人给图标加个 fill/stroke 字段」的退化
    const serialized = JSON.stringify(ICON_PATHS);
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(serialized).not.toMatch(/\b(?:rgb|hsl)a?\(/);
    expect(serialized).not.toMatch(/"(?:fill|stroke|color)"/);
  });

  it("与批 0-A 的真源绑定：网格与描边值不得各写一套", () => {
    expect(SCALE_TOKENS.iconGrid).toBe(24);
    expect(SCALE_TOKENS.iconStroke).toBe(1.75);
    expect([...SCALE_TOKENS.iconSizes]).toEqual([16, 20, 24]);
  });
});

describe("首付图标名单", () => {
  // 名单即契约：少一个 = 某个域/动作没有图标；多一个 = 未经评审的增量。
  // 后续批次随消费方增补时，必须同时改这里 —— 让「图标集长大」是一件被看见的事。
  const EXPECTED = [
    // 域（9）
    "action", "ai", "classroom", "goals", "knowledge", "notes", "review", "sessions", "settings",
    // 对象与动作（15）
    "check", "chevron-down", "chevron-right", "clock", "close", "external-link", "image", "more-horizontal",
    "pause", "play", "plus", "refresh", "search", "stop", "trash",
  ];

  it("恰好 24 个，且与名单逐字一致", () => {
    expect([...ICON_NAMES]).toEqual([...EXPECTED].sort());
  });
});
