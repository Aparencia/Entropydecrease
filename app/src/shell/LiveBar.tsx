/**
 * LiveBar — 采集态 LIVE 仪表条（规格 §6.3；裁决 R4.4 / R4.5；批 6 Task 18 Step 3）。
 *
 * @ai-context Why：§6.3 逐字「采集态 = 58px **LIVE 仪表**（波形 + 计时 + 暂停/标记/停止）」
 *   ⇒ 本件就是那条 58px 条的**本体**：波形（`components/Waveform.tsx`，div 条阵列 · R4.3）+
 *   计时（`utils/fmt.ts` 的 `fmtMs` **唯一出口**）+ 暂停 / 标记 / 停止三键。高度消费 T17 落真的
 *   `--ed-nav-h-live`（R4.1：`--ed-nav-h` 保持 56px 不动、采集态另开一支 ⇒ 零既有断言改动），
 *   且**逐字消费并带同值兜底**。
 * @ai-context ★ 订阅形态（计划「诚实边界」④ 要求逐字写明选了哪一个及理由）：**本组件内部订阅**
 *   `live:audio-level`，载荷 `{ rms: number; clipping: boolean }`（与 `components/AudioLevelMeter.tsx`
 *   的 :19-22 逐字同形；后端每音频块 200ms 推一次）。理由：T18 的边界是 **新建 4 件、既有文件零改动**
 *   （计划 Files 表把 `App.tsx` / `ClassroomCapturePanel.tsx` 都列成「零改动」，热文件表更把 `App.tsx`
 *   划给 T17 唯一）⇒ 今天**没有**注入 `rms` 的容器，冻结快照 `LiveBarProps` 里也没有 `rms` 槽
 *   （不许改冻结快照）⇒ 订阅只能落在本件内部。清理照 `AudioLevelMeter.tsx:50-56` 的既有范式
 *   （`void unlisten.then((fn) => fn())`，避免卸载后 `setState`）。
 * @ai-context 副作用：① 订阅 `live:audio-level`（挂载订阅 / 卸载退订）；② 写 DOM 的 `data-paused` 与
 *   四个 `data-testid` 锚点。**不读 store、不写磁盘、不起计时器** —— `elapsedMs` 的时间源（墙钟 vs
 *   后端事件）由容器注入，不在本任务判据内（计划「诚实边界」③）。
 * @ai-context 边界：① 本件**只管仪表本体**：相位 CSS（域导航隐藏 / 源列保留）归 T19、相变凝固动效
 *   归 T29 ⇒ 本任务结束时它**没有生产调用点**（「渲染即 58px」是本件唯一的空间契约）；
 *   ② `paused` 是**受控**的（本件不翻转自己的状态，只上抛 `onTogglePause`）；
 *   ③ 暂停键的按下态**不用 `aria-pressed`**，走「可访问名翻转（暂停 ↔ 继续）+ `data-paused` +
 *   琥珀徽标」三处。Why：`ui/primitives/Button` 的属性面是**冻结的受控槽**（无 `aria-pressed`、无
 *   `...rest` 透传），而 `components/**` 在 `nativeButton.ratchet` 的域内 ⇒ 自造裸 `<button>` 会让
 *   棘轮因**新文件**当场红；且播放/暂停控制在 WAI-ARIA 的惯用做法本就是**换可访问名**而非按下态
 *   （按下态适用于静音一类**模式**开关）。琥珀徽标 = R4.5 逐字点名的「暂停徽标」，也是 T29
 *   「琥珀退去」要作用的那个元素。
 * @ai-context T29 追加（#3 相变凝固 · R5.3 / R4.5）：本件挂 `usePhaseFreeze(phase)` —— 相位经
 *   `LiveBarHost` 注入（**可选**槽，缺省 `"capture"` = 本件既有渲染，冻结进度 0）。三处新结构：
 *   ① 受控 prop `phase`（唯一新槽；`LiveBarProps` 的既有五项一字未动）；
 *   ② **墨度层** `data-testid="live-ink"`（唯一 GSAP 目标 = 「琥珀退去」的载体；R4.5 点名的 LIVE 仪表与
 *      暂停徽标都在它里面 —— 徽标是条件渲染，单独作载体在未暂停时会落空）；
 *   ③ `kind="warn"`：LIVE 仪表本身走 `--ed-due` 族（R4.5 逐字「采集态 LIVE 仪表/暂停徽标的 `--ed-due`
 *      族元素」）—— 退去只改**墨度**、不改色值。⚠️ 缺省相位下 hook **不建时间线**（相位未变）⇒ 本件
 *      既有六条判据零改动。
 */
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button, StatusLine, Text } from "../ui/primitives";
import { Icon } from "../ui/icons";
import { fmtMs } from "../utils/fmt";
import Waveform from "../components/Waveform";
import { usePhaseFreeze } from "./usePhaseFreeze";
import type { ShellPhase } from "./shellPhase";

/**
 * 采集态顶栏高度：**消费 T17 落真的新 token**（R4.1）。兜底 58px 与真源同值
 * （`ui/tokens.css` 的 `--ed-nav-h-live: 58px`）—— 变量未定义时 CSS 不报错、只静默失效。
 */
export const LIVE_BAR_HEIGHT = "var(--ed-nav-h-live, 58px)";
/** 采集脉冲的落点类名 = T13 落的环境层 seam（`.ed-status` 的**修饰类**，三档块与 reduced 名单都含它）。 */
export const LIVE_PULSE_CLASS = "ed-status--live-pulse";
/** 暂停键两档文案（逐字）：换可访问名 = 播放/暂停控制的惯用形态（见文件头边界③）。 */
export const LIVE_PAUSE_LABELS = { running: "暂停", paused: "继续" } as const;

/** `live:audio-level` 的载荷（与 `components/AudioLevelMeter.tsx` 的接口逐字同形）。 */
interface AudioLevelPayload {
  rms: number;
  clipping: boolean;
}

/** 冻结快照（计划 Interfaces）：容器注入计时与三个动作，本件不起计时器、不建 IPC 命令。 */
export interface LiveBarProps {
  readonly elapsedMs: number;
  readonly paused: boolean;
  readonly onTogglePause: () => void;
  readonly onMark: () => void;
  readonly onStop: () => void;
  /** 当前相位（T29 追加的**可选**槽；缺省 `"capture"` = 本件既有渲染：冻结进度 0、无编排动效）。 */
  readonly phase?: ShellPhase;
}

/**
 * 渲染采集态 LIVE 仪表条。
 *
 * 返回 `ReactElement`（= 契约里的 `JSX.Element`）：React 19 把全局 `JSX` 命名空间收进 `React.JSX`，
 * 直接写 `JSX.Element` 在 `@types/react@19` 下取不到（同 `Text.tsx` / `Surface.tsx` 先例）。
 */
export default function LiveBar({
  elapsedMs,
  paused,
  onTogglePause,
  onMark,
  onStop,
  phase = "capture",
}: LiveBarProps): ReactElement {
  const [level, setLevel] = useState<AudioLevelPayload>({ rms: 0, clipping: false });
  // T29：相变凝固的编排（波形按 `barsFreeze` 收束成直线；墨度层由 hook 的 GSAP 目标退到常态档）
  const { inkRef, barsFreeze } = usePhaseFreeze(phase);

  useEffect(() => {
    const unlisten = listen<AudioLevelPayload>("live:audio-level", (e) => {
      setLevel({ rms: e.payload.rms, clipping: e.payload.clipping });
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // `style` 只承担**布局**（高/宽/内距/裁切）—— `.ed-status--live-pulse` 的规则只有 `animation:`
  // 一条，本盒子不声明 `ed-status` 基类 ⇒ 不存在「用 style 覆盖类语义」（ADR-033 §4）。
  return (
    <div
      className={LIVE_PULSE_CLASS}
      data-testid="live-bar"
      data-paused={paused ? "true" : "false"}
      style={{
        height: LIVE_BAR_HEIGHT,
        display: "flex",
        alignItems: "center",
        width: "100%",
        boxSizing: "border-box",
        padding: "0 var(--ed-space-16, 16px)",
        overflow: "hidden",
      }}
    >
      {/* 墨度层（T29「琥珀退去」的载体 · 唯一 GSAP 目标）：**新建**的 div，**不声明任何 transition**
          （类规则或行内 transition 都会与逐帧写入打架：GSAP 每帧写、CSS 再插值 ⇒ 值永远追不上）。
          它的 `opacity` 由 `usePhaseFreeze` 从 1 退到常态档；采集态（freeze 0）恒为 1 ⇒ 零观感变化。 */}
      <div
        ref={inkRef}
        data-testid="live-ink"
        style={{ flex: "1 1 auto", minWidth: 0, display: "block" }}
      >
        {/* 语义（`role="status"`）与基类由 `StatusLine` 原语承载；仪表本体走它的 `action` 纯插槽
            （该槽**不额外包 DOM、不加类** —— 见 `StatusLine.tsx` 边界④）。
            `kind="warn"` = R4.5 逐字「采集态 LIVE 仪表…的 `--ed-due` 族」：琥珀是**采集态的身份墨**，
            退去只退墨度（色值仍逐字是 `--ed-due`，见 `motion.css` 的相位块侧锁）。 */}
        <StatusLine
          kind="warn"
          testId="live-meter"
          action={
            <>
              <Waveform
                rms={level.rms}
                clipping={level.clipping}
                testId="live-waveform"
                freeze={barsFreeze}
              />
              <Text as="span" size={4} font="mono" tone="ink-2" testId="live-elapsed">
                {fmtMs(elapsedMs)}
              </Text>
              {paused ? (
                <Text as="span" size={5} tone="due" testId="live-paused-badge">
                  已暂停
                </Text>
              ) : null}
              <Button variant="secondary" size="sm" testId="live-pause" onClick={onTogglePause}
                icon={<Icon name={paused ? "play" : "pause"} size={16} />}>
                {paused ? LIVE_PAUSE_LABELS.paused : LIVE_PAUSE_LABELS.running}
              </Button>
              <Button variant="ghost" size="sm" testId="live-mark" onClick={onMark}
                icon={<Icon name="check" size={16} />}>
                标记
              </Button>
              <Button variant="ghost" size="sm" testId="live-stop" onClick={onStop}
                icon={<Icon name="stop" size={16} />}>
                停止
              </Button>
            </>
          }
        >
          LIVE
        </StatusLine>
      </div>
    </div>
  );
}
