/**
 * SessionCardFlowView — 会话视图 C：画面要点的**卡片流**（批 5 · T9；C3 的落点）。
 *
 * @ai-context 为什么它存在（C3 逐字）：`SessionScreenCards` 是「每屏一卡的列表容器」，本视图是
 *   **另一种容器**（不同密度 / 流式）。**规格 §5.1 的病灶是「同一件事两处写」** ⇒ 卡的内容面
 *   **必须**复用 T3 抽出的 `components/session-detail/SessionScreenCard`（纯展示，45 行）——
 *   本文件**一行卡内容渲染都没有**：标题 / 正文只可能经那一个组件到达 DOM（判据 K2 用 mock 钉住
 *   「随屏数渲染的恰是它」+「标题/正文文本**只能**从它进来」两条腿）。
 *
 * @ai-context **与 `SessionScreenCards` 的五处差异（写死，防两形态互相漂移）**：
 *   ① 无框选（`selectingScreen` / `onSelectScreen` 不进 props）· ② 无单屏 toast（`panelToast` /
 *   `onShowToast` / `onClearToast` 不进 props）· ③ 无结构徽标、无块级明细展开（整块 0 个
 *   `<details>` / 0 个 `<button>`）· ④ 密度更高：纵向 flex 流 + `--ed-space-8` 间距（容器
 *   `SessionScreenCards` 是「标题行 + 卡块 marginBottom」的文档形态）· ⑤ 每卡带
 *   `data-card-flow-item` 锚点（容器用的是 `id="ocr-{sessionId}-{firstSeenMs}"`，那是
 *   `SessionsPage` 的 `scrollIntoView` 契约，本视图**不复制**它）。
 *   ⑥ 唯一的加法：meta 行尾的**块数提示**（`ocrBlocksByScreen` 的计数，见下「为什么消费它」）。
 *
 * @ai-context **为什么消费 `ocrBlocksByScreen`**：该 prop 是计划 §Task 9 的 Interfaces 逐字指定的
 *   三项之一（`Pick<SessionViewSlot, "detail" | "imageUrl" | "ocrBlocksByScreen">`）。它在此处只做
 *   **计数**（`N 块`，且仅 > 0 时出现）——**不是**容器的「块级明细」：不渲染块文本、不可展开。
 *   高密度流里「这一屏背后有多少 OCR 证据」是密度信号，且它随注入的 Map 走（本视图零取数）。
 *
 * @ai-context **为什么底色/边框/圆角走 token 变量而不是 `<Surface>`**（这不是偷懒，是被棘轮钉住）：
 *   `ui/primitives/surfaceRatchet.test.ts` 的 ⑦ 断言 `SURFACE_TAGS.length === FROZEN_SURFACE_TAG_TOTAL
 *   (14)`，而 `surfaceBaseline.ts` **本批只读** ⇒ 域内**任何新增 `<Surface>` 调用点都会让 ⑦ 红**，
 *   且不许靠抬高冻结值消解。故本文件的「面」用 `var(--ed-bg-surface)` / `var(--ed-border)` /
 *   `var(--ed-radius-panel)` 表达（= 计划硬要求①允许的「token 变量」一支），**零颜色字面量**。
 *
 * 副作用：**无**。零 state、零 effect、零 IPC、零 `@tauri-apps` import（配图 URL 由容器注入的
 *   `imageUrl()` 解析——视图自己 `convertFileSrc` 会让 `views/**` 的 Tauri 边界破口）。
 * 边界：① 纯受控/纯派生 —— 不持有任何视图态（视图记忆与切换在宿主，C5）；
 *   ② 行内 `style` **只做布局**（flex 方向/间距/尺寸）与 token 取色，**不覆盖任何原语语义**
 *   （ADR-033 §4；本文件没有 `<Surface>`/`Button` 调用点可被覆盖）；
 *   ③ 空态走 `EmptyState` 原语（`emptyStateRatchet` 的口径），文案**不含**词表八字；
 *   ④ 卡的时间码/配图/标签是**容器级 chrome**，`SessionScreenCard` 今天只持有「标题 + 正文」
 *   （T3 的 STOP 落点：其余内容面携带的 `fontSize: 11` / `#9ca3af` / `borderRadius: 6` 字面量被
 *   五类棘轮的文件级台账锁定，搬入即红）。⇒ **故本次不给单卡加插槽**：容器（唯一另一个消费者）
 *   本任务不许碰 ⇒ 插槽只会有**一个**消费者，属于「为单一调用点造间接层」，不产生任何去重收益，
 *   却要多承担「改 T3 收口文件 + 两套判据/变异体」的风险。留待台账解锁后由控制方一并裁。
 * 行数纪律：本文件 ≤200（口径 = `scripts/line-limits.mjs` 的 `countLines()`）。
 */
