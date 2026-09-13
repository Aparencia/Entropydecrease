/**
 * @ai-context noteEvidenceModel.test.ts —— 批 8 T6 的判据面（规格 §7.4 §A 的 E1/E2/E3 + §B 四类 + §C 两态）。
 *
 * Why 判据形状（承 §3.7「源码探针必须带 `expect`」与 §C53.5「功能型判据对取样时点免疫」）：
 *   **E2 三件**各有专属变异体 —— 容差边界（M1a 把 `<=` 改 `<`）· 失配分支（M1b 改成「取最近的一个」）
 *   · tie-break 次键（M2 去掉 id 次键）· 取样时点（M3 把分母乙改成命中数）。🔴 **V3 另立一条源码
 *   顺序判据**：两个分母「从哪一步取」功能型判据抓不住（§C53.5 逐字）—— 两条都留，红点由**实跑**裁定。
 *   **V6 逐类一条 `it`**：删掉 `anchor_timestamps=false` 那条 ⇒ 用例数对拍报 LOST = 1（§B 第 4 行的落地）。
 * 副作用：只读两个源文件（`noteEvidenceModel.ts` / `utils/html.ts`），不修改任何文件。
 * 边界：① 本件**只判模型层** —— `data-evidence-for` 与证据列的**渲染**归 T8/T10，本件只判它们的模型层
 *   前提（每段都有派生序号、无锚点段不产生匹配）；② 容差数值是**设计决定**，不是规格规定的值。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANCHOR_DISPLAY_GRANULARITY_MS, ASR_ALIGN_JITTER_MS, EVIDENCE_TOLERANCE_MS, NO_EVIDENCE_MARK,
  coverageOf, evidenceFor, extractAnchors, nearestOcrBlock, nearestSegment,
  type EvidenceLine, type EvidenceMatch,
} from "./noteEvidenceModel";
import { ANCHOR_SWITCH, MANUAL_NOTE, OCR_DIRECT, REFINE_PAIR, STATIC_FIXTURES, WEB_ARTICLE } from "./noteEvidence.fixtures";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(HERE, ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

/** 派生序号的机器形态：`0..n-1` 连续（E1「每段都有 `data-evidence-for`（含无锚点段）」的模型层前提） */
const expectDerivedOrdinals = (lines: readonly EvidenceLine[]): void => {
  expect(lines.map((l) => l.paragraphIndex), "派生序号必须逐段连续 —— 无锚点段同样有号").toEqual(lines.map((_, i) => i));
};

/** T8 的调用顺序：先派生段落 → 再抽锚点 → 再逐锚取证（该顺序由下面的 V3 源码判据钉住） */
const matchesOf = (lines: readonly EvidenceLine[], segments = REFINE_PAIR.segments, ocr = REFINE_PAIR.ocr) =>
  extractAnchors(lines).map((a) => evidenceFor(a, segments, ocr));

/** E3 的两个比值**分别**给出；分母为 0 ⇒ 该比值**无定义**（记 `null`，不写 0 冒充读数） */
const ratiosOf = (lines: readonly EvidenceLine[], matches: readonly EvidenceMatch[]) => {
  const cov = coverageOf(lines, matches);
  const hits = matches.filter((m) => m.kind === "hit").length;
  return { byDerived: cov.byDerived === 0 ? null : hits / cov.byDerived, byAnchored: cov.byAnchored === 0 ? null : hits / cov.byAnchored };
};

/** 取 `export function <name>(…) { … }` 的函数体（花括号深度匹配；抽不到 ⇒ 抛，判据不得静默退化成空真） */
function bodyOf(src: string, name: string): string {
  const at = src.indexOf(`export function ${name}(`);
  if (at < 0) throw new Error(`找不到函数：${name}`);
  const open = src.indexOf("{", src.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`函数体未闭合：${name}`);
}

/** 违法形状：分母乙改成「先匹配后计数」（命中数回灌进分母）—— M3 的形状 */
const consumesMatches = (body: string): boolean => body.includes("matches");

