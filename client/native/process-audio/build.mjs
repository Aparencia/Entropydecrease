// 进程环回原生模块构建脚本（本地与 CI 共用）
//
// @ai-context: 必须本地与 CI 用同一入口——曾因 CI 使用 client 下的旧版
// node-gyp（仍在查找 VS 2013/2015）而报 "Could not find any Visual Studio
// installation"，本地却用得好，属典型"本地能跑 CI 挂"。故此处固定使用本
// 目录自带的新版 node-gyp（支持 VS 2022），并显式传入 Electron 的 ABI 目标。
// @ai-context: 必须针对 Electron 的 Node ABI 编译（--target + --dist-url），
// 否则主进程 require 时报 NODE_MODULE_VERSION 不匹配而加载失败。

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 从 client 的实际安装解析 Electron 版本（比读 package.json 的 ^范围更准） */
function resolveElectronVersion() {
  const clientRequire = createRequire(path.join(here, '..', '..', 'package.json'));
  try {
    return clientRequire('electron/package.json').version;
  } catch {
    return null;
  }
}

const electronVersion = resolveElectronVersion();
if (!electronVersion) {
  console.error('[native-build] 未能解析 Electron 版本，请先在 client 目录执行 npm ci');
  process.exit(1);
}

const args = [
  'rebuild',
  `--target=${electronVersion}`,
  '--arch=x64',
  '--dist-url=https://electronjs.org/headers',
];

console.log(`[native-build] 针对 Electron ${electronVersion} 编译 process_audio.node`);

const result = spawnSync('npx', ['node-gyp', ...args], {
  cwd: here,
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  console.error(`[native-build] 编译失败（exit=${result.status}）`);
  process.exit(result.status ?? 1);
}
console.log('[native-build] 编译完成');
