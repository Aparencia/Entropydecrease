# SOP（标准作业程序）功能模块头脑风暴

> **状态**: 前瞻构想（Foresight，未排期）
> **日期**: 2026-07-30
> **模块**: 新功能模块（暂定代号，待品牌命名）
> **来源**: 用户主动发起的多维度头脑风暴
> **关联**: 回声定位（classroom）、费曼/苏格拉底（feynman）、课程预设（course-preset-brainstorm.md）

---

## 0. 前置分析：SOP 在熵减中的定位缺口

现有六大模块覆盖了学习的**单点能力**：

| 模块 | 能力 | 隐喻 |
|---|---|---|
| 深潜（Pomodoro） | 专注 | 锁定当前时空 |
| 结礁（Notes） | 记录 | 碎片沉淀为暗礁 |
| 回声定位（Classroom） | 采集 | 声呐捕获暗物质 |
| 反衰减呼吸（Flashcards） | 记忆 | 对抗遗忘衰减 |
| 浮出水面（Feynman） | 理解 | 消除不确定性 |
| 萤火海沟（Inspiration） | 灵感 | 微光等待引爆 |

**缺口**：没有模块回答 **"以什么顺序、在什么条件下、做哪些事"**。用户知道怎么专注、怎么记笔记、怎么复习，但缺少一个**编排层**把单点能力串联为可复用的学习流程。SOP 正是这个编排层。

**核心隐喻候选**（深海主题）：

| 候选名 | 隐喻 | 文案 |
|---|---|---|
| **洋流图** | 洋流是深海中可预测的流动路径，SOP 是学习活动的可复用路径 | "绘制你的认知洋流，让学习不再随波逐流。" |
| **深潜航路** | 每次学习是一次深潜，SOP 是预设的潜水航路 | "规划下潜路线，每一潜都有章法。" |
| **潮汐节律** | 潮汐是自然界的 SOP，学习也应有节律 | "建立你的认知潮汐，让秩序成为本能。" |

> 推荐 **洋流图**：与"回声定位"的声呐隐喻同属海洋导航体系，且"图"暗示可视化编排。

---

## 1. 功能定位

### 1.1 核心价值

**一句话**：把"我今天该怎么学"从每次临时决策变成一键启动的固化流程。

三层价值递进：

| 层次 | 描述 | 示例 |
|---|---|---|
| **L1 流程固化** | 将重复的学习活动序列保存为模板，一键启动 | "网课采集 → 整理笔记 → 生成闪卡 → 费曼复述" |
| **L2 程序性知识** | 从课程中捕获操作步骤类知识（实验/编程/解题），变成可交互练习清单 | "有机化学实验：滴定操作 7 步检查单" |
| **L3 AI 编排** | AI 根据学习目标 + 已有材料，自动生成个性化 SOP | "期末复习周：AI 根据薄弱科目自动编排 5 天计划" |

### 1.2 目标用户

- **主力**：大学生（课程多、实验多、考试周期固定）
- **延伸**：终身学习者（考证、编程自学、语言学习）
- **共性痛点**：知道"该做什么"但每次都要重新规划，执行力衰减

### 1.3 与现有模块的关系

```
                    ┌─────────────┐
                    │  SOP 编排层  │  ← 新模块（洋流图）
                    │  "做什么序"  │
                    └──────┬──────┘
           ┌───────┬───────┼───────┬───────┐
           ▼       ▼       ▼       ▼       ▼
        深潜     结礁    回声定位  反衰减   浮出水面
       (专注)   (记录)   (采集)   (记忆)   (理解)
```

**SOP 不替代任何模块，而是调度它们**。一个 SOP 步骤可以是"启动 25 分钟深潜"、"打开回声定位采集当前窗口"、"对今天的笔记做费曼复述"。

与课程预设的关系：课程预设（course-preset-brainstorm.md）是 SOP 的**特化子集**——它只编排"采集"环节的参数。SOP 是更通用的编排层，课程预设可以作为 SOP 模板库中的内置模板存在。

---

## 2. 功能架构

### 2.1 模块划分

```
features/sop/
├── pages/
│   ├── SopListPage.tsx        # SOP 模板列表（我的 + 内置）
│   ├── SopEditorPage.tsx      # SOP 编辑器（拖拽步骤）
│   └── SopRunPage.tsx         # SOP 执行器（逐步引导）
├── components/
│   ├── StepCard.tsx            # 单个步骤卡片
│   ├── StepPalette.tsx         # 步骤类型面板（拖拽源）
│   ├── RunProgress.tsx         # 执行进度条
│   ├── ChecklistItem.tsx       # 检查单项（程序性知识用）
│   └── SopTemplateCard.tsx     # 模板卡片
├── hooks/
│   ├── useSopTemplates.ts      # 模板 CRUD
│   ├── useSopRunner.ts         # 执行状态机
│   └── useSopAI.ts             # AI 生成/推荐
├── store/
│   └── useSopStore.ts          # Zustand 状态
├── types.ts                    # 类型定义
└── constants.ts                # 步骤类型注册表
```

### 2.2 核心数据模型

```typescript
/** SOP 模板 */
interface SopTemplate {
  id: string;
  name: string;
  description?: string;
  icon?: string;               // lucide icon name
  category: 'builtin' | 'user' | 'ai-generated';
  steps: SopStep[];
  tags: string[];              // 关联学科/场景
  createdAt: number;
  updatedAt: number;
  version: number;             // 乐观锁版本号
}

/** SOP 步骤 */
interface SopStep {
  id: string;
  type: SopStepType;
  title: string;
  description?: string;
  config: Record<string, unknown>;  // 步骤类型特定配置
  duration?: number;                // 预估时长（分钟）
  checklist?: string[];             // 程序性知识：检查子项
  optional: boolean;                // 是否可跳过
}

type SopStepType =
  | 'focus'          // 深潜（番茄钟）
  | 'capture'        // 回声定位（网课采集）
  | 'note'           // 结礁（笔记整理）
  | 'review'         // 反衰减呼吸（闪卡复习）
  | 'feynman'        // 浮出水面（费曼复述）
  | 'inspiration'    // 萤火海沟（灵感记录）
  | 'break'          // 休息
  | 'checklist'      // 纯检查单（程序性知识）
  | 'custom';        // 自定义文本步骤

/** SOP 执行实例 */
interface SopRun {
  id: string;
  templateId: string;
  startedAt: number;
  completedAt?: number;
  currentStepIndex: number;
  stepResults: StepResult[];   // 每步产出（笔记ID/闪卡数/专注时长等）
  status: 'running' | 'paused' | 'completed' | 'abandoned';
}
```

### 2.3 数据流向

```
模板库 ──选择──▶ 执行器 ──逐步调度──▶ 各功能模块
                  │                      │
                  │◀───── 产出回收 ───────┘
                  │       (笔记ID/闪卡数/专注时长)
                  ▼
              执行记录 ──▶ 仪表盘统计
                  │
                  ▼
              AI 分析 ──▶ 优化建议 / 自动生成新 SOP
```

---

## 3. 用户界面

### 3.1 三个核心页面

**① SOP 列表页（SopListPage）**
- 顶部：场景标签筛选（全部 / 课前 / 课中 / 课后 / 考试 / 实验 / 自定义）
- 内置模板区：横滑卡片（"网课全流程"、"实验操作练习"、"期末复习周"等）
- 我的 SOP 区：网格卡片，每张显示名称 + 步骤数 + 上次执行时间 + 执行次数
- 右下角 FAB："新建 SOP" / "AI 生成"

**② SOP 编辑器（SopEditorPage）**
- 左侧：步骤类型面板（StepPalette），按类别分组，可拖拽
- 中间：步骤画布，纵向排列 StepCard，支持拖拽排序
- 右侧（或底部抽屉）：选中步骤的配置面板
- 顶部：SOP 名称 / 描述 / 标签编辑
- 设计风格：沿用毛玻璃面板 + 品牌色，StepCard 用 `rounded-kb-lg` + `bg-bg-secondary/40`

**③ SOP 执行器（SopRunPage）——最关键的页面**
- **全屏沉浸模式**（类似深潜的专注界面）
- 顶部：SOP 名称 + 进度环（已完成/总步骤）
- 中央：当前步骤大卡片（图标 + 标题 + 描述 + 操作按钮）
  - 若步骤是"深潜"：内嵌倒计时
  - 若步骤是"检查单"：逐项打勾
  - 若步骤是"采集"：显示"跳转到回声定位"按钮（deep link）
- 底部：上一步 / 跳过 / 完成当前步骤
- 步骤切换动画：沿用 `page-fade-in`（250ms ease-out）
- 完成时：熵减反馈——"本次学习熵值 -X%，流程已固化"

### 3.2 与现有设计语言的统一

| 维度 | 规范 |
|---|---|
| 圆角 | `rounded-kb-sm/md/lg`（8/12/16px） |
| 动效 | Framer Motion 弹簧（stiffness 300, damping 28） |
| 图标 | Lucide, strokeWidth 1.5 |
| 色彩 | 品牌色 `brand-*`，功能色 `semantic-*`，模块专属色待定 |
| 双主题 | 深海（dark）/ 穹顶（light）双世界适配 |
| 字号 | 标题 `text-h2`，正文 `text-b2`，辅助 `text-b3` |

---

## 4. 技术实现

### 4.1 技术栈（复用现有）

