/**
 * @ai-context: 自 `App.tsx` 抽出（批 7 T1，C9.2 腾行数）；签名与语义逐字不变 ——
 *   含 `durationMs={3500}` / `placement="belowNav"` / `testId="ai-toast"` 三个字面量。
 *   调用点仍在 `App.tsx` 的 `MainShell` 最外层（壳级覆盖层，见该处注释）。
 */
import { Toast } from "../ui/primitives";

/**
 * AiToast — AI 任务完成/失败通知的**装配层**（批 4 T10：渲染交给 L1 `Toast`）。
 *
 * @ai-context: 状态仍由 `MainShell` 持有（监听 `ai:task-update`），本组件只做「状态 → 原语 props」
 *   的映射，并把迁移前逐字保留的三样东西钉在一处：文案（含 ✨/❌，逐字沿用）、时长 **3500ms**、
 *   testId **`ai-toast`**（批 3 裁决 A3 的语义锚；B15 要求它以**渲染级**断言保住 —— 本仓
 *   `MainShell` 未导出，故判据渲染这个**真实**装配件，见 `components/toastMigration.test.tsx`）。
 *   位置档 `placement="belowNav"`（读原语 `.ed-toast--below-nav`，消费壳层 token `--ed-nav-h`）：
 *   调用点写行内 `top` 覆盖类语义被 ADR-033 §4 逐字禁止 ⇒ 走 B6 特殊条款加的那个具名 prop。
 * 副作用：无（不读 store、不发请求、不写磁盘）。自动消失由原语计时（进入 `entered` 才开始，
 *   边界①），到点走 140ms 退场后回调 `onDismiss` —— 父级自己置 `open=false` 不会收到回敬（边界②）。
 * 边界：**同文案连续事件不重置窗口**（原语边界③ 以 `message`/`kind` 判「接管」）——迁移前
 *   `MainShell` 的裸 `setTimeout` 是「每个事件都重新计时」；差异只在「两次 AI 任务在同一 3.5s 内
 *   完成且文案逐字相同」时出现（该场景下可见时长可能比旧实现短，不会更长）。已登记在 T10 报告。
 */
export function AiToast({
  toast,
  onDismiss,
}: {
  toast: { text: string; kind: "ok" | "err" } | null;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <Toast
      open={toast !== null}
      message={toast?.text ?? ""}
      kind={toast?.kind ?? "ok"}
      durationMs={3500}
      placement="belowNav"
      testId="ai-toast"
      onDismiss={onDismiss}
    />
  );
}