describe("E2① 容差：取值依据写进判据（不是注释）", () => {
  it("容差 = 1000 ms，且 == 显示粒度 == 5 × 对齐粒度（三条依据各一条 expect）", () => {
    expect(EVIDENCE_TOLERANCE_MS, "容差变了 ⇒ 报告里的三条取值依据必须重算").toBe(1000);
    expect(EVIDENCE_TOLERANCE_MS, "依据①：容差必须盖住锚点的显示粒度（1 s）").toBe(ANCHOR_DISPLAY_GRANULARITY_MS);
    expect(EVIDENCE_TOLERANCE_MS / ASR_ALIGN_JITTER_MS, "依据②：容差必须是 ±200 ms 对齐粒度的 5 倍").toBe(5);
  });

  it("依据①的「显示粒度 = 1 s」由芯片模板佐证（读源码，带负对照）", () => {
    const HTML = read("../../utils/html.ts");
    const TWO_DIGIT_SECONDS = "(\\d{2})";
    expect(HTML.includes('data-ts-ms="${ms}"'), "芯片不再产出 `data-ts-ms` ⇒ 抽取口径失效").toBe(true);
    expect(HTML.split(TWO_DIGIT_SECONDS).length - 1, "章节 / 段落两种形态的秒位都必须是两位 ⇒ 显示粒度 = 1 s").toBe(2);
    expect(HTML.split(TWO_DIGIT_SECONDS).join("(\\d{1,2})").includes(TWO_DIGIT_SECONDS), "反例未被判否 ⇒ 本条无牙").toBe(false);
  });
});

describe("E2①②③ 最近邻三件：容差边界 / 次序无关 / 显式失配", () => {
  const AT = 10000;

  it("容差边界两侧：恰好 == 容差必须命中，容差 + 1 ms 必须不命中", () => {
    expect(nearestSegment(AT, [{ id: 1, startMs: AT + EVIDENCE_TOLERANCE_MS }])?.id, "容差 + 侧边界不命中").toBe(1);
    expect(nearestSegment(AT, [{ id: 2, startMs: AT - EVIDENCE_TOLERANCE_MS }])?.id, "容差 − 侧边界不命中").toBe(2);
    const far = [{ id: 9, startMs: AT + EVIDENCE_TOLERANCE_MS + 1 }];
    expect(nearestSegment(AT, far), "容差外仍返回候选 ⇒ 容差没被用上").toBeNull();
    expect(evidenceFor({ paragraphIndex: 0, ms: AT }, far, []).kind).toBe("no-evidence");
  });

  it("数组次序无关性：同一集合的两种次序 ⇒ 同一输出", () => {
    const a = [{ id: 5, startMs: 9400 }, { id: 4, startMs: 10600 }, { id: 6, startMs: 900 }];
    expect(nearestSegment(AT, [...a].reverse())?.id, "输出依赖了入参数组顺序").toBe(nearestSegment(AT, a)?.id);
    const anchor = { paragraphIndex: 0, ms: AT };
    expect(evidenceFor(anchor, [...a].reverse(), [])).toEqual(evidenceFor(anchor, a, []));
  });

  it("容差内无候选必须出显式无证据标记（形态只有 kind + anchor）", () => {
    const bad = evidenceFor({ paragraphIndex: 2, ms: 999999 }, [{ id: 1, startMs: 0 }], []);
    expect(bad.kind, "容差内无候选必须出显式无证据标记").toBe("no-evidence");
    expect(Object.keys(bad).sort(), "失配结果的形态漂了 ⇒ 视图无法据此渲染").toEqual(["anchor", "kind"]);
    expect(NO_EVIDENCE_MARK, "显式标记不许是空串").toBe("无证据");
  });
});

describe("E2② tie-break 确定序（start_ms 升序 → 同值取 id 升序）", () => {
  it("同 ms 时必须取 id 最小者（换次序也换不了人：次键不是装饰）", () => {
    const cands = [{ id: 7, startMs: 5000 }, { id: 3, startMs: 5000 }];
    expect(nearestSegment(5000, cands)?.id, "同 ms 时必须取 id 最小者").toBe(3);
    expect(nearestSegment(5000, [...cands].reverse())?.id, "换次序就换人 ⇒ 次键是装饰").toBe(3);
    const ocr = [{ id: 13, timestampMs: 5000 }, { id: 11, timestampMs: 5000 }];
    expect(nearestOcrBlock(5000, ocr)?.id, "OCR 轨共用同一确定序").toBe(11);
  });

  it("同距离时必须取 start_ms 升序者", () => {
    const cands = [{ id: 1, startMs: 9500 }, { id: 2, startMs: 10500 }];
    expect(nearestSegment(10000, cands)?.id, "同距离时必须取 start_ms 升序者").toBe(1);
    expect(nearestSegment(10000, [...cands].reverse())?.id).toBe(1);
  });

  it("主键是距离、不是 start_ms：更近的那个胜出（「最近邻」逐字）", () => {
    const cands = [{ id: 1, startMs: 9000 }, { id: 2, startMs: 10050 }];
    expect(nearestSegment(10000, cands)?.id, "取了 start_ms 最小者 ⇒ 那不是最近邻").toBe(2);
  });
});

