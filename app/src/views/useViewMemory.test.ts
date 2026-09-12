// @vitest-environment node
/**
 * useViewMemory.test.ts — 视图记忆的判据 M1–M5（C5 / T6）。
 *
 * @ai-context 环境：**node 环境**（与全局 `environment:"node"` 一致；仍显式写指令，防全局配置漂移）。
 *   M1–M5 只依赖**注入的内存 `Storage` 桩**；hook 的渲染路径用 `react-dom/server` 的
 *   `renderToStaticMarkup` 观测（真 node 无 DOM，`@testing-library/react` 用不了 —— 先例
 *   `ui/primitives/usePresence.node.test.ts`）。SSR 跑完**渲染阶段**（含 `useState` 的惰性初始化，
 *   那正是读记忆的点）⇒「初始值」与「写后重挂载恢复」两条都在判据里。
 * @ai-context **诚实边界**：SSR 的 `useState` setter 是 no-op ⇒「setter 触发的重渲染」不可观测；
 *   本文件用「写入已落盘 + **新挂载**读回同一值」覆盖同一语义（写入那半段 = `writeViewMemory`，
 *   与 hook 的 setter 调的是**同一个**函数）。
 * 副作用：无（纯内存；绝不碰 `window.localStorage`）。
 */
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ObjectType } from "./registry";
import { VIEW_MEMORY_PREFIX, readViewMemory, useViewMemory, viewMemoryKey, writeViewMemory } from "./useViewMemory";

const SESSION_KEYS = ["raw", "tritrack", "proof", "cardflow", "preview"] as const;
const NOTE_KEYS = ["raw", "cardflow"] as const;

/** 记录键集合的内存 `Storage` 桩（M5 要「全程键集合」这个观测面）。 */
function memoryStorage(seed: Record<string, string> = {}): { storage: Storage; keys: () => string[] } {
  const map = new Map<string, string>(Object.entries(seed));
  const storage = {
    get length(): number {
      return map.size;
    },
    clear: (): void => void map.clear(),
    getItem: (k: string): string | null => (map.has(k) ? String(map.get(k)) : null),
    key: (i: number): string | null => [...map.keys()][i] ?? null,
    removeItem: (k: string): void => void map.delete(k),
    setItem: (k: string, v: string): void => void map.set(k, v),
  } as unknown as Storage;
  return { storage, keys: () => [...map.keys()].sort() };
}

/** 任何访问都抛的 `Storage` 桩（隐私模式 / 配额拒绝的形状）。 */
function throwingStorage(): Storage {
  const boom = (): never => {
    throw new Error("SecurityError: storage 被拒绝");
  };
  return {
    get length(): number {
      return boom();
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  } as unknown as Storage;
}

interface ProbeProps {
  objectType: ObjectType;
  defaultKey: string;
  validKeys: readonly string[];
  /** 省略 = 走 hook 的默认值（`globalThis.localStorage`）—— 真 node 下那是 `undefined`。 */
  storage?: Storage;
}

/** 把 hook 的返回值摊到 DOM 属性上（`renderToStaticMarkup` 不允许外部捕获 ⇒ 属性即观测面）。 */
function Probe(props: ProbeProps): ReactElement {
  const [key, select] = useViewMemory(props.objectType, props.defaultKey, props.validKeys, props.storage);
  return createElement("i", { "data-key": key, "data-select": typeof select });
}

/** 一次「挂载」（独立 hook 实例 ⇒ 再调一次 = **重挂载**）。 */
function mount(props: ProbeProps): string {
  return renderToStaticMarkup(createElement(Probe, props));
}

/** 从渲染产物里读回当前视图键（读不到即判据失败，而不是静默返回空）。 */
function shownKey(props: ProbeProps): string {
  const html = mount(props);
  const m = /data-key="([^"]*)"/.exec(html);
  if (m === null || m[1] === undefined) throw new Error(`渲染产物里没有 data-key：${html}`);
  return m[1];
}

const sessionProbe = (storage: Storage, defaultKey = "raw"): ProbeProps => ({
  objectType: "session",
  defaultKey,
  validKeys: SESSION_KEYS,
  storage,
});
const noteProbe = (storage: Storage, defaultKey = "raw"): ProbeProps => ({
  objectType: "note",
  defaultKey,
  validKeys: NOTE_KEYS,
  storage,
});

