/**
 * useSessionAudio — 会话音频引用的**唯一过桥点**（批 6 T24 · R5.5 / R5.5-b）。
 *
 * @ai-context 为什么必须住在 `components/**`：`views/**` 有一条**整目录**硬边界
 *   （`views/architecture.guard.test.ts` 的 A3③：生产文件**含 `import type` 在内**零 Tauri 边），
 *   而播放头所需的两样东西 —— `invoke("session_audio_path")` 与 `convertFileSrc` —— 都在 Tauri 面上
 *   ⇒ 取数与 URL 拼接**只能**在容器侧发生，视图侧只收注入的 `SessionViewSlot.audio`
 *   （依赖方向 §7.1：领域 → 视图 → 容器 → 原语，**禁止反向**）。本件是 `app/src/**` 里
 *   `session_audio_path` 的**唯一**调用点。
 * @ai-context **命令只给路径**（T22 的出参 `{path, aligned, durationMs}`）：URL 一律由前端
 *   `convertFileSrc` 拼，Windows 形态逐字 = Tauri `scripts/core.js:13-20` 的
 *   `` http://asset.localhost/${encodeURIComponent(绝对路径)} ``（`use_https_scheme: false`）。
 *   ⚠️ **禁止 `fetch()` 取音频**（R5.5-b 约束 2：不带 `Range` 的 200 分支会 `read_to_end`
 *   整段 WAV —— 约 115 MB/小时 —— 进内存）⇒ 唯一合法消费形态是 `<audio src>`（T25 落地）。
 * @ai-context **三个字段一律如实透传，不许改写成「看起来更好」的值**：`aligned` = T23 的对齐簿记
 *   （无 sidecar / 历史录音 ⇒ `false`，语义 =「**不能保证**对齐」）；`durationMs === null`
 *   = 未 finalize ⇒ `playable === false`（R5.5-b 约束 3：WAV 头的 `data` 长度创建时写 0，
 *   `finalize()` 是唯一回填点）⇒ 录制中必须禁用播放并如实提示（一行 `StatusLine`，**不是** toast）。
 * @ai-context **适用范围（硬边界）**：**只有实时采集会话有音频**（导入会话的音轨在 `%TEMP%` 且
 *   导入结束即删、不在 asset scope）⇒ 本件的二分只有「有音频 / 无音频」（`Ok(None)` ⇒ 降级对象），
 *   **不猜来源**、不引入新的会话类型判据。
 * @ai-context **诚实边界（不得越界声称）**：① asset 协议下的**真实播放 / seek 在本环境不可验证**
 *   （jsdom 无媒体栈、headless Edge 不说 `asset:` 协议、真机/WebView2 用户已裁决跳过）⇒ 本件
 *   **不声称**「播放已可用」；② 对齐精度残余 = **块粒度 ±200 ms**（T23 登记的硬边界；sidecar 未加
 *   `firstSampleMs`/块长键 ⇒ **毫秒级定位需要新契约**）⇒ 本件不提供任何「精确到毫秒」的换算。
 * 副作用：一次只读 IPC（`session_audio_path`）+ 一次纯字符串拼接；失败**静默降级**、不阻断页面。
 * 边界：`sessionId` 不变不重取（`useEffect` deps `[sessionId]`）；卸载后到达的响应被丢弃
 *   （`alive` 闸）⇒ 不对已卸载组件 `setState`。
 */
import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { SessionAudioRef, SessionAudioState } from "../../types/session";

/** IPC 命令名（T22 交付；`check-command-registry` 计数 313/313 里的那一条）。 */
export const SESSION_AUDIO_COMMAND = "session_audio_path";

/** 无音频 / 取数失败的**统一降级态**（`Ok(None)` 与 `invoke` 抛错**同形** —— R5.5-b 约束③）。 */
export const NO_AUDIO: SessionAudioState = Object.freeze({
  url: null,
  aligned: false,
  playable: false,
  durationMs: null,
});

/**
 * 纯映射：IPC 出参 → 视图槽的音频引用（**唯一** URL 构造点）。
 *
 * @ai-context Why 独立成纯函数：URL 构造必须**可单测**，而 jsdom 里 `convertFileSrc` 不存在
 *   （它是 `window.__TAURI_INTERNALS__` 的方法）⇒ 目标构造函数由调用方注入，生产默认值就是真的
 *   `convertFileSrc`（默认参数在**调用时**求值，不是模块加载时）。
 *   `playable` **由 `durationMs` 派生**（T22 的 `None` 判据），不新增第二路真源。
 *   边界：`durationMs` **逐字透传**（含 `0` —— 整数除法的亚毫秒边界，不许用 `|| null` 吞掉）；
 *   `aligned` 同（**不许**恒真、不许取反）。
 */
export function toSessionAudioState(
  ref: SessionAudioRef | null,
  toUrl: (path: string) => string = convertFileSrc,
): SessionAudioState {
  if (ref === null) return NO_AUDIO;
  return {
    url: toUrl(ref.path),
    aligned: ref.aligned,
    playable: ref.durationMs !== null,
    durationMs: ref.durationMs,
  };
}

/**
 * 取会话音频引用（**唯一** `invoke` 点）。
 *
 * @ai-context 返回值三态与槽位类型逐字对应：`undefined` = **尚未取到**（挂载后、以及换会话的瞬间
 *   先复位）；`SessionAudioState` = 已取到（其中 `url === null` 即「无音频」，含失败降级）。
 *   `invoke` 抛 ⇒ 降级对象 + **不阻断页面**（与 `audio_store.rs` 的「落盘失败不阻断会话主链路」
 *   同向）。⚠️ 本 hook **尚无生产调用点**：接线归 T25（时间轨/播放头）/ T26（`[[ts:ms]]` 深链）——
 *   槽位与类型已冻结，见 T24 报告的「有意的两步」。
 */
export function useSessionAudio(sessionId: number): SessionAudioState | undefined {
  const [audio, setAudio] = useState<SessionAudioState | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    // 换会话 ⇒ 先回到「尚未取到」：否则上一会话的音频引用会在新会话的视图里短暂冒充有效值
    setAudio(undefined);
    invoke<SessionAudioRef | null>(SESSION_AUDIO_COMMAND, { sessionId })
      .then((ref) => {
        if (alive) setAudio(toSessionAudioState(ref));
      })
      .catch(() => {
        if (alive) setAudio(NO_AUDIO);
      });
    return () => {
      alive = false;
    };
  }, [sessionId]);
  return audio;
}
