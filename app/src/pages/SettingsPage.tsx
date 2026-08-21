/**
 * SettingsPage — 设置页（2026-08-21 用户需求：课堂助手设置类面板迁出，与课堂助手同级导航）。
 *
 * @ai-context: 布局定稿（市场调研 + 用户裁决）= 单页滚动 + 分组标题（方案 A）：
 *              模型 / 音频 / AI 服务 / 数据 / 词表 五组，共 9 个面板；
 *              组标题仅视觉分组，面板均为自包含组件（各自 invoke 后端配置）。
 * @ai-context: 状态联动设计——设置页改动后端配置（OCR 设备/预处理链/密钥/模型下载）后，
 *              课堂助手下次 invoke 自然读取最新值，无需共享前端状态；
 *              模型下载等全局事件（model:download-*）由 ClassroomPage 保留挂载的
 *              监听器接收（TD-004：display:none 不卸载），开始按钮就绪状态自动刷新。
 * @ai-context: 升级路径预留——面板数 >15 时组标题行可平滑改为左侧导航键（数据模型不变）。
 */
import { OcrDeviceSetting } from "../components/OcrDeviceSetting";
import { AudioPreprocSetting } from "../components/AudioPreprocSetting";
import AudioStoragePanel from "../components/AudioStoragePanel";
import BackupPanel from "../components/BackupPanel";
import { VocabManager } from "../components/VocabManager";
import ModelManagementPanel from "../components/ModelManagementPanel";
import ModelDiskPanel from "../components/ModelDiskPanel";
import AiServicePanel from "../components/AiServicePanel";
import AiTaskPanel from "../components/AiTaskPanel";
import FeatureFlagSetting from "../components/FeatureFlagSetting";

const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 };
const groupTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  margin: "14px 0 8px",
  letterSpacing: 0.5,
};

/** 组标题（视觉分组；面板自包含，无组级状态） */
function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div style={groupTitle}>{children}</div>;
}

export default function SettingsPage() {
  return (
    <div style={{ height: "calc(100vh - 56px)", overflowY: "auto" }}>
      <div style={{ maxWidth: 720, padding: "12px 16px 24px" }}>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
          应用配置与管理。改动即时生效，课堂助手下次使用时读取最新值。
        </div>

        {/* ── 模型（下载/磁盘/OCR 设备） ── */}
        <GroupTitle>模型</GroupTitle>
        <div style={{ ...panel, marginBottom: 4 }}>
          <ModelManagementPanel />
          <div style={{ marginTop: 8 }}>
            <ModelDiskPanel />
          </div>
          <div style={{ marginTop: 8 }}>
            <OcrDeviceSetting />
          </div>
        </div>

        {/* ── 音频（预处理链/落盘管理） ── */}
        <GroupTitle>音频</GroupTitle>
        <div style={{ ...panel, marginBottom: 4 }}>
          <AudioPreprocSetting />
          <div style={{ marginTop: 8 }}>
            <AudioStoragePanel />
          </div>
        </div>

        {/* ── AI 服务（密钥授权/任务中心） ── */}
        <GroupTitle>AI 服务</GroupTitle>
        <div style={{ ...panel, marginBottom: 4 }}>
          <AiServicePanel />
          <div style={{ marginTop: 8 }}>
            <AiTaskPanel />
          </div>
        </div>

        {/* ── 数据（备份/恢复） ── */}
        <GroupTitle>数据</GroupTitle>
        <div style={{ ...panel, marginBottom: 4 }}>
          <BackupPanel />
        </div>

        {/* ── 词表（热词/替换词闭环）── */}
        <GroupTitle>词表</GroupTitle>
        <div style={{ ...panel, marginBottom: 4 }}>
          <VocabManager />
        </div>
      
        {/* ── 功能预览（默认关的新能力开关，v4 §11.3）── */}
        <GroupTitle>功能预览</GroupTitle>
        <div style={{ ...panel, marginBottom: 4 }}>
          <FeatureFlagSetting />
        </div>
      </div>
    </div>
  );
}
