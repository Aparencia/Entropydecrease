/**
 * noteSelectionMenu.test.ts — REQ-317 选区右键菜单纯逻辑（AAA 单测域）。
 * 覆盖：菜单项构造（模式×动作矩阵/文本可用性）、单行化截断（长度/折叠/空）、
 *       任务行插入计划（行尾/行首边界/整行含尾换行/末行无尾换行/空文/空任务）、
 *       坐标钳制（贴边内收）、阅读态选区快照判定（空/折叠/跨容器/纯空白）。
 */
import { describe, expect, it } from "vitest";
import {
  SNIPPET_MAX,
  buildSelectionMenuItems,
  clampMenuXY,
  meaningfulSelection,
  planTaskLineInsert,
  singleLineTruncate,
  type SelectionLike,
} from "./noteSelectionMenu";

describe("菜单项构造（模式×动作矩阵）", () => {
  it("阅读态：复制/全选/转问题/模型卡，无加入行动", () => {
    const items = buildSelectionMenuItems("reading", true);
    expect(items.map((i) => i.id)).toEqual(["copy", "selectAll", "toQuestion", "toModelCard"]);
  });

  it("编辑态：加入行动在复制/全选后、行动类前", () => {
    const items = buildSelectionMenuItems("editing", true);
    expect(items.map((i) => i.id)).toEqual(["copy", "selectAll", "addTask", "toQuestion", "toModelCard"]);
  });

  it("行动类项（转问题/模型卡）前插分隔线标记；阅读态加入行动缺位是矩阵断言", () => {
    const edit = buildSelectionMenuItems("editing", true);
    const dividers = edit.filter((i) => i.dividerBefore).map((i) => i.id);
    expect(dividers).toEqual(["addTask", "toQuestion"]);
    const reading = buildSelectionMenuItems("reading", true);
    expect(reading.some((i) => i.id === "addTask")).toBe(false);
  });

  it("无文本（防御态）：复制与行动类禁用、全选仍可用", () => {
    for (const mode of ["reading", "editing"] as const) {
      const items = buildSelectionMenuItems(mode, false);
      expect(items.find((i) => i.id === "selectAll")?.enabled).toBe(true);
      for (const i of items) {
        if (i.id !== "selectAll") expect(i.enabled).toBe(false);
      }
    }
  });

  it("有文本：全项可用", () => {
    for (const mode of ["reading", "editing"] as const) {
      const items = buildSelectionMenuItems(mode, true);
      expect(items.every((i) => i.enabled)).toBe(true);
    }
  });
});

describe("singleLineTruncate（≤200 单行化截断）", () => {
  it("普通文本原样（trim 后）", () => {
    expect(singleLineTruncate("  安全边际  ")).toBe("安全边际");
  });

  it("多行/多空白折叠为单空格", () => {
    expect(singleLineTruncate("第一行\n第二行\t第三行")).toBe("第一行 第二行 第三行");
  });

  it("超长截断到 ≤200 且以 … 收尾", () => {
    const long = "甲".repeat(SNIPPET_MAX + 40);
    const out = singleLineTruncate(long);
    expect(out.length).toBe(SNIPPET_MAX);
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, -1)).toBe("甲".repeat(SNIPPET_MAX - 1));
  });

  it("恰好 ≤200 不截断", () => {
    const exact = "乙".repeat(SNIPPET_MAX);
    expect(singleLineTruncate(exact)).toBe(exact);
  });

  it("空串/纯空白 → 空串；max 边界防御", () => {
    expect(singleLineTruncate("")).toBe("");
    expect(singleLineTruncate("   \n\t ")).toBe("");
    expect(singleLineTruncate("abc", 0)).toBe("");
    expect(singleLineTruncate("a", 1)).toBe("a");
  });
});

