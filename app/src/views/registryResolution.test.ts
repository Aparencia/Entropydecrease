// @vitest-environment node
/**
 * registryResolution.test.ts — 视图注册表的 **`load` 解析**判据 G3 / G7 + 会话槽**适配器**判据 A1 / A2
 * （C1/C5 · T6 的 G3/G7 + T6b 的 B2 落点）。
 *
 * @ai-context 为什么与 `registry.test.ts` 分开（控制方插播裁决 · 方案 1）：两件合起来 354 行 > 300，
 *   而本批硬约束是「新文件一律 ≤300、不得新增豁免登记」⇒ 拆件是唯一既不删判据、又不产生新登记的
 *   出路。拆前 22 条 = 本件 9 条 + `registry.test.ts` 13 条，**一条没少**。
 * @ai-context G7 是**源码级**判据（计划逐字要求）：它测的不是行为而是**模块形态** ——「注册表零静态
 *   视图 import」+「每个非默认 spec 的 `load` 体内恰一个 `import(`」。这是「非默认视图模块级惰性」
 *   （规格 §7.3②）在**源码**上唯一可测的形态；运行时的 chunk 切分要真实构建（T10/T18 的产物口径）。
 *   扫描前**剥注释**（批 1 的 6 例子串误判即由此而来）。
 * @ai-context A1/A2 是 `preview` 的**会话槽适配器**判据：`NotePreviewView` 的 props 是
 *   `{sessionId, autoTaskId, onTaskStarted}`、**不是** `SessionViewSlot`（实测 `TS2322`）⇒ 注册表
 *   指向 `./session/SessionNotePreview` 而不是它本体。A1 用 `vi.mock` 把 `NotePreviewView` 换成记录器
 *   **按 props 见证**（不是「渲染不报错」这类弱判据）：三个字段**逐字**等于槽里的来源字段（尤其
 *   `detail.session.id` ⇒ `sessionId`，改名必须发生且必须发生对）。A2 钉住它是**垫片**：零
 *   `@tauri-apps` import、零 `invoke` —— 取数仍由 `NotePreviewView` 自己做。
 * @ai-context G3 的第三条（目标文件此刻都在盘上）是**独立于 tsc 的磁盘面**：将来有人删/移一个视图
 *   文件而忘了同步注册表，G3 的前两条（`load()` 解析）与 `tsc` 都会红，但那条会把「哪个路径缺了」
 *   直接列出来 —— 且它**不依赖运行器解析模块**，是三条里最不容易受环境影响的。
 * 副作用：只读两个源码文件（G7/A2）；只把 `NotePreviewView` 换成记录器并挂一棵 React 树（A1）。
 * 边界：G3 只证明「模块存在且有 `default` 函数」；A1 只证明**映射**（`NotePreviewView` 自己的取数/
 *   渲染不在本条判据的面内 —— 它有既有的 `confirmMigration.test.tsx` 面，本任务一字未改）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ObjectType, SessionViewSlot, ViewSpec } from "./registry";
import { viewsFor } from "./registry";

/** G7 的**独立**期望：每个非默认 spec 的 `load` 目标模块（逐字路径字面量）。
 *  ⚠️ 最后一项是**适配器**（`./session/SessionNotePreview`），不是 `NotePreviewView` 本体 ——
 *  后者 props 不同形（`TS2322`），见文件头 A1/A2 与 `SessionNotePreview.tsx` 的说明。 */
const EXPECTED_LOAD_TARGETS: readonly string[] = [
  "./session/SessionTriTrackView",
  "./session/SessionProofView",
  "./session/SessionCardFlowView",
  "./session/SessionNotePreview",
  "./note/NoteCardFlowView",
];

/** G7 的**独立**期望：注册表顶部允许出现的静态 import（全部是 `import type` ⇒ 0 运行时依赖边）。 */
const EXPECTED_TYPE_IMPORTS: readonly string[] = ["../types/notes", "../types/session", "../ui/icons", "react"];

const TYPES: readonly ObjectType[] = ["session", "note"];

/** G3 的判据本体：解析一个 spec 的 `load()` 并返回其 `default`（缺 `load` ⇒ 直接判失败）。 */
async function loadDefault(spec: { key: string; load?: () => Promise<{ default: unknown }> }): Promise<unknown> {
  const load = spec.load;
  if (load === undefined) throw new Error(`spec ${spec.key} 没有 load（非默认视图必须模块级惰性）`);
  const mod = await load();
  return mod.default;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "registry.ts"), "utf8");
const ADAPTER_SRC = readFileSync(join(HERE, "session", "SessionNotePreview.tsx"), "utf8");

