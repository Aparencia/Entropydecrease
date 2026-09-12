// @vitest-environment jsdom
/**
 * RefineWorkbench.test.tsx — 精修工作台数据源回归测试（Bug#：采纳前右侧恒空）。
 *
 * @ai-context: 工作台在采纳前打开，笔记尚未落库——refine_workbench 必须收到
 *              调用方内存结果（refineResult 参数）才能回显精修版；采纳落库须
 *              回传 taskId（标记 adopted 防重启重复采纳、成本回填）。invoke
 *              全 mock（不触碰真实后端），断言命令参数契约与双栏渲染。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AiRefineResult, MarkdownDiffOps, WorkbenchData } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import RefineWorkbench from "./RefineWorkbench";

/** 最小精修结果桩（camelCase 契约） */
const resultStub: AiRefineResult = {
  title: "测试精修",
  baseMarkdown: "# 标题\n规则内容",
  refinedMarkdown: "# 标题\n精修内容",
  diff: [],
  addedLines: 1,
  removedLines: 1,
  slices: 1,
  failedSlices: 0,
  model: "test-model",
};

/** 后端工作台数据桩（含章节 diff——右侧带徽标） */
const wbStub: WorkbenchData = {
  ruleMarkdown: "# 标题\n规则内容",
  refinedMarkdown: "# 标题\n精修内容",
  sections: [{ heading: "标题", status: "modified", removed_lines: ["规则内容"], added_lines: ["精修内容"] }],
  stats: { added: 1, removed: 1, unchanged: 0 },
  meta: { costYuan: null, model: "test-model", slices: 1, mergedFrom: null },
};

/** 批 3（问题11）：行级 ops 桩（与 wbStub/resultStub 两版文本同构的 LCS 流） */
const opsStub: MarkdownDiffOps = {
  ops: [
    { unchanged: "# 标题" },
    { removed: "规则内容" },
    { added: "精修内容" },
  ],
  added: 1,
  removed: 1,
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    // 批 3：diff_markdown_ops 按需返回行级 ops（其余命令默认回工作台桩）
    if (cmd === "diff_markdown_ops") return opsStub;
    if (cmd === "diff_markdown_sections") return wbStub.sections;
    return wbStub;
  });
});

afterEach(() => cleanup());

describe("RefineWorkbench 采纳前数据源（Bug# 回归）", () => {
  it("带 taskResult 打开：refine_workbench 收到 refineResult，右侧渲染精修版", async () => {
    // Arrange/Act
    render(<RefineWorkbench sessionId={1} onClose={vi.fn()} taskResult={resultStub} taskId={7} />);
    // Assert：命令契约——内存结果必须回传（原实现未传 → 后端取不到未落库笔记 → 右侧恒空）
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("refine_workbench", { sessionId: 1, refineResult: resultStub });
    });
    expect(await screen.findByText(/精修内容/)).toBeTruthy();
    expect(screen.getByText(/规则内容/)).toBeTruthy();
    // 右侧不再出现"尚未精修"占位（原 Bug 表象）
    expect(screen.queryByText(/尚未精修/)).toBeNull();
  });

  it("无 taskResult（重启/恢复路径）：refineResult 传 null，后端兜底未采纳任务", async () => {
    // Arrange/Act
    render(<RefineWorkbench sessionId={2} onClose={vi.fn()} />);
    // Assert
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("refine_workbench", { sessionId: 2, refineResult: null });
    });
  });

  it("采纳落库回传真实 taskId（标记 adopted + 成本回填——防重启重复采纳）", async () => {
    // Arrange：工作台数据 + apply 返回笔记 id
    invokeMock.mockImplementation(async (cmd: string) => (cmd === "ai_refine_apply" ? { id: 42 } : wbStub));
    // Act
    const onApplied = vi.fn();
    const onClose = vi.fn();
    render(<RefineWorkbench sessionId={1} onClose={onClose} taskResult={resultStub} taskId={7} onApplied={onApplied} />);
    fireEvent.click(await screen.findByRole("button", { name: /采纳落库/ }));
    // Assert
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("ai_refine_apply", {
        sessionId: 1,
        result: resultStub,
        taskId: 7,
      });
    });
    expect(onApplied).toHaveBeenCalledWith(42);
    expect(onClose).toHaveBeenCalled();
  });

  it("后端返回 refinedMarkdown=null（无任何精修来源）→ 显示占位而非空白", async () => {
    // Arrange：后端兜底也拿不到精修版
    invokeMock.mockImplementation(async (_cmd: string) => ({
      ...wbStub,
      refinedMarkdown: null,
      sections: [],
      stats: { added: 0, removed: 0, unchanged: 0 },
    }));
    // Act
    render(<RefineWorkbench sessionId={3} onClose={vi.fn()} />);
    // Assert：占位提示可见，右栏不崩
    expect(await screen.findByText(/尚未精修/)).toBeTruthy();
    expect(screen.getByText(/规则内容/)).toBeTruthy();
  });
});

