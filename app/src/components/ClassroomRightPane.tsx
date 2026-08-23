/**
 * ClassroomRightPane — 课堂助手右栏内容区（2026-08 审查硬拆：ClassroomPage 641 行
 * >600 硬上限，执行豁免登记既有拆分计划；本组件承载右栏全部内容）。
 *
 * @ai-context: 三态切换：活动态（实时转写流 + 最近画面条 + 画面要点流）/
 *              结果态（最近笔记预览）/ 空态（使用说明）；配置态顶部为
 *              视频类型档案卡（选定窗口后出现）+ 融合完成直达卡片（A4）。
 * @ai-context: 纯展示装配（无自有事件监听——活动态由 LiveActivityPanel 自监听），
 *              状态全部由父组件注入。
 */
import LiveActivityPanel from "./LiveActivityPanel";
import ProfileDetector from "./ProfileDetector";
import type { Note, ProfileKind, WindowInfo } from "../types";

const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 };

interface Props {
  /** 活动态（采集中/停止过渡/融合中——右栏由活动面板独占） */
  liveActive: boolean;
  stopping: boolean;
  fusionActive: boolean;
  liveSessionId: number | null;
  /** 结果态：最近生成的笔记预览 */
  lastNote: Note | null;
  /** 空态/配置态：目标窗口（档案检测输入） */
  selectedWindow: WindowInfo | null;
  /** A4：融合完成直达卡片（会话 id；null=不显示） */
  fusedSessionId: number | null;
  onOpenSessions?: (sessionId: number) => void;
  onDismissFused: () => void;
  onProfileChange: (kind: ProfileKind) => void;
}

export default function ClassroomRightPane({
  liveActive,
  stopping,
  fusionActive,
  liveSessionId,
  lastNote,
  selectedWindow,
  fusedSessionId,
  onOpenSessions,
  onDismissFused,
  onProfileChange,
}: Props) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {liveActive || stopping || fusionActive ? (
        /* 活动态：实时转写流 + 最近画面条 + 画面要点流 + 状态机（简要：仅最近几条） */
        <LiveActivityPanel
          sessionId={liveSessionId}
          /* v0.9.0 验收缺陷修复：采集态档案条（形态/领域检测输入——窗口标题） */
          windowTitle={selectedWindow?.title ?? null}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {/* A4：融合完成直达卡片（停止后右侧顶部；一键跳会话页定位） */}
          {fusedSessionId && (
            <div style={{ padding: "12px 16px 0", maxWidth: 640 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #99f6e4", background: "#f0fdfa", borderRadius: 8, padding: "8px 12px" }}>
                <span style={{ fontSize: 12, color: "#0f766e" }}>✅ 融合完成</span>
                <button
                  onClick={() => onOpenSessions?.(fusedSessionId)}
                  style={{ ...btn, marginLeft: "auto", background: "#0d9488", color: "#fff", border: "none", borderRadius: 6 }}
                >
                  查看时间轴 →
                </button>
                <button
                  onClick={onDismissFused}
                  style={{ ...btn, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff" }}
                  title="关闭提示"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {/* 视频类型档案（v0.5.0 M1：REQ-043 混合检测——自动候选 + 用户确认 + 记忆偏好；
              右侧配置区：选定窗口后出现，未选窗口自动隐藏） */}
          <div style={{ padding: "12px 16px 0", maxWidth: 640 }}>
            <ProfileDetector
              windowTitle={selectedWindow?.title ?? null}
              onProfileChange={onProfileChange}
            />
          </div>
          {lastNote ? (
            /* 结果态：最近生成的笔记预览 */
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>{lastNote.title}</h2>
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  #{lastNote.id} · {lastNote.source} · {new Date(lastNote.updated_at * 1000).toLocaleString()}
                </span>
              </div>
              <pre
                style={{
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 14,
                  whiteSpace: "pre-wrap",
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                {lastNote.content}
              </pre>
              <p style={{ fontSize: 12, color: "#6b7280" }}>已保存至笔记，可在「笔记」页继续编辑与检索。</p>
            </div>
          ) : (
            /* 空态：当前配置说明书（参考原项目 IdleGuidePanel） */
            <div style={{ padding: "16px 24px 24px", maxWidth: 640 }}>
              <h2 style={{ fontSize: 18 }}>使用说明</h2>
              <ol style={{ fontSize: 13, lineHeight: 2, color: "#374151" }}>
                <li><strong>选择目标窗口/进程</strong>：自动推荐疑似网课/视频窗口（B站/播放器/浏览器），也可展开全部手动选择——将作为笔记标题与实时捕获目标；无法采集的窗口（最小化/悬浮层）与站点首页（如 B站首页）已自动过滤</li>
                <li><strong>实时捕获</strong>：系统声音 + 屏幕字幕 + 流式转写（Zipformer）边看边记，右侧实时显示转写与画面图片，停止后到「会话」页查看时间轴并可一键转笔记</li>
                <li><strong>添加学习素材</strong>：音频文件（WAV，本地 SenseVoice 转写）与图片（本地 PP-OCRv6 识别）</li>
                <li><strong>一键提取</strong>：转写 + OCR → 本地拼接为 Markdown 笔记 → 自动保存</li>
              </ol>
              <div style={{ ...panel, marginTop: 16, fontSize: 12, color: "#6b7280", lineHeight: 1.9 }}>
                <div><strong>当前配置</strong></div>
                <div>目标窗口：{selectedWindow ? `${selectedWindow.title}（${selectedWindow.processName || "未知进程"}）` : "未选择（实时捕获将抓全屏）"}</div>
                <div>流式转写：sherpa-onnx Zipformer（实时字幕，需模型就绪）</div>
                <div>转写引擎：sherpa-onnx SenseVoice（本地，已就绪）</div>
                <div>OCR 引擎：oar-ocr PP-OCRv6（本地，首次使用自动下载模型）</div>
                <div>数据主权：全部本地处理，内容不出本机</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
