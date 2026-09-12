// @vitest-environment node
/**
 * @ai-context **列键名冻结**（规格 §6.2 / ADR-034 §2「键名 = 既有持久化键」）—— 只许不改名。
 *
 * Why 单独立一条**字面量**判据：`useColumnLayout` 把 key 当作 `localStorage` 的持久化键
 *   （`layout:col-width:{key}` / `layout:col-fold:{key}`，`src/hooks/useColumnLayout.ts:43/53/87/88`）
 *   ⇒ **改一个 key = 所有用户已记住的列宽/折叠态静默丢失**，而既有判据里**不看键名的那一条**
 *   （`columnRegistry.test.ts` ① `:121-126`：只判「13 行 · 键唯一 · 首尾键」）**抓不到** ——
 *   把 `notes-list` 改名成 `notes-list-v2` 在 `①` 下**照样绿**（该文件另两处 `④` 会红：
 *   `:157` 的 `columnSpec("notes-list")` 与 `:163+` 的「行 ↔ 档位映射」）⇒ 本条的**真实增量**
 *   是「冻结清单 + 顺序 + ② 前缀」，**不是**补上完全无人看守的空档（批 3 计划 `:1621` 想写的
 *   「键集与持久化键同形」最终没有落库）⇒ T0 报告 §二 · G3 仍把它列为**风险最高的一条缺口**。
 *
 * ★ 期望值**逐字写字符串字面量**，**不许**用 `COLUMN_KEYS` / `columnSpec(...)` / 任何被测模块的
 *   导出参与构造 —— 本批已实证「自引用 = 永真断言」（期望值与被测值同源 ⇒ 两边一起改照样绿）。
 *   `COLUMN_KEYS` 只出现在**被测的一侧**（`keyDiff(COLUMN_KEYS)`）。
 *
 * 口径两条（各自独立可红）：
 *   ① `FROZEN_KEYS` 与 `COLUMN_KEYS` **按下标逐字相等**（长度 + 顺序 + 拼写；顺序 = 规格表行序，
 *      重排会让 `COLUMN_SPECS` 的行序漂移）；
 *   ② 持久化键的**前缀**仍是 `layout:col-width:` / `layout:col-fold:` —— 前缀与键名是同一个
 *      `localStorage` 键的两半，改任一半都让用户的列宽静默丢失（② 是本次为闭合该机制所加，
 *      T0 报告 §二 · G3 只点名了 ①）。判据口径 = **代码里**出现过该前缀的**连续字面量**
 *      （**不绑书写形态**：模板字面量 / `"…" + key` 拼接 / 具名常量前缀都认；**注释里的不算数**）。
 *
 * 副作用：只读 `src/hooks/useColumnLayout.ts`（②），不修改任何文件。
 * 边界：本条**不**证明「这 13 个名字 = 历史持久化键」—— 那需要 `git show` 的树外一次性对拍
 *   （见 T0 报告 §二 · G3 与批 8/T18 的收口核对表）；本条是「从今往后不许再漂」的棘轮。
 *   也不判宽度/阈值（那住 `columnRegistry.test.ts` ②③④）。跑在 vitest 全局 `node` 环境。
 *   ② 的口径边界（**刻意 fail-closed**）：前缀若被拆成两段拼接、或搬到**别的文件**，② 会红 ——
 *   那是「本文件里找不到该前缀」，请连同本判据一起改，**不要**放宽成裸子串 grep
 *   （批 1 的 6 例子串误判即由此而来）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLUMN_KEYS } from "./columnRegistry";

/** 冻结清单 = 规格 §6.2 的 13 行键名（**逐字字面量**，顺序 = 规格表行序）。 */
const FROZEN_KEYS: readonly string[] = [
  "classroom-left",
  "classroom-right",
  "sessions-list",
  "notes-groups",
  "notes-list",
  "notes-outline",
  "action-main",
  "review-main",
  "chat-sidebar",
  "knowledge-left",
  "knowledge-detail",
  "goals-left",
  "settings-main",
];

/** ① 的判据本体（抽成函数 ⇒ 阴性样本走**同一条**代码路径，而不是复述一遍期望值）。 */
function keyDiff(actual: readonly string[]): string[] {
  const out: string[] = [];
  const n = Math.max(actual.length, FROZEN_KEYS.length);
  for (let i = 0; i < n; i++) {
    const want: string | undefined = FROZEN_KEYS[i];
    const got: string | undefined = actual[i];
    if (want !== got) out.push(`[${i}] ${want ?? "<缺>"} → ${got ?? "<缺>"}`);
  }
  return out;
}

