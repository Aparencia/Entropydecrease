# 课堂助手视频窗口识别优化设计

> 编制日期：2026-08-16
> 状态：已获用户确认（第 1~3 节逐节评审通过）
> 范围：仅 Windows 平台增强；macOS/其他平台保持现有标题关键词逻辑不变
> 配套：`docs/Foresight/classroom-recognition-maturity-audit.md`（识别链路成熟度审计）、`docs/Foresight/classroom-assistant-optimization-roadmap.md`（P0-P2 路线图）

---

## 一、背景与目标

### 1.1 现状问题

课堂助手的目标窗口识别当前为纯标题关键词一票制评分（`client/electron/windowScorer.ts`，131 行）：

- **推荐不准**：标题命中高优先级词 +100、中优先级 +50、黑名单直接过滤；命中即返回，无叠加、无置信度；标题无关键词的窗口（如「第3章 线性代数 - Google Chrome」）直接掉进「显示全部」折叠区。
- **重复操作多**：同一门课每次都要重新选窗口，无历史记忆、无自动选中。
- **联动链路弱**：课程名提取（`useWindowWatcher` 正则）与内容分类（`contentClassifier` 标题规则）均只依赖标题，窗口识别错了全链路跟着错。
- **监听盲区**：3s 轮询仅对窗口 id 集合做 diff，标题变化（如会议未读角标）不触发推送。
- **黑名单误伤**：`Settings`/`设置`/`Electron` 等宽泛词可能误伤合法窗口。

### 1.2 核心洞察（头脑风暴结论）

1. **正向识别内容语义是死路**：化妆/手工类教程标题往往无特异性（「新手必学！3分钟搞定日常妆」不含课程词），窗口层面无法语义判定。
2. **意图先验**：用户打开课堂助手 = 声明「我要采集正在看的学习内容」，这是最强先验。设计只需排除「一定非学习」的窗口（负向证伪），灰区交给前台窗口/记忆/唯一候选补位。
3. **游戏攻略是排除通道的陷阱**：游戏教程/攻略视频是合法学习内容，且标题几乎自带特征词（攻略/教程/打法）——单一维度硬排除必误伤，必须双向打分对冲。

### 1.3 目标

| 维度 | 目标 |
|---|---|
| 推荐准确度 | 标题无特异性场景（化妆/手工/攻略视频）仍可推荐或自动选中 |
| 交互体验 | 高置信度自动选中 + toast 可更换，二次用户零选择启动 |
| 联动链路 | 窗口识别 → 课程名回填 → 热词词表自动加载；内容分类接入进程信号 |
| 工程质量 | 纯函数层全覆盖单测；信号源全部可选，缺失时行为与现状一致（不回归） |

---

## 二、架构设计

三层拆分，`windowScorer.ts` 降为组合入口：

```
┌─ 信号层  client/electron/windowSignals.ts（新增）─────────────┐
│   enrich(sources) → 为每个窗口附加信号                        │
│   · HWND 解析：source id "window:<HWND>:0" → HWND             │
│   · 进程名：native.listAudioWindows() 按 HWND 建索引匹配       │
│   · 几何：native 扩展字段（rect → 宽高比/面积占比/置顶）        │
│   · 前台窗口：native 新增 GetForegroundWindow 查询            │
│   · 优雅降级：native 不可用 → 仅标题信号（= 现状行为）         │
└──────────────────────────────────────────────────────────────┘
┌─ 规则层  client/electron/windowRules.ts（新增，纯函数）───────┐
│   scoreTitle（标题叠加计分）/ scoreProcess（进程白名单）       │
│   scoreLearningIntent（攻略正信号）/ scoreEntertainment（负分）│
│   scoreGeometry（宽高比/面积/置顶/全屏）/ 系统黑名单 / 置信度  │
└──────────────────────────────────────────────────────────────┘
┌─ 记忆层  client/electron/windowHistory.ts（新增）─────────────┐
│   recordChoice / lookupBoost / clear（SQLite 表 window_memory）│
│   标题模板化（会议号/章节数字归一）→ hash 维度                │
└──────────────────────────────────────────────────────────────┘
组合入口  client/electron/windowScorer.ts（改造，导出兼容）
```

**设计原则**：
- 信号源全部可选：native 缺失/失败时自动退化为纯标题逻辑，不改变现有行为路径。
- 规则层零副作用纯函数，全部可单测（项目 AI 编程规范 §1 副作用隔离）。
- 单文件 ≤300 行（§1），`@ai-context` 中英双语注释（§3）。

---

## 三、评分模型（双向打分）

### 3.1 信号与分值

