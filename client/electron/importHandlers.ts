/**
 * 知识入籍 IPC handlers（import:*，阶段 A 入口问题）
 *
 * @ai-context: PDF 解析仅主进程文本层（pdf-parse 2.x，图片型 PDF 返回
 * 可编辑兜底提示）；URL 抓取限 HTTP(S) + 内网地址拦截防 SSRF + 10s 超时，
 * 失败一律返回 Result 模式而非抛错（UI 可降级为手动粘贴）。records 读写
 * 走 imports 表（SCHEMA_VERSION 8 迁移）；表尚未迁移时 get 返回空列表，
 * add 返回可诊断错误，避免拖垮启动链路。
 *
 * @ai-context: Main-process parsing only. PDFs are text-layer extracted;
 * URLs are restricted to HTTP(S) with SSRF guard + 10s timeout. All
 * failures return Result objects so the UI can fall back to manual paste.
 */
import { dialog } from 'electron';
import * as path from 'path';
import { readFile, stat } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PDFParse } from 'pdf-parse';
import { safeHandle, requireText } from './ipcUtils.js';
import { logger } from './logger.js';
import { getConnection } from './db/sqliteService.js';
import type { ExtractedContent, ImportSource, SettlingRecord } from '../src/features/settling/types.js';

// ================================================================
// 常量与工具（纯函数，可单测）
// ================================================================

/** URL 抓取超时（毫秒）/ Fetch timeout */
const FETCH_TIMEOUT_MS = 10_000;
/** URL 响应体截断上限（字符，防超大页面拖垮主进程）/ Max body chars */
const MAX_BODY_CHARS = 200_000;
/** PDF 文件大小上限（字节）/ Max PDF bytes */
const MAX_PDF_BYTES = 50 * 1024 * 1024;
/** imports 表查询上限 / Records query limit */
const MAX_RECORDS = 100;

const SOURCES: readonly ImportSource[] = ['text', 'pdf', 'url', 'clipboard'];

/** imports 表行（snake_case，SQLite 边界） / Imports row */
interface ImportRow {
  id: string;
  source: string;
  raw_name: string;
  concept_count: number;
  settled_at: string;
}

function toSettlingRecord(row: ImportRow): SettlingRecord {
  return {
    id: row.id,
    source: row.source as ImportSource,
    rawName: row.raw_name,
    conceptCount: row.concept_count,
    settledAt: row.settled_at,
  };
}

/**
 * SSRF 防护：仅允许公网 HTTP(S)，拦截内网/回环/链路本地地址。
 * 覆盖 WHATWG URL 规范化的十进制/八进制/十六进制 IPv4（统一变成点分
 * 十进制后可被 /^127\./ 等捕获）与 IPv6 内网前缀（ULA fc00::/7、
 * link-local fe80::/10、IPv4-mapped ::ffff:）。
 * @returns 违规原因；null 表示放行 / Return block reason or null
 */
export function validateFetchUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'URL 格式无效';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return '仅支持 HTTP(S) 链接';
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isPrivate =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    // IPv4-mapped IPv6（::ffff:127.0.0.1 等）规范化后必须一并拦截
    host.startsWith('::ffff:') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    // IPv6 内网前缀：ULA fc00::/7（fc00-fdff）与 link-local fe80::/10（fe80-febf）
    /^f[cd]/.test(host) ||
    /^fe[89ab]/.test(host);
  return isPrivate ? '不允许访问内网或本机地址' : null;
}

/**
 * 跟随重定向但每跳重新校验目标（防 SSRF 重定向绕过）：
 * 公网站点 302 → 内网地址在本函数中被拒绝，最多 5 跳。
 * Follow redirects but re-validate every hop against the SSRF guard.
 */
async function fetchWithRedirectGuard(initialUrl: string): Promise<Response> {
  let current = initialUrl;
  for (let hop = 0; ; hop++) {
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'EntropyDecrease-Settling/0.1' },
    });
    if (res.status >= 300 && res.status < 400) {
      if (hop >= 5) throw new Error('重定向次数过多');
      const location = res.headers.get('location');
      if (!location) throw new Error('重定向缺少目标地址');
      const next = new URL(location, current).toString();
      const blockReason = validateFetchUrl(next);
      if (blockReason) throw new Error(blockReason);
      current = next;
      continue;
    }
    return res;
  }
}

/**
 * 流式读取响应体并截断到上限字符数（防超大响应内存风险）
 * Stream the response body, bounded to maxChars characters.
 */
async function readBodyBounded(res: Response, maxChars: number): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, maxChars);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (body.length >= maxChars) {
        body = body.slice(0, maxChars);
        await reader.cancel(); // 提前终止下载
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return body;
}

/**
 * 轻量 HTML 正文提取（无第三方依赖）：去噪声节点后取 <article>/<main>
 * 或 body 文本，折叠空白。非完整渲染，仅服务知识入籍的正文抓取。
 */
export function extractHtmlText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 200)
    : '';
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const article = cleaned.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  const text = (article ? article[1] : cleaned)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: title || '未命名网页', text };
}

// ================================================================
// IPC handlers
// ================================================================

/**
 * 注册全部 import:* IPC handlers（app ready 后调用一次）
 */
