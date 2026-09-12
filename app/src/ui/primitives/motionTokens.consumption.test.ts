/**
 * @ai-context motionTokens.consumption.test.ts — 动效 token **消费点兜底**的常驻守卫（R13.2 = 把 T5 的
 *   V3 探针常驻化；先例 = `shell/navHeight.consumption.test.ts` 的「动态域 + 锚 + 双侧自证」形态）。
 *
 * Why：批 0-D 的临时 `:root{}`（`primitives/motion.css`）已随 T5 迁进唯一真源 `scripts/gen-tokens.mjs`，
 *   而「删块即生效」的**全部**依据是「每个消费点都写了**同值**兜底字面量」—— 未定义变量在 CSS 里
 *   **不报错**、只静默取不到值（属性被丢弃）⇒ 漏一个兜底 = 那一处的动效时长悄悄变成 0。
 *   判据**双向**：漏一个 = 兜底漂移（③）；多一个 = 死兜底（④，守着一个真源里已不存在的变量名）。
 * 口径（逐字照 T5 探针 `.…/tmp/t5/probe-motion-consumers.mjs` 与 `task-5-report.md` §七）：
 *   域 = `app/src/**` 递归的 `.ts`/`.tsx`/`.css`（**动态枚举** ⇒ 新文件自动进域；写死清单的话「漏了
 *   一个文件」会变成清单的错、而不是判据的错）；判据前**先剥注释**（注释里写 `var(--ed-…` 这类反例
 *   不该误伤 —— 「注释字面量骗过整文件扫描器」本批已 3 例）。
 * 副作用：只读磁盘（`app/src` 全树 + `ui/tokens.css`），不修改任何文件。
 * 边界：① 域含**测试文件**（T5 读数 54 处里 12 处在测试里）⇒ **本文件自身也必须在域内贡献 0 命中**
 *   （正则与消息里一律不写裸串，由 ① 的最后一条判据盯着）；② 只判 `--ed-dur-*` / `--ed-ease` 两族
 *   （`--ed-type-*` / `--ed-space-*` 各有自己的兜底判据，见 `style-seams.test.ts`）；③ 计数**不是**
 *   冻结常量（T12/T13 会新增消费点）⇒ 判「齐备 + 同值」，**不判**「恰好 54」。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DURATION_TOKENS, EASING_TOKENS } from "../../../scripts/gen-tokens.mjs";
import { MOTION_TOKENS } from "../tokens.gen";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
/** 域内必须有、且必须**真在消费**的锚文件（动态域的锚：改名 / 搬走必须被看见） */
const ANCHORS = ["ui/primitives/Toast.css", "ui/primitives/Button.css", "ui/primitives/Modal.css"] as const;
const SELF = "ui/primitives/motionTokens.consumption.test.ts";
/** 消费点：`var(--ed-dur-<name>` / `var(--ed-ease`（`\b` 收尾 ⇒ `--ed-ease-in` 这类新名不会误配） */
const CONSUMER = /var\(--ed-(?:dur-[a-z-]+|ease)\b/g;
/** 带逗号的消费（与 `CONSUMER` **独立**的形态计数：兜底换了写法也不会被解析器静默漏掉） */
const WITH_COMMA = /var\(--ed-(?:dur-[a-z-]+|ease)(?=\s*,)/g;
/** 真源 = **生成器导出**（不是产物）⇒「真源改值而兜底不改」必红（R13.2 的第三条变异体） */
const TRUTH = new Map<string, string>([
  ...DURATION_TOKENS.map((t) => [`--ed-dur-${t.name}`, `${t.ms}ms`] as const),
  ...EASING_TOKENS.map((t) => [`--ed-${t.name}`, t.value] as const),
]);
/** 产物侧的名册（`tokens.gen.ts`）：真源与产物必须同值（漂移由 `tokens.drift.test.ts` 兜底） */
const GENERATED = new Map<string, string>(MOTION_TOKENS.map((t) => [t.cssVar, t.value]));
/** 归一化比较（去掉所有空白）：`cubic-bezier(0.2, 0, 0, 1)` 的逗号后空白不算漂移 */
const norm = (s: string): string => s.replace(/\s+/g, "");

function sourceFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...sourceFiles(abs, `${prefix}${name}/`));
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(`${prefix}${name}`);
  }
  return out.sort();
}

/** 注释**就地掩码**（换行保留 ⇒ 行号与真实文件一致）：CSS 块注释 + TS 行注释（`://` 不算注释） */
function maskComments(text: string, isCss: boolean): string {
  const block = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return isCss ? block : block.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + " ".repeat(m.length - p1.length));
}

