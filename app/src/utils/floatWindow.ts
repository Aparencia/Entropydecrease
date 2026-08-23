/**
 * floatWindow — 浮窗几何/偏好纯函数（v0.12.3 交互层，采集体验债延续）。
 *
 * @ai-context: 拖拽后的边缘吸附与工作区钳制（防拖出屏幕后窗口"丢失"）——
 *              纯函数可单测（AAA）；偏好持久化走 localStorage（浮窗/主窗
 *              同源共享，免 IPC 往返）。坐标均为物理像素（outerPosition
 *              语义），与 Tauri PhysicalPosition 对齐。
 */

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 边缘吸附阈值（物理像素）：距边 ≤8px 即贴边 */
export const EDGE_SNAP_PX = 8;

/** 把位置钳制到工作区内（窗口尺寸越界时贴上限——防越界后不可找回） */
export function clampToWorkArea(pos: Point, size: Size, area: WorkArea): Point {
  const maxX = Math.max(area.x, area.x + area.width - size.width);
  const maxY = Math.max(area.y, area.y + area.height - size.height);
  return {
    x: Math.min(Math.max(pos.x, area.x), maxX),
    y: Math.min(Math.max(pos.y, area.y), maxY),
  };
}

/** 边缘吸附：距工作区左/右/上/下边 ≤EDGE_SNAP_PX 时吸附贴边（无变化返回原坐标） */
export function snapToEdge(pos: Point, size: Size, area: WorkArea): Point {
  const maxX = area.x + area.width - size.width;
  const maxY = area.y + area.height - size.height;
  let { x, y } = pos;
  if (Math.abs(x - area.x) <= EDGE_SNAP_PX) x = area.x;
  else if (Math.abs(maxX - x) <= EDGE_SNAP_PX) x = maxX;
  if (Math.abs(y - area.y) <= EDGE_SNAP_PX) y = area.y;
  else if (Math.abs(maxY - y) <= EDGE_SNAP_PX) y = maxY;
  return { x, y };
}

/** 浮窗形态：panel=完整面板（360×240）；bar=细长字幕条（360×44，点击穿透候选） */
export type FloatMode = "panel" | "bar";

/** 浮窗偏好（localStorage 持久化；位置=物理像素 top-left） */
export interface FloatPrefs {
  mode: FloatMode;
  topmost: boolean;
  /** 0.35..1（<0.35 临界不可读；1=不透明） */
  opacity: number;
  pos: Point | null;
}

export const FLOAT_PREFS_KEY = "float.prefs.v1";
export const FLOAT_PREFS_DEFAULT: FloatPrefs = { mode: "panel", topmost: true, opacity: 1, pos: null };
const OPACITY_MIN = 0.35;
const OPACITY_MAX = 1;

type PrefsStorage = Pick<Storage, "getItem" | "setItem"> | undefined;

/** 读取偏好（缺省/损坏时回退默认并合并——单字段损坏不丢其余） */
export function loadFloatPrefs(storage?: PrefsStorage): FloatPrefs {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(FLOAT_PREFS_KEY);
    if (!raw) return { ...FLOAT_PREFS_DEFAULT };
    const parsed = JSON.parse(raw) as Partial<FloatPrefs>;
    const mode: FloatMode = parsed.mode === "bar" ? "bar" : "panel";
    const pos =
      parsed.pos && Number.isFinite(parsed.pos.x) && Number.isFinite(parsed.pos.y)
        ? { x: parsed.pos.x, y: parsed.pos.y }
        : null;
    return {
      mode,
      topmost: typeof parsed.topmost === "boolean" ? parsed.topmost : FLOAT_PREFS_DEFAULT.topmost,
      opacity: clampOpacity(typeof parsed.opacity === "number" ? parsed.opacity : FLOAT_PREFS_DEFAULT.opacity),
      pos,
    };
  } catch {
    return { ...FLOAT_PREFS_DEFAULT };
  }
}

/** 保存偏好（存储失败静默——偏好丢失不影响功能） */
export function saveFloatPrefs(prefs: FloatPrefs, storage?: PrefsStorage): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(FLOAT_PREFS_KEY, JSON.stringify({ ...prefs, opacity: clampOpacity(prefs.opacity) }));
  } catch {
    // 存储不可用（隐私模式等）：忽略
  }
}

/** 透明度钳制（越界值防输入滑条越界） */
export function clampOpacity(v: number): number {
  return Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, v));
}
