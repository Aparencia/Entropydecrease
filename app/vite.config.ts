import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { manualChunks } from "./src/build/manualChunks";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // 批 2 包体治理：vendor 分组。
  // Why 放在这里而不是对象形式 `{ "vendor-react": ["react", …] }`：
  //   ① 对象形式在包未安装时**直接让构建失败**（rollup 解析不到入口），
  //      而本批必须为批 6 的 GSAP 预留一个「现在惰性、将来自动生效」的槽；
  //   ② 函数形式可以按**解析出的包名**精确匹配：实测**裸 token `react`** 才是 react-dom /
  //      react-markdown / @xyflow/react 三者的共同子串，而 `node_modules/react` **不是**
  //      （`@xyflow/react` 的 id 中间隔着 `@xyflow/`）。用 id.includes 一类朴素口径会把
  //      markdown 栈与画布栈一起吞进 react chunk、或把画布栈漏回 rollup 默认算法 ——
  //      两种都让懒加载边界静默失效（判据见 src/build/manualChunks.test.ts）。
  // 规则与单测见 src/build/manualChunks.ts（纯函数，tsc 与 vitest 都覆盖得到）。
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => manualChunks(id),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: [
        "**/src-tauri/**",
        // 4. 编辑器/AI 工具原子保存的临时路径——chokidar 在 Windows 上对
        //    正在被 rename/删除的临时文件执行 watch 会抛 EBUSY 直接崩掉 dev
        //    server（如 .ClassroomPage.tsx.<pid>.<uuid>.tmpdir/xxx.tmp、
        //    ClassroomPage.tsx.<hash>.tmp）；此类路径永不产生源码变更
        /(^|[\\/])\..*\.tmp(dir)?([\\/].*)?$/,
        /\.tmp$/,
      ],
    },
  },
}));
