/**
 * @ai-context intensity.test.ts — 三档强度通道的**行为判据**（node 环境，不加 jsdom 指令注释）。
 *
 * Why 用 node 而不是 jsdom：本文件要判的两条事实**恰好与 jsdom 无关** —— ① 「真环境里没有
 *   `window.matchMedia` 时不抛」（实测 jsdom 30.0.1 没有它，而 T10 会给 jsdom 补桩 ⇒ 用 jsdom 判
 *   就变成"判桩的默认值"，桩一改用例就红）；② 三档的值语义与持久化键是纯函数契约（照
 *   `views/useViewMemory.ts` 的范式：注入 `Storage` ⇒ 内存桩即可）。故本文件用**假全局**
 *   （`window` / `document` / `localStorage`）逐条注入、逐条 `finally` 还原，不依赖 jsdom 也不污染
 *   别的文件。
 * 口径：`useMotionIntensity` 用 `react-dom/server` 的 `renderToString` 真跑 hook（node 下唯一入口）。
 *   ⚠️ 服务端**不执行** `useEffect` ⇒ 「挂载即把档位落到 `<html>`」这条由 T7 的 jsdom 组件判据承担
 *   （T7 V2 断 `documentElement.dataset.motion`）；本文件判的是**初值**与 `select` 通道。
 * 副作用：临时改写 `globalThis` 上的 `window` / `document` / `localStorage`（逐条还原）。
 * 边界：`el.dataset.motion` 用**假元素**判写入路径；真实 `<html>` 的同一断言见 T7。
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MOTION_INTENSITIES,
  MOTION_INTENSITY_KEY,
  applyIntensity,
  defaultIntensity,
  readIntensity,
  useMotionIntensity,
  writeIntensity,
} from "./intensity";
import type { MotionIntensity } from "./intensity";

/** 逐条注入假全局并还原（`Reflect.deleteProperty` 处理"本来没有"的情形）。 */
function withGlobal<T>(key: "window" | "document" | "localStorage", value: unknown, run: () => T): T {
  const had = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, key, had);
    else Reflect.deleteProperty(globalThis, key);
  }
}

