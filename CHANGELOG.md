# 更新日志

本项目所有值得关注的变更都会记录在此文件中。
版本号遵循 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)，提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)。

## [0.39.0](https://github.com/Aparencia/Entropydecrease/compare/v0.38.0...v0.39.0) (2026-08-16)

### ✨ 新功能

* **pwa:** 移动端下载 A+B（iOS 安装引导 + Android TWA APK 构建/官网下载入口） ([6d7fe72](https://github.com/Aparencia/Entropydecrease/commit/6d7fe72e6ba56dc3c323a037fba28cf36b83bd54))

## [0.38.0](https://github.com/Aparencia/Entropydecrease/compare/v0.37.0...v0.38.0) (2026-08-16)

### ✨ 新功能

* **ai:** AI 配额常驻显示与 429 全局提示（标题栏胶囊/用量卡增强/quotaStore） ([5312345](https://github.com/Aparencia/Entropydecrease/commit/5312345d9ff73324903a2985b603422bbdf0f03d))
* **classroom:** P0-1 识别评估基线工具（CER + 热词命中率 + 语料规范） ([d72b920](https://github.com/Aparencia/Entropydecrease/commit/d72b920f62a324305e024ec45b3c8921004999e5))
* **classroom:** P0-2 Silero VAD 升级（主进程 onnxruntime + 渲染精判集成） ([8d28984](https://github.com/Aparencia/Entropydecrease/commit/8d28984613099a7fbe1ba6d0816f7e723d04d596))
* **classroom:** P0-3 真实置信度与低置信度质量门控 ([6652b7f](https://github.com/Aparencia/Entropydecrease/commit/6652b7ff67722a0aa8e33b946f00f05b0a60c417))
* **classroom:** P0-7 识别统计条（引擎徽标+帧数+句数+VAD状态） ([980ea39](https://github.com/Aparencia/Entropydecrease/commit/980ea39e8630b71845cd7857369137604a607f31))
* **classroom:** P1-1 两遍重打分（SenseVoice 整句复核） ([6ea6f0e](https://github.com/Aparencia/Entropydecrease/commit/6ea6f0ed92e93bdcc8be2690d7ffc510577409c6))
* **classroom:** P1-2 动态热词闭环 + P1-3 修正回写 + P1-8 漏捕检测/手动补截 ([9a52e84](https://github.com/Aparencia/Entropydecrease/commit/9a52e84bd83403be02dadaca23cf9f3334366c2d))
* **classroom:** P1-4 说话人手动重识别 + P1-5 中英混说 spike ([3296c4d](https://github.com/Aparencia/Entropydecrease/commit/3296c4dd6be1bef264a20a20438b942bb0b43bb9))
* **classroom:** P1-6 内容类型感知 + P1-7 指令句补帧 + P1-9 实时截图流 ([45caf98](https://github.com/Aparencia/Entropydecrease/commit/45caf98960920dd0d1aa74bf5941eb54a7d2a710))
* **classroom:** P2-1 本地OCR完整实现（PP-OCRv5 det/rec 联调验证） ([015ce93](https://github.com/Aparencia/Entropydecrease/commit/015ce93dbe4dc15a6ae97f4cc9a05c84032fba1d))
* **classroom:** P2-1 本地OCR骨架 + P2-2/3/5/6 集成文档 ([69d4fad](https://github.com/Aparencia/Entropydecrease/commit/69d4fad8035d28fec18cd52bc8c1b3f1bb6864cb))
* **classroom:** P2-4 采集期时间轴对齐（结果时间戳改用采集时刻） ([d29a79b](https://github.com/Aparencia/Entropydecrease/commit/d29a79b8eade980f6b52bac3ea8ca8938bd84ef9))
* **classroom:** P2-7 步骤化笔记 + P2-8 步骤复习联动 ([19b03e1](https://github.com/Aparencia/Entropydecrease/commit/19b03e17f2779db69665514d7a0c57169f224d29))
* **electron:** 主进程 AI 请求 429 配额耗尽事件推送（gatewayHttp/Stream/preload） ([b73a088](https://github.com/Aparencia/Entropydecrease/commit/b73a088c9258f1415367be1b4ca7522468d2906f))
* merge dev with window-recognition optimization (14 commits) ([351ccc4](https://github.com/Aparencia/Entropydecrease/commit/351ccc410ec66e369f60eb98dd31f50b3c1b4c27))
* **pwa:** M1 Task1 - PWA manifest 完善（lang zh-CN + iOS 图标与 meta） ([af50f1e](https://github.com/Aparencia/Entropydecrease/commit/af50f1ecb2fcfd39168c5624882963cf0c17def9))
* **pwa:** M1 Task2 - BottomNav 增加课堂助手入口 ([fc18a89](https://github.com/Aparencia/Entropydecrease/commit/fc18a898c3f233076db1ead2bef8b1dc1c190345))
* **pwa:** M1 Task3 - iOS Safari 细节（text-size-adjust/防缩放/100dvh） ([f9c0636](https://github.com/Aparencia/Entropydecrease/commit/f9c063619388fa15452ec5674db8dfecf3ee991f))
* **pwa:** M2 Task7 - 剪藏浏览器替代（fetch+DOMParser）+ PDF 明确降级提示 ([03eef25](https://github.com/Aparencia/Entropydecrease/commit/03eef255fa7ecc6678bf18b95d0e0b9746294ae0))
* **pwa:** M3 Task10 - 视频转笔记（浏览器上传 + 抖音链接引导） ([81cbd42](https://github.com/Aparencia/Entropydecrease/commit/81cbd42a9009ba2c8e3677f1c3e2e9380cf7ecbc))
* **pwa:** M3 Task11 - 课堂会话页响应式布局（移动端 flex-col + 左栏限高） ([4505ae9](https://github.com/Aparencia/Entropydecrease/commit/4505ae9c6c179ac821786c5807672d6b55d87c58))
* **pwa:** M3 Task9 - WebCaptureAdapter 麦克风应急通道 + 会话启停 PWA 分支 ([c0aeeb1](https://github.com/Aparencia/Entropydecrease/commit/c0aeeb14ffb47566aa9931bc58890578d49f5002))
* **server:** 开发者白名单生产透传与配额端点无限展示（DEV_USER_IDS） ([49f9abf](https://github.com/Aparencia/Entropydecrease/commit/49f9abf2d6b427c4a57acd6a175ddd97b743fbf6))
* **website:** 下载页与 FAQ 补充移动端 PWA 入口（/pwa/ 即开即用） ([c237f7d](https://github.com/Aparencia/Entropydecrease/commit/c237f7d5ca9262efe206d7291910796159327311))
* **window-recognition:** native 扩展窗口几何/置顶/前台HWND枚举 ([a6a78f7](https://github.com/Aparencia/Entropydecrease/commit/a6a78f72bc106b2fa5d88dbf8b42e8de622ea196))
* **window-recognition:** UI理由展示+内容分类进程信号+监听diff含标题变化 ([b7c02b0](https://github.com/Aparencia/Entropydecrease/commit/b7c02b055bcdf6b32832658a0386716b02967c23))
* **window-recognition:** WindowInfo 类型扩展（置信度/理由/记忆课程名） ([38b745c](https://github.com/Aparencia/Entropydecrease/commit/38b745cc06366736f252a943d5062d1122688e69))
* **window-recognition:** windowScorer 组合入口（信号注入+记忆查找，导出兼容） ([0a4a6e1](https://github.com/Aparencia/Entropydecrease/commit/0a4a6e12fbefafe072754e168453dcbfae2d4b22))
* **window-recognition:** 完整信号注入（进程/几何/前台窗口，native缺失降级） ([2e36c5e](https://github.com/Aparencia/Entropydecrease/commit/2e36c5ef77aae84f99bcedfa5c60ef3d50b521d0))
* **window-recognition:** 窗口信号层（HWND解析/几何计算，注入式可测） ([f4cdd7f](https://github.com/Aparencia/Entropydecrease/commit/f4cdd7f81ac9dfd8131e0744ad766ebf35c33583))
* **window-recognition:** 窗口双向评分规则纯函数（学习意图正信号↔娱乐负分） ([15f7839](https://github.com/Aparencia/Entropydecrease/commit/15f7839c68088dae445bb51c2afe61b2c47ae138))
* **window-recognition:** 窗口选择记忆层（标题模板hash+boost+LRU） ([0885f86](https://github.com/Aparencia/Entropydecrease/commit/0885f8662da38d0730cda7865bf6c812e8659301))
* **window-recognition:** 自动选中三规则与记忆课程名回填 ([e91ff7c](https://github.com/Aparencia/Entropydecrease/commit/e91ff7ca5f997cae035159cc29470b351bd74117))
* **window-recognition:** 记忆IPC通道与评分boost接入 ([ad29419](https://github.com/Aparencia/Entropydecrease/commit/ad29419b26de5fe22294dc04fe7f98f80a4a9a68))

### 🐛 缺陷修复

* **ai-gateway:** ruff 自动修复 license_webhook 未使用导入 ([07efa72](https://github.com/Aparencia/Entropydecrease/commit/07efa72859475e9626c0a10427059d7067bf52a0))
* **ai-gateway:** 安全/熔断路径静默放行补 warning 日志（prompt_guard/input_validation/key 轮换/熔断标记） ([fc25a4a](https://github.com/Aparencia/Entropydecrease/commit/fc25a4a9482efe6985eb4204776f8c956344a672))
* **ci:** lint-staged oxlint 显式指定 client/.oxlintrc.json，pre-commit 与 CI 规则集一致 ([b098898](https://github.com/Aparencia/Entropydecrease/commit/b0988985f98ee6f9d7ae34404852a50dea6c87b8))
* **classroom:** P0-4/P0-5/P0-6 离线ASR重复/CPU/准确率修复 ([75f3f70](https://github.com/Aparencia/Entropydecrease/commit/75f3f704909860e5c75b2d5357fbb9873e906ce8))
* **deps:** 升级 react-router-dom 7.18.2（RSC CSRF）与 dompurify 3.4.13（XSS） ([3be24cc](https://github.com/Aparencia/Entropydecrease/commit/3be24cccbe2f6352a0d73c935ade8d893bd6fccb))
* **env:** 补全 .env.example 缺失变量并转发 prod compose 环境变量 ([62807ae](https://github.com/Aparencia/Entropydecrease/commit/62807ae165ca6d53418059f75fc7ce4428eecca1))
* **feynman:** convertedCount 复制粘贴 bug——新增 converted 字段区分已转闪卡与已掌握 ([dedadf3](https://github.com/Aparencia/Entropydecrease/commit/dedadf3bae47face28fd64fb840623b267f74901))
* **pwa:** 修复逻辑审查三处问题（尾段丢失/暂停未接、视频上传401/429、剪藏截断） ([4dbb92e](https://github.com/Aparencia/Entropydecrease/commit/4dbb92e42a856cbe3add652d83d3e8ae68e532cb))
* **server:** requirements 版本锁定，CI go 版本对齐 go.mod，删除 dead proto，conftest 补 [@ai-context](https://github.com/ai-context) ([e6629ee](https://github.com/Aparencia/Entropydecrease/commit/e6629ee402deb6ce10c32416fd514c3ae2e0cf4f))
* **sync:** 全部 goroutine 启动点加 panic 防护（GoSafe/goSafe），防单协程异常击穿进程 ([0de78f3](https://github.com/Aparencia/Entropydecrease/commit/0de78f3e868663539c5ce90259c0c0940c0b2ff6))
* **website:** 公安备案徽标补尺寸并抑制 no-img-element 误报 ([5c38066](https://github.com/Aparencia/Entropydecrease/commit/5c3806621297ce17ac6b07d594349fb5f7c1b0b9))
* **window-recognition:** classifyContent 接入 processName 信号（连接 contentClassifier 进程名兜底） ([54d41f6](https://github.com/Aparencia/Entropydecrease/commit/54d41f6233888831ea071d19fbeaf877ca4d003e))
* **window-recognition:** iqiyi/youku 移入娱乐负分（对齐设计文档 §3.2）；追加沉底用例 ([5cb10cc](https://github.com/Aparencia/Entropydecrease/commit/5cb10ccdf3d6b8ec4265491f2a66620a76ce1b10))
* **window-recognition:** MEDIUM_CONFIDENCE_MIN 修正为 70（设计规格） ([f80e944](https://github.com/Aparencia/Entropydecrease/commit/f80e9444f6eb8cef90584246894fdb3aa6114bdd))

### ♻️ 重构

* **ai-gateway:** _TIER_RANK 单源化消除重复定义，nginx 限流双层设计加注释说明 ([cc17288](https://github.com/Aparencia/Entropydecrease/commit/cc1728878bb06f51e2a13237e6ee0dec5ab7e654))
* **ai-gateway:** auth.py 613 行拆 jwt_keys/jwt_verify/auth 三模块，331 测试全过 ([fd75259](https://github.com/Aparencia/Entropydecrease/commit/fd75259fe8fa7d66ed24e2968d117f56e99a1011))
* captureManager 558→261 拆 5 管线文件，InspirationPage 463→288 拆 6 子组件 ([5f63ef4](https://github.com/Aparencia/Entropydecrease/commit/5f63ef4e98a53f4f975148ab1cb5e2d96cf51323))
* **classroom:** 六项审查修复 + 审查报告 + 计划状态更新 ([24bca6b](https://github.com/Aparencia/Entropydecrease/commit/24bca6ba53444412f31f30ff3dd1917ee59e94b8))
* **client:** lint 清零并收敛 store 订阅与工具函数 ([807a068](https://github.com/Aparencia/Entropydecrease/commit/807a0686da166c501ee6c3449b4a25e978973e16))
* **client:** 开启 noUnusedLocals 并清理 10 处死代码，生产代码 any 清零 ([9c5846f](https://github.com/Aparencia/Entropydecrease/commit/9c5846f14ef1f11d36155f82dba97c20121cceb5))
* **electron:** 清理未用 import 与死代码，回退 mp3 LFS 跟踪 ([32d4529](https://github.com/Aparencia/Entropydecrease/commit/32d45298a931195461adb0b3733be83abee09314))
* flashcards 三文件（630/490/507→276/296/284）与 Onboarding 577→94/ProfileSettings 443→234 拆分 ([16b38ff](https://github.com/Aparencia/Entropydecrease/commit/16b38ffc0fa620fd15335c1d91bbb242e0e53d90))
* **notes:** NoteEditPage 879→274 拆 17 文件，FreeCanvas 672→268 拆 5 文件 ([0dcc26a](https://github.com/Aparencia/Entropydecrease/commit/0dcc26ab769d9b068bb876f2a7448b94c8a45004))
* **notes:** NotesPage 1299 行拆 22 文件（7 hooks + 14 组件 + 1 lib），主文件 293 行 ([e4a5a3b](https://github.com/Aparencia/Entropydecrease/commit/e4a5a3b23f260dd60033e204fcca65e822468250))
* **notes:** useNoteStore 611 行拆组合式 slice（note/folder/search + lib 外移），主入口 79 行 ([f9f9a09](https://github.com/Aparencia/Entropydecrease/commit/f9f9a09e1e916a8d5ea288b51519f6c6bfa3f503))
* **sync:** rooms.go/relay.go 按职责拆分 5 文件（manager/handlers/ws），全部 ≤300 行 ([30f1ede](https://github.com/Aparencia/Entropydecrease/commit/30f1edede65b797de4847098d50456cf8d4d69ec))
* **window-recognition:** 阶段一接入评分组合入口（行为兼容） ([66808c0](https://github.com/Aparencia/Entropydecrease/commit/66808c0c1ccdb92804dc105ca75e50f39f69db1f))

## [0.37.0](https://github.com/Aparencia/Entropydecrease/compare/v0.36.0...v0.37.0) (2026-08-11)

### ✨ 新功能

* **website:** add dive feature landing page with playable chronos demo ([b6ad23c](https://github.com/Aparencia/Entropydecrease/commit/b6ad23cf50de946ea47cfa29d395519b37577074))
* **website:** add feature config types, chronos states and dive content config ([da342c2](https://github.com/Aparencia/Entropydecrease/commit/da342c2d0de1dc9770b1f6685f767ff7967353e6))
* **website:** add features overview page with module cards ([b79b945](https://github.com/Aparencia/Entropydecrease/commit/b79b945377c665451cbe17d891597924fe712c7d))
* **website:** add playable chronos canvas demo with six-state machine ([7e63acf](https://github.com/Aparencia/Entropydecrease/commit/7e63acf5b09c52231eb934903cdb8de137cafa09))
* **website:** add reusable feature page template sections ([35a91aa](https://github.com/Aparencia/Entropydecrease/commit/35a91aa6d2560c7acb504d289e51bf5e8bdf3c9f))
* **website:** convert brand story page to design philosophy page ([10e9e55](https://github.com/Aparencia/Entropydecrease/commit/10e9e55d35bb27338d0315a1b8c0b6d4b48857ea))
* **website:** unify module registry and link homepage cards to feature pages ([d3a0a22](https://github.com/Aparencia/Entropydecrease/commit/d3a0a2209e9b6440e73a9324975d3f8f5d772661))
* **website:** update navbar to design philosophy and features entries ([ef19063](https://github.com/Aparencia/Entropydecrease/commit/ef190633f98d632ec097824dd04a3ba5ab115716))

### 🐛 缺陷修复

* **ci:** update IndexNow URLs to new feature pages ([0467b7e](https://github.com/Aparencia/Entropydecrease/commit/0467b7ece06adb22263a659fc712a74db476e412))
* **website:** add keyboard support and guard zero-size canvas in chronos demo ([1e6fe93](https://github.com/Aparencia/Entropydecrease/commit/1e6fe934aed079b53bb9d61cb4d374dc49fe68a1))
* **website:** keep chronos demo free interaction after card selection ([6117c3d](https://github.com/Aparencia/Entropydecrease/commit/6117c3d27cdb59b9b805dc3446e4c609afcde4d1))
* **website:** move download CTA to first screen and add scroll hint ([e13f7b5](https://github.com/Aparencia/Entropydecrease/commit/e13f7b5343fe057b62696e2cfe34971defc4dade))
* **website:** route incomplete modules to overview page from homepage ([040b303](https://github.com/Aparencia/Entropydecrease/commit/040b303c58aacf2a9fef7cfa54cb9abd20ccd482))

### ♻️ 重构

* **website:** add key field to feature mechanics items ([82e3c07](https://github.com/Aparencia/Entropydecrease/commit/82e3c076030c8c699be050ef09fb7302b3c57c45))
* **website:** fix mechanics card semantics and onSelect item signature ([2337f8e](https://github.com/Aparencia/Entropydecrease/commit/2337f8e7c08ab6676abb190e500085b9bae77dea))

## [0.36.0](https://github.com/Aparencia/Entropydecrease/compare/v0.35.2...v0.36.0) (2026-08-11)

### ✨ 新功能

* **3d:** Dashboard 深海世界新增 LeviathanShadow 远景巨影 ([8f86127](https://github.com/Aparencia/Entropydecrease/commit/8f86127fd7a999949e613b12ce3b077336b85937))
* **3d:** switch rendering backend from WebGL to WebGPU and restore Chronos 3D sphere ([1ec8b37](https://github.com/Aparencia/Entropydecrease/commit/1ec8b3704b6c3d28e08a9fd0658c4783996d1ede))
* **ai-gateway:** ASR 热词增强全链路透传 ([bf2c882](https://github.com/Aparencia/Entropydecrease/commit/bf2c882f28b8037b2150c06e0ac4ac27c312775e))
* **ai:** AI hooks 流式化改造——苏格拉底追问/救援打字机渐进展示 ([5d2318c](https://github.com/Aparencia/Entropydecrease/commit/5d2318ce271560509ccb832332e96f63b7fe1364))
* **assistant:** F3 睡前复习气泡拉起 5 卡迷你复习 + T4 孵化呼吸引导 ([5004b44](https://github.com/Aparencia/Entropydecrease/commit/5004b4492c82df031870285cb2f778aa7dec6ea6))
* **assistant:** 水母受惊弹开+右键固定+用户活跃检测(10min空闲阈值) ([cf76a18](https://github.com/Aparencia/Entropydecrease/commit/cf76a1820f3af945dadd091b2d354133c1840a79))
* **beta:** 客户端付费体系——设备指纹/付费状态/AI 用量卡 ([3b4d6c3](https://github.com/Aparencia/Entropydecrease/commit/3b4d6c30625acf15cd139d3b7d0a04ea53634ad6))
* **classroom:** 课堂模块增强——热词/转录编辑/章节导航/视觉模式 ([2f1a644](https://github.com/Aparencia/Entropydecrease/commit/2f1a6441546d0cc1ac846e4884acfc41ce3b46bf))
* **dashboard:** D5 热力图效率维度 + R3 结束仪式 + R9 成就证书 ([e2e4b85](https://github.com/Aparencia/Entropydecrease/commit/e2e4b85b9f1708572a99911fb0d76efffbcc5c14))
* **dashboard:** 主页三视图认知重构与双方案视觉系统 ([7d76b6e](https://github.com/Aparencia/Entropydecrease/commit/7d76b6eb3943c84a95cf5262dfbd84141952fbcf))
* **dashboard:** 学习脉搏加入非番茄钟折算(笔记/复习/费曼)(内测反馈) ([af9a867](https://github.com/Aparencia/Entropydecrease/commit/af9a8678ab971fbc5c005ef3536131cf8cc7fb4e))
* **electron:** G7 全局快捷键框架 + E2 录音持久化 IPC 白名单 ([0ab8f2a](https://github.com/Aparencia/Entropydecrease/commit/0ab8f2ac83e4e9d58701523eca2f3eabc464542d))
* **feynman:** E2 录音关联持久化与跨会话回放(userData/recordings) ([76241a3](https://github.com/Aparencia/Entropydecrease/commit/76241a30c9b6a87535d3445722184dcdfadf592f))
* **flashcards:** 批量管理(选择/重学/搁置/删除)+牌组重命名+会话上限可配置 ([1119e79](https://github.com/Aparencia/Entropydecrease/commit/1119e79c7b516377cfd585f6f157e3b6791c2324))
* **inbox:** 统一收件箱——剪贴板/灵感/导入三路合并 + 24h 去重 ([3c725ed](https://github.com/Aparencia/Entropydecrease/commit/3c725ed74e6a7637667d5f1d3fd8b3f30a63a458))
* **innovation:** 创新功能目录四期实施 + 全量审查修复 ([7504119](https://github.com/Aparencia/Entropydecrease/commit/75041193a34a1e3cf55a978becf35a69ecaa6f82))
* **license:** AI 网关付费授权体系 ([9f7ed90](https://github.com/Aparencia/Entropydecrease/commit/9f7ed90eb86495ea9a5c7d9134a45309a1f7ab8b))
* **notes,flashcards,feynman:** 未接线组件全量接入 + DashboardPage 编译修复 ([4990849](https://github.com/Aparencia/Entropydecrease/commit/49908496cca483e630a7b317cbb906ebce6e9391))
* **notes:** N5 闪卡只取核心层文本 + N2 合书测试答后 diff 高亮 ([7eff581](https://github.com/Aparencia/Entropydecrease/commit/7eff58196eba6ec3362235413636f2b9f3bb2426))
* **notes:** 搜索栏重构为笔记内筛选+批量删除+模板筛选+文件夹树删除 ([40d7366](https://github.com/Aparencia/Entropydecrease/commit/40d7366a8688cbe5beb977244cf7f55499553642))
* **notes:** 珊瑚礁视图与视口锚定——笔记深潜增强 ([2b82b5e](https://github.com/Aparencia/Entropydecrease/commit/2b82b5eb373e83829c1bc5bea965ae2cc1b2b4fc))
* **notes:** 笔记功能创新全面实施——7阶段25文件 ([d0e0776](https://github.com/Aparencia/Entropydecrease/commit/d0e0776fe6a1213fe6d7c49ceb164153a37ad9df))
* **notes:** 笔记模块 P0-P2 改进 — 14 项功能实施 ([a081bf6](https://github.com/Aparencia/Entropydecrease/commit/a081bf618f8d7ee80681b6c3a1f29ba5c613d73b))
* **notes:** 第一轮头脑风暴剩余5项构建完成 ([df90cf2](https://github.com/Aparencia/Entropydecrease/commit/df90cf2552f85b7b7d9217087eadcdcfd2203039))
* **notes:** 第一轮头脑风暴剩余创新点构建 ([9f6838b](https://github.com/Aparencia/Entropydecrease/commit/9f6838b8bbe36ffab53a0444e0792e5b64c210a5))
* **payment:** 临时收入方案全栈实现（数据库+UI+AI网关tier分级） ([acf72e3](https://github.com/Aparencia/Entropydecrease/commit/acf72e3872ef56340583c87f5c52d4aafbf3e1bc))
* **pomodoro:** Chronos 时间生物可视化（P0-P2） ([1d7ab71](https://github.com/Aparencia/Entropydecrease/commit/1d7ab71528784de6b40c9e707d280cfbaeca146a))
* **pomodoro:** Chronos 液态金属形态与完整状态指示系统 ([dd34528](https://github.com/Aparencia/Entropydecrease/commit/dd34528ef8ba684d00a0d8022441f8433929dd70))
* **pomodoro:** Chronos 粒子球全面修复与 TimerFace 高频区重构 ([2f96df2](https://github.com/Aparencia/Entropydecrease/commit/2f96df2fbd8ded6f98ec0957faff5ff60fd2e788))
* **pomodoro:** 修复计时状态机与数据一致性问题，接线体验增强功能 ([74f1893](https://github.com/Aparencia/Entropydecrease/commit/74f18933d9fadb75ac6b3942a6fa2f4d40b4eced))
* **pomodoro:** 深潜设置页下潜档案重构与番茄钟体验增强 ([317d84b](https://github.com/Aparencia/Entropydecrease/commit/317d84b01b4e76b7b73b5e35c805bdab4b13f9c0))
* **pomodoro:** 表盘与预设标签 UI 增强 ([3a91f24](https://github.com/Aparencia/Entropydecrease/commit/3a91f240f1bffcadcff261643293cdd1dbc13b26))
* **sop:** SOP 系统 MVP——四表落库/模板运行状态机/三页面/5 条 lint 规则 ([77064a4](https://github.com/Aparencia/Entropydecrease/commit/77064a479692e2c1f35c547651a1baa5683a3007))
* **ui:** 命令面板集成全局内容搜索(content类别)+Tag可交互+work-area属性 ([410d582](https://github.com/Aparencia/Entropydecrease/commit/410d5826768d44362c5cb14b332cebdd52ce784a))
* **ui:** 设置页升级引导 + 每日色相微调对抗感觉适应 ([400e650](https://github.com/Aparencia/Entropydecrease/commit/400e65049d050b1a0ac86ceb88256bbcbf84b4e1))
* **wiki:** 侧边栏独立折叠与自动保存状态提示 + 命令面板 SOP 入口 ([dd812b9](https://github.com/Aparencia/Entropydecrease/commit/dd812b973d2d3d53604cfd0573ef180fb9e1ae3e))

### 🐛 缺陷修复

* **3d:** add forceWebGL=true to WebGPURenderer for async init compatibility ([5c3b01c](https://github.com/Aparencia/Entropydecrease/commit/5c3b01cc90b2ab95af4b5a169c17edf42c5e8d76))
* **3d:** revert WebGPURenderer to THREE.WebGLRenderer for R3F compatibility ([0832b21](https://github.com/Aparencia/Entropydecrease/commit/0832b21a6b3d54d5b1429fd6b62caa097dad2f87))
* **3d:** 主题切换/场景切换手动渲染修复(docked冻结)+routeToModuleId抽离 ([b6735e2](https://github.com/Aparencia/Entropydecrease/commit/b6735e2bf52a4520e50c343fd22affcbb3daf539))
* add cleanup to showTime timer effect to prevent stale timeout ([2a5cf31](https://github.com/Aparencia/Entropydecrease/commit/2a5cf31aee4dd8bf657aac5c90fe089e00a7e1dd))
* **ai-asr:** 重构 ASR 引擎为 zipformer-transducer 单引擎 ([3522567](https://github.com/Aparencia/Entropydecrease/commit/352256754e74dcf22c0fd7136b8c79989923bf7e))
* **ai-gateway:** Python 3.12 部署启动修复（Any 导入 + BOM 清理 + F401） ([96ac0f5](https://github.com/Aparencia/Entropydecrease/commit/96ac0f5e17a49f2ff1dc766739cbe88b6fcb19f5))
* App启动初始化番茄钟+设置页返回按钮+API本地模式401不踢登录+批量选择hook ([9958306](https://github.com/Aparencia/Entropydecrease/commit/99583060da27c3cdf41999180ab127e85e28793f))
* **audit3:** resolve deferred findings X1-X6 ([9e625ca](https://github.com/Aparencia/Entropydecrease/commit/9e625ca89512e8845dbdb89694a3030100036b6b))
* **audit3:** resolve round-3 review findings on round-2 fixes ([beed8b4](https://github.com/Aparencia/Entropydecrease/commit/beed8b4d7a9efafd13bcdaaccf0c62e5ddf887f5))
* **chronos:** eliminate per-frame THREE.Color allocation in useFrame ([6f2411b](https://github.com/Aparencia/Entropydecrease/commit/6f2411b29239ffdfba2becb8bd97b90c6039f516))
* **client:** resolve frontend medium-risk issues FRONT2-M1~M8 ([c00c087](https://github.com/Aparencia/Entropydecrease/commit/c00c08786afd66969f0558ced1c2bd0524aa174a))
* **client:** 同步引擎高危修复——resume死锁/冲突循环/localData空对象/synced类型不一致 ([7ef8ad8](https://github.com/Aparencia/Entropydecrease/commit/7ef8ad8d9e8df78b9b4d95f537775f25b38b04cf))
* **client:** 学习算法修复——FSRS初始稳定性对齐权重/sm2缺失字段防御/复习写失败可恢复 ([0d43362](https://github.com/Aparencia/Entropydecrease/commit/0d43362ac9af89888e1d0fbba8908e32d0dcd529))
* **client:** 客户端中危修复——IPC批处理返回值/流式超时与连接释放/代理路径校验/MCP最小环境/采集源校验/备份保护/watchdog上限 ([b572994](https://github.com/Aparencia/Entropydecrease/commit/b572994af505c1c37bca571efb93664aaf5529de))
* **client:** 客户端低危修复——文件读写限制/更新状态机/崩溃恢复/迁移可诊断/preload白名单统一 ([af1b353](https://github.com/Aparencia/Entropydecrease/commit/af1b35343a2aaca08a066eb2bc62542f8a9166fa))
* **client:** 客户端高危修复——采集stop挂起/迁移列错位/搜索全量返回/FTS阻塞/复习双击竞态 ([1feb466](https://github.com/Aparencia/Entropydecrease/commit/1feb4661e60c42f7d63ac30b5d1325b8c7a234e4))
* **electron:** resolve ELEC2-M1/L1/L2 ([064f636](https://github.com/Aparencia/Entropydecrease/commit/064f6361049b7250e2920d06ad0d313756d81bb1))
* **electron:** SSEServerTransport 类型注解修复 ([b999e05](https://github.com/Aparencia/Entropydecrease/commit/b999e0557e40ff991ceae24d5ce0787a0c5ff7d8))
* **gateway:** AI网关中低危修复——熔断器语义/探活超时/JWKS安全/Key冷却/重试策略/错误脱敏/Redis重连/限流原子化 ([d3be873](https://github.com/Aparencia/Entropydecrease/commit/d3be873f3935e51fb2f532f58e5866f50a4f6324))
* **gateway:** AI网关高危修复——并发信号量/预算记账/流式限流/SSE资源释放/事件循环阻塞/请求体限制/降级链容错 ([8e78b6f](https://github.com/Aparencia/Entropydecrease/commit/8e78b6fd9245b4a2066b1e6b2be8d3172995fd53))
* **gateway:** JWT 算法自动适配消除 HS256/ES256 错位 401，学习计划认证就绪前不发请求 ([ed5c55a](https://github.com/Aparencia/Entropydecrease/commit/ed5c55ad45c7b90a62048dc2a07691c8b14fe631))
* **gateway:** resolve high-risk issues [#1](https://github.com/Aparencia/Entropydecrease/issues/1)-[#4](https://github.com/Aparencia/Entropydecrease/issues/4) ([1aeeac5](https://github.com/Aparencia/Entropydecrease/commit/1aeeac5b369e8334bf17816832b2d1f8a5c95189))
* **gateway:** resolve low-risk issues [#11](https://github.com/Aparencia/Entropydecrease/issues/11)-[#14](https://github.com/Aparencia/Entropydecrease/issues/14) ([12a6e68](https://github.com/Aparencia/Entropydecrease/commit/12a6e6867ecf367064c5ccacc596cd58bd09603e))
* **gateway:** resolve medium-risk issues [#5](https://github.com/Aparencia/Entropydecrease/issues/5)-[#10](https://github.com/Aparencia/Entropydecrease/issues/10) ([f0b92a9](https://github.com/Aparencia/Entropydecrease/commit/f0b92a9ea8362f2c9e71b34e626513ceb6ee8feb))
* **misc:** vite base 动态导入 504 / 流式路径正则 / mcpEnv 转义 / AuthGuard 依赖修正 ([7658c81](https://github.com/Aparencia/Entropydecrease/commit/7658c818c8eec2a7292ddaf610de305f901af69a))
* **misc:** 杂项修复与文档更新 ([5e43dd8](https://github.com/Aparencia/Entropydecrease/commit/5e43dd8d4a6c202936b69772eb9565e106d843a7))
* **notes:** 修复 EchoDiscovery 未使用导入并完成全量验证 ([c1d2a3d](https://github.com/Aparencia/Entropydecrease/commit/c1d2a3dfd685d05de3743d498afc3b9e1d5cd51e))
* **perf:** 性能模式变更即时生效，活跃采集优雅重启 ([71304db](https://github.com/Aparencia/Entropydecrease/commit/71304dbe184333fcf0d7741b96b3a88aa8b241a7))
* **pomodoro:** Chronos 交互补齐与构建级类型修复 ([d8adfb5](https://github.com/Aparencia/Entropydecrease/commit/d8adfb5f3dc8c67e49cab1c047fea782d751ba59))
* remove stale audioPrefs reference in PomodoroAudioLayer ([cad2ad4](https://github.com/Aparencia/Entropydecrease/commit/cad2ad49762931c7040f2299d33241544ddbfc6e))
* replace remaining audioPrefs references in PomodoroControls JSX ([62e8255](https://github.com/Aparencia/Entropydecrease/commit/62e8255bfcbf4c76036a6b55550e1f75b46eb057))
* restore skip on break click in ImmersiveTimer ([336ee8a](https://github.com/Aparencia/Entropydecrease/commit/336ee8a0fa5e22b834d17f27484e15f7b98cdbe4))
* **sync:** OfflineQueue 版本排序改内存排序（Dexie Table 无 sortBy） ([60d72a3](https://github.com/Aparencia/Entropydecrease/commit/60d72a34a80808c833749f75c53356efb41de3e4))
* **sync:** resolve low-risk logic issues SYNC2-L1~L5 ([b82668d](https://github.com/Aparencia/Entropydecrease/commit/b82668d22b845be8b7b9ffc4c8293b2191845cd7))
* **sync:** 同步服务修复——版本冲突判定/WS查询洪泛/Resolve安全/CRDT幂等/广播完整性 ([c7bdb7b](https://github.com/Aparencia/Entropydecrease/commit/c7bdb7bd17fb71cae571b72bcb11e4e2abca77b8))
* **tokens:** 材质类层叠顺序 - 深色段移至浅色段后，修复深色主题错误显示浅色材质 ([3bb49b9](https://github.com/Aparencia/Entropydecrease/commit/3bb49b96b714c7ec7c7be55347f66420feef0c3a))
* **website:** 下载页版本信息拉取超时与重试——消除源站挂起时的无限等待 ([7753dc7](https://github.com/Aparencia/Entropydecrease/commit/7753dc7d490c02625e7159681efb6958f0c16579))

### ⚡ 性能优化

* **3d:** migrate 6 particle systems to GPU vertex shader and consolidate useFrame ([0e9dc4a](https://github.com/Aparencia/Entropydecrease/commit/0e9dc4aab4e362a1a6d15bd8e3b5414d8cca2798))
* **client:** 性能优化第二批次——笔记投影/课堂内存/订阅治理/3D 算法优化 ([a734883](https://github.com/Aparencia/Entropydecrease/commit/a73488379014048a68fe32817dfe614d555acc6b))
* **ui:** split whole-store subscriptions and fix effect re-registration ([1f2308b](https://github.com/Aparencia/Entropydecrease/commit/1f2308b5acc4c2dc5c2bb750d13ac4d5ed5d4a20))

### ♻️ 重构

* **chronos:** 粒子渲染 WebGL 单网格→Canvas 2D 伪 3D 重构 ([45e2752](https://github.com/Aparencia/Entropydecrease/commit/45e27520892327c31bee073a51ee1ff6f1ba3e59))
* **dashboard:** Dashboard 重构——移除深海主题死代码 ([32f84b3](https://github.com/Aparencia/Entropydecrease/commit/32f84b307fd376f532f3623c75e44421b7cc9ca3))
* **pomodoro:** usePomodoroStore 拆分为 timer/settings/session/preset 四 slice ([a7d69de](https://github.com/Aparencia/Entropydecrease/commit/a7d69de22f21df4767fdf8ef41cb5a40aefe9398))
* 大规模死代码清理——移除未使用组件/钩子/工具 ([1432871](https://github.com/Aparencia/Entropydecrease/commit/14328715efdf3c864ee5e887ad2181c3f1d9bcc5))

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
