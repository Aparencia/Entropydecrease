/**
 * public 目录静态资源 URL 解析
 * Resolve public/ asset URLs so they work under Electron's file:// protocol
 *
 * 根因（内测反馈"dev 有音频、构建后没有音频"）：Electron 生产环境由
 * win.loadFile 加载 dist/index.html（file:// 协议），'/sounds/x.wav' 这类
 * 绝对路径会解析到文件系统根（file:///C:/sounds/...）而 404；开发环境
 * Vite dev server 把 public/ 挂在站点根路径下，问题被掩盖。
 *
 * 方案（业界通行做法，electron-vite / electron-builder 官方推荐）：
 * Electron 构建时 Vite base 已置为 './'（见 vite.config.ts），前端用
 * import.meta.env.BASE_URL 拼接资源 URL——'./' 相对文档（dist/index.html）
 * 解析，正确指向 asar 内 dist/sounds、dist/audio；Web/PWA 构建 base='/'，
 * 行为与原来完全一致。hash 路由不改变文档基址，相对解析稳定。
 *
 * @ai-context: 通用工具函数，消费方为 public 内全部音频资源
 * （SoundPlayer 音效 / audioTracks 白噪音与 BGM / WorldSoundscape / 学伴音效）。
 */

/**
 * 将以 '/' 开头的 public 绝对资源路径转换为当前构建可正确解析的 URL
 * @param path - 形如 '/sounds/x.wav' 的资源路径（非绝对路径原样返回）
 * @returns 可直接用于 fetch / new Audio / <audio src> 的 URL
 */
export function publicAssetUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  // BASE_URL：Electron 构建为 './'（相对文档解析），Web 构建为 '/'
  return `${import.meta.env.BASE_URL}${path.slice(1)}`;
}