| 通道 | 信号 | 规则 | 分值 |
|---|---|---|---|
| 正向 | 标题·高优先级 | 网课/会议/视频站关键词（保留现有列表） | +40/词，可叠加 |
| 正向 | 标题·中优先级 | 浏览器/播放器（保留现有列表） | +20/词，可叠加 |
| 正向 | **学习意图正信号**（新增） | 标题含 `攻略/教程/指南/教学/讲解/解析/入门/进阶/技巧/打法/开荒/机制/评测/实测/心得` | **+60** |
| 正向 | 进程白名单 | WeMeet.exe / DingTalk / Zoom / Teams / 视频站客户端 | +50 |
| 正向 | 进程白名单 | chrome / edge / firefox / 播放器 | +25 |
| 正向 | 几何 | 宽高比 1.2~2.4（视频/PPT 特征） | +30 |
| 正向 | 几何 | 窗口面积 ≥30% 显示器 | +20 |
| 正向 | 几何 | 置顶 +10 / 全屏 +15 | — |
| 正向 | **前台窗口**（新增） | GetForegroundWindow 命中 | **+80** |
| 正向 | 记忆 boost | min(useCount,5)×6 + recency（7 天内 +10 / 30 天内 +5） | 封顶 +40 |
| 负向 | **娱乐负分**（新增） | 游戏进程（steam/WeGame/客户端）、影视客户端进程、直播平台进程 | −30 |
| 负向 | **娱乐负分**（新增） | 标题形态：`第N集/剧场版/预告片/MV/演唱会/番剧` | −40 |
| 过滤 | 系统黑名单 | 保留现有硬黑名单（Program Manager/Taskbar/自窗口含旧品牌'课伴'等）；**移除** `Settings`/`设置` 等宽泛词 | 过滤 |

### 3.2 核心语义

- **双向打分而非硬排除**：正信号强过负分就进推荐，负分沉底但不误杀（爱奇艺纪录片：进程 −30 + 标题「纪录片/公开课」→ 仍可推荐；爱奇艺剧集：进程 −30 + 标题「第12集」−40 → 沉底）。
- **游戏攻略完整路径**：
  - 浏览器看攻略视频：+60 攻略 + 25 浏览器 + 前台/记忆 → high，自动选中 ✓
  - 直播平台看攻略直播：+60 攻略 −30 娱乐 + 80 前台 → 推荐前列 ✓
  - 纯娱乐游戏/直播：−30 娱乐、无正信号 → 沉底「显示全部」 ✓
- **标题无特异性场景**（化妆教程）：标题 0 分，但 进程 +25 + 几何 +45~65 + 记忆（标题模板 `{视频标题} - bilibili.com` 稳定）+10~40 → medium~high；首次无记忆时靠前台窗口 +80 与唯一候选规则补位。

### 3.3 置信度分级

| 级别 | 总分 | 用途 |
|---|---|---|
| high | ≥130 | 自动选中候选 |
| medium | 70~129 | 推荐区候选 |
| low | <70 | 折叠区（显示全部） |

分值阈值实现时校准，以单测断言为准。

### 3.4 输出契约

`ScoredWindow` 扩展：保留 `id/title/thumbnail/score/matched`（兼容），新增 `processName?`、`confidence?: 'low'|'medium'|'high'`、`reasons?: string[]`（多个命中理由，替代单值 matched 的展示；matched 仍填充最高权重词保证旧 UI 兼容）。

---

## 四、自动选中交互（渲染层 `useWindowWatcher`）

窗口列表就绪后（`screen_windows_changed` / 首次 `screen_list_windows`），**仅在未选中任何窗口时评估**（已有选中不覆盖、不重复 toast）：

```
top1 满足任一 → 自动选中 + toast「已自动选择：<标题>」+ 卡片显示「更换」
  ① high 置信度（≥130）
  ② 前台窗口 && 总分 ≥60（前台路径放宽阈值）&&（记忆命中 或 唯一候选）
  ③ medium 且 记忆命中 且 唯一视频类候选
```

「唯一视频类候选」定义：系统黑名单过滤后，总分 ≥70 且未被娱乐负分主导（总分 − 娱乐负分 ≥ 60）的窗口仅此一个。

不满足 → 仅置顶推荐区，不自动选中（保守，防误采）。

**误采兜底**：自动选中只改选中态，不启动采集；开始按钮在用户控制下；卡片「更换」可一键改选（现有能力）。

---

## 五、历史记忆（`windowHistory.ts`）

### 5.1 存储

- 主进程 SQLite 新表 `window_memory`（复用既有 sqliteService 基建）。
- 维度：`进程名 + 标题模板 hash`（标题归一化：会议号/章节数字/未读数 → 占位符，如「{视频标题} - bilibili.com」）。
- 字段：`processName`、`titleTemplate`、`titleHash`、`courseName`、`useCount`、`lastUsedAt`。

### 5.2 写入

- 用户**手动**选择窗口时记录（新增 IPC `window_memory_record`，safeHandle 包装 + channels.ts 登记 + preload 白名单，SEC-005）。
- 自动选中同样累加 useCount。
- 记忆关联课程名：选择时若 courseMeta.courseName 已确定，随记录写入。

### 5.3 读取与淘汰

- 评分时按进程名模糊 + 标题模板精确命中 → boost 分（见 3.1）。
- 上限 100 条 LRU 淘汰；新增 IPC `window_memory_clear` 支持设置页清空。

---

## 六、联动闭环

### 6.1 课程名提取（`useWindowWatcher`）