describe("RefineWorkbench 行级染色与差异视图（批 3 / 问题11）", () => {
  it("双栏行级染色：统一 ops 取数 + 左栏 removed 删除线红 / 右栏 added 绿", async () => {
    // Arrange/Act：会话级（带内存结果——workbench 返回 wbStub 文本对）
    render(<RefineWorkbench sessionId={1} onClose={vi.fn()} taskResult={resultStub} />);
    // Assert：行级数据源 = 对工作台实际展示的两版文本统一取数（与
    // refine_workbench 同对文本——渲染行与数据逐行对齐）
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("diff_markdown_ops", {
        oldMd: wbStub.ruleMarkdown,
        newMd: wbStub.refinedMarkdown,
      });
    });
    // Assert：左栏规则版被删行 = 红 + 删除线
    const removedRow = await screen.findByText("规则内容");
    expect(removedRow.style.color).toBe("rgb(185, 28, 28)");
    expect(removedRow.style.textDecoration).toBe("line-through");
    // Assert：右栏精修版新增行 = 绿底绿字
    const addedRow = screen.getByText("精修内容");
    expect(addedRow.style.color).toBe("rgb(4, 120, 87)");
    expect(addedRow.style.backgroundColor).toBe("rgb(236, 253, 245)");
    // Assert：unchanged 标题行不染色。⚠️ 必须**按栏定位**：修掉装饰徽标的插入位缺陷后，
    // 右栏同名标题的直接文本节点也是「标题」，裸 `getByText("标题")` 会同时命中两栏
    // （旧断言之所以绿，正是因为缺陷把右栏文本节点污染成「标题<」——判据本身依赖缺陷）。
    const leftPane = screen.getByText("📄 规则版").nextElementSibling as HTMLElement;
    expect(leftPane.querySelector("h2")?.style.backgroundColor).toBe("");
    // Assert：章节徽标保留（差异显示不替代既有章节级标注），且**落在标题节点内部**、
    // 标题文本逐字无损 —— T7「游离 `<` / `/h3>`」回归判据。旧判据只断言
    // `getByText("修改")`：徽标被塞进 `<` 与 `/` 之间时该 span 照样命中 ⇒ 无法失败。
    const rightPane = screen.getByText("✨ 精修版").nextElementSibling as HTMLElement;
    const badgeHeading = screen.getByText("修改").closest("h2,h3,h4");
    expect(badgeHeading).not.toBeNull();
    expect(badgeHeading?.textContent).toBe("标题修改");
    expect(badgeHeading?.querySelectorAll("span").length).toBe(1);
    // Assert：栏内无闭合标签残片（错位插入会把 `</h2>` 拆成游离文本 `<` + `/h2>`）。
    // 先钉住栏非空，否则两条 `not.toContain` 在「栏取到空元素」时空真。
    expect(rightPane.textContent).toContain("标题修改");
    expect(rightPane.textContent).not.toContain("<");
    expect(rightPane.textContent).not.toContain("/h");
  });

  it("`##` 级标题（渲染为 <h3>）的徽标同在标题内——T7 实测「逻辑<修改/h3>」回归", async () => {
    // Arrange：T7 真渲染截图里的最小复现（`##` 级中文标题 + modified 章节）。
    // 旧实现的插入点是「标题匹配串末端 − 2」⇒ 落在闭合标签的 `<` 与 `/` 之间。
    const h3Stub: WorkbenchData = {
      ruleMarkdown: "## 一、底妆的底层逻辑\n旧：拍开粉底",
      refinedMarkdown: "## 一、底妆的底层逻辑\n新：少量多次按压",
      sections: [{
        heading: "一、底妆的底层逻辑",
        status: "modified",
        removed_lines: ["旧：拍开粉底"],
        added_lines: ["新：少量多次按压"],
      }],
      stats: { added: 1, removed: 1, unchanged: 0 },
      meta: { costYuan: null, model: "test-model", slices: 1, mergedFrom: null },
    };
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "diff_markdown_ops") {
        return {
          ops: [
            { unchanged: "## 一、底妆的底层逻辑" },
            { removed: "旧：拍开粉底" },
            { added: "新：少量多次按压" },
          ],
          added: 1,
          removed: 1,
        };
      }
      if (cmd === "diff_markdown_sections") return h3Stub.sections;
      return h3Stub;
    });
    // Act
    render(<RefineWorkbench sessionId={5} onClose={vi.fn()} />);
    // Assert：徽标挂进 `<h3>` 内部，标题文本 = 标题 + 徽标（错位时是「…逻辑<修改/h3>」）
    const badge = await screen.findByText("修改");
    const heading = badge.closest("h3");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("一、底妆的底层逻辑修改");
    // Assert：右栏（精修版）整栏无标签残片——游离 `<` 与 `/h3>` 是缺陷的直接表象
    const rightPane = screen.getByText("✨ 精修版").nextElementSibling as HTMLElement;
    expect(rightPane.textContent).toContain("一、底妆的底层逻辑修改");
    expect(rightPane.textContent).not.toContain("<");
    expect(rightPane.textContent).not.toContain("/h3");
  });

  it("差异视图切换：单列三态（−删除线红 / +新增绿 / 灰共有），可切回并排", async () => {
    // Arrange/Act
    render(<RefineWorkbench sessionId={1} onClose={vi.fn()} taskResult={resultStub} />);
    await screen.findByText("规则内容");
    fireEvent.click(screen.getByRole("button", { name: "差异" }));
    // Assert：单列展示两版行并置——removed 带 − 前缀红删除线
    const removedRow = await screen.findByText(/− 规则内容/);
    expect(removedRow.style.textDecoration).toBe("line-through");
    expect(removedRow.style.color).toBe("rgb(185, 28, 28)");
    // Assert：added 带 + 前缀绿
    const addedRow = screen.getByText(/\+ 精修内容/);
    expect(addedRow.style.color).toBe("rgb(4, 120, 87)");
    // Assert：unchanged 灰显（剥标题符后展示「标题」）
    const sharedRow = screen.getByText(/标题/);
    expect(sharedRow.style.color).toBe("rgb(107, 114, 128)");
    // Assert：并排模式专属栏头在差异模式消失
    expect(screen.queryByText(/📄 规则版/)).toBeNull();
    // Assert：切回并排恢复双栏（纯前端 toggle）
    fireEvent.click(screen.getByRole("button", { name: "并排" }));
    expect(await screen.findByText(/📄 规则版/)).toBeTruthy();
    expect(screen.queryByText(/− 规则内容/)).toBeNull();
  });

  it("笔记级与只读路径：同一 diff_markdown_ops 命令取数（三入口不双轨）", async () => {
    // Arrange：笔记级（noteMode——文本对来自 taskResult）
    const { unmount } = render(
      <RefineWorkbench sessionId={1} noteId={9} noteMode onClose={vi.fn()} taskResult={resultStub} />,
    );
    // Act/Assert：章节分组走 diff_markdown_sections、行级走 diff_markdown_ops
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("diff_markdown_sections", {
        oldMd: resultStub.baseMarkdown,
        newMd: resultStub.refinedMarkdown,
      });
      expect(invokeMock).toHaveBeenCalledWith("diff_markdown_ops", {
        oldMd: resultStub.baseMarkdown,
        newMd: resultStub.refinedMarkdown,
      });
    });
    expect((await screen.findByText("规则内容")).style.textDecoration).toBe("line-through");
    unmount();

    // Arrange：只读路径（VersionPanel 对比——文本对由 props 透传）
    invokeMock.mockClear();
    render(
      <RefineWorkbench
        sessionId={1}
        readonly
        ruleMd={wbStub.ruleMarkdown}
        refinedMd={wbStub.refinedMarkdown ?? ""}
        onClose={vi.fn()}
      />,
    );
    // Assert：只读入口同样统一走 diff_markdown_ops（对透传文本对取数）
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("diff_markdown_ops", {
        oldMd: wbStub.ruleMarkdown,
        newMd: wbStub.refinedMarkdown,
      });
    });
    // Assert：差异切换在只读模式可用（底部无操作按钮）
    expect(await screen.findByText("规则内容")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /采纳落库/ })).toBeNull();
    expect(screen.getByRole("button", { name: "差异" })).toBeTruthy();
  });
});
