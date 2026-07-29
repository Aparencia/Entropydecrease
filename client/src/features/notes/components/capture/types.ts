/**
 * @ai-context: 通用组件：types。
 */
import type {
  WindowInfo,
  ExtractedSegment,
  CaptureMode,
  CaptureSidebarConfig,
  SessionStatus,
} from '@/lib/capture';

// ================================================================
// 子组件接口 — 供 capture/ 子组件与 CaptureSidebar 共享
// ================================================================

export interface WindowSelectorProps {
  windows: WindowInfo[];
  selected: WindowInfo | null;
  onSelect: (win: WindowInfo) => void;
  onRefresh: () => void;
  loading: boolean;
}

export interface ControlBarProps {
  status: SessionStatus;
  mode: CaptureMode;
  stats: { frames: number; extracted: number };
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onModeChange: (mode: CaptureMode) => void;
  disabled: boolean;
}

export interface SegmentListProps {
  segments: ExtractedSegment[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onInsertSelected: () => void;
  onInsertAll: () => void;
}

export interface SettingsPanelProps {
  config: CaptureSidebarConfig;
  onChange: (patch: Partial<CaptureSidebarConfig>) => void;
}

// ================================================================
// IPC 响应类型（主进程返回值）
// ================================================================

export interface IPCAudioStartResult {
  success: boolean;
  error?: string;
}

export interface IPCStopResult {
  success: boolean;
}
