/**
 * 音频源类型与选源策略（主进程 / 渲染进程共用）
 *
 * @ai-context: 见 ADR-001。端点环回是"设备视角"（永不漏采但采全系统混音），
 * 进程环回是"应用视角"（只采目标进程树，干净但可能漏采）——两者互补而非
 * 替代关系，故此处是「选源」而非「降级」策略：默认按用户是否锁定了具体
 * 窗口来选，仅在进程环回不可用/启动失败时才降级。
 * @ai-context: 本文件必须保持纯函数无副作用——主进程（audioCapture 编排器）
 * 与渲染进程（useAudioRecovery 按源分支提示文案）共同依赖，且需被单测覆盖。
 */

/** 音频采集源类型 */
export type AudioSourceKind =
  /** 进程环回：Win10 2004+ 原生 API，混音前按进程树截取 */
  | 'process_loopback'
  /** 端点环回：Chromium getDisplayMedia，截取设备最终混音 */
  | 'endpoint_loopback'
  /** 麦克风：线下课堂场景 */
  | 'microphone';

/** 用户偏好覆盖（设置页） */
export type AudioSourcePreference = 'auto' | 'force_process' | 'force_endpoint';

/** 运行环境能力探测结果 */
export interface AudioSourceCapabilities {
  /** 进程环回是否可用（Windows 10 2004+ 且原生模块加载成功） */
  processLoopbackAvailable: boolean;
}

/** 选源输入 */
export interface AudioSourceSelectionInput {
  capabilities: AudioSourceCapabilities;
  /**
   * 用户选定的采集源 ID（desktopCapturer 格式）。
   * `window:*` 表示锁定了具体窗口；`screen:*` 或 null 表示整屏/未指定。
   */
  sourceId: string | null;
  /** 设置页偏好，默认 auto */
  preference?: AudioSourcePreference;
  /** 线下课堂（麦克风）场景，不参与环回选源 */
  microphone?: boolean;
}

/** 选源结果 */
export interface AudioSourceDecision {
  kind: AudioSourceKind;
  /** 决策理由，写入会话元数据供内测问题归因 */
  reason: string;
  /** 启动失败时的降级目标；null 表示无降级可用 */
  fallback: AudioSourceKind | null;
}

/** 判断是否锁定了具体窗口（而非整个屏幕） */
export function isWindowSource(sourceId: string | null): boolean {
  return typeof sourceId === 'string' && sourceId.startsWith('window:');
}

/**
 * 按场景选择音频源。
 *
 * 规则优先级：
 * 1. 麦克风场景独立成链，不涉及环回
 * 2. 用户强制偏好优先于自动策略（强制进程环回但环境不支持时仍需降级）
 * 3. auto：锁定具体窗口 → 进程环回（干净）；整屏/未指定 → 端点环回（不漏采）
 */
export function selectAudioSource(input: AudioSourceSelectionInput): AudioSourceDecision {
  const { capabilities, sourceId, preference = 'auto', microphone = false } = input;

  if (microphone) {
    return {
      kind: 'microphone',
      reason: '现场课程场景，采集麦克风输入',
      fallback: null,
    };
  }

  if (preference === 'force_endpoint') {
    return {
      kind: 'endpoint_loopback',
      reason: '用户设置为强制端点环回',
      fallback: null,
    };
  }

  if (preference === 'force_process') {
    return capabilities.processLoopbackAvailable
      ? {
          kind: 'process_loopback',
          reason: '用户设置为强制进程环回',
          fallback: 'endpoint_loopback',
        }
      : {
          kind: 'endpoint_loopback',
          reason: '用户设置为强制进程环回，但当前环境不支持（需 Windows 10 2004+），已降级',
          fallback: null,
        };
  }

  if (capabilities.processLoopbackAvailable && isWindowSource(sourceId)) {
    return {
      kind: 'process_loopback',
      reason: '已锁定目标窗口，采用进程环回以隔离其他应用声音',
      fallback: 'endpoint_loopback',
    };
  }

  if (!capabilities.processLoopbackAvailable) {
    return {
      kind: 'endpoint_loopback',
      reason: '当前环境不支持进程环回（需 Windows 10 2004+）',
      fallback: null,
    };
  }

  return {
    kind: 'endpoint_loopback',
    reason: '未锁定具体窗口，采用端点环回以避免漏采跨应用声音',
    fallback: null,
  };
}

/** 源类型的用户可读名称（UI 展示与日志用） */
export function describeAudioSource(kind: AudioSourceKind): string {
  switch (kind) {
    case 'process_loopback':
      return '进程音频（仅目标窗口）';
    case 'endpoint_loopback':
      return '系统音频（全部声音）';
    case 'microphone':
      return '麦克风';
  }
}