describe("M1 初始值取记忆（有则取之、无则默认）；写后重挂载恢复同一值", () => {
  it("无记忆 ⇒ 默认视图；第二个返回值是函数（选择器在位）", () => {
    const s = memoryStorage();
    expect(shownKey(sessionProbe(s.storage))).toBe("raw");
    expect(mount(sessionProbe(s.storage))).toContain('data-select="function"');
  });

  it("有合法记忆 ⇒ 取记忆值（不是默认值）", () => {
    const s = memoryStorage({ "view:default:session": "proof" });
    expect(readViewMemory("session", SESSION_KEYS, s.storage)).toBe("proof");
    expect(shownKey(sessionProbe(s.storage))).toBe("proof");
  });

  it("默认值由调用方给（不是硬编码 raw）", () => {
    expect(shownKey(sessionProbe(memoryStorage().storage, "cardflow"))).toBe("cardflow");
  });

  it("写入后**重挂载**读回同一值（记忆真的落到了 storage 上）", () => {
    const s = memoryStorage();
    expect(shownKey(sessionProbe(s.storage))).toBe("raw");
    // 等于 hook 的 setter 调用的那半段（见文件头「诚实边界」）
    writeViewMemory("session", "tritrack", s.storage);
    expect(shownKey(sessionProbe(s.storage))).toBe("tritrack");
    expect(s.storage.getItem("view:default:session")).toBe("tritrack");
  });
});

describe("M2 两类互不串（键带 objectType）", () => {
  it("写 session 不影响 note，反之亦然；两个键各自独立落盘", () => {
    const s = memoryStorage();
    writeViewMemory("session", "proof", s.storage);
    expect(shownKey(sessionProbe(s.storage))).toBe("proof");
    expect(shownKey(noteProbe(s.storage))).toBe("raw");

    writeViewMemory("note", "cardflow", s.storage);
    expect(shownKey(sessionProbe(s.storage))).toBe("proof");
    expect(shownKey(noteProbe(s.storage))).toBe("cardflow");
    expect(s.keys()).toEqual(["view:default:note", "view:default:session"]);
  });
});

describe("M3 Storage 抛异常 ⇒ 回退默认、不崩、写也不抛", () => {
  it("读抛 ⇒ null；hook 挂载不抛且给出默认值", () => {
    const s = throwingStorage();
    expect(readViewMemory("session", SESSION_KEYS, s)).toBeNull();
    expect(() => shownKey(sessionProbe(s.storage))).not.toThrow();
    expect(shownKey(sessionProbe(s.storage))).toBe("raw");
  });

  it("写抛 ⇒ 静默（不抛错）", () => {
    expect(() => writeViewMemory("session", "proof", throwingStorage())).not.toThrow();
    expect(() => mount(noteProbe(throwingStorage()))).not.toThrow();
  });

  it("真 node 环境没有 localStorage：**省略注入**也不崩（默认值降级，不是 ReferenceError）", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof globalThis.localStorage).toBe("undefined");
    expect(shownKey({ objectType: "session", defaultKey: "raw", validKeys: SESSION_KEYS })).toBe("raw");
  });
});

describe("M4 存值不在 validKeys（被手改成垃圾）⇒ 回退默认", () => {
  it("未知视图键 / 空串 / 多余空白 都不算记忆", () => {
    const cases: Array<[string, string]> = [
      ["view:default:session", "nope"],
      ["view:default:session", ""],
      ["view:default:session", "proof "],
    ];
    for (const [k, v] of cases) {
      const s = memoryStorage({ [k]: v });
      expect(readViewMemory("session", SESSION_KEYS, s.storage), `值 ${JSON.stringify(v)} 应视为无记忆`).toBeNull();
      expect(shownKey(sessionProbe(s.storage))).toBe("raw");
    }
  });

  it("反向对照：合法值**不**被误判为垃圾（否则 M4 会退化成恒返回默认）", () => {
    for (const key of SESSION_KEYS) {
      const s = memoryStorage({ "view:default:session": key });
      expect(readViewMemory("session", SESSION_KEYS, s.storage)).toBe(key);
      expect(shownKey(sessionProbe(s.storage))).toBe(key);
    }
  });
});

describe("M5 不写 layout: 前缀的任何键（键集合恰为记忆键）", () => {
  it("键形状逐字：view:default:{objectType}", () => {
    expect(VIEW_MEMORY_PREFIX).toBe("view:default:");
    expect(viewMemoryKey("session")).toBe("view:default:session");
    expect(viewMemoryKey("note")).toBe("view:default:note");
  });

  it("一次完整往返（读 + 挂载 + 写）后 storage 的键集合恰为该类型的记忆键，0 个 layout: 键", () => {
    const s = memoryStorage();
    readViewMemory("session", SESSION_KEYS, s.storage);
    mount(sessionProbe(s.storage));
    writeViewMemory("session", "cardflow", s.storage);
    expect(s.keys()).toEqual(["view:default:session"]);
    expect(s.keys().filter((k) => k.startsWith("layout:"))).toEqual([]);
    // 与 `shell/columnKeys.freeze.test.ts` 的冻结前缀正面互斥（复用它就会撞红那条判据）
    expect(s.keys().filter((k) => k.startsWith("layout:col-width:") || k.startsWith("layout:col-fold:"))).toEqual([]);
  });

  it("`objectType` 不含 kind：任何 kind 都归一到同一个键（代价已登记）", () => {
    const s = memoryStorage();
    writeViewMemory("session", "proof", s.storage);
    expect(s.keys()).toEqual(["view:default:session"]);
    expect(viewMemoryKey("session")).not.toContain("kind");
  });
});
