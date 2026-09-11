// @vitest-environment jsdom
/**
 * @ai-context StatusLine.test.tsx —— 状态行的**契约**测试（批 0-D Task 12；规格 §5.1 / §4.1 / §8.6.1）。
 *
 * Why jsdom：要断言真实 DOM 上的 `role` / 类名 / 两个槽的渲染与缺席。但 jsdom **不加载样式表**
 * （`vitest.config.ts` 的 `css` 为 false）⇒ 样式类契约与用色契约一律**读文本**（范式 C，同
 * `ConfirmDialog.test.tsx` / `Modal.test.tsx`）。
 *
 * 本文件钉住四件事：
 *   ① 四档 kind 的类映射 + `role` **二值契约**（`error → alert` 立即播报，其余三档 → `status`）；
 *   ② `detail` / `action` 两个槽的渲染与**缺席**行为（缺席时不得凭空出现按钮、空节点或
 *      `data-testid="undefined"`）；
 *   ③ **危险语义用色**（控制方 2026-09-11 裁决③）：危险色只作文字色 —— 出处是 **token 真源注释**
 *      （`app/scripts/gen-tokens.mjs:47` → `ui/tokens.css:19` 的「绝不用于按钮」；规格 §4.1 那一行
 *      只写到「只用于状态戳」）。本原语 CSS 里连底色声明都没有，且**结构上不可能渲染按钮**
 *      （不 import `Button`）；与 Task 14 Step 1 第 4 条的批次守卫**同向**（同一判据、同一方向）。
 *   ④ 动效接缝与 reduced-motion：浮现过渡的可动画属性齐备、**无循环动画**（环境层不得抢注意力）、
 *      `.ed-status` 已进 `motion.css` 那条唯一的媒体查询名单。
 *
 * 副作用：无（只挂 React 树 + 读四个文本文件）。**不用假计时器**：本原语没有计时器、没有 presence
 * 状态机（浮现是纯 CSS transition 的接缝，驱动权在批 6）。
 * 边界：不用 jest-dom（本仓未装）—— 一律 `getAttribute` / `textContent` / `queryAllByRole`。
 */
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { StatusLine } from "./StatusLine";
import type { StatusKind } from "./StatusLine";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 归一 EOL（本仓无 `.gitattributes` 且 `core.autocrlf=true`，逐字节断言会在别人机器上假阳性） */
const readText = (n: string): string => readFileSync(join(HERE, n), "utf8").replace(/\r\n/g, "\n");
const STATUS_TSX = readText("StatusLine.tsx");
const STATUS_CSS = readText("StatusLine.css");
const MOTION_CSS = readText("motion.css");
const INDEX_TS = readText("index.ts");
/** 判据前先剥注释（注释里提到反例不该让守卫误报 —— 同 `style-seams.test.ts` 的口径） */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");

const cls = (el: Element): string => el.getAttribute("class") ?? "";
const line = (): HTMLElement => screen.getByTestId("st");
/** 取某条规则的声明体（`选择器 {` 到该规则第一个 `}`）；容忍对齐用的多余空白 */
const rule = (css: string, selector: string): string => {
  const m = new RegExp(`${selector.replace(/\./g, "\\.")}\\s*\\{`).exec(css);
  expect(m, `CSS 缺少 ${selector} 的规则`).not.toBeNull();
  if (m === null) throw new Error(`CSS 缺少 ${selector} 的规则`);
  return css.slice(m.index, css.indexOf("}", m.index));
};