export function registerImportHandlers(): void {
  /**
   * import:parse-pdf — 主进程解析 PDF 文本层。
   * 无参数时弹出系统文件选择框；也可由拖拽传入 filePath。
   */
  safeHandle('import:parse-pdf', async (_event, payload?: { filePath?: unknown }) => {
    let filePath: string | null = null;
    if (!payload || typeof payload.filePath !== 'string') {
      const picked = await dialog.showOpenDialog({
        title: '选择要导入的 PDF 文件',
        properties: ['openFile'],
        filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
      });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { success: false, canceled: true, error: null };
      }
      filePath = picked.filePaths[0];
    } else {
      filePath = payload.filePath;
    }

    try {
      if (path.extname(filePath).toLowerCase() !== '.pdf') {
        return { success: false, error: '请选择 PDF 文件' };
      }
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_PDF_BYTES) {
        return { success: false, error: 'PDF 文件过大（超过 50MB），请手动粘贴内容' };
      }
      const buffer = await readFile(filePath);
      const parser = new PDFParse({ data: buffer });
      let text = '';
      try {
        text = (await parser.getText()).text.trim();
      } finally {
        await parser.destroy();
      }

      const content: ExtractedContent = {
        title: path.basename(filePath, path.extname(filePath)),
        text,
        source: 'pdf',
      };
      if (!text) {
        content.note = '未能从该 PDF 提取到文本（可能是图片型扫描件），可手动粘贴内容';
      }
      logger.info(`[Import] PDF parsed: ${content.title}, ${text.length} chars`);
      return { success: true, content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[Import] PDF parse failed: ${message}`);
      return { success: false, error: 'PDF 解析失败，可手动粘贴内容' };
    }
  });

  /**
   * import:fetch-url — 抓取网页正文。仅 HTTP(S) + 内网拦截 + 10s 超时；
   * 失败返回可诊断错误，UI 降级为手动粘贴。
   */
  safeHandle('import:fetch-url', async (_event, payload: { url?: unknown }) => {
    let url = '';
    try {
      url = requireText(payload?.url, 'url');
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '缺少 URL' };
    }
    const blockReason = validateFetchUrl(url);
    if (blockReason) {
      return { success: false, error: blockReason };
    }

    try {
      const res = await fetchWithRedirectGuard(url);
      if (!res.ok) {
        return { success: false, error: `网页访问失败（HTTP ${res.status}），可手动粘贴内容` };
      }
      // Content-Length 预检：超大响应直接拒绝，避免无谓下载
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > MAX_BODY_CHARS) {
        return { success: false, error: '网页内容过大，可手动粘贴正文内容' };
      }
      // 流式截断：即使服务器不声明 Content-Length 或分块传输，
      // 也只累计前 MAX_BODY_CHARS 字符，防止超大响应拖垮主进程内存
      const raw = await readBodyBounded(res, MAX_BODY_CHARS);
      const { title, text } = extractHtmlText(raw);
      if (!text) {
        return { success: false, error: '未能从该网页提取到正文，可手动粘贴内容' };
      }
      logger.info(`[Import] URL fetched: ${title}, ${text.length} chars`);
      return { success: true, content: { title, text, source: 'url' } as ExtractedContent };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes('timeout') || message.includes('aborted');
      logger.warn(`[Import] URL fetch failed: ${message}`);
      return {
        success: false,
        error: isTimeout ? '网页抓取超时（10 秒），可手动粘贴内容' : '网页抓取失败，可手动粘贴内容',
      };
    }
  });

  /** import:get-settling-records — 最近入籍记录（倒序，≤100 条） */
  safeHandle('import:get-settling-records', async () => {
    try {
      const rows = getConnection().prepare(
        `SELECT id, source, raw_name, concept_count, settled_at
         FROM imports ORDER BY settled_at DESC LIMIT ${MAX_RECORDS}`
      ).all() as unknown as ImportRow[];
      return { success: true, records: rows.map(toSettlingRecord) };
    } catch (err) {
      // imports 表依赖 SCHEMA_VERSION 8 迁移；迁移前视为无记录，不阻塞 UI
      logger.warn(`[Import] List records failed (schema not migrated?): ${err instanceof Error ? err.message : String(err)}`);
      return { success: true, records: [] };
    }
  });

  /** import:add-settling-record — 写入一条入籍记录 */
  safeHandle('import:add-settling-record', async (_event, payload: {
    source?: unknown; rawName?: unknown; conceptCount?: unknown;
  }) => {
    try {
      const source = payload?.source;
      if (typeof source !== 'string' || !SOURCES.includes(source as ImportSource)) {
        return { success: false, error: 'source 必须为 text/pdf/url/clipboard 之一' };
      }
      const rawName = requireText(payload?.rawName, 'rawName');
      const conceptCount = payload?.conceptCount ?? 0;
      if (typeof conceptCount !== 'number' || !Number.isInteger(conceptCount) || conceptCount < 0) {
        return { success: false, error: 'conceptCount 必须为非负整数' };
      }
      const record: ImportRow = {
        id: randomUUID(),
        source,
        raw_name: rawName.slice(0, 500),
        concept_count: conceptCount,
        settled_at: new Date().toISOString(),
      };
      getConnection().prepare(
        `INSERT INTO imports (id, source, raw_name, concept_count, settled_at)
         VALUES (@id, @source, @raw_name, @concept_count, @settled_at)`
      ).run(record);
      logger.info(`[Import] Record added: ${record.source}/${record.raw_name} ×${record.concept_count}`);
      return { success: true, record: toSettlingRecord(record) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[Import] Add record failed: ${message}`);
      return { success: false, error: '入籍记录写入失败，请检查数据存储状态' };
    }
  });
}
