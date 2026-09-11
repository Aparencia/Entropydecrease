/**
 * @ai-context 本仓库内置的 Node 内建模块最小环境声明。
 *
 * Why：`app/tsconfig.json` 只装了 `vite/client`，**没有 `@types/node`**（`app/node_modules/@types/`
 * 实测无该包，依赖树中也不存在）。而 `src/ui/tokens.drift.test.ts` 必须读盘才能守住生成产物。
 * 计划步骤 9 有两处误判：tsconfig 的
 * `include: ["src"]` **确实覆盖**该测试（`scripts/` 才不被覆盖），且 `tsc` 实测**对 `.mjs` 报 TS7016**，
 * 与「若不覆盖则无需处理」相反 —— 那两个错误会随 `npm run build`（`tsc && vite build`）使构建失败。
 *
 * 取舍：不为这些测试引入 `@types/node` 依赖（硬约束「零新增依赖」），改在本仓内置
 * 只声明**实际用到的**那些函数。声明按 Node 官方签名如实书写，**不用 `any`** ——
 * 用了就等于把本文件要买的类型安全又卖回去。
 *
 * 使用方：`src/ui/tokens.drift.test.ts`（产物漂移守卫）与 `src/ui/icons/no-inline-svg.test.ts`
 * （批 0-B 内联 svg 棘轮守卫 —— 它需要遍历 `src/` 才能发现「有人绕开图标层手写 svg」）。
 *
 * 副作用：仅类型层，`tsc --noEmit` 通过；运行时不产生任何代码（`.d.ts` 不参与打包）。
 * 说明：`import.meta.url` **不在此声明** —— `vite/client`（经 `src/vite-env.d.ts` 引入）已声明它。
 * 边界：**只覆盖已声明的符号**。其他 Node API 在此仍会报 TS2307 —— 那是刻意的：
 * 新增 Node 依赖时应显式扩写本文件，而不是让一个 `any` 把它悄悄放行。
 */
declare module "node:fs" {
  /** 读文件为字符串；文件不存在时抛错（调用方需自行兜底） */
  export function readFileSync(path: string, encoding: "utf8"): string;
  /** 列出目录下的条目名（不递归、不区分文件与目录）—— 递归遍历由调用方自行下降 */
  export function readdirSync(path: string): string[];
  /** 取路径元信息（默认 `throwIfNoEntry`，路径不存在时抛错而非返回 undefined） */
  export function statSync(path: string): Stats;
  /** `statSync` 的返回形状：只声明本仓库用到的那一个判定方法 */
  export interface Stats {
    isDirectory(): boolean;
  }
}

declare module "node:path" {
  /** 取路径的目录部分 */
  export function dirname(p: string): string;
  /** 以平台分隔符拼接路径片段 */
  export function join(...parts: string[]): string;
  /** 取 `from` → `to` 的相对路径（把绝对路径转成稳定的仓库相对路径） */
  export function relative(from: string, to: string): string;
  /** 平台路径分隔符：把相对路径归一化为正斜杠时必须按平台切分 */
  export const sep: "\\" | "/";
}

declare module "node:url" {
  /** `file://` URL 转为平台路径 */
  export function fileURLToPath(url: string | URL): string;
}