/** 规则体里 `{` 之后、`}` 之前的声明原文（断言「这条规则只写了什么」时用它） */
const decls = (css: string, selector: string): string => rule(css, selector).replace(/^[^{]*\{/, "").trim();

/** 契约里的 `role` 二值表（§5.2 的弹层语义之外，状态行自己的一条无障碍契约） */
const ROLES: ReadonlyArray<readonly [StatusKind, "alert" | "status"]> = [
  ["error", "alert"],
  ["warn", "status"],
  ["info", "status"],
  ["ok", "status"],
];

afterEach(cleanup);

describe("① 四档 kind 与 role 二值契约", () => {
  for (const [kind, role] of ROLES) {
    it(`${kind} → 类 ed-status--${kind} + role=${role}`, () => {
      render(
        <StatusLine kind={kind} testId="st">
          保存失败
        </StatusLine>,
      );
      expect(cls(line())).toContain(`ed-status--${kind}`);
      expect(line().getAttribute("role")).toBe(role);
      expect(line().getAttribute("data-kind")).toBe(kind);
    });
  }

  it("默认 kind=info（信息档是中性默认），类名一个不多一个不少", () => {
    render(<StatusLine testId="st">已保存</StatusLine>);
    expect(cls(line())).toBe("ed-status ed-status--info");
    expect(line().getAttribute("role")).toBe("status");
    expect(screen.getByRole("status")).toBe(line());
  });

  it("error 档进无障碍树的 alert（「收到了」不必等一次朗读结束）", () => {
    render(
      <StatusLine kind="error" testId="st">
        保存失败
      </StatusLine>,
    );
    expect(screen.getByRole("alert")).toBe(line());
  });

  it("不重复声明 aria-live（两个 role 已隐含对应值，重复声明 = 第二个真源）", () => {
    for (const [kind] of ROLES) {
      render(
        <StatusLine kind={kind} testId="st">
          x
        </StatusLine>,
      );
      expect(line().getAttribute("aria-live")).toBeNull();
      cleanup();
    }
  });

  it("testId 缺席 ⇒ 不产生 `data-testid` 属性（不得渲染成字符串 undefined）", () => {
    render(<StatusLine>已保存</StatusLine>);
    const root = screen.getByRole("status");
    expect(root.hasAttribute("data-testid")).toBe(false);
    expect(root.outerHTML).not.toContain("undefined");
  });

  it("语义色只走类、不出内联 style（否则批 6 只能逐处改）", () => {
    render(
      <StatusLine kind="error" testId="st" detail="检查网络后重试">
        保存失败
      </StatusLine>,
    );
    expect(line().getAttribute("style")).toBeNull();
  });
});

describe("② detail / action 两个槽（缺席时不得凭空多出节点）", () => {
  it("主文案继承容器的语义色（`ed-text--inherit`），不是自己挑一档墨度", () => {
    render(
      <StatusLine kind="error" testId="st" detail="检查网络后重试">
        保存失败
      </StatusLine>,
    );
    const main = screen.getByText("保存失败");
    expect(cls(main)).toContain("ed-text--inherit");
    expect(cls(main)).toContain("ed-text--s5");
  });

  it("detail 渲染为次级文本（`ink-3`）：技术细节不该被语义色染红", () => {
    render(
      <StatusLine kind="error" testId="st" detail="检查网络后重试">
        保存失败
      </StatusLine>,
    );
    expect(cls(screen.getByText("检查网络后重试"))).toContain("ed-text--ink-3");
    expect(cls(screen.getByText("检查网络后重试"))).not.toContain("ed-text--inherit");
  });

  it("不传 detail ⇒ 只有主文案；传了才多一个节点（含空串也算传了）", () => {
    const { rerender } = render(
      <StatusLine testId="st">已保存</StatusLine>,
    );
    expect(line().textContent).toBe("已保存");
    expect(line().children).toHaveLength(1);
    rerender(
      <StatusLine testId="st" detail="3 分钟前">
        已保存
      </StatusLine>,
    );
    expect(line().textContent).toBe("已保存3 分钟前");
    expect(line().children).toHaveLength(2);
  });

  it("action 槽原样渲染（形态由调用方决定），且是容器最后一个子节点", () => {
    render(
      <StatusLine
        kind="error"
        testId="st"
        detail="检查网络"
        action={
          <button type="button" data-testid="retry">
            重试
          </button>
        }
      >
        保存失败
      </StatusLine>,
    );
    const retry = screen.getByTestId("retry");
    expect(retry.textContent).toBe("重试");
    expect(line().lastElementChild).toBe(retry);
  });

  it("children 原样渲染：中文、嵌套元素、多子节点都不动", () => {
    render(
      <StatusLine testId="st">
        「高数」导入失败：<strong>第 3 段</strong>为空
      </StatusLine>,
    );
    expect(line().textContent).toBe("「高数」导入失败：第 3 段为空");
    expect(line().querySelector("strong")?.textContent).toBe("第 3 段");
  });
});

describe("③ 危险语义用色（控制方裁决③ · 与 Task 14 第 4 条守卫同向）", () => {
  it("本原语**结构上不可能渲染按钮**：不 import Button、源码里没有 button 元素", () => {
    expect(STATUS_TSX, "状态行自己不产按钮 —— 按钮由 action 槽外部传入").not.toContain('from "./Button"');
    expect(STATUS_TSX).not.toMatch(/<button/);
  });

  it("四档全是 `color:` 声明；CSS 里连底色声明都没有（该 token 绝不作任何元素的底色）", () => {
    const clean = stripComments(STATUS_CSS);
    for (const kind of ["error", "warn", "info", "ok"]) {
      const decl = rule(clean, `.ed-status--${kind}`);
      expect(decl, `${kind} 档必须只写文字色`).toMatch(/color:\s*var\(--ed-/);
      expect(decl).not.toContain("background");
    }
    expect(clean, "本文件不得出现任何底色声明").not.toMatch(/background/);
  });

  it("危险色在本文件只出现一次，且那一次在 `color:` 值位（报告里的同向证据）", () => {
    const clean = stripComments(STATUS_CSS);
    const hits = clean.split("\n").filter((l) => l.includes("var(--ed-stamp)"));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("color: var(--ed-stamp)");
    expect(decls(clean, ".ed-status--error")).toBe("color: var(--ed-stamp);");
  });

  it("本层零颜色字面量（色值只许在 ui/tokens.css 与 token 生成器里）", () => {
    const clean = stripComments(STATUS_CSS);
    expect(clean).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(clean).not.toMatch(/\b(?:rgb|hsl)a?\(/);
    expect(STATUS_TSX, "TSX 里也不得写色值（内联 style 会绕开类契约）").not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("error 档不渲染任何按钮（结构保证的行为面：无 action 就无按钮）", () => {
    render(
      <StatusLine kind="error" testId="st" detail="详情">
        保存失败
      </StatusLine>,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("④ 动效接缝与 reduced-motion（§8.6.1 四条硬约束）", () => {
  it("浮现钩子：`.ed-status` 的 transition 同时含 `color` 与 `opacity`，单属性 120ms（可中断、不排队）", () => {
    const decl = rule(stripComments(STATUS_CSS), ".ed-status");
    expect(decl).toContain("transition:");
    expect(decl).toMatch(/transition:[^;]*color\s+var\(--ed-dur-micro, 120ms\)/);
    expect(decl).toMatch(/opacity\s+var\(--ed-dur-micro, 120ms\)/);
    expect(decl, "时长必须带同值兜底字面量（批 6 删变量块即生效）").toContain("var(--ed-ease, cubic-bezier(0.2, 0, 0, 1))");
  });

  it("不抢注意力：无 `@keyframes`、无 `animation`、无 `infinite`（探针摆动是 Loading 的落点，不是状态行的）", () => {
    const clean = stripComments(STATUS_CSS);
    expect(clean).not.toMatch(/@keyframes/);
    expect(clean).not.toMatch(/\banimation/);
    expect(clean).not.toMatch(/infinite/);
  });

  it("不越界：不写 z-index、不写 position（层级是 ui/zIndex.ts 标尺的职责，定位属调用点）", () => {
    const clean = stripComments(STATUS_CSS);
    expect(clean).not.toMatch(/z-index/);
    expect(clean).not.toMatch(/position\s*:/);
  });

  it("reduced-motion 覆盖：`.ed-status` 已进 motion.css 那条唯一的媒体查询名单", () => {
    const clean = stripComments(MOTION_CSS);
    expect(clean.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1);
    const block = clean.slice(clean.indexOf("@media (prefers-reduced-motion"));
    expect(block, "名单缺本原语的基类 ⇒ reduced-motion 用户仍会看到浮现过渡").toContain(".ed-status");
    expect(block).toContain("transition-duration: 1ms !important");
  });

  it("批 4 的消费入口：barrel 导出了本原语与它的两个类型", () => {
    expect(INDEX_TS).toContain('export { StatusLine } from "./StatusLine";');
    expect(INDEX_TS).toContain('export type { StatusKind, StatusLineProps } from "./StatusLine";');
  });
});
