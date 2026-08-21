/**
 * vitest.config.ts — M9 单测配置（与 vite.config.ts 分离：测试不需要
 * Tauri dev server 定制项，避免 test 链路受 dev 端口/HMR 配置影响）。
 *
 * Why node 环境：首批测试对象均为纯函数（fmt/html/structuredBlocks），
 * 不触 DOM；后续如需组件测试再按文件切换 jsdom。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
