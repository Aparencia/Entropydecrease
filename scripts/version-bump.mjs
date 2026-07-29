#!/usr/bin/env node
/**
 * 通用版本同步脚本（全仓统一版本）
 *
 * 由 semantic-release 的 @semantic-release/exec 在 prepare 阶段调用：
 *   node scripts/version-bump.mjs <version>
 * 也可手动运行：npm run version:sync -- 1.2.3
 *
 * 作用：把计算出的 SemVer 版本号写入所有受管理的 Node 子项目的
 * package.json 与 package-lock.json（lockfileVersion 2/3），保证全仓版本一致。
 *
 * 通用性：
 *   - 受管理目录默认取自 VERSION_SYNC_DIRS 环境变量（逗号分隔），
 *     未设置时回退到内置列表，新增子项目仅需在此登记或通过环境变量传入，
 *     无需改动 CI 与 semantic-release 配置。
 *   - 仅更新存在的文件，缺失文件跳过并告警，不会中断整体发布。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = (process.argv[2] || process.env.NEXT_VERSION || '').trim();

// SemVer 校验：MAJOR.MINOR.PATCH，允许预发布(-beta.1)与构建元数据(+build)后缀
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
if (!SEMVER.test(version)) {
  console.error(`[version-bump] 版本号非法或缺失："${version}"（期望格式 MAJOR.MINOR.PATCH）`);
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const projectDirs = (process.env.VERSION_SYNC_DIRS
  ? process.env.VERSION_SYNC_DIRS.split(',')
  : ['client', 'website']
).map((s) => s.trim()).filter(Boolean);

/** 读取 JSON，交由 mutate 修改后写回，保留 2 空格缩进与末尾换行（npm 默认风格） */
function updateJson(file, mutate) {
  if (!existsSync(file)) return false;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  mutate(data);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return true;
}

let updatedProjects = 0;
for (const dir of projectDirs) {
  const pkgPath = join(repoRoot, dir, 'package.json');
  if (!updateJson(pkgPath, (pkg) => { pkg.version = version; })) {
    console.warn(`[version-bump] 跳过（未找到）：${dir}/package.json`);
    continue;
  }
  console.log(`[version-bump] ${dir}/package.json -> ${version}`);
  updatedProjects += 1;

  const lockPath = join(repoRoot, dir, 'package-lock.json');
  const lockUpdated = updateJson(lockPath, (lock) => {
    lock.version = version;
    // lockfileVersion 2/3：根包版本记录在 packages[""].version
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = version;
    }
  });
  if (lockUpdated) {
    console.log(`[version-bump] ${dir}/package-lock.json -> ${version}`);
  }
}

if (updatedProjects === 0) {
  console.error('[version-bump] 未更新任何 package.json，终止。请检查受管理目录配置。');
  process.exit(1);
}

console.log(`[version-bump] 完成：${updatedProjects} 个子项目已统一为 ${version}。`);
