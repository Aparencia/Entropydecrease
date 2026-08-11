/**
 * 笔记 3D 空间布局数学
 * Reef 3D layout math
 *
 * @ai-context: 沉降深渊已 2D 化（见 AbyssView2D 内部布局），本文件仅保留
 * 海底石窟（grotto）球面经纬分布（经=确定性、纬=时间映射：新笔记高、久远低）。
 * 全部使用 hashId/seeded 确定性伪随机，布局稳定不随渲染抖动。
 * @ai-context: Layout math for reef 3D views. Abyss is 2D now (see
 * AbyssView2D); this file keeps the grotto dome sphere mapping.
 * Deterministic PRNG yields stable layouts across renders.
 */
import * as THREE from 'three';
import { seeded, hashId, type ReefNote } from './reefTypes';

/** 石窟穹顶半径（节点所在球面） */
const DOME_RADIUS = 9;

/**
 * 海底石窟布局：球面经纬（穹顶内壁）
 * 经度=确定性伪随机；纬度=时间映射（新笔记高、久远低，clamp ±0.9 rad）。
 */
export function grottoPositions(notes: ReefNote[]): Map<string, THREE.Vector3> {
  const result = new Map<string, THREE.Vector3>();
  const now = Date.now();
  for (const note of notes) {
    const lon = seeded(hashId(note.id)) * Math.PI * 2;
    const ageDays = Math.max(0, (now - new Date(note.updatedAt).getTime()) / 86400000);
    const lat = Math.max(-0.9, Math.min(0.9, 0.9 - Math.log2(ageDays + 1) * 0.16));
    result.set(
      note.id,
      new THREE.Vector3(
        DOME_RADIUS * Math.cos(lat) * Math.cos(lon),
        DOME_RADIUS * Math.sin(lat),
        DOME_RADIUS * Math.cos(lat) * Math.sin(lon),
      ),
    );
  }
  return result;
}
