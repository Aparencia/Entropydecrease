/**
 * manualChunks — 生产构建的 vendor 分组规则（纯函数、可单测）。
 *
 * @ai-context: 批 2 包体治理的原子层。Vite 的 `build.rollupOptions.output.manualChunks`
 *              接收模块 id，返回 chunk 名；返回 `undefined` 表示「交回 rollup 默认算法」。
 * @ai-context: 为什么**必须按「解析出的包名」精确匹配**，而不是 `id.includes(...)`：
 *              本仓实测（单测 `manualChunks.test.ts` 的「子串碰撞陷阱」段即机器判据）——
 *              裸 token `react` 才是 `react-dom` / `react-markdown` / `@xyflow/react` 三者的
 *              共同子串；`@xyflow/react` 的模块 id 里**没有**连续子串 `node_modules/react`
 *              （中间隔着 `@xyflow/`）。于是两种朴素口径各错一半：裸 `includes("react")`
 *              把 markdown 栈与画布栈一起吞进 `vendor-react`；`includes("node_modules/react")`
 *              只吞前两者，把画布栈**漏回 rollup 默认算法**。两者都让懒加载边界**静默失效**
 *              （构建照样成功、gzip 照样降一点，但批 6 的 GSAP 独立 chunk 承诺当场落空）。
 *              这是批 1 六例「裸 includes 判活」教训在构建配置上的镜像。
 * @ai-context: 为什么 GSAP 早就在表里（🔴 T14 更正过时标签：批 6 T3 的 `864f4881` 已装上
 *              `gsap@3.15.0` + `@gsap/react@2.1.2` ⇒ **`vendor-gsap` 槽位已生效**，不再是「批 6 预留」）：
 *              规格 §13 风险表要求「GSAP 独立 chunk 懒加载」。本函数用**包名精确匹配**表达这条承诺
 *              —— 批 2 编制时依赖尚未安装，规则**天然惰性**（没有任何模块 id 会解析出包名 `gsap`）；
 *              装上之后**零改动自动生效**（正是本表当初的写法换来的）。仍不可改写成对象形式
 *              `{ "vendor-gsap": ["gsap"] }`：本表的键集与钉值由 `manualChunks.test.ts` 逐条守住
 *              （`:272` 的 G8 判据 =「装上了、且仍落 `vendor-gsap`」），对象形式表达不了这份表。
 * @ai-context: 分组还可能**成环**（不只是「搬字节」）：`vendor-md` 与 `vendor-katex` 互相静态
 *              import 时被 vite 判为循环 chunk 并熔成不可分簇 ⇒ 懒加载边界静默失效。断环只能靠
 *              **方向**：md 侧不得反向依赖 katex。⚠️ 移动模块时**必须连它自己的依赖一起挪**
 *              （Task 5 实测：少挪一个直接依赖，环就还在）—— 见下方 Markdown 管线段。
 *
 * 副作用：无（纯函数）。
 * 边界：入参是 rollup 的模块 id（Windows 上可能含 `\`）；不解析 tsconfig paths；不处理虚拟模块（`\0` 前缀）。
 */

/** vendor 分组名（同时决定产物 chunk 的文件名前缀）。 */
export type VendorGroup =
  | "vendor-gsap"
  | "vendor-react"
  | "vendor-tauri"
  | "vendor-katex"
  | "vendor-editor"
  | "vendor-canvas"
  | "vendor-md";

/** 精确包名 → 分组。**先于前缀族匹配**，因此 `rehype-katex` 不会被 `rehype-` 抢走。
 *  导出**只为单测**：钉值表要能断言「本表每一条都有字面钉值、且键集与钉值表逐字一致」
 *  （评审 Minor-2 —— 28/49 条无钉值时，把 `bail` 挪进 `vendor-katex` 不会变红）。
 *  生产代码不得 import 它（分组只能经 `vendorGroupOf` / `manualChunks` 表达）。 */