describe("E3 双分母并列（不许混用、不许只报一个）", () => {
  it("无锚点段落全部计入分母甲、一个都不进分母乙", () => {
    expect(coverageOf(OCR_DIRECT.lines, []), "两个分母被合成了一个").toEqual({ byDerived: 3, byAnchored: 0 });
  });

  it("有锚点但失配的段落照样进分母乙 ⇒ 分母乙 ≠ 命中数；且两个分母不消费匹配结果", () => {
    const matches = matchesOf(REFINE_PAIR.before);
    const hits = matches.filter((m) => m.kind === "hit").length;
    const cov = coverageOf(REFINE_PAIR.before, matches);
    expect([cov.byDerived, cov.byAnchored, hits], "分母乙被写成了命中数").toEqual([6, 5, 4]);
    expect(coverageOf(REFINE_PAIR.before, []), "喂空 matches 也必须同读数（分母不从匹配结果取）").toEqual(cov);
  });

  it("两个比值必须分别给出，且在同一组输入下不同（禁止只报一个就称「覆盖率」）", () => {
    const r = ratiosOf(ANCHOR_SWITCH.on, matchesOf(ANCHOR_SWITCH.on, ANCHOR_SWITCH.segments, ANCHOR_SWITCH.ocr));
    expect(r, "两个比值并列：全篇 3/4，带锚点 3/3").toEqual({ byDerived: 0.75, byAnchored: 1 });
    expect(r.byDerived, "两个比值必须可分辨，否则「只报一个」不会露馅").not.toBe(r.byAnchored);
  });

  it("分母乙为 0 时该比值无定义（记 null，不写 0 冒充读数）", () => {
    expect(ratiosOf(ANCHOR_SWITCH.off, []), "无锚点态：全篇读数 0，带锚点读数无定义").toEqual({ byDerived: 0, byAnchored: null });
  });
});

describe("V3 源码顺序（§C53.5 适用点①：功能型判据对取样时点免疫 ⇒ 另有源码级判据）", () => {
  const SRC = read("./noteEvidenceModel.ts");

  it("文件里的四个取样点逐序：paragraphIndex < extractAnchors < evidenceFor < coverageOf", () => {
    const keys = ["paragraphIndex", "export function extractAnchors", "export function evidenceFor", "export function coverageOf"];
    const order = keys.map((k) => SRC.indexOf(k));
    expect(order.every((i) => i >= 0), `取样点缺失 ⇒ 下面是空真：${order.join(" / ")}`).toBe(true);
    expect(order, `源序应为 段落 < 抽取 < 取证 < 覆盖，实测 ${order.join(" / ")}`).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size, "两个取样点落在同一位置 ⇒ 切片口径漂了").toBe(4);
  });

  it("coverageOf 体内：分母甲先、分母乙取自**段落**、且不消费匹配结果", () => {
    const body = bodyOf(SRC, "coverageOf");
    expect(body.length, "函数体抽空了 ⇒ 本轮是空真").toBeGreaterThan(40);
    const derived = body.indexOf("lines.length");
    const anchored = body.indexOf("extractAnchors(lines)");
    expect([derived >= 0, anchored >= 0], "分母里的取样点缺了（分母乙不再取自段落）").toEqual([true, true]);
    expect(derived < anchored, "分母甲的取样必须在分母乙之前").toBe(true);
    expect(consumesMatches(body), "分母一旦消费匹配结果，命中数就能回灌进分母（M3 的形状）").toBe(false);
  });

  it("负对照：把「先匹配后计数」的形状喂进同一谓词 ⇒ 必被判否（本条有牙）", () => {
    const mutated = bodyOf(SRC, "coverageOf").replace("extractAnchors(lines).length", 'matches.filter((m) => m.kind === "hit").length');
    expect(mutated.includes("extractAnchors(lines)"), "反例没换掉取样点 ⇒ 对照无效").toBe(false);
    expect(consumesMatches(mutated), "反例未被判否 ⇒ 本判据无牙").toBe(true);
  });
});

