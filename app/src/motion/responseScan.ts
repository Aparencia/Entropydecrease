/**
 * @ai-context **响应层回执的共享扫描仪器**（批 6 T12）—— `responseCoverage.test.ts`（node：静态覆盖与
 *   边界）与 `responseReceipt.dom.test.tsx`（jsdom：真实宿主可达性与交互语义）**共用同一份口径**。
 *
 * Why 单独成件（先例 = `../ui/primitives/buttonScan.ts` 与 `sliceScan.ts`）：两条判据一个跑在 node
 *   环境、一个跑在 jsdom 环境，**不能互相 import 测试文件**（import 一个 `*.test.*` 会把它的
 *   describe 也注册进来，等于跑两遍）；而"两份手抄迟早漂移"正是本批反复踩的坑 —— 口径本身是判据的
 *   一部分（§8.6.1 第 2 条「这是验收口径，不是形容词」）。
 *
 * ★ 口径（改口径 = 改判据）：
 *   · `stripComments`：块注释 + 行注释，**抹为等长空白并保留换行** ⇒ 行号与下标都与真实文件一致
 *     （报告里的 file:line 可以直接复现；`://` 不算注释起点，同 `nativeButton.ratchet.test.ts` 口径）。
 *   · `sectionBetween`：按**唯一标记**切出 `motion.css` 的响应层节 —— 标记在**原文**里找（它本身是
 *     注释文本，剥完就没了），切出来再剥。标记缺失 / 重复一律**抛**：守卫不得静默退化成空真
 *     （本仓有 3 起「注释字面量骗过整文件扫描器」的先例）。
 *   · `parseRules`：扁平规则解析（`选择器 { 声明体 }`，逗号选择器逐条展开）。本层 CSS 无嵌套规则、
 *     无 `@supports` 内层；真 parser 要新依赖，违反「零新增依赖」。
 *   · `declaredProps` / `declarationValue`：声明级抽取（属性名到第一个 `:`，值到 `;`）。
 *
 * 副作用：`sourceFiles` / `readPrimitiveCss` 只读磁盘（`app/src/**`）；其余全是纯函数。
 * 边界：① 文本级判据、不做 AST；② 调用点计数一律用**下界**（并行任务新增文件不该让判据变红）；
 *   ③ 只有 `.ts`/`.tsx` 算"调用点"（`.css` 不是）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `app/src` —— 调用点扫描的根（本文件在 `app/src/motion/` 下） */
export const SRC = join(HERE, "..");
/** `app/src/ui/primitives` —— 样式表的家 */
export const PRIMITIVES = join(SRC, "ui", "primitives");

/** 响应层节的两个标记（逐字取自 `motion.css`；两者都必须在原文里恰好出现一次）。
 *  ⚠️ 两者都是**完整注释**（`/*` 开头 / `*​/` 结尾）—— 切片必须连注释定界符一起拿到，否则
 *  `stripComments` 会把"未闭合的注释"当代码解析（头部那段解释文字里满是 `[data-motion]` / `@media`
 *  这类词，会被误判成规则）。 */
export const RESPONSE_BEGIN = "/* ▼▼▼ 响应层（T12）";
export const RESPONSE_END = "▲▲▲ 响应层结束（切换视图一类由原语层承担，见上 ⑥）▲▲▲ */";
/** `app/src` 内**唯一**一条 reduced-motion 块的起始串（与 `style-seams` / `motion-coverage` 同源） */
export const REDUCED_AT = "@media (prefers-reduced-motion";

/** 剥注释：块注释与行注释抹为**等长空白**（保留换行 ⇒ 行号与下标不变）；`://` 不算注释起点。 */
export function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + " ".repeat(m.length - p1.length));
}

export interface SourceFile {
  /** 相对 `app/src` 的正斜杠路径（基线键口径） */
  readonly rel: string;
  /** 剥注释后的全文 */
  readonly text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(abs);
  }
  return out;
}

export const isTestRel = (rel: string): boolean => /\.test\.tsx?$/.test(rel);

