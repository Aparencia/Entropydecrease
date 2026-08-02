/**
 * AI 学伴 TTS Handler — Edge TTS（微软神经语音）
 *
 * @ai-context: 使用 node-edge-tts 调用微软 Edge 在线 TTS 服务（免费、无需 API Key），
 * 生成 MP3 临时文件后返回路径给渲染进程播放。
 * 替代 Web Speech API（Electron 中 speechSynthesis 不可用/无中文语音）。
 * 符合"可选增强"原则：网络不可用时静默失败，不阻塞对话流。
 */
import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

/** Edge TTS 语音配置 */
const TTS_VOICE = 'zh-CN-XiaoxiaoNeural';
const TTS_LANG = 'zh-CN';
const TTS_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/** 临时音频文件目录 */
function getTtsDir(): string {
  const dir = path.join(app.getPath('temp'), 'keban-tts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 清理超过 1 小时的旧临时文件 */
function cleanupOldFiles(): void {
  try {
    const dir = getTtsDir();
    const now = Date.now();
    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    }
  } catch { /* 静默 */ }
}

export function registerTtsHandlers(): void {
  safeHandle(
    'ai:tts:speak',
    async (_event, args: { text: string; rate?: string; volume?: string }) => {
      const { text, rate = '+0%', volume = '+0%' } = args;
      if (!text || text.length > 2000) {
        throw new Error('TTS 文本为空或超长');
      }

      const outputPath = path.join(getTtsDir(), `tts-${Date.now()}.mp3`);

      try {
        // 动态导入 node-edge-tts（ESM 模块）
        const { EdgeTTS } = await import('node-edge-tts');
        const tts = new EdgeTTS({
          voice: TTS_VOICE,
          lang: TTS_LANG,
          outputFormat: TTS_FORMAT,
          rate,
          volume,
          timeout: 15000,
        });

        await tts.ttsPromise(text, outputPath);

        if (!fs.existsSync(outputPath)) {
          throw new Error('TTS 输出文件未生成');
        }

        const fileSize = fs.statSync(outputPath).size;
        logger.info(`[AI] [TTS] Generated: ${outputPath} (${fileSize} bytes)`);

        // 读取 MP3 转 base64 data URL——渲染进程运行在 localhost 源，
        // 无权加载任意 file:// 本地路径，必须以 data URL 传递。
        const audioBuffer = fs.readFileSync(outputPath);
        const dataUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;

        // 生成后即可删除临时文件（data URL 已持有音频数据）
        try { fs.unlinkSync(outputPath); } catch { /* ignore */ }

        // 定期清理残留旧文件（非阻塞）
        setTimeout(cleanupOldFiles, 5000);

        return { ok: true, dataUrl };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[AI] [TTS] Failed: ${msg}`);
        // 清理失败产物
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
        throw new Error(`TTS 合成失败: ${msg}`);
      }
    },
  );

  logger.info('[AI] [TTS] Edge TTS handler registered (voice: zh-CN-XiaoxiaoNeural)');
}
