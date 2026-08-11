/**
 * particleDistribution — 粒子静态分布预计算（算法级性能优化）
 *
 * 视频级流畅核心：分布形状（shell/volume/grid/helix/crystal/torrent/cluster/canopy）
 * 不随时间变化，仅随状态/气质切换。将其预计算为归一化静态位置（R=1），
 * 运行时只做动态半径缩放 + 增量角度旋转，把每帧三角函数从 ~14 次/粒子
 * 降到 ~2 次/粒子（旋转用），消除每帧分布重算的 CPU 瓶颈。
 *
 * 注意：canopy 的斑驳闪烁与 torrent 的下落循环是运动语义，由 ChronosParticleField
 * 运行时补偿（闪烁→垂直扰动；下落→模回绕），此处仅预计算静态骨架。
 *
 * @ai-context: 纯函数模块；描述符在 particleMorphs，运行时消费在 ChronosParticleField。
 */
import type { Distribution } from './particleMorphs';

/** 每粒子基础球面参数（与 ChronosParticleField.base 同构） */
export interface ParticleBase {
  theta0: Float32Array;
  phi0: Float32Array;
  u: Float32Array;
}

/** 经纬网格经线步长（与运行时消费一致） */
const GRID_STEP = Math.PI * 2 / 16;
const GRID_PHI_STEP = Math.PI / 12;

/**
 * 分布函数预计算：写入归一化静态位置（R=1，out 长度 = 粒子数 × 3）。
 * 运行时以 R_scale = 动态半径 / morph.radius 缩放，保证状态切换半径平滑。
 */
export function computeStaticDistribution(
  distribution: Distribution,
  visibleRatio: number,
  base: ParticleBase,
  out: Float32Array,
): void {
  const { theta0, phi0, u } = base;
  const count = out.length / 3;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const th0 = theta0[i];
    const ph0 = phi0[i];
    const ui = u[i];
    let x = 0, y = 0, z = 0;

    switch (distribution) {
      case 'volume': { // 星云：球内均匀体积散布（分母用状态基础 visibleRatio 防极端）
        const r = Math.cbrt(ui / Math.max(0.001, visibleRatio));
        x = r * Math.sin(ph0) * Math.cos(th0);
        y = r * Math.cos(ph0);
        z = r * Math.sin(ph0) * Math.sin(th0);
        break;
      }
      case 'shell': { // 球壳：±0.12 厚度
        const r = 1 + (ui - 0.5) * 0.24;
        x = r * Math.sin(ph0) * Math.cos(th0);
        y = r * Math.cos(ph0);
        z = r * Math.sin(ph0) * Math.sin(th0);
        break;
      }
      case 'grid': { // 经纬网格：量化到网格线交叉点
        const gTh = Math.round(th0 / GRID_STEP) * GRID_STEP;
        const gPh = Math.round(ph0 / GRID_PHI_STEP) * GRID_PHI_STEP;
        const r = 1 + (ui - 0.5) * 0.1;
        x = r * Math.sin(gPh) * Math.cos(gTh);
        y = r * Math.cos(gPh);
        z = r * Math.sin(gPh) * Math.sin(gTh);
        break;
      }
      case 'helix': { // 火焰螺旋：沿螺旋线上升
        const yy = -1 + (th0 / (Math.PI * 2)) * 2;
        const ang = th0 * 3 + yy * 2;
        const shrink = Math.sqrt(Math.max(0, 1 - yy * yy * 0.7));
        x = Math.cos(ang) * shrink;
        y = yy;
        z = Math.sin(ang) * shrink;
        break;
      }
      case 'crystal': { // 水晶晶簇：黄金角顶点聚集 + 径向抖动
        const vi = Math.floor(ui * 12);
        const va = vi * 137.5 * Math.PI / 180;
        const vr = 0.75 + (ui % 0.25);
        x = vr * Math.sin(ph0 * 0.5 + va) * Math.cos(th0 + va);
        y = vr * Math.abs(Math.cos(ph0 * 0.5 + va));
        z = vr * Math.sin(ph0 * 0.5 + va) * Math.sin(th0 + va);
        break;
      }
      case 'torrent': { // 洪流：圆柱静态骨架（下落循环由运行时模回绕补偿）
        const r = 0.35 * Math.sqrt(ui);
        const cyc = ((th0 / (Math.PI * 2) * 4) % 1 + 1) % 1;
        x = r * Math.cos(th0 * 3);
        y = cyc * 2.4 - 1.2;
        z = r * Math.sin(th0 * 3);
        break;
      }
      case 'cluster': { // 种子团：紧密球团
        const r = 0.6 + ui * 0.4;
        x = r * Math.sin(ph0) * Math.cos(th0);
        y = r * Math.cos(ph0);
        z = r * Math.sin(ph0) * Math.sin(th0);
        break;
      }
      case 'canopy': { // 树冠：上半球茂密扩散（斑驳闪烁由运行时扰动补偿）
        const phC = ph0 * 0.5;
        const r = 0.7 + ui * 0.3;
        x = r * Math.sin(phC) * Math.cos(th0);
        y = 0.9 + r * Math.cos(phC) * 0.7;
        z = r * Math.sin(phC) * Math.sin(th0) * 0.8;
        break;
      }
    }
    out[i3] = x;
    out[i3 + 1] = y;
    out[i3 + 2] = z;
  }
}
