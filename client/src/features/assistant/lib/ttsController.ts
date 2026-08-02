/**
 * TTS 队列管理器 — Edge TTS（微软神经语音）
 *
 * @ai-context: 通过 IPC ai:tts:speak 调用主进程 Edge TTS 生成 MP3，
 * 渲染进程用 HTMLAudioElement 播放。FIFO 队列、同时只播一条、
 * 播放状态回调驱动水母 speaking 态；失败静默降级（不阻塞对话流）。
 * 替代 Web Speech API（Electron 中 speechSynthesis 无中文语音/不可用）。
 * 朗读前经 speechNormalizer 规范化：剔除代码块/emoji/URL/Markdown 标记，
 * 保留正文并用中文标点制造自然停顿（见 speechNormalizer.ts）。
 */

import { normalizeForSpeech } from './speechNormalizer';

type SpeakStateCallback = (speaking: boolean) => void;

class TTSController {
  private queue: string[] = [];
  private speaking = false;
  private onStateChange: SpeakStateCallback | null = null;
  private volume = 0.7;
  private currentAudio: HTMLAudioElement | null = null;

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.currentAudio) this.currentAudio.volume = this.volume;
  }

  setOnStateChange(cb: SpeakStateCallback | null): void {
    this.onStateChange = cb;
  }

  /** 将文本加入朗读队列（FIFO）。先经规范化管道清洗为可朗读文本。 */
  speak(text: string): void {
    // 规范化：剔除代码块/emoji/URL/Markdown 标记，保留正文（回答与朗读一致）
    const clean = normalizeForSpeech(text);
    if (!clean) return;
    this.queue.push(clean);
    if (!this.speaking) this.processNext();
  }

  /** 立即停止朗读并清空队列 */
  stop(): void {
    this.queue = [];
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this.speaking) {
      this.speaking = false;
      this.onStateChange?.(false);
    }
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  private async processNext(): Promise<void> {
    const text = this.queue.shift();
    if (!text) {
      this.speaking = false;
      this.onStateChange?.(false);
      return;
    }

    this.speaking = true;
    this.onStateChange?.(true);

    try {
      const api = window.electronAPI;
      if (!api) throw new Error('electronAPI 不可用');

      // IPC 调用主进程 Edge TTS 生成 MP3，返回 base64 data URL
      // （渲染进程运行在 localhost 源，无权加载 file:// 本地路径）
      const result = await api.invoke('ai:tts:speak', { text }) as { ok: boolean; dataUrl: string };
      if (!result.ok || !result.dataUrl) throw new Error('TTS 返回无效');

      // 用 HTMLAudioElement 播放 data URL
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(result.dataUrl);
        audio.volume = this.volume;
        this.currentAudio = audio;
        audio.onended = () => { this.currentAudio = null; resolve(); };
        audio.onerror = () => { this.currentAudio = null; reject(new Error('音频播放失败')); };
        audio.play().catch(reject);
      });
    } catch {
      // 静默降级——TTS 失败不阻塞对话流
    }

    // 继续处理队列中的下一条
    this.processNext();
  }
}

/** 全局单例——助手模块共享 */
export const ttsController = new TTSController();
