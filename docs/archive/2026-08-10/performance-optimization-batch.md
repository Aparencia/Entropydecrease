# 性能优化批次实施文档（2026-08-09 ~ 08-10）

> 已实施完成。归档依据：spec §4 实施文档判定。对应提交见文末。

## 第一批：3D 渲染治理（08-09）

- **GPU 粒子迁移**：6 套粒子系统（StarDust 1500 / BioluminescentLayer 120 / SeafloorSnow 500 / OrbitalRing 360 / FishSchool / ModuleEntity 轨道）迁移至 GPU vertex shader（新增 `client/src/lib/3d/shaders/gpuParticleShaders.ts` 240 行），useFrame 合并收敛（`0e9dc4a`）
- **WebGPU 尝试与回退**：渲染后端切 WebGPU 并恢复 Chronos 3D 球体（`1ec8b37`），因 R3F 兼容性回退 WebGLRenderer（`5c3b01c`、`0832b21`）；遗留为技术债 TD-001
- **渲染开销消除**：useFrame 内 per-frame `THREE.Color` 分配消除（`6f2411b`）
- **Chronos 粒子球修复**：TimerFace 高频区重构（`2f96df2`）

## 第二批：应用层治理（08-09，`a734883` 23 文件）

- 笔记投影优化：`useNoteEditor` 重构（133 行变更）、NotesPage/NoteEditPage/useNoteStore 订阅收窄
- 课堂内存与事件治理：`useClassroomAnalysis`/`useClassroomCapture`/`useClassroomEvents` 资源释放
- 全局订阅治理：whole-store 订阅拆分、effect 重注册修复（`1f2308b`）
- 3D 内存：`MemoryManager`/`SceneProvider` 资源管理增强

## 第三批：页面过渡（08-09 ~ 08-10）

- spring → CSS transition 替换 + 路由 chunk 预加载（`3d3a7f7`）
- showTime timer effect 清理（`2a5cf31`）
- 页面内容区 CSS stagger 入场动画（`a67fdf2`）

## 提交清单

`a67fdf2` `3d3a7f7` `2a5cf31` `1f2308b` `2f96df2` `0e9dc4a` `6f2411b` `5c3b01c` `0832b21` `1ec8b37` `a734883`