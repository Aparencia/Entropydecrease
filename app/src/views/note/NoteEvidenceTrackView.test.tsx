// @vitest-environment jsdom
/**
 * NoteEvidenceTrackView.test.tsx — 批 8 T8 的**视图层**判据（规格 §7.4 §A 的 E1/E2/E3 + §B/§C）。
 *
 * @ai-context 三个判据面各有**独立 oracle**（不拿被测件自己的中间量当期望）：
 *   ① **E1 双向**：段落/锚点的 oracle = 模型层 `evidenceLinesOf` + `extractAnchors`，**并**用
 *      **渲染链自己产出的芯片** `[data-ts-ms]`（`utils/html.renderTimestampAnchors` 的产物）作
 *      第二条见证 ⇒ 「有锚点无证据列 = 缺陷」与「无锚点无证据列 = 正常」两个方向都成判据。
 *   ② **E2**：命中 / 失配的期望值**逐字写在断言里**（夹具的 `id` 与边界 ms 现算），不用被测件输出。
 *   ③ **E3**：两个分母各自读 DOM；分母为 0 ⇒ 比值属性**整条缺席**（≠ 0）—— 「0」与「无定义」在
 *      同一支读法下必须可分辨。
 * @ai-context **§C 的两态是受控对比**（§17）：`REFINE_PAIR` 两态的候选轨**逐字相同** ⇒ 读数之差
 *   只可能来自**锚点的存亡**；本件因此能逐条把差值归因到 §C 契约（分母甲不变 · 分母乙 5→2 ·
 *   命中 4→1），而不是归因到夹具换了。
 * @ai-context **本件不重复造 Tauri 边仪器**：视图零 `invoke` / 零 `@tauri-apps` 边由
 *   `views/architecture.guard.test.ts` A3③ 在**整目录**（含本件新增的生产文件）上判（T8 报告给读数）。
 * 副作用：只挂 React 树；不写盘、不发请求。
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Note } from "../../types";
import NoteEvidenceTrackView, { evidenceLinesOf, type NoteEvidenceTracks } from "./NoteEvidenceTrackView";
import { EVIDENCE_TOLERANCE_MS, NO_EVIDENCE_MARK, extractAnchors, type EvidenceLine } from "./noteEvidenceModel";
import { ANCHOR_SWITCH, MANUAL_NOTE, OCR_DIRECT, REFINE_PAIR, STATIC_FIXTURES, WEB_ARTICLE } from "./noteEvidence.fixtures";

const noop = () => {};
const noteOf = (content: string): Note => ({
  id: 1, title: "标题", content, source: "session", session_id: 42, rule_version: null, purify_stats: null,
  tags: "[]", properties: null, pin: 0, group_id: null, created_at: 1, updated_at: 2,
});
/** 段落集合 → `notes.content`（夹具是行数组；空行不被派生 ⇒ 逐行 join 即同一集合） */
const contentOf = (lines: readonly EvidenceLine[]): string => lines.map((l) => l.text).join("\n");
const mount = (content: string, evidence?: NoteEvidenceTracks): HTMLElement =>
  render(<NoteEvidenceTrackView note={noteOf(content)} onTaskToggle={noop} onImageOpen={noop} evidence={evidence} />).container;

/** 段落节点 = 带 `data-evidence-for` 的行（E1 正向的唯一载体） */
const rowsOf = (root: Element): Element[] => [...root.querySelectorAll("[data-evidence-for]")];
const ordinalsOf = (root: Element): (string | null)[] => rowsOf(root).map((r) => r.getAttribute("data-evidence-for"));
const cellCount = (root: Element): number => root.querySelectorAll("[data-evidence-cell]").length;
const marksOf = (root: Element): string[] => [...root.querySelectorAll("[data-evidence-missing]")].map((e) => e.textContent ?? "");
const idsOf = (root: Element): (string | null)[] => [...root.querySelectorAll("[data-evidence-id]")].map((e) => e.getAttribute("data-evidence-id"));
const chipsIn = (root: Element): number => root.querySelectorAll("[data-ts-ms]").length;
/** E3 的一格读数；**读不到即抛**（缺格不许静默退化成空真） */
const coverOf = (root: Element, kind: "derived" | "anchored") => {
  const el = root.querySelector(`[data-coverage="${kind}"]`);
  if (el === null) throw new Error(`没有 data-coverage="${kind}" 这一格 ⇒ E3 的两个分母没有并列渲染`);
  return {
    hits: el.getAttribute("data-coverage-hits"),
    denominator: el.getAttribute("data-coverage-denominator"),
    ratio: el.getAttribute("data-coverage-ratio"),
  };
};
const TRACKS = (f: { segments: readonly { id: number; startMs: number }[]; ocr: readonly { id: number; timestampMs: number }[] }) =>
  ({ segments: f.segments, ocr: f.ocr });

afterEach(cleanup);

describe("E1 正向：**每段**都有 data-evidence-for（含无锚点段）· 序号连续 = 渲染器产出的段落数", () => {
  it("七组夹具（§B 静态三类 + 开关两态 + §C 精修两态）：节点数与序号逐字相等", () => {
    const cases: readonly (readonly [string, readonly EvidenceLine[]])[] = [
      ["OCR_DIRECT", OCR_DIRECT.lines], ["WEB", WEB_ARTICLE.lines], ["MANUAL", MANUAL_NOTE.lines],
      ["SWITCH.on", ANCHOR_SWITCH.on], ["SWITCH.off", ANCHOR_SWITCH.off],
      ["REFINE.before", REFINE_PAIR.before], ["REFINE.after", REFINE_PAIR.after],
    ];
    for (const [name, lines] of cases) {
      const root = mount(contentOf(lines));
      expect(rowsOf(root).length, `${name}：段落节点数必须 == 派生段落数`).toBe(lines.length);
      expect(ordinalsOf(root), `${name}：派生序号必须逐段连续（无锚点段同样有号）`).toEqual(lines.map((_, i) => String(i)));
      cleanup();
    }
  });

  it("反例守卫：段落数跟着夹具变（写死节点数的实现会在这里红）· 空行不产出段落节点", () => {
    expect(ordinalsOf(mount("甲段。\n\n乙段。")), "空行经行级渲染链产出空串 ⇒ 不构成段落（E3 分母甲口径）").toEqual(["0", "1"]);
    cleanup();
    expect(ordinalsOf(mount("只有一个段落。"))).toEqual(["0"]);
    expect(evidenceLinesOf("甲\n\n乙").map((l) => l.paragraphIndex), "派生函数独立可算：空行剔除 + 序号连续").toEqual([0, 1]);
  });
});

describe("E1 反向：**只有带锚点段**才渲染证据列（两个方向各自成判据）", () => {
  it("缺陷向：有锚点 ⇒ **必有**证据列（模型抽锚 + 渲染链芯片两条独立见证）", () => {
    const root = mount(contentOf(ANCHOR_SWITCH.on), TRACKS(ANCHOR_SWITCH));
    const anchored = extractAnchors(ANCHOR_SWITCH.on).map((a) => a.paragraphIndex);
    expect(anchored, "夹具自证：on 态必须有锚点段（否则下面的判据空真）").toEqual([0, 1, 2]);
    expect(chipsIn(root), "渲染链产出的芯片数 == 锚点数（第二条见证，独立于模型）").toBe(anchored.length);
    for (const i of anchored) {
      const row = root.querySelector(`[data-evidence-for="${i}"]`);
      expect(row?.querySelectorAll("[data-evidence-cell]").length, `第 ${i} 段有锚点却**没有**证据列（E1 的缺陷向）`).toBe(1);
    }
    expect(cellCount(root), "证据列数恰 = 带锚点段数").toBe(anchored.length);
  });

  it("正常向：无锚点 ⇒ **必无**证据列且**无「无证据」告警**（§B 三类 + 开关 off 态）", () => {
    const cases = [...STATIC_FIXTURES, { kind: "switch.off", lines: ANCHOR_SWITCH.off, segments: ANCHOR_SWITCH.segments, ocr: ANCHOR_SWITCH.ocr }];
    for (const f of cases) {
      const root = mount(contentOf(f.lines), { segments: f.segments, ocr: f.ocr });
      expect(extractAnchors(f.lines), `${f.kind} 夹具自证：必须 0 锚点`).toEqual([]);
      expect(cellCount(root), `${f.kind}：无锚点段落不得出现证据列或告警`).toBe(0);
      expect(marksOf(root), `${f.kind}：无锚点段落不得出现「无证据」告警（无锚点是一等状态，不是异常）`).toEqual([]);
      cleanup();
    }
  });
});

describe("E2 命中：证据列逐字带候选 id（转写段轨 + OCR 块轨）", () => {
  it("on 态三段各出**最近邻**：id 与轨道逐字（含 120 ms 抖动那段）", () => {
    const root = mount(contentOf(ANCHOR_SWITCH.on), TRACKS(ANCHOR_SWITCH));
    expect(idsOf(root), "证据 id 必须逐字 = 夹具的 session_segments.id / session_ocr_blocks.id").toEqual(["1", "11", "2", "12", "3", "13"]);
    expect([...root.querySelectorAll("[data-evidence-track]")].map((e) => e.getAttribute("data-evidence-track")), "两轨各自带轨标")
      .toEqual(["segment", "ocr", "segment", "ocr", "segment", "ocr"]);
    const row2 = root.querySelector('[data-evidence-for="2"]');
    expect(row2 === null ? null : [...row2.querySelectorAll("[data-evidence-id]")].map((e) => e.getAttribute("data-evidence-id")),
      "47000 那段：段 47120（距 120 ms）/ 块 47200（距 200 ms）—— 容差内取**最近邻**，不是数组首位").toEqual(["3", "13"]);
  });

  it("OCR 轨为空（`ocr: []`）⇒ 只出转写段轨；命中**不**因补充轨缺席而退化成失配", () => {
    const root = mount(contentOf(ANCHOR_SWITCH.on), { segments: ANCHOR_SWITCH.segments, ocr: [] });
    expect(idsOf(root)).toEqual(["1", "2", "3"]);
    expect(marksOf(root)).toEqual([]);
  });
});

describe("E2 失配：容差内无候选 ⇒ **显式**「无证据」标记（不许静默取最近的一个）", () => {
  it("§C 精修后的章节锚点落在容差外（99000 vs 最近段 47120）⇒ 显式标记且**不**回填最近段", () => {
    const root = mount(contentOf(REFINE_PAIR.after), TRACKS(REFINE_PAIR));
    const row = root.querySelector('[data-evidence-for="4"]');
    expect(row?.textContent, "容差内无候选必须出显式「无证据」标记").toContain(NO_EVIDENCE_MARK);
    expect(row?.querySelectorAll("[data-evidence-id]").length, "显式失配段**不得**回填最近的一个候选").toBe(0);
    expect(marksOf(root), "本态恰 1 条失配 ⇒ 标记也只有那一条").toEqual([NO_EVIDENCE_MARK]);
  });

  it("容差边界两侧（DOM 侧复算）：恰 == 容差 ⇒ 命中；容差 + 1 ms ⇒ 显式失配", () => {
    const LINE = "[⏱ 00:10]([[ts:10000]]) 边界段。";
    const inside = mount(LINE, { segments: [{ id: 1, startMs: 10000 + EVIDENCE_TOLERANCE_MS }] });
    expect(idsOf(inside), "恰在容差上必须命中（边界含等号）").toEqual(["1"]);
    cleanup();
    const outside = mount(LINE, { segments: [{ id: 2, startMs: 10000 + EVIDENCE_TOLERANCE_MS + 1 }] });
    expect(idsOf(outside), "容差 + 1 ms 不得命中").toEqual([]);
    expect(marksOf(outside), "容差外必须出显式标记（不是空白、也不是异常）").toEqual([NO_EVIDENCE_MARK]);
  });
});

describe("§C 精修两态（受控对比）：锚点消失 ⇒ 沉默的正常态，不报缺陷、不回滚", () => {
  const refined = (lines: readonly EvidenceLine[]): HTMLElement => mount(contentOf(lines), TRACKS(REFINE_PAIR));

  it("两态同源：段落节点数与序号**逐段相等**（精修不增删段落）", () => {
    const b = refined(REFINE_PAIR.before);
    const a = refined(REFINE_PAIR.after);
    expect(ordinalsOf(a)).toEqual(ordinalsOf(b));
    expect(ordinalsOf(a)).toHaveLength(6);
  });

  it("差值逐条归因到 §C：分母甲不变 · 分母乙 5→2 · 命中 4→1 · 证据列 5→2 · 脱锚 3 段沉默", () => {
    const b = refined(REFINE_PAIR.before);
    const a = refined(REFINE_PAIR.after);
    expect([coverOf(b, "derived").denominator, coverOf(a, "derived").denominator], "分母甲（派生段落）两态不变").toEqual(["6", "6"]);
    expect([coverOf(b, "anchored").denominator, coverOf(a, "anchored").denominator], "分母乙 5→2：差的 3 段 = 精修主动剥离段级锚点").toEqual(["5", "2"]);
    expect([coverOf(b, "derived").hits, coverOf(a, "derived").hits], "命中 4→1").toEqual(["4", "1"]);
    expect([cellCount(b), cellCount(a)], "证据列只在带锚点段上 ⇒ 5→2").toEqual([5, 2]);
    expect([chipsIn(b), chipsIn(a)], "渲染链侧的独立见证：锚点芯片 5→2").toEqual([5, 2]);
    for (const i of [1, 2, 3]) {
      const row = a.querySelector(`[data-evidence-for="${i}"]`);
      expect(chipsIn(row as Element), `after 态第 ${i} 段确实没有锚点芯片（夹具自证）`).toBe(0);
      expect(row?.querySelectorAll("[data-evidence-cell]").length, `精修后第 ${i} 段失去锚点 ⇒ 不得出现证据列（无锚点无列 = 正常）`).toBe(0);
    }
    expect(a.querySelectorAll('[role="alert"]').length, "脱锚段不得被报成缺陷（视图里没有 error 面）").toBe(0);
    expect(a.textContent, "视图渲染的是精修**后**的正文（没有回滚精修）").toContain("散粉压两遍，鼻翼用余粉带过。");
  });
});

describe("E3 双分母并列：两个比值分别给出；分母 0 ⇒ 比值**无定义**（属性缺席，不写 0）", () => {
  it("on 态：全篇 3/4（0.750）· 带锚点 3/3（1.000）—— 两个比值必须可分辨", () => {
    const root = mount(contentOf(ANCHOR_SWITCH.on), TRACKS(ANCHOR_SWITCH));
    const d = coverOf(root, "derived");
    const a = coverOf(root, "anchored");
    expect([d.hits, d.denominator, d.ratio]).toEqual(["3", "4", "0.750"]);
    expect([a.hits, a.denominator, a.ratio]).toEqual(["3", "3", "1.000"]);
    expect(d.ratio, "两个比值必须可分辨，否则「只报一个」不会露馅").not.toBe(a.ratio);
  });

  it("无锚点态：分母 0 ⇒ ratio 属性**整条缺席**；全篇 0/4 ⇒ ratio = 0.000（0 与 null 不可混）", () => {
    const root = mount(contentOf(ANCHOR_SWITCH.off), TRACKS(ANCHOR_SWITCH));
    const a = coverOf(root, "anchored");
    const d = coverOf(root, "derived");
    expect([a.hits, a.denominator, a.ratio], "分母 0 ⇒ 记 null（不写 0 冒充读数）").toEqual(["0", "0", null]);
    expect([d.hits, d.denominator, d.ratio], "分母非 0 ⇒ 0 是**真读数**（与 null 必须可分辨）").toEqual(["0", "4", "0.000"]);
    expect(root.textContent, "无定义那一格显示占位符，而不是 0/0 或 0%").toContain("—");
  });
});

describe("注册表直载态（容器未接线）：候选轨为空 ⇒ 有锚点段出**显式**失配（E2 的诚实读数）", () => {
  it("无 evidence 注入：有锚点段全部显式「无证据」；无锚点段仍**沉默**", () => {
    const root = mount(contentOf(ANCHOR_SWITCH.on));
    expect(cellCount(root), "三处有锚点 ⇒ 三处证据列（内容为显式失配，不假装命中）").toBe(3);
    expect(marksOf(root)).toEqual([NO_EVIDENCE_MARK, NO_EVIDENCE_MARK, NO_EVIDENCE_MARK]);
    expect(idsOf(root), "空候选轨 ⇒ 0 个证据 id").toEqual([]);
    cleanup();
    const staticRoot = mount(contentOf(OCR_DIRECT.lines));
    expect([cellCount(staticRoot), marksOf(staticRoot).length], "无锚点 ⇒ 静默（0 列 / 0 告警）").toEqual([0, 0]);
  });
});
