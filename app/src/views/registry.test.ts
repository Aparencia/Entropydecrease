// @vitest-environment node
/**
 * registry.test.ts — 视图注册表的**契约/键集**判据 G1 / G2 / G4 / G5 / G6（C1/C5 · T6）。
 *
 * @ai-context 为什么本文件被**拆成两件**（T6b 落地时的行数红线处置，控制方插播裁决 · 方案 1）：
 *   把「契约与键集」（本件）与「`load` 解析 + 适配器」（`registryResolution.test.ts`）分开。
 *   触发事实：本件若含 G3/G7/A1/A2 则为 **354 行** > 300，而本批硬约束是「新文件一律 ≤300、
 *   **不得新增豁免登记**」（301–600 必须进豁免表）⇒ 拆件是唯一不产生新登记、也不删判据的出路。
 *   **判据一条没少**：拆前 22 条 → 本件 13 条 + `registryResolution.test.ts` 9 条 = 22 条。
 *   **没有共用 helper 文件**：两件各自 import `./registry`（被测模块）即可，无需抽出共享件
 *   ⇒ 不产生「只为测试存在的 `views/**` 生产面文件」这个新问题。
 * @ai-context 口径：**期望值逐字写字符串字面量**，绝不拿被测模块的导出参与构造期望值（那是
 *   「自引用 = 永真断言」，本仓已实证）。冻结清单与图标名都独立写在断言里。
 * @ai-context 「每个 `icon` 是 `ICON_NAMES` 成员」为什么要独立成 G6：`IconName` 是**类型**，
 *   运行期可以塞进任何字符串（`as` / JS 调用点 / 手改字面量）⇒ 类型层由 `tsc` 兜、成员层由本件兜，
 *   两层互补；emoji 与裸串的反向对照写在同一 `describe` 里（阳性 + 阴性成对）。
 * 副作用：无（纯读导出 + 只读 `registry.ts` 源码做 emoji 反向对照）；不写盘、不发请求、不挂 DOM。
 * 边界：本件**不覆盖** `load` 的形态与目标（那是 `registryResolution.test.ts` 的 G3/G7）——
 *   「非默认视图真的不进首屏」由 T15 的图级判据 + T10/T18 的真实构建读数覆盖（三条口径互补）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "../ui/icons";
import type { ObjectType } from "./registry";
import { FROZEN_VIEW_KEYS, keysFor, viewsFor } from "./registry";

/** G1 的**独立**冻结清单（逐字字面量；顺序 = 计划给的 spec 顺序，`[0]` = 默认视图）。 */
const EXPECTED_KEYS: Readonly<Record<ObjectType, readonly string[]>> = {
  session: ["raw", "tritrack", "proof", "cardflow", "preview"],
  note: ["raw", "cardflow"],
};

const TYPES: readonly ObjectType[] = ["session", "note"];

/** G1 的判据本体（抽成函数 ⇒ 阴性样本走**同一条**代码路径，而不是复述一遍期望值）。 */
function keyDiff(actual: readonly string[], want: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(actual.length, want.length); i++) {
    const w: string | undefined = want[i];
    const g: string | undefined = actual[i];
    if (w !== g) out.push(`[${i}] ${w ?? "<缺>"} → ${g ?? "<缺>"}`);
  }
  return out;
}

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "registry.ts"), "utf8");

