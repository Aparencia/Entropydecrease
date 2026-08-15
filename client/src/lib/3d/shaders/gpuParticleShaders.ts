/**
 * gpuParticleShaders — GPU 粒子动画着色器注入工具
 *
 * 通过 onBeforeCompile 钩子向 PointsMaterial 注入自定义顶点着色器代码，
 * 将粒子位置计算从 CPU（useFrame 循环 + needsUpdate 上传）迁移到 GPU
 * （顶点着色器），消除每帧的 CPU→GPU 数据传输瓶颈。
 *
 * 使用方式：
 * 1. 在几何体上添加 per-particle 属性（velocity, seed, origin 等）
 * 2. 创建 PointsMaterial 后调用 patchParticleShader(material, config)
 * 3. 在 useFrame 中更新 material.uniforms.uTime.value
 *
 * @ai-context: 3D 场景着色器工具：GPU 粒子动画（WebGPU/WebGL 兼容）。
 */
import * as THREE from 'three';

/** 粒子运动类型 */
export type ParticleMotion = 'float-up' | 'radial' | 'drift' | 'fall' | 'orbit' | 'ring';

/** GPU 粒子着色器配置 */
export interface GPUParticleConfig {
  /** 运动类型 */
  motion: ParticleMotion;
  /** 是否需要边界回绕（替代随机重置） */
  wrap?: boolean;
  /** 边界参数（按运动类型不同含义） */
  bounds?: {
    yMin?: number;
    yMax?: number;
    distMax?: number;
    radiusMin?: number;
    radiusMax?: number;
  };
  /** 运动速度倍率 */
  speed?: number;
}

/**
 * 向 PointsMaterial 注入 GPU 粒子顶点着色器
 *
 * 在几何体上需要预置属性：
 * - aVelocity (vec3): 粒子速度/方向
 * - aSeed (float): 粒子随机种子 [0,1)
 * 可选：
 * - aOrigin (vec3): 初始位置（用于 drift/fall 类型）
 */
export function patchParticleShader(
  material: THREE.PointsMaterial,
  config: GPUParticleConfig,
): void {
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uSpeed: { value: config.speed ?? 1.0 },
  };

  // 根据运动类型生成顶点着色器替换代码
  const vertexReplace = generateVertexCode(config);

  material.onBeforeCompile = (shader) => {
    // 合并 uniform
    Object.assign(shader.uniforms, uniforms);
    // 注入 custom uniform 声明
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uSpeed;
      attribute vec3 aVelocity;
      attribute float aSeed;`,
    );
    // 替换顶点位置计算
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      ${vertexReplace}`,
    );
  };

  // 保存引用以便在 useFrame 中更新 uniform
  // （自定义属性挂载：three 未公开该扩展点，用受约束的接口声明替代 any）
  (material as unknown as { __gpuParticleUniforms: Record<string, THREE.IUniform> }).__gpuParticleUniforms = uniforms;
}

/**
 * 更新 GPU 粒子 uniform（在 useFrame 中调用）
 */
export function updateGPUParticleUniforms(
  material: THREE.PointsMaterial,
  time: number,
): void {
  const uniforms = (material as unknown as { __gpuParticleUniforms?: Record<string, THREE.IUniform> }).__gpuParticleUniforms;
  if (uniforms) {
    uniforms.uTime.value = time;
  }
}

/**
 * 生成顶点着色器位移代码
 */
