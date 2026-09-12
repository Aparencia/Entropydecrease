/**
 * @ai-context responseCoverage.test.ts — **响应层七类动作回执的覆盖守卫**（批 6 T12；node 环境，无 DOM）。
 *
 * Why：规格 §8.6.1 第 2 条逐字列七类动作（点击 / 拖拽 / 悬停 / 键入 / 勾选 / 展开折叠 / 切换视图），
 *   每类都必须有即时回执，且逐字「**这是验收口径，不是形容词**：批 6 收口时逐类动作列出其响应层
 *   动效，缺一即不达标」。T12 的兑现方式 = **元素级全局回执**（`motion.css` 的响应层节，零调用点
 *   改动）+ 原语层（`Button.css` 的焦点环落纸 / `ViewSwitcher.css` 的段控件），本文件把「每一类在
 *   **今天的调用面**上真能拿到回执」写成机器判据：
 *   ① 逐类：**真实调用点形态**（实测下界）+ **落点**（元素选择器 ∨ 原语层选择器）两侧都要在；
 *   ② 声明集合审计（安全网）：响应层不得声明任何会改变交互语义或布局的属性；
 *   ③ 未覆盖余量**逐条登记**且锚到真实文件（登记表不许说谎：每条都要在盘上仍然存在）；
 *   ④ reduced-motion **双向包含**（落点全在名单里 · 名单里没有死条目）；
 *   ⑤ 三档同行为（§8.5 节能档逐字「只留响应层」）+ 桶边界（无 `@media` / `@keyframes` / `animation`）
 *      + 单一真源（零 `--ed-*` 定义）+ token 时长/缓动（兜底 == 生成器真源）；
 *   ⑥ 控制方 2026-09-13 追加的两条（T6 评审 I-2 / I-3）：reduced 块的**每条声明都带 `!important`**
 *      （「系统优先于档位」的**真实承重机理**）与「档位块与 reduced 块之间零规则块」；
 *   ⑦ 原语层的焦点环"落纸"（`Button.css`：基准态透明 outline 给插值起点）。
 *
 * 副作用：只读磁盘（`app/src` 全树 + `primitives/*.css` + `gen-tokens.mjs` 的导出），不修改任何文件。
 * 边界：① 口径 = 剥注释后的文本（本仓 3 起「注释字面量骗过整文件扫描器」的先例）；
 *   ② 调用点计数一律**下界**（并行任务新增文件不该让判据变红），余量表用**精确长度 + 锚**；
 *   ③ jsdom 侧的可达性与交互语义判据在 `responseReceipt.dom.test.tsx`（本文件无 DOM）；
 *   ④ 🔴 本文件不得出现 `var(--ed-dur-` / `var(--ed-ease` 的**裸串**（`motionTokens.consumption.test.ts`
 *      会把它们当成缺兜底的消费点 ⇒ 假红）⇒ 一律用转义正则。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SRC, baseSelector, offendersIn, productionFiles, readPrimitiveCss, reducedMotionSelectors,
  responseRules, responseTransitionSelectors, stripComments,
} from "./responseScan";

const RULES = responseRules();
const SELECTORS: readonly string[] = [...new Set(RULES.map((r) => r.selector))];
/** 落点的**基选择器**（剥掉状态伪类）：判"这一类动作的落点在不在"用它，判"名单是否逐字完整"用原名 */
const BASE_SELECTORS: readonly string[] = [...new Set(RULES.map((r) => baseSelector(r.selector)))];
const hasLanding = (shape: string): boolean => BASE_SELECTORS.some((s) => s.includes(shape));
const TRANSITION_SELECTORS = responseTransitionSelectors();
const REDUCED_SELECTORS = reducedMotionSelectors();

/** 审计器的反例样本：只声明这些 = 顺手改了可交互性 / 布局（响应层绝不允许） */
const FORBIDDEN_SAMPLE = "display: none; width: 10px; pointer-events: none;";

