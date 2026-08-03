/**
 * useCameraFlight 单元测试
 *
 * 重点覆盖"飞行结束时相机朝向正对注视目标"——此前 flyTo 只插值 position
 * 不改朝向，用户用 OrbitControls 旋转过视角后点击模块，相机抵达后仍保持
 * 旧朝向，叠加 docked 渲染冻结导致停靠视角错位（正对空白处）。
 *
 * @ai-context: useCameraFlight hook tests: verifies position flight and
 * quaternion slerp orientation toward lookTarget on arrival.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as THREE from 'three';

// 通过 hoisted 持有可变相机实例，供 vi.mock 工厂（被提升）引用
const { cameraHolder } = vi.hoisted(() => ({
  cameraHolder: { camera: null as unknown as THREE.PerspectiveCamera },
}));

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera: cameraHolder.camera }),
}));

import { useCameraFlight } from './useCameraFlight';

beforeEach(() => {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cameraHolder.camera = cam;
});

/** 相机世界前向（-Z 轴经四元数旋转） */
function cameraForward(cam: THREE.PerspectiveCamera): THREE.Vector3 {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
}

describe('useCameraFlight', () => {
  it('指定注视点时，飞行结束时位置到位且朝向正对目标', () => {
    const cam = cameraHolder.camera;
    // 模拟用户已用 OrbitControls 旋转视角：朝向偏离 -Z（旧实现会带着该朝向抵达）
    cam.rotateY(Math.PI / 2);

    const { result } = renderHook(() => useCameraFlight());
    // 模块 [4,2,-2] + CAMERA_OFFSET [0,0,4] = [4,2,2]，注视模块本体
    act(() => { result.current.flyTo([4, 2, 2], [4, 2, -2]); });
    act(() => { for (let i = 0; i < 10; i++) result.current.update(0.1); });

    expect(cam.position.x).toBeCloseTo(4, 3);
    expect(cam.position.y).toBeCloseTo(2, 3);
    expect(cam.position.z).toBeCloseTo(2, 3);

    const fwd = cameraForward(cam);
    const toTarget = new THREE.Vector3(4, 2, -2).sub(cam.position).normalize();
    expect(fwd.dot(toTarget)).toBeGreaterThan(0.999);
  });

  it('飞行中途朝向持续转向目标（非抵达瞬间突变）', () => {
    const cam = cameraHolder.camera;
    cam.rotateY(Math.PI / 2);

    const { result } = renderHook(() => useCameraFlight());
    act(() => { result.current.flyTo([4, 2, 2], [4, 2, -2]); });
    // 推进约一半时长（0.3s）
    act(() => { for (let i = 0; i < 3; i++) result.current.update(0.1); });

    const fwd = cameraForward(cam);
    const toTarget = new THREE.Vector3(4, 2, -2).sub(cam.position).normalize();
    const dot = fwd.dot(toTarget);
    // 中途应已明显转向（起点朝向与目标接近垂直，dot≈0）；ease-out cubic
    // 前半程进度较快，不锁死上界，仅要求未完全到位
    expect(dot).toBeGreaterThan(0.5);
    expect(dot).toBeLessThan(0.9999);
  });

  it('未指定注视点时保持原行为：只动位置不改朝向', () => {
    const cam = cameraHolder.camera;
    cam.rotateY(Math.PI / 2);
    const before = cam.quaternion.clone();

    const { result } = renderHook(() => useCameraFlight());
    act(() => { result.current.flyTo([0, 0, 10]); });
    act(() => { for (let i = 0; i < 10; i++) result.current.update(0.1); });

    expect(cam.quaternion.equals(before)).toBe(true);
  });

  it('自定义时长生效（duration 参数不再被忽略）', () => {
    const cam = cameraHolder.camera;
    const { result } = renderHook(() => useCameraFlight());
    act(() => { result.current.flyTo([0, 0, 5], undefined, 1.0); });
    // 推进 0.6s：若旧实现硬编码 0.6 则已抵达 z=5，新实现（时长 1.0）应仍在半途
    // （ease-out cubic 在 t=0.6 时进度约 93.6%，z≈5.32，仍严格大于 5）
    act(() => { for (let i = 0; i < 6; i++) result.current.update(0.1); });
    expect(cam.position.z).toBeGreaterThan(5.05);
    expect(cam.position.z).toBeLessThan(10);
  });
});