/** 从变量名之后取兜底原文：括号配对（缓动兜底自带括号）；无逗号 ⇒ `null`（= 没有兜底） */
function fallbackAfter(text: string, from: number): string | null {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (text[i] !== ",") return null;
  i += 1;
  const start = i;
  let depth = 0;
  for (; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  return text.slice(start, i).trim();
}

interface Hit {
  file: string;
  line: number;
  name: string;
  fallback: string | null;
}

function hitsIn(rel: string): Hit[] {
  const text = maskComments(readFileSync(join(SRC, rel), "utf8"), rel.endsWith(".css"));
  return [...text.matchAll(CONSUMER)].map((m) => {
    const at = m.index ?? 0;
    return {
      file: rel,
      line: text.slice(0, at).split("\n").length,
      name: m[0].replace(/^var\(/, ""),
      fallback: fallbackAfter(text, at + m[0].length),
    };
  });
}

const DOMAIN: readonly string[] = sourceFiles(SRC);
const HITS: readonly Hit[] = DOMAIN.flatMap(hitsIn);
const NO_FALLBACK = HITS.filter((h) => h.fallback === null);
const MISMATCH = HITS.filter((h) => h.fallback !== null && TRUTH.has(h.name) && norm(h.fallback) !== norm(TRUTH.get(h.name) ?? ""));
const DEAD = HITS.filter((h) => h.fallback !== null && !TRUTH.has(h.name));

describe("动效 token 消费点：兜底字面量必须等于生成器真源（R13.2 · T5 的 V3 常驻化）", () => {
  it("① 域与锚：域非空 · 锚文件在域内且真在消费 · 本文件自身贡献 0 命中", () => {
    expect(DOMAIN.length, "域为空 ⇒ 后面每条都会静默变成空真").toBeGreaterThan(100);
    const missing = ANCHORS.filter((a) => !DOMAIN.includes(a));
    expect(missing, `锚文件不在域内（改名 / 搬走了？）：\n${missing.join("\n")}`).toEqual([]);
    const lazy = ANCHORS.filter((a) => hitsIn(a).length === 0);
    expect(lazy, "锚清单里每一份都必须真的消费动效 token").toEqual([]);
    expect(DOMAIN, "本文件必须被域枚举到，否则最后一条是空真").toContain(SELF);
    expect(hitsIn(SELF), "本文件不得被自己的正则 / 消息里的字面量污染计数").toEqual([]);
  });

  it("② 兜底齐备：每个消费点都带兜底（漏一个 ⇒ 那一处静默失去时长）", () => {
    const bad = NO_FALLBACK.map((h) => `${h.file}:${h.line}  ${h.name}`);
    expect(HITS.length, "域内一处消费点都没有 ⇒ 本文件是空真").toBeGreaterThan(0);
    expect(bad, `这些消费点没有兜底字面量（临时块已删 ⇒ 变量未定义不报错、只失效）：\n${bad.join("\n")}`).toEqual([]);
  });

  it("③ 同值：兜底字面量 == 真源（真源改值而兜底不改 ⇒ 红）", () => {
    const bad = MISMATCH.map((h) => `${h.file}:${h.line}  ${h.name}: 兜底 "${h.fallback}" ≠ 真源 "${TRUTH.get(h.name)}"`);
    expect(bad, `兜底与生成器真源漂移：\n${bad.join("\n")}`).toEqual([]);
  });

  it("④ 无死兜底：兜底引用的变量名必须仍在真源名册里（多一个 = 守着已不存在的 token）", () => {
    const dead = DEAD.map((h) => `${h.file}:${h.line}  ${h.name}`);
    expect(dead, `这些兜底守着真源里不存在的 token 名：\n${dead.join("\n")}`).toEqual([]);
  });

  it("⑤ 解析完备 + 产物绑定：带逗号的消费全被解析出兜底；真源逐条落在 tokens.css / tokens.gen.ts", () => {
    const text = DOMAIN.map((rel) => maskComments(readFileSync(join(SRC, rel), "utf8"), rel.endsWith(".css"))).join("\n");
    const comma = [...text.matchAll(WITH_COMMA)].length;
    const parsed = HITS.filter((h) => h.fallback !== null).length;
    expect(comma, `有 ${comma} 处带兜底的消费，只解析出 ${parsed} 处 ⇒ 兜底换了形态（解析器会漏检）`).toBe(parsed);
    const css = readFileSync(join(SRC, "ui", "tokens.css"), "utf8");
    const absent = [...TRUTH].filter(([cssVar, value]) => !css.includes(`${cssVar}: ${value};`));
    expect(absent, `tokens.css 缺这些真源定值（产物未重生成？）：\n${absent.map(([k, v]) => `${k}: ${v};`).join("\n")}`).toEqual([]);
    const stale = [...TRUTH].filter(([cssVar, value]) => GENERATED.get(cssVar) !== value);
    expect(stale, `tokens.gen.ts 的名册与真源不同步：\n${stale.map(([k]) => k).join("\n")}`).toEqual([]);
  });

  it("⑥ 反空真：同域双侧自证（已知串命中 > 0 · 无意义串命中 0）", () => {
    const text = DOMAIN.map((rel) => maskComments(readFileSync(join(SRC, rel), "utf8"), rel.endsWith(".css"))).join("\n");
    expect([...text.matchAll(CONSUMER)].length, "域内 0 命中 ⇒ 是域选错了，不是判据绿").toBeGreaterThan(0);
    expect([...text.matchAll(/var\(--ed-zzz-not-a-token\b/g)].length, "无意义串也命中 ⇒ 这台仪器在乱报").toBe(0);
  });
});