优先级：**记忆回填（detectedBy: 'memory'）> AI 首帧识别（既有 courseDetector）> 标题正则兜底（现有 COURSE_KEYWORDS，补充攻略类词）**。

`captureTypes.ts` 的 `CourseMeta.detectedBy` 类型同步扩展 `'memory'` 状态（现为 `'manual' | 'window_title' | 'ai'`）。

### 6.2 热词词表自动加载

记忆回填或自动识别出课程名 → 课程名变化联动加载该课程热词词表（P1-3 已落地「会话关联课程后自动应用对应词表」，回填即触发，零新增）。

### 6.3 内容分类（`contentClassifier`）

`classifyByTitle` 增加可选 `processName` 入参：
- 进程名命中软件名单（photoshop.exe 等）→ software_skill。
- 命中游戏/直播进程 → 交给标题攻略词判定（复用学习意图正信号词表）。

---

## 七、监听增强（`screenCaptureHandlers.ts`）

- diff 从「id 集合」升级为「`id|title` 集合」→ 标题变化（未读角标/会议状态）也触发推送。
- 缩略图保持现状（仅 hasChanged 时才生成，已是最优，不改动）。

---

## 八、错误处理与降级

| 故障 | 行为 |
|---|---|
| native 模块未加载（未编译/非 Windows） | 信号层跳过进程/几何/前台信号，退化为纯标题逻辑（= 现状），自动选中仅接受 high 标题置信度 |
| SQLite 记忆读写失败 | 记忆层 try/catch 静默降级，无 boost 分，不影响评分 |
| 前台窗口查询失败 | 前台信号缺失，其余信号照常 |
| 全部信号缺失（极端） | 输出与现状完全一致（标题关键词排序），保证不回归 |

---

## 九、测试计划（vitest）

| 文件 | 覆盖点 |
|---|---|
| `windowRules.test.ts` | 双向计分（攻略 +60 / 娱乐 −30~−40 对冲）、标题叠加、系统黑名单、置信度分级边界、空标题 |
| `windowHistory.test.ts` | 标题模板归一化 hash、boost 计算（useCount/recency）、LRU 淘汰、记录写入 |
| `windowSignals.test.ts` | HWND 解析（含畸形 id）、native 缺失降级（mock）、前台窗口匹配 |
| `useWindowWatcher.test.ts`（新增） | 自动选中三规则、toast 触发、课程名回填优先级 |
| `contentClassifier.test.ts`（扩展） | processName 入参分类、游戏进程 + 攻略标题组合 |

验收命令：`npm run lint` + `npm run typecheck` + `npm run typecheck:electron` + `npm run test` 全绿；native 编译通过（`client/native/process-audio` 本地 node-gyp 构建）。

---

## 十、文件清单

**主进程（新增 3 / 改造 3）**
- 新增 `client/electron/windowSignals.ts`
- 新增 `client/electron/windowRules.ts`
- 新增 `client/electron/windowHistory.ts`
- 改造 `client/electron/windowScorer.ts`（组合入口，导出兼容）
- 改造 `client/electron/screenCaptureHandlers.ts`（信号注入、监听 diff、新 IPC）
- 改造 `client/electron/ipc/channels.ts` + `client/electron/preload.ts`（新通道登记）

**原生（改造 2）**
- 改造 `client/native/process-audio/src/window_finder.cc`（枚举结构加 rect/alwaysOnTop/前台 HWND）
- 改造 `client/electron/audio/processAudioNative.ts`（类型扩展 + 前台窗口查询导出）

**渲染进程（改造 4 + 测试）**
- `client/src/lib/capture/captureTypes.ts`（WindowInfo 扩展）
- `client/src/features/classroom/hooks/useWindowWatcher.ts`（自动选中 + 记忆回填）
- `client/src/lib/capture/contentClassifier.ts`（processName 信号）
- `client/src/features/classroom/components/WindowSelectCard.tsx`（reasons 展示 + 自动选中态）
- 新增 `windowRules.test.ts` / `windowHistory.test.ts` / `windowSignals.test.ts` / `useWindowWatcher.test.ts`；扩展 `contentClassifier.test.ts`

---

## 十一、阶段拆分（实施顺序，各阶段独立可验证）

1. **阶段一：评分模型重构** — windowRules + windowScorer + signals 纯标题版；行为兼容，全测试绿。
2. **阶段二：原生信号接入** — C++ 字段扩展 + 进程/几何/前台信号 + 本地 node-gyp 构建 + 打包验证。
3. **阶段三：记忆 + 自动选中** — windowHistory + 新 IPC + useWindowWatcher + WindowSelectCard UI。
4. **阶段四：联动与监听** — 课程名回填、contentClassifier 进程信号、标题 diff 升级。

---

## 十二、明确不做（YAGNI）

- 缩略图 OCR/视觉后验（本地 OCR 已落地但本次不引入，记为 P2 候选：对 top-3 候选做一次 OCR 提拉首次识别的 medium 候选）。
- macOS 系统信号（保持现状标题逻辑）。
- 跨平台抽象层（本次仅课堂模块一个消费者）。
