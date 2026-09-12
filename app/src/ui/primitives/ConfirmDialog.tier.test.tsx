// @vitest-environment jsdom
/**
 * @ai-context ConfirmDialog.tier.test.tsx —— `ConfirmDialogProps.tier` 的**透传**契约（批 4 T2；B6 缺口 B）。
 *
 * Why：ADR-033 后果④逐字「`ConfirmDialogProps` 无 `tier` ⇒ 弹层内再弹拿不到 `modalNested`（登记为批 4
 * 观察项）」—— 实测**≥3 处结构性嵌套**（`InterviewDialog → GoalPlanApprovalDialog` ·
 * `NoteAiDialog → RefineLaunchDialog/RefineWorkbench` · `RouteInfoPopover → GroupDeleteConfirm/
 * ModelCardCreateDialog`）⇒ 按 B6 阈值「同一缺口 ≥3 个调用点共用 ⇒ 改原语」加**透传**。
 * 「改调用点」在这里**结构上不可表达**：消费者拿不到 `modalNested`（那是 `Modal` 的档位，
 * 且 ADR-033 §4 逐字禁止用行内 `style` 覆盖类语义）。本任务**不新增档位**、不动 `ModalTier` 联合。
 *
 * Why 三条 + 一条同源守卫：
 *   ① 不传 `tier` ⇒ 仍是 `modal`(300)：**默认值不许漂移**（迁移的 8 处顶层确认不传它）；
 *   ② 传 `tier="modalNested"` ⇒ 400：档位来自 `Z_TIER` 标尺，不是裸数字；
 *   ③ **真场景**：`ConfirmDialog` 落在另一个 `Modal` 的子树里 ⇒ 必须能拿到 400（这正是观察项的原话）；
 *   ④ 同源守卫：`ConfirmDialog.tsx` 里 `ModalTier` 只解析一次（局部别名不许漂移）。
 *
 * 副作用：无（只挂 React 树 + 读 1 个文本文件）。
 * 边界：不用 jest-dom（本仓未装）；`zIndex` 断言读内联 `style`（`Modal` 写的就是内联标尺值）。
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Z_TIER } from "../zIndex";
import { ConfirmDialog } from "./ConfirmDialog";
import type { ConfirmDialogProps } from "./ConfirmDialog";
import { Modal } from "./Modal";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 判据要数的关键字（写成常量：口径锚与正文共用同一份，避免两处正则各自漂移） */
const STRIP_PROBE = /ModalTier/g;
/** 归一 EOL 后剥块注释（本仓无 `.gitattributes` 且 `core.autocrlf=true`） */
const CONFIRM_SRC = readFileSync(join(HERE, "ConfirmDialog.tsx"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

const noop = (): void => undefined;
const overlay = (): HTMLElement => document.body.querySelector('[data-testid="cd-overlay"]') as HTMLElement;
const tierOf = (): string => overlay().style.zIndex;
const numericTier = (): number => Number(tierOf());

afterEach(cleanup);

/**
 * 只渲染一个受控确认框（`tier` 按需给）。
 * ⚠️ `open` 必须**先解构出来**再展开 `rest`：写成 `open={props.open} … {...props}` 会命中
 * TS2783（同一 prop 指定两次、后者覆盖前者）—— 而 **vitest 走 esbuild 只剥类型、不做类型检查**
 * ⇒ 那种写法在测试里全绿、只有 `tsc --noEmit` 会红（本批 T1 踩过一次）。
 */
function Plain({ open, ...rest }: Partial<ConfirmDialogProps> & { open: boolean }) {
  return <ConfirmDialog open={open} title="删除「高数」？" onConfirm={noop} onCancel={noop} testId="cd" {...rest} />;
}

/** 真场景：确认框渲染在**另一个弹层**的子树里（弹层内再弹） */
function InsideModal({ tier }: { tier?: ConfirmDialogProps["tier"] }) {
  return (
    <Modal open onClose={noop} title="外层弹层" testId="outer" tier="modal">
      <ConfirmDialog
        open
        tier={tier}
        title="删除「高数」？"
        onConfirm={noop}
        onCancel={noop}
        testId="cd"
      />
    </Modal>
  );
}

describe("① 默认档位不漂移（迁移的 8 处顶层确认不传 `tier`）", () => {
  it("不传 tier ⇒ `modal`(300)，且不是裸数字", () => {
    render(<Plain open />);
    expect(numericTier()).toBe(Z_TIER.modal);
    expect(String(Z_TIER.modal), "档位必须来自 zIndex 标尺").toBe("300");
  });

  it("tier=undefined 与完全不传同值（可选字段的语义）", () => {
    const { unmount } = render(<Plain open tier={undefined} />);
    const implicit = numericTier();
    unmount();
    render(<Plain open />);
    expect(numericTier()).toBe(implicit);
  });
});

describe("② 显式 modalNested ⇒ 400（ADR-033 后果④的档位）", () => {
  it("tier='modalNested' ⇒ `Z_TIER.modalNested`(400) 而**不是** 300", () => {
    render(<Plain open tier="modalNested" />);
    expect(numericTier()).toBe(Z_TIER.modalNested);
    expect(numericTier(), "两层必须真的分得开").not.toBe(Z_TIER.modal);
  });
});

describe("③ 真场景：确认框落在另一个弹层里 ⇒ 拿到 400", () => {
  it("嵌套时内层确认框 zIndex === modalNested；外层仍是 modal（各归各的档）", () => {
    render(<InsideModal tier="modalNested" />);
    const outer = document.body.querySelector('[data-testid="outer-overlay"]') as HTMLElement;
    expect(Number(overlay().style.zIndex)).toBe(Z_TIER.modalNested);
    expect(Number(outer.style.zIndex)).toBe(Z_TIER.modal);
    expect(numericTier(), "内层必须压在外层上").toBeGreaterThan(Number(outer.style.zIndex));
  });

  it("对照组：同一个嵌套宿主**不传** tier ⇒ 内层仍是 300（等于外层 ⇒ 叠放错，这是迁移必须显式传参的原因）", () => {
    render(<InsideModal />);
    const outer = document.body.querySelector('[data-testid="outer-overlay"]') as HTMLElement;
    expect(numericTier()).toBe(Z_TIER.modal);
    expect(numericTier()).toBe(Number(outer.style.zIndex));
  });
});

describe("④ 同源守卫：`tier` 的声明与透传必须成对（只有一处不许漂移）", () => {
  it("`ModalTier` 恰好 2 处（import 一行 + `tier?:` 一行）；`<Modal` 上有 `tier=` 透传", () => {
    const hits = (CONFIRM_SRC.match(STRIP_PROBE) ?? []).length;
    expect(hits, `ModalTier 出现 ${hits} 次（应为 2：import 一行 + 声明一行；多出 = 有人在本地重声明这个联合，` +
      `那会让它悄悄脱离 ui/zIndex 标尺）`).toBe(2);
    expect(CONFIRM_SRC, "声明必须是可选字段（不许变成必填 —— 8 处顶层确认不传它）").toMatch(/tier\?\s*:\s*ModalTier/);
    expect(CONFIRM_SRC, "tier 必须真的接到 Modal 上（否则 prop 是死字段）").toMatch(/<Modal[\s\S]{0,400}?tier=\{tier\}/);
    expect(CONFIRM_SRC, "默认值写在原语里（`= \"modal\"`），单测钉住实际档位").toContain('tier = "modal"');
  });

  it("口径锚：剥注释这一步真的有效（合成样本 —— 注释里的类型名不算命中）", () => {
    const synthetic = "/* 透传 `ModalTier`（注释里提到不算） */\ntier?: ModalTier;";
    expect(synthetic.match(STRIP_PROBE) ?? [], "锚本身必须含犯规样本，否则它在测空气").toHaveLength(2);
    expect(
      synthetic.replace(/\/\*[\s\S]*?\*\//g, "").match(STRIP_PROBE) ?? [],
      "剥注释失效 ⇒ 本文件的关键字计数会把文件头注释也算进去",
    ).toHaveLength(1);
  });
});
