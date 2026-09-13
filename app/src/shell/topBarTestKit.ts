/**
 * topBarTestKit — `TopBar.test.tsx` 的**源码读取器与常量**（批 8 T7 拆件）。
 *
 * @ai-context 自 `shell/TopBar.test.tsx` **纯搬迁**抽出：这些 `readFileSync` 读取器、剥注释结果与
 *   动效扫描器是「把源码 / CSS 变成可判文本」的**仪器**，与被测的顶栏契约（①–④ 四层判据）无关 ⇒
 *   物理分离到本件，让判据件腾出行数头寸（原 299 / 余 1）。
 * @ai-context 为什么值也要一起搬（而不是只搬 `readFileSync` 调用）：`CSS` / `APP_CODE` / `TOAST_*_BODY`
 *   都是**模块加载期就读盘算好**的常量，分居两件会让「读一次」变成「读两次」，且判据与仪器之间多一层
 *   间接 —— 搬迁的判据是**逐字节等价**，不是「重新设计」。
 * @ai-context 🔴 `HERE` 仍指 `app/src/shell/`（本件与判据件同目录）⇒ 所有相对路径一字不改；
 *   `import.meta.url` 在 Vite/Vitest 下按 Vite 的 `file:` URL 解析，与判据件内的行为逐字相同。
 * 副作用：**模块加载期只读磁盘**（5 次 `readFileSync`，皆为仓库内文件），不写盘、不发请求。
 * 边界：本件在六棘轮的 PROD 域内（它不是 `*.test.*`）⇒ 零颜色 / 零字号 / 零边框字面量、零原生 `<button>`。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 判据前先剥注释（与 `ui/primitives` 层同一口径）：注释里提到 transition 不算犯规 */
export const CSS = readFileSync(join(HERE, "TopBar.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/**
 * G1 改判（T14）的**真源侧**只读件：`motion.css` 的元素级回执 `button:not(.ed-btn)` 与那条唯一的
 * reduced-motion 块。顶栏的交互元素全是裸 `<button>` ⇒ 顶栏的时长/缓动**不是顶栏自己的事**：
 * 真源在那条元素级规则里，顶栏再写一份就是 R1.1 明禁的第二个真源（`motion.css:63` 同款论证）。
 */
export const MOTION_CSS = readFileSync(join(HERE, "..", "ui", "primitives", "motion.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
export const TOPBAR_TSX = readFileSync(join(HERE, "TopBar.tsx"), "utf8");
const APP_TSX = readFileSync(join(HERE, "..", "App.tsx"), "utf8");
export const AI_TOAST_TSX = readFileSync(join(HERE, "aiToast.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // 批 7 T1：AI toast 装配件的新家（**剥注释** —— 不剥则注释里的字面量会满足判据，变异体 m9 实测过这个洞）
/**
 * App.tsx 的**只留代码**版本：剥块注释与整行 `//` 注释。
 * Why 必须剥：App.tsx 的注释里逐字出现了 `<nav>`、`zIndex("toast")` 这些判据串 —— 不剥的话
 * 「toast 已搬出导航行」这条判据只要注释还在就会**假绿**（正是本批反复打击的「测不到失败的检查」）。
 */
export const APP_CODE = APP_TSX.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * T10（B13/B15 授权的机械改写）：AI toast 的定位/锚点/层级判据搬到**原语层** —— 它们是
 * `ui/primitives/Toast.{css,tsx}` 的事实，覆盖**所有** `Toast` 消费者（不再只覆盖 `App.tsx` 一处）。
 * 取规则体用「`选择器 {` 到第一个 `}`」（同 `ui/primitives/Toast.placement.test.tsx:38`）：
 * 防「同一个串写在别的规则里也算过」。
 */
export const TOAST_CSS = readFileSync(join(HERE, "..", "ui", "primitives", "Toast.css"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");
export const TOAST_TSX = readFileSync(join(HERE, "..", "ui", "primitives", "Toast.tsx"), "utf8");
export const toastRuleBody = (selector: string): string => {
  const at = TOAST_CSS.indexOf(selector);
  return at < 0 ? "" : TOAST_CSS.slice(at, TOAST_CSS.indexOf("}", at));
};
export const TOAST_BASE_BODY = toastRuleBody(".ed-toast {");
export const TOAST_BELOW_NAV_BODY = toastRuleBody(".ed-toast--below-nav");

/** emoji / 图形字符（A2 裁决的机器判据）。`\p{Extended_Pictographic}` 是 Unicode 属性类，覆盖 ✨📡🎙 等 */
export const PICTO = /\p{Extended_Pictographic}/u;

/**
 * G1 改判的**扫描口径**（一处定义，判据与仪器自证共用 ⇒ 不会各写一份正则而漂移）。
 * `withoutTokenVars` 必须先剥掉 `var(--ed-x, <同值兜底>)` 整段：本仓的 token 习惯写法**带同值兜底**
 * （`--ed-dur-micro, 120ms`）⇒ 不剥的话「不得写裸 ms/s」会把合法 token 用法判成犯规（**假红**，
 * 逼实施者绕开守卫 —— 计划 Task 14 的 G1 新断言原文就有这个洞，T14 实施时实测并修正）。
 * 🔴 R1.2（改判不得弱于原判据）：属性名还认**厂商前缀 / 大写**（同 `motion-coverage.test.ts:91` 的孪生守卫）—— 旧 G1 是子串匹配，`-webkit-transition:` 在它下面是**红**，新口径漏掉前缀支就是强度回退（T14c 专属变异体实测）。
 */
export const motionDecls = (css: string): string[] =>
  css.split(";").filter((d) => /(?:^|[;\s])(?:-(?:webkit|moz|ms|o)-)?(?:transition|animation)(?:-duration|-name)?\s*:/i.test(d));
const withoutTokenVars = (decl: string): string => decl.replace(/var\(--ed-[a-z0-9-]+,[^)]*\)/g, "");
export const rawTimes = (decls: string[]): string[] => decls.filter((d) => /\d+(?:\.\d+)?\s*(?:ms|s)\b/.test(withoutTokenVars(d)));
/** 裸缓动的第三类：**裸关键字** `linear`/`ease`/`steps()`（Important ②）。边界用 `(?<![\w-])…(?![\w-])` 而非 `\b`：后者会把无兜底的合法 token `var(--ed-ease)` 与 `linear-gradient` 误判成犯规。 */
export const rawEases = (decls: string[]): string[] =>
  decls.filter((d) => /cubic-bezier|ease-(?:in|out|in-out)\b|(?<![\w-])(?:linear|ease|steps)(?![\w-])/i.test(withoutTokenVars(d)));
