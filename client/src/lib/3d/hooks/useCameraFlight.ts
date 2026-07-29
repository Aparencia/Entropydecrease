/**
 * 相机飞行动画hook — 用于模块间导航
 *
 * @ai-context: 3D 相机飞行动画 Hook，模块间导航的视觉过渡。
 */
import { useThree } from '@react-three/fiber';
import { useRef, useCallback } from 'react';
import * as THREE from 'three';

export function useCameraFlight() {
  const { camera } = useThree();
  const isFlying = useRef(false);
  const startPos = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const progress = useRef(0);

  const flyTo = useCallback((target: [number, number, number], duration = 0.6) => {
    startPos.current.copy(camera.position);
    endPos.current.set(...target);
    progress.current = 0;
    isFlying.current = true;
  }, [camera]);

  const update = useCallback((delta: number) => {
    if (!isFlying.current) return;

    progress.current += delta / 0.6;
    if (progress.current >= 1) {
      progress.current = 1;
      isFlying.current = false;
    }

    // Ease out cubic
    const t = 1 - Math.pow(1 - progress.current, 3);
    camera.position.lerpVectors(startPos.current, endPos.current, t);
  }, [camera]);

  return { flyTo, update, isFlying: isFlying.current };
}
