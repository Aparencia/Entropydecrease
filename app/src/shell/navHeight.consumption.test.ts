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