| 层 | 选型 | 说明 |
|---|---|---|
| 状态管理 | Zustand（`useSopStore`） | 与 feynman/flashcards 一致 |
| 持久化 | better-sqlite3（Electron 主进程） | 与 notes/flashcards 一致，本地优先 |
| AI 集成 | `useAIFeature` hook + ai-gateway | 复用现有降级链（remote → local → fallback） |
| 路由 | react-router lazy import | `/sop`、`/sop/:id/edit`、`/sop/:id/run` |
| 跨模块调度 | 路由跳转 + URL 参数 | 如 `/pomodoro?duration=25&returnTo=/sop/run/xxx` |
| 拖拽 | @dnd-kit/core（轻量）或原生 HTML5 DnD | 编辑器步骤排序 |

### 4.2 跨模块调度方案

SOP 执行器需要"启动"其他模块的功能。两种方案：

| 方案 | 机制 | 优劣 |
|---|---|---|
| **A. 路由跳转 + 回调参数** | 执行器跳转到目标模块页面，URL 带 `returnTo` 参数，目标模块完成后跳回 | 简单，零耦合；但用户可能迷路 |
| **B. 嵌入式面板** | 执行器内嵌目标模块的核心组件（如番茄钟计时器、闪卡复习组件） | 体验连贯；但耦合度高，组件需支持嵌入模式 |

**推荐**：一期用 A（路由跳转），二期对高频步骤（深潜、闪卡）做 B（嵌入）。

### 4.3 技术难点

| 难点 | 风险 | 缓解 |
|---|---|---|
| 跨模块产出回收（如"采集完成后自动进入笔记整理"） | 模块间无直接通信 | 用 Zustand 全局 `sopRunStore` 暂存上下文，目标模块读取 |
| AI 生成 SOP 的质量 | LLM 可能生成不切实际的步骤 | 约束输出为 `SopStepType` 枚举 + 后置校验 |
| 执行中断恢复 | 用户中途关闭应用 | `SopRun` 持久化到 SQLite，启动时检测未完成 run 并提示恢复 |
| 步骤计时与深潜模块的计时器冲突 | 两个计时器同时运行 | SOP 内嵌深潜时复用深潜的计时器，不另起 |

---

## 5. 数据管理

### 5.1 存储方案

```sql
-- 模板表
CREATE TABLE sop_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT DEFAULT 'user',  -- builtin / user / ai-generated
  steps_json TEXT NOT NULL,       -- JSON: SopStep[]
  tags_json TEXT DEFAULT '[]',
  version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 执行记录表
CREATE TABLE sop_runs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES sop_templates(id),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  current_step_index INTEGER DEFAULT 0,
  step_results_json TEXT DEFAULT '[]',
  status TEXT DEFAULT 'running',  -- running/paused/completed/abandoned
  duration_seconds INTEGER        -- 实际总时长
);
```

### 5.2 版本控制

- 模板每次编辑 `version + 1`，`updated_at` 更新
- 执行记录快照 `template_id` + 执行时的步骤 JSON（防止模板修改后历史记录失真）
- 不做完整版本链（YAGNI），只保留最新版 + 执行时快照

### 5.3 内置模板管理

- 内置模板以 JSON 文件形式存放在 `client/src/features/sop/builtin-templates/` 目录
- 首次启动时 seed 到 SQLite（`category = 'builtin'`）
- 用户可"复制为我的"后自定义，内置模板不可编辑/删除
- 应用更新时可追加新内置模板（按 id 去重）

---

## 6. 应用场景

### 6.1 场景一：网课全流程（L1 流程固化）

```
模板名：网课学习全流程
步骤：
  1. [采集] 打开回声定位，选择目标窗口，智能路径 + 混合模式（25 分钟）
  2. [笔记] 整理采集到的笔记，补充自己的理解（15 分钟）
  3. [闪卡] 从笔记生成闪卡，完成首轮复习（10 分钟）
  4. [费曼] 选一个核心概念做苏格拉底式追问（10 分钟）
  5. [休息] 起身活动，远眺放松（5 分钟）
```

### 6.2 场景二：实验操作练习（L2 程序性知识）

```
模板名：有机化学 · 滴定操作
步骤：
  1. [检查单] 实验前准备
     ☐ 穿戴实验服和护目镜
     ☐ 检查滴定管是否漏液
     ☐ 用待装液润洗滴定管 2-3 次
     ☐ 装液至零刻度以上，排气泡
  2. [检查单] 滴定操作
     ☐ 左手控制活塞，右手摇瓶
     ☐ 逐滴加入，接近终点时半滴操作
     ☐ 观察指示剂变色，30s 不褪色即为终点
  3. [检查单] 数据记录
     ☐ 记录初读数和终读数
     ☐ 平行实验至少 3 次
     ☐ 相对偏差 ≤ 0.2%
  4. [费曼] 用自己的话解释：为什么接近终点时要半滴操作？
```