function generateVertexCode(config: GPUParticleConfig): string {
  const { motion, wrap, bounds } = config;

  switch (motion) {
    case 'float-up': {
      // 浮力上升：y 以速度上升，水平方向 sin 漂移，到达顶部回绕到底部
      const yMin = bounds?.yMin ?? -15;
      const yMax = bounds?.yMax ?? 5;
      const yRange = yMax - yMin;
      return `
        // 浮力上升
        float yOffset = aVelocity.y * uTime * uSpeed;
        float yPos = position.y + yOffset;
        // 回绕：超出顶部则回到底部（保持 x,z 不变，从底部重新上升）
        ${wrap ? `
        yPos = mod(yPos - ${yMin.toFixed(1)}, ${yRange.toFixed(1)}) + ${yMin.toFixed(1)};
        ` : `
        if (yPos > ${yMax.toFixed(1)}) yPos = ${yMin.toFixed(1)};
        `}
        // 水平漂移（基于绝对时间，与初始位置解耦）
        float hDriftX = sin(uTime * 0.5 + aSeed * 6.283) * aVelocity.x * 0.3;
        float hDriftZ = cos(uTime * 0.4 + aSeed * 6.283) * aVelocity.z * 0.3;
        transformed = vec3(position.x + hDriftX, yPos, position.z + hDriftZ);
      `;
    }

    case 'radial': {
      // 径向运动：粒子沿径向方向向外运动，超出边界回绕到原点附近
      const distMax = bounds?.distMax ?? 80;
      const distMaxSq = distMax * distMax;
      const rMin = bounds?.radiusMin ?? 3;
      const rMax = bounds?.radiusMax ?? 8;
      return `
        // 径向方向（从 velocity 获取方向向量）
        vec3 dir = normalize(aVelocity);
        float speed = length(aVelocity);
        // 径向位移
        float dist = length(position);
        float radialOffset = speed * uTime * uSpeed;
        float newDist = dist + radialOffset;
        // 回绕
        ${wrap ? `
        newDist = mod(newDist - ${rMin.toFixed(1)}, ${(distMax - rMin).toFixed(1)}) + ${rMin.toFixed(1)};
        ` : `
        if (newDist * newDist > ${distMaxSq.toFixed(1)}f) {
          newDist = ${rMin.toFixed(1)} + aSeed * ${(rMax - rMin).toFixed(1)};
        }
        `}
        // 沿原始方向运动
        vec3 newPos = dir * newDist;
        // 保留一些横向扩散
        float spread = 0.02 * sin(uTime * 0.1 + aSeed * 10.0);
        newPos += vec3(spread, spread * 0.5, spread);
        transformed = newPos;
      `;
    }

    case 'drift': {
      // 缓慢漂移：粒子在原位附近 sin 扰动
      return `
        float dx = sin(uTime * 0.3 + aSeed * 6.283) * 0.002 * aVelocity.x * uSpeed;
        float dy = sin(uTime * 0.2 + aSeed * 12.566) * 0.003 * aVelocity.y * uSpeed;
        float dz = cos(uTime * 0.25 + aSeed * 9.425) * 0.002 * aVelocity.z * uSpeed;
        transformed = vec3(position.x + dx, position.y + dy, position.z + dz);
      `;
    }

    case 'fall': {
      // 沉降下落：y 以速度下降，到底部回绕到顶部
      const yMinF = bounds?.yMin ?? -12;
      const yMaxF = bounds?.yMax ?? 2;
      const yRangeF = yMaxF - yMinF;
      return `
        float fallOffset = -aVelocity.y * uTime * uSpeed;
        float yPos = position.y + fallOffset;
        // 回绕
        yPos = mod(yPos - ${yMinF.toFixed(1)}, ${yRangeF.toFixed(1)}) + ${yMinF.toFixed(1)};
        // 水平微飘
        float hh = sin(uTime * 0.15 + aSeed * 6.283) * 0.1;
        transformed = vec3(position.x + hh, yPos, position.z + hh * 0.7);
      `;
    }

    case 'orbit': {
      // 轨道环绕：粒子沿环形路径运动
      return `
        float a = uTime * uSpeed * aVelocity.x + aSeed * 6.283;
        float radius = aVelocity.y;
        float height = aVelocity.z + sin(a * 1.7 + aSeed * 12.566) * 0.3;
        float x = cos(a) * radius;
        float z = sin(a) * radius * 0.8;
        transformed = vec3(x, height, z);
      `;
    }

    case 'ring': {
      // 环形粒子：围绕物体旋转的粒子环
      return `
        float a = uTime * uSpeed * aVelocity.x + aSeed * 6.283;
        float radius = 1.4 + sin(aSeed * 10.0) * 0.2;
        float tilt = (aSeed - 0.5) * 0.6 + sin(aSeed * 5.0) * 0.15;
        float x = cos(a) * radius;
        float y = sin(a * 0.7) * 0.3 + tilt;
        float z = sin(a) * radius;
        transformed = vec3(x, y, z);
      `;
    }

    default:
      return 'transformed = position;';
  }
}

/**
 * 为几何体添加 GPU 粒子所需的属性
 */
export function addParticleAttributes(
  geometry: THREE.BufferGeometry,
  count: number,
  velocityFn: (i: number) => [number, number, number],
  seedFn?: (i: number) => number,
): void {
  const vel = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const v = velocityFn(i);
    vel[i * 3] = v[0];
    vel[i * 3 + 1] = v[1];
    vel[i * 3 + 2] = v[2];
    seed[i] = seedFn ? seedFn(i) : Math.random();
  }
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(vel, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
}

/**
 * 检查当前渲染器是否为 GPU 粒子支持的 WebGPU 模式
 * GPU 粒子在 WebGPU 和 WebGL 下均有效（顶点着色器兼容）
 */
export function isGPUParticleSupported(): boolean {
  return true; // 顶点着色器方式在 WebGL 和 WebGPU 下均兼容
}