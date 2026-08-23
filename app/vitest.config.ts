/**
 * vitest.config.ts — M9 单测配置（与 vite.config.ts 分离：测试不需要
 * Tauri dev server 定制项，避免 test 链路受 dev 端口/HMR 配置影响）。
 *
 * Why node 环境：纯函数测试（fmt/html/structuredBlocks）不触 DOM；
 * v0.12.2 起组件测试（jsdom）按文件 `@vitest-environment jsdom` 切换
 * （收件箱状态机 / ⓘ 弹层交互）——文件级注释优先于全局环境。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
