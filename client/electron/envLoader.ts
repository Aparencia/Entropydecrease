/**
 * 环境变量加载（主进程启动早期）
 *
 * @ai-context: 从 main.ts 拆出。开发模式读 client/.env + .env.test
 * （与 Vite dev server 一致）；生产模式读 Vite 构建生成的
 * dist-electron/build-config.json（.env.production 仅用于构建阶段，
 * 不打包进安装包）。系统环境变量永不被覆盖。
 * @ai-context: loadEnvironment 为显式副作用入口，仅 main.ts 启动时
 * 调用一次；本模块导入本身无副作用。
 */
import * as path from 'path';
import { readFileSync, existsSync } from 'fs';
import { isDevMode } from './ai/utils.js';

/**
 * 简易 .env 解析器：读取文件并注入 process.env
 * @param overrideKeys 记录本次写入的 key，允许后续 .env.<mode> 覆盖
 */
function loadEnvFile(filePath: string, overrideKeys: Set<string>): void {
  if (!existsSync(filePath)) return;
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // 移除行内注释（# 号，但需跳过引号内的 #）
      if (value.includes('#')) {
        // 简单处理：不在引号内的 # 视为注释起始
        let inQuote = false;
        let quoteChar = '';
        let commentIdx = -1;
        for (let i = 0; i < value.length; i++) {
          const ch = value[i];
          if ((ch === '"' || ch === "'") && (!inQuote || ch === quoteChar)) {
            inQuote = !inQuote;
            quoteChar = inQuote ? ch : '';
          } else if (ch === '#' && !inQuote) {
            commentIdx = i;
            break;
          }
        }
        if (commentIdx >= 0) {
          value = value.slice(0, commentIdx).trimEnd();
        }
      }
      // 移除首尾引号
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) {
        // 不覆盖系统环境变量，但允许 .env.<mode> 覆盖 .env 基础值
        if (!(key in process.env) || overrideKeys.has(key)) {
          process.env[key] = value;
          overrideKeys.add(key);
        }
      }
    }
  } catch {
    // .env 文件加载失败不阻塞启动
  }
}

/**
 * 从 Vite 构建时生成的 build-config.json 读取环境变量
 * 该文件由 vite.config.ts 中的 electronBuildConfigPlugin 在 vite build 时生成，
 * 位于 dist-electron/build-config.json，随 asar 一起打包。
 */
function loadBuildConfig(dirname: string): void {
  try {
    // __dirname 在编译后为 dist-electron/electron/，build-config.json 在 dist-electron/
    const configPath = path.resolve(dirname, '..', 'build-config.json');
    if (!existsSync(configPath)) return;
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, string>;
    for (const [key, value] of Object.entries(config)) {
      // 不覆盖系统环境变量（如 cross-env 设置的值）
      if (value && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // build-config.json 加载失败不阻塞启动
  }
}

/**
 * 按运行模式加载环境变量（main.ts 启动时调用一次）
 * @param dirname 调用方的 __dirname（编译后为 dist-electron/electron/）
 */
export function loadEnvironment(dirname: string): void {
  if (isDevMode()) {
    // 开发模式：从 .env 文件加载（electron:dev 由 cross-env 设置 NODE_ENV=development）
    // __dirname 在编译后为 dist-electron/electron/，需回退到 client/ 根目录
    const clientRoot = path.resolve(dirname, '..', '..');
    const envKeys = new Set<string>();
    loadEnvFile(path.join(clientRoot, '.env'), envKeys);
    loadEnvFile(path.join(clientRoot, '.env.test'), envKeys);
  } else {
    // 生产模式：从构建时生成的 build-config.json 读取（不依赖 .env 文件）
    loadBuildConfig(dirname);
  }

  // 仅开发模式禁用 Electron 安全警告，生产环境保留
  if (isDevMode()) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  }
}