/** `app/src/**` 的 `.ts`/`.tsx`/`.css`（剥注释；相对路径按正斜杠，按路径排序）。 */
export function sourceFiles(): readonly SourceFile[] {
  return walk(SRC)
    .map((abs) => ({
      rel: relative(SRC, abs).split(sep).join("/"),
      text: stripComments(readFileSync(abs, "utf8")),
    }))
    .sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/** 生产文件（减 `*.test.ts(x)`）—— "调用面"的口径就是它。 */
export const productionFiles = (): readonly SourceFile[] => sourceFiles().filter((f) => !isTestRel(f.rel));

/** 读一份原语层样式表；`strip` 为假时返回原文（标记只存在于注释里 ⇒ 定位必须用原文）。 */
export function readPrimitiveCss(file: string, strip = true): string {
  const raw = readFileSync(join(PRIMITIVES, file), "utf8");
  return strip ? stripComments(raw) : raw;
}

/** 在**原文**里按标记切一段（标记各一次；否则抛）。 */
export function sectionBetween(text: string, begin: string, end: string): string {
  const count = (needle: string): number => text.split(needle).length - 1;
  if (count(begin) !== 1 || count(end) !== 1) {
    throw new Error(`标记必须各出现一次：${begin}=${count(begin)} / ${end}=${count(end)}`);
  }
  return text.slice(text.indexOf(begin), text.indexOf(end) + end.length);
}

export interface Rule {
  /** 单条选择器（逗号已展开、空白已归一） */
  readonly selector: string;
  /** 声明体原文（不含花括号） */
  readonly body: string;
}

/** 声明体里出现过的属性名（`background-color,` 这类值不会被误认 —— 它后面没有 `:`）。 */
export function declaredProps(body: string): readonly string[] {
  return [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
}

/**
 * 响应层允许声明的属性（**声明级白名单 = 安全网**：动效不得改变交互语义或布局）。
 * `pointer-events` / `display` / `visibility` / `width` / `height` / `position` / `margin` … 一律不在册
 * —— 两处判据（node 的静态审计 + jsdom 的"宿主命中的规则"审计）共用这一份名单。
 */
export const ALLOWED_PROPS: readonly string[] = [
  "transition-property", "transition-duration", "transition-timing-function",
  "transform", "filter", "opacity", "color", "outline", "outline-color", "outline-offset", "accent-color",
];

/** 审计：一份声明体里白名单外的属性（空数组 = 干净）。 */
export const offendersIn = (body: string): readonly string[] =>
  declaredProps(body).filter((p) => !ALLOWED_PROPS.includes(p));

/** 落点**基选择器**：把"状态"从选择器上剥掉（`:hover` / `:active` / `:focus(-visible)` / `:checked` /
 * `:disabled` / `[open]` 与只含状态的 `:not(…)`）⇒ 得到"这条规则说的是哪个元素形态"。
 * Why 需要它：判据要问的是"**这一类动作的落点在不在**"，而落点的状态变体（`[role="separator"]:hover`、
 * `details[open] > summary`）与形态本身不是一回事；逐字比对状态选择器会让判据随实现细节变红。
 */
export function baseSelector(selector: string): string {
  return selector
    .replace(/:not\(:?(?:-(?:webkit|moz)-)?(?:hover|active|focus-visible|focus|checked|disabled)\)/g, "")
    .replace(/:hover|:active|:focus-visible|:focus|:checked|\[open\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 取某属性的声明值（第一条；无则 `null`）。 */
export function declarationValue(body: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
  return m ? m[1].trim() : null;
}

/** 从 `start` 起的**配对**花括号（返回 `{` 与配对 `}` 的下标；找不到 / 未闭合即抛）。 */
export function matchBrace(text: string, from: number): readonly [number, number] {
  const open = text.indexOf("{", from);
  if (open < 0) throw new Error("找不到块的起始 `{`");
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return [open, i];
    }
  }
  throw new Error("块未闭合");
}

/** 同 `matchBrace` 的旧名（判据侧一直在用；改名只为说清"配对"这件事）。 */
export const blockAt = matchBrace;

/** 扁平规则解析：`选择器 { 声明体 }`；`@` 开头的整块**按配对花括号整段跳过**（本层只有 `@media`）。
 *  ⚠️ 必须配对跳过而不是"跳到第一个 `}`" —— 否则 at-rule 之后残留的 `}` 会被并进下一条规则的选择器
 *  （T12 的仪器自证用例实测到的洞）。 */
export function parseRules(css: string): readonly Rule[] {
  const out: Rule[] = [];
  let at = 0;
  for (;;) {
    const open = css.indexOf("{", at);
    if (open < 0) break;
    const head = css.slice(at, open).replace(/\s+/g, " ").trim();
    const [, close] = matchBrace(css, open);
    if (!head.startsWith("@")) {
      const selectorText = head.replace(/^[}\s]+/, "");
      if (selectorText !== "") {
        for (const one of selectorText.split(",")) {
          const selector = one.trim();
          if (selector !== "") out.push({ selector, body: css.slice(open + 1, close) });
        }
      }
    }
    at = close + 1;
  }
  return out;
}

/** `motion.css` 的响应层节（原文切片后再剥注释 ⇒ 标记文本不会留在结果里）。 */
export const responseSection = (): string =>
  stripComments(sectionBetween(readPrimitiveCss("motion.css", false), RESPONSE_BEGIN, RESPONSE_END));

/** 响应层节的规则（逗号选择器已展开）。 */
export const responseRules = (): readonly Rule[] => parseRules(responseSection());

/** 声明了 `transition-*` 的响应层**落点**选择器（= 必须进 reduced-motion 名单的那些）。 */
export const responseTransitionSelectors = (): readonly string[] => [
  ...new Set(
    responseRules()
      .filter((r) => declaredProps(r.body).some((p) => p.startsWith("transition")))
      .map((r) => r.selector),
  ),
];

/** reduced-motion 块内的那条规则（逐选择器一条，声明体相同）。 */
export function reducedMotionRules(): readonly Rule[] {
  const css = readPrimitiveCss("motion.css");
  const at = css.indexOf(REDUCED_AT);
  if (at < 0) throw new Error("motion.css 里找不到 reduced-motion 块");
  const [open, close] = blockAt(css, at);
  const rules = parseRules(css.slice(open + 1, close));
  if (rules.length === 0) throw new Error("reduced-motion 块里一条规则都没有");
  return rules;
}

/** reduced-motion 名单（逐条选择器；`::after` 这类伪元素保持原文）。 */
export const reducedMotionSelectors = (): readonly string[] => reducedMotionRules().map((r) => r.selector);
