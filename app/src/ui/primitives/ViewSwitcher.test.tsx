// @vitest-environment jsdom
/**
 * @ai-context ViewSwitcher.test.tsx —— `ViewSwitcher` 的**行为级契约**（批 5 Task 5；C14① + C15）。
 *
 * Why 每条判据都在这里（对计划 Step 4 的 W1–W7 逐条兑现，编号一一对应）：
 *   W1 选中态**恰好一段**且等于受控值（受控值不是"看着像"，是可数出来的）；
 *   W2 点击 ⇒ 回调**恰 1 次**且实参 = 该段 key；点**当前**段 ⇒ **0 次**（C4 的阻断面：不许白跑 flushSave）；
 *   W3 方向键/Home/End **只移焦点**、不改值（键盘用户不该在"路过"时被切走视图）；
 *   W4 状态**只经类与 `aria-pressed`**，根/段上**没有** `style` 属性（ADR-033 §4：行内 style 不得覆盖类语义）；
 *   W5 `disabled` ⇒ 点击**不**回调且段带原生 `disabled`（C4 的异步守卫期间由宿主门控）；
 *   W6 容器的可访问名 + 每段的可访问名 + roving tabindex（§8.6.1 第 4 条：无障碍优先于「活」）；
 *   W7 图标走 `ui/icons` 注册表（渲染出 `svg` 且**装饰性**；类型层由 `tsc` 承担，见报告 V2）；
 *   W8（C14① 的 §8.6.1 第 3 条）响应层接缝 `--ed-dur-micro` 120ms，且**没有新增未被覆盖的动效类**。
 *
 * 副作用：只挂 React 树 + 只读 `ViewSwitcher.css` / `motion.css` / 唯一真源产物 `../tokens.css`。边界：本仓未装 jest-dom ⇒ 原生 DOM API；
 *   jsdom **不是真浏览器** —— 真实观感/焦点环像素/真实粘性与动效一律登记为「未验证」（见 T5 报告 §未验证）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewSwitcher } from "./ViewSwitcher";
import type { ViewSwitcherOption } from "./ViewSwitcher";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(HERE, file), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");
const VS_CSS = stripComments(read("ViewSwitcher.css"));
const MOTION_CSS = stripComments(read("motion.css"));
/** 批 6 T5：时长/缓动的**唯一真源产物**已迁到 `ui/tokens.css`（`motion.css` 的临时变量块已删） */
const TOKENS_CSS = stripComments(read("../tokens.css"));

/** 取某选择器的规则体（选择器 → 第一个 `}`）—— 防「写在别的规则里也算过」 */
function bodyOf(css: string, sel: string): string {
  const at = css.indexOf(sel);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
}

