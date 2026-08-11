/**
 * 设备指纹（machineId）— 主进程生成与持久化
 *
 * @ai-context: 激活码一码多设备绑定依赖稳定且不可被渲染进程改写的设备标识。
 * 生成规则：sha256(hostname + platform + arch + 随机盐)，持久化到 userData/machine-id；
 * 首次调用生成后固定不变（重装系统/换机 = 新指纹，触发服务端设备上限判定）。
 * @ai-context: 仅主进程可读写（渲染进程经 IPC 白名单只读获取），防止伪造/篡改。
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { arch, hostname, platform } from 'node:os';
import { app } from 'electron';

/** machine-id 持久化文件名（userData 目录） */
const MACHINE_ID_FILE = 'machine-id';

/**
 * 获取设备指纹（首次调用生成并持久化，此后恒定）。
 *
 * @returns 32 位十六进制字符串（sha256 截断前 32 字符）
 */
export function getMachineId(): string {
  const filePath = join(app.getPath('userData'), MACHINE_ID_FILE);

  // 已存在则直接返回（稳定优先）
  if (existsSync(filePath)) {
    try {
      const cached = readFileSync(filePath, 'utf-8').trim();
      if (cached) return cached;
    } catch (err) {
      console.warn('[machineId] 读取失败，重新生成:', err);
    }
  }

  // 生成：hostname+platform+arch 混合 + 128 位随机盐（防同配置机器指纹碰撞）
  const salt = randomBytes(16).toString('hex');
  const raw = `${hostname()}|${platform()}|${arch()}|${salt}`;
  const machineId = createHash('sha256').update(raw).digest('hex').slice(0, 32);

  try {
    writeFileSync(filePath, machineId, 'utf-8');
  } catch (err) {
    console.warn('[machineId] 持久化失败（本次会话内仍可用）:', err);
  }
  return machineId;
}
