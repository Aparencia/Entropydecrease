/**
 * manualChunks — 生产构建的 vendor 分组规则（纯函数、可单测）。
 *
 * @ai-context: 批 2 包体治理的原子层。Vite 的 `build.rollupOptions.output.manualChunks`
 *              接收模块 id，返回 chunk 名；返回 `undefined` 表示「交回 rollup 默认算法」。
 * @ai-context: 为什么**必须按「解析出的包名」精确匹配**，而不是 `id.includes("node_modules/react")`：
 *              本仓实测的子串碰撞 —— `node_modules/react` 同时是
 *              `react-dom` / `react-markdown` / `@xyflow/react` 的子串。用 includes 会把
 *              markdown 栈与画布栈并进 `vendor-react`，懒加载边界**静默失效**
 *              （构建照样成功、gzip 照样降一点，但批 6 的 GSAP 独立 chunk 承诺当场落空）。
 *              这是批 1 六例「裸 includes 判活」教训在构建配置上的镜像。
 * @ai-context: 为什么 GSAP 现在就在表里（而依赖还没装）：规格 §13 风险表要求
 *              「GSAP 独立 chunk 懒加载」。本函数用**包名精确匹配**表达这条承诺，
 *              因此 gsap 未安装时规则**天然惰性**（没有任何模块 id 会解析出包名 `gsap`），
 *              装了之后**零改动自动生效**。切不可改写成对象形式
 *              `{ "vendor-gsap": ["gsap"] }` —— 那会在 gsap 未安装时**直接让构建失败**。
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

/** 精确包名 → 分组。**先于前缀族匹配**，因此 `rehype-katex` 不会被 `rehype-` 抢走。 */
const EXACT: Readonly<Record<string, VendorGroup>> = {
  // 批 6 预留（本批不安装；规则惰性，见文件头注释）
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
  "hast-util-parse-selector": "vendor-katex",
  hastscript: "vendor-katex",
  "property-information": "vendor-katex",
  "web-namespaces": "vendor-katex",
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
