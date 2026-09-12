// @vitest-environment jsdom
/**
 * @ai-context responseReceipt.dom.test.tsx — 响应层回执的 **DOM 侧判据**（批 6 T12；jsdom 环境）。
 *
 * Why 需要这个文件（node 侧的 `responseCoverage.test.ts` 判不到的两件事）：
 *   ① **「规则在」≠「打得到元素」**：`motion.css` 里的选择器可以写得完全合法却匹配不上任何真实元素
 *      （少一个 `:not`、属性选择器拼错、状态选择器写成 `:focus-visible` 而宿主根本没焦点）——
 *      node 侧只能做文本比对。这里用**真实渲染出来的元素**跑 `Element.matches()`：判据 =
 *      「这个宿主至少被一条响应层规则打到，且至少有一条**状态**规则（`做完了`/`收到了` 可区分的那半）」。
 *   ② **动效不得改变交互语义**（安全网）：把打到宿主上的规则集合摊开做**声明级审计**（白名单 =
 *      `responseScan.ALLOWED_PROPS`）+ 真的点一遍（`fireEvent`）确认 `onClick` / `onChange` / `dragStart`
 *      语义与类名契约一字未变。
 *
 * 宿主两类（口径写清，别混读）：
 *   · **真实生产宿主**：`ColumnBar`（`div+onClick`、**无 role** —— 就是我方登记的余量族）、`Button`、
 *     `ViewSwitcher`（段控件走原语层）。
 *   · **同构宿主**：裸 `<button>` / `<input type=checkbox>` / `<input type=text>` / `<textarea>` /
 *     `<details><summary>` / 裸 `draggable` 行 / `role="separator"` —— 形态逐字取自今天的生产调用点
 *     （`responseCoverage.test.ts` 的「调用面形态」判据用**下界**盯着这些形态在盘上真的存在且够量）。
 *   ⚠️ 为什么不直接挂 `GroupDeleteConfirm` / `SessionDetailHeader`：前者挂载即 `invoke`（要 Tauri 桩）、
 *     后者要一整份 `SessionDetail`；两者的**形态**已由同构宿主 + 盘上下界判据覆盖，硬挂只会引入与
 *     本任务无关的脆弱面（计划的 V2 点名了这两个组件 —— 偏离已在 T12 报告里逐条登记）。
 *
 * 副作用：只挂 React 树 + 只读 `primitives/*.css` 的文本；不写磁盘。
 * 边界：① 🔴 **jsdom 不做样式级联、vitest 也不加载 CSS**（`css:false`）⇒ 本文件**不**声称验证了观感；
 *      「动效不改变交互语义」的机器抓手 = **声明级审计**（规则若声明了 `pointer-events` / `display`
 *      / `width` 这类属性，本文件必红），点一遍是为了守住组件自身的语义与 DOM 契约；
 *      ② 伪类（`:hover` / `:active` / `:checked`）在 jsdom 里恒不匹配 ⇒ 一律用**基选择器**判落点，
 *      状态规则的"存在性"另判（`stateOn`）。
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ColumnBar from "../components/ColumnBar";
import { Button, ViewSwitcher } from "../ui/primitives";
import type { ViewSwitcherOption } from "../ui/primitives";
import { baseSelector, offendersIn, responseRules } from "./responseScan";

const RULES = responseRules();

/** `Element.matches` 的守卫版：选择器不被支持时返回 `false`（不许静默抛断整个文件） */
function matchesBase(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

/** 打到这个元素上的响应层规则（**基选择器**口径：状态由实现细节决定，形态才是本判据要问的） */
const landingOn = (el: Element): readonly string[] =>
  RULES.filter((r) => matchesBase(el, baseSelector(r.selector))).map((r) => r.selector);

/** 打到这个元素上的**状态**回执（选择器带状态 ⇒ 就是"做完了 / 收到了"可区分的那一半） */
const stateOn = (el: Element): readonly string[] =>
  RULES.filter((r) => r.selector !== baseSelector(r.selector) && matchesBase(el, baseSelector(r.selector))).map((r) => r.selector);

/** 取宿主元素（找不到即抛 —— 判据不许在空节点上变成空真） */
function el(container: HTMLElement, testId: string): Element {
  const found = container.querySelector(`[data-testid="${testId}"]`);
  if (found === null) throw new Error(`宿主缺元素 [data-testid="${testId}"]`);
  return found;
}

/** 同构宿主：裸 `<button>`（形态锚点 = `pages/ReviewPage.tsx:151`，实测 420 处/119 文件） */
function BareButton({ onClick }: { readonly onClick: () => void }): ReactElement {
  return <button type="button" data-testid="bare-button" onClick={onClick}>刷新</button>;
}
/** 同构宿主：原生 checkbox（形态锚点 = `components/GroupDeleteConfirm.tsx:134`，实测 26 处/21 文件） */
function Checkbox({ onCheck }: { readonly onCheck: (v: boolean) => void }): ReactElement {
  return <input type="checkbox" data-testid="checkbox" onChange={(e) => onCheck(e.target.checked)} />;
}
/** 同构宿主：文本输入（形态锚点 = `components/session-detail/SessionDetailHeader.tsx:115`，118 处/55 文件） */
function TextInput(): ReactElement {
  const [v, setV] = useState("");
  return <input type="text" data-testid="text-input" value={v} onChange={(e) => setV(e.target.value)} />;
}
/** 同构宿主：`<details>/<summary>`（形态锚点 = `components/session-detail/SessionAuxBlocks.tsx:67-76`，8 处/4 文件） */
function Fold(): ReactElement {
  return <details data-testid="details"><summary data-testid="summary">展开</summary>内容</details>;
}
/** 同构宿主：裸 `draggable` 行（形态锚点 = `components/NoteListRow.tsx:58`） */
function DragRow({ onDragStart }: { readonly onDragStart: () => void }): ReactElement {
  return <div data-testid="drag-row" draggable onDragStart={onDragStart}>可拖行</div>;
}
/** 同构宿主：`role="separator"`（形态锚点 = `components/ColumnResizer.tsx:59-64`） */
function Separator(): ReactElement {
  return <div data-testid="separator" role="separator" aria-orientation="vertical" tabIndex={0} />;
}

const OPTIONS: readonly ViewSwitcherOption[] = [
  { key: "raw", label: "原文" },
  { key: "tritrack", label: "三轨对齐" },
];

afterEach(cleanup);

describe("① 可达性：规则要真的打得到今天的元素形态（`matches` 级，node 侧判不到那一半）", () => {
  const cases: ReadonlyArray<readonly [string, () => ReactElement]> = [
    ["裸 button 宿主", () => <BareButton onClick={() => undefined} />],
    ["原生 checkbox 宿主", () => <Checkbox onCheck={() => undefined} />],
    ["文本输入宿主", () => <TextInput />],
    ["details/summary 宿主", () => <Fold />],
    ["draggable 行宿主", () => <DragRow onDragStart={() => undefined} />],
    ["role=separator 宿主", () => <Separator />],
  ];

  for (const [name, make] of cases) {
    it(`${name}：至少一条响应层规则命中，且带状态回执（"收到了"与"做完了"可区分）`, () => {
      const { container } = render(make());
      const host = container.firstElementChild;
      if (host === null) throw new Error(`${name} 没有渲染出元素`);
      const target = name.includes("summary") ? el(container, "summary") : host;
      expect(landingOn(target).length, `${name} 没被任何响应层规则打到（选择器写对了但匹配不上）`).toBeGreaterThanOrEqual(1);
      expect(stateOn(target).length, `${name} 只有过渡声明、没有状态回执 ⇒ 「即时反馈」不成立`).toBeGreaterThanOrEqual(1);
    });
  }

  it("`[role=button]` 的 div 与 `input[type=radio]`（今日 0 调用点，接缝先于调用点）也能被判到", () => {
    const { container } = render(<div data-testid="role-button" role="button" tabIndex={0}>伪按钮</div>);
    expect(landingOn(el(container, "role-button")).length).toBeGreaterThanOrEqual(1);
    cleanup();
    const { container: c2 } = render(<input type="radio" data-testid="radio" name="r" />);
    expect(landingOn(el(c2, "radio")).length).toBeGreaterThanOrEqual(1);
    expect(landingOn(el(c2, "radio")), "radio 被文本输入那条规则误伤（`:not([type=radio])` 掉了）")
      .not.toContain('input:not([type="checkbox"]):not([type="radio"])');
  });

  it("反向对照：类名不对的元素打不到（判据不是恒真）", () => {
    const { container } = render(<div data-testid="plain" className="not-a-target">普通 div</div>);
    expect(landingOn(el(container, "plain"))).toEqual([]);
  });
});

describe("② 安全网：宿主命中的规则集合做声明级审计（动效不得改变交互语义或布局）", () => {
  it("六族宿主 + 原语宿主命中的每条规则，声明全在白名单内", () => {
    const hosts: Array<readonly [string, () => ReactElement]> = [
      ["裸 button", () => <BareButton onClick={() => undefined} />],
      ["checkbox", () => <Checkbox onCheck={() => undefined} />],
      ["文本输入", () => <TextInput />],
      ["details", () => <Fold />],
      ["draggable 行", () => <DragRow onDragStart={() => undefined} />],
      ["separator", () => <Separator />],
    ];
    const bad: string[] = [];
    for (const [name, make] of hosts) {
      const { container } = render(make());
      const host = container.firstElementChild;
      if (host === null) throw new Error(`${name} 没有渲染出元素`);
      for (const selector of landingOn(host)) {
        const body = RULES.find((r) => r.selector === selector)?.body ?? "";
        for (const prop of offendersIn(body)) bad.push(`${name} ← ${selector} { ${prop} }`);
      }
      cleanup();
    }
    expect(bad, `宿主命中的规则声明了白名单外的属性（动效改了可交互性 / 布局）：\n${bad.join("\n")}`).toEqual([]);
  });

  it("审计器自身有牙：合成一条 `pointer-events: none` 必须当场报出（防真空）", () => {
    expect(offendersIn("filter: brightness(0.97); pointer-events: none;")).toEqual(["pointer-events"]);
    expect(offendersIn("transform: translateY(1px); opacity: .85;")).toEqual([]);
  });
});

describe("③ 交互语义零改动：点一遍（类名/属性契约与回调次数一字不变）", () => {
  it("裸 button：`onClick` 恰 1 次，且没有被塞 `disabled` / `aria-disabled`", () => {
    const onClick = vi.fn();
    const { container } = render(<BareButton onClick={onClick} />);
    const btn = el(container, "bare-button");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("原生 checkbox：点一下 `checked` 翻转 + `onChange` 恰 1 次（勾选语义不许被回执改动）", () => {
    const onCheck = vi.fn();
    const { container } = render(<Checkbox onCheck={onCheck} />);
    const box = el(container, "checkbox") as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onCheck).toHaveBeenCalledWith(true);
  });

  it("文本输入：改值即受控值更新（键入通路完整）", () => {
    const { container } = render(<TextInput />);
    const input = el(container, "text-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "会话标题" } });
    expect(input.value).toBe("会话标题");
  });

  it("draggable 行：`dragStart` 仍派发（拖拽起手通路完整）", () => {
    const onDragStart = vi.fn();
    const { container } = render(<DragRow onDragStart={onDragStart} />);
    fireEvent.dragStart(el(container, "drag-row"));
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it("真实生产宿主 `ColumnBar`（div+onClick、**无 role**）：点击恰 1 次，且**打不到**任何响应层规则", () => {
    const onClick = vi.fn();
    const { container } = render(<ColumnBar icon="▤" title="大纲" onClick={onClick} />);
    const bar = el(container, "column-bar");
    expect(bar.tagName).toBe("DIV");
    expect(bar.getAttribute("role"), "无 role 是余量登记的**前提**：补 role 会改 DOM 契约 ⇒ 属批 7/8").toBeNull();
    expect(landingOn(bar), "余量族不该被元素级规则命中（命中 = 登记表要改）").toEqual([]);
    fireEvent.click(bar);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("真实生产宿主 `ViewSwitcher`：点非当前段恰 1 次、点当前段 0 次（既有语义一字不变）", () => {
    const onChange = vi.fn();
    const { container } = render(<ViewSwitcher options={OPTIONS} value="raw" onChange={onChange} ariaLabel="会话视图" />);
    const segs = [...container.querySelectorAll("button")];
    expect(segs.length, "段控件没有渲染出真实 <button> ⇒ 判据会空真").toBe(2);
    fireEvent.click(segs[1]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("tritrack");
    fireEvent.click(segs[0]);
    expect(onChange, "点当前段不该回调（C4 的阻断面）").toHaveBeenCalledTimes(1);
  });
});

describe("④ 原语层不重复命中（回执只有一个真源：`Button.css` / `ViewSwitcher.css`）", () => {
  it("`Button` 与段控件都带 `ed-btn` 基类，且都**不**落进元素级 `:not(.ed-btn)` 那条", () => {
    const { container } = render(<Button>保存</Button>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.split(/\s+/)).toContain("ed-btn");
    expect(landingOn(root), "原语按钮被元素级规则二次命中 ⇒ 两份回执真源").toEqual([]);
    cleanup();
    const { container: c2 } = render(<ViewSwitcher options={OPTIONS} value="raw" onChange={() => undefined} ariaLabel="会话视图" />);
    const seg = c2.querySelector("button") as HTMLElement;
    expect(seg.className.split(/\s+/)).toContain("ed-btn");
    expect(seg.className.split(/\s+/)).toContain("ed-btn--segment");
    expect(landingOn(seg), "段控件被元素级规则二次命中 ⇒ 那份 120ms 会与 ViewSwitcher.css 打架").toEqual([]);
  });

  it("反例对照：把 `:not(.ed-btn)` 的效果去掉（用一个带 ed-btn 的裸 div 也不行）", () => {
    const { container } = render(<button type="button" data-testid="ed-btn-like" className="ed-btn">原语形态</button>);
    expect(landingOn(el(container, "ed-btn-like")), "`:not(.ed-btn)` 没生效 ⇒ 本判据有牙").toEqual([]);
  });
});
