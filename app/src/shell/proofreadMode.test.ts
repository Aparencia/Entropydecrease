/**
 * @ai-context proofreadMode.test.ts — 审校模式通道的**纯函数与静态判据**（node 环境，不写 jsdom 头）。
 *
 * Why node：本文件判的事实恰好与 jsdom 无关 —— ① 属性名与两态的**字面量冻结**；② 写读通道在**注入的
 *   假宿主**上的往返（含 `off` ⇒ **摘属性**）；③ 「无 `document` ⇒ 静默不动、不抛」这条**只能在真 node
 *   环境判**（jsdom 里 `document` 恒存在 ⇒ 那条降级路径不可达）；④ `App.tsx` 的第三条 keydown 与两个
 *   既有出口的源码形态；⑤ `main.tsx` 的 **import 源序**（CSS 覆盖块的生效纪律）；⑥ 「不得合并结案」的解耦。
 *   真 `<html>` 上的挂载 / 切换 / 卸载在 `proofreadMode.dom.test.tsx` —— 两侧互补，都不可删
 *   （先例 = `shellPhase.test.ts` + `shellPhase.dom.test.tsx`）。
 *
 * 副作用：只读磁盘（`App.tsx` / `main.tsx` / `App.tsx` 的兄弟文件）与临时改写 `globalThis.document`
 *   （逐条 `finally` 还原，照 `motion/intensity.test.ts` 的 `withDocument` 范式）。
 * 边界：① 宿主用**假元素**（只实现 setAttribute / getAttribute / removeAttribute / hasAttribute）；
 *   ② 🔴 **判不到解算后的墨度**（jsdom 与文本级仪器都不解析 `var()`）⇒ 本文件不写「已升到 ≥4.5:1」
 *   （真解算值归 T12–T15 的 CDP 读数）；③ 入口按钮归 T11 ⇒ 「三出口」里的**按钮出口本任务不存在**，
 *   下面只守「本层零原生 `<button>`」这条不冲突的形态。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { stripComments, walkSources, relOf } from "../ui/primitives/sliceScan";
import { PROOFREAD_MODE_ATTR, applyProofreadMode, readProofreadMode, useProofreadMode } from "./proofreadMode";
import type { ProofreadMode } from "./proofreadMode";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");
const read = (rel: string): string => readFileSync(join(SRC, ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

/** 假宿主：写入面 = 属性表（真 DOM 面在 jsdom 文件）。`removeAttribute` / `hasAttribute` 是 V1 的牙。 */
function fakeEl(): HTMLElement {
  const attrs = new Map<string, string>();
  return {
    setAttribute: (k: string, v: string): void => void attrs.set(k, v),
    getAttribute: (k: string): string | null => attrs.get(k) ?? null,
    removeAttribute: (k: string): void => void attrs.delete(k),
    hasAttribute: (k: string): boolean => attrs.has(k),
  } as unknown as HTMLElement;
}

