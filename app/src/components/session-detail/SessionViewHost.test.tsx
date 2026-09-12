// @vitest-environment jsdom
/**
 * SessionViewHost.test.tsx — **会话接线（批 5 T10）的判据面**：H1–H6 + 默认视图重锚 + 视图记忆两路径。
 *
 * @ai-context 为什么要重锚「默认视图 = 原文」（仪器发现 A 的后续）：T2 的实测证明，旧锚
 *   （「`useState` 初值 / 换会话复位」）的真身在 `SessionDetailPanel.tsx:64` 的 effect 里，
 *   而 C5 要求**删掉那条 effect** ⇒ 旧锚当场失效。本文件的锚换成**注册表口径**：
 *   `viewsFor("session")[0].key === FROZEN_VIEW_KEYS.session[0]` ∧ **无记忆**时切换器**首段**被
 *   按下 ∧ 常驻区可见 ∧ **没有任何非默认视图挂载**。变异：把默认键取 `[1]`、或把注册表 `[0]`
 *   换成 `preview` ⇒ D0 必红。
 * @ai-context 被测形态：`SessionViewHost` 是**受控件**（`viewKey` / `onViewKeyChange`），真正的
 *   记忆 hook 住面板。故本文件的 `HostHarness` **逐字复刻面板的接线**（`useViewMemory("session",
 *   views[0].key, keys)`）——判据因此仍然钉在**产品接线**上，而不是钉在一个自造的桩上。
 * @ai-context 仪器边界：只 mock **模块边界**（Tauri IPC）。`invoke` 一律 reject（同
 *   `SessionDetailPanel.test.tsx` 的口径：真 hook 走 catch 降级分支，渲染确定、无异步 setState 竞态）。
 *   `localStorage` 每个用例前清空（jsdom 提供）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import type { SessionDetail } from "../../types";
import type { SessionAudioState, SessionViewSlot, ViewSpec } from "../../views/registry";
import { FROZEN_VIEW_KEYS, viewsFor } from "../../views/registry";
import { useViewMemory } from "../../views/useViewMemory";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));
// 面板级用例（H4b 的「换会话不复位」+ H5 的 web 早退）会渲染真面板 ⇒ 冻掉带 IPC 的子块
vi.mock("../../components/WebArticleView", () => ({ default: () => <div data-testid="web-article-view" /> }));
vi.mock("../../components/ImageGallery", () => ({ default: () => <div data-testid="image-gallery" /> }));
vi.mock("./SessionScreenCards", () => ({ default: () => <div data-testid="screen-cards" /> }));
// `preview` 视图经 `views/session/SessionNotePreview` 适配器 → `components/NotePreviewView`（自带 IPC）
vi.mock("../NotePreviewView", () => ({ default: () => <div data-testid="note-preview-view" /> }));

import SessionViewHost from "./SessionViewHost";
import SessionDetailPanel from "../SessionDetailPanel";

const noop = () => {};
const RAW_TEXT = "原文锚点：第一段讲述";

/** 常驻探针：`mount`/`unmount` 计数 —— H1 的「挂载计数不减」就靠它（不是靠"渲染不报错"） */
const probeLog: string[] = [];
function ResidentProbe() {
  const mounts = useRef(0);
  mounts.current += 1;
  useEffect(() => {
    probeLog.push("mount");
    return () => {
      probeLog.push("unmount");
    };
  }, []);
  return (
    <div data-testid="resident-probe">
      {RAW_TEXT}（第 {mounts.current} 次渲染）
    </div>
  );
}

/** 三个惰性视图桩（模块级常量：`lazy` 表按 `views` 引用记忆化，桩必须稳定） */
const TRITRACK = { default: () => <div data-testid="view-tritrack" /> };
const PROOF = { default: () => <div data-testid="view-proof" /> };
const STUB_VIEWS: readonly ViewSpec<SessionViewSlot>[] = [
  { key: "raw", label: "原文", icon: "sessions", appliesTo: "session" },
  { key: "tritrack", label: "三轨对齐", icon: "clock", appliesTo: "session", load: () => Promise.resolve(TRITRACK) },
  { key: "proof", label: "印样", icon: "image", appliesTo: "session", load: () => Promise.resolve(PROOF) },
];
/** H3 用：`load` **永不 resolve** 的第五个视图（断言 `Suspense` 边界真的在位） */
const HANGING: readonly ViewSpec<SessionViewSlot>[] = [
  STUB_VIEWS[0],
  { key: "hang", label: "悬挂", icon: "image", appliesTo: "session", load: () => new Promise<never>(() => {}) },
];