import type { CSSProperties } from "react";
import { EmptyState, Text } from "../../ui/primitives";
import SessionScreenCard from "../../components/session-detail/SessionScreenCard";
import type { SessionViewSlot } from "../registry";
import { fmtMs } from "../../utils/fmt";

/** 只取注入的三项：`imageUrl` 供配图（视图不碰 `@tauri-apps`），`ocrBlocksByScreen` 供块数计数 */
type Props = Pick<SessionViewSlot, "detail" | "imageUrl" | "ocrBlocksByScreen">;

/** 容器：高密度纵向流（ADR-033 §4 允许 `style` 做**布局** —— 方向 / 间距；视觉权威不在类上） */
const FLOW: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--ed-space-8)" };

/** 单卡：面（底 / 边框 / 圆角）一律取 token 变量 —— 见文件头「为什么不是 `<Surface>`」 */
const ITEM: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ed-space-4)",
  padding: "var(--ed-space-8) var(--ed-space-12)",
  background: "var(--ed-bg-surface)",
  border: "1px solid var(--ed-border)",
  borderRadius: "var(--ed-radius-panel)",
};

/** 配图：只给布局（上限宽度 / 块级断行）；边框与圆角由卡承载，不制造第二个「面」 */
const MEDIA: CSSProperties = { maxWidth: 240, display: "block" };

/**
 * 渲染卡片流。
 *
 * @ai-context 返回 `ReactElement`（React 19 下全局 `JSX` 命名空间收进 `React.JSX`，同 `Text.tsx` 先例）。
 *   逐屏一卡：meta 行（屏号兜底 `screen_id ?? i + 1`，与容器同语义）→ 配图（`imageUrl` 返回
 *   `null` 即不渲染，降级不占位）→ **共用单卡**（标题 + 正文）→ 标签行（非空才渲染）。
 *   `key = first_seen_ms`（屏的唯一键；与容器一致 —— 同屏不会出现两卡）。
 */
export default function SessionCardFlowView({ detail, imageUrl, ocrBlocksByScreen }: Props) {
  const { screens } = detail;
  if (screens.length === 0) {
    return <EmptyState title="本会话的画面要点为空" testId="session-card-flow-view" compact />;
  }
  return (
    <div className="ed-cardflow" data-testid="session-card-flow-view" style={FLOW}>
      {screens.map((s, i) => {
        const src = imageUrl(s.image_ref);
        const blocks = ocrBlocksByScreen.get(s.first_seen_ms)?.length ?? 0;
        return (
          <div key={s.first_seen_ms} data-card-flow-item="" style={ITEM}>
            <Text as="div" size={5} tone="ink-3">
              {`屏 ${s.screen_id ?? i + 1} · ${fmtMs(s.first_seen_ms)} – ${fmtMs(s.last_seen_ms)}`}
              {blocks > 0 ? ` · ${blocks} 块` : ""}
            </Text>
            {src !== null && <img src={src} alt={`屏 ${i + 1}`} loading="lazy" style={MEDIA} />}
            {/* ★ 卡的**唯一**渲染路径：标题 + 正文只从这里进 DOM（换容器不等于换卡；C3） */}
            <SessionScreenCard screen={s} />
            {s.labels.length > 0 && (
              <Text as="div" size={5} tone="ink-3">{`标签：${s.labels.join(" · ")}`}</Text>
            )}
          </div>
        );
      })}
    </div>
  );
}