/** 逐条注入假全局并还原（`Reflect.deleteProperty` 处理「本来就没有」的情形）。 */
function withDocument<T>(value: unknown, run: () => T): T {
  const had = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { value, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, "document", had);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

describe("① 属性名（逐字冻结）与消歧（控制方 §2 B2）", () => {
  it("属性名逐字 data-proofread-mode；且**不得**等于 data-proofread", () => {
    expect(PROOFREAD_MODE_ATTR).toBe("data-proofread-mode");
    expect(PROOFREAD_MODE_ATTR, "data-proofread 已被 LLM 文本校对占用（控制方 §2 B2）").not.toBe("data-proofread");
  });

  it("消歧正控：`proofread` 一名的既有占用面确实还在（本通道不占用它）", () => {
    // 域 = 入库的 `app/src` 生产文件（P-34 的入库域口径；测试文件不算占用面）
    const prod = walkSources(SRC)
      .map((abs) => relOf(SRC, abs))
      .filter((rel) => !/\.test\.tsx?$/.test(rel));
    const llmSide = prod.filter((rel) => /proofread/i.test(rel));
    expect(llmSide.length, "LLM 文本校对的占用面读空了 ⇒ 上面的消歧是无的放矢").toBeGreaterThanOrEqual(3);
    // 本通道的实现面里**不得**出现裸 `data-proofread`（除 `-mode` 后缀外）
    const mine = ["shell/proofreadMode.ts"];
    expect(mine.filter((rel) => /data-proofread(?!-mode)/.test(stripComments(read(rel))))).toEqual([]);
  });
});

describe("② 写通道：`on` 置属性 · `off` **摘属性**（规格 §4.3④「缺省不落属性」）", () => {
  it("退出后必须不落属性：`off` ⇒ hasAttribute === false（**不是**写成 \"off\"）", () => {
    const el = fakeEl();
    applyProofreadMode("on", el);
    expect(el.getAttribute("data-proofread-mode")).toBe("on");
    expect(el.hasAttribute("data-proofread-mode")).toBe(true);
    applyProofreadMode("off", el);
    expect(el.hasAttribute("data-proofread-mode"), "退出后必须不落属性（写成 \"off\" 会让缺省态与显式关不可分）").toBe(false);
    expect(el.getAttribute("data-proofread-mode")).toBeNull();
  });

  it("幂等：连写两次 `on` / 连写两次 `off` 的终态与写一次相同", () => {
    const el = fakeEl();
    applyProofreadMode("on", el);
    applyProofreadMode("on", el);
    expect(el.getAttribute("data-proofread-mode")).toBe("on");
    applyProofreadMode("off", el);
    applyProofreadMode("off", el);
    expect(el.hasAttribute("data-proofread-mode")).toBe(false);
  });

  it("不传元素 ⇒ 默认宿主是 document.documentElement（`<html>`）", () => {
    const el = fakeEl();
    withDocument({ documentElement: el }, () => applyProofreadMode("on"));
    expect(el.getAttribute("data-proofread-mode")).toBe("on");
  });

  it("无 document（真 node 环境）且不传元素 / 传 null ⇒ 静默不动，不抛", () => {
    expect(typeof document).toBe("undefined");
    expect(() => applyProofreadMode("on")).not.toThrow();
    expect(() => applyProofreadMode("off", null)).not.toThrow();
  });

  it("非法值 ⇒ **不动**既有属性（不是回退 off：静默不动优于替调用方猜一个值）", () => {
    const el = fakeEl();
    applyProofreadMode("on", el);
    applyProofreadMode("yes" as unknown as ProofreadMode, el);
    expect(el.getAttribute("data-proofread-mode"), "非法值把既有属性改掉了").toBe("on");
    applyProofreadMode("OFF" as unknown as ProofreadMode, el);
    expect(el.hasAttribute("data-proofread-mode"), "大小写不符的值被当成 off 摘了属性").toBe(true);
  });
});

describe("③ 读通道：缺失与垃圾值一律 null", () => {
  it("属性缺失 / 空串 / 旧版遗留值 / 大小写不符 ⇒ null；两个字面量 ⇒ 原样读回", () => {
    const el = fakeEl();
    expect(readProofreadMode(el)).toBeNull();
    for (const junk of ["", "true", "ON", "on ", "on;off", "mode"]) {
      el.setAttribute("data-proofread-mode", junk);
      expect(readProofreadMode(el), `垃圾值 ${JSON.stringify(junk)}`).toBeNull();
    }
    el.setAttribute("data-proofread-mode", "on");
    expect(readProofreadMode(el)).toBe("on");
    // `"off"` 也在名册内（守卫只认两个字面量），但**写入侧从不落它**（`off` ⇒ removeAttribute）
    // ⇒ 这个形态只可能来自外部手写 DOM；读回 `"off"` 与「未设置」在调用方等价（都 = 常态）。
    el.setAttribute("data-proofread-mode", "off");
    expect(readProofreadMode(el)).toBe("off");
  });

  it("无 document 且不传元素 ⇒ null，不抛；有宿主时读到的是**真属性**（不是内存副本）", () => {
    expect(typeof document).toBe("undefined");
    expect(readProofreadMode()).toBeNull();
    expect(() => readProofreadMode(null)).not.toThrow();
    const el = fakeEl();
    applyProofreadMode("on", el);
    expect(readProofreadMode(el)).toBe(el.getAttribute("data-proofread-mode"));
  });
});

describe("④ useProofreadMode 在 node 环境下可调用（SSR 不执行 effect ⇒ 只证「不抛」）", () => {
  it("renderToString 渲染一个调用本 hook 的探针组件 ⇒ 不抛，且 `<html>` 上什么都没写", () => {
    const Probe = (): string => {
      const [, toggle] = useProofreadMode();
      expect(typeof toggle).toBe("function");
      return "ok";
    };
    expect(typeof document).toBe("undefined");
    expect(renderToString(createElement(Probe))).toBe("ok");
  });
});

describe("⑤ App.tsx 的第三条 window 级 keydown（V1 的机器面；两条既有出口逐字未动）", () => {
  const APP = read("App.tsx");

  it("R 组合切换 + Esc 退出的两条分支都在，且 hook 被调用", () => {
    expect(APP, "本层没有接上模式位 hook").toContain("useProofreadMode()");
    expect(
      /e\.ctrlKey && e\.shiftKey && \(e\.key === "R" \|\| e\.key === "r"\)/.test(APP),
      "缺 ⌘/Ctrl+Shift+R 的判定分支",
    ).toBe(true);
    expect(/e\.key === "Escape" && proofread === "on"/.test(APP), "缺 Esc 退出分支（或没按模式位门控）").toBe(true);
  });

  it("既有两条 keydown 逐字未动（Ctrl+Shift+A / Ctrl+K），且 window 级 keydown 计数恰 3", () => {
    expect(/e\.ctrlKey && e\.shiftKey && \(e\.key === "A" \|\| e\.key === "a"\)/.test(APP), "Ctrl+Shift+A 被改了").toBe(true);
    expect(
      /e\.ctrlKey && !e\.shiftKey && !e\.altKey && \(e\.key === "k" \|\| e\.key === "K"\)/.test(APP),
      "Ctrl+K 被改了（CommandPalette.test.tsx:199 逐字读它）",
    ).toBe(true);
    expect([...APP.matchAll(/window\.addEventListener\("keydown"/g)].length, "本层的 keydown 监听数变了").toBe(3);
    expect([...APP.matchAll(/window\.removeEventListener\("keydown"/g)].length, "解绑数 ≠ 监听数").toBe(3);
  });

  it("本层零原生 `<button>`（按钮出口归 T11 的 TopBar，且必须走 Button 原语）", () => {
    expect(stripComments(APP), "App.tsx 出现原生 <button> ⇒ 撞 FROZEN_NATIVE_BUTTON_BY_FILE").not.toContain("<button");
  });
});

describe("⑥ 源码顺序（§C53.5 适用点②）：main.tsx 的覆盖 CSS 必须在 token CSS **之后**", () => {
  const main = read("main.tsx");
  const atTokens = main.indexOf('import "./ui/tokens.css";');
  const atProof = main.indexOf('import "./ui/proofread.css";');

  it("两条 import 都 ≥ 0（反空真）且 token < proofread", () => {
    expect(atTokens, "token CSS 的 import 锚读不到 ⇒ 下面的顺序断言会空真").toBeGreaterThanOrEqual(0);
    expect(atProof, "proofread.css 的 import 锚读不到（接线丢了？）").toBeGreaterThanOrEqual(0);
    expect(atTokens, "覆盖 CSS 排在 token CSS 之前（源序纪律破了）").toBeLessThan(atProof);
  });

  it("仪器自证：同一台读法对**颠倒顺序**的样本必须判否（否则上面那条恒真）", () => {
    const bogus = 'import "./ui/proofread.css";\nimport "./ui/tokens.css";\n';
    expect(bogus.indexOf('import "./ui/tokens.css";')).toBeGreaterThan(bogus.indexOf('import "./ui/proofread.css";'));
  });
});

describe("⑦ 不得合并结案（规格 §4.3⑦）：低置信墨度与审校模式位**互不推出**", () => {
  /** 生产文件（剥注释；测试文件不是实现面）。 */
  const prod = walkSources(SRC)
    .map((abs) => ({ rel: relOf(SRC, abs), text: stripComments(readFileSync(abs, "utf8")) }))
    .filter((f) => !/\.test\.tsx?$/.test(f.rel));

  it("两面各自活着，且**实现面不相交**（改一边不构成另一边的证据）", () => {
    const lowConfidence = prod.filter((f) => /\blowConfidenceClass\s*\(/.test(f.text)).map((f) => f.rel);
    const modeFace = prod.filter((f) => f.text.includes("PROOFREAD_MODE_ATTR")).map((f) => f.rel);
    // 反空真：两面都必须真的读到东西（否则「互相推不出」是两台空仪器在互相见证）
    expect(lowConfidence.length, "低置信墨度的调用点读法失效（C4.2 面）").toBeGreaterThanOrEqual(2);
    expect(modeFace, "模式位的实现面读法失效").toContain("shell/proofreadMode.ts");
    // 🔴 解耦断言：两件事的实现面**互不相交** —— 低置信墨度（§4.2 的四档墨度）与审校模式位（§4.3③）
    // 是两条独立的条件，任何一边的存在都**不得**被当成另一边已兑现的证据。
    expect(modeFace.filter((rel) => lowConfidence.includes(rel)), "模式位的实现面里出现低置信调用点 ⇒ 两条条件被合并结案").toEqual([]);
    expect(lowConfidence.filter((rel) => prod.find((f) => f.rel === rel)!.text.includes("data-proofread-mode")), "低置信面里出现模式位属性 ⇒ 两条条件被合并结案").toEqual([]);
  });
});
