/**
 * 会话音频领域类型（批 6 T24 · R5.5 / R5.5-b）—— **音频引用的契约层**。
 *
 * @ai-context 为什么这两个类型住在 `types/**`，而不是直觉上的「与槽同住 `views/registry.ts`」
 *   （**这是对计划的一处就地处置，理由与实证都留在这里**）：注册表有一条**既有断言**在守它的
 *   导入者集合 —— `views/architecture.guard.test.ts` 的 **A2④** 逐字钉死「非 `views/` 的导入者
 *   **恰 5 个**」且「type-only 边**恰 3 处**」。任何**新的**容器文件写
 *   `import type { … } from "views/registry"` 都会让那条断言当场红，而它**不在**本批授权改动的
 *   既有断言清单（R1.3 / 计划表 5）内 ⇒ 不能改它、也不能靠改它来通过。
 *   ⇒ 把**类型**下沉到领域层：`views/registry.ts` 只 `import type` + `export type` 转出（槽字段照旧
 *   写着 `SessionAudioState`），容器从领域层取类型。收益有两层：① A2④ 的集合**一字不动**即保持绿；
 *   ② 依赖方向更贴规格 §7.1（**领域 → 视图 → 容器 → 原语**）—— 容器不再为拿一个类型而反向依赖
 *   视图层的模块。实证与反例读数见
 *   `.superpowers/sdd/2026-09-12-frontend-redesign-batch6-motion/task-24-report.md`。
 * @ai-context **适用范围（硬边界，逐字）**：**只有实时采集会话有音频**。导入会话的音轨落在
 *   `%TEMP%/entropy-import-{id}/audio.wav` 且导入结束即 `remove_dir_all`、`%TEMP%` **不在** asset
 *   scope、`sessions` 表无源视频路径列 ⇒ 那条路今天**没有承载面**。故本契约只表达
 *   「**有音频 / 无音频**」二分，**不猜来源**（不引入新的会话类型判据）。
 * 副作用：无（纯类型声明；消费方一律 `import type` ⇒ 构建期整体擦除、零运行时字节）。
 * 边界：本文件**不**构造 URL、**不**调 IPC、**不**做降级 —— 那些在容器侧
 *   `components/session-detail/useSessionAudio.ts`（`views/**` 的零 Tauri 边界不允许它们进视图层）。
 */

/**
 * T22 `session_audio_path` 的出参（Rust `SessionAudioRef`，`serde(rename_all = "camelCase")`）。
 *
 * @ai-context 命令**只给路径**：URL 一律由前端 `convertFileSrc` 构造（Tauri `scripts/core.js:13-20`
 *   的 Windows 形态 = `http://asset.localhost/<encodeURIComponent(绝对路径)>`）⇒ 后端不碰 URL 形态。
 */
export interface SessionAudioRef {
  /** 应用数据目录内的**绝对路径**（`{data_dir}/session-audio/{id}.wav`）—— **不是** URL。 */
  readonly path: string;
  /**
   * 该录音的 WAV 轴是否与会话轴对齐（T23 的对齐簿记 sidecar）。
   * `false` 的语义是「**不能保证**对齐」（含**历史录音无 sidecar**），**不是**「一定没对齐」
   * ⇒ UI 文案不得写成断言式的「未对齐」。精度残余 = **块粒度 ±200 ms**（sidecar 未加键
   * ⇒ 毫秒级定位需要新契约）。
   */
  readonly aligned: boolean;
  /** 时长（毫秒；由 WAV 头 `data` 长度换算）；`null` = 未 finalize / 未知 ⇒ **不可播**。 */
  readonly durationMs: number | null;
}

/** 视图槽的音频引用（**容器**产出、视图**只读**）。`url === null` ⇒ 无音频（或取数失败降级）。 */
export interface SessionAudioState {
  /** 可播放 URL（`convertFileSrc(path)` 的产物）；`null` = 路径不可得。 */
  readonly url: string | null;
  /** WAV 轴是否与会话轴对齐（**如实透传**，不许在容器里改写成「看起来更好」的值）。 */
  readonly aligned: boolean;
  /**
   * 只有**已 finalize** 的 WAV 可播（R5.5-b 约束 3：WAV 头的 `data` 长度创建时写 0，
   * `finalize()` 是唯一回填点）⇒ `false` 时 UI **必须**禁用播放并如实提示（一行
   * `StatusLine kind="error"`，**不是** toast）。
   */
  readonly playable: boolean;
  /** 时长（毫秒；**如实透传**，含 `0`）；`null` = 未知。 */
  readonly durationMs: number | null;
}
