# 更新日志

本项目所有值得关注的变更都会记录在此文件中。
版本号遵循 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)，提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)。

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
