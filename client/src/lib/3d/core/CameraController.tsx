/**
 * 相机控制器 — 管理相机位置和飞行动画
 *
 * 位置与注视点均平滑插值：模块态注视当前模块实体（而非固定原点），
 * 避免停靠后画面仍以主页模块（位于原点）为中心。
 *
 * 两套相机系统（CameraController lerp / useCameraFlight flyTo）不能同时修改相机位置，
 * 因此通过 paused 属性在飞行期间暂停 lerp，避免轨迹抖动。
 *
 * @ai-context: 3D 场景核心（R3F）：CameraController。
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

interface CameraControllerProps {
  target?: [number, number, number];
  /** 相机注视点（模块态为模块位置，概览态为场景中心原点） */
  lookAt?: [number, number, number];
  speed?: number;
  /**
   * 暂停 lerp 插值（两套相机系统不能同时修改位置）：
   * 飞行期间（entering 相位）设为 true，让 useCameraFlight 独占相机控制权，
   * 防止 CameraController 每帧 lerp 与 flyTo 冲突导致轨迹抖动。
   */
  paused?: boolean;
}

export function CameraController({
  target = [0, 0, 10],
  lookAt = [0, 0, 0],
  speed = 2,
  paused = false,
}: CameraControllerProps) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3(...target));
  const lookAtTarget = useRef(new THREE.Vector3(...lookAt));
  const currentLookAt = useRef(new THREE.Vector3(...lookAt));

  useFrame((_, delta) => {
    // 飞行期间暂停 lerp，避免与 useCameraFlight 的 flyTo 冲突
    if (paused) return;

    // 防止浏览器节流（如标签切换）导致的帧时间尖峰，最大允许 100ms
    const safeDelta = Math.min(delta, 0.1);

    targetVec.current.set(...target);
    lookAtTarget.current.set(...lookAt);
    camera.position.lerp(targetVec.current, safeDelta * speed);
    // 注视点平滑过渡：进入模块时从原点移向模块实体，退出时返回原点
    currentLookAt.current.lerp(lookAtTarget.current, safeDelta * speed);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