/** T24 的过桥探针：把宿主交给视图的**整个槽**记下来（新可选槽是否真到达视图，靠它判） */
const seenSlots: SessionViewSlot[] = [];
const SLOT_PROBE = {
  default: (props: SessionViewSlot) => {
    seenSlots.push(props);
    return <div data-testid="view-slot-probe" />;
  },
};
const SLOT_PROBE_VIEWS: readonly ViewSpec<SessionViewSlot>[] = [
  STUB_VIEWS[0],
  { key: "slotprobe", label: "槽探针", icon: "clock", appliesTo: "session", load: () => Promise.resolve(SLOT_PROBE) },
];

function detailOf(id = 1042, kind: string | null = null): SessionDetail {
  return {
    session: { id, title: "化学反应速率", source_window: "Chrome", started_at: 1_700_000_000_000, ended_at: 1_700_000_600_000, status: "finished", kind },
    segments: [{ id: id * 10 + 1, session_id: id, start_ms: 0, end_ms: 2500, text: RAW_TEXT, source: "subtitle", confidence: 0.9 }],
    ocr_blocks: [],
    screens: [],
  };
}

function slotOf(detail: SessionDetail = detailOf()): SessionViewSlot {
  return {
    detail,
    imageUrl: () => null,
    ocrBlocksByScreen: new Map(),
    selectingScreen: null,
    onSelectScreen: noop,
    panelToast: null,
    onShowToast: noop,
    onClearToast: noop,
    autoRefineTaskId: null,
  };
}

/** 面板接线的逐字复刻（记忆 hook 在面板层 —— 宿主只收受控 props） */
function HostHarness({ views = STUB_VIEWS, slot = slotOf() }: { views?: readonly ViewSpec<SessionViewSlot>[]; slot?: SessionViewSlot }) {
  const [viewKey, setViewKey] = useViewMemory("session", views[0].key, views.map((spec) => spec.key));
  return (
    <SessionViewHost
      views={views}
      viewKey={viewKey}
      onViewKeyChange={setViewKey}
      slot={slot}
      resident={<ResidentProbe />}
      refining={false}
      onStartRefine={noop}
      canSecondPass={false}
      onOpenPass2={noop}
      onOpenProofread={noop}
    />
  );
}

/** 找切换器里文案含 label 的那一段（`ViewSwitcher` 渲染真实 `<button>`） */
function seg(label: string): HTMLButtonElement {
  const hit = [...document.querySelectorAll('[data-testid="session-view-switcher"] button')].find((b) => b.textContent?.includes(label));
  if (!hit) throw new Error(`找不到视图段「${label}」：实测 ${[...document.querySelectorAll('[data-testid="session-view-switcher"] button')].map((b) => b.textContent).join(" | ")}`);
  return hit as HTMLButtonElement;
}
const residentWrapper = (): HTMLElement => document.querySelector('[data-testid="session-resident-view"]') as HTMLElement;
const pressedIndex = (): number =>
  [...document.querySelectorAll('[data-testid="session-view-switcher"] button')].findIndex((b) => b.getAttribute("aria-pressed") === "true");
const mountedProbes = (): number => probeLog.filter((e) => e === "mount").length;

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => Promise.reject(new Error(`invoke not mocked: ${cmd}`)));
  localStorage.clear();
  probeLog.length = 0;
});
afterEach(() => cleanup());

