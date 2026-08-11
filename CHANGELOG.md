# 更新日志

本项目所有值得关注的变更都会记录在此文件中。
版本号遵循 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)，提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)。

## [0.35.2](https://github.com/Aparencia/Entropydecrease/compare/v0.35.1...v0.35.2) (2026-08-04)

### 🐛 缺陷修复

* **client:** 内测反馈五连修——导航竞态/剪贴板IPC/音频资源路径/番茄钟预设/ASR兼容 ([e54257d](https://github.com/Aparencia/Entropydecrease/commit/e54257d5f776e2d05deb74dddbdf113c7981a41b))

## [0.35.1](https://github.com/Aparencia/Entropydecrease/compare/v0.35.0...v0.35.1) (2026-08-04)

### 🐛 缺陷修复

* **seo:** 统一主域 301 重定向并添加百度站点验证文件 ([7b0ed0a](https://github.com/Aparencia/Entropydecrease/commit/7b0ed0a215f88503e0a05ef25e5ab0d8312b1ab1))

## [0.35.0](https://github.com/Aparencia/Entropydecrease/compare/v0.34.0...v0.35.0) (2026-08-04)

### ✨ 新功能

* **ai-gateway:** DeepSeek v4 Flash 统一接入与多 Key 轮询 + sync 幂等写入 ([cc41b6f](https://github.com/Aparencia/Entropydecrease/commit/cc41b6f6679f32d9e2d1c0638680f480299330a9))
* **ai,classroom:** streaming ASR/TTS, gateway refactor, handler IPC consolidation ([d60a239](https://github.com/Aparencia/Entropydecrease/commit/d60a23927a2fed09b57c68c0403d766c0b4f7a09))
* **assistant,ai-gateway,db:** 创新目录三/四/五部分增强落地 ([b721398](https://github.com/Aparencia/Entropydecrease/commit/b7213985026c723cbb32b9bad75923a10138b788))
* **audio,retention:** capture pipeline overhaul, FSRS retention, gateway hardening ([0cace68](https://github.com/Aparencia/Entropydecrease/commit/0cace6810bb683b2940b75c2277fedf968f4a822))
* **classroom:** P0 止血——错误四分类、降级/丢弃可见性与启动配置记忆 ([8b56d2c](https://github.com/Aparencia/Entropydecrease/commit/8b56d2c9ff5bb8b6300037ca7b81c5ee3894d15d))
* **classroom:** 热词/替换词表与本地持久化 ([1d9c491](https://github.com/Aparencia/Entropydecrease/commit/1d9c4918da6fe4005db5cd9e16082e82d7b6453e))
* **classroom:** 网关健康软阻断与应用内确认对话框 ([852ad2a](https://github.com/Aparencia/Entropydecrease/commit/852ad2a8f5bf3ebfe16b4129baf59f7f66c6cacf))
* **constellation:** 知识星座双轨渲染——纯函数派生图谱+DOM/SVG轨与3D轨按性能档切换（阶段B） ([a2875d4](https://github.com/Aparencia/Entropydecrease/commit/a2875d4ce6cee19ef9bbd1d60e73bbf30b3d9b3a))
* **mcp:** 学习记忆接口闭环——应用内授权开关与世界快照跨进程桥 ([5cb8427](https://github.com/Aparencia/Entropydecrease/commit/5cb8427591c83b1e7289f52439f287bffb8440ce))
* **mcp:** 学习记忆服务器主体落地（宪法P2第二批·内层防御） ([ff3f861](https://github.com/Aparencia/Entropydecrease/commit/ff3f8617ae2102e21bb6fe4447a44ac678167b4b))
* **mcp:** 知识图谱 MCP 工具与应用内演示剧本——learning_memory.knowledge_graph+三步引导+访问审计+快照事件同步（阶段C） ([e65035c](https://github.com/Aparencia/Entropydecrease/commit/e65035c50aa3f327a6e0ba832a2db5a454388bed))
* **notes,assistant,ai-gateway:** 修复内测三缺陷并批量落地创新功能增强 ([73d1d6b](https://github.com/Aparencia/Entropydecrease/commit/73d1d6bf78361e5908d2a06a2b2ea31445b97fb5))
* **ritual:** 模块仪式化页头与沉浸视觉升级——萤火海沟/秩序之井/深潜背景 ([38d0427](https://github.com/Aparencia/Entropydecrease/commit/38d04270ec77263c134e4abeada276bcdefd16c7))
* **settling:** 知识入籍闭环阶段A与审查修复 ([45c414e](https://github.com/Aparencia/Entropydecrease/commit/45c414ee4e918469f9f28069c5bf671c792389d4))
* **sovereignty:** 世界之书导出/恢复与数据主权页——worldExport纯函数+BDD测试、主权IPC（校验先行+事务幂等导入+FTS重建）、我的世界设置区块（阶段D） ([216d9c3](https://github.com/Aparencia/Entropydecrease/commit/216d9c3ac09372b348bc27f69c26b5042fa9e60a))
* **world:** 声景体系、疲劳共情与延时摄影开场（宪法P2收官） ([34ed940](https://github.com/Aparencia/Entropydecrease/commit/34ed940646293e526b1af52beb727696069c16a1))
* **world:** 混沌雾与秩序波纹（宪法P1第二批·熵可视化层） ([7057ce0](https://github.com/Aparencia/Entropydecrease/commit/7057ce069f7908896b9554ba9cf60da93e5f5c91))
* **world:** 潮汐节律与沉积地层（宪法P1第四批·叙事层C/D深海先行） ([77cfaf3](https://github.com/Aparencia/Entropydecrease/commit/77cfaf3f5eaae0a3be3235cf155cb63e9a2d4f3d))
* **world:** 熵可视化世界信号派生层与深海实体辉光接线（宪法P1第一批） ([795565b](https://github.com/Aparencia/Entropydecrease/commit/795565b0cb41225647309a5ac4faa3315bc7f0d5))
* **world:** 签名时刻三幕演出（宪法P1第三批·掌握一个概念） ([3165d00](https://github.com/Aparencia/Entropydecrease/commit/3165d00e93dc409399dcf7a1c8869c7e2a904767))
* **world:** 签名时刻可变重奏演出库（宪法P2第一批） ([57b2e43](https://github.com/Aparencia/Entropydecrease/commit/57b2e43e50f349be17d076c487bdd01b9a6639dc))
* **world:** 首潜创世时刻与世界数据回路闭合（宪法P1第五批） ([9238745](https://github.com/Aparencia/Entropydecrease/commit/9238745187a98476218f4a55d6c950693449f849))

### 🐛 缺陷修复

* **3d:** 深色模式 3D 场景不渲染修复——双 EffectComposer 渲染抢占收敛与场景过渡重写 ([1395058](https://github.com/Aparencia/Entropydecrease/commit/1395058f0d9731172cd4a0420d2812406b8a65e2))
* **3d:** 相机飞行视角错位与渲染循环冻结修复 ([c3be476](https://github.com/Aparencia/Entropydecrease/commit/c3be476e5f2083e4e8de5d9ed288c51d793b3949))
* **ai-gateway:** 清理基线 ruff 违规——移除未用变量/导入、import 移至顶部、修正无效 noqa 指令 ([05576ff](https://github.com/Aparencia/Entropydecrease/commit/05576ff451602e6ced54e703b33e52e179c5f846))
* **ai-queue:** 离线队列消费互斥锁与卡死记录恢复 ([75d2f26](https://github.com/Aparencia/Entropydecrease/commit/75d2f2694226f01876bf853055d6b266167a3650))
* **ai:** AI handler 增加 IPC 入参校验与宽松 JSON 解析 ([68dcd1b](https://github.com/Aparencia/Entropydecrease/commit/68dcd1bb72346d3a8d8c98f4b76f058570a58d48))
* **assistant,dashboard:** 修复 A3/A4 使用中高概率缺陷 ([e7fce42](https://github.com/Aparencia/Entropydecrease/commit/e7fce4266b09d5bbc795aca6f7f5b91ceb5f8dcc))
* **capture:** 采集链路竞态治理与健壮性加固 ([caf7cef](https://github.com/Aparencia/Entropydecrease/commit/caf7cef2f4e3456f7cf86454dab91b59486cdb64))
* **ci:** 为 changes job 显式声明 pull-requests 读权限，修复 Dependabot PR 路径检测必失败 ([56c1bfe](https://github.com/Aparencia/Entropydecrease/commit/56c1bfec4f7cc7fb2bab06afe57fd8dc1cb1215d))
* **feynman,flashcards,pomodoro,ai-gateway:** 修复代码审查发现的创新功能缺陷 ([3cc1f91](https://github.com/Aparencia/Entropydecrease/commit/3cc1f91c0e74a869a31a6a66f61527238d017b11))
* **gateway:** GLM flash 模型 max_tokens 上限 clamp 到 1024 ([950d54a](https://github.com/Aparencia/Entropydecrease/commit/950d54a36bcd5c1b46a440b1af6ce3babcb1ccb6))
* **pomodoro:** 计时全局调度解耦、墙钟校准与沉浸双视图叠加修复 ([875831c](https://github.com/Aparencia/Entropydecrease/commit/875831c299b5d29296649f883876e2dd47417024))
* **settling:** 审查修复——IPv6 SSRF 绕过/英文断行粘连/重试重复安放/响应体内存/完成计数 ([4a203b5](https://github.com/Aparencia/Entropydecrease/commit/4a203b56ec4c199f8530f661a6a18075e440c0a1))
* **sovereignty:** 审查修复——恢复表白名单扩展（world_snapshots/imports）+ 校验加固 + BOM/大小防御 + 超限提示 ([a1be346](https://github.com/Aparencia/Entropydecrease/commit/a1be346a5c60ff0fd4f662985c2e6ad57a782196))
* sync_resolve.go 编译错误 - 恢复事务内 seqNo 分配 ([490d5a5](https://github.com/Aparencia/Entropydecrease/commit/490d5a5cbbf08addf11ab2d3b0fc07f19bf2b6c9))
* **website:** 公安备案徽标按原尺寸展示避免缩放模糊 ([ee832ae](https://github.com/Aparencia/Entropydecrease/commit/ee832aea31d59e4a6b3fde92c7e320cceb3e8891))
* **world:** 审计修复——快照桥两处静默死链与签名时刻定时器泄漏 ([d85836d](https://github.com/Aparencia/Entropydecrease/commit/d85836d5cd3104c6633a62bf0164fde034371da1))
* 全仓库第二轮审计修复 - 四区域50项中等问题+5项严重 ([226259a](https://github.com/Aparencia/Entropydecrease/commit/226259a61ec48454c21bf3f4461eb796ad88c150))
* 全仓库逻辑合理性检修复 - 三阶段修复27项问题 ([5a2d504](https://github.com/Aparencia/Entropydecrease/commit/5a2d50491afa8d9a5a563336afa6a34d5cb88abb))

### ⚡ 性能优化

* **ui:** 细粒度 selector 订阅与键入防抖，消除整页连带重渲染 ([218f5a1](https://github.com/Aparencia/Entropydecrease/commit/218f5a1c7646f107eb2c7f43579ab92263000598))

## [0.34.0](https://github.com/Aparencia/Entropydecrease/compare/v0.33.1...v0.34.0) (2026-08-02)

### ✨ 新功能

* **assistant:** add AI deep-sea companion MVP — chat, proactive triggers, TTS, jellyfish avatar ([59ce053](https://github.com/Aparencia/Entropydecrease/commit/59ce053eec5b453e5bfa60d53154accfed3b8582))
* **classroom,feynman:** local ASR IPC groundwork, AI error retry, nginx health timeout ([2df5044](https://github.com/Aparencia/Entropydecrease/commit/2df50444af7c986f8f3993aca28dd1b38d2e75fc))

### 🐛 缺陷修复

* **ai-gateway:** register chat_router before streaming_router to avoid wildcard route shadowing ([1f97a54](https://github.com/Aparencia/Entropydecrease/commit/1f97a546814df39af76cb9d9af1724075a248b10))
* **assistant:** inject authToken and userApiKey into chat IPC call — resolves 401 ([4a188b5](https://github.com/Aparencia/Entropydecrease/commit/4a188b5c6e82b8437b7f7b55326c1ed4a2290952))
* **notes:** AI 摘要/闪卡使用完整文本，列表预览保留 120 字截断 ([68cd9f8](https://github.com/Aparencia/Entropydecrease/commit/68cd9f83dff442b9ff2a980ccbd2cfa0af8cbcb4))
* **sync-service:** add GetRedis() accessor — resolves undefined cache.GetRedis build error ([506db0a](https://github.com/Aparencia/Entropydecrease/commit/506db0af3140fd281fb3e9546be2ae42f62a5e4a))

## [0.33.1](https://github.com/Aparencia/Entropydecrease/compare/v0.33.0...v0.33.1) (2026-08-02)

### 🐛 缺陷修复

* **notes:** AI 摘要/闪卡使用完整文本，列表预览保留 120 字截断 ([5aee98c](https://github.com/Aparencia/Entropydecrease/commit/5aee98c6d26f67878fff02c457d2a6993829d4a3))

## [0.33.0](https://github.com/Aparencia/Entropydecrease/compare/v0.32.0...v0.33.0) (2026-08-02)

### ✨ 新功能

* **audio:** 替换白噪音音源为真实自然声景（11轨×5分钟循环） ([09a3ee7](https://github.com/Aparencia/Entropydecrease/commit/09a3ee7abffb3f862072eef5c3ee6d255040fcac))
* **feynman:** AI 反馈持久化 + 用户反馈五问题修复 ([f824547](https://github.com/Aparencia/Entropydecrease/commit/f82454771a83092c1c3bd4f103787a7aa0903550))

## [0.32.0](https://github.com/Aparencia/Entropydecrease/compare/v0.31.0...v0.32.0) (2026-08-01)

### ✨ 新功能

* **ai-gateway:** Phase1-4 优化 — 多Key池化/熔断器/Prompt防护/成本追踪/语义缓存/OTel ([5cb26f4](https://github.com/Aparencia/Entropydecrease/commit/5cb26f44b15f9c61e0edda6a4be93b67cb80c9d1))
* **ai:** P2-11 激活离线 AI 队列（生命周期引导+摘要离线入队联网重放） ([03de962](https://github.com/Aparencia/Entropydecrease/commit/03de962710acd12c528e5b573b24a7ea69ba41fd))
* **ai:** P2-12 摘要流式输出 UI 落地（渐进显示+失败降级非流式） ([b8e9a84](https://github.com/Aparencia/Entropydecrease/commit/b8e9a84c574031647215f9f58a102639551e92b7))
* **notes:** 思维导图编辑器落地（React Flow+dagre 可交互导图，消除 mindmap 名实不副） ([f27d21d](https://github.com/Aparencia/Entropydecrease/commit/f27d21d4523aa0318e264e3c90c0737092e4ebe3))
* **notes:** 阶段三自由画布 OneNote 式核心墨迹（钢笔/荧光笔/橡皮擦 + SVG 平滑笔画 + 色板笔粗） ([c4cd821](https://github.com/Aparencia/Entropydecrease/commit/c4cd8219984269b026dd9c933beaf8af877ba825))
* **notes:** 阶段二双向链接（[[ wiki-link 自动补全 + 反向链接面板 + noteLinks 索引 + React Flow 笔记图谱） ([db7c1f8](https://github.com/Aparencia/Entropydecrease/commit/db7c1f8ab0af26456b95b01f42818d1153899fd7))
* **notes:** 阶段四 Markdown 往返（tiptap-markdown 导出/导入，导图降级大纲，wikiLink 转文本） ([318470e](https://github.com/Aparencia/Entropydecrease/commit/318470e3bbd8f7350844ca5fa5cc98b08ab3204b))
* **performance:** 三档性能模式（静谧/从容/澎湃）与渲染开销优化 ([4411656](https://github.com/Aparencia/Entropydecrease/commit/441165677aa04fe85612c252c32ba0337b613266))
* **settings:** P3-18 内置性能诊断面板（FPS/CPU/内存实时采集+一键复制上报） ([dd2d66d](https://github.com/Aparencia/Entropydecrease/commit/dd2d66df2e78387bc8cf26010f0cc1dd59204c37))
* 本地 ASR 引擎 + 留存系统 + 奖赏组件 + 主题闪烁修复 + 3D 导航优化 ([ad788fe](https://github.com/Aparencia/Entropydecrease/commit/ad788fe6ab146fbd135cea1a575e16df65e1b66a))

### 🐛 缺陷修复

* **capture:** 限制关键帧 base64 内存保留，修复长时间采集内存无界增长 ([ed2e656](https://github.com/Aparencia/Entropydecrease/commit/ed2e656fae3e10eef152f3161ad7d78a8ed84f4b))
* **notes:** 修复表格/任务列表样式失效（TipTap v3 补 tiptap 类 + --kb-border 变量） ([aa9d3bb](https://github.com/Aparencia/Entropydecrease/commit/aa9d3bbb6a58d9cb97335eb8c93d39b1bc921886))

### ⚡ 性能优化

* **3d:** P3-15 粒子系统按 tier 跳帧更新（降 sin/cos 逐粒子开销） ([608bfed](https://github.com/Aparencia/Entropydecrease/commit/608bfedc136210931e67beac287bee971ed7a491))
* **ai-gateway:** P2-13 流式输出加首 token/chunk 空闲超时保护 ([651c2c6](https://github.com/Aparencia/Entropydecrease/commit/651c2c6e17a7da46977f021ea748652296b62518))
* **flashcards:** P1-8 当日复习数改用 reviewedAt 索引查询 ([d6a852e](https://github.com/Aparencia/Entropydecrease/commit/d6a852ec0672af315036612288c15c71cc3daba9))
* **notes:** P1-7 笔记列表过滤/标签/选中结果 useMemo 缓存 ([6b2679d](https://github.com/Aparencia/Entropydecrease/commit/6b2679dd6cec2b5a55564b8a80eafc0408377f47))
* **notes:** P2-10 笔记图片插入压缩降采样+懒加载（控内嵌 base64 体积） ([095af9c](https://github.com/Aparencia/Entropydecrease/commit/095af9c054c3389faf1852f7a800bf9c438f41df))
* P0 性能修复（内存泄漏 + 打字卡顿 + 冗余 RAF） ([fb33cbe](https://github.com/Aparencia/Entropydecrease/commit/fb33cbe00cc79ee14ed7b00664fed7e85d327e44))
* P1 性能优化（后处理分档 + 定时器清理 + 细粒度订阅） ([39c4614](https://github.com/Aparencia/Entropydecrease/commit/39c46140dea87117268ba37850bd4689317c3155))
* P3 性能优化（base64 分块编码 + AI token 缓存） ([976ad27](https://github.com/Aparencia/Entropydecrease/commit/976ad27c905978e0bcd1ee4f231b781f2ed5bf6f))
* **pomodoro:** P3-19 memo 化（CycleMarkers + 预设标签栏抽取，避免每秒重渲染） ([7dc119e](https://github.com/Aparencia/Entropydecrease/commit/7dc119efa45d537c4b8396d7991f5ad1e0b3afa1))
* **storage:** P2-14 v20 存量迁移——旧会话内嵌 segments 物理搬迁至独立表 ([0e9c98d](https://github.com/Aparencia/Entropydecrease/commit/0e9c98d4b7c07fefbe87fee514c4ebcb73480c27))
* **storage:** P2-14 采集片段拆分独立表（addSegment 原子追加，旧数据回退兼容） ([dd2a056](https://github.com/Aparencia/Entropydecrease/commit/dd2a0562718e94b09df579b9190adbc740a4df1a))

## [0.31.0](https://github.com/Aparencia/Entropydecrease/compare/v0.30.2...v0.31.0) (2026-08-01)

### ✨ 新功能

* **dashboard:** 首页统计与知识预览卡片支持点击跳转 ([35ac62e](https://github.com/Aparencia/Entropydecrease/commit/35ac62e76a652fd49372e6b033f25979d0737307))
* **pomodoro:** 番茄钟模式预设自定义与周期标记 ([945ca57](https://github.com/Aparencia/Entropydecrease/commit/945ca578cd5bc8b611ba5b2c65fca5461295a434))

### 🐛 缺陷修复

* **pomodoro:** 修复目标跳过退化为取消致空目标番茄无法启动 ([c47bdc7](https://github.com/Aparencia/Entropydecrease/commit/c47bdc7ac6ee1889b56c759a70a857adafe33f1f))

## [0.30.2](https://github.com/Aparencia/Entropydecrease/compare/v0.30.1...v0.30.2) (2026-08-01)

### 🐛 缺陷修复

* **3d:** canvas 层级提至 z-0，修复概览模式点击被根布局 div 拦截 ([168df42](https://github.com/Aparencia/Entropydecrease/commit/168df42061b204c317b7edf7d60169bbf52ceba0))
* **3d:** 概览模式常驻显示模块标签与功能副标题，解决 3D 物体无法对应到功能 ([b605a6f](https://github.com/Aparencia/Entropydecrease/commit/b605a6fef95cf3f08c57332995487e722a535ea1))
* **3d:** 移除晨曦穹顶场景重复的行星系统，导航行星统一由 SpatialNav 渲染 ([ff67320](https://github.com/Aparencia/Entropydecrease/commit/ff6732042ae5ae2a0bc19c41cf67c32c194673dc))

### ⚡ 性能优化

* **3d:** 性能分级引入滞回+持续判定+后台重置，消除 tier 抖动；清理无效跳帧死代码 ([8851a1f](https://github.com/Aparencia/Entropydecrease/commit/8851a1f9e96c9a93f82ebee2f472a0d136bb0cb4))

### ♻️ 重构

* **3d:** 性能监控迁移至 drei PerformanceMonitor 成熟方案 ([72e584f](https://github.com/Aparencia/Entropydecrease/commit/72e584f4198e437122b1e83c2495fdbbe644b355))
* **3d:** 抽取 tier 迁移策略为纯函数模块 tierPolicy 并补充 BDD 单测 ([1602c72](https://github.com/Aparencia/Entropydecrease/commit/1602c7298f08c481fe3c493b1bfe689b67f4e29a))

## [0.30.1](https://github.com/Aparencia/Entropydecrease/compare/v0.30.0...v0.30.1) (2026-07-31)

### 🐛 缺陷修复

* **build:** 修复 CI 编译原生模块失败（旧版 node-gyp 找不到 VS 2022） ([a5d8f3b](https://github.com/Aparencia/Entropydecrease/commit/a5d8f3b9459ee13263bdd14acc55bd30a698c03f))

## [0.30.0](https://github.com/Aparencia/Entropydecrease/compare/v0.29.0...v0.30.0) (2026-07-31)

### ✨ 新功能

* **audio:** 原生模块支持流式采集（采集线程 + ThreadSafeFunction） ([b368bf8](https://github.com/Aparencia/Entropydecrease/commit/b368bf873daf8ac70e517650ffb9dbe65143de72))
* **audio:** 接入进程环回 Provider 与构建链路（Phase 2，flag 默认关） ([bc37a96](https://github.com/Aparencia/Entropydecrease/commit/bc37a960edbbde50b3fde509429304426f193b8f))
* **audio:** 进程环回采集原生模块 Phase 1 可行性验证 + ADR-001 ([be0f090](https://github.com/Aparencia/Entropydecrease/commit/be0f09009ce6b0d3649e22836b5176d85613b889))
* **audio:** 进程环回默认启用 + 设置页音频源选择（Phase 3） ([4006a92](https://github.com/Aparencia/Entropydecrease/commit/4006a929a7f5c1cefa3a50dfe12e2ba5990e1418))

### ♻️ 重构

* **audio:** 引入 AudioSourceProvider 抽象层（Phase 0，零行为变更） ([d41773d](https://github.com/Aparencia/Entropydecrease/commit/d41773d5fba0622fc7845442fc6a5c03167e8ff6))

## [0.29.0](https://github.com/Aparencia/Entropydecrease/compare/v0.28.12...v0.29.0) (2026-07-31)

### ✨ 新功能

* **onboarding:** First Dive 新手引导系统与新手期双标签导航 ([030ac80](https://github.com/Aparencia/Entropydecrease/commit/030ac80a361da01ce4a73cfd002d66f4af39c9f6))

### 🐛 缺陷修复

* **auth:** 修复邮箱验证跳转死页面、重置密码链接失效与登录循环 ([213969c](https://github.com/Aparencia/Entropydecrease/commit/213969c68be22dffce8192ac0d5b805eef8d0532))
* **classroom:** 修复精细采集三症状——视觉抓页面元数据、ASR静音幻觉、截断JSON泄漏 ([0e27603](https://github.com/Aparencia/Entropydecrease/commit/0e27603f15966e98e8e3c96a5b1ff69acf2a27e5))
* **pomodoro:** 修复周期计数无重置路径与副作用双重执行 ([ed9e5d7](https://github.com/Aparencia/Entropydecrease/commit/ed9e5d7779226b62a456d3497df9c9388bbfc3c5))
* **ui:** 修复 Tailwind var() 令牌色透明度修饰符静默失效致弹窗全透明 ([a3a4e18](https://github.com/Aparencia/Entropydecrease/commit/a3a4e1802c59fb06d031d6808a14d6217230a614))
* **window:** 最小化时任务栏右键关闭无响应 ([b0f90e1](https://github.com/Aparencia/Entropydecrease/commit/b0f90e148d13991fabd9feb7326f6b6064be5075))

## [0.28.12](https://github.com/Aparencia/Entropydecrease/compare/v0.28.11...v0.28.12) (2026-07-31)

### 🐛 缺陷修复

* **build:** 提交 .env.production 入库并增加构建期环境变量防护 ([cbd3ed8](https://github.com/Aparencia/Entropydecrease/commit/cbd3ed8b4e2e855545e2c7d237d5b10606e63ee3))

## [0.28.11](https://github.com/Aparencia/Entropydecrease/compare/v0.28.10...v0.28.11) (2026-07-31)

### 🐛 缺陷修复

* **website:** 下载引导按钮文案改为「前往下载」消除误导 ([24a6eff](https://github.com/Aparencia/Entropydecrease/commit/24a6eff371e77e6e6dc6e7dd03b5f050501a0d1d))

## [0.28.10](https://github.com/Aparencia/Entropydecrease/compare/v0.28.9...v0.28.10) (2026-07-31)

### 🐛 缺陷修复

* **release:** aliyun CLI 改用 profile 携带凭证 ([e4bed9b](https://github.com/Aparencia/Entropydecrease/commit/e4bed9b689576a33d466e87bf64978b6060b9129))

## [0.28.9](https://github.com/Aparencia/Entropydecrease/compare/v0.28.8...v0.28.9) (2026-07-31)

### 🐛 缺陷修复

* **release:** 改用改写配置文件替代 -c.publish.0.url 覆盖更新源 ([880f7cc](https://github.com/Aparencia/Entropydecrease/commit/880f7ccc100493456395afeb2eeae56676a8dc01))

## [0.28.8](https://github.com/Aparencia/Entropydecrease/compare/v0.28.7...v0.28.8) (2026-07-31)

### 🐛 缺陷修复

* **release:** 校验发布资产完整性以根治静默的空 Release ([f01dc6b](https://github.com/Aparencia/Entropydecrease/commit/f01dc6be6f61b534d87f21560572491abdfa0baf))

## [0.28.7](https://github.com/Aparencia/Entropydecrease/compare/v0.28.6...v0.28.7) (2026-07-31)

### ⚡ 性能优化

* **cdn:** 放宽源站限流并新增 OSS 源站同步以加速预热 ([3b05789](https://github.com/Aparencia/Entropydecrease/commit/3b057897c695ea7c1a737fa24d39ab7b9141c0c3))

## [0.28.6](https://github.com/Aparencia/Entropydecrease/compare/v0.28.5...v0.28.6) (2026-07-31)

### 🐛 缺陷修复

* **nginx:** HTTP 下放行域名验证与 ACME 挑战路径 ([286e36d](https://github.com/Aparencia/Entropydecrease/commit/286e36dfb231f5f901524e20cc912958366abef3))

## [0.28.5](https://github.com/Aparencia/Entropydecrease/compare/v0.28.4...v0.28.5) (2026-07-31)

### ⚡ 性能优化

* **download:** 阶段0 下载提速——BBR、并发兼容与多线程下载引导 ([f7aa5c3](https://github.com/Aparencia/Entropydecrease/commit/f7aa5c302eb196748ad7c5761e007658d5377519))

## [0.28.4](https://github.com/Aparencia/Entropydecrease/compare/v0.28.3...v0.28.4) (2026-07-30)

### 🐛 缺陷修复

* **ci:** 官网部署启用 Git LFS 以拉取真实图片 ([889e609](https://github.com/Aparencia/Entropydecrease/commit/889e609136bc868e93f57c412229a508ed7bd402))

## [0.28.3](https://github.com/Aparencia/Entropydecrease/compare/v0.28.2...v0.28.3) (2026-07-30)

### 🐛 缺陷修复

* **release:** checkout 启用 Git LFS 以拉取真实 app-icon.png ([a47bda1](https://github.com/Aparencia/Entropydecrease/commit/a47bda12ea3c03e01408802035a9302fbdeaf71f))

## [0.28.2](https://github.com/Aparencia/Entropydecrease/compare/v0.28.1...v0.28.2) (2026-07-30)

### 🐛 缺陷修复

* **release:** 解除 Windows Defender 对 rcedit 的文件锁并禁用 electron-builder 自发布 ([e009f53](https://github.com/Aparencia/Entropydecrease/commit/e009f5399cea6c0e25594ff666ad93dc44dc0897))

## [0.28.1](https://github.com/Aparencia/Entropydecrease/compare/v0.28.0...v0.28.1) (2026-07-30)

### 🐛 缺陷修复

* **release:** 移除 macOS 构建腿以解除发版阻塞 ([afd0af7](https://github.com/Aparencia/Entropydecrease/commit/afd0af78867cfd433f4934d4cb38f474abb7c028))

## [0.28.0](https://github.com/Aparencia/Entropydecrease/compare/v0.27.0...v0.28.0) (2026-07-30)

### ✨ 新功能

* **release:** 安装包自建服务器托管——下载页直链与自动更新双源 ([9bb9061](https://github.com/Aparencia/Entropydecrease/commit/9bb9061bec53792e24ca9345970eddc1d0e2e081))

## [0.27.0](https://github.com/Aparencia/Entropydecrease/compare/v0.26.0...v0.27.0) (2026-07-30)

### ✨ 新功能

* **classroom:** 回声定位页面布局优化与窗口选择增强 ([aca2166](https://github.com/Aparencia/Entropydecrease/commit/aca21668c68700c194d21ae315a41080d17c5281))
* **dashboard:** 学习启动仪式体验重塑 v0.26.0 ([b91bd17](https://github.com/Aparencia/Entropydecrease/commit/b91bd17c27496483ae644aac2787ba6ea987665f))

### 🐛 缺陷修复

* **classroom:** 优化音频捕获回退与显示媒体处理 ([61d16e8](https://github.com/Aparencia/Entropydecrease/commit/61d16e859f327dc6416ef159c834091fafa3bb11))

## [0.26.0](https://github.com/Aparencia/Entropydecrease/compare/v0.25.0...v0.26.0) (2026-07-30)

### ✨ 新功能

* **classroom:** 增强课堂会话分析管线（关键帧存储/帧去重/多模态优化） ([8733c87](https://github.com/Aparencia/Entropydecrease/commit/8733c87d89b2fe602abb0b0c7b0f70bcecf942d8))

### 🐛 缺陷修复

* **ai-gateway:** 修复 ASR 降级链断裂与 Redis 配置未生效 ([f7ddf96](https://github.com/Aparencia/Entropydecrease/commit/f7ddf96c388587986e006654ec867cab825fa95d))
* **classroom:** 修复音频捕获静音无回退与仅音频模式误截图 ([dd996ba](https://github.com/Aparencia/Entropydecrease/commit/dd996ba57cb6b938a2b8556ac79533c55805bb5a))

## [0.25.0](https://github.com/Aparencia/Entropydecrease/compare/v0.24.0...v0.25.0) (2026-07-30)

### ✨ 新功能

* 熵减 Entropydecrease 品牌迁移与全仓规范化重构 ([baae5e7](https://github.com/Aparencia/Entropydecrease/commit/baae5e7ccbe2c2a793f89967322ca751a24ff4be))

### 🐛 缺陷修复

* **ai-gateway:** 修复 learning 端点运行时 NameError 并使 ruff/pytest 全绿 ([ea1c43b](https://github.com/Aparencia/Entropydecrease/commit/ea1c43b93ac320b8bd84997bbd11ebcc57d77599))
* **ci:** 发版工作流改用 RELEASE_TOKEN 以绕过 main 分支保护 ([75c6fe9](https://github.com/Aparencia/Entropydecrease/commit/75c6fe99171da3f4e8cdf699b1ea886e19feff02))
* **ci:** 放开 commitlint body/footer 行长限制，修复发版提交被自拦截 ([b1583c4](https://github.com/Aparencia/Entropydecrease/commit/b1583c4e8748bf45549c0915b76ab766bc8a4ee3))
* **ci:** 部署工作流对齐真实服务器结构并修复三处失效缺陷 ([3b71f35](https://github.com/Aparencia/Entropydecrease/commit/3b71f358d97f02b57a1549767ec81808b1b3b244))
* **client:** 修复测试挂起与 sm2 边界，客户端测试首次全绿 ([168e99e](https://github.com/Aparencia/Entropydecrease/commit/168e99ec2eb9fd050a1d8cf4d94c38b168209580))
* 补齐迁移遗漏的客户端资产与 nginx ASR 路由代理 ([c15c8ac](https://github.com/Aparencia/Entropydecrease/commit/c15c8acbe5584a737e5cb18e4877514e8f561df3))

# 更新日志

本项目所有值得关注的变更都会记录在此文件中。
版本号遵循 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)，提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)。

## [0.23.0](https://github.com/Aparencia/KeBan/compare/v0.22.0...v0.23.0) (2026-07-28)

### ✨ 新功能

* v0.21.0 — 许可证变更为 BUSL 1.1 与快捷方式设置优化 ([601d2a8](https://github.com/Aparencia/KeBan/commit/601d2a80fe62078d66b068f82139aad8302a71de))

## [0.22.0](https://github.com/Aparencia/KeBan/compare/v0.21.0...v0.22.0) (2026-07-28)

### ✨ 新功能

* v0.20.1 — 课堂笔记插入、3D 安全合成器与捕获系统优化 ([0267a27](https://github.com/Aparencia/KeBan/commit/0267a2799fcbb15fc3aaf93e1e33aa45f42ba1ec))

## [0.21.0](https://github.com/Aparencia/KeBan/compare/v0.20.1...v0.21.0) (2026-07-28)

### ✨ 新功能

* **website:** add Baidu site verification meta tag ([858666f](https://github.com/Aparencia/KeBan/commit/858666f1a4afb5221e4b73883d8ffa48b467e899))

## [0.20.1](https://github.com/Aparencia/KeBan/compare/v0.20.0...v0.20.1) (2026-07-27)

### 🐛 缺陷修复

* **ci:** 部署后重启Nginx容器修复bind mount失效导致的403 ([babb5e8](https://github.com/Aparencia/KeBan/commit/babb5e8b6b7a2934bf2da8f79564ea1cbd3499b6))

## [0.20.0](https://github.com/Aparencia/KeBan/compare/v0.19.0...v0.20.0) (2026-07-27)

### ✨ 新功能

* v0.18.0 — 官网 SEO 优化、支持页面与赞助二维码 ([0a332f1](https://github.com/Aparencia/KeBan/commit/0a332f1e5a51a2a721849209d18bb642c509a59a))

## [0.19.0](https://github.com/Aparencia/KeBan/compare/v0.18.0...v0.19.0) (2026-07-27)

### ✨ 新功能

* v0.17.1 — CRDT 协同引擎、FSRS 调度器、AI 流式传输与全模块增强 ([231ab19](https://github.com/Aparencia/KeBan/commit/231ab19c27c46cfd597c2febdc627b4ea425cf8e))

## [0.18.0](https://github.com/Aparencia/KeBan/compare/v0.17.1...v0.18.0) (2026-07-27)

### ✨ 新功能

* v0.17.0 — 课堂模块组件化、课程智能检测与多模态分析增强 ([9f2cf56](https://github.com/Aparencia/KeBan/commit/9f2cf5678da78185335edfed629cf6b06967ea25))

## [0.17.1](https://github.com/Aparencia/KeBan/compare/v0.17.0...v0.17.1) (2026-07-26)

### 🐛 缺陷修复

* **classroom:** 智能采集语音识别流式化+merge降级+去重复传输 ([cd26df0](https://github.com/Aparencia/KeBan/commit/cd26df0b6cce555908108fb9faa5204396aa2ec1))

## [0.17.0](https://github.com/Aparencia/KeBan/compare/v0.16.0...v0.17.0) (2026-07-25)

### ✨ 新功能

* **classroom:** 课堂助手模式UI优化、窗口智能识别与笔记生成加速 ([aad3c6c](https://github.com/Aparencia/KeBan/commit/aad3c6c9680501c52384f6fc3d656d5f0d39645d))

## [0.16.0](https://github.com/Aparencia/KeBan/compare/v0.15.0...v0.16.0) (2026-07-25)

### ✨ 新功能

* v0.15.1 — Ollama 本地模型接入、AI 处理器重构与认证体系增强 ([8bcad71](https://github.com/Aparencia/KeBan/commit/8bcad7141c270f5ec585f3ea3587d18aa4f01b57))
