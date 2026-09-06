/**
 * ActionPage — ✅ 行动域页（v0.20.5 信息架构批：行动中心独立成页）。
 *
 * @ai-context: 意图分层（做/记/练各归其位）——行动裁决/SOP/练习/问题是「做」
 *              域，不再叠在笔记页（Overlay 形态）上；顶层「✅ 行动」Tab 为
 *              唯一入口（组侧栏按钮与徽标随剥离移除）。行动中心为全局域
 *              （全部命令 noteId:null 全量拉取），无组/笔记选中上下文依赖，
 *              故本页零 focus 深链 state。
 * @ai-context: 常驻挂载（App 层 display:none 保活，TD-004 模式）+ active 门控：
 *              隐藏期行动数据可能被外部写入（会话页提炼/笔记勾选回写），
 *              切回时递增 refreshToken 触发 ActionCenterPanel 全量重载
 *              （对齐 SessionsPage active 刷新语义）。
 * @ai-context: 笔记侧被动刷新不走本页——任务写回命令已补发 data:notes-changed
 *              广播（commands_tasks 包装层），NotesPage 常驻订阅自行刷新。
 */
import { useEffect, useRef, useState } from "react";
import ActionCenterPanel from "../components/action-center/ActionCenterPanel";

interface Props {
  /** 页面是否可见（App 层 display 门控同步透传——切回时触发面板重载） */
  active: boolean;
}

export default function ActionPage({ active }: Props) {
  const [token, setToken] = useState(0);
  // 首挂跳过（面板挂载 effect 已全量拉取）——仅 false→true 切回时递增
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (active) setToken((t) => t + 1);
  }, [active]);

  return (
    <div style={{ height: "calc(100vh - 56px)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <ActionCenterPanel refreshToken={token} />
    </div>
  );
}
