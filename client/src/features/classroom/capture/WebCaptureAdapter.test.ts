/**
 * WebCaptureAdapter 纯函数测试（PWA 麦克风应急通道，M4 Task12 补测）
 *
 * @ai-context: 覆盖 resampleToMono（48k→16k 降采样 + 多声道混单）与
 * computeRms（能量计算）。MediaRecorder/getUserMedia 依赖真实浏览器，
 * jsdom 无法实例化，故仅测纯函数层。
 * @ai-context EN: unit tests for resampleToMono (48k→16k downsampling +
 * channel mixing) and computeRms. MediaRecorder/getUserMedia need a real
 * browser, so only pure functions are covered under jsdom.
 */
import { describe, it, expect } from 'vitest';
import { resampleToMono, computeRms } from './WebCaptureAdapter';

/** 构造最小 AudioBuffer 假对象（仅覆盖 resampleToMono 用到的字段） */
function fakeAudioBuffer(sampleRate: number, channelData: Float32Array[]): AudioBuffer {
  return {
    sampleRate,
    numberOfChannels: channelData.length,
    length: channelData[0]?.length ?? 0,
    duration: 0,
    getChannelData: (c: number) => channelData[c] ?? new Float32Array(0),
  } as unknown as AudioBuffer;
}

describe('resampleToMono 重采样混单', () => {
  it('48kHz 单声道降采样到 16kHz，长度约为 1/3', () => {
    const src = new Float32Array(48000);
    src.fill(0.5);
    const out = resampleToMono(fakeAudioBuffer(48000, [src]), 16000);
    expect(out.length).toBe(Math.floor(48000 / 3));
    expect(out[0]).toBeCloseTo(0.5, 3);
  });

  it('双声道取平均', () => {
    const left = new Float32Array(16000).fill(0.4);
    const right = new Float32Array(16000).fill(0.8);
    const out = resampleToMono(fakeAudioBuffer(16000, [left, right]), 16000);
    expect(out.length).toBe(16000);
    expect(out[0]).toBeCloseTo(0.6, 3);
  });

  it('空缓冲返回空数组', () => {
    const out = resampleToMono(fakeAudioBuffer(48000, [new Float32Array(0)]), 16000);
    expect(out.length).toBe(0);
  });
});

describe('computeRms 能量计算', () => {
  it('全零样本能量为 0', () => {
    expect(computeRms(new Float32Array(100))).toBe(0);
  });

  it('满幅样本能量约为 1', () => {
    const pcm = new Float32Array(100).fill(1.0);
    expect(computeRms(pcm)).toBeCloseTo(1, 5);
  });

  it('空数组能量为 0', () => {
    expect(computeRms(new Float32Array(0))).toBe(0);
  });
});
