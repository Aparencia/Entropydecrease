/**
 * 应用模式管理器（local/hybrid/full）
 *
 * @ai-context: 模式决定 AI 与云存储开关组合，localStorage 键已迁移
 * keban_app_mode → ed_app_mode（构造函数内一次性迁移，2027-01 前保留兼容）。
 */
/**
 * 应用运行模式管理器
 *
 * local:  纯本地模式（无网络、无账户）— 所有数据仅存本地，不依赖任何网络服务
 * hybrid: 联网模式（本地优先 + 可选同步）— 已登录且有网络时可同步，离线时降级为本地
 * full:   云端模式（完全云端，实时同步）— 依赖网络，所有操作实时同步至云端
 */

export type AppMode = 'local' | 'hybrid' | 'full';

export interface ModeConfig {
  mode: AppMode;
  syncEnabled: boolean;
  aiEnabled: boolean;
  cloudStorageEnabled: boolean;
}

const STORAGE_KEY = 'ed_app_mode';
const LEGACY_STORAGE_KEY = 'keban_app_mode'; // 品牌重构旧键，一次性迁移后移除
const VALID_MODES: ReadonlySet<AppMode> = new Set(['local', 'hybrid', 'full']);

type ModeListener = (mode: AppMode, config: ModeConfig) => void;

/**
 * 模式变化回调，用于降级通知
 * 参数：fromMode（降级前模式）, toMode（降级后模式）, reason（原因）
 */
type DegradeListener = (fromMode: AppMode, toMode: AppMode, reason: string) => void;

class ModeManager {
  private currentMode: AppMode = 'local';
  private listeners: Set<ModeListener> = new Set();
  /** v0.9.0: 降级事件监听器 */
  private degradeListeners: Set<DegradeListener> = new Set();

  constructor() {
    // 从 localStorage 恢复上次的模式
    try {
      let saved = localStorage.getItem(STORAGE_KEY) as AppMode | null;
      if (saved === null) {
        // 一次性旧键迁移（复制到新键并删除旧键）
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY) as AppMode | null;
        if (legacy !== null) {
          localStorage.setItem(STORAGE_KEY, legacy);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          saved = legacy;
        }
      }
      if (saved && VALID_MODES.has(saved)) {
        this.currentMode = saved;
      }
    } catch {
      // localStorage 不可用时保持默认值 'local'
    }
  }

  /**
   * 获取当前运行模式
   */
  getMode(): AppMode {
    return this.currentMode;
  }

  /**
   * 获取当前模式对应的功能配置
   */
  getConfig(): ModeConfig {
    switch (this.currentMode) {
      case 'local':
        return {
          mode: 'local',
          syncEnabled: false,
          aiEnabled: false,
          cloudStorageEnabled: false,
        };
      case 'hybrid':
        return {
          mode: 'hybrid',
          syncEnabled: true,
          aiEnabled: true,
          cloudStorageEnabled: false,
        };
      case 'full':
        return {
          mode: 'full',
          syncEnabled: true,
          aiEnabled: true,
          cloudStorageEnabled: true,
        };
    }
  }

  /**
   * 切换运行模式
   * 会持久化到 localStorage 并通知所有订阅者
   */
  setMode(mode: AppMode): void {
    if (!VALID_MODES.has(mode)) return;

    this.currentMode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // 忽略存储失败
    }
    const config = this.getConfig();
    this.listeners.forEach((listener) => listener(mode, config));
  }

  /**
   * 订阅模式变化
   * 返回取消订阅函数
   */
  subscribe(listener: ModeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 当前模式下 AI 功能是否可用 */
  isAIEnabled(): boolean {
    return this.getConfig().aiEnabled;
  }

  /** 当前模式下同步功能是否可用 */
  isSyncEnabled(): boolean {
    return this.getConfig().syncEnabled;
  }

  /**
   * 根据认证和网络状态自动计算推荐模式
   */
  computeRecommendedMode(isAuthenticated: boolean, isOnline: boolean): AppMode {
    if (!isAuthenticated) return 'local';
    if (!isOnline) return 'hybrid';
    return 'full';
  }

  // ---------------------------------------------------------------------------
  // v0.9.0: 自动降级机制
  // ---------------------------------------------------------------------------

  /**
   * 网络断开时自动降级
   *
   * - hybrid/full → local：网络完全断开时降级到纯本地模式
   * - full → hybrid：网络弱化时从云端模式降级到联网模式
   *
   * @param isOnline 当前网络是否在线
   * @param isWeak 当前网络是否弱化（可选）
   * @returns 是否发生了降级（true=发生了降级切换）
   */
  autoDegrade(isOnline: boolean, isWeak?: boolean): boolean {
    const prevMode = this.currentMode;

    if (!isOnline && (prevMode === 'hybrid' || prevMode === 'full')) {
      // 网络完全断开 → 降级到 local
      this.setMode('local');
      this.notifyDegrade(prevMode, 'local', '网络断开，已自动切换到本地模式');
      return true;
    }

    if (isWeak && prevMode === 'full') {
      // 网络弱化 → 从 full 降级到 hybrid
      this.setMode('hybrid');
      this.notifyDegrade(prevMode, 'hybrid', '网络不稳定，已自动切换到联网模式');
      return true;
    }

    return false;
  }

  /**
   * 订阅降级事件
   * 返回取消订阅函数
   */
  onDegrade(listener: DegradeListener): () => void {
    this.degradeListeners.add(listener);
    return () => {
      this.degradeListeners.delete(listener);
    };
  }

  private notifyDegrade(fromMode: AppMode, toMode: AppMode, reason: string): void {
    this.degradeListeners.forEach((listener) => listener(fromMode, toMode, reason));
  }
}

// 单例导出
export const modeManager = new ModeManager();