export const EXACT: Readonly<Record<string, VendorGroup>> = {
  // 批 6 已安装（T3 的 `864f4881` 装上 gsap@3.15.0 / @gsap/react@2.1.2）⇒ 本槽位**已生效**，见文件头注释
  gsap: "vendor-gsap",
  "@gsap/react": "vendor-gsap",
  // React 运行时：必须同组，避免出现两份 React 实例
  react: "vendor-react",
  "react-dom": "vendor-react",
  scheduler: "vendor-react",
  // Tauri IPC
  "@tauri-apps/api": "vendor-tauri",
  "@tauri-apps/plugin-dialog": "vendor-tauri",
  // 数学渲染（katex 在 node_modules 里有两份：顶层 0.18.4 与 rehype-katex 嵌套的 0.16.47，
  // 但 `packageNameOf` 取最内层 ⇒ 两者都归到本组，不会出现「同名两 chunk」）
  katex: "vendor-katex",
  "rehype-katex": "vendor-katex",
  "hast-util-from-dom": "vendor-katex",
  "hast-util-to-text": "vendor-katex",
  "hast-util-from-html-isomorphic": "vendor-katex",
  "hast-util-is-element": "vendor-katex",
  // 编辑器（CodeMirror 6 无 scope 的几件）
  codemirror: "vendor-editor",
  crelt: "vendor-editor",
  "style-mod": "vendor-editor",
  "w3c-keyname": "vendor-editor",
  // 画布 / 图谱（无 scope 的几件）
  classcat: "vendor-canvas",
  zustand: "vendor-canvas",
  "use-sync-external-store": "vendor-canvas",
  // Markdown 管线
  // 🔴 以下四件是断 `vendor-md ⇄ vendor-katex` **循环 chunk** 的关键，必须留在 vendor-md：
  //    它们消掉了两条 md → katex 边 ——
  //      ① `hast-util-to-jsx-runtime` → `property-information`（前三件即可消除）
  //      ② `hastscript` → `hast-util-parse-selector`：**移动一个模块必须连它自己的依赖一起挪**。
  //         只把 `hastscript` 挪来、把它的直接依赖 `hast-util-parse-selector` 留在 katex，
  //         就是一次**不完整的移动**，环仍在（Task 5 实测：3 行版构建照旧打印循环警告）。
  //    归回 katex 会立刻复活环：vite 打印 `Circular chunk: vendor-katex -> vendor-md ->
  //    vendor-katex`，两 chunk 熔成不可分簇 ⇒「懒 markdown」与「懒 katex」变成同一件事。
  //    剩下的 katex → md 单向边（rehype-katex / hast-util-to-text / hast-util-from-dom →
  //    unist-util-* / hastscript / web-namespaces）不成环，是允许的方向。
  //    证据与复现：task-5-report.md §C（P0 三行仍在环 / P1 四行环消失 的对照构建）。
  "property-information": "vendor-md",
  hastscript: "vendor-md",
  "web-namespaces": "vendor-md",
  "hast-util-parse-selector": "vendor-md",
  "react-markdown": "vendor-md",
  unified: "vendor-md",
  bail: "vendor-md",
  trough: "vendor-md",
  vfile: "vendor-md",
  "vfile-message": "vendor-md",
  extend: "vendor-md",
  "is-plain-obj": "vendor-md",
  devlop: "vendor-md",
  zwitch: "vendor-md",
  ccount: "vendor-md",
  "longest-streak": "vendor-md",
  "markdown-table": "vendor-md",
  "trim-lines": "vendor-md",
  "escape-string-regexp": "vendor-md",
  "decode-named-character-reference": "vendor-md",
  "comma-separated-tokens": "vendor-md",
  "space-separated-tokens": "vendor-md",
  "html-url-attributes": "vendor-md",
  "style-to-js": "vendor-md",
  "style-to-object": "vendor-md",
  "inline-style-parser": "vendor-md",
  "estree-util-is-identifier-name": "vendor-md",
  "@ungap/structured-clone": "vendor-md",
  // 纯类型包（只含 `.d.ts`，**永不作为 rollup 模块 id 出现**）⇒ 本行是**惰性登记**，
  // 只为让覆盖闸保持全称量化（`app/package.json` 的 `dependencies` 里确实列了它，
  // 不登记则覆盖闸会对这条 package.json 分类异常假红）。若将来新增 `@types/*` 依赖，
  // 覆盖闸会再次变红，逼迫在「登记／挪去 devDependencies」之间做一次显式决定。
  "@types/katex": "vendor-katex",
};

/** 前缀族 → 分组。**按数组顺序匹配，先到先得**；不得加宽到能吃掉上面 EXACT 的包。 */
const PREFIX: readonly (readonly [RegExp, VendorGroup])[] = [
  [/^@codemirror\//, "vendor-editor"],
  [/^@lezer\//, "vendor-editor"],
  [/^@marijn\//, "vendor-editor"],
  [/^@xyflow\//, "vendor-canvas"],
  [/^d3-/, "vendor-canvas"],
  [/^micromark/, "vendor-md"],
  [/^mdast-util/, "vendor-md"],
  [/^hast-util/, "vendor-md"],
  [/^unist-util/, "vendor-md"],
  [/^remark-/, "vendor-md"],
  [/^rehype-/, "vendor-md"],
  [/^vfile/, "vendor-md"],
];

/** 从 rollup 模块 id 解析出**最内层** `node_modules` 之后的包名。 */
export function packageNameOf(moduleId: string): string | undefined {
  const id = moduleId.replace(/\\/g, "/");
  const marker = "/node_modules/";
  const at = id.lastIndexOf(marker);
  if (at < 0) return undefined;
  const seg = id.slice(at + marker.length).split("/");
  if (seg.length === 0 || seg[0] === "") return undefined;
  if (seg[0].startsWith("@")) return seg.length >= 2 && seg[1] !== "" ? `${seg[0]}/${seg[1]}` : undefined;
  return seg[0];
}

/** 模块 id → vendor 分组；非 node_modules 或未登记包返回 undefined（交回 rollup）。 */
export function vendorGroupOf(moduleId: string): VendorGroup | undefined {
  const name = packageNameOf(moduleId);
  if (name === undefined) return undefined;
  const exact = EXACT[name];
  if (exact !== undefined) return exact;
  for (const [re, group] of PREFIX) if (re.test(name)) return group;
  return undefined;
}

/** 直接交给 `build.rollupOptions.output.manualChunks`（Task 4 接线）。 */
export function manualChunks(moduleId: string): string | undefined {
  return vendorGroupOf(moduleId);
}
