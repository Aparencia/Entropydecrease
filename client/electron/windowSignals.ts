/**
 * 窗口信号采集（注入式纯函数层）
 *
 * 将 desktopCapturer source id 与 native 窗口枚举（listAudioWindows）对齐，
 * 产出评分所需的进程名/几何信号。native 数据由调用方（screenCaptureHandlers）
 * 经 loadProcessAudioNative 获取后注入——本模块不依赖 electron，可单测。
 *
 * @ai-context: source id 形如 "window:<HWND>:0"，HWND 用字符串传递（可能超
 * 2^32，见 addon.cc）。native 缺失时降级为空信号（纯标题评分路径，与现状一致）。
 * @ai-context EN: Pure signal-resolution layer. Callers inject native window
 * enumeration results; missing native degrades to title-only scoring.
 */

// ================================================================
// 类型定义
// ================================================================

/** native 枚举窗口的最小信号子集（对齐 processAudioNative.NativeWindowInfo 扩展后字段） */
export interface NativeWindowSignal {
  hwnd: string;
  processName: string;
  width: number;
  height: number;
  alwaysOnTop: boolean;
}

/** 评分所需几何信号（全部可选，缺失即不参与） */
export interface GeometrySignals {
  aspectRatio?: number;
  areaRatio?: number;
  alwaysOnTop?: boolean;
}

// ================================================================
// 信号解析
// ================================================================

/**
 * 从 desktopCapturer source id 解析 HWND。
 * @param sourceId 形如 "window:<HWND>:0"；非 window 前缀或结构缺失返回 null
 */
export function parseHwndFromSourceId(sourceId: string | null): string | null {
  if (!sourceId || !sourceId.startsWith('window:')) return null;
  const parts = sourceId.split(':');
  if (parts.length < 2 || !parts[1]) return null;
  return parts[1];
}

/**
 * 按 hwnd 字符串建索引，供 source id → native 窗口 O(1) 匹配。
 */
export function buildNativeIndex(
  nativeWindows: NativeWindowSignal[],
): Map<string, NativeWindowSignal> {
  const index = new Map<string, NativeWindowSignal>();
  for (const w of nativeWindows) {
    index.set(w.hwnd, w);
  }
  return index;
}

/**
 * 由 native 窗口 + 显示器面积计算几何信号。
 * @param native 匹配到的 native 窗口；undefined 表示未匹配/信号源缺失
 * @param displayArea 显示器面积（px²，screen 模块计算）；0 时面积占比置空避免除零
 */
export function resolveGeometrySignals(
  native: NativeWindowSignal | undefined,
  displayArea: number,
): GeometrySignals {
  if (!native) return {};
  const signals: GeometrySignals = {
    alwaysOnTop: native.alwaysOnTop,
  };
  if (native.width > 0 && native.height > 0) {
    signals.aspectRatio = native.width / native.height;
  }
  if (displayArea > 0 && native.width > 0 && native.height > 0) {
    signals.areaRatio = (native.width * native.height) / displayArea;
  }
  return signals;
}