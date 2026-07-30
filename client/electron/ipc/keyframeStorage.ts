/**
 * 课堂关键帧图片持久化 IPC + keyframe:// 自定义协议
 * Classroom keyframe image persistence IPC handlers and custom
 * keyframe:// protocol for renderer-side image loading.
 *
 * @ai-context: 关键帧 JPEG 本地落盘到 {userData}/captures/{sessionId}/{keyframeId}.jpg，
 * 遵守本地优先原则（图片不上传）。渲染进程通过自定义 keyframe:// 协议加载：
 * 开发页面源为 http://localhost、生产为 file://，file:// 子资源会被
 * webSecurity/CSP 拦截，故注册 standard+secure 专用协议（CSP img-src 已放行 keyframe:）。
 * (Custom protocol is used because file:// subresources are blocked by
 * webSecurity/CSP under both dev http origin and prod file origin.)
 * @ai-context: sessionId/keyframeId 仅允许 UUID/安全字符（防路径穿越）；
 * keyframe_cleanup 删除整个会话目录，由笔记删除路径调用（失败静默）。
 */
import { app, net, protocol } from 'electron';
import * as path from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { pathToFileURL } from 'url';
import { safeHandle } from '../ipcUtils.js';
import { logger } from '../logger.js';

/** 自定义协议名与固定 host（keyframe://capture/{sessionId}/{keyframeId}.jpg） */
const KEYFRAME_SCHEME = 'keyframe';
const KEYFRAME_HOST = 'capture';

/** 安全 ID 校验：仅允许 UUID/字母数字/下划线/连字符，最长 64（防路径穿越） */
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID_RE.test(id);
}

/** 关键帧图片根目录：{userData}/captures */
function capturesRoot(): string {
  return path.join(app.getPath('userData'), 'captures');
}

/**
 * 注册 keyframe:// 为特权 scheme。
 * 必须在 app ready 之前调用（main.ts 模块顶层）。
 * (Must be called before app ready.)
 */
export function registerKeyframeScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: KEYFRAME_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/**
 * 注册 keyframe:// 协议 handler 与 keyframe_save / keyframe_cleanup IPC。
 * app ready 后调用一次（main.ts whenReady 中）。
 */
export function registerKeyframeIpcHandlers(): void {
  // ---- keyframe:// 协议：映射到本地 captures 目录（只读） ----
  if (protocol.isProtocolHandled(KEYFRAME_SCHEME)) {
    protocol.unhandle(KEYFRAME_SCHEME);
  }
  protocol.handle(KEYFRAME_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const [sessionId, fileName] = url.pathname.replace(/^\//, '').split('/');
      const keyframeId = fileName?.endsWith('.jpg') ? fileName.slice(0, -4) : undefined;
      if (url.hostname !== KEYFRAME_HOST || !isSafeId(sessionId) || !isSafeId(keyframeId)) {
        return new Response('Bad Request', { status: 400 });
      }
      const filePath = path.join(capturesRoot(), sessionId, `${keyframeId}.jpg`);
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      logger.warn(`[Keyframe] Protocol request failed: ${String(err)}`);
      return new Response('Not Found', { status: 404 });
    }
  });

  // ---- 保存关键帧 JPEG（返回可渲染 URL）----
  safeHandle(
    'keyframe_save',
    async (_event, args: { sessionId: string; keyframeId: string; imageBase64: string }) => {
      const { sessionId, keyframeId, imageBase64 } = args ?? {};
      if (!isSafeId(sessionId) || !isSafeId(keyframeId)) {
        throw new Error('非法的 sessionId/keyframeId');
      }
      if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
        throw new Error('imageBase64 不能为空');
      }
      // 容忍 data URL 前缀（tolerate optional data URL prefix）
      const commaIdx = imageBase64.indexOf(',');
      const rawBase64 = imageBase64.startsWith('data:') && commaIdx >= 0
        ? imageBase64.slice(commaIdx + 1)
        : imageBase64;

      const dir = path.join(capturesRoot(), sessionId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${keyframeId}.jpg`), Buffer.from(rawBase64, 'base64'));
      return {
        success: true,
        url: `${KEYFRAME_SCHEME}://${KEYFRAME_HOST}/${sessionId}/${keyframeId}.jpg`,
      };
    },
  );

  // ---- 清理会话目录（笔记删除时调用，失败由调用方静默处理）----
  safeHandle('keyframe_cleanup', async (_event, args: { sessionId: string }) => {
    const sessionId = args?.sessionId;
    if (!isSafeId(sessionId)) {
      throw new Error('非法的 sessionId');
    }
    await rm(path.join(capturesRoot(), sessionId), { recursive: true, force: true });
    return { success: true };
  });
}
