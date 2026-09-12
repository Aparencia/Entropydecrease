// @vitest-environment node
/**
 * @ai-context dialogMigration.a2.test.ts —— 批 4 T6「A 组 2」7 个手写弹层的**迁移收口判据**。
 *
 * Why 存在：这 7 个文件迁移前各自手写 `position:"fixed"; inset:0` 的遮罩 + 居中几何 + 自绘关闭钮
 * （B3 的 20 个 `role="dialog"` 里属于 A 组 2 的那 7 个）。迁移不是"改好看了"，而是把**四条可证伪
 * 的形态契约**换掉：① 唯一公共入口是 barrel（ADR-033 §1，深导入不带 `motion.css` ⇒ reduced-motion
 * 下照旧动 = 无障碍回归）② 不得再有自建遮罩 ③ 不得再有 `keydown` 监听（ESC 是 `Modal` 的独占职责，
 * ADR-033 §7）④ 不得再有裸数字 z-index（ADR-032 决策 5 的六档标尺）。
 *
 * 口径（四项，与 T5 同构；**全部先剥注释再判** —— 仓内多次被注释里的字面量误伤，正解先例
 * `app/src/shell/TopBar.test.tsx:34`）：
 *   ① `import { … } from "<相对>/ui/primitives"` 的名字表里含 `Modal`，且**没有**深导入
 *   ② 剥注释后不出现 `position: "fixed"` ∧ 同一份文本里的 `inset: 0`
 *   ③ 不出现 `addEventListener("keydown"` / `onkeydown=`
 *   ④ 不出现 `zIndex: <数字>` / `z-index: <数字>`
 * 外加**一条全局判据**与**一条 B2 例外登记完备性判据**（见下方两处注释）。
 *
 * 副作用：只读磁盘（7 个组件 + 全 `app/src` 递归）。不写任何文件。
 * 边界：这是**源码形态判据**，不是渲染判据 —— `role="dialog"` 由 `Modal` 在运行时产生，本文件
 *   只钉"调用点不再自建那一套"。渲染级覆盖在各自组件的既有测试里（7 个文件里 5 个有同名测试）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/** `app/src` —— 相对它写路径（与 `ui/zIndex.guard.test.ts` / `nativeButton.ratchet.test.ts` 同口径） */
const SRC = resolve(import.meta.dirname, "..", "..");

/** A 组 2 的 7 个文件（计划 Task 6 Files 逐字） */
const A2_FILES: readonly string[] = [
  "components/KnowledgeDecisionForm.tsx",
  "components/KnowledgeModelDialog.tsx",
  "components/ModelCardCreateDialog.tsx",
  "components/ModelCardFromNoteDialog.tsx",
  "components/NoteAiDialog.tsx",
  "components/RefineLaunchDialog.tsx",
  "components/TaskLaunchDialog.tsx",
];

/**
 * 剥注释（`//` 与块注释抹为等长空白，保行号）—— 与 `ui/primitives/nativeButton.ratchet.test.ts`
 * 的 `stripComments()` **同一状态机**（刻意重写一份而不是 import：那边的口径服务于它自己的棘轮）。
 */
function stripComments(src: string): string {
  const out = src.split("");
  const blank = (a: number, b: number): void => {
    for (let i = a; i < b; i++) if (out[i] !== "\n") out[i] = " ";
  };
  const isRegexStart = (k: number): boolean => {
    let j = k - 1;
    while (j >= 0 && /\s/.test(src.charAt(j))) j--;
    if (j < 0) return true;
    return "(,=:[!&|?{};+-*%~^<>".includes(src.charAt(j));
  };
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src.charAt(i);
    if (c === "/" && src.charAt(i + 1) === "/") {
      const end = src.indexOf("\n", i);
      blank(i, end < 0 ? n : end);
      i = end < 0 ? n : end;
      continue;
    }
    if (c === "/" && src.charAt(i + 1) === "*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end < 0 ? n : end + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src.charAt(j) !== c) {
        if (src.charAt(j) === "\\") j++;
        if (src.charAt(j) === "\n") break;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      while (j < n && src.charAt(j) !== "`") {
        if (src.charAt(j) === "\\") j++;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === "/" && isRegexStart(i)) {
      let j = i + 1;
      let cls = false;
      let ok = false;
      while (j < n) {
        const d = src.charAt(j);
        if (d === "\\") { j += 2; continue; }
        if (d === "\n") break;
        if (d === "[") cls = true;
        else if (d === "]") cls = false;
        else if (d === "/" && !cls) { ok = true; break; }
        j++;
      }
      if (ok) { blank(i + 1, j); i = j + 1; continue; }
    }
    i++;
  }
  return out.join("");
}

/** 该行里 `position:` 之后是否**跨行**配到 `fixed`（处理 `position:\n  "fixed"` 这种写法） */
function hasFixedPosition(lines: string[], index: number): boolean {
  const line = lines[index];
  const at = line.indexOf("position:");
  if (at < 0) return false;
  const rest = line.slice(at);
  if (/position:\s*["']fixed["']/.test(rest)) return true;
  const next = `${rest} ${lines[index + 1] ?? ""}`;
  return /position:\s*["']fixed["']/.test(next);
}

/** 一行里 `zIndex:` / `z-index:` 后跟数字（口径④；`zIndex: zIndex("modal")` 不匹配） */
const RE_BARE_Z = /z-index\s*:\s*-?\d|zIndex\s*:\s*-?\d/;

interface FileFacts {
  readonly rel: string;
  readonly lines: number;
  readonly barrelNames: readonly string[];
  readonly deepImports: readonly string[];
  readonly selfMask: readonly string[];
  readonly keydown: readonly string[];
  readonly bareZ: readonly string[];
}

/** 逐个受管文件量四项事实（返回定位信息：报错必须能点到位，否则无法定位） */
function factsOf(rel: string): FileFacts {
  const raw = readFileSync(join(SRC, rel), "utf8");
  const stripped = stripComments(raw);
  const lines = stripped.split("\n");
  const barrelNames: string[] = [];
  const deepImports: string[] = [];
  const selfMask: string[] = [];
  const keydown: string[] = [];
  const bareZ: string[] = [];

  const barrel = /import\s*\{([^}]*)\}\s*from\s*"(?:\.\.\/)+ui\/primitives"/.exec(stripped);
  if (barrel) for (const name of barrel[1].split(",")) barrelNames.push(name.trim());

  lines.forEach((line, index) => {
    const where = `${rel}:${index + 1}`;
    const deep = /from\s*"(?:\.\.\/)+ui\/primitives\/[A-Za-z]+"/.exec(line);
    if (deep) deepImports.push(`${where}  ${deep[0]}`);
    if (hasFixedPosition(lines, index) && /inset\s*:\s*0\b/.test(stripped)) selfMask.push(`${where}  ${line.trim()}`);
    if (/addEventListener\s*\(\s*["']keydown["']/.test(line) || /onkeydown\s*=/.test(line)) keydown.push(`${where}  ${line.trim()}`);
    if (RE_BARE_Z.test(line)) bareZ.push(`${where}  ${line.trim()}`);
  });

  return { rel, lines: raw.split(/\r?\n/).length, barrelNames, deepImports, selfMask, keydown, bareZ };
}

const FACTS: readonly FileFacts[] = A2_FILES.map(factsOf);

/** 递归收集 `app/src` 下所有 `.ts` / `.tsx`（含 `.css` 不进本文件的口径：z-index 归 T4 的守卫） */
function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** `ui/primitives/**` 与 `ui/icons/**` —— 原语层自身不受这四条调用点判据管辖 */
function isPrimitives(rel: string): boolean {
  return rel.startsWith(`ui${sep}primitives${sep}`) || rel.startsWith(`ui${sep}icons${sep}`);
}

/**
 * 读 `ui/zIndex.guard.test.ts` 的 `ZINDEX_ACCOUNTS` 条目文件列（B2 例外集的**真源**）。
 * 只取每条账的**首个** `file:` —— 条目里其余的 `file` 字样（如 `resolveFiles(entries)` 的形参）
 * 都不带引号，故 `file:\s*"…"` 这条正则在结构上不可能漏抓也不可能多抓条目。
 */
function zIndexAccountFiles(): string[] {
  const guard = readFileSync(join(SRC, "ui", "zIndex.guard.test.ts"), "utf8");
  const entries = guard.split("{").filter((block) => /file:\s*"[^"]+"/.test(block));
  return entries.map((block) => /file:\s*"([^"]+)"/.exec(block)![1]);
}

describe("A 组 2 · 7 个弹层的四条形态契约", () => {
  it("仪器自检：扫描到 7 个文件且每个都读得到（防路径写错静默假绿）", () => {
    expect(FACTS.map((f) => f.rel)).toEqual([...A2_FILES]);
    const suspicious = FACTS.filter((f) => f.lines < 60).map((f) => `${f.rel} 只有 ${f.lines} 行`);
    expect(suspicious, "文件太短 ⇒ 很可能读错了路径或读到空文件").toEqual([]);
    // 阴性样本：剥注释真的生效（合成样本里 `// position: "fixed"; inset: 0` 不得命中）
    const synthetic = stripComments(`// position: "fixed"; inset: 0; zIndex: 50\nconst keep = 1;\n`);
    expect(/position\s*:\s*["']fixed["']/.test(synthetic), "剥注释失效 ⇒ 下面四条判据全在测空气").toBe(false);
    const live = stripComments(`const z = () => <i style={{ position: "fixed", inset: 0 }} />;\n`);
    expect(/position\s*:\s*["']fixed["']/.test(live), "剥注释把真代码也剥掉了").toBe(true);
  });

  // 7 文件 × 4 判据 = 28 条**逐文件**用例：分开写而不是合成一条 `flatMap` 断言 —— 合成后
  // 「哪个文件犯了哪条」只能靠报错文本，且一条红会遮蔽其余判据；分开写让每条判据**各带自己的变异体**。
  for (const f of FACTS) {
    it(`① ${f.rel}：从 barrel 导入 Modal，无深导入`, () => {
      expect(f.barrelNames, `${f.rel} 的 barrel 名字表不含 Modal`).toContain("Modal");
      expect(f.deepImports, `${f.rel} 出现深导入（ADR-033 §1 禁止）`).toEqual([]);
    });

    it(`② ${f.rel}：无自建遮罩`, () => {
      expect(f.selfMask, `${f.rel} 仍在自建遮罩（position:"fixed" ∧ inset:0）`).toEqual([]);
    });

    it(`③ ${f.rel}：无 keydown 监听`, () => {
      expect(f.keydown, `${f.rel} 仍自建 keydown 监听（ESC 归 Modal）`).toEqual([]);
    });

    it(`④ ${f.rel}：无裸数字 z-index`, () => {
      expect(f.bareZ, `${f.rel} 仍有裸数字 z-index`).toEqual([]);
    });
  }
});

describe("跨文件判据（role=dialog 的唯一来源 + B2 例外登记完备）", () => {
  it("`role=\"dialog\"` 的源码命中只允许出现在 `ui/primitives/**` 与已登记的例外文件里", () => {
    const offenders: string[] = [];
    for (const file of collectFiles(SRC)) {
      const rel = relative(SRC, file);
      if (isPrimitives(rel)) continue;
      if (/role\s*=\s*["']dialog["']/.test(stripComments(readFileSync(file, "utf8")))) offenders.push(rel);
    }
    // 例外的**真源**是 `ui/zIndex.guard.test.ts` 的 `ZINDEX_ACCOUNTS`（B2 的 3 个采集/预览覆盖层）
    // —— 这里把它读出来当白名单，使本判据与那条守卫**同源**（硬编码会各漂各的）。
    const exceptionFiles = zIndexAccountFiles().map((rel) => rel.split("/").join(sep));
    // 仪器自证：白名单读空 ⇒ 下一条 `unexpected` 会把所有命中的非原语文件都报出来（形同没有白名单）
    expect(exceptionFiles.length, "例外集读不到（白名单形同虚设）").toBeGreaterThan(0);
    // T9 已落地：`shell/CommandPalette.tsx` 不再自建 `role="dialog"` ⇒ 原先那三行「在飞项」豁免按本文件
    // 原有的批注（「该行应随 T9 删除」）删除，判据恢复**严格形态**（白名单必须恰好吸收例外集）。
    const unexpected = offenders.filter((o) => !exceptionFiles.includes(o));
    expect(unexpected, `以下非原语文件自建了 role="dialog"：\n${unexpected.join("\n")}`).toEqual([]);
    // 白名单 ↔ 违规判据的对账：白名单必须**恰好**吸收掉 role 命中集里的例外文件
    // （少吸收一个 ⇒ 上一条会误红；多吸收一个 ⇒ 白名单在掩盖一次真实的越权）
    const roleInExceptions = exceptionFiles.filter((o) => offenders.includes(o));
    expect(offenders.length - roleInExceptions.length, "白名单与 role 命中集对不上账").toBe(0);
  });

  it("B2 例外集逐条从盘上再证（白名单不许掩盖「文件其实已不在 / 已改名」）", () => {
    const exceptionFiles = zIndexAccountFiles();
    const missing = exceptionFiles.filter((rel) => {
      try {
        readFileSync(join(SRC, ...rel.split("/")), "utf8");
        return false;
      } catch {
        return true;
      }
    });
    expect(missing, `例外注册表里有读不到的文件（白名单在掩盖一次改名/迁移）：\n${missing.join("\n")}`).toEqual([]);
    // 仪器自证：白名单的**读法**真的能区分「带 role=\"dialog\"」与「不带」——
    // 已知的 3 个 B2 覆盖层全是自绘非对话框浮层（0 命中），故必须另取一个已知为真的样本对照，
    // 否则本判据的 `0 命中` 与「仪器根本读不到这个串」不可区分（空真）。
    const probe = stripComments(`const x = <div role="dialog" />;`);
    expect(/role\s*=\s*["']dialog["']/.test(probe), "仪器对已知含 role=\"dialog\" 的样本报 0 ⇒ 本判据的空真未被排除").toBe(true);
    // 事实登记（不是下界断言）：3 个 B2 例外覆盖层当前**都不**声明 role="dialog"
    expect(exceptionFiles.length, "例外集读不到").toBeGreaterThan(0);
  });
});

