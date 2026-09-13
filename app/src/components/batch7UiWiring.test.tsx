// @vitest-environment jsdom
/**
 * batch7UiWiring.test.tsx — 批 7 T20 的 6 条「补 UI」接线判据（§9 #34 / #37 / #39 / #40 / #42 / #47）。
 *
 * @ai-context 每条命令两条独立判据（缺一不可）：
 *   ① **行为**：入口存在 ⇒ 交互 ⇒ `invoke` 的命令名与载荷逐字正确（**只写按钮不调 `invoke`」会红**）；
 *   ② **源码**：该命令在 `app/src/**` 的生产侧**恰 ≥1 个调用点**（**把它退回注释会红**，注释被剥掉）。
 *   两条分开的理由：行为判据证明「今天的接线是对的」，源码判据证明「它不会被静默删掉」——
 *   批 6/7 已两次出现「判据真空」（按钮在、命令没接；命令在、没人调）。
 * @ai-context 冻结键口径（C9.12）：本文件是 `*.test.tsx` ⇒ 不进六棘轮的 PROD 域（`textRatchet` /
 *   `nativeButton` 的域均排除 `*.test.*`）⇒ 用例夹具里的字面量不会污染任何棘轮计数。
 * @ai-context 仪器：`invoke` 用 `vi.mock` 替身按命令名分派（不碰真 IPC）；源码探针用
 *   `sliceScan.readLines` 的 `stripped`（**先剥注释**）⇒ 注释里提到命令名不产生幻影调用点。
 * 副作用：挂/卸真实 DOM；替身 `invoke` 只记录调用。边界：`ConfirmDialog` 走 `Modal` 的进场动效
 *   ⇒ 断言一律 `await waitFor`（jsdom 无 rAF 语义保证）。
 */
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLines, walkSources } from "../ui/primitives/sliceScan";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import GalleryBulkDelete from "./session-detail/GalleryBulkDelete";
import DecisionDetailPanel from "./session-detail/DecisionDetailPanel";
import SessionAnalysisPanel from "./session-detail/SessionAnalysisPanel";
import SessionRefineSection from "./session-detail/SessionRefineSection";
import KnowledgeSystemEditPanel from "./KnowledgeSystemEditPanel";
import StaleSessionRecoveryBar from "./StaleSessionRecoveryBar";

/** 六条命令 → 落地件（源码探针与行为判据共用一份名单） */
const COMMANDS = [
  "analyze_session_command",
  "delete_session_images_all",
  "finish_session",
  "get_decision",
  "refine_session",
  "update_knowledge_system",
] as const;

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");
/** 生产侧调用点（**先剥注释**；测试文件不计；`invoke` 的两种写法并列探针） */
function prodSitesOf(cmd: string): string[] {
  const forms = [new RegExp(`invoke\\s*(?:<[^>]*>)?\\(\\s*"${cmd}"`, "g"), new RegExp(`invoke\\s*(?:<[^>]*>)?\\(\\s*'${cmd}'`, "g")];
  const out: string[] = [];
  for (const abs of walkSources(SRC)) {
    const rel = relative(SRC, abs).split(sep).join("/");
    if (/\.test\.tsx?$/.test(rel)) continue;
    const text = readLines(abs).stripped.join("\n");
    if (forms.some((re) => new RegExp(re.source).test(text))) out.push(rel);
  }
  return out;
}