### 6.3 场景三：期末复习周（L3 AI 编排）

```
用户输入："下周考高等数学和数据结构，高数比较薄弱"
AI 生成：
  Day 1-2: [采集] 回看高数网课录像 → [笔记] 整理错题
  Day 3:   [闪卡] 高数公式闪卡强化 → [费曼] 对 3 个薄弱定理做苏格拉底追问
  Day 4:   [采集] 回看数据结构网课 → [笔记] 整理算法复杂度对比表
  Day 5:   [闪卡] 数据结构 + 高数混合复习 → [深潜] 模拟考试 2 小时
```

### 6.4 场景四：编程学习日常（L1 + L2 混合）

```
模板名：LeetCode 日常训练
步骤：
  1. [深潜] 25 分钟专注审题 + 编码
  2. [检查单] 代码自检
     ☐ 边界条件处理了吗？
     ☐ 时间/空间复杂度分析了吗？
     ☐ 能用更优解法吗？
  3. [笔记] 记录解题思路到笔记
  4. [闪卡] 把关键算法模式生成闪卡
```

---

## 7. 扩展性考虑

### 7.1 近期扩展（一期范围内）

| 方向 | 描述 |
|---|---|
| **模板导入/导出** | JSON 格式导入导出，支持同学间分享 |
| **执行统计** | 仪表盘新增"SOP 执行"卡片：本周完成 N 个流程、累计时长、最常跳过的步骤 |
| **步骤备注** | 执行时可为每步添加临时备注，完成后可选存入笔记 |

### 7.2 中期扩展（二期）

| 方向 | 描述 |
|---|---|
| **AI 自适应调整** | 执行中发现某步超时，AI 建议"跳过下一步休息，直接进闪卡？" |
| **条件分支** | 步骤支持"如果上一步产出 > N 条笔记，则跳过整理直接复习" |
| **回声定位联动** | 采集结束后自动触发 SOP 的下一步（如"采集完成 → 自动跳转笔记整理"） |
| **苏格拉底式 SOP 教练** | 执行完一个 SOP 后，AI 用苏格拉底追问引导反思："你觉得哪一步最有效？为什么？" |

### 7.3 远期愿景

| 方向 | 描述 |
|---|---|
| **SOP 市场** | 用户发布/订阅他人的学习流程模板（类似 Notion 模板库） |
| **课表驱动** | 与课程预设联动：周一 8:00 自动提示"该执行《高数》的课前预习 SOP 了" |
| **多设备同步** | 通过 sync-service 同步 SOP 模板和执行记录 |
| **SOP 链** | 多个 SOP 串联为"学习项目"（如"考研 90 天计划" = 12 个周 SOP 循环） |

### 7.4 与 AI 能力的结合矩阵

| 现有 AI 能力 | SOP 结合点 |
|---|---|
| 苏格拉底追问（`useAISocratic`） | SOP 完成后的反思引导；检查单步骤的"为什么"追问 |
| 内容分析（`sessionAnalyzer`） | 根据采集内容自动推荐后续 SOP 步骤 |
| 闪卡生成（`useAIFlashcards`） | SOP 中"生成闪卡"步骤的 AI 自动化 |
| 课程检测（`courseDetector`） | 根据窗口标题自动匹配关联的 SOP 模板 |
| 离线队列（`offlineAIQueue`） | AI 生成 SOP 在离线时排队，恢复后自动执行 |

---

## 8. 风险与约束

| 风险 | 影响 | 缓解 |
|---|---|---|
| 功能过重，变成"项目管理工具" | 偏离学习工具定位 | 严格限制步骤类型为学习模块枚举，不做通用任务管理 |
| 跨模块调度体验割裂 | 用户跳转后迷失 | 一期用路由跳转 + 顶部"SOP 执行中"悬浮条；二期嵌入 |
| AI 生成质量不稳定 | 用户信任下降 | 生成后可编辑；内置模板兜底；标注"AI 生成"来源 |
| 与课程预设功能重叠 | 用户困惑 | 明确定位：课程预设 = 采集参数预设；SOP = 全流程编排。课程预设作为 SOP 步骤的 config 子集 |
| 单文件 ≤300 行约束 | 编辑器/执行器复杂度高 | 按组件拆分（StepCard/StepPalette/RunProgress 等），hooks 分离逻辑 |

---

## 9. 下一步

- [ ] 待决策：确认品牌命名（洋流图 / 深潜航路 / 潮汐节律 / 其他）
- [ ] 待决策：一期范围——建议 L1（流程固化）+ L2（检查单）先落地，L3（AI 编排）二期
- [ ] 待决策：跨模块调度方案（路由跳转 vs 嵌入式）
- [ ] 若立项：走 brainstorming → spec → 实现计划流程，产出物落 `docs/versions/` 对应版本
