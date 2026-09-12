/**
 * @ai-context ThumbStrip.tsx — #5 的**掠过条**（规格 §8.6 第 5 行「掠过几帧缩略」· 批 6 波 C · T31）。
 *
 * @ai-context 依赖方向（规格 §7.1 + `views/architecture.guard.test.ts` 的 A3③ 整目录硬边界）：本件属
 *   `views/**` ⇒ **零 `@tauri-apps`**（含 `import type`）。配图 URL 一律经容器注入的 `imageUrl(ref)`
 *   解析（`null` = 解析不出 ⇒ 那一帧**不渲染**，不做第二个 `convertFileSrc`）。
 * @ai-context 取材口径的唯一真源 = `screensFor.screensAround`（本件**不自己算**「最近几帧」）；相对路径
 *   还要过 `thumbRefOf`（`full/` → `thumb/`）—— 掠过条只许取 320px 级缩略图，`full/` 是原图。
 * @ai-context **诚实边界（不得越界声称）**：① 「掠过几帧」是**翻图**不是视频抽帧 —— 帧率由屏数决定
 *   （PB1 逐字：`full/<ms>.webp` + `thumb/` 双层约定）；② **观感未测**（jsdom 不排版）；③ `screens`
 *   稀疏（或 `image_ref` 全空 / `imageUrl` 槽未接线）⇒ **整条不渲染**（不占位、不拉伸时间轴）。
 * 副作用：无（纯展示；一次 `<img>` 的惰性加载由浏览器负责，`loading="lazy"`）。无 I/O、无订阅。
 * 边界：① `targetMs === null` ⇒ 不渲染（没有目标就没有「掠过」）；② ref 由调用方（回跳编排）持有
 *   —— 本件只把它挂到根上，`transform` 的写入全在 `usePlayheadJump`（本件不碰 GSAP）。
 */
import type { CSSProperties, ReactElement, RefObject } from "react";
import type { SessionViewSlot } from "../registry";
import { screensAround, thumbRefOf } from "./screensFor";

/** 布局样式（**只许布局**，ADR-033 §4）：横排、间距与高度下限由条自己定（尺寸不靠父级） */
const STRIP: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 27 };
/** 单帧：16:9 的小图（320px 级缩略图的展示尺寸；不是原图） */
const THUMB: CSSProperties = { display: "block", width: 48, height: 27, objectFit: "cover" };

interface Props {
  /** 屏数据面（槽里的 `detail.screens`；只读）；`undefined` = 宿主未接线 ⇒ 不出条 */
  readonly screens?: SessionViewSlot["detail"]["screens"];
  /** 配图 URL 槽（容器注入）；`undefined` = 宿主未接线 ⇒ 不出条 */
  readonly imageUrl?: SessionViewSlot["imageUrl"];
  /** 目标位置（毫秒，会话轴）；`null` = 无目标 ⇒ 不出条 */
  readonly targetMs: number | null;
  /** 掠过帧数（真源 `screensFor.framesFor`；调用方按档位/reduced-motion 派生后传入） */
  readonly frames: number;
  /** 掠过条容器的登记口（回跳编排把 ≤8px 的位移写到这里） */
  readonly stripRef: RefObject<HTMLDivElement | null>;
}

/** 掠过条：目标邻域的最近 `frames` 帧缩略图（稀疏 ⇒ `null`）。 */
export default function ThumbStrip({ screens, imageUrl, targetMs, frames, stripRef }: Props): ReactElement | null {
  if (targetMs === null || imageUrl === undefined || screens === undefined) return null;
  const shots: { readonly key: number; readonly src: string }[] = [];
  for (const screen of screensAround(screens, targetMs, frames)) {
    if (screen.image_ref === null) continue;
    const src = imageUrl(thumbRefOf(screen.image_ref));
    if (src !== null) shots.push({ key: screen.first_seen_ms, src }); // `src === null` ⇒ 那一帧不占位
  }
  if (shots.length === 0) return null; // 稀疏降级：不显示缩略（**不**把少数的屏摊开充数）
  return (
    <div ref={stripRef} style={STRIP} data-testid="session-timerail-thumbs" data-frames={shots.length}>
      {/* 装饰帧：语义由轨上的刻度与时间码承载 ⇒ `alt=""`（不给屏幕阅读器复读一遍） */}
      {shots.map((shot, i) => (
        <img key={shot.key} src={shot.src} alt="" loading="lazy" style={THUMB} data-thumb-index={i} />
      ))}
    </div>
  );
}
