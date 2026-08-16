import { defineConfig, type Plugin, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { writeFileSync, mkdirSync } from 'fs'

// 检测 Electron 桌面端构建模式
const isElectronBuild = !!process.env.ELECTRON_BUILD;
// PWA 部署子路径（CI 注入 VITE_PWA_BASE=/pwa；本地默认根路径 '/'）。
// 同时控制构建 base 与 manifest start_url/scope，保证子路径部署（/pwa/）时
// 资源路径与安装入口均指向正确位置
const pwaBase = (process.env.VITE_PWA_BASE || '').replace(/\/+$/, '');
const pwaBasePath = pwaBase ? `${pwaBase}/` : '/';

/**
 * Vite 插件：Electron 构建时将主进程需要的 VITE_* 环境变量写入 build-config.json
 *
 * 生成的文件位于 dist-electron/build-config.json，随 asar 一起打包。
 * Electron 主进程启动时读取此文件，替代直接打包 .env 文件。
 * 这样 .env.production 仅用于 Vite 构建时，不会泄露到安装包中。
 */
function electronBuildConfigPlugin(): Plugin {
  return {
    name: 'electron-build-config',
    applyToEnvironment: () => isElectronBuild,
    writeBundle() {
      // 使用 Vite 的 loadEnv 加载 .env 文件（与 Vite 构建行为一致）
      // loadEnv 按约定加载：.env → .env.production → 系统环境变量（后者覆盖前者）
      const env = loadEnv('production', process.cwd(), '');
      // 构建期防护：关键 VITE_ 变量缺失/占位符时立即终止构建，
      // 防止产出「云服务尚未配置」的静默残废安装包
      //（曾因 .env.production 被 gitignore、CI checkout 缺失而发生）
      const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_BASE_URL', 'VITE_AI_GATEWAY_URL'];
      const missing = required.filter((key) => !env[key] || env[key].includes('your-'));
      if (missing.length > 0) {
        throw new Error(
          `[electron-build-config] 缺少必需环境变量: ${missing.join(', ')}，请检查 client/.env.production 是否存在且完整`,
        );
      }
      const config = {
        VITE_AI_GATEWAY_URL: env.VITE_AI_GATEWAY_URL || '',
        VITE_API_BASE_URL: env.VITE_API_BASE_URL || '',
      };
      const outDir = path.resolve(__dirname, 'dist-electron');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        path.join(outDir, 'build-config.json'),
        JSON.stringify(config, null, 2),
        'utf-8',
      );
      console.log(`[electron-build-config] Generated build-config.json (gateway=${config.VITE_AI_GATEWAY_URL || '(empty)'})`);
    },
  };
}

export default defineConfig(({ command }) => ({
  // base 仅在 Electron 构建产物时使用 './'（file:// 协议加载需要）；
  // dev 模式必须保持 '/'——否则 Vite 预构建依赖 URL 解析异常，
  // 全部 optimizeDeps 产物持续 504，lazy 页面动态导入失败
  // （曾因 ELECTRON_BUILD=1 vite --mode test 启动 dev server 触发）
  base: isElectronBuild && command === 'build' ? './' : pwaBasePath,
  plugins: [
    react(),
    // Electron 构建时生成 build-config.json，供主进程运行时读取环境变量
    ...(isElectronBuild ? [electronBuildConfigPlugin()] : []),
    ...(isElectronBuild ? [] : [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'offline.html'],
      manifest: {
        name: '熵减 - 学习伴侣',
        short_name: '熵减',
        description: '智能学习管理工具 - 笔记、闪卡、费曼学习法、番茄钟',
        lang: 'zh-CN',
        theme_color: '#3b82f6',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: pwaBasePath,
        start_url: pwaBasePath,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // 离线回退页面：当导航请求失败时返回 offline.html
        navigateFallback: '/offline.html',
        // 排除 API 路由和认证路由不使用 navigateFallback
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/auth\//,
        ],
        runtimeCaching: [
          // Google Fonts 缓存
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          // API 调用：NetworkFirst（网络优先，超时降级缓存；Workbox 规定 networkTimeoutSeconds 仅支持 NetworkFirst）
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
              networkTimeoutSeconds: 3,
            },
          },
          // 图片/媒体资源：CacheFirst with max entries
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          // 音频资源缓存：StaleWhileRevalidate 保证同名音效更新后老用户可在下次会话拿到新版本
          // （CacheFirst 下重新生成的同名 wav 会被 30 天旧缓存遮蔽）
          {
            urlPattern: /\.(?:mp3|ogg|wav)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'audio-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    })]),
  ],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/electron/**', '**/dist-electron/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 使用 rolldown 作为打包引擎，其 manualChunks 仅支持函数形式，
        // 不再支持对象形式（对象形式会抛出 "manualChunks is not a function"）。
        // 这里改用函数形式，按 node_modules 包名精确分组，保持与原对象配置一致的拆包意图。
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          const p = id.replace(/\\/g, '/')
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(p)) return 'vendor-react'
          if (/\/node_modules\/(zustand|dexie)\//.test(p)) return 'vendor-state'
          if (/\/node_modules\/(framer-motion|recharts)\//.test(p)) return 'vendor-ui'
          if (/\/node_modules\/@tiptap\//.test(p)) return 'vendor-editor'
        },
      },
    },
  },
  // electron-updater 是纯 ESM 模块，仅 Electron 主进程使用，
  // better-sqlite3 是原生 C++ addon，均排除 Vite 预构建以避免 ERR_REQUIRE_ESM / .node 加载错误。
  // @automerge/automerge 内含 WASM，预构建会丢失 automerge_wasm_bg.wasm 导致启动时模块初始化失败（React 无法挂载）
  optimizeDeps: {
    exclude: ['electron-updater', 'better-sqlite3', '@automerge/automerge'],
  },
}))
