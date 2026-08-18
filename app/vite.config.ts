import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

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
