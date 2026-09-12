/**
 * SessionScreenCard — 会话详情「画面要点」的**单卡内容**（批 5 T3 从 SessionScreenCards 抽出）。
 *
 * @ai-context: 职责边界 = **卡内容**：标题（`screen.title`）+ 正文行（`screen.body`）。
 *              纯展示：**零 state、零 effect、零 IPC、零 `@tauri-apps` import**（配图 URL 的
 *              `convertFileSrc` 收口仍在容器——见下「为什么只有两块」）。
 *
 * @ai-context **为什么只抽出这两块（T3 报告的 STOP 落点，控制方需裁决）**：`SessionScreenCards.tsx`
 *              的每屏块里，屏头 / 标签 / 结构徽标明细携带 `fontSize: 11`「11.5」（越界字阶）、
 *              配图与单屏 toast 携带 `1px solid #e5e7eb`「borderRadius: 6」、块级明细 `<details>`
 *              携带 `#9ca3af` —— 这些字面量受**五类棘轮的文件级台账**约束：
 *              ① 搬进新文件 ⇒ `textRatchet`/`surfaceRatchet` 的「未登记文件命中 = 0」红（新文件带字面量）；
 *              ② 就地迁移（`<Text>`/token）⇒ `textRatchet` ⑥「域内实测总数 == 冻结总数」红
 *                 （迁移让全域总数下降，而 `*Baseline.ts` 本批只读）——
 *              ⇒ 两条路都不绿（实测读数见 `tmp/t3/raw/mutants/`）。**能安全搬出的只有标题与正文**
 *              （字号 14 / 12.5 是合法档、不产生任何棘轮计数）。控制方若批准收紧
 *              `textBaseline`，剩余块可随「搬迁 = 顺带落迁移」一并并入本卡。
 *
 * @ai-context 为什么这一层值得先立：T9 的 `SessionCardFlowView` 要复用本卡（C3 逐字「抽单卡子件
 *              供两个视图复用」）。今天它交付的是两个视图**共有的最小内容面**（标题 + 正文），
 *              剩余内容面（时间码 / 图 / 标签 / 结构徽标）待台账解锁后并入。
 */
import type { SessionScreen } from "../../types";

interface Props {
  /** 一屏的画面要点（本卡只消费其中的标题与正文行） */
  screen: SessionScreen;
}

export default function SessionScreenCard({ screen }: Props) {
  return (
    <>
      {screen.title && (
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
          {screen.title}
        </div>
      )}
      {screen.body.map((b, j) => (
        <div key={j} style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.6 }}>
          {b}
        </div>
      ))}
    </>
  );
}
