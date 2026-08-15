/**
 * 程序化纹理生成工具
 * @description 为 3D 模块实体生成渐变/噪点/法线纹理，无外部素材依赖
 * @ai-context 使用 Canvas 2D API 生成纹理，适配 R3F 的 TextureLoader；
 * 纹理只在首次生成时创建，之后通过 useMemo 缓存
 */
import * as THREE from 'three';
import { stringHash } from '@/lib/utils/stringHash';

/**
 * 生成主纹理：基底色 + 程序化噪点/能量纹路
 * @param color 基底色 hex
 * @param emissiveColor 辉光色 hex
 * @param seed 随机种子（模块 id hash）
 */
export function createModuleTexture(color: string, emissiveColor: string, seed: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const baseColor = new THREE.Color(color);
  const glowColor = new THREE.Color(emissiveColor);

  // 填充基底色
  ctx.fillStyle = `rgb(${baseColor.r * 255},${baseColor.g * 255},${baseColor.b * 255})`;
  ctx.fillRect(0, 0, size, size);

  // 程序化噪点纹路
  for (let i = 0; i < 1200; i++) {
    const x = ((seed * 9301 + i * 49297) % size + size) % size;
    const y = ((seed * 7919 + i * 104729) % size + size) % size;
    const r = 1 + ((seed * 137 + i * 269) % 4);
    const brightness = ((seed * 31 + i * 127) % 100) / 100;

    // 亮色辉光点
    const alpha = brightness * 0.15;
    ctx.fillStyle = `rgba(${glowColor.r * 255},${glowColor.g * 255},${glowColor.b * 255},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 中心到边缘渐变（核心更亮）
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(255,255,255,0.12)`);
  gradient.addColorStop(0.5, `rgba(255,255,255,0.04)`);
  gradient.addColorStop(1, `rgba(0,0,0,0.15)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // 能量纹路（稀疏线条）
  ctx.strokeStyle = `rgba(${glowColor.r * 255},${glowColor.g * 255},${glowColor.b * 255},0.06)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const startX = ((seed * 541 + i * 997) % size + size) % size;
    const startY = ((seed * 613 + i * 1009) % size + size) % size;
    const endX = ((seed * 701 + i * 991) % size + size) % size;
    const endY = ((seed * 809 + i * 983) % size + size) % size;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

/**
 * 生成法线贴图：模拟表面凹凸细节
 * @param seed 随机种子
 */
export function createNormalMap(seed: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const imageData = ctx.createImageData(size, size);
  const nd = imageData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // 使用确定性噪声生成法线方向
      const nx = ((seed * 9301 + x * 49297 + y * 7919) % 256) / 256;
      const ny = ((seed * 104729 + x * 269 + y * 137) % 256) / 256;

      // 法线贴图编码
      nd[i] = Math.round(nx * 255);
      nd[i + 1] = Math.round(ny * 255);
      nd[i + 2] = 255;
      nd[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

/**
 * 生成粗糙度贴图：模拟表面磨损/光滑度变化
 * @param seed 随机种子
 */
export function createRoughnessMap(seed: number): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const imageData = ctx.createImageData(size, size);
  const rd = imageData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const val = Math.round(((seed * 9301 + x * 49297 + y * 7919) % 100) / 100 * 200 + 55);
      rd[i] = val; rd[i + 1] = val; rd[i + 2] = val; rd[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

/**
 * 生成闪卡纹理：纸质感纹理
 */
export function createFlashcardTexture(color: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const c = new THREE.Color(color);
  ctx.fillStyle = `rgb(${c.r * 255},${c.g * 255},${c.b * 255})`;
  ctx.fillRect(0, 0, size, size);

  // 轻微纸纹噪点
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const alpha = Math.random() * 0.08;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * 从模块 id 生成确定性种子（D12 收敛至 lib/utils/stringHash，保持同算法）
 */
export function idToSeed(id: string): number {
  return Math.abs(stringHash(id));
}