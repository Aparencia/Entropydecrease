/**
 * ClassroomSourceColumn — 课堂助手左栏配置列（批 0-C2 Task 4 步 4 自
 * ClassroomPage.tsx 抽出，纯搬运、行为等价）。
 *
 * @ai-context: 结构 = 折叠态单元素（ColumnBar 窄条）或展开态外壳 div（标题「📡 课堂助手」+
 *              健康徽标 + 折叠钮 → 横幅插槽 → 滚动容器：就绪清单 / 系统窗口开关 /
 *              窗口选择卡 / 捕获卡插槽 / 四条采集动线面板 / 状态行）。横幅与捕获卡由
 *              页面以 ReactNode 注入（banners / capturePanel）——本文件不订阅任何事件、
 *              不持有状态，全部输入经 props。
 * @ai-context: ★ 顶层恰好返回**一个**元素（折叠态 ColumnBar，否则外壳 div）——根 flex
 *              只有三个直接子元素（本列 + ColumnResizer + 右栏），多包一层或返回
 *              Fragment 会改变 flex 分配与 borderRight/宽度语义，**且无编译错误**。
 *              同理 `<ColumnResizer>` 是本列的**兄弟**、由页面在折叠三元之外无条件渲染，
 *              不得搬进本文件（否则折叠态拖拽手柄消失）。
 * @ai-context: 耦合逐字保留 —— 外壳内联样式键（width / flexShrink / borderRight /
 *              display / flexDirection / minWidth）、`title="折叠侧栏"`、折叠钮 `⟨`、
 *              文案「显示系统窗口（终端/资源管理器等）」、色值 #e5e7eb/#9ca3af/#6b7280、
 *              间距 padding 10px 14px / gap 12 / padding 12 均为现状契约；本文件零
 *              className / 零 id / 零 data-testid，不 token 化、不换 emoji。
 * @ai-context: 边界 —— 就绪清单（ReadyCheckCard）与页内模型卡的矛盾（G6）、采集中仍可
 *              改选窗口（G7）是既有缺陷，本批只搬不改。
 */
import { WindowSelectCard } from "./WindowSelectCard";
import VideoImportPanel from "./VideoImportPanel";
import ReadyCheckCard from "./ReadyCheckCard";
import { SystemStatusBadge } from "./SystemStatusBadge";
import ColumnBar from "./ColumnBar";
import MaterialInputPanel from "./MaterialInputPanel";
import PhotoCapturePanel from "./PhotoCapturePanel";
import WebImportPanel from "./WebImportPanel";
import type { ReactNode } from "react";
import type { Note, WindowInfo } from "../types";

interface Props {
  /** 生效折叠态（useColumnLayout.folded：自动折叠或手动折叠任一成立） */
  folded: boolean;
  /** 生效列宽（useColumnLayout.width，已夹取 min..max） */
  width: number;
  /** 点窄条展开（useColumnLayout.expand：同时清自动/手动折叠态） */
  onExpand: () => void;
  /** 标题栏折叠钮（useColumnLayout.setManualFolded(true)） */
  onFold: () => void;
  /** 页面级提示横幅插槽（ClassroomBanners——须保持为左栏 div 的直接子元素） */
  banners: ReactNode;
  /** 实时捕获卡插槽（ClassroomCapturePanel） */
  capturePanel: ReactNode;
  /** 窗口枚举结果（系统窗口开关的可显性判据 + 列表数据源） */
  windows: WindowInfo[];
  selectedWindow: WindowInfo | null;
  onSelectWindow: (win: WindowInfo) => void;
  /** 重新枚举窗口（background=true 时不显示 loading——列表内刷新用） */
  onRefreshWindows: (background?: boolean) => void;
  windowsLoading: boolean;
  /** 显示系统窗口（终端/资源管理器等）开关 */
  showSystemWindows: boolean;
  onShowSystemWindows: (show: boolean) => void;
  onOpenSessions?: (sessionId: number) => void;
  /** MaterialInputPanel 产物回填（页面 lastNote） */
  onNote: (note: Note) => void;
  /** 状态行（页面 status 单一状态源） */
  status: string;
  onStatus: (message: string) => void;
}

export default function ClassroomSourceColumn({
  folded,
  width,
  onExpand,
  onFold,
  banners,
  capturePanel,
  windows,
  selectedWindow,
  onSelectWindow,
  onRefreshWindows,
  windowsLoading,
  showSystemWindows,
  onShowSystemWindows,
  onOpenSessions,
  onNote,
  status,
  onStatus,
}: Props) {
  return folded ? (
    <ColumnBar icon="📡" title="课堂助手" onClick={onExpand} />
  ) : (
      <div
        style={{
          width,
          flexShrink: 0,
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>📡 课堂助手</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* M7/REQ-042 F2/G2：健康徽标 + 诊断面板（开发期可见） */}
            <SystemStatusBadge />
            <button onClick={() => onFold()} style={{ fontSize: 12, cursor: "pointer", border: "none", background: "none", color: "#9ca3af" }} title="折叠侧栏">⟨</button>
          </div>
        </div>

        {banners}

        <div style={{ flex: 1, minHeight: 0, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 2026-08 C1：引擎与模型就绪清单（开始前准备流——缺什么一目了然） */}
          <ReadyCheckCard />

          {/* 目标窗口/进程选择（v0.2.0 实时捕获上下文） */}
          {/* v0.19.2（用户实测）：系统窗口默认过滤，开关找回（能力不丢） */}
          {windows.some((w) => w.systemWindow) && (
            <label style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showSystemWindows}
                onChange={(e) => onShowSystemWindows(e.target.checked)}
              />
              显示系统窗口（终端/资源管理器等）
            </label>
          )}
          <WindowSelectCard
            windows={showSystemWindows ? windows : windows.filter((w) => !w.systemWindow)}
            selected={selectedWindow}
            onSelect={onSelectWindow}
            onRefresh={onRefreshWindows}
            loading={windowsLoading}
          />

          {capturePanel}

          {/* 视频文件导入（v0.3.0：REQ-015 第二入口，字幕优先 + ASR fallback） */}
          <VideoImportPanel onOpenSessions={onOpenSessions} />

          {/* 2026-08-21 用户需求：OCR 设备/音频预处理/备份/AI 服务/词表/模型管理等
              设置类面板已迁出至「⚙ 设置」页——课堂助手左栏仅保留采集动线 */}

          {/* 素材输入 + 提取按钮（v0.1.0 文件流水线；审查硬拆——MaterialInputPanel） */}
          <MaterialInputPanel
            windowTitle={selectedWindow?.title ?? null}
            onNote={onNote}
            onStatus={onStatus}
          />

          {/* v0.11.7：图文采集（第三动线：截屏导入图文内容 → 图文会话） */}
          <PhotoCapturePanel onOpenSessions={onOpenSessions} onStatus={onStatus} />

          {/* v0.20.4（REQ-303）：web 采集（第四条动线：URL 静态直取 → kind=web 会话） */}
          <WebImportPanel onOpenSessions={onOpenSessions} onStatus={onStatus} />

          {status && <p style={{ fontSize: 12, color: "#2563eb" }}>{status}</p>}
        </div>
      </div>
  );
}
