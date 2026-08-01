/**
 * 相机控制器 — 管理相机位置和飞行动画
 *
 * 位置与注视点均平滑插值：模块态注视当前模块实体（而非固定原点），
 * 避免停靠后画面仍以主页模块（位于原点）为中心。
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
}

export function CameraController({ target = [0, 0, 10], lookAt = [0, 0, 0], speed = 2 }: CameraControllerProps) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3(...target));
  const lookAtTarget = useRef(new THREE.Vector3(...lookAt));
  const currentLookAt = useRef(new THREE.Vector3(...lookAt));

  useFrame((_, delta) => {
    targetVec.current.set(...target);
    lookAtTarget.current.set(...lookAt);
    camera.position.lerp(targetVec.current, delta * speed);
    // 注视点平滑过渡：进入模块时从原点移向模块实体，退出时返回原点
    currentLookAt.current.lerp(lookAtTarget.current, delta * speed);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
