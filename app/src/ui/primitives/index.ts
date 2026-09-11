/**
 * @ai-context L1 原语层的**唯一公共导出面**（同 `ui/icons/index.ts` 范式）。
 *
 * Why：批 4 之后全站从这里 import；收敛导出面使「换实现」只改这一个文件。
 * 副作用：`import "./motion.css"` —— 导入本层即带上动效接缝变量与**全仓唯一的
 * `prefers-reduced-motion` 块**。
 * 边界：**深导入单个原语（如 `./Text`）时不会带上 reduced-motion 块**；组内互引用请走
 * 相对文件路径（`./Text`），不要 import 本文件（避免循环依赖）。
 */

import "./motion.css";

export { Text } from "./Text";
export type { TextFont, TextProps, TextSize, TextTag, TextTone } from "./Text";

export { Surface } from "./Surface";
export type { SurfaceLevel, SurfaceProps, SurfaceRadius, SurfaceTag } from "./Surface";

export { Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";

export { usePresence } from "./usePresence";
export type { Presence, PresenceOptions, PresencePhase, TransitionEndLike } from "./usePresence";

export { Modal } from "./Modal";
export type { ModalProps, ModalSize, ModalTier } from "./Modal";

export { FOCUSABLE_SELECTOR, focusablesIn, useFocusTrap } from "./useFocusTrap";

export { isImeComposing } from "./ime";
