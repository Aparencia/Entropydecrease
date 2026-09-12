// @vitest-environment jsdom
/**
 * @ai-context 课堂右栏「唯一内容宽决定点」守卫（规格 §6.2「统一 wrapper，消灭 640/全宽两档跳动」；批 3 T10）。
 * 判据三层，各自能独立变红：① DOM 结构 = **恰好一个**元素带内联宽度上限、且是三个分支的共同祖先
 * （结果态预览此前**没有**上限，正是「跳到全宽」那一档的来源）；② 值的来源 = 渲染出的上限 === 注册表
 * `settings-main` 的默认宽（数字只有一份）；③ 源码文本（**先剥注释**，先例 `shell/TopBar.test.tsx:35`）
 * = 宽度上限只出现一次且无裸 640 / 裸 860，自带阳性 + 阴性对照。
 *
 * ⚠️ 仪器局限：jsdom **不做布局** ⇒ 判的是「谁决定宽」而非「宽多少像素」；两个子面板被替身化。
 * 真正的像素证据只有 T14 的探针能给 —— `ClassroomPage` 至今**零自动化覆盖**（批 0-C2 实测）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { columnSpec } from "../shell/columnRegistry";
import type { Note } from "../types";

// 子面板替身（同时让用例不依赖 Tauri IPC）。vi.mock 会被提升到 import 之上。
vi.mock("./LiveActivityPanel", () => ({ default: () => <div data-testid="stub-live" /> }));
vi.mock("./ProfileDetector", () => ({ default: () => <div data-testid="stub-profile" /> }));

import ClassroomRightPane from "./ClassroomRightPane";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "ClassroomRightPane.tsx"), "utf8");
/** 只留代码：剥块注释（含 JSX 注释）与整行 `//` 注释 —— 注释里提到宽度上限不算犯规、也不算数 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const note: Note = { id: 1, title: "课堂笔记", content: "正文", source: "manual", tags: "[]", pin: 0, group_id: null, created_at: 0, updated_at: 0 };
const base = {
  liveActive: false,
  stopping: false,
  fusionActive: false,
  liveSessionId: null,
  lastNote: null,
  selectedWindow: null,
  fusedSessionId: null,
  onDismissFused: vi.fn(),
  onProfileChange: vi.fn(),
};

afterEach(cleanup);

/** 带内联宽度上限的元素（= 候选的「宽度决定点」） */
function capped(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) => el.style.maxWidth !== "");
}

describe("课堂右栏统一 wrapper（规格 §6.2）", () => {
  it("① 恰好一个宽度决定点，且它是三个分支的共同祖先", () => {
    const { container } = render(<ClassroomRightPane {...base} fusedSessionId={7} />);
    const hit = capped(container);
    expect(hit, `带宽度上限的元素应恰好 1 个，实测 ${hit.length}`).toHaveLength(1);
    for (const t of ["✅ 融合完成", "使用说明"]) {
      expect(hit[0].contains(screen.getByText(t)), `${t} 不在 wrapper 内`).toBe(true);
    }
    expect(hit[0].contains(screen.getByTestId("stub-profile"))).toBe(true);
  });

  it("① 结果态预览也在同一个 wrapper 里（它此前没有上限，是「全宽」那一档）", () => {
    const { container } = render(<ClassroomRightPane {...base} lastNote={note} />);
    const hit = capped(container);
    expect(hit).toHaveLength(1);
    expect(hit[0].contains(screen.getByText(note.title))).toBe(true);
  });

  it("① 采集态由活动面板独占（内容 wrapper 只在非采集态介入）", () => {
    const { container } = render(<ClassroomRightPane {...base} liveActive liveSessionId={3} />);
    expect(screen.getByTestId("stub-live")).toBeTruthy();
    expect(capped(container)).toHaveLength(0);
  });

  it("② 渲染出的上限 === 注册表 settings-main 的默认宽（数字只有一份）", () => {
    const { container } = render(<ClassroomRightPane {...base} />);
    expect(capped(container)[0].style.maxWidth).toBe(`${columnSpec("settings-main").default}px`);
  });

  it("① 融合卡的行为不变（wrapper 只改宽，不改事件语义）", () => {
    const onOpenSessions = vi.fn();
    const onDismissFused = vi.fn();
    render(
      <ClassroomRightPane {...base} fusedSessionId={7} onOpenSessions={onOpenSessions} onDismissFused={onDismissFused} />,
    );
    fireEvent.click(screen.getByText("查看时间轴 →"));
    expect(onOpenSessions).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByTitle("关闭提示"));
    expect(onDismissFused).toHaveBeenCalledTimes(1);
  });

  it("③ 剥注释后：宽度上限只出现一次（V2 口径）", () => {
    expect([...CODE.matchAll(/maxWidth/g)]).toHaveLength(1);
    // 仪器自检：剥注释确实起了作用，且剥完不是空文件（否则 ③ 是空判据）
    expect(SRC.length).toBeGreaterThan(CODE.length);
    expect(CODE).toContain("export default function ClassroomRightPane");
  });

  it("③ 值来自具名常量，且该常量取自注册表（不是裸数字）", () => {
    const init = CODE.match(/const\s+PANE_BODY_MAX\s*=\s*([^;\n]+)/);
    expect(init?.[1]?.trim()).toBe('columnSpec("settings-main").default');
    expect(/maxWidth:\s*PANE_BODY_MAX\b/.test(CODE), "宽度决定点必须消费该常量").toBe(true);
  });

  it("③ 代码里不再有裸 640 / 裸 860（数字只从注册表来）", () => {
    expect(/(?<![A-Za-z0-9_])640(?![0-9])/.test(CODE), "仍硬编码 640").toBe(false);
    expect(/(?<![A-Za-z0-9_])860(?![0-9])/.test(CODE), "860 又被抄了一份（应从注册表取）").toBe(false);
  });

  it("③ 仪器自检：上面的计数与裸数字正则会命中已知样本（否则那几条是空判据）", () => {
    const probe = "const a = { maxWidth: 640, width: 860 };";
    expect([...probe.matchAll(/maxWidth/g)]).toHaveLength(1);
    expect(/(?<![A-Za-z0-9_])640(?![0-9])/.test(probe)).toBe(true);
    expect(/(?<![A-Za-z0-9_])860(?![0-9])/.test(probe)).toBe(true);
    // 阴性对照：「640」是更长数字的前缀时不算命中（防子串误判）
    expect(/(?<![A-Za-z0-9_])640(?![0-9])/.test("width: 6401")).toBe(false);
  });
});
