/**
 * MotionIntensityControl — 「动效强度」三段控件（规格 §8.5；R3.3 的 UI 入口；批 6 Task 7）。
 *
 * @ai-context Why：三档强度（节能 / 标准 / 丰富 ↔ `eco` / `standard` / `rich`）的**通道**由
 *   `motion/intensity.ts`（T6）提供，但实测今天**没有外观设置页** ⇒ 没有入口时 §8.5 的三档只能靠
 *   改源码验证，即**不可验收**（R3.3 逐字）。本件就是那个入口：把 hook 的 `[档位, 选择]` 接到一个
 *   **受控三段控件**上。三档对 CSS 的作用全在 `motion.css` 的 `html[data-motion="…"]` 块里（T6 已落）
 *   —— 本件**不含任何动效逻辑**，只做「选择 → hook」，属性写入与持久化都在 hook 内。
 *
 * @ai-context ★ 为什么是「薄适配器」而不是自建三段控件（实测驱动；计划 Task 7「关键取舍」）：
 *   ① `app/src/components/**` 的非 test 文件落在 `nativeButton.ratchet` 的**域内**
 *      （`nativeButton.ratchet.test.ts:143-145` 的 `isTest`/`isPrim`/`isIcons` 只排除
 *      `*.test.(ts|tsx)` / `ui/primitives/**` / `ui/icons/**`）⇒ 本件若渲染原生 `button` 元素，
 *      `FROZEN_NATIVE_BUTTON_TOTAL`（393）与逐文件冻结表会因**新文件**当场红；
 *   ② `ui/primitives` 的 `ViewSwitcher` 已**逐字满足** R3.3 的三条形式要求：容器 `.ed-btn-group`
 *      + 段 `.ed-btn--segment`（= 既有 `ed-btn` 段控件类名空间）、布尔 `aria-pressed` 承载选中态、
 *      **零行内 style**（ADR-033 §4）⇒ 本件退化为适配器，零棘轮计数、零新类名、零新样式。
 *   诚实代价（登记）：段控件的可定制性受 `ViewSwitcher` 约束（例如不支持图标段 / 不支持自定义段宽）。
 *
 * @ai-context Produces（新 DOM 契约）：根元素 `data-testid="motion-intensity"`；容器 `role="group"`
 *   + `aria-label="动效强度"`；三段文案逐字 = §8.5 的档名 节能 / 标准 / 丰富，与 `MOTION_INTENSITIES`
 *   的 `eco` / `standard` / `rich` **同序一一对应**（段清单从真源派生，不另立第二份）。
 * @ai-context 副作用：全部经 `useMotionIntensity` —— 挂载即写 `<html data-motion>`（取已存选择或系统
 *   初值），选择时写 `motion:intensity`。本件自身不碰 `document` / `localStorage` / `matchMedia`。
 * @ai-context 边界：`ViewSwitcher.onChange` 的实参是 `string`（通用原语不知道档位值域）⇒ 值域收口在
 *   这里：不在三档内的 key 一律**丢弃**（不写 DOM、不写记忆），避免脏值把 `data-motion` 写成非法档。
 */
import type { ReactElement } from "react";
import { ViewSwitcher } from "../ui/primitives";
import { MOTION_INTENSITIES, useMotionIntensity } from "../motion/intensity";
import type { MotionIntensity } from "../motion/intensity";

/** 档 → 段名（逐字照 §8.5 的档名）；用 `Record<MotionIntensity, string>` 让**漏档在 `tsc` 层即报错** */
const LABELS: Readonly<Record<MotionIntensity, string>> = {
  eco: "节能",
  standard: "标准",
  rich: "丰富",
};

/** 段清单 = 真源派生（段数 / 顺序 / 取值都不另立第二份；加档时这里自动跟上） */
const OPTIONS = MOTION_INTENSITIES.map((key) => ({ key, label: LABELS[key] }));

/** 值域收口：原语只承诺 `string`，档位判定留在本层（越界 key ⇒ 静默丢弃） */
const isIntensity = (key: string): key is MotionIntensity =>
  (MOTION_INTENSITIES as readonly string[]).includes(key);

export function MotionIntensityControl(): ReactElement {
  const [intensity, select] = useMotionIntensity();
  return (
    <ViewSwitcher
      options={OPTIONS}
      value={intensity}
      onChange={(key) => {
        if (isIntensity(key)) select(key);
      }}
      ariaLabel="动效强度"
      testId="motion-intensity"
    />
  );
}
