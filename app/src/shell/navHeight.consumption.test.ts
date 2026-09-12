/**
 * @ai-context 壳层纵向基准的**棘轮守卫**（规格 §1 决策 16 / §10 批 3 行「7 处魔数归零」第 1 处）。
 *
 * Why 用测试而不是脚本：本仓 `scripts/*.mjs` 不在 `line-limits` 扫描域（批 2 follow-up #16），
 *   而 `app/src/**` 在 ⇒ 把守卫放进扫描域内，它自己也被 300 行红线看着。
 *
 * Why 只扫壳层相关文件而不是全树：全树 `height: 56` 还有无关命中（如 `ReviewPage.tsx:204` 的
 *   `padding: "56px 0"`）。本守卫的**扫描域是一份显式清单**（下方 SHELL_FILES），
 *   这样「漏了一个文件」是**清单的错**、不是正则的错 —— 口径可读、可评审。
 *
 * 口径：命中 = `height: 56` / `top: 56` / `100vh - 56px`（数字两边允许空白）。
 *   `var(--ed-nav-h)` 与 `calc(100vh - var(--ed-nav-h))` **不匹配**、不被误伤。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");

/** 壳层纵向基准**必须**经由变量的文件（相对 `app/src`，正斜杠） */
const SHELL_FILES = [
  "App.tsx",
  "components/AiConversationDock.tsx",
  "pages/ActionPage.tsx",
  "pages/ClassroomPage.tsx",
  "pages/KnowledgePage.tsx",
  "pages/NotesPage.tsx",
  "pages/ReviewPage.tsx",
  "pages/SessionsPage.tsx",
  "pages/SettingsPage.tsx",
] as const;

/** 三种消费形态的**旧写法**（命中即违规） */
const FORBIDDEN = [/height:\s*56\b/, /top:\s*56\b/, /100vh\s*-\s*56px/];
/** 新写法的正样本（守卫必须能认出来） */
const REQUIRED = /--ed-nav-h/;

function lines(rel: string): [number, string][] {
  return readFileSync(join(SRC, rel), "utf8")
    .split(/\r?\n/)
    .map((l, i) => [i + 1, l] as [number, string]);
}

describe("壳层纵向基准 --ed-nav-h", () => {
  it("壳层文件里不得再出现裸 56（height / top / calc）", () => {
    const hits: string[] = [];
    for (const rel of SHELL_FILES) {
      for (const [n, l] of lines(rel)) if (FORBIDDEN.some((re) => re.test(l))) hits.push(`${rel}:${n}  ${l.trim()}`);
    }
    expect(hits, `这些行仍硬编码 56（请改用 var(--ed-nav-h)）：\n${hits.join("\n")}`).toEqual([]);
  });

  it("每个壳层文件都**确实**消费了变量（防止用删代码的方式让上一条变绿）", () => {
    const missing = SHELL_FILES.filter((rel) => !lines(rel).some(([, l]) => REQUIRED.test(l)));
    expect(missing, `这些文件没有消费 --ed-nav-h（删掉旧写法不等于接上了变量）：\n${missing.join("\n")}`).toEqual([]);
  });

  it("扫描域自检：清单里的文件都真的存在且非空", () => {
    const empty = SHELL_FILES.filter((rel) => lines(rel).length < 10);
    expect(empty, `清单里的文件读不到或过短（路径写错了？）：\n${empty.join("\n")}`).toEqual([]);
  });
});