const ANALYSIS = {
  chapters: [{ time_ms: 65_000, votes: 2, topic_drop: 0.4 }],
  highlights: [{ time_ms: 3_000, text: "重点句", signals: 1, reasons: ["重复强调"] }],
  glossary: [{ term: "熵", ocr_count: 3, asr_count: 1, score: 4.5 }],
};
const DECISION = {
  id: 5, kind: "decision" as const, systemId: 2, questionId: null, usedRefs: "{\"concept_ids\":[1]}",
  content: "决定内容", expectation: "预期", actual: null, reflection: "反思", decidedAt: 1_700_000_000_000, createdAt: 0,
};
const SYSTEM = { id: 3, parentSystemId: null, name: "化妆体系", kind: "domain", coreQuestion: "如何学", status: "active", nodeCount: 0, conceptCount: 0, modelCount: 0, createdAt: 0, updatedAt: 0 };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("T20-D① §9 #34 `analyze_session_command`（重新分析 + 三段结果面板）", () => {
  it("点「重新分析」⇒ `invoke` 命令名与载荷逐字正确，且结果面板渲染后端返回的三段", async () => {
    invokeMock.mockResolvedValue(ANALYSIS);
    render(<SessionAnalysisPanel sessionId={7} />);
    fireEvent.click(screen.getByText("🔄 重新分析"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("analyze_session_command", { id: 7 }));
    await waitFor(() => expect(screen.getByTestId("session-analysis-result")).toBeTruthy());
    const body = screen.getByTestId("session-analysis-result").textContent ?? "";
    for (const seg of ["章节", "重点", "术语"]) expect(body, `三段里的「${seg}」没渲染出来`).toContain(seg);
    expect(body, "章节行带时间码").toContain("01:05");
    expect(body, "术语行带双计数").toContain("画面 ×3 / 语音 ×1");
  });

  it("失败 ⇒ `StatusLine kind=\"error\"`（不静默、不半截渲染）", async () => {
    invokeMock.mockRejectedValue(new Error("boom"));
    render(<SessionAnalysisPanel sessionId={7} />);
    fireEvent.click(screen.getByText("🔄 重新分析"));
    await waitFor(() => expect(screen.getByTestId("session-analysis-error").textContent).toContain("分析失败"));
    expect(screen.queryByTestId("session-analysis-result")).toBeNull();
  });
});

describe("T20-D② §9 #37 `delete_session_images_all`（整场批量删 + 二次确认）", () => {
  it("点入口**先弹确认框**、此时**不调 IPC**；确认后才调，载荷逐字", async () => {
    render(<GalleryBulkDelete sessionId={9} count={3} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByText("🗑 删除本场全部图片"));
    await waitFor(() => expect(screen.getByTestId("gallery-bulk-confirm")).toBeTruthy());
    expect(invokeMock, "确认之前不许调 IPC（危险动作的硬要求）").not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("gallery-bulk-confirm-confirm"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("delete_session_images_all", { sessionId: 9 }));
  });

  it("取消 ⇒ **不调 IPC**；条数 0 ⇒ 入口不渲染（没有可删的东西就不出危险入口）", async () => {
    const { unmount } = render(<GalleryBulkDelete sessionId={9} count={3} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByText("🗑 删除本场全部图片"));
    await waitFor(() => expect(screen.getByTestId("gallery-bulk-confirm")).toBeTruthy());
    fireEvent.click(screen.getByTestId("gallery-bulk-confirm-cancel"));
    await waitFor(() => expect(screen.queryByTestId("gallery-bulk-confirm")).toBeNull());
    expect(invokeMock, "取消路径不得调 IPC").not.toHaveBeenCalled();
    unmount();
    render(<GalleryBulkDelete sessionId={9} count={0} onDeleted={vi.fn()} />);
    expect(screen.queryByText("🗑 删除本场全部图片"), "0 张时入口必须消失").toBeNull();
  });
});

describe("T20-D③ §9 #39 `finish_session`（机器可判的 stale 才出恢复条）", () => {
  it("两个方向各一条：后端 active=false ⇒ 出；active=true ⇒ 一个字都不渲染", async () => {
    invokeMock.mockResolvedValue({ active: false, session_id: 7 });
    const { unmount } = render(<StaleSessionRecoveryBar sessionId={7} onRecovered={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("stale-session-recovery")).toBeTruthy());
    unmount();
    invokeMock.mockResolvedValue({ active: true, session_id: 7 });
    render(<StaleSessionRecoveryBar sessionId={7} onRecovered={vi.fn()} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("live_session_status"));
    expect(screen.queryByTestId("stale-session-recovery"), "后端仍在采集 ⇒ 不得出现收尾入口").toBeNull();
  });

  it("点「结束会话」⇒ `invoke(\"finish_session\", { id })` 载荷逐字 + 回调宿主", async () => {
    invokeMock.mockImplementation((cmd: unknown) => (cmd === "live_session_status" ? Promise.resolve({ active: false, session_id: 7 }) : Promise.resolve(true)));
    const onRecovered = vi.fn();
    render(<StaleSessionRecoveryBar sessionId={7} onRecovered={onRecovered} />);
    await waitFor(() => expect(screen.getByTestId("stale-session-recovery")).toBeTruthy());
    fireEvent.click(screen.getByText("⏹ 结束会话"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("finish_session", { id: 7 }));
    await waitFor(() => expect(onRecovered).toHaveBeenCalled());
  });
});

describe("T20-D④ §9 #40 `get_decision`（单条详情）", () => {
  it("挂载 ⇒ `invoke(\"get_decision\", { id })`；四行法与挂接信息逐一渲染", async () => {
    invokeMock.mockResolvedValue(DECISION);
    render(<DecisionDetailPanel id={5} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_decision", { id: 5 }));
    const body = (await screen.findByTestId("decision-detail")).textContent ?? "";
    for (const t of ["决定内容", "预期：预期", "实际：未填", "反思：反思", "引用 1 个"]) {
      expect(body, `详情缺字段：${t}`).toContain(t);
    }
  });

  it("失败 ⇒ 错误行，且**不渲染半截字段**", async () => {
    invokeMock.mockRejectedValue(new Error("nope"));
    render(<DecisionDetailPanel id={5} />);
    await waitFor(() => expect(screen.getByTestId("decision-detail-error").textContent).toContain("详情加载失败"));
    expect(screen.queryByTestId("decision-detail")).toBeNull();
  });
});

describe("T20-D⑤ §9 #42 `refine_session`（手动精修，与 auto 版并列）", () => {
  it("入口存在且调**手动**命令（与 `auto_refine_session` 可区分）", async () => {
    render(<SessionRefineSection sessionId={11} refining={false} onStartRefine={vi.fn()} canSecondPass={false} onOpenPass2={vi.fn()} onOpenProofread={vi.fn()} />);
    expect(screen.getByText("🔬 课后精修"), "既有的 auto 入口必须原样留着（并列，不替换）").toBeTruthy();
    fireEvent.click(screen.getByText("🛠 手动精修"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("refine_session", { sessionId: 11 }));
    const names = invokeMock.mock.calls.map((c) => c[0]);
    expect(names, "手动入口不得退化成 auto 版那条命令").not.toContain("auto_refine_session");
  });
});

describe("T20-D⑥ §9 #47 `update_knowledge_system`（体系三字段编辑）", () => {
  it("入口 ⇒ 展开三字段 ⇒ 保存 ⇒ 载荷逐字（未改的字段传 null）", async () => {
    const onChanged = vi.fn();
    render(<KnowledgeSystemEditPanel system={SYSTEM as never} onChanged={onChanged} />);
    fireEvent.click(screen.getByText("✎ 编辑体系"));
    fireEvent.change(screen.getByLabelText("体系名称"), { target: { value: "编程体系" } });
    fireEvent.change(screen.getByLabelText("体系状态"), { target: { value: "watching" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_knowledge_system", {
        id: 3,
        name: "编程体系",
        coreQuestion: null,
        status: "watching",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("三字段全未改 ⇒ **不发 IPC**（直接收起，不产生伪写）", async () => {
    render(<KnowledgeSystemEditPanel system={SYSTEM as never} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByText("✎ 编辑体系"));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(screen.queryByLabelText("名称")).toBeNull());
    expect(invokeMock, "没改任何字段却发了 IPC ⇒ 伪写").not.toHaveBeenCalled();
  });
});

describe("T20-D⑦ 源码级：六条命令在生产侧各 ≥1 个调用点（退回注释/删掉调用必红）", () => {
  for (const cmd of COMMANDS) {
    it(`\`${cmd}\` 的生产调用点 ≥1`, () => {
      const sites = prodSitesOf(cmd);
      expect(sites.length, `「${cmd}」在生产侧 0 调用点（只写了按钮不调 invoke 就会这样）`).toBeGreaterThanOrEqual(1);
    });
  }

  it("负控：不存在的命令名 0 命中（探针不是恒真）", () => {
    expect(prodSitesOf("zzz_no_such_command_zzz")).toEqual([]);
  });

  it("正控：既有接线命令（`list_decisions`）命中 ⇒ 同一台探针在已知命中项上有牙", () => {
    expect(prodSitesOf("list_decisions").length).toBeGreaterThanOrEqual(1);
  });
});
