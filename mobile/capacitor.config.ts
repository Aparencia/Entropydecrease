/**
 * 熵减 — Capacitor 壳配置
 *
 * @ai-context: webDir 指向 client 的 Capacitor 构建产物（dist-capacitor，
 * 与 PWA dist 隔离，禁用 Service Worker）。appId 为应用唯一标识，
 * 上架后不可变更。
 * @ai-context EN: webDir points at client's Capacitor-mode build output
 * (dist-capacitor, SW disabled). appId is the immutable application id.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.entropydecrease.app',
  appName: '熵减',
  webDir: '../client/dist-capacitor',
  android: {
    // 与客户端深色主题背景对齐（index.html #app-splash 深色态 #0C1524）
    backgroundColor: '#111827',
  },
  server: {
    // Capacitor 默认以 https://localhost 服务 Web 产物（Android WebView 强制安全来源）
    androidScheme: 'https',
  },
};

export default config;