/** 记录型 `Storage`；`"throw"` ⇒ 每次访问都抛（隐私模式 / 配额拒绝的真实形态）。 */
function fakeStorage(kind: "memory" | "throw" = "memory", seed?: string): Storage {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(MOTION_INTENSITY_KEY, seed);
  const denied = (): never => {
    throw new Error("storage denied");
  };
  return {
    get length(): number {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (kind === "throw" ? denied() : (map.get(k) ?? null)),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => (kind === "throw" ? denied() : void map.set(k, v)),
  };
}

/** 假元素 / 假 document：只带判据要用的那一层（`applyIntensity` 的唯一写入面 = `dataset.motion`）。 */
const fakeEl = (): HTMLElement => ({ dataset: {} } as unknown as HTMLElement);
const fakeDocument = (el: HTMLElement): Document => ({ documentElement: el } as unknown as Document);

/** 真跑一次 hook（`renderToString`），取回当前档与 `select`。 */
function renderProbe(): { value: MotionIntensity; select: (v: MotionIntensity) => void } {
  let seen: MotionIntensity | null = null;
  let select: ((v: MotionIntensity) => void) | null = null;
  const Probe = (): string => {
    const [value, setValue] = useMotionIntensity();
    seen = value;
    select = setValue;
    return value;
  };
  const html = renderToString(createElement(Probe));
  if (seen === null || select === null) throw new Error(`hook 没跑起来（渲染出的 html="${html}"）`);
  return { value: seen, select };
}

describe("初值跟随系统（§8.5 逐字：reduce ⇒ eco，否则 standard）", () => {
  it("defaultIntensity：reduce ⇒ eco；非 reduce / 无 mql ⇒ standard", () => {
    expect(defaultIntensity({ matches: true })).toBe("eco");
    expect(defaultIntensity({ matches: false })).toBe("standard");
    expect(defaultIntensity(null)).toBe("standard");
    expect(defaultIntensity(undefined)).toBe("standard");
  });

  it("hook 初值：真 node 环境没有 window（也没有 matchMedia）⇒ standard，且不抛", () => {
    expect(typeof window).toBe("undefined");
    expect(renderProbe().value).toBe("standard");
  });

  it("hook 初值：系统 reduce ⇒ eco，且查询串逐字是 prefers-reduced-motion: reduce", () => {
    const asked: string[] = [];
    const stub = {
      matchMedia: (q: string) => {
        asked.push(q);
        return { matches: true };
      },
    };
    expect(withGlobal("window", stub, renderProbe).value).toBe("eco");
    expect(asked).toEqual(["(prefers-reduced-motion: reduce)"]);
  });

  it("hook 初值：window 在但**没有** matchMedia（实测 jsdom 30.0.1 正是这种）⇒ standard，不抛", () => {
    expect(withGlobal("window", {}, renderProbe).value).toBe("standard");
  });
});

describe("持久化：键逐字 motion:intensity（照 useViewMemory 范式：注入 Storage + 静默降级）", () => {
  it("三档名册与键的字面量冻结（CSS 侧的取值集合判据在 motion-coverage.test.ts）", () => {
    expect([...MOTION_INTENSITIES]).toEqual(["eco", "standard", "rich"]);
    expect(MOTION_INTENSITY_KEY).toBe("motion:intensity");
  });

  it("写读往返：写进的就是 motion:intensity，读回的等于写入值", () => {
    const storage = fakeStorage();
    writeIntensity("rich", storage);
    expect(storage.getItem("motion:intensity")).toBe("rich");
    expect(readIntensity(storage)).toBe("rich");
  });

  it("垃圾值（空串 / 大小写不符 / 多余空白 / 旧版遗留 / 不是档位名）一律当作没有记忆 ⇒ null", () => {
    for (const junk of ["", "loud", "RICH", "standard ", " eco", "eco;rich"]) {
      expect(readIntensity(fakeStorage("memory", junk)), `垃圾值 ${JSON.stringify(junk)}`).toBeNull();
    }
  });

  it("Storage 抛（配额满 / 隐私模式）⇒ 读返回 null、写不抛（静默降级）", () => {
    const denied = fakeStorage("throw");
    expect(() => writeIntensity("eco", denied)).not.toThrow();
    expect(readIntensity(denied)).toBeNull();
  });

  it("hook：已存值优先于系统初值；`select` 同时写状态与持久化", () => {
    const storage = fakeStorage("memory", "rich");
    const seen = withGlobal("localStorage", storage, () => {
      const { value, select } = renderProbe();
      select("eco");
      return value;
    });
    expect(seen, "已存的选择必须盖过系统初值（此处系统未 reduce ⇒ 初值本会是 standard）").toBe("rich");
    expect(storage.getItem(MOTION_INTENSITY_KEY)).toBe("eco");
  });
});

describe("applyIntensity：写真属性 data-motion（CSS 侧 html[data-motion=…] 的唯一入口）", () => {
  it("显式传元素 ⇒ 写在它的 dataset.motion 上；再写一次覆盖旧档", () => {
    const el = fakeEl();
    applyIntensity("rich", el);
    expect(el.dataset.motion).toBe("rich");
    applyIntensity("eco", el);
    expect(el.dataset.motion).toBe("eco");
  });

  it("不传元素 ⇒ 默认目标是 document.documentElement（`<html>`）", () => {
    const el = fakeEl();
    withGlobal("document", fakeDocument(el), () => applyIntensity("standard"));
    expect(el.dataset.motion).toBe("standard");
  });

  it("无 document（node 真环境）且不传元素 / 传 null ⇒ 静默返回，不抛", () => {
    expect(typeof document).toBe("undefined");
    expect(() => applyIntensity("rich")).not.toThrow();
    expect(() => applyIntensity("rich", null)).not.toThrow();
  });
});
