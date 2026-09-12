// @vitest-environment node
/**
 * @ai-context **列键名冻结**（规格 §6.2 / ADR-034 §2「键名 = 既有持久化键」）—— 只许不改名。
 *
 * Why 单独立一条**字面量**判据：`useColumnLayout` 把 key 当作 `localStorage` 的持久化键
 *   （`layout:col-width:{key}` / `layout:col-fold:{key}`，`src/hooks/useColumnLayout.ts:43/53/87/88`）
 *   ⇒ **改一个 key = 所有用户已记住的列宽/折叠态静默丢失**，而既有判据**抓不到**：
 *   `columnRegistry.test.ts` ① 只判「13 行 · 键唯一 · 首尾键」—— 把 `notes-list` 改名成
 *   `notes-list-v2` 在那条判据下**照样绿**（批 3 计划 `:1621` 想写的「键集与持久化键同形」
 *   最终没有落库）⇒ T0 报告 §二 · G3 把它列为**风险最高的一条缺口**。
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
 *      T0 报告 §二 · G3 只点名了 ①）。
 *
 * 副作用：只读 `src/hooks/useColumnLayout.ts`（②），不修改任何文件。
 * 边界：本条**不**证明「这 13 个名字 = 历史持久化键」—— 那需要 `git show` 的树外一次性对拍
 *   （见 T0 报告 §二 · G3 与批 8/T18 的收口核对表）；本条是「从今往后不许再漂」的棘轮。
 *   也不判宽度/阈值（那住 `columnRegistry.test.ts` ②③④）。跑在 vitest 全局 `node` 环境。
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

/** ② 的捕获器：`` `layout:<名字>:${key}` `` 形态的模板字面量（读 2 处 + 写 2 处共用同一前缀）。 */
const KEY_TEMPLATE = /`layout:([A-Za-z0-9_-]+):\$\{key\}`/g;

/** ② 的判据本体：源码里用到的持久化键前缀集合（排序后比对；数出现次数会绑死实现形态）。 */
function keyPrefixes(src: string): string[] {
  return [...new Set([...src.matchAll(KEY_TEMPLATE)].map((m) => m[1]))].sort();
}

const HOOK_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "useColumnLayout.ts");
const HOOK_SRC = readFileSync(HOOK_PATH, "utf8");

describe("列键名冻结（改名 = 用户列宽静默丢失）", () => {
  it("① 13 个键逐字等于冻结清单（长度 + 顺序 + 拼写）", () => {
    expect(FROZEN_KEYS, "冻结清单自身被改过（13 行 = 规格 §6.2 的 13 行）").toHaveLength(13);
    expect(keyDiff(COLUMN_KEYS), "列键名漂移 ⇒ 用户已记住的列宽会静默丢失").toEqual([]);
  });

  it("① 阴性样本：改名 / 重排 / 读不到注册表 各必红（走同一条判据）", () => {
    const renamed = COLUMN_KEYS.map((k) => (k === "notes-list" ? "notes-list-v2" : k));
    expect(keyDiff(renamed)).toEqual(["[4] notes-list → notes-list-v2"]);

    const swapped = [...COLUMN_KEYS.slice(0, 4), COLUMN_KEYS[5], COLUMN_KEYS[4], ...COLUMN_KEYS.slice(6)];
    expect(keyDiff(swapped)).toEqual(["[4] notes-list → notes-outline", "[5] notes-outline → notes-list"]);

    // 0 命中（注册表读空/路径写错）时必须全红，不能是空转判据
    expect(keyDiff([])).toHaveLength(13);
  });

  it("② 持久化键前缀仍是 layout:col-width: / layout:col-fold:", () => {
    expect(keyPrefixes(HOOK_SRC), "持久化键前缀漂移 ⇒ 13 个键一起失效（用户列宽静默丢失）").toEqual([
      "col-fold",
      "col-width",
    ]);
    // 阴性样本：前缀改一个字符 ⇒ 同一函数立刻报出漂移
    expect(keyPrefixes("window.localStorage.getItem(`layout:col-w:${key}`)")).toEqual(["col-w"]);
    // 阳性对照：真实源码确实读到了（防路径写错 ⇒ 空集合假绿）
    expect(HOOK_SRC).toContain("useColumnLayout(");
  });
});
