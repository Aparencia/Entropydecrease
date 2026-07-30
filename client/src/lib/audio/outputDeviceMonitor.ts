/**
 * 音频输出设备监测与静音诊断
 *
 * @ai-context: 系统音频环回（WASAPI Loopback）只捕获「默认输出设备」上的混音。
 * 若网课/视频软件把声音输出到了非默认设备（HDMI 显示器音响、蓝牙耳机等），
 * 环回捕获到的将是持续静音——这是"监听 0 句"的常见根因。
 * 本模块提供：①输出设备枚举与默认设备识别 ②设备变更订阅
 * ③纯函数 RMS 计算与连续静音诊断（SilenceTracker），供采集管道判定
 * "收到了音频块但全是静音"并向用户给出设备侧提示。
 * @ai-context: computeChunkRms / SilenceTracker 为纯逻辑无副作用，可安全单测；
 * 设备枚举/订阅为浏览器 API 副作用，已物理分离。
 *
 * TODO(现场课程): 现场课程接入麦克风后，本模块需同步枚举 audioinput 设备，
 * 并对麦克风静音（拔出/系统禁用/权限吊销）给出对应诊断。
 */

/** 输出设备信息 */
export interface AudioOutputDeviceInfo {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

/** 低于此 RMS 视为静音块（数字环回静音时 RMS 接近 0，远低于 VAD 语音阈值 0.008） */
const SILENT_RMS_THRESHOLD = 0.0005;
/** 连续静音块达到此数量触发诊断（5s/块 × 4 = 20s 持续静音） */
const SILENT_CHUNKS_TO_DIAGNOSE = 4;

// ================================================================
// 纯逻辑（可安全单测）
// ================================================================

/** 计算一个 PCM Float32 音频块的 RMS 能量（纯函数） */
export function computeChunkRms(audioBuffer: ArrayBuffer): number {
  const samples = new Float32Array(audioBuffer);
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
}

/**
 * 连续静音诊断器：跟踪音频块能量，连续静音达到阈值时触发一次诊断。
 * 触发后进入"已诊断"状态，直到检测到有声块才复位（避免重复弹提示）。
 */
export class SilenceTracker {
  private consecutiveSilent = 0;
  private diagnosed = false;

  /**
   * 推入一个音频块的 RMS 能量
   * @returns true 表示「本次恰好达到诊断阈值」，调用方应提示用户检查输出设备
   */
  push(rms: number): boolean {
    if (rms >= SILENT_RMS_THRESHOLD) {
      // 有声：复位，允许后续再次诊断
      this.consecutiveSilent = 0;
      this.diagnosed = false;
      return false;
    }
    this.consecutiveSilent++;
    if (!this.diagnosed && this.consecutiveSilent >= SILENT_CHUNKS_TO_DIAGNOSE) {
      this.diagnosed = true;
      return true;
    }
    return false;
  }

  /** 是否处于持续静音状态 */
  get isSilent(): boolean {
    return this.consecutiveSilent >= SILENT_CHUNKS_TO_DIAGNOSE;
  }

  reset(): void {
    this.consecutiveSilent = 0;
    this.diagnosed = false;
  }
}

// ================================================================
// 设备枚举与订阅（副作用）
// ================================================================

/**
 * 枚举系统音频输出设备。
 * Chromium 中默认设备的 deviceId 为 'default'，label 带 "Default - " 前缀。
 */
export async function getAudioOutputDevices(): Promise<AudioOutputDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || '未知输出设备',
        isDefault: d.deviceId === 'default',
      }));
  } catch (err) {
    console.warn('[outputDeviceMonitor] 枚举输出设备失败:', err);
    return [];
  }
}

/** 获取当前默认输出设备名称（去掉 Chromium 的 "Default - " 前缀），失败返回 null */
export async function getDefaultOutputDeviceLabel(): Promise<string | null> {
  const devices = await getAudioOutputDevices();
  const def = devices.find((d) => d.isDefault);
  if (!def) return null;
  return def.label.replace(/^Default\s*-\s*/i, '');
}

/**
 * 订阅音频设备变更（插拔耳机/切换默认输出等），返回取消订阅函数。
 * devicechange 可能短时间连续触发多次，内部做 1s 防抖。
 */
export function subscribeDeviceChange(handler: () => void): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const onChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      handler();
    }, 1000);
  };
  navigator.mediaDevices.addEventListener('devicechange', onChange);
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    navigator.mediaDevices.removeEventListener('devicechange', onChange);
  };
}
