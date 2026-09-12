// @vitest-environment node
/**
 * @ai-context 批 5 **视图层架构守卫 · 类型级**（Task 15 A6；裁决 C14② / C15）。
 *
 * A6 的问题：**「每个视图组件的 props 只来自 `SessionViewSlot` / `NoteViewSlot`」是类型关系，
 * 文本匹配证明不了**。故本件用 **TypeScript 编译器 API** 检查一段**真实代码**探针：
 * `createElement(View, slot)` —— 能把整个 slot 传给组件 ⇒ 组件的 props 是 slot 的**子集**；
 * 任何 props 溢出 slot（多一个必填字段、少一个键、类型不符）⇒ 探针 `TS2769 no overload matches`。
 * ② 还带**牙齿自证**：往探针里塞一个必然非法的调用 ⇒ 诊断数必须 > 0（否则「0 诊断」可能只是
 * 「探针没被读到」的空真 —— 本批 #95 的纪律：先证明仪器会红，再信它的绿）。
 *
 * ★ 为什么拆出本件：A1–A5 + A6 合起来 322 行 > 300（本批硬约束「新文件一律 ≤300、不得新增豁免
 *   登记」）⇒ 拆成两件，**判据一条未删**；与 `registryResolution.test.ts` 拆 `registry.test.ts` 同因。
 *   两件**各自带仪器副本**（本仓既有先例：拆件不建「只为测试存在的生产面 helper 文件」）。
 * ★ 探针落点：**gitignored 的 `tmp/t15/`**（仓外于 `app/**`）⇒ **仓内零新增文件**、五类棘轮的
 *   扫描域零污染（棘轮域 = `app/src/**` 减 `*.test.ts(x)`；本件自己在域外）。
 * ★ `typeRoots` 必须显式指到 `app/node_modules/@types`：探针住仓内别处 ⇒ `react` 从它的位置
 *   **解析不到**（实测：不指 ⇒ `Cannot find module 'react'`，那是**环境假红**不是类型不符）。
 *
 * 本件**不能**证明什么（诚实边界）：① 不证明运行时不加载（产物级，见 T18）② 不证明视图不通过
 * **间接**依赖取数（`NotePreviewView` 那条路由 A1–A5 的 ③ 拦不住，见 `architecture.guard.test.ts`
 * 文件头的登记）③ 不替代每视图的 `vi.mock` spy 判据（C14② 仍逐组件要求 —— 它们测「渲染时零
 * `invoke` 调用」，本件测「props 面」，两者不可互替）。
 * 副作用：写自己的探针文件（`tmp/t15/props-probe.ts`，跑完留在原地可复算；**仓内零新增**）。
 * 边界：路径全用 `fileURLToPath` + `relative()` 现算（本仓路径含空格；手数 `../` 会建出空树 —— #65）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");
const APP = join(SRC, "..");
const REPO = join(APP, "..");
/** 探针目录：gitignored 的批 5 工作区（**不是**仓库根的 `tmp/`，那个没被 ignore） */
const PROBE_DIR = join(REPO, ".superpowers", "sdd", "2026-09-12-frontend-redesign-batch5-view-layer", "tmp", "t15");

describe("A6 · 每个视图组件的 props 只来自 slot（**类型级** tsc 探针，不用文本匹配）", () => {
  /** 组件路径 → 它的 slot 类型（顺序即探针里的调用顺序） */
  const VIEWS: readonly (readonly [string, "SessionViewSlot" | "NoteViewSlot"])[] = [
    ["views/session/SessionTriTrackView.tsx", "SessionViewSlot"],
    ["views/session/SessionProofView.tsx", "SessionViewSlot"],
    ["views/session/SessionCardFlowView.tsx", "SessionViewSlot"],
    ["views/session/SessionNotePreview.tsx", "SessionViewSlot"],
    ["views/note/NoteCardFlowView.tsx", "NoteViewSlot"],
  ];
  const nameOf = (f: string): string => `V${f.split("/").pop()!.replace(/\.[^.]*$/, "")}`;
  /** 从探针目录指回 `app/src/...`（用 `relative` 现算，不手数 `../` —— #65 的教训） */
  const fromProbe = (relPath: string): string =>
    relative(PROBE_DIR, join(SRC, ...relPath.split("/"))).split(sep).join("/");
  const PROBE = join(PROBE_DIR, "props-probe.ts");
  const probeSource = (): string => [
    "/** 自动生成（`views/architecture.slots.test.ts` A6）：视图 props ⊇ slot 的类型级探针。",
    " * 任何视图的 props 溢出 slot ⇒ 这里 `TS2769 no overload matches`。 */",
    'import { createElement } from "react";',
    `import type { NoteViewSlot, SessionViewSlot } from "${fromProbe("views/registry.ts")}";`,
    ...VIEWS.map(([f]) => `import ${nameOf(f)} from "${fromProbe(f)}";`),
    "",
    "declare const sessionSlot: SessionViewSlot;",
    "declare const noteSlot: NoteViewSlot;",
    "/** 5 个视图各一次：slot 能整体传给组件 ⇒ 组件的 props 是 slot 的子集 */",
    "export const probes = [",
    ...VIEWS.map(([f, s]) => `  createElement(${nameOf(f)}, ${s === "NoteViewSlot" ? "noteSlot" : "sessionSlot"}),`),
    "];",
    "",
  ].join("\n");

  it("① 探针落盘（**仓内零新增**：住 gitignored 的 `tmp/t15/`）且逐字可复算", () => {
    const src = probeSource();
    writeFileSync(PROBE, src, "utf8");
    expect(readFileSync(PROBE, "utf8")).toBe(src);
    expect(src.split("createElement(").length - 1, "5 个视图必须各有一个探针调用").toBe(5);
  }, 30000);

  it("② 判据：`tsc` 对探针 **0 诊断**（任何 props 溢出/改形 ⇒ `no overload matches`）+ 牙齿自证", () => {
    const ts = createRequire(import.meta.url)(join(APP, "node_modules", "typescript", "lib", "typescript.js"));
    const base = ts.readConfigFile(join(APP, "tsconfig.json"), (f: string) => readFileSync(f, "utf8"));
    const parsed = ts.parseJsonConfigFileContent(base.config, ts.sys, APP, undefined, join(APP, "tsconfig.json"));
    const options = { ...parsed.options, noEmit: true, typeRoots: [join(APP, "node_modules", "@types")] };
    const flat = (file: string): string => file.replace(/\\/g, "/");
    const diagnosticsOf = (file: string): string[] => ts.getPreEmitDiagnostics(ts.createProgram([file], options))
      .filter((d: { file?: { fileName: string } }) => d.file && flat(d.file.fileName) === flat(file))
      .map((d: { messageText: unknown }) => ts.flattenDiagnosticMessageText(d.messageText, " "));
    writeFileSync(PROBE, probeSource(), "utf8");
    const mine = diagnosticsOf(PROBE);
    expect(mine, `视图 props 与 slot 不一致（类型级）：\n${mine.join("\n")}`).toEqual([]);
    // ★ 牙齿自证：塞一个**必然非法**的调用 ⇒ 诊断数必须 > 0（否则「0 诊断」是"探针没被读到"的空真）
    writeFileSync(PROBE, `${probeSource()}export const mustFail = createElement(VSessionTriTrackView, { detail: 1 });\n`, "utf8");
    expect(diagnosticsOf(PROBE).length, "探针没被读到（牙齿自证失败）⇒ ② 的 0 诊断不可信").toBeGreaterThan(0);
    writeFileSync(PROBE, probeSource(), "utf8");
    expect(diagnosticsOf(PROBE), "复位后探针必须重新干净").toEqual([]);
  }, 120000);
});