/* ── T17 / C10#13 追加段：兜底绑定（**纯追加**：既有 3 个 it 与既有 import 一行未动）──────────────
 * 病灶（批 4 交接项 #13）：上面那份显式清单**不含任何 CSS**，而 `ui/primitives/Toast.css:60` 用
 *   `top: calc(var(--ed-nav-h, 56px) + 8px)` —— **兜底 56px 没有任何判据绑到 token 真源**
 *   （`ui/tokens.css:73` 的 `--ed-nav-h: 56px`）；该文件 :56 的注释自己承认这条洞：
 *   「兜底 56px 与 `TopBar.css` 的 `var(--ed-nav-h, 56px)` 同值（两处兜底漂移不会有任何报错）」。
 *
 * 三条判据各自独立成 it（陷阱 #67：一个 it 里多条硬断言只有第一条拿得到"有没有牙"的读数）：
 *   ① 域与锚：域非空 · 两份已知消费者在域内 · 域内确有 `--ed-nav-h` 消费 · 域内无 FORBIDDEN 裸 56；
 *   ② 绑定：域内每个 `var(--ed-nav-h, <N>px)` 的 N **等于**真源 M，且"带逗号的消费"全被解析器认下；
 *   ③ 反空真：域内命中 > 0 且**无意义串命中 0**（同域双侧自证 —— 仪器纪律第 1 条）。
 *
 * 🔴 域 = `app/src` 下**递归**的全部 `*.css`（动态枚举，今日 14 个）—— **比计划逐字给的
 *   `ui/primitives/*.css` 大**：计划引用的洞正是"**两处**兜底漂移"，只扫原语层会漏掉
 *   `shell/TopBar.css` 那一份。代价 = 邻居新增 CSS 若漂移会红（那是**真发现**，不是假红）；
 *   不动既有 3 个 it 的语义（计划逐字要求）。
 * ⚠️ 本段注释里**不许**出现 `**` 紧跟 `/` 的 glob 字面量：`*` + `/` 会**提前终止块注释**
 *   （实测 esbuild 报 `Unexpected "*"`）—— 同类"文本级仪器被字面量骗到"的 #54/#64 家族。
 * 残留（登记）：`.tsx` 的**行内 style 兜底**不在本判据域内（口径与读数见 `task-17-report.md`）。
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
import { readdirSync, statSync } from "node:fs"; // 独立成行：既有那行 import 保持逐字原样（计划 V2：删除行 = 0）

/** 域内**必须**出现的两份已知兜底消费者（动态域的锚：改名/搬走必须被看见） */
const FALLBACK_ANCHORS = ["ui/primitives/Toast.css", "shell/TopBar.css"] as const;
/** `var(--ed-nav-h, <N>px)`：逗号与数字两边允许空白（与上面 FORBIDDEN/REQUIRED 的宽松口径一致） */
const FALLBACK_PX = /var\(\s*--ed-nav-h\s*,\s*(\d+)px\s*\)/g;
/** 任何"带兜底的消费"（**不看兜底形态**）——抓「兜底写成非 `<N>px` ⇒ 被 FALLBACK_PX 静默漏掉」 */
const FALLBACK_ANY = /var\(\s*--ed-nav-h\s*,/g;
/** token 真源：`ui/tokens.css` 的 `--ed-nav-h: <M>px` */
const TOKEN_DECL = /--ed-nav-h\s*:\s*(\d+)px/;

/** `app/src` 下全部 `*.css`（相对 `app/src` 的正斜杠路径，排序稳定 ⇒ 失败信息可比对） */
function cssFilesUnder(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    // ⚠️ 本仓 `src/node-builtins.d.ts` 只声明了单参 `readdirSync(path)` ⇒ `{ withFileTypes: true }`
    //    在 tsc 下报 TS2554/TS2339（`columnRegistry.test.ts:43` 已记同一缺口）。零新增依赖 ⇒ 走 statSync。
    if (statSync(abs).isDirectory()) out.push(...cssFilesUnder(abs, `${prefix}${name}/`));
    else if (name.endsWith(".css")) out.push(`${prefix}${name}`);
  }
  return out.sort();
}

/**
 * CSS 注释**就地掩码**（非换行字符替换成空格 ⇒ 行号不错位）。
 * Why 必须剥：`Toast.css:56` 的**注释**里逐字写着 `var(--ed-nav-h, 56px)`（它正是本判据要解释的那段
 *   说明）—— 不剥就是「注释里的字面量骗过扫描器」（陷阱 #54/#64 家族，本批已三犯），
 *   后果是**改注释措辞会假红**（T8 已裁：判据不许对措辞过敏）。既有 3 个 it 仍用未剥的 `lines()`（V2）。
 */
const maskCssComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** 域内文件逐行：`{ n: 行号, code: 去注释行（判据用）, raw: 原始行（失败信息用）}` */
function cssLines(rel: string): { n: number; code: string; raw: string }[] {
  const text = readFileSync(join(SRC, rel), "utf8");
  const raw = text.split(/\r?\n/);
  return maskCssComments(text)
    .split(/\r?\n/)
    .map((code, i) => ({ n: i + 1, code, raw: raw[i] ?? "" }));
}

const CSS_DOMAIN = cssFilesUnder(SRC);
/** 域正文（去注释后的代码面；用本文件既有的读盘口径，不另起一套路径解析） */
const cssDomainText = (): string => CSS_DOMAIN.map((rel) => cssLines(rel).map((r) => r.code).join("\n")).join("\n");

describe("兜底绑定（T17 / C10#13）：var(--ed-nav-h, <N>px) 的 N 必须等于 token 真源", () => {
  it("① 域与锚：域非空 · 两份已知消费者在域内 · 域内确有消费 · 域内无裸 56", () => {
    expect(CSS_DOMAIN.length, "域为空 ⇒ ②③ 会静默变成空真").toBeGreaterThan(0);
    const missing = FALLBACK_ANCHORS.filter((a) => !CSS_DOMAIN.includes(a));
    expect(missing, `已知的兜底消费者不在域内（改名/搬走了？）：\n${missing.join("\n")}`).toEqual([]);
    const consuming = FALLBACK_ANCHORS.filter((a) => cssLines(a).some((r) => REQUIRED.test(r.code)));
    expect(consuming, "锚清单里每一份都必须真的消费 --ed-nav-h（少一份 ⇒「两处兜底漂移」里的那一处就没了判据）").toEqual([...FALLBACK_ANCHORS]);
    const bare: string[] = [];
    for (const rel of CSS_DOMAIN) for (const r of cssLines(rel)) if (FORBIDDEN.some((re) => re.test(r.code))) bare.push(`${rel}:${r.n}  ${r.raw.trim()}`);
    expect(bare, `CSS 里仍硬编码 56（请改用 var(--ed-nav-h)）：\n${bare.join("\n")}`).toEqual([]);
  });

  it("② 绑定：每个兜底 <N> == tokens.css 的 <M>，且带逗号的消费全部被解析（形态漂移也红）", () => {
    const decl = readFileSync(join(SRC, "ui/tokens.css"), "utf8").match(TOKEN_DECL);
    expect(decl, "tokens.css 里读不到 `--ed-nav-h: <M>px` ⇒ 真源不可读，本条不该静默通过").not.toBeNull();
    const truth = Number(decl?.[1]);
    const bad: string[] = [];
    for (const rel of CSS_DOMAIN) {
      for (const r of cssLines(rel)) {
        for (const hit of r.code.matchAll(FALLBACK_PX)) if (Number(hit[1]) !== truth) bad.push(`${rel}:${r.n}  兜底 ${hit[1]}px ≠ 真源 ${truth}px  ${r.raw.trim()}`);
      }
    }
    expect(bad, `兜底与 token 真源漂移（「两处兜底漂移不会有任何报错」—— 本条就是那个报错）：\n${bad.join("\n")}`).toEqual([]);
    const text = cssDomainText();
    const any = [...text.matchAll(FALLBACK_ANY)].length;
    const parsed = [...text.matchAll(FALLBACK_PX)].length;
    expect(parsed, "域内一处兜底都解析不到 ⇒ 本条是空真（真源读到了，判据却没在判）—— 确实要删兜底请连本条一起改").toBeGreaterThan(0);
    expect(parsed, `有 ${any} 处带兜底的消费，却只解析出 ${parsed} 处 <N>px ⇒ 兜底换了形态（判据会漏检）`).toBe(any);
  });

  it("③ 反空真：域内命中 > 0 · 无意义串命中 0（同域双侧自证）", () => {
    const text = cssDomainText();
    expect([...text.matchAll(/--ed-nav-h/g)].length, "域内 0 命中 ⇒ 是域选错了，不是判据绿").toBeGreaterThan(0);
    expect([...text.matchAll(/zzz-not-a-token-zzz/g)].length, "无意义串也命中 ⇒ 这台仪器在乱报").toBe(0);
  });
});