describe("G1 冻结表的三条不变式", () => {
  it("① keysFor / FROZEN_VIEW_KEYS / viewsFor 的键序都逐字等于冻结清单（长度 + 顺序 + 拼写）", () => {
    for (const t of TYPES) {
      expect(keyDiff(keysFor(t), EXPECTED_KEYS[t]), `${t}：可用视图键漂移`).toEqual([]);
      expect(keyDiff(FROZEN_VIEW_KEYS[t], EXPECTED_KEYS[t]), `${t}：冻结表被改宽/改窄`).toEqual([]);
      expect(keyDiff(viewsFor(t).map((s) => s.key), EXPECTED_KEYS[t]), `${t}：spec 顺序漂移`).toEqual([]);
    }
  });

  it("① 阴性样本：删项 / 多项 / 读空 各必红（走同一条判据）", () => {
    const dropped = EXPECTED_KEYS.session.filter((k) => k !== "cardflow");
    expect(keyDiff(dropped, EXPECTED_KEYS.session)).toEqual(["[3] cardflow → preview", "[4] preview → <缺>"]);
    expect(keyDiff([...EXPECTED_KEYS.note, "extra"], EXPECTED_KEYS.note)).toEqual(["[2] <缺> → extra"]);
    expect(keyDiff([], EXPECTED_KEYS.session)).toHaveLength(5);
  });

  it("② 计数不变式：FROZEN_VIEW_KEYS[t].length === viewsFor(t).length（FROZEN == Σentries 的同形）", () => {
    for (const t of TYPES) {
      expect(FROZEN_VIEW_KEYS[t].length, `${t}：冻结表与实现的条目数不一致`).toBe(viewsFor(t).length);
    }
  });

  it("③ 锚：默认视图在首位且键为 raw", () => {
    for (const t of TYPES) {
      expect(FROZEN_VIEW_KEYS[t][0]).toBe("raw");
      expect(viewsFor(t)[0].key).toBe("raw");
    }
  });
});

describe("G2 默认视图不带 load；其余每个都有（无 load 者恰 1 个）", () => {
  it("每个对象类型：无 load 的恰 1 个，且它就是 [0]（默认视图常驻、不经 React.lazy）", () => {
    for (const t of TYPES) {
      const noLoad = viewsFor(t).filter((s) => s.load === undefined);
      expect(noLoad.map((s) => s.key), `${t}：无 load 的 spec 必须恰为默认视图`).toEqual(["raw"]);
      expect(viewsFor(t)[0].load, `${t}：默认视图不得提供 load`).toBeUndefined();
    }
  });

  it("其余每个 spec 都有可调用的 load", () => {
    for (const t of TYPES) {
      const withLoad = viewsFor(t).filter((s) => s.load !== undefined);
      expect(withLoad.length).toBe(viewsFor(t).length - 1);
      for (const spec of withLoad) expect(typeof spec.load, `${spec.key} 的 load`).toBe("function");
    }
  });
});

describe("G4 appliesTo 与其被查询的类型一致", () => {
  it("viewsFor(t) 里每个 spec 的 appliesTo === t", () => {
    for (const t of TYPES) {
      expect(viewsFor(t).map((s) => s.appliesTo), `${t}：混入了别的对象类型的 spec`).toEqual(
        viewsFor(t).map(() => t),
      );
    }
  });

  it("会话独有视图不出现在笔记侧", () => {
    const sessionOnly = ["tritrack", "proof", "preview"];
    expect(keysFor("note").filter((k) => sessionOnly.includes(k))).toEqual([]);
  });
});

describe("G5 未知 objectType ⇒ []（不是抛、不是默认全集）", () => {
  it("viewsFor / keysFor 对未知类型都返回空表", () => {
    const unknown = "system" as ObjectType;
    expect(viewsFor(unknown)).toEqual([]);
    expect(keysFor(unknown)).toEqual([]);
    expect(viewsFor(unknown)).not.toHaveLength(viewsFor("session").length);
  });

  it("阴性样本：空表**不能**由「注册表读空」冒充（G3 已要求 load 解析出真实模块）", () => {
    expect(viewsFor("session").length).toBeGreaterThan(0);
    expect(viewsFor("note").length).toBeGreaterThan(0);
  });
});

describe("G6 每个 icon 都是图标注册表的成员（不是 emoji、不是裸字符串）", () => {
  it("所有 spec 的 icon ∈ ICON_NAMES，且形状是注册表命名（小写 + 连字符）", () => {
    for (const t of TYPES) {
      for (const spec of viewsFor(t)) {
        expect(ICON_NAMES, `${t}/${spec.key} 的 icon="${String(spec.icon)}" 不在图标注册表里`).toContain(spec.icon);
        expect(String(spec.icon)).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    }
  });

  it("仪器双侧自证：已知图标命中、emoji 与无意义串不命中", () => {
    expect(ICON_NAMES).toContain("sessions");
    expect(ICON_NAMES).not.toContain("🖼");
    expect(ICON_NAMES).not.toContain("no-such-icon");
    expect(ICON_NAMES.length).toBeGreaterThan(20);
    // 源码层反向对照：注册表里也不许出现 emoji（与行为层的 icon 断言互补）
    expect(SRC).not.toContain("🖼");
  });
});
