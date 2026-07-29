/**
 * 音效播放器
 *
 * @ai-context 基于 Web Audio API 实现，零依赖。
 * 支持预加载、分类音量控制、全局静音、类别级开关。
 * 播放失败时静默降级，不影响主流程。
 */

import {
  SOUND_DEFINITIONS,
  DEFAULT_SOUND_SETTINGS,
  findSoundDefinition,
  type SoundCategory,
  type SoundSettings,
} from './audioConfig';

/** 音效 ID → 文件路径映射（从 SOUND_DEFINITIONS 动态生成） */
const SOUND_MAP: Record<string, string> = Object.fromEntries(
  SOUND_DEFINITIONS.map((d) => [d.id, d.filePath]),
);

export type SoundId = string;

/** 同一音效默认节流间隔（毫秒） */
const DEFAULT_THROTTLE_MS = 80;

class SoundPlayer {
  private context: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private settings: SoundSettings = { ...DEFAULT_SOUND_SETTINGS };
  /** 音效 ID → 上次播放时间戳（用于节流） */
  private lastPlayedAt: Map<string, number> = new Map();

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }
    return this.context;
  }

  /**
   * 更新音效设置（由 settingsStore 调用）
   * @param settings - 新的音效设置
   */
  updateSettings(settings: SoundSettings): void {
    this.settings = settings;
  }

  /**
   * 获取当前音效设置
   * @returns 当前音效设置快照
   */
  getSettings(): SoundSettings {
    return this.settings;
  }

  /**
   * 预加载音效到 AudioBuffer
   * @param soundId - 音效 ID
   */
  async preload(soundId: SoundId): Promise<void> {
    const path = SOUND_MAP[soundId];
    if (!path || this.buffers.has(path)) return;
    try {
      const ctx = this.getContext();
      const response = await fetch(path, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        // dev 环境提示加载失败（如 404），生产保持静默
        if (import.meta.env.DEV) {
          console.warn(`[SoundPlayer] 音效加载失败 (HTTP ${response.status}): ${soundId} → ${path}`);
        }
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(path, audioBuffer);
    } catch (err) {
      // 静默降级；dev 环境输出失败详情便于排查
      if (import.meta.env.DEV) {
        console.warn(`[SoundPlayer] 音效加载失败: ${soundId} → ${path}`, err);
      }
    }
  }

  /** 预加载所有音效 */
  async preloadAll(): Promise<void> {
    await Promise.allSettled(
      SOUND_DEFINITIONS.map((d) => this.preload(d.id)),
    );
  }

  /**
   * 按类别播放音效
   * @param soundId - 音效 ID
   * @param category - 音效类别（用于检查开关和音量）
   */
  playByCategory(soundId: string, category: SoundCategory): void {
    if (this.settings.masterMute) return;
    const catSettings = this.settings.categories[category];
    if (!catSettings?.enabled) return;
    this.playInternal(soundId, catSettings.volume / 100);
  }

  /**
   * 播放音效（向后兼容，使用对应类别的设置）
   * @param soundId - 音效 ID
   * @param options - 可选音量覆盖 / 节流间隔覆盖（如 3D 悬停传 200）
   */
  play(soundId: SoundId, options?: { volume?: number; throttleMs?: number }): void {
    const def = findSoundDefinition(soundId);
    if (def) {
      if (this.settings.masterMute) return;
      const catSettings = this.settings.categories[def.category];
      if (!catSettings?.enabled) return;
      const vol = options?.volume ?? catSettings.volume / 100;
      this.playInternal(soundId, vol, options?.throttleMs);
    } else {
      // 未注册的音效，使用默认音量播放
      if (this.settings.masterMute) return;
      this.playInternal(soundId, options?.volume ?? 0.7, options?.throttleMs);
    }
  }

  /**
   * 预览播放（忽略静音/禁用状态与节流，用于设置页试听）
   * @param soundId - 音效 ID
   */
  previewSound(soundId: string): void {
    this.playInternal(soundId, 0.8, 0);
  }

  /**
   * 内部播放实现
   * @param soundId - 音效 ID
   * @param volume - 音量 0-1
   * @param throttleMs - 节流间隔（毫秒），同一音效距上次播放小于该值则跳过；传 0 禁用节流
   */
  private playInternal(soundId: string, volume: number, throttleMs: number = DEFAULT_THROTTLE_MS): void {
    try {
      if (throttleMs > 0) {
        const now = Date.now();
        const last = this.lastPlayedAt.get(soundId);
        if (last !== undefined && now - last < throttleMs) return;
        this.lastPlayedAt.set(soundId, now);
      }
      const path = SOUND_MAP[soundId];
      if (!path) return;
      const buffer = this.buffers.get(path);
      if (!buffer) {
        // 首播已记录时间戳，预加载后重试时跳过节流避免自阻塞
        this.preload(soundId).then(() => this.playInternal(soundId, volume, 0));
        return;
      }
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        // suspended 时需等 resume 完成再播放，否则首次播放会丢音
        ctx.resume()
          .then(() => this.startSource(ctx, buffer, volume))
          .catch(() => { /* 静默降级 */ });
        return;
      }
      // running 状态直接同步播放，不引入额外延迟
      this.startSource(ctx, buffer, volume);
    } catch {
      // 静默降级，不影响主流程
    }
  }

  /**
   * 创建 BufferSource 并立即播放
   * @param ctx - AudioContext
   * @param buffer - 已解码的音频数据
   * @param volume - 音量 0-1
   */
  private startSource(ctx: AudioContext, buffer: AudioBuffer, volume: number): void {
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, volume));
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    } catch {
      // 静默降级，不影响主流程
    }
  }

  /**
   * 设置全局音量 (0-1)
   * @deprecated 请使用 updateSettings 替代
   */
  setVolume(vol: number): void {
    const ratio = Math.max(0, Math.min(1, vol));
    const updated = { ...this.settings };
    for (const key of Object.keys(updated.categories) as SoundCategory[]) {
      updated.categories[key] = {
        ...updated.categories[key],
        volume: Math.round(ratio * 100),
      };
    }
    this.settings = updated;
  }

  /** 获取当前音量（取最高类别音量） */
  getVolume(): number {
    const volumes = Object.values(this.settings.categories).map((c) => c.volume);
    return Math.max(...volumes) / 100;
  }

  /**
   * 设置静音
   * @deprecated 请使用 updateSettings 替代
   */
  setMuted(muted: boolean): void {
    this.settings = { ...this.settings, masterMute: muted };
  }

  /** 是否静音 */
  isMuted(): boolean {
    return this.settings.masterMute;
  }
}

export const soundPlayer = new SoundPlayer();