describe("planTaskLineInsert（加入行动插入计划）", () => {
  it("选区结束在行中 → 任务行插到该行行尾之后（独立新行）", () => {
    const doc = "第一行内容\n第二行";
    const plan = planTaskLineInsert(doc, 3, "要做的事");
    expect(plan).toEqual({ from: 5, insert: "\n- [ ] 要做的事" });
    // 拼接验证 = 源文 + 计划 → 语义正确
    expect(`${doc.slice(0, 5)}${plan!.insert}${doc.slice(5)}`).toBe("第一行内容\n- [ ] 要做的事\n第二行");
  });

  it("选区结束在末行无尾换行 → 追加任务行", () => {
    const doc = "第一行\n第二行";
    const plan = planTaskLineInsert(doc, doc.length, "收尾任务");
    expect(plan).toEqual({ from: doc.length, insert: "\n- [ ] 收尾任务" });
  });

  it("选区含整行（结束在行首）→ 锚上一行行尾（不落在空行后）", () => {
    const doc = "第一行\n第二行\n第三行";
    // 选区结束在 index 4 处即第二行行首（第一行含尾换行）→ 应挂在第一行后
    const plan = planTaskLineInsert(doc, 4, "任务甲");
    expect(plan).toEqual({ from: 3, insert: "\n- [ ] 任务甲" });
    expect(`${doc.slice(0, 3)}${plan!.insert}${doc.slice(3)}`).toBe("第一行\n- [ ] 任务甲\n第二行\n第三行");
  });

  it("空文档 → 首行即任务行（无前导换行）", () => {
    expect(planTaskLineInsert("", 0, "只有任务")).toEqual({ from: 0, insert: "- [ ] 只有任务" });
  });

  it("文档以换行开头且选区在其后 → 任务行置顶", () => {
    expect(planTaskLineInsert("\n正文", 1, "置顶任务")).toEqual({ from: 0, insert: "- [ ] 置顶任务" });
  });

  it("任务文本单行化且 ≤200（折叠+截断走同一 util）", () => {
    const plan = planTaskLineInsert("行一\n行二", 6, `多行\n${"长".repeat(SNIPPET_MAX + 10)}`);
    expect(plan).not.toBeNull();
    expect(plan!.insert.length).toBeLessThanOrEqual(SNIPPET_MAX + 8); // "\n- [ ] " 前缀 + 截断体
    expect(plan!.insert.endsWith("…")).toBe(true);
    // 折叠后任务体无内嵌换行（去掉行首的插入换行前缀后校验）
    const bodyPart = plan!.insert.startsWith("\n") ? plan!.insert.slice(1) : plan!.insert;
    expect(bodyPart.startsWith("- [ ] ")).toBe(true);
    expect(bodyPart.includes("\n")).toBe(false);
  });

  it("空/纯空白任务文本 → null（不插空任务行）", () => {
    expect(planTaskLineInsert("正文", 2, "")).toBeNull();
    expect(planTaskLineInsert("正文", 2, "  \t ")).toBeNull();
  });

  it("越界 offset 防御：负数=文首、超长=文末", () => {
    const doc = "首行\n次行";
    expect(planTaskLineInsert(doc, -5, "x")).toEqual({ from: 2, insert: "\n- [ ] x" });
    expect(planTaskLineInsert(doc, 999, "x")).toEqual({ from: doc.length, insert: "\n- [ ] x" });
    expect(planTaskLineInsert(doc, Number.NaN, "x")).toEqual({ from: doc.length, insert: "\n- [ ] x" });
  });
});

describe("clampMenuXY（坐标钳制）", () => {
  it("贴右下缘 → 内收不越界；常规位置不变", () => {
    expect(clampMenuXY(1000, 800, 200, 260, 1024, 768)).toEqual({ x: 820, y: 504 });
    expect(clampMenuXY(100, 100, 200, 260, 1024, 768)).toEqual({ x: 100, y: 100 });
  });
  it("超小视口 → 仍 ≥4 内边距", () => {
    expect(clampMenuXY(50, 50, 200, 260, 120, 100)).toEqual({ x: 4, y: 4 });
  });
});

describe("meaningfulSelection（阅读态选区快照判定）", () => {
  const fakeNode = { contains: (n: unknown) => n !== outside } as unknown as Node;
  const outside = {} as Node;
  const selLike = (patch: Partial<SelectionLike>, text: string): SelectionLike => ({
    isCollapsed: false,
    rangeCount: 1,
    anchorNode: fakeNode,
    focusNode: fakeNode,
    toString: () => text,
    ...patch,
  });

  it("正文内非空选区 → 返回原文", () => {
    const t = selLike({}, "  选中文字  ");
    expect(meaningfulSelection(t, fakeNode)).toBe("  选中文字  ");
  });

  it("null/空选区（isCollapsed / rangeCount=0 / 无锚焦）→ null", () => {
    expect(meaningfulSelection(null, fakeNode)).toBeNull();
    expect(meaningfulSelection(selLike({ isCollapsed: true }, "x"), fakeNode)).toBeNull();
    expect(meaningfulSelection(selLike({ rangeCount: 0 }, "x"), fakeNode)).toBeNull();
    expect(meaningfulSelection(selLike({ anchorNode: null }, "x"), fakeNode)).toBeNull();
    expect(meaningfulSelection(selLike({ focusNode: null }, "x"), fakeNode)).toBeNull();
  });

  it("锚/焦在容器外（跨 auxPanels 选区）→ null", () => {
    const t = selLike({ anchorNode: outside }, "x");
    expect(meaningfulSelection(t, fakeNode)).toBeNull();
    const t2 = selLike({ focusNode: outside }, "x");
    expect(meaningfulSelection(t2, fakeNode)).toBeNull();
  });

  it("纯空白选区 → null（不弹菜单）", () => {
    const t = selLike({}, " \n\t ");
    expect(meaningfulSelection(t, fakeNode)).toBeNull();
  });
});
