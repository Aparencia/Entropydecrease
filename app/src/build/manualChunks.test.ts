/**
 * manualChunks.test.ts — vendor 分组规则的钉值测试（node 环境）。
 *
 * @ai-context: 为什么要有这个文件：分组规则一旦被子串匹配污染，懒加载边界会**静默失效**
 *              （构建照样成功、gzip 照样下降一点、但 GSAP 与 react 混在一个 chunk 里，
 *              批 6 的「GSAP 独立 chunk 懒加载」当场落空）。这是本批唯一无法靠人工 review
 *              稳定发现的失效模式，必须机器钉住。
 * @ai-context: 副作用：读 app/package.json（只读）。边界：只覆盖
 *              `dependencies`（devDependencies 不进浏览器产物）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXACT, manualChunks, packageNameOf, vendorGroupOf, type VendorGroup } from "./manualChunks";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("packageNameOf", () => {
  it("取最内层 node_modules 之后的包名（嵌套依赖不能解析成外层）", () => {
    expect(packageNameOf("/r/node_modules/katex/dist/katex.mjs")).toBe("katex");
    expect(packageNameOf("/r/node_modules/rehype-katex/node_modules/katex/dist/katex.mjs")).toBe("katex");
    expect(packageNameOf("/r/node_modules/@codemirror/view/dist/index.js")).toBe("@codemirror/view");
    expect(packageNameOf("/r/app/src/App.tsx")).toBeUndefined();
    expect(packageNameOf("D:\\r\\node_modules\\react-dom\\client.js")).toBe("react-dom");
  });
});

describe("vendorGroupOf 钉值", () => {
  const cases: readonly (readonly [string, VendorGroup | undefined])[] = [
    ["/r/node_modules/react/index.js", "vendor-react"],
    ["/r/node_modules/react-dom/client.js", "vendor-react"],
    ["/r/node_modules/scheduler/index.js", "vendor-react"],
    ["/r/node_modules/react-markdown/lib/index.js", "vendor-md"],
    ["/r/node_modules/@xyflow/react/dist/esm/index.js", "vendor-canvas"],
    ["/r/node_modules/@xyflow/system/dist/esm/index.js", "vendor-canvas"],
    ["/r/node_modules/d3-zoom/src/index.js", "vendor-canvas"],
    ["/r/node_modules/zustand/esm/index.mjs", "vendor-canvas"],
    ["/r/node_modules/use-sync-external-store/shim/index.js", "vendor-canvas"],
    ["/r/node_modules/classcat/index.js", "vendor-canvas"],
    ["/r/node_modules/gsap/index.js", "vendor-gsap"],
    ["/r/node_modules/@gsap/react/dist/index.js", "vendor-gsap"],
    ["/r/node_modules/katex/dist/katex.mjs", "vendor-katex"],
    ["/r/node_modules/rehype-katex/lib/index.js", "vendor-katex"],
    ["/r/node_modules/hast-util-to-text/lib/index.js", "vendor-katex"],
    ["/r/node_modules/hast-util-from-dom/lib/index.js", "vendor-katex"],
    ["/r/node_modules/hast-util-to-jsx-runtime/lib/index.js", "vendor-md"],
    ["/r/node_modules/property-information/lib/index.js", "vendor-md"],
    ["/r/node_modules/hastscript/index.js", "vendor-md"],
    ["/r/node_modules/@tauri-apps/api/core.js", "vendor-tauri"],
    ["/r/node_modules/@tauri-apps/plugin-dialog/dist-js/index.js", "vendor-tauri"],
    ["/r/node_modules/codemirror/dist/index.js", "vendor-editor"],
    ["/r/node_modules/@codemirror/lang-markdown/dist/index.js", "vendor-editor"],
    ["/r/node_modules/@lezer/javascript/dist/index.js", "vendor-editor"],
    ["/r/node_modules/@marijn/find-cluster-break/src/index.js", "vendor-editor"],
    ["/r/node_modules/crelt/index.js", "vendor-editor"],
    ["/r/node_modules/micromark-core-commonmark/dev/index.js", "vendor-md"],
    ["/r/node_modules/mdast-util-to-hast/lib/index.js", "vendor-md"],
    ["/r/node_modules/unist-util-visit/index.js", "vendor-md"],
    ["/r/node_modules/vfile/index.js", "vendor-md"],
    ["/r/node_modules/remark-gfm/index.js", "vendor-md"],
    ["/r/node_modules/@ungap/structured-clone/esm/index.js", "vendor-md"],
    // 反例：应用源码与非 node_modules 路径一律交回 rollup 默认算法
    ["/r/app/src/App.tsx", undefined],
    ["/r/app/src/pages/NotesPage.tsx", undefined],
    ["/r/vendor/node_modules_backup/react/index.js", undefined],
    ["/r/node_modules/not-a-real-package/index.js", undefined],
  ];
  for (const [id, expected] of cases) {
    it(`${id} → ${String(expected)}`, () => expect(vendorGroupOf(id)).toBe(expected));
  }
});

describe("子串碰撞陷阱（批 1 六例假活教训的镜像）", () => {
  it("裸 includes('react') 会把 react-dom / react-markdown / @xyflow/react 一起吞掉", () => {
    // ⚠️ 判别式必须是**裸 token** `react`：`@xyflow/react` 的模块 id 里并**没有**连续子串
    //    `node_modules/react`（中间隔着 `@xyflow/`）⇒ 用 `includes("node_modules/react")`
    //    做反例在这条 id 上恒为 undefined，守卫会变成假红（计划原文即此写法，实测 exit 1）。
    const naive = (id: string) => (id.includes("react") ? "vendor-react" : undefined);
    // 先证明「朴素口径确实会错」——否则这条守卫是空转的
    expect(naive("/r/node_modules/react-dom/client.js")).toBe("vendor-react");
    expect(naive("/r/node_modules/react-markdown/lib/index.js")).toBe("vendor-react");
    expect(naive("/r/node_modules/@xyflow/react/dist/index.js")).toBe("vendor-react");
    // 再证明本实现不会
    expect(vendorGroupOf("/r/node_modules/react-dom/client.js")).toBe("vendor-react"); // 同组，但走的是精确匹配
    expect(vendorGroupOf("/r/node_modules/react-markdown/lib/index.js")).toBe("vendor-md");
    expect(vendorGroupOf("/r/node_modules/@xyflow/react/dist/index.js")).toBe("vendor-canvas");
  });

  it("manualChunks 是 vendorGroupOf 的直通（接线面不许有第二套逻辑）", () => {
    expect(manualChunks("/r/node_modules/gsap/index.js")).toBe("vendor-gsap");
    expect(manualChunks("/r/app/src/App.tsx")).toBeUndefined();
  });
});

describe("覆盖闸：package.json 的每个运行时依赖都必须有归属", () => {
  it("dependencies 全部可归组（漏一个就会被 rollup 默认算法打散，懒加载边界失效）", () => {
    const pkg = JSON.parse(readFileSync(join(HERE, "..", "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length).toBeGreaterThan(0);
    const ungrouped = deps.filter((d) => vendorGroupOf(`/r/node_modules/${d}/index.js`) === undefined);
    expect(ungrouped).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3 加固（评审 task-3-review.md Important-1 / Minor-2）。以上 40 条一字未动，
// 以下全是**加测试**；实现侧只多一个 `export const EXACT` 供键集断言用，分组逻辑零改动。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EXACT 表的**全量字面钉值**（Minor-2：原 49 条里 28 条无钉值 ⇒ 改错分组不报错）。
 * 期望值必须**字面写死**、不能从实现里读出来比对：期望若取自被审查的同一张表，
 * 「把 `bail` 挪进 `vendor-katex`」这类编辑会连期望值一起改，断言恒真（自指空转）。
 * 键集一致断言（本段最后一条）补齐另一半：新增/删除登记行也必须同步改这里。
 */
const EXACT_PINS: readonly (readonly [string, VendorGroup])[] = [
  ["gsap", "vendor-gsap"],
  ["@gsap/react", "vendor-gsap"],
  ["react", "vendor-react"],
  ["react-dom", "vendor-react"],
  ["scheduler", "vendor-react"],
  ["@tauri-apps/api", "vendor-tauri"],
  ["@tauri-apps/plugin-dialog", "vendor-tauri"],
  ["katex", "vendor-katex"],
  ["rehype-katex", "vendor-katex"],
  ["hast-util-from-dom", "vendor-katex"],
  ["hast-util-to-text", "vendor-katex"],
  ["hast-util-from-html-isomorphic", "vendor-katex"],
  ["hast-util-is-element", "vendor-katex"],
  ["hast-util-parse-selector", "vendor-md"],
  ["property-information", "vendor-md"],
  ["hastscript", "vendor-md"],
  ["web-namespaces", "vendor-md"],
  ["codemirror", "vendor-editor"],
  ["crelt", "vendor-editor"],
  ["style-mod", "vendor-editor"],
  ["w3c-keyname", "vendor-editor"],
  ["classcat", "vendor-canvas"],
  ["zustand", "vendor-canvas"],
  ["use-sync-external-store", "vendor-canvas"],
  ["react-markdown", "vendor-md"],
  ["unified", "vendor-md"],
  ["bail", "vendor-md"],
  ["trough", "vendor-md"],
  ["vfile", "vendor-md"],
  ["vfile-message", "vendor-md"],
  ["extend", "vendor-md"],
  ["is-plain-obj", "vendor-md"],
  ["devlop", "vendor-md"],
  ["zwitch", "vendor-md"],
  ["ccount", "vendor-md"],
  ["longest-streak", "vendor-md"],
  ["markdown-table", "vendor-md"],
  ["trim-lines", "vendor-md"],
  ["escape-string-regexp", "vendor-md"],
  ["decode-named-character-reference", "vendor-md"],
  ["comma-separated-tokens", "vendor-md"],
  ["space-separated-tokens", "vendor-md"],
  ["html-url-attributes", "vendor-md"],
  ["style-to-js", "vendor-md"],
  ["style-to-object", "vendor-md"],
  ["inline-style-parser", "vendor-md"],
  ["estree-util-is-identifier-name", "vendor-md"],
  ["@ungap/structured-clone", "vendor-md"],
  ["@types/katex", "vendor-katex"],
];

/**
 * PREFIX 族的**有效**钉值（Minor-2：`^rehype-` / `^vfile` 原先没有任何由它们决定分组的
 * 钉值 —— `rehype-katex` / `vfile` 都被 EXACT 抢走 ⇒ 改前缀的组不会变红）。
 * 每个前缀一条代表；`EXACT[name]` 必须为 undefined 是**有效性判据**：代表一旦被 EXACT
 * 接管，这条钉值就不再约束前缀表（原缺口正是这么产生的）。
 */
const PREFIX_PINS: readonly (readonly [string, VendorGroup])[] = [
  ["@codemirror/view", "vendor-editor"],
  ["@lezer/common", "vendor-editor"],
  ["@marijn/find-cluster-break", "vendor-editor"],
  ["@xyflow/system", "vendor-canvas"],
  ["d3-zoom", "vendor-canvas"],
  ["micromark", "vendor-md"],
  ["mdast-util-to-hast", "vendor-md"],
  ["hast-util-to-jsx-runtime", "vendor-md"],
  ["unist-util-visit", "vendor-md"],
  ["remark-gfm", "vendor-md"],
  ["rehype-raw", "vendor-md"], // 未安装（惰性，同 gsap 行）：冻结 `^rehype-` 族归属本身
  ["vfile-location", "vendor-md"], // 已随 react-markdown 装上且非 EXACT ⇒ 真由 `^vfile` 决定
];

describe("EXACT 表全量钉值（Minor-2：28/49 条原先无钉值）", () => {
  for (const [name, group] of EXACT_PINS) {
    it(`EXACT ${name} → ${group}`, () => {
      expect(EXACT[name]).toBe(group); // 表内字面值
      const id = `/r/node_modules/${name}/index.js`;
      expect(vendorGroupOf(id)).toBe(group); // 解析路径：packageNameOf → EXACT
      expect(manualChunks(id)).toBe(group); // 接线面：Task 4 接的正是它
    });
  }

  it("EXACT 键集与钉值表逐字一致（新增/删除登记行必须同步钉值）", () => {
    expect(Object.keys(EXACT).sort()).toEqual(EXACT_PINS.map(([n]) => n).sort());
  });
});

describe("PREFIX 族有效钉值（每个前缀至少一条由它决定分组）", () => {
  for (const [name, group] of PREFIX_PINS) {
    it(`PREFIX ${name} → ${group}`, () => {
      expect(EXACT[name]).toBeUndefined(); // 有效性：确实由前缀表决定，未被 EXACT 接管
      expect(vendorGroupOf(`/r/node_modules/${name}/index.js`)).toBe(group);
    });
  }
});