/** W8b（R11.6 追加段）的扫描口径：一段 CSS 里的 `transition` 声明（`;` 切声明、锚属性名） */
const transitionDecls = (css: string): string[] => css.split(";").filter((d) => /(?:^|[;\s])transition\s*:/.test(d));
/** 其中**没走 token** 的那些（空数组 = 都走 token） */
const untokenedTransitions = (css: string): string[] => transitionDecls(css).filter((d) => !/var\(--ed-(?:dur|ease)/.test(d));

const OPTIONS: readonly ViewSwitcherOption[] = [
  { key: "raw", label: "原文", icon: "sessions" },
  { key: "tritrack", label: "三轨对齐", icon: "image" },
  { key: "proof", label: "印样" },
];
const ARIA = "会话视图";

/** 渲染一次，返回分段数组 + 回调 spy（`cleanup` 由 afterEach 统一做） */
function setup(value: string, disabled = false): { segs: HTMLButtonElement[]; onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();
  const { container } = render(
    <ViewSwitcher options={OPTIONS} value={value} onChange={onChange} ariaLabel={ARIA} disabled={disabled} />,
  );
  const root = container.firstElementChild;
  if (!root) throw new Error("ViewSwitcher 没有渲染出任何元素");
  return { segs: [...root.querySelectorAll("button")] as HTMLButtonElement[], onChange };
}
afterEach(cleanup);

describe("W1 受控选中态：`aria-pressed=\"true\"` 恰一段，且等于 `value`", () => {
  it("三个受控值各渲染 3 段；`true` 恰一个且逐字落在 value 那段上", () => {
    for (const value of ["raw", "tritrack", "proof"]) {
      const { segs } = setup(value);
      expect(segs, `${value}：分段数`).toHaveLength(OPTIONS.length);
      const pressed = segs.filter((s) => s.getAttribute("aria-pressed") === "true");
      expect(pressed, `${value}：aria-pressed="true" 必须恰一个`).toHaveLength(1);
      expect(pressed[0].textContent, `${value}：选中的不是 value 那段`).toBe(OPTIONS.find((o) => o.key === value)?.label);
      // 其余必须是显式的 `"false"`（不是缺属性）—— 缺属性时辅助技术读到"未定义"，CSS 也失去排除依据
      for (const s of segs.filter((x) => x !== pressed[0])) expect(s.getAttribute("aria-pressed")).toBe("false");
      cleanup();
    }
  });
});

describe("W2 回调纪律：只在 key 真的变化时回调一次", () => {
  it("点第 k 段 ⇒ `onChange` 恰 1 次、实参 = 第 k 个 key", () => {
    const { segs, onChange } = setup("raw");
    fireEvent.click(segs[1]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("tritrack");
    fireEvent.click(segs[2]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith("proof");
  });

  it("点**当前**段 ⇒ 0 次（否则「切到当前视图」会白跑一次 `flushSave`，C4）", () => {
    const { segs, onChange } = setup("raw");
    fireEvent.click(segs[0]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("W3 键盘：方向键 / Home / End 只移焦点，不改值（roving tabindex）", () => {
  it("ArrowRight 到下一段 · Home 到首段 · End 到末段，全程 `onChange` 0 次", () => {
    const { segs, onChange } = setup("raw");
    expect(fireEvent.keyDown(segs[0], { key: "ArrowRight" }), "处理器没拦下 ArrowRight（未 preventDefault）").toBe(false);
    expect(document.activeElement).toBe(segs[1]);
    fireEvent.keyDown(segs[1], { key: "End" });
    expect(document.activeElement).toBe(segs[2]);
    fireEvent.keyDown(segs[2], { key: "Home" });
    expect(document.activeElement).toBe(segs[0]);
    fireEvent.keyDown(segs[0], { key: "ArrowLeft" });
    expect(document.activeElement, "ArrowLeft 应环绕到末段").toBe(segs[2]);
    expect(onChange, "焦点移动不许触发回调（键盘路过 ≠ 切视图）").not.toHaveBeenCalled();
  });

  it("反例守门：无关键不被吞掉（`preventDefault` 只对本组件处理的键生效）", () => {
    const { segs } = setup("raw");
    expect(fireEvent.keyDown(segs[0], { key: "a" }), "无关键被 preventDefault = 吞键").toBe(true);
  });
});

describe("W4 状态只经类与 aria-pressed：根/段上不存在 `style` 属性（ADR-033 §4）", () => {
  it("每段 `className` 逐字为 `ed-btn ed-btn--segment`（选中/未选中**同一份** —— 状态不在类里）", () => {
    const { segs } = setup("tritrack");
    for (const s of segs) expect(s.className).toBe("ed-btn ed-btn--segment");
  });

  it("根元素与每一段的 `getAttribute(\"style\")` 恒为 null（含阳性对照：探针能看见 style 属性）", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ViewSwitcher options={OPTIONS} value="raw" onChange={onChange} ariaLabel={ARIA} disabled />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("style"), "根元素有行内 style").toBeNull();
    for (const s of root.querySelectorAll("button")) expect(s.getAttribute("style"), `段「${s.textContent}」有行内 style`).toBeNull();
    // 阳性对照（防真空）：同一个探针喂一个**已知带 style** 的节点必须非 null，否则上面两条是"测空气"
    const probe = document.createElement("button");
    probe.setAttribute("style", "background: red");
    expect(probe.getAttribute("style"), "探针看不见已知的 style 属性 ⇒ 上面的 null 断言不承重").not.toBeNull();
  });
});

describe("W5 disabled：点击不回调且段带原生 disabled（C4 的异步守卫期）", () => {
  it("disabled 时点击 0 次回调、每段 `disabled === true`；同一 spy 在启用态下**确实能**收到回调", () => {
    const off = setup("raw", true);
    fireEvent.click(off.segs[1]);
    fireEvent.click(off.segs[2]);
    expect(off.onChange, "disabled 期间回调了 ⇒ 异步守卫形同虚设").not.toHaveBeenCalled();
    for (const s of off.segs) {
      expect(s.disabled, "段必须带原生 disabled（移出 Tab 序 + 不派发 click）").toBe(true);
      expect(s.getAttribute("disabled")).not.toBeNull();
    }
    cleanup();
    // 阳性对照：证明上面的 spy 是通的（不是"spy 根本没接上"造成的假绿）
    const on = setup("raw");
    fireEvent.click(on.segs[1]);
    expect(on.onChange).toHaveBeenCalledTimes(1);
  });
});

describe("W6 无障碍：容器名 + 段可访问名 + roving tabindex", () => {
  it("容器 `role=\"group\"` 且可访问名 = `ariaLabel`；每段可访问名 = `label`", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ViewSwitcher options={OPTIONS} value="raw" onChange={onChange} ariaLabel={ARIA} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-label")).toBe(ARIA);
    for (const [i, s] of [...root.querySelectorAll("button")].entries()) expect(accName(s)).toBe(OPTIONS[i].label);
  });

  it("可访问名探针自证：`aria-label` 优先 · 纯文本可用 · **只有装饰性图形时报空**", () => {
    // ⚠️ 这里**不许**用 innerHTML 写标签字面量：`ui/icons/no-inline-svg.test.ts` 是**整文件文本级**
    // 棘轮（`readFileSync(f).includes("<" + "svg")` 那种子串判定，**注释与字符串同样计入**）⇒ 本行上方
    // 连"举例说明"的字面量都不能留（控制方 2026-09-12 插播实测的红：第一版把标签写进了注释，仍被判红）。
    // 改用 DOM API 造节点（`createElementNS` 的命名空间串不含尖括号 ⇒ 对棘轮不可见）。
    const el = document.createElement("button");
    const decorative = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    decorative.setAttribute("aria-hidden", "true");
    el.appendChild(decorative);
    expect(accName(el), "装饰性图形被算进名字 ⇒ 下面的名字断言不承重").toBe("");
    el.textContent = "原文";
    expect(accName(el)).toBe("原文");
    el.setAttribute("aria-label", "显式名");
    expect(accName(el)).toBe("显式名");
  });

  it("roving tabindex：选中段 `0`、其余 `-1`；值对不上任何 key 时仍恰有一段可 Tab（不把键盘用户挡在外面）", () => {
    const { segs } = setup("tritrack");
    expect(segs.map((s) => s.tabIndex)).toEqual([-1, 0, -1]);
    cleanup();
    const stray = setup("已删除的视图 key");
    expect(stray.segs.map((s) => s.tabIndex), "脏值时全组 -1 = 整组 Tab 不到").toEqual([0, -1, -1]);
    expect(stray.segs.filter((s) => s.getAttribute("aria-pressed") === "true"), "脏值不许假报选中").toHaveLength(0);
  });
});

/** 可访问名的**简化口径**（本仓未装 jest-dom / 计算式 a11y 库）：`aria-label` 优先，否则文本子节点 */
function accName(el: Element): string {
  const label = el.getAttribute("aria-label");
  if (label !== null && label.trim() !== "") return label.trim();
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("W7 图标走 `ui/icons`：渲染 `svg` 且为装饰性（不是 emoji、不污染可访问名）", () => {
  it("带 icon 的段内恰 1 个 `svg` 且 `aria-hidden=\"true\"`；段文本仍**逐字**等于 label", () => {
    const { segs } = setup("raw");
    expect(segs[0].querySelectorAll("svg")).toHaveLength(1);
    expect(segs[0].querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(segs[0].textContent).toBe("原文");
    // 负对照：不带 icon 的段必须 0 个 svg（否则上面的"恰 1 个"是个与入参无关的常数）
    expect(segs[2].querySelectorAll("svg"), "无 icon 的段渲染了 svg").toHaveLength(0);
    expect(segs[2].textContent).toBe("印样");
  });
});

describe("W8 响应层接缝（§8.6.1 第 3 条）：`--ed-dur-micro` 120ms + 不新增未被覆盖的动效类", () => {
  it("`.ed-btn--segment` 的三属性过渡都取 `var(--ed-dur-micro, 120ms)`，真源定值 = 120ms", () => {
    const body = bodyOf(VS_CSS, ".ed-btn--segment {");
    expect(body, "ViewSwitcher.css 缺 `.ed-btn--segment` 规则").not.toBe("");
    expect(body.match(/var\(--ed-dur-micro, 120ms\)/g) ?? [], "接缝不是三属性单值 120ms").toHaveLength(3);
    expect(body, "过渡缺 `transition:` 声明").toContain("transition:");
    expect(TOKENS_CSS, "`--ed-dur-micro` 的真源定值不是 120ms").toContain("--ed-dur-micro: 120ms;");
    // 反例守门：同一条取段器喂一条**没有**接缝的合成规则必须取不到 ⇒ 上面三条不承重时会露馅
    expect(bodyOf(".ed-btn--segment { color: var(--ed-ink-3); }", ".ed-btn--segment {")).not.toContain("transition:");
  });

  it("reduced-motion 由既有机制覆盖：段元素带 `ed-btn`（在 motion.css 名单里），且本文件无 `@media`/`@keyframes`", () => {
    const { segs } = setup("raw");
    for (const s of segs) expect(s.className.split(/\s+/), "段元素掉了基类 ⇒ motion.css 的规则打不到它").toContain("ed-btn");
    const block = MOTION_CSS.slice(MOTION_CSS.indexOf("@media (prefers-reduced-motion"));
    expect(block, "motion.css 的名单不含 `.ed-btn`（段类与基类同元素的前提被破坏）").toMatch(/\.ed-btn(?![\w-])/);
    expect(VS_CSS, "本文件写了 @media（reduced-motion 必须只有 motion.css 一处）").not.toContain("@media");
    expect(VS_CSS, "本文件写了动画落点（段控件是响应层，不是环境层）").not.toMatch(/(?:^|[;\s])(?:-(?:webkit|moz|ms|o)-)?animation(?:-name)?\s*:/);
  });

  /**
   * G3 改判（R1.2 / §七 G3 + **R11.6 追认**）：与计划 `### 表 4` 的 S5 一致 —— G3 的两条禁令
   * （本文件不得写 `@media` / `animation`）**原文逐字保留**（它们守的是别的东西：唯一 reduced-motion
   * 块 · 桶边界 · 与 G5 同向），本段**只追加**「transition 的值只许 token」的**正面判据**。
   * **更强**：旧版只有禁令 ⇒ 无法区分「没做」与「做对了」（段控件没接缝也是绿）；新版**禁令 + 正面
   * 判据**双向 ⇒ 每条各有一个独立失败模式。⚠️ 本段不改上面那个 `it` 的一字（`git diff` 可验）。
   */
  it("W8b（R11.6 追加）：段控件的 `transition` 值只许 token（补禁令的盲区：没接缝也曾经全绿）", () => {
    const decls = transitionDecls(VS_CSS);
    expect(decls.length, "段控件掉了响应层接缝（`transition`）⇒「切换视图」这一类没有回执").toBeGreaterThan(0);
    const untokened = untokenedTransitions(VS_CSS);
    expect(untokened, `段控件的时长/缓动必须走 var(--ed-dur-*) / var(--ed-ease*)：${untokened.join(" / ")}`).toEqual([]);
    // 仪器自证（双跑）：反例恰 1 条（**逐序数组相等**）、正例 0 条 —— 否则「0 条」是提取器坏了
    expect(untokenedTransitions("transition: background 120ms;"), "提取器抓不到裸值 ⇒ 上面是空真").toEqual([
      "transition: background 120ms",
    ]);
    expect(untokenedTransitions("transition: background var(--ed-dur-micro, 120ms);"), "token 正例被判成犯规 ⇒ 上面会假红").toEqual([]);
  });
});
