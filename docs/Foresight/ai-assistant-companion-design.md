# AI 深海学伴助手设计文档

> **文档状态**：已审阅，待实现
> **创建日期**：2026-08-02
> **关联模块**：client/src/features/assistant、electron/ai/handlers、server/ai-gateway

---

## 1. 概述

为熵减新增一个**全局浮动 AI 学伴助手**——以深海水母为形象，常驻界面右下角，兼具自由对话、主动触发、语音朗读能力。它是"活在学习空间里的伙伴"，而非一个被打开/关闭的工具。

### 核心定位

- **混合型学伴**：自由对话 + 主动关怀（MVP），后续迭代上下文感知 + 功能调度 + 长期画像
- **形象**：深海水母，与现有深海生态仪表盘一脉相承
- **交互**：对话直接展示于浮动面板；复杂功能（后续）唤起独立窗口
- **性格**：动态适应型——学习时专业、休息时轻松、低谷时温暖
- **发音**：提示音效 + TTS 朗读 + 动画联动，用户完全可控

### 设计原则对齐

| 产品原则 | 助手体现 |
|----------|----------|
| 奖赏回来，不惩罚离开 | 主动消息永远正向鼓励，回归时温暖问候 |
| 可变 > 固定 | 模板消息随机选取，AI 生成个性化内容 |
| 可逆 > 不可逆 | 所有开关可关闭，助手可完全隐藏 |
| 觉察 > 管控 | 提供建议而非指令，忽略即退让 |

---

## 2. 系统架构

```
┌─ 渲染进程 (React) ─────────────────────────────────────────────┐
│                                                                 │
│  ┌─────────────────┐   ┌──────────────────┐   ┌─────────────┐ │
│  │ CreatureAvatar  │   │ ConversationPanel│   │ProactiveEngine│
│  │ (水母动画)      │──▶│ (对话面板)        │   │ (主动触发)   │
│  └─────────────────┘   └────────┬─────────┘   └──────┬──────┘ │
│                                  │                     │        │
│  ┌─────────────────┐            │                     │        │
│  │ AudioController │◀───────────┴─────────────────────┘        │
│  │ (音效 + TTS)    │                                            │
│  └─────────────────┘                                            │
└──────────────────────────────┬──────────────────────────────────┘
                               │ IPC (ai:stream:*)
┌─ 主进程 (Electron) ──────────┴──────────────────────────────────┐
│  chatHandler.ts (流式代理)  │  chatRepository.ts (SQLite CRUD)   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS SSE
┌─ ai-gateway (FastAPI) ───────┴──────────────────────────────────┐
│  POST /api/v1/ai/chat/stream                                    │
│  多模型路由 · System Prompt 注入 · 历史窗口裁剪                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 水母形象与动画系统

### 状态机

| 状态 | 触发 | 动画表现 |
|------|------|----------|
| `idle` | 默认 | 缓慢漂浮、触须轻摆、伞体 4s 呼吸周期 |
| `alerting` | 主动触发 | 加速游入视野、琥珀金闪烁、释放气泡 |
| `speaking` | TTS 朗读中 | 赛博青发光脉冲、触须舒展、光强随音量微动 |
| `listening` | 面板展开等待输入 | 伞体微倾、触须收拢、柔和待机光 |
| `resting` | 长时间无交互 | 缓慢沉降、微光渐暗 |

### 动画实现

采用 CSS + Framer Motion（项目已有依赖），不引入 Lottie：

- **伞体呼吸**：CSS `scale` + `border-radius` 缓动，4s 周期
- **触须飘动**：SVG path + Framer Motion，3-4 条触须正弦偏移错开相位
- **发光脉冲**：CSS `box-shadow` / `filter: drop-shadow`
- **漂浮位移**：Framer Motion `useAnimationFrame`，缓慢随机漂移
- **气泡粒子**：CSS 伪元素，说话/吸引时 3-5 颗气泡上浮

### 尺寸与布局

- 生物容器：`64×64px`（待机），面板展开后移至面板顶部 `48×48px`
- 定位：`position: fixed; right: 24px; bottom: 24px; z-index: 50`
- 面板：右侧滑出 `width: 380px; z-index: 40`

---

## 4. 对话面板

### 消息类型

```typescript
type MessageRole = 'user' | 'assistant' | 'system';
type MessageContentType = 'text' | 'action_card' | 'suggestion';

interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  contentType: MessageContentType;
  trigger?: ProactiveTriggerType;
  createdAt: number;
}
```

MVP 实现 `text` 类型（Markdown 渲染），预留扩展字段。

### 流式渲染

复用 `electronStreamBridge.ts` 的 `streamIpc` 模式：
1. 调用 `streamIpc(authToken, '/api/v1/ai/chat/stream', payload)`
2. `AsyncGenerator<string>` 逐 chunk 追加
3. 赛博青 `▌` 光标闪烁标示生成中
4. 完成后光标消失，消息落库

### 会话管理

- 超过 24h 未活跃自动新建会话
- 面板打开时加载最近会话的最近 50 条消息
- 发送时携带最近 20 轮对话作为上下文窗口
- MVP 不做多会话切换 UI

---

## 5. 主动触发引擎

### 规则模型

```typescript
interface ProactiveRule {
  id: string;
  event: AppEventType;
  condition?: (ctx: TriggerContext) => boolean;
  cooldown: number;       // ms
  priority: number;
  message: MessageStrategy;
}

type AppEventType =
  | 'app:startup' | 'session:end' | 'user:idle'
  | 'user:return' | 'review:due' | 'achievement:unlocked';

type MessageStrategy =
  | { type: 'template'; templates: string[] }
  | { type: 'ai_generate'; prompt: string };
```

### MVP 规则表

| 规则 ID | 事件 | 冷却 | 优先级 | 策略 |
|---------|------|------|--------|------|
| `greeting-startup` | `app:startup` | 4h | 10 | template |
| `greeting-return` | `user:return` | 24h | 20 | ai_generate |
| `session-summary` | `session:end` | 30min | 15 | ai_generate |
| `idle-nudge` | `user:idle` | 20min | 5 | template |
| `review-reminder` | `review:due` | 2h | 12 | template |

### 触发流程

1. 事件总线 emit → 匹配规则 → 检查 condition → 检查冷却 → 优先级排序
2. 生成消息（template 随机 / ai_generate 调网关）
3. 呈现序列：水母 alerting → 提示音效 → 气泡浮现
4. 用户点击 → 展开面板 → 消息入历史；忽略 → 气泡消散 → 消息仍入历史

### 防打扰机制

- 全局勿扰时段（默认 22:00-08:00）
- 每小时最多 2 次主动触发
- 连续 3 次被忽略 → 当日不再触发
- 用户总开关可完全关闭

---

## 6. 音频系统

### 偏好模型

```typescript
interface AudioPreferences {
  enabled: boolean;
  soundEffects: boolean;
  ttsEnabled: boolean;
  volume: number; // 0-1
}
```

### 提示音效

| 音效 | 文件 | 场景 |
|------|------|------|
| 气泡浮现 | `assistant-bubble.mp3` | 主动触发气泡弹出 |
| 说话开始 | `assistant-speak-start.mp3` | TTS 开始前极短提示 |
| 轻触回应 | `assistant-ack.mp3` | 用户点击气泡/展开面板 |

音效特征：柔和、水下质感、短促（<1s）。

### TTS 方案

- **MVP**：`window.speechSynthesis`（Web Speech API），系统中文女声，零成本离线可用
- **后续**：云端 TTS 端点（网关新增），音质升级无缝切换
- 队列管理：FIFO，同时只播一条；播放时水母 speaking 态；用户可中断

---

## 7. 数据模型

### SQLite 表

```sql
CREATE TABLE IF NOT EXISTS assistant_sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT DEFAULT '新对话',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  is_archived   INTEGER DEFAULT 0,
  metadata      TEXT
);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content       TEXT NOT NULL,
  content_type  TEXT DEFAULT 'text',
  trigger_type  TEXT,
  tokens_used   INTEGER,
  model         TEXT,
  latency_ms    INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_triggers (
  id            TEXT PRIMARY KEY,
  rule_id       TEXT NOT NULL,
  triggered_at  INTEGER NOT NULL,
  dismissed     INTEGER DEFAULT 0,
  responded     INTEGER DEFAULT 0
);

