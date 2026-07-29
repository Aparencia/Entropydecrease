/**
 * 相机控制器 — 管理相机位置和飞行动画
 *
 * @ai-context: 3D 场景核心（R3F）：CameraController。
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

interface CameraControllerProps {
  target?: [number, number, number];
  speed?: number;
}

export function CameraController({ target = [0, 0, 10], speed = 2 }: CameraControllerProps) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3(...target));

  useFrame((_, delta) => {
    targetVec.current.set(...target);
    camera.position.lerp(targetVec.current, delta * speed);
    camera.lookAt(0, 0, 0);
  });

  return null;
}