/** 剥行注释 / 块注释（字符串与模板字面量内部原样保留）。
 *  Why：注释里写着 `import(` / `import type` 不能算数 —— 否则「把 load 换成静态 import」时，
 *  文件头的说明会把 G7 拖成假绿（批 1 的 6 例子串误判同族）。
 *  ⚠️ 与 `registry.test.ts` 的同名函数是**逐字重复**（两件都只有 ~25 行用量）：拆件后**没有**建共用
 *  helper 文件 —— 那会在 `views/**` 里多一个「只为测试存在的生产面文件」，代价大于这 25 行的重复。
 *  判据本体（`CODE` 的消费方式）两处各自独立，不共享口径。 */
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

const CODE = stripComments(SRC);

describe("G3 每个 load() 都解析出真实模块（default 是组件函数）", () => {
  it("session 侧 4 个非默认视图", async () => {
    const specs = viewsFor("session").filter((s) => s.load !== undefined);
    expect(specs.map((s) => s.key)).toEqual(["tritrack", "proof", "cardflow", "preview"]);
    for (const spec of specs) {
      expect(typeof (await loadDefault(spec)), `${spec.key} 的 load() 没有解析出 default 组件`).toBe("function");
    }
  });

  it("note 侧 1 个非默认视图", async () => {
    const specs = viewsFor("note").filter((s) => s.load !== undefined);
    expect(specs.map((s) => s.key)).toEqual(["cardflow"]);
    for (const spec of specs) {
      expect(typeof (await loadDefault(spec)), `${spec.key} 的 load() 没有解析出 default 组件`).toBe("function");
    }
  });

  it("G3③ 注册表覆盖的每个 load 目标文件此刻都真实存在（5/5 ⇒ 无一是空壳）", () => {
    const missing = EXPECTED_LOAD_TARGETS.filter((target) => {
      try {
        readFileSync(join(HERE, `${target}.tsx`), "utf8");
        return false;
      } catch {
        return true;
      }
    });
    expect(missing, "注册表 load 的目标文件不在盘上 ⇒ 有人删/移了视图却忘了同步注册表").toEqual([]);
  });
});

describe("G7 load 是模块级惰性（源码级：恰一个 import(，零静态视图 import）", () => {
  it("顶部静态 import 全是 `import type`，且只有 4 个已知模块（0 个视图组件）", () => {
    const staticImports = [...CODE.matchAll(/^import\s[^\n]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    expect([...staticImports].sort(), "注册表出现了运行时静态 import（视图层就不可能是模块级惰性）").toEqual(
      [...EXPECTED_TYPE_IMPORTS].sort(),
    );
    const runtimeImports = [...CODE.matchAll(/^import\s+(?!type\b)[^\n]*?from\s+"[^"]+"/gm)].map((m) => m[0]);
    expect(runtimeImports, "全部静态 import 必须是 `import type`").toEqual([]);
  });

  it("每个非默认 spec 的 load 体内恰一个 import(，且指向计划给的路径", () => {
    const loads = [...CODE.matchAll(/load:\s*\(\)\s*=>\s*import\("([^"]+)"\)/g)].map((m) => m[1]);
    const loadSpecs = TYPES.flatMap((t) => viewsFor(t).filter((s) => s.load !== undefined));
    expect(loads.length, "带 load 的非默认 spec 数").toBe(loadSpecs.length);
    expect(loads.length).toBe(EXPECTED_LOAD_TARGETS.length);
    expect([...loads].sort(), "load 目标路径漂移").toEqual([...EXPECTED_LOAD_TARGETS].sort());
    expect(loads.every((p) => p.startsWith("./") || p.startsWith("../")), "load 目标必须是相对路径").toBe(true);
    // 全文件 `import(` 总数 == 非默认 spec 数 ⇒ 没有第二个动态 import、也没有别的花样
    expect((CODE.match(/import\(/g) ?? []).length).toBe(EXPECTED_LOAD_TARGETS.length);
  });

  it("扫描器自检：剥注释后看不到文件头里的说明串（否则 G7 是假绿）", () => {
    expect(stripComments('// load: () => import("./x")\nconst a = 1;')).not.toContain("import(");
    expect(stripComments('/* import type { X } from "./y" */ const a = 1;')).not.toContain("import type");
    expect(CODE).toContain("export const FROZEN_VIEW_KEYS");
  });

  it("阴性对照：`ViewSpec` 的形状可用（类型层由 tsc 兜住，此处只做行为层烟测）", () => {
    const spec: ViewSpec<unknown> = { key: "k", label: "l", icon: "sessions", appliesTo: "note" };
    expect(spec.appliesTo).toBe("note");
    expect(spec.load).toBeUndefined();
  });
});

/** A1 的**独立**见证槽：三个来源字段都取**互不相同、不会与默认值撞车**的字面量
 *  （会话 id 1042 / 任务 id 77 / 回调标记 `cb#1042/77`）⇒ 常量冒充、错字段、漏传都能被抓到。 */
const SLOT: SessionViewSlot = {
  detail: {
    session: {
      id: 1042,
      title: "构图与调色",
      source_window: "Chrome",
      started_at: 1_700_000_000_000,
      ended_at: 1_700_003_800_000,
      status: "finished",
      kind: null,
    },
    segments: [],
    screens: [],
    ocr_blocks: [],
  },
  imageUrl: () => null,
  ocrBlocksByScreen: new Map(),
  selectingScreen: null,
  onSelectScreen: () => undefined,
  panelToast: null,
  onShowToast: () => undefined,
  onClearToast: () => undefined,
  autoRefineTaskId: 77,
  onRefineTaskStarted: (sessionId: number, taskId: number) => `cb#${sessionId}/${taskId}`,
};

/** 每次渲染前清空：`NotePreviewView` 被 mock 成记录器 ⇒ 见证「适配器交给它什么」。 */
const seen: Array<Record<string, unknown>> = [];
vi.mock("../components/NotePreviewView", () => ({
  default: (props: Record<string, unknown>) => {
    seen.push(props);
    return null;
  },
}));

/** A1 的取件：**经注册表自己的 `load`** 拿适配器（而不是直接 import）—— 否则判据与
 *  「注册表指向谁」脱钩，把 `preview` 的 load 换回 `NotePreviewView` 本体也不会红。 */
async function previewAdapter(): Promise<(p: SessionViewSlot) => unknown> {
  const spec = viewsFor("session").find((s) => s.key === "preview");
  return (await loadDefault(spec as { key: string; load?: () => Promise<{ default: unknown }> })) as (
    p: SessionViewSlot,
  ) => unknown;
}

describe("A1 `preview` 走会话槽适配器：SessionViewSlot ⇒ NotePreviewView props 逐字映射", () => {
  it("load 解析出的组件把 detail.session.id / autoRefineTaskId / onRefineTaskStarted 逐字交给 NotePreviewView", async () => {
    const Adapter = await previewAdapter();
    seen.length = 0;
    renderToStaticMarkup(Adapter(SLOT) as never);

    expect(seen, "适配器没有渲染 NotePreviewView（垫片断路）").toHaveLength(1);
    const props = seen[0];
    // ① 槽里的 `detail.session.id`（**改名字段**：TS2322 的正面修法所在）
    expect(props.sessionId, "sessionId 不是逐字透传 ⇒ 预览会去查一个不存在的会话").toBe(1042);
    // ② `autoRefineTaskId` → `autoTaskId`（第二处改名）
    expect(props.autoTaskId).toBe(77);
    // ③ 回调身份不变（同一引用 ⇒ 下游 onTaskStarted 仍能触发宿主的状态更新）
    expect(props.onTaskStarted).toBe(SLOT.onRefineTaskStarted);
    // ④ 反面对照：适配器**不得**把整个槽当 props 甩给容器（那正是 `as` 强转的形态）
    expect(Object.keys(props).sort()).toEqual(["autoTaskId", "onTaskStarted", "sessionId"]);
    expect(props.detail, "槽本身被当成 props 传下去了（= 强转形态，sessionId 会是 undefined）").toBeUndefined();
  });

  it("阴性样本：换了槽的 id，映射跟着变（常量冒充当场露馅）", async () => {
    const Adapter = await previewAdapter();
    seen.length = 0;
    const other: SessionViewSlot = {
      ...SLOT,
      detail: { ...SLOT.detail, session: { ...SLOT.detail.session, id: 9_999 } },
    };
    renderToStaticMarkup(Adapter(other) as never);
    expect(seen[0].sessionId).toBe(9_999);
  });
});

describe("A2 适配器是**垫片**不是第二套取数（源码级：零 @tauri-apps、零 invoke）", () => {
  it("源码里既没有 `@tauri-apps` 的 import 边、也没有 invoke 调用；取数仍归 NotePreviewView", () => {
    const code = stripComments(ADAPTER_SRC);
    // 阳性对照：剥注释器本身有效（若它把整份源码吃成空串，下面的 0 命中就是空真）
    expect(code).toContain("export default function SessionNotePreview");
    expect(code).toContain("import NotePreviewView from");
    expect(code, "适配器出现了 @tauri-apps import（它就该零 Tauri）").not.toContain("@tauri-apps");
    expect(code, "适配器自己 invoke 了 —— 那是第二套取数，取数归 NotePreviewView").not.toContain("invoke(");
    expect(code, "适配器不得用 useState/useEffect（它无状态）").not.toMatch(/\buse(State|Effect)\b/);
  });
});