describe("SessionViewHost · T10 判据（H1–H6 + 默认视图重锚）", () => {
  it("D0 无记忆 ⇒ 默认视图 = 注册表 [0] = 原文（首项 key 与冻结表对拍）", () => {
    expect(viewsFor("session")[0].key).toBe(FROZEN_VIEW_KEYS.session[0]);
    render(<HostHarness views={viewsFor("session")} />);
    expect(pressedIndex(), "切换器首段不是被按下项 ⇒ 默认视图不是注册表 [0]").toBe(0);
    expect(seg("原文").getAttribute("aria-pressed")).toBe("true");
    expect(residentWrapper().style.display, "默认视图应当可见（常驻层不该被 display:none）").toBe("");
    expect(document.querySelector('[data-testid^="view-"]'), "无记忆时不该有非默认视图挂载").toBeNull();
  });

  it("D1 有记忆 ⇒ 用记忆值：默认视图被隐藏但仍在 DOM，记忆里的视图挂载", async () => {
    localStorage.setItem("view:default:session", "proof");
    render(<HostHarness />);
    expect(await screen.findByTestId("view-proof")).not.toBeNull();
    expect(residentWrapper().style.display).toBe("none");
    expect(screen.queryByTestId("resident-probe"), "常驻语义：隐藏 ≠ 卸载").not.toBeNull();
  });

  it("H1 默认视图常驻：切到**每一个**非默认视图后原文节点仍在 DOM ∧ 挂载计数不减", async () => {
    render(<HostHarness />);
    expect(screen.getByTestId("resident-probe")).not.toBeNull();
    expect(mountedProbes()).toBe(1);
    for (const [label, testId] of [["三轨对齐", "view-tritrack"], ["印样", "view-proof"]] as const) {
      fireEvent.click(seg(label));
      await screen.findByTestId(testId);
      expect(screen.queryByTestId("resident-probe"), `切到「${label}」后原文节点从 DOM 消失（§7.3① 违反）`).not.toBeNull();
      expect(document.body.textContent).toContain(RAW_TEXT);
      expect(mountedProbes(), `切到「${label}」后原文视图被重挂/多挂`).toBe(1);
      expect(probeLog).not.toContain("unmount");
    }
  });

  it("H2 非默认视图模块级惰性：切到 ⇒ 挂载，切走 ⇒ **不在 DOM**", async () => {
    render(<HostHarness />);
    expect(screen.queryByTestId("view-tritrack")).toBeNull();
    fireEvent.click(seg("三轨对齐"));
    expect(await screen.findByTestId("view-tritrack")).not.toBeNull();
    fireEvent.click(seg("原文"));
    await waitFor(() => expect(screen.queryByTestId("view-tritrack"), "切走后惰性视图仍在 DOM ⇒ 常驻化（§7.3② 违反）").toBeNull());
    expect(residentWrapper().style.display).toBe("");
  });

  it("H3 `Suspense` 边界在位：`load` 永不 resolve ⇒ 渲染 `ShellFallback`", async () => {
    render(<HostHarness views={HANGING} />);
    fireEvent.click(seg("悬挂"));
    expect(await screen.findByTestId("shell-fallback")).not.toBeNull();
    expect(screen.queryByTestId("resident-probe")).not.toBeNull();
  });

  it("H4 视图记忆：切换写 `view:default:session`；卸载重挂恢复", async () => {
    const view = render(<HostHarness />);
    fireEvent.click(seg("印样"));
    await screen.findByTestId("view-proof");
    expect(localStorage.getItem("view:default:session")).toBe("proof");
    view.unmount();
    render(<HostHarness />);
    expect(await screen.findByTestId("view-proof"), "重挂后没有恢复记忆里的视图").not.toBeNull();
    expect(pressedIndex()).toBe(2);
  });

  it("H4b 面板级：切到非默认后**换会话** ⇒ 仍是记忆里的视图（有记忆不复位）", async () => {
    const first = render(<SessionDetailPanel detail={detailOf(1042)} views={viewsFor("session")} fusing={false} degradedBanner={null} onToNote={noop} onRemove={noop} onRefreshDetail={noop} />);
    fireEvent.click(seg("笔记预览"));
    await screen.findByTestId("note-preview-view");
    expect(localStorage.getItem("view:default:session")).toBe("preview");
    first.rerender(<SessionDetailPanel detail={detailOf(2043)} views={viewsFor("session")} fusing={false} degradedBanner={null} onToNote={noop} onRemove={noop} onRefreshDetail={noop} />);
    await screen.findByTestId("note-preview-view");
    expect(pressedIndex(), "换会话后被复位回默认视图（旧「裁决 D1」的 `:64` effect 回潮）").toBe(4);
    expect(localStorage.getItem("view:default:session")).toBe("preview");
  });

  it("H5 web 早退：`kind==='web'` ⇒ 切换器 **0 个** ∧ 不写视图记忆（污染面 0）", () => {
    render(<SessionDetailPanel detail={detailOf(1042, "web")} views={viewsFor("session")} fusing={false} degradedBanner={null} onToNote={noop} onRemove={noop} onRefreshDetail={noop} />);
    expect(screen.getByTestId("web-article-view")).not.toBeNull();
    expect(document.querySelectorAll('[data-testid="session-view-switcher"]')).toHaveLength(0);
    expect(localStorage.getItem("view:default:session")).toBeNull();
  });

  it("H6 C11 槽位：恰 1 个 ∧ `textContent === ''` ∧ 在切换器**之后**", () => {
    render(<HostHarness />);
    const slots = document.querySelectorAll("[data-view-error-slot]");
    expect(slots).toHaveLength(1);
    expect(slots[0].textContent).toBe("");
    expect(slots[0].className).toBe("ed-view-error-slot");
    const rel = screen.getByTestId("session-view-switcher").compareDocumentPosition(slots[0]);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING, "槽位不在切换器之后").toBeTruthy();
  });

  it("H6b 槽位可承载内容（批 8 的扩展面）：传 `errorSlot` ⇒ 落在同一槽位、仍恰 1 个", () => {
    render(
      <SessionViewHost
        views={STUB_VIEWS}
        viewKey="raw"
        onViewKeyChange={noop}
        slot={slotOf()}
        resident={<ResidentProbe />}
        errorSlot={<span data-testid="err-line">保存失败</span>}
        refining={false}
        onStartRefine={noop}
        canSecondPass={false}
        onOpenPass2={noop}
        onOpenProofread={noop}
      />,
    );
    expect(document.querySelectorAll("[data-view-error-slot]")).toHaveLength(1);
    expect(screen.getByTestId("err-line").textContent).toBe("保存失败");
  });

  it("H0 宿主自身不 invoke（视图数据全经 `slot` 注入，C14②）", () => {
    render(<HostHarness />);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("T24 音频引用可选槽经宿主**逐字**到达非默认视图（过桥的容器侧判据）", async () => {
    const audio: SessionAudioState = { url: "http://asset.localhost/x%5C42.wav", aligned: false, playable: false, durationMs: null };
    const sought: number[] = [];
    const onSeekMs = (ms: number) => sought.push(ms);
    seenSlots.length = 0;
    render(<HostHarness views={SLOT_PROBE_VIEWS} slot={{ ...slotOf(), audio, playheadMs: 52_500, onSeekMs }} />);
    fireEvent.click(seg("槽探针"));
    await screen.findByTestId("view-slot-probe");
    const got = seenSlots[seenSlots.length - 1];
    expect(got.audio, "`audio` 槽没到达视图（或在途中被改写）").toBe(audio);
    expect(got.playheadMs).toBe(52_500);
    expect(got.onSeekMs).toBe(onSeekMs);
    expect(got.detail, "既有 9 槽必须随同一份对象同行（不许因为新槽被复制/重排）").toBe(seenSlots[0].detail);
    got.onSeekMs?.(52_500);
    expect(sought, "视图 → 容器的回调没有原样到达").toEqual([52_500]);
  });

  it("T24 可选槽缺省 ⇒ 视图侧读到 `undefined`（可选语义：既有 9 槽夹具一字不改仍可用）", async () => {
    seenSlots.length = 0;
    render(<HostHarness views={SLOT_PROBE_VIEWS} />);
    fireEvent.click(seg("槽探针"));
    await screen.findByTestId("view-slot-probe");
    const got = seenSlots[seenSlots.length - 1];
    expect([got.audio, got.playheadMs, got.onSeekMs], "缺省的新槽不得被宿主补成别的值").toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
