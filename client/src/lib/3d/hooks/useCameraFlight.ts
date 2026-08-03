/**
 * 相机飞行动画hook — 用于模块间导航
 *
 * 位置与朝向同步插值：flyTo 可指定注视点 lookTarget，飞行期间相机朝向
 * 从起始四元数 slerp 到"终点位置注视 lookTarget"的四元数。此前只动 position
 * 不动朝向，相机抵达后仍保持概览态旧朝向（尤其用户用 OrbitControls 旋转过
 * 视角时），叠加 docked 相位 frameloop='never' 无法由 CameraController 纠正，
 * 导致停靠后视角错位、正对空白处。
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
  const startQuat = useRef(new THREE.Quaternion());
  const endQuat = useRef(new THREE.Quaternion());
  const hasLook = useRef(false);
  const duration = useRef(0.6);
  const progress = useRef(0);
  // 复用的临时对象，避免每帧/每次飞行分配
  const lookMat = useRef(new THREE.Matrix4());
  const lookVec = useRef(new THREE.Vector3());

  /**
   * 启动一次相机飞行
   * @param target - 终点位置
   * @param lookTarget - 可选注视点：飞行期间朝向平滑转向该点；省略则保持原行为（不改朝向）
   * @param flightDuration - 飞行时长（秒），默认 0.6
   */
  const flyTo = useCallback((
    target: [number, number, number],
    lookTarget?: [number, number, number],
    flightDuration = 0.6,
  ) => {
    startPos.current.copy(camera.position);
    endPos.current.set(...target);
    duration.current = flightDuration;
    progress.current = 0;
    isFlying.current = true;
    if (lookTarget) {
      startQuat.current.copy(camera.quaternion);
      lookVec.current.set(...lookTarget);
      // 与 Camera.lookAt 同一算法（Matrix4.lookAt(eye, target, up)）计算终点朝向
      lookMat.current.lookAt(endPos.current, lookVec.current, camera.up);
      endQuat.current.setFromRotationMatrix(lookMat.current);
      hasLook.current = true;
    } else {
      hasLook.current = false;
    }
  }, [camera]);

  const update = useCallback((delta: number) => {
    if (!isFlying.current) return;

    progress.current += delta / duration.current;
    if (progress.current >= 1) {
      progress.current = 1;
      isFlying.current = false;
    }

    // Ease out cubic
    const t = 1 - Math.pow(1 - progress.current, 3);
    camera.position.lerpVectors(startPos.current, endPos.current, t);
    // 朝向与位置按同一缓动同步插值，确保抵达时正对目标
    if (hasLook.current) {
      camera.quaternion.slerpQuaternions(startQuat.current, endQuat.current, t);
    }
  }, [camera]);

  return { flyTo, update, isFlying: isFlying.current };
}
