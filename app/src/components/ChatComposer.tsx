/**
 * ChatComposer — AI 对话输入框（v0.16.0 REQ-225，DSH 交互范式）。
 *
 * @ai-context: Ctrl+Enter 发送（DSH/DeepSeek Web 同感）；流式中禁用输入并
 *              切换为「停止」按钮（单活跃流——chat_cancel 置位后端取消标志）。
 *              受控组件：draft 由 ChatPage 持有（编辑重发预填同一通道）。
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  /** 流式中（停止按钮态；不可再发送） */
  streaming: boolean;
  onSend: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export default function ChatComposer({ value, onChange, streaming, onSend, onStop, disabled }: Props) {
  const canSend = !streaming && !disabled && value.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend();
  };

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", padding: "10px 16px", background: "#fff" }}>
      {disabled && (
        <div style={{ fontSize: 12, color: "#b45309", marginBottom: 6 }}>
          AI 功能未开启——请先到「设置 → AI 服务」开启并授权（聊天内容将发送至所选模型云端）
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="输入消息…（Ctrl+Enter 发送）"
          rows={2}
          style={{
            flex: 1,
            resize: "none",
            fontSize: 13.5,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            outline: "none",
            fontFamily: "inherit",
            background: disabled ? "#f9fafb" : "#fff",
          }}
        />
        {streaming ? (
          <button
            onClick={onStop}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #f59e0b",
              background: "#fffbeb",
              color: "#b45309",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ■ 停止
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!canSend}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: canSend ? "#0d9488" : "#e5e7eb",
              color: canSend ? "#fff" : "#9ca3af",
              fontSize: 13,
              cursor: canSend ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