describe("确定性与无状态（Important-1：原 40 条对跨调用/跨顺序零约束）", () => {
  // 覆盖四类 id，且**走到末尾 `return undefined` 的未登记包恰为 2 个（偶数）**：
  // 「逆序重放」只有在此数为偶数时才能观察到「按调用计数」的状态 —— 若为奇数，
  // 正序与逆序给同一 id 的计数奇偶相同、抖动互相抵消，断言会假绿。
  const ids: readonly string[] = [
    "/r/node_modules/react/index.js", // EXACT
    "/r/node_modules/bail/lib/index.js", // EXACT（加固前无钉值的 28 条之一）
    "/r/node_modules/remark-gfm/index.js", // PREFIX ^remark-
    "/r/node_modules/@xyflow/react/dist/index.js", // EXACT（裸 token 陷阱）
    "/r/node_modules/katex/dist/katex.mjs", // EXACT
    "/r/node_modules/not-a-real-package/index.js", // 未登记 ①（末尾 return undefined）
    "/r/node_modules/zzz-also-not-real/index.js", // 未登记 ②（同上）
    "/r/app/src/App.tsx", // 非 node_modules（提前 return，不计数）
    "/r/vendor/node_modules_backup/react/index.js", // 伪路径（同上）
  ];

  it("同一 id 连续两次调用结果相同（计数器/缓存类跨调用状态必红）", () => {
    for (const id of ids) expect(manualChunks(id)).toBe(manualChunks(id));
  });

  it("逆序重放后逐 id 映射与正序相同（无顺序依赖）", () => {
    expect(ids.map(manualChunks)).toEqual([...ids].reverse().map(manualChunks).reverse());
  });
});

describe("接线面全量一致（manualChunks 不许有第二套逻辑）", () => {
  it("整份混合列表上 manualChunks 与 vendorGroupOf 逐元素相同", () => {
    const ids = [
      "/r/node_modules/react/index.js",
      "/r/node_modules/bail/lib/index.js",
      "/r/node_modules/not-a-real-package/index.js",
      "/r/app/src/App.tsx",
    ];
    expect(ids.map(manualChunks)).toEqual(ids.map((id) => vendorGroupOf(id)));
  });
});

// Task 5（不装 GSAP）：预留槽 + 循环 chunk 的**反例守卫**。槽位本身见 EXACT 的 gsap 两行。
describe("批 6 预留：GSAP 必须落进独立 chunk（本批不安装 GSAP）", () => {
  it("GSAP 的两个包名都归 vendor-gsap，且与 react 不同组", () => {
    const gsap = vendorGroupOf("/r/node_modules/gsap/index.js");
    const gsapReact = vendorGroupOf("/r/node_modules/@gsap/react/dist/index.js");
    expect(gsap).toBe("vendor-gsap");
    expect(gsapReact).toBe("vendor-gsap");
    expect(gsap).not.toBe(vendorGroupOf("/r/node_modules/react/index.js"));
  });

  it("槽位在表里，且 package.json 已装 gsap（两半必须同时成立）", () => {
    // 只查 package.json ⇒ 槽位被删也通过；只查表 ⇒ 批 6 装了依赖却没人复核产物也通过。
    // devDependencies 也查：本段问的是「gsap 装了没有」，不是「它进不进浏览器产物」。
    const pkg = JSON.parse(readFileSync(join(HERE, "..", "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    // 批 6 已装上（本行由批 6 按上面那句正解改判）：判据从「此刻没有」变成「恰是这两个」。
    expect(Object.keys(all).filter((d) => d === "gsap" || d === "@gsap/react").sort()).toEqual(["@gsap/react", "gsap"]);
    expect(vendorGroupOf("/r/node_modules/gsap/index.js")).toBe("vendor-gsap");
  });

  it("反例：槽位不得被任何前缀规则吞掉（防将来有人加宽前缀）", () => {
    expect(vendorGroupOf("/r/node_modules/gsap-core/index.js")).toBeUndefined();
    expect(vendorGroupOf("/r/node_modules/not-gsap/index.js")).toBeUndefined();
  });
});

// 实测（Task 4）：vite 警告 `Circular chunk: vendor-katex -> vendor-md -> vendor-katex`，两 chunk
// 首行互指 ⇒ 130.66 kB gzip 熔成不可分簇。断环只靠**方向**：md 侧不许反向依赖 katex，且**移动
// 模块必须连它自己的依赖一起挪**（Task 5 实测：少挪 `hast-util-parse-selector` 时环仍在）。
describe("循环 chunk 反例守卫（vendor-md ⇄ vendor-katex 不许成环）", () => {
  it("md→katex 的两条桥（property-information 族 + 被移动模块自身的依赖）必须留在 vendor-md", () => {
    for (const n of ["property-information", "hastscript", "web-namespaces", "hast-util-parse-selector"]) {
      expect(EXACT[n]).toBe("vendor-md");
      expect(vendorGroupOf(`/r/node_modules/${n}/index.js`)).toBe("vendor-md");
    }
  });
});
