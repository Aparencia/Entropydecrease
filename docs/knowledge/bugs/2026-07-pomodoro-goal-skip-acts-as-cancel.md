# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 番茄钟"跳过"退化为"取消"：一个 onClose 回调承载两种意图，空目标番茄无法启动 |
| 日期 | 2026-07-31 |
| 类型 | 踩坑记录 |
| 标签 | #React #番茄钟 #弹窗交互 #回调语义 #意图区分 |

---

## 症状

内测反馈：**番茄钟的目标设置中，"跳过"按钮类似于取消，无法开始计时，即无法实现空目标的番茄钟。**

实测三条路径全部失效（均只关弹窗、不启动计时）：
1. 点"跳过"
2. 输入为空时点"开始"
3. 输入为空时按 Enter

## 环境

| 项目 | 版本/信息 |
|------|----------|
| 组件 | `GoalInput`（Radix Dialog 封装的 `Modal` + 双按钮 footer） |
| 相关文件 | `client/src/features/pomodoro/components/GoalInput.tsx`、`client/src/features/pomodoro/pages/PomodoroPage.tsx` |

## 排查过程（按 debug-sop）

1. **分类**：逻辑错误（必现），无异常无日志
2. **隔离**：计时启动只发生在 `PomodoroPage.handleGoalSubmit` 内的 `start()`，而该函数只挂在 `onSubmit`；`onClose` 被绑定为纯 `setGoalModalOpen(false)`
3. **列出 GoalInput 内所有"离开弹窗"的出口**，逐一核对调用的是 `onSubmit` 还是 `onClose`：
   - "跳过"按钮 → `onClose`（❌ 不启动）
   - 空输入点"开始"/按 Enter → `handleSubmit` else 分支 → `onClose`，且注释写着"空内容时等同于跳过"（❌ 不启动）
   - "开始"且有输入 → `onSubmit`（✅ 启动）
4. **确认 store 层无阻碍**：`currentGoal: string | null`、`recordSession` 用 `currentGoal ?? undefined`、目标文字渲染有 `currentGoal &&` 判空——空目标在数据层本就受支持，问题纯在 UI 意图传递

## 根因

**一个回调承载了两种语义相反的意图**：`onClose` 同时被用于表达"取消（不开始）"与"跳过目标（仍要开始）"。父组件只能把 `onClose` 实现为"关闭弹窗"这一交集语义，于是"跳过"这条用户意图中的"开始计时"部分被静默丢弃。

注释"空内容时等同于跳过"暴露了误解：作者认为"跳过"本身就是不开始——而用户预期的"跳过"是**跳过目标设置**，不是跳过这次番茄。

## 修复方案

1. `GoalInput`：明确区分两种意图，并让两种意图各自拥有可见入口
   - footer 改为三按钮，视觉层级递增：**取消**（ghost → `onClose`）/ **跳过**（secondary → `onSubmit('')`）/ **开始**（primary → `handleSubmit`）
   - “跳过”用 secondary 而非 ghost，与“取消”在视觉上拉开差异，防止用户再次误认为同类动作
   - `handleSubmit` 简化为 `onSubmit(text.trim())`，空输入自然走“跳过”语义（点“开始”/按 Enter 一致）
   - `onClose` 只代表取消（“取消”按钮 + Modal 右上角关闭按钮）
   - props 注释标注两个回调的语义边界
2. `PomodoroPage.handleGoalSubmit`：`setCurrentGoal(goal || null)`（空串转 null，避免 `recordSession` 记下空字符串目标）；`rememberGoal && goal` 才写目标记忆库，防止存入空记录
3. 回归测试 `GoalInput.test.tsx` 覆盖 6 条路径：跳过 / 空输入点开始 / 空输入按 Enter / 有目标提交 trim / “取消”不启动 / 关闭按钮不启动

## 教训

- **弹窗回调命名即契约**：`onClose` / `onCancel` / `onSkip` / `onSubmit` 表达不同意图，出现"XX 等同于 YY"的注释时，往往说明两种意图被强行合并——这是 bug 高发信号
- **可选输入的"跳过"必须是提交路径，而非关闭路径**：跳过的是「填写这一步」，不是「整个流程」
- **区分两种意图后，两者都需要可见入口且视觉上可辨**：仅把“取消”留给右上角 X 会让用户找不到退出；同为 ghost 的两个按钮会被误认为同类动作，需用 variant 层级（ghost/secondary/primary）表达“退出/次要前进/主要前进”
- 排查"按钮点了没反应"类问题的高效方法：**枚举组件内所有退出出口，逐个核对其调用的回调**，而不是从状态流反向猜
- 数据层已支持可空字段（`string | null`）不代表 UI 打通了空值路径，两层需分别验证

## 相关提交

- fix(pomodoro): 跳过目标设置应启动空目标番茄钟（待提交）