/** ② 的捕获器：**代码里**出现过的持久化键前缀（`layout:<名字>:`）。
 *  口径 = 「前缀以**连续字面量**出现在本文件的代码里」，**不绑书写形态**：模板字面量
 *  `` `layout:col-width:${key}` `` · 拼接 `"layout:col-width:" + key` · 具名常量前缀
 *  `const P = "layout:col-width:"` 都认（原先只认第一种 ⇒ 行为等价的重构会假红）。
 *  边界见文件头「② 的口径边界」。 */
const KEY_PREFIX = /layout:([A-Za-z0-9_-]+):/g;

/** 剥行注释 / 块注释（字符串与模板字面量内部原样保留）。
 *  Why：注释里留着旧前缀不能算数 —— 前缀真从代码里搬走时，注释会把 ② 拖成假绿。 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, Math.min(j + 1, src.length));
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** ② 的判据本体：源码里用到的持久化键前缀集合（**先剥注释**；排序后比对，数出现次数会绑死实现形态）。 */
function keyPrefixes(src: string): string[] {
  return [...new Set([...stripComments(src).matchAll(KEY_PREFIX)].map((m) => m[1]))].sort();
}

const HOOK_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "useColumnLayout.ts");
const HOOK_SRC = readFileSync(HOOK_PATH, "utf8");

describe("列键名冻结（改名 = 用户列宽静默丢失）", () => {
  it("① 13 个键逐字等于冻结清单（长度 + 顺序 + 拼写）", () => {
    expect(FROZEN_KEYS, "冻结清单自身被改过（13 行 = 规格 §6.2 的 13 行）").toHaveLength(13);
    expect(keyDiff(COLUMN_KEYS), "列键名漂移 ⇒ 用户已记住的列宽会静默丢失").toEqual([]);
  });

  it("① 阴性样本：改名 / 重排 / 读不到注册表 各必红（走同一条判据）", () => {
    // 样本取自**冻结清单**而不是被测模块：注册表坏掉时样本仍成立 ⇒ 红的必然只有正式断言
    // （若样本取自 `COLUMN_KEYS`，改名变异会让这条「阴性样本」用例跟着一起红，归因变浑）。
    const renamed = FROZEN_KEYS.map((k) => (k === "notes-list" ? "notes-list-v2" : k));
    expect(keyDiff(renamed)).toEqual(["[4] notes-list → notes-list-v2"]);

    const swapped = [...FROZEN_KEYS.slice(0, 4), FROZEN_KEYS[5], FROZEN_KEYS[4], ...FROZEN_KEYS.slice(6)];
    expect(keyDiff(swapped)).toEqual(["[4] notes-list → notes-outline", "[5] notes-outline → notes-list"]);

    // 0 命中（注册表读空/路径写错）时必须全红，不能是空转判据
    expect(keyDiff([])).toHaveLength(13);
  });

  it("② 持久化键前缀仍是 layout:col-width: / layout:col-fold:", () => {
    expect(keyPrefixes(HOOK_SRC), "持久化键前缀漂移 ⇒ 13 个键一起失效（用户列宽静默丢失）").toEqual([
      "col-fold",
      "col-width",
    ]);
    // 阴性样本（三种书写形态各一）：任一处前缀改一个字符 ⇒ 同一函数立刻报出漂移
    expect(keyPrefixes("window.localStorage.getItem(`layout:col-w:${key}`)")).toEqual(["col-w"]);
    expect(keyPrefixes('window.localStorage.setItem("layout:col-w:" + key, v)')).toEqual(["col-w"]);
    expect(keyPrefixes('const P = "layout:col-w:";')).toEqual(["col-w"]);
    // 仪器自检：**注释里的旧前缀不算数**（否则前缀从代码里搬走时，注释会把 ② 拖成假绿）
    expect(keyPrefixes('// 旧写法 `layout:col-width:${key}`\nconst P = "layout:col-w:";')).toEqual(["col-w"]);
    // 阳性对照：真实源码确实读到了（防路径写错 ⇒ 空集合假绿）
    expect(HOOK_SRC).toContain("useColumnLayout(");
  });
});
