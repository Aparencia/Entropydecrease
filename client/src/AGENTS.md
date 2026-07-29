# AGENTS.md — client/src 渲染进程子系统

## 入口

- `main.tsx` — React 应用挂载点
- `App.tsx` — 路由定义、全局布局、3D 场景容器

## 目录结构

```
src/
├── components/    # 共享 UI 组件（layout/ ui/ onboarding/ overlay/ sync/）
├── features/      # 功能模块（按业务域划分）
│   ├── classroom/ # 网课笔记提取（多模态捕获）
│   ├── dashboard/ # 学习仪表盘 + 深海/穹顶双世界主题
│   ├── flashcard/ # 闪卡（间隔重复）
│   ├── feynman/   # 费曼学习法
│   ├── notes/     # 智能笔记（TipTap 富文本）
│   ├── pomodoro/  # 番茄钟
│   └── inspiration/ # 灵感空间
├── hooks/         # 全局自定义 Hooks
├── lib/           # 工具库与适配层（AI 客户端、存储、同步）
├── pages/         # 页面级组件（设置、登录等）
├── routes/        # 路由配置
├── stores/        # Zustand 全局状态
├── types/         # TypeScript 类型定义
├── styles/        # 全局样式与主题变量
└── workers/       # Web Worker
```

## 约束

- 所有 AI 调用必须经 `lib/ai/` 适配层，不得在组件中直接 fetch AI 网关
- 本地数据操作通过 `lib/db/` 或 `lib/storage/`，禁止组件内直接操作 IndexedDB
- 新增功能模块必须在 `features/` 下创建独立目录，包含 `components/`、`hooks/`、`pages/`
- 3D 场景实体配置集中在空间导航配置中，双世界主题（深海/穹顶）必须同步适配
- 状态管理使用 Zustand，服务端缓存使用 TanStack Query，不混用

## 验证路由

```bash
# 在 client/ 目录下执行
npm run lint    # Oxlint 静态检查
npm run test    # Vitest 单元测试
npm run build   # tsc -b && vite build — 必须零错误
```

## 高影响文件

- `App.tsx` — 路由与全局布局变更影响所有页面
- `stores/` — 全局状态变更需验证所有消费组件
- `lib/ai/` — AI 调度变更影响全部 AI 功能
- `components/layout/Sidebar.tsx` — 导航结构变更影响用户流转
- `styles/` — 主题变量变更影响双世界全局视觉