/** 响应层的**元素形态**（每一类动作落到的选择器形态；`null` = 该类由原语层承担） */
interface ActionClass {
  readonly name: string;
  /** 该类在响应层里的落点（至少一条命中才算有回执） */
  readonly elements: readonly string[];
  /** 该类在**原语层**的承载体（样式表 + 选择器）；`null` = 今天没有原语 */
  readonly primitive: { readonly file: string; readonly selector: string } | null;
  /** 今天的调用面形态（正则 + 下界）：下界是"这一类真有调用点"的见证 */
  readonly callSites: { readonly re: RegExp; readonly min: number; readonly what: string };
}
const ACTION_CLASSES: readonly ActionClass[] = [
  {
    name: "点击", elements: ["button:not(.ed-btn)", '[role="button"]'],
    primitive: { file: "Button.css", selector: ".ed-btn" },
    callSites: { re: /<button[\s>]/g, min: 400, what: "裸 `<button>`" },
  },
  {
    name: "拖拽", elements: ['[draggable="true"]', '[role="separator"]'], primitive: null,
    callSites: { re: /onPointerDown=|onDragStart=|setPointerCapture/g, min: 3, what: "拖拽起手" },
  },
  {
    name: "悬停", elements: ["button:not(.ed-btn)", "details > summary", '[role="separator"]'],
    primitive: { file: "Surface.css", selector: ".ed-surface--interactive:hover" },
    callSites: { re: /onPointerEnter=|onMouseEnter=|onMouseLeave=/g, min: 7, what: "JS 悬停" },
  },
  {
    name: "键入", elements: ['input:not([type="checkbox"]):not([type="radio"])', "textarea"], primitive: null,
    callSites: { re: /<input[\s>]|<textarea[\s>]/g, min: 110, what: "输入元素" },
  },
  {
    name: "勾选", elements: ['input[type="checkbox"]'], primitive: null,
    callSites: { re: /type="checkbox"/g, min: 25, what: "原生 checkbox" },
  },
  {
    name: "展开折叠", elements: ["details > summary"], primitive: null,
    callSites: { re: /setManualFolded|setFolded|onToggleFold|setExpanded/g, min: 25, what: "折叠动作" },
  },
  {
    name: "切换视图", elements: [], primitive: { file: "ViewSwitcher.css", selector: ".ed-btn--segment" },
    callSites: { re: /<ViewSwitcher|onViewKeyChange|setTab\(|setMiddleView\(/g, min: 12, what: "切换入口" },
  },
];

const PROD = productionFiles();
const hitsOf = (re: RegExp): number => PROD.reduce((n, f) => n + [...f.text.matchAll(re)].length, 0);

/** 未覆盖余量：每条都必须**锚到盘上仍然存在**的调用点（登记表不许说谎） */
interface Remainder {
  readonly key: string;
  readonly why: string;
  readonly file: string;
  readonly anchor: RegExp;
}
const UNCOVERED: readonly Remainder[] = [
  {
    key: "点击 · 裸 div+onClick 且无 role（395 处里的这一族）",
    why: "div 不是按钮语义；补 role 会改 DOM 契约（撞棘轮）⇒ 属批 7/8 的无障碍收口",
    file: "components/ColumnBar.tsx", anchor: /onClick=\{onClick\}/,
  },
  {
    key: "拖拽 · ColumnResizer 的行内 transition 遮蔽类级过渡",
    why: "行内 `transition` shorthand 整条替换类上的 transition ⇒ 元素级只给状态回执；它自带的 0.15s 背景半场保留",
    file: "components/ColumnResizer.tsx", anchor: /transition: "background 0\.15s"/,
  },
  {
    key: "拖拽 · NoteTreeSection 的 pointerdown 起手（无 role / 无 draggable）",
    why: "该行没有可元素级命中的形态标记 ⇒ 只能靠调用点补标记（批 7/8）",
    file: "components/NoteTreeSection.tsx", anchor: /onPointerDown=/,
  },
  {
    key: "悬停 · 自建 tabbar / 画布浮钮的行高亮（8 处里的 JS 状态族）",
    why: "hover 靠 JS 改行内底色，元素选择器打不到（无 role / 无类）",
    file: "shell/CommandPalette.tsx", anchor: /onMouseEnter=/,
  },
  {
    key: "切换视图 · 自建 tabbar 按钮（未走 ViewSwitcher 原语）",
    why: "自建 tabbar 是裸 `<button>` ⇒ 只拿到①的按钮回执，没有段控件的选中态回执",
    file: "pages/KnowledgePage.tsx", anchor: /setMiddleView\(/,
  },
  {
    key: "勾选 · 无自定义勾选原语（26 处全是原生 checkbox）",
    why: "「勾选框落笔」的完整形态（笔画生长）需要自定义原语 ⇒ 本任务只能给元素级 accent-color 落墨",
    file: "components/GroupDeleteConfirm.tsx", anchor: /type="checkbox"/,
  },
  {
    key: "键入 · 行内 border 遮蔽 token 色那一半",
    why: "调用点行内写了 border 色（如 #0d9488）⇒ 类级的 border-color 过渡打不到；焦点环那一半仍然生效",
    file: "components/session-detail/SessionDetailHeader.tsx", anchor: /border: "1px solid #0d9488"/,
  },
];

/** 元素级覆盖的形态数（勾选/单选 · 文本输入 · 按钮或 role=button · summary · draggable · separator） */
const ELEMENT_SHAPES: readonly string[] = [
  'input[type="checkbox"]', 'input[type="radio"]',
  'input:not([type="checkbox"]):not([type="radio"])', "textarea",
  "button:not(.ed-btn)", '[role="button"]', "details > summary",
  '[draggable="true"]', '[role="separator"]',
];

describe("① 七类动作逐类覆盖：今天的调用面形态 + 回执落点，缺一即不达标（§8.6.1 第 2 条）", () => {
  it("守卫自身的防空真闸：响应层节非空、七类表恰 7 行、下界全为正", () => {
    expect(RULES.length, "响应层节解析出 0 条规则 ⇒ 标记被改名或节被删空").toBeGreaterThanOrEqual(8);
    expect(ACTION_CLASSES, "七类动作表不得缩水").toHaveLength(7);
    expect(ACTION_CLASSES.every((c) => c.callSites.min > 0)).toBe(true);
    expect(UNCOVERED.length, "余量表被清空 = ③ 退化成空真").toBeGreaterThan(0);
  });

  for (const cls of ACTION_CLASSES) {
    it(`${cls.name}：调用面真有「${cls.callSites.what}」（≥${cls.callSites.min}）且落点在位`, () => {
      const n = hitsOf(cls.callSites.re);
      expect(n, `${cls.name} 的调用面实测 ${n} < 下界 ${cls.callSites.min} ⇒ 整类判据会变成空真`).toBeGreaterThanOrEqual(cls.callSites.min);
      if (cls.elements.length > 0) {
        for (const sel of cls.elements) {
          expect(hasLanding(sel), `${cls.name} 的落点 ${sel} 不在响应层节里（基选择器口径）`).toBe(true);
        }
        return;
      }
      expect(cls.primitive, `${cls.name} 既没有元素级落点、也没有原语承载`).not.toBeNull();
      const { file, selector } = cls.primitive as { file: string; selector: string };
      expect(readPrimitiveCss(file), `${cls.name} 的原语落点 ${selector} 在 ${file} 里没有规则`).toContain(selector);
    });
  }
});

describe("② 安全网：响应层的声明集合审计（动效不得改变交互语义或布局）", () => {
  it("每个声明都在白名单里（`pointer-events` / `display` / `width` … 一律不许出现）", () => {
    const offenders = RULES.flatMap((r) =>
      offendersIn(r.body).map((p) => `${r.selector} { ${p} }`),
    );
    expect(offenders, `响应层声明了白名单外的属性：\n${offenders.join("\n")}`).toEqual([]);
  });

  it("反例对照：审计器对已知违规样本必须报满（否则上面那条是恒真）", () => {
    expect(offendersIn(FORBIDDEN_SAMPLE)).toEqual(["display", "width", "pointer-events"]);
    expect(offendersIn("transform: translateY(1px); filter: brightness(0.97);")).toEqual([]);
  });

  it("覆盖形态数 = 9 条选择器 / 6 个元素族（少一条形态就是某一类掉了回执）", () => {
    expect(ELEMENT_SHAPES, "形态表不得缩水").toHaveLength(9);
    for (const sel of ELEMENT_SHAPES) expect(hasLanding(sel), `形态 ${sel} 不在响应层节里`).toBe(true);
    // 阳性对照：形态表用的基选择器口径必须真的剥掉了状态（否则"落点在位"会退化成逐字比对）
    expect(baseSelector('details[open] > summary')).toBe("details > summary");
    expect(baseSelector('button:not(.ed-btn):not(:disabled):hover')).toBe("button:not(.ed-btn)");
  });
});

describe("③ 未覆盖余量逐条登记（防「把余量写成 0」；登记表必须锚到真实调用点）", () => {
  it(`余量恰 ${UNCOVERED.length} 条，且每条锚点在盘上仍然存在`, () => {
    expect(UNCOVERED.map((r) => r.key)).toHaveLength(UNCOVERED.length);
    expect(UNCOVERED.length, "余量条数变了 ⇒ 先核实再改这个数（不许写 0）").toBe(7);
    for (const r of UNCOVERED) {
      const abs = join(SRC, ...r.file.split("/"));
      expect(existsSync(abs), `余量登记指向不存在的文件：${r.file}`).toBe(true);
      expect(stripComments(readFileSync(abs, "utf8")), `${r.file} 里的锚点已消失（余量被覆盖了？改登记）`).toMatch(r.anchor);
      expect(r.why.length, `${r.key} 缺非空理由`).toBeGreaterThan(12);
    }
  });

  it("原语层的差集也登记到位：勾选/键入/折叠三类今天**没有**原语承载（不许声称有）", () => {
    const noPrimitive = ACTION_CLASSES.filter((c) => c.elements.length > 0 && c.primitive === null).map((c) => c.name);
    expect(noPrimitive, "这三类今天没有自定义原语 ⇒ 落点只能是元素级（如实登记）").toEqual(["拖拽", "键入", "勾选", "展开折叠"]);
  });
});

describe("④ reduced-motion 双向包含（落点全在名单里 · 名单里没有死条目）", () => {
  it("每个声明了 transition 的落点选择器都逐字在名单里（漏一个 = 那一处在 reduced-motion 下照旧动）", () => {
    expect(TRANSITION_SELECTORS.length, "响应层一处 transition 落点都没有 ⇒ 本节是空真").toBeGreaterThanOrEqual(6);
    const missing = TRANSITION_SELECTORS.filter((s) => !REDUCED_SELECTORS.includes(s));
    expect(missing, `这些落点不在 motion.css 的 reduced-motion 名单里：\n${missing.join("\n")}`).toEqual([]);
  });

  it("反向：名单里每个非 `.ed-*` 条目都对应响应层的一处落点（防「删了规则留死名单」）", () => {
    const elementEntries = REDUCED_SELECTORS.filter((s) => !s.startsWith("."));
    const dead = elementEntries.filter((s) => !hasLanding(s));
    expect(dead, `名单里的元素选择器在响应层节里没有对应落点：\n${dead.join("\n")}`).toEqual([]);
    // 阳性对照：`[role="separator"]` 只有状态规则（`[role="separator"]:hover`）也必须算落点在位
    expect(elementEntries).toContain('[role="separator"]');
    expect(elementEntries).toContain("textarea");
    expect(REDUCED_SELECTORS).toContain(".ed-btn");
    expect(SELECTORS.length, "响应层选择器表不得为空").toBeGreaterThanOrEqual(8);
  });
});
