/**
 * VADMarker 单元测试 — 校准跳过（loopback）与自适应校准（microphone）
 *
 * @ai-context: 锁定网课/现场课程双场景行为：loopback 构造即已校准
 * （预设阈值 0.008，UI 不出现校准提示）；microphone 前 10 块自适应校准。
 * 时间相关逻辑用 fake timers 控制。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VADMarker } from './vadMarker';
import type { SileroProbSource } from './sileroVad';
import type { AudioChunkData } from './captureTypes';

/** 构造指定幅值的音频块（16kHz 单声道 100ms） */
function makeChunk(amplitude: number, samples = 1600): AudioChunkData {
  return {
    audioBuffer: new Float32Array(samples).fill(amplitude).buffer,
    sampleRate: 16000,
    channels: 1,
    durationMs: (samples / 16000) * 1000,
    timestamp: Date.now(),
  } as AudioChunkData;
}

describe('VADMarker — loopback（网课模式）跳过校准', () => {
  it('构造后立即处于已校准状态，使用预设阈值 0.008', () => {
    // Arrange & Act
    const marker = new VADMarker({ sourceType: 'loopback' });
    const stats = marker.getStats();
    // Assert
    expect(stats.calibrated).toBe(true);
    expect(stats.currentThreshold).toBe(0.008);
  });

  it('默认配置（不传 sourceType）即为 loopback，跳过校准', () => {
    // Arrange & Act
    const marker = new VADMarker();
    // Assert
    expect(marker.getStats().calibrated).toBe(true);
  });

  it('显式传入 energyThreshold 时不被预设值覆盖', () => {
    // Arrange & Act
    const marker = new VADMarker({ sourceType: 'loopback', energyThreshold: 0.02 });
    // Assert
    expect(marker.getStats().currentThreshold).toBe(0.02);
  });

  it('首个有声块即可被识别为语音（无校准等待期）', () => {
    // Arrange
    const marker = new VADMarker({ sourceType: 'loopback' });
    // Act：第 1 块就是语音（能量 0.1 > 阈值 0.008）
    marker.processChunk(makeChunk(0.1));
    // Assert
    expect(marker.getStats().lastVoiceTimestamp).toBeGreaterThan(0);
  });

  it('reset 后仍保持已校准状态', () => {
    // Arrange
    const marker = new VADMarker({ sourceType: 'loopback' });
    marker.processChunk(makeChunk(0.1));
    // Act
    marker.reset();
    // Assert
    expect(marker.getStats().calibrated).toBe(true);
  });
});

describe('VADMarker — microphone（现场课程）自适应校准', () => {
  it('构造后未校准，需前 10 块采样', () => {
    // Arrange & Act
    const marker = new VADMarker({ sourceType: 'microphone' });
    // Assert
    expect(marker.getStats().calibrated).toBe(false);
  });

  it('处理 10 块后完成校准，阈值 = max(0.008, 平均底噪 × 2.5)', () => {
    // Arrange
    const marker = new VADMarker({ sourceType: 'microphone' });
    // Act：10 块恒定底噪 0.02（模拟嘈杂教室）
    for (let i = 0; i < 10; i++) marker.processChunk(makeChunk(0.02));
    // Assert
    const stats = marker.getStats();
    expect(stats.calibrated).toBe(true);
    expect(stats.currentThreshold).toBeCloseTo(0.05, 5); // 0.02 × 2.5
  });

  it('底噪极低时阈值不低于下限 0.008', () => {
    // Arrange
    const marker = new VADMarker({ sourceType: 'microphone' });
    // Act：安静环境底噪 0.001
    for (let i = 0; i < 10; i++) marker.processChunk(makeChunk(0.001));
    // Assert
    expect(marker.getStats().currentThreshold).toBe(0.008);
  });

  it('reset 后回到未校准状态', () => {
    // Arrange
    const marker = new VADMarker({ sourceType: 'microphone' });
    for (let i = 0; i < 10; i++) marker.processChunk(makeChunk(0.02));
    // Act
    marker.reset();
    // Assert
    expect(marker.getStats().calibrated).toBe(false);
  });
});

describe('VADMarker — loopback 语音分段', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('语音后静音超过 800ms 完成分段并触发 onSegmentReady', () => {
    // Arrange
    const marker = new VADMarker({ sourceType: 'loopback' });
    const onReady = vi.fn();
    marker.onSegmentReady = onReady;
    // Act：语音 500ms（>= minSpeechDurationMs 300）
    marker.processChunk(makeChunk(0.1));
    vi.advanceTimersByTime(500);
    marker.processChunk(makeChunk(0.1));
    // 静音 900ms（>= silenceDurationMs 800）
    vi.advanceTimersByTime(900);
    marker.processChunk(makeChunk(0));
    // Assert
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(marker.getSegments()).toHaveLength(1);
    expect(marker.getStats().segmentCount).toBe(1);
  });

  it('连续语音达到 maxSpeechDurationMs 时强制分段（兼容 GLM ≤30s 限制）', () => {
    // Arrange：为加快测试用 3s 强制分段阈值
    const marker = new VADMarker({ sourceType: 'loopback', maxSpeechDurationMs: 3000 });
    const onReady = vi.fn();
    marker.onSegmentReady = onReady;
    // Act：持续语音 4s（每 500ms 一块，无静音间隙）
    for (let i = 0; i <= 8; i++) {
      marker.processChunk(makeChunk(0.1));
      vi.advanceTimersByTime(500);
    }
    // Assert：3s 处被强制切出第一段，后续语音继续累积为新段
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(marker.getSegments()).toHaveLength(1);
  });

  it('强制分段后新语音段继续正常按静音断句', () => {
    // Arrange
    const marker = new VADMarker({ sourceType: 'loopback', maxSpeechDurationMs: 2000 });
    const onReady = vi.fn();
    marker.onSegmentReady = onReady;
    // Act：连续语音 2.5s 触发强制分段
    for (let i = 0; i <= 5; i++) {
      marker.processChunk(makeChunk(0.1));
      vi.advanceTimersByTime(500);
    }
    expect(onReady).toHaveBeenCalledTimes(1);
    // 新段语音 500ms 后静音 900ms → 第二段按静音正常断句
    marker.processChunk(makeChunk(0.1));
    vi.advanceTimersByTime(900);
    marker.processChunk(makeChunk(0));
    // Assert
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(marker.getSegments()).toHaveLength(2);
  });
});

describe('VADMarker — Silero 精判（P0-2：噪声抑制 + 静音复核）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** 构造注入式 Silero 概率源 mock（固定概率） */
  function makeSilero(prob: number | null): SileroProbSource {
    return {
      latestProb: () => prob,
      recentProb: () => prob,
      push: vi.fn(),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
  }

  it('持续噪声被抑制：RMS 超阈 + Silero 连续低概率不产生语音段', () => {
    // Arrange：键盘/音乐类噪声——RMS 0.1 远超阈值但 Silero 概率恒低
    const silero = makeSilero(0.05);
    const marker = new VADMarker({ sourceType: 'loopback' }, silero);
    const onReady = vi.fn();
    marker.onSegmentReady = onReady;
    // Act：5 块连续"噪声"
    for (let i = 0; i < 5; i++) {
      marker.processChunk(makeChunk(0.1));
      vi.advanceTimersByTime(500);
    }
    // Assert：无语音段、无分段回调、无语音时间戳
    expect(marker.getSegments()).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
    expect(marker.getStats().lastVoiceTimestamp).toBe(0);
  });

  it('语音起始块概率滞后（低）时语音不丢失：概率恢复后正常成段', () => {
    // Arrange：块 1 的概率是上一静音块的推理结果（滞后一拍，低值）
    let prob = 0.05;
    const silero: SileroProbSource = {
      latestProb: () => prob,
      recentProb: () => prob,
      push: vi.fn(),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
    const marker = new VADMarker({ sourceType: 'loopback' }, silero);
    const onReady = vi.fn();
    marker.onSegmentReady = onReady;
    // Act：块 1 低概率（暂存）→ 概率恢复（块 2 进入语音）→ 静音结束段
    marker.processChunk(makeChunk(0.1));
    vi.advanceTimersByTime(500);
    prob = 0.9;
    marker.processChunk(makeChunk(0.1));
    vi.advanceTimersByTime(500);
    prob = 0.05;
    vi.advanceTimersByTime(900);
    marker.processChunk(makeChunk(0));
    // Assert：成段且回调携带音频（块 1 暂存样本已补入段首）
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(marker.getSegments()).toHaveLength(1);
    expect(marker.getStats().lastVoiceTimestamp).toBeGreaterThan(0);
  });

  it('静音复核：RMS 判静音但 Silero 判语音仍在 → 推迟分段', () => {
    // Arrange：低能量语音尾——RMS 低于阈值但 Silero 概率高
    let prob = 0.9;
    const silero: SileroProbSource = {
      latestProb: () => prob,
      recentProb: () => prob,
      push: vi.fn(),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
    const marker = new VADMarker({ sourceType: 'loopback' }, silero);
    const onReady = vi.fn();
    marker.onSegmentReady = onReady;
    // Act：语音 500ms → 静音 900ms（Silero 仍高 → 推迟）→ 概率转低 → 分段
    marker.processChunk(makeChunk(0.1));
    vi.advanceTimersByTime(500);
    marker.processChunk(makeChunk(0));
    vi.advanceTimersByTime(900);
    expect(onReady).not.toHaveBeenCalled();
    prob = 0.05;
    marker.processChunk(makeChunk(0));
    vi.advanceTimersByTime(900);
    // Assert
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(marker.getSegments()).toHaveLength(1);
  });

  it('静音复核推迟超上限（3000ms）后强制分段', () => {
    // Arrange：Silero 持续高概率（误判长噪声为语音）→ 推迟有上限
    const silero = makeSilero(0.9);
    const marker = new VADMarker({ sourceType: 'loopback', maxSpeechDurationMs: 60000 }, silero);
    const onReady = vi.fn();
    marker.onSegmentReady = onReady;
    // Act：语音 1 块后连续静音块，Silero 恒高 → 累计推迟超 3000ms 强制分段
    marker.processChunk(makeChunk(0.1));
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(500);
      marker.processChunk(makeChunk(0));
    }
    // Assert
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(marker.getSegments()).toHaveLength(1);
  });

  it('Silero 概率不可用（null）时不干预，纯 RMS 现状行为', () => {
    // Arrange
    const silero = makeSilero(null);
    const marker = new VADMarker({ sourceType: 'loopback' }, silero);
    const onReady = vi.fn();
    marker.onSegmentReady = onReady;
    // Act：正常语音 → 静音分段（与无 Silero 行为一致）
    marker.processChunk(makeChunk(0.1));
    vi.advanceTimersByTime(500);
    marker.processChunk(makeChunk(0.1));
    vi.advanceTimersByTime(900);
    marker.processChunk(makeChunk(0));
    // Assert
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('reset 时同步重置 Silero 流状态', () => {
    // Arrange
    const silero = makeSilero(null);
    const marker = new VADMarker({ sourceType: 'loopback' }, silero);
    // Act
    marker.reset();
    // Assert
    expect(silero.reset).toHaveBeenCalledTimes(1);
  });
});