describe("§B 四类无锚点（规格 §B；第 ④ 类是开关两态）", () => {
  it("三类静态夹具：候选轨非空（非空真）· 段落全无锚点 · 0 条匹配 · 分母乙 = 0", () => {
    expect(STATIC_FIXTURES.map((f) => f.kind), "四类的静态三类（第 ④ 类见下一组）").toEqual(["ocrDirect", "web", "manual"]);
    for (const f of STATIC_FIXTURES) {
      expect(f.segments.length + f.ocr.length, `${f.kind} 的候选轨是空的 ⇒ 「0 列」会是空真`).toBeGreaterThan(0);
      expectDerivedOrdinals(f.lines);
      expect(extractAnchors(f.lines), `${f.kind} 不该有锚点`).toEqual([]);
      const matches = matchesOf(f.lines, f.segments, f.ocr);
      expect(matches, `${f.kind}：无锚点 ⇒ 没有查询 ⇒ 0 条匹配（也 0 个失配标记）`).toEqual([]);
      expect(coverageOf(f.lines, matches)).toEqual({ byDerived: f.lines.length, byAnchored: 0 });
    }
  });

  it("① OcrDirect：段落全部无锚点，但每段都有派生序号（E1：无锚点是一等状态）", () => {
    expectDerivedOrdinals(OCR_DIRECT.lines);
    expect(OCR_DIRECT.origin).toContain("rebuild_ocr_markdown");
  });

  it("② Web：未接线变体的唯一覆盖面（出处如实登记为 dead_code 预留变体）", () => {
    expectDerivedOrdinals(WEB_ARTICLE.lines);
    expect(WEB_ARTICLE.origin, "Web 类今天没有生产发射路径 —— 出处必须带上这条").toContain("未接线");
  });

  it("③ 手动笔记：用户编辑不得被自动补锚点（候选轨非空也不合成锚点）", () => {
    expect(MANUAL_NOTE.segments.length, "候选轨非空才让「不补锚点」不是一个空主张").toBeGreaterThan(0);
    expect(extractAnchors(MANUAL_NOTE.lines)).toEqual([]);
    expect(MANUAL_NOTE.origin).toContain("无发射路径");
  });

  it("④ anchor_timestamps=false：同输入两态 —— true 有锚点，false 锚点 0 / 列 0 / 段落集合逐段不变", () => {
    expect(ANCHOR_SWITCH.on.length, "两态必须逐段等长").toBe(ANCHOR_SWITCH.off.length);
    expect(ANCHOR_SWITCH.on.every((l, i) => l.text.endsWith(ANCHOR_SWITCH.off[i].text)), "两态正文必须同源（锚点在段首）—— 否则不是受控对比").toBe(true);
    expect(extractAnchors(ANCHOR_SWITCH.on).length, "true 态必须有锚点段").toBeGreaterThan(0);
    expect(extractAnchors(ANCHOR_SWITCH.off), "false 态必须锚点 0 个").toEqual([]);
    expect(matchesOf(ANCHOR_SWITCH.off, ANCHOR_SWITCH.segments, ANCHOR_SWITCH.ocr), "false 态必须证据列 0 个").toEqual([]);
    expectDerivedOrdinals(ANCHOR_SWITCH.off);
    expect(ANCHOR_SWITCH.off.map((l) => l.paragraphIndex)).toEqual(ANCHOR_SWITCH.on.map((l) => l.paragraphIndex));
  });
});

describe("§C 精修前后两态：锚点消失是**设计行为** ⇒ 走失配分支，不报缺陷", () => {
  const before = matchesOf(REFINE_PAIR.before);
  const after = matchesOf(REFINE_PAIR.after);

  it("两态同源（逐段等长且同正文）· 分母甲不变 · 分母乙 5→2 · 命中 4→1（差值归因到 §C 契约）", () => {
    expect(REFINE_PAIR.before.every((l, i) => l.text.endsWith(REFINE_PAIR.after[i].text)), "两态必须同源").toBe(true);
    expectDerivedOrdinals(REFINE_PAIR.after);
    expect(coverageOf(REFINE_PAIR.before, before)).toEqual({ byDerived: 6, byAnchored: 5 });
    expect(coverageOf(REFINE_PAIR.after, after), "精修不增删段落；回挂的章节锚点只剩 2 个").toEqual({ byDerived: 6, byAnchored: 2 });
    expect([before.filter((m) => m.kind === "hit").length, after.filter((m) => m.kind === "hit").length]).toEqual([4, 1]);
  });

  it("精修后失去锚点的段落 ⇒ **无匹配**（无锚点段不产生查询；不是失配、更不是缺陷）", () => {
    const lost = REFINE_PAIR.after.filter((l, i) => extractAnchors([REFINE_PAIR.before[i]]).length === 1 && extractAnchors([l]).length === 0);
    expect(lost.length, "精修后应有段落失去锚点（否则 §C 契约没被模型表达）").toBe(3);
    expect(after.length, "有锚点段 = 2 ⇒ 匹配也恰好 2").toBe(2);
  });

  it("失配是**一等结果**：章节锚点落在容差外 ⇒ 显式「无证据」，不报异常、不回填最近段", () => {
    const misfits = after.filter((m) => m.kind === "no-evidence");
    expect(misfits.length, "两态都应有 1 条失配（`## 定妆` 的 99000 ms 距最近段 51880 ms）").toBe(1);
    expect([misfits[0].anchor.ms, before.filter((m) => m.kind === "no-evidence").length], "失配与精修无关").toEqual([99000, 1]);
  });
});
