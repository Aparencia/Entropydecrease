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
import { manualChunks, packageNameOf, vendorGroupOf, type VendorGroup } from "./manualChunks";

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
    ["/r/node_modules/property-information/lib/index.js", "vendor-katex"],
    ["/r/node_modules/hastscript/index.js", "vendor-katex"],
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
