/**
 * TTS 队列管理器
 *
 * @ai-context: Web Speech API 封装——FIFO 队列、同时只播一条、
 * 播放状态回调驱动水母 speaking 态；失败静默降级（不阻塞对话流）。
 * MVP 使用浏览器内置 speechSynthesis，后续可无缝切换云端 TTS。
 */

type SpeakStateCallback = (speaking: boolean) => void;

class TTSController {
  private queue: string[] = [];
  private speaking = false;
  private onStateChange: SpeakStateCallback | null = null;
  private volume = 0.7;

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  setOnStateChange(cb: SpeakStateCallback | null): void {
    this.onStateChange = cb;
  }

  /** 将文本加入朗读队列（FIFO） */
  speak(text: string): void {
    if (!('speechSynthesis' in window)) return;
    // 去除 Markdown 标记，避免朗读出星号井号
    const clean = text.replace(/[#*_`>[\]()]/g, '').trim();
    if (!clean) return;
    this.queue.push(clean);
    if (!this.speaking) this.processNext();
  }

  /** 立即停止朗读并清空队列 */
  stop(): void {
    this.queue = [];
    if (this.speaking) {
      window.speechSynthesis.cancel();
      this.speaking = false;
      this.onStateChange?.(false);
    }
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  private processNext(): void {
    const text = this.queue.shift();
    if (!text) {
      this.speaking = false;
      this.onStateChange?.(false);
      return;
    }

    this.speaking = true;
    this.onStateChange?.(true);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.volume = this.volume;
    utterance.rate = 1.0;

    // 尝试选择中文女声（优雅降级：找不到则用系统默认）
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh') && v.name.toLowerCase().includes('female'))
      ?? voices.find(v => v.lang.startsWith('zh'));
    if (zhVoice) utterance.voice = zhVoice;

    utterance.onend = () => this.processNext();
    utterance.onerror = () => this.processNext(); // 静默降级，继续下一条

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      // speechSynthesis 不可用时静默跳过
      this.processNext();
    }
  }
}

/** 全局单例——助手模块共享 */
export const ttsController = new TTSController();