CREATE INDEX idx_messages_session ON assistant_messages(session_id, created_at);
CREATE INDEX idx_sessions_active ON assistant_sessions(is_archived, updated_at DESC);
CREATE INDEX idx_triggers_rule ON assistant_triggers(rule_id, triggered_at);
```

---

## 8. IPC 通道

| 通道 | 方向 | 用途 |
|------|------|------|
| `ai:chat:send` | 渲染→主 | 发送消息 |
| `ai:chat:history` | 渲染→主 | 加载历史消息（分页） |
| `ai:chat:sessions` | 渲染→主 | 获取会话列表 |
| `ai:chat:new-session` | 渲染→主 | 创建新会话 |

流式推送复用现有 `ai:stream:chunk/end/error` 事件体系。

---

## 9. ai-gateway 端点

```
POST /api/v1/ai/chat/stream
Content-Type: application/json
Authorization: Bearer <token>
```

**请求体：**

```json
{
  "message": "用户消息",
  "history": [{ "role": "user|assistant", "content": "..." }],
  "system_context": {
    "personality": "dynamic_adaptive",
    "scene": "study|break|idle|review",
    "user_profile_summary": "可选的学习画像摘要"
  }
}
```

**响应**：SSE `text/event-stream`，格式与现有流式端点一致。

**System Prompt（网关注入）：**

```
你是「深潜伙伴」，熵减学习应用中的 AI 学伴。
性格：动态适应——学习时专业严谨、休息时轻松幽默、低谷时温暖鼓励。
原则：
- 奖赏回来，不惩罚离开：永远正向鼓励，不批评用户中断
- 觉察 > 管控：提供建议而非指令，尊重用户自主权
- 简洁有力：回复控制在 3-5 句，除非用户要求展开
- 费曼精神：引导用户自己思考，而非直接给答案
```

---

## 10. 错误处理与降级

| 场景 | 处理 |
|------|------|
| 网关不可达 | 预设模板消息 + "离线"标记，不阻塞 UI |
| 流中断 | 已接收内容保留 + "（连接中断）"标记，可重试 |
| 模型超时（30s） | 降级提示"思考超时，换个问法试试？" |
| TTS 失败 | 静默降级纯文本，不影响对话流 |

---

## 11. 文件结构

```
client/src/features/assistant/
├── components/
│   ├── CreatureAvatar.tsx
│   ├── CreatureBubble.tsx
│   ├── ConversationPanel.tsx
│   ├── MessageList.tsx
│   ├── MessageBubble.tsx
│   ├── ChatInput.tsx
│   └── StreamingCursor.tsx
├── hooks/
│   ├── useChat.ts
│   ├── useProactiveEngine.ts
│   └── useAssistantAudio.ts
├── lib/
│   ├── proactiveRules.ts
│   ├── eventBus.ts
│   ├── ttsController.ts
│   └── messageTemplates.ts
├── store/
│   └── useAssistantStore.ts
├── types.ts
└── constants.ts

client/electron/ai/handlers/chatHandler.ts
client/electron/db/chatRepository.ts
server/ai-gateway/routes/chat.py
client/public/sounds/assistant-{bubble,speak-start,ack}.mp3
```

---

## 12. MVP 边界

| 做 | 不做（后续迭代） |
|----|-----------------|
| 水母动画（idle/alerting/speaking 三态） | 完整五态 + 表情系统 |
| 自由对话 + 流式输出 | 功能调度（工具调用唤起新窗口） |
| 对话历史 SQLite 持久化 | 多会话切换 UI |
| 5 条主动触发规则 | 成就/情绪/知识联结触发 |
| 提示音效 + Web Speech TTS | 云端高质量 TTS |
| 用户可控开关 | 上下文感知（注入当前页面内容） |
| 防打扰机制 | 长期学习画像 |
| 动态性格 system prompt | 多角色/自定义性格 |

---

## 13. 设置集成

设置页新增"AI 助手"分区：启用开关、音效开关、TTS 开关、音量、主动对话开关、勿扰时段。

偏好以 JSON 序列化存入现有 SQLite 设置表（键 `assistant_preferences`）。

---

## 14. 性能考量

- 水母动画仅使用 `transform` + `opacity`，不触发 layout/paint
- 面板未展开时 `ConversationPanel` 不挂载（条件渲染）
- 消息列表 >100 条启用虚拟滚动
- 主动触发引擎为事件驱动，无轮询

---

## 15. 集成点

| 集成点 | 方式 |
|--------|------|
| 番茄钟结束 | `usePomodoroStore` 状态变化 → emit `session:end` |
| 应用启动 | `App.tsx` 挂载 → emit `app:startup` / `user:return` |
| 空闲检测 | 全局 `mousemove/keydown` 节流 → 3min 无活动 emit `user:idle` |
| 复习到期 | 闪卡调度器 → emit `review:due` |
| AI 认证 | 复用 `getElectronPlugin()` 的 authToken 注入 |
| 流式通道 | 复用 `streamHandler.ts` 的 `ai:stream:*` 体系 |
