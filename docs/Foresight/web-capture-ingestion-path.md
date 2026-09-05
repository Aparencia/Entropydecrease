# 前瞻调研：Web 采集——第三条进料管道（机制定案，未立项）

> 状态：前瞻调研 + 讨论定案（2026-09-05；**未立项，待登记 REQ 候选**）——回答"熵减要不要做 web 采集、用什么机制做"，承接 v0.10.0 舍弃清单 #26（网页剪藏）的翻案论证
> 结论先行：**有条件翻案**——不做"网页收集中枢"，做**第三条进料管道**（实时捕获 / 图文采集之外），只服务"网页素材进入学习闭环"；机制=**浏览器扩展前哨（登录态 DOM）→ 本地 loopback 收件服务 → 应用内解析入库**三件套；落点=`kind=web` 会话复用既有摄入脊柱；落地=**内核先行**（先应用内 URL 采集静态闭环，扩展后置为薄壳复用同一 POST 契约）
> 研究路数：GitHub 现成项目盘点（抽取引擎/快照/完整项目架构）→ 中文+全球市场调研 → 本地架构参照（ADR-020 kind / ADR-021 正文源多态）→ 机制定案。检索时间 2026-09-05；价格为写稿时点以官网为准。

## 一、翻案论证：回应 v0.10.0 舍弃 #26

**原裁决**（[v0.10.0 舍弃清单 #26](../versions/v0.10.0.md)）：网页剪藏（对标印象笔记）——"产品定位为视频学习提取，非网页收集中枢"。

**2026-09 三个变化支撑有条件翻案**：

1. **学习素材外延已扩大**：8 类内容体系（W 事实 / Y 因果 / H 程序 / M 模型 / Me 洞见 / Act 行动 / SE 状态 / AI 审美）讨论中，原则/效应/洞见类素材大量来自**文章与文档**而非视频；图文采集动线（v0.11.7）已事实上承认"网页是学习场景"——但其产出是截图+OCR 识别文本，质量劣于正文直取（版式噪声、错字、无法检索原句）。
2. **架构地基已预留**：ADR-021 `BodySource` 正文源多态明确预留"新正文源只加变体"；photo 会话先例证明"无音频会话"可行（ADR-020 kind 字段）。
3. **市场窗口出现**：云端稍后读大清洗（Pocket 2025 关停删库、Omnivore 2024.11 被购停服、收趣 2025 停服清库、Evernote 式微），本地优先 + 开放格式从口号变为抗关停卖点；Obsidian Web Clipper（官方、MIT、2024.11 开源）成为开源剪藏事实标准——"扩展读已登录 DOM → 本地 MD"范式成熟。

**克制表述（定位红线）**：web 采集不做收藏夹、不做通用稍后读、不承诺全站适配——**素材进学习闭环（正文直达笔记管线 → 组 → 闪卡/检索）即止**。剪藏与"课程采集"同权但不同形：课程是容器地形（结构在内容里，产物=课程笔记），文章按主题归组（feed 地形碎片同权，产物=组内素材/笔记），沿用"组是唯一容器、进料方式养同一个叙事"哲学（product-design-philosophy §3.2）。

## 二、GitHub 盘点：可复用零件（几乎不自研）

### 抽取引擎
| 候选 | 语言/许可 | 状态 | 判定 |
|---|---|---|---|
| **mozilla/readability** | JS / Apache-2.0 | 11.4k★，push 2026-08；Firefox 阅读模式同源 | **主线**：在扩展内 / wry WebView 内执行 |
| kumabook/readability（crate） | Rust / MIT | 134★，v0.3.0，下载 140 万，维护放缓（push 2024-04） | 仅静态页降级路径 |
| trafilatura | Python / Apache-2.0 | 6.8k★，PyPI 2.2.0（2026-07） | 论文级基准最强；lxml 打包重 → **只作离线验收基准数据集**，不嵌入 |
| turndown（HTML→MD） | JS / MIT | 11.4k★，最活跃 | 随 readability 注入 |
| scraper + ammonia + mdka-rs | ISC / Apache-2.0 | — | Rust 侧消毒/解析闭环可行（html2md crate 为 GPL-3.0+ 勿用；kuchiki 已归档） |

### 整页快照
- **WebView2 无 MHTML savePage API、无法跑无头 Chromium → 渲染型快照唯一现实路径**：隐藏 wry 窗口加载目标页 → 注入自研 DOM+子资源内联 JS（SingleFile 同思路，但其 AGPL-3.0 需规避，自研 core.js）
- monolith：Rust / CC0-1.0 / 15.5k★ / crate v2.10.1 可嵌入 —— 静态快照降级路径
- 截图仅视口、wget -p 仅静态 —— 均不足

### 完整项目架构先例（采集机制范式）
| 项目 | 许可 | 机制一句话 | 借鉴点 |
|---|---|---|---|
| **Joplin Web Clipper** | AGPL-3.0 | 桌面 loopback REST `127.0.0.1:41184`+`?token=`；扩展 POST /notes（MD 或 body_html+image_data_url） | **本地收件服务范式最完整**：端口探测 GET /ping（试 41184-41194 解决端口冲突/未启动） |
| 思源 siyuan-chrome | AGPL-3.0 | 扩展调本地内核 `127.0.0.1:6806`+授权码 → createDocWithMd，图落本地 assets | 授权码+图落盘 |
| **Obsidian Web Clipper** | MIT / 5.1k★ | 扩展内 Readability+Turndown 全量转换 → `obsidian://` URI → 桌面端写 vault；超长/未开应用落剪贴板 | **登录墙正解示范**（读已渲染 DOM）；模板化 MD（表/码/脚注） |
| Omnivore（停运） | AGPL-3.0 | 扩展在已登录页内抽取内容直接 POST 服务器，绕开服务端 fetch | 客户端抽取派典范（付费墙可全取） |
| ArchiveBox | MIT | 扩展复用 admin 会话只投 URL；服务端 chromium 多提取器（WARC/PDF/single-file/yt-dlp）；cookie 导入 + persona（chromium profile） | 登录墙的第二条路：cookie/profile 复用（重，备用） |
| Karakeep（原 Hoarder）/ Linkwarden / wallabag | AGPL / MIT | 服务端 fetch 派（Readability / Graby / 截图） | 反例：无登录态，公众号/付费墙基本失效 |
| **LLM Wiki**（Tauri v2） | — / 17.4k★ | Web Clipper + URL 批量入库 + Rust clip_server | Tauri 2 最大直接先例 |

### 安全边界（AGENTS.md 红线对齐）
只绑 127.0.0.1 + 首启随机 token（UI 展示）+ 单向"投递"权限 + CORS 拒绝非扩展 origin；图/资源落盘限定应用数据目录；长度/类型校验。

## 三、市场调研结论（中文 + 全球）

### 特征矩阵要点
| 产品 | 定位 | 关键信号 |
|---|---|---|
| Readwise Reader | 云端标杆 ≈$10/月 | 剪藏只是通道，**高亮+API+笔记回流才是粘性**；抽取强但 JS 重页偶残；Ghostreader 单篇摘要口碑平平 |
| Pocket（停运）/ Omnivore（停运）/ 收趣（停运） | 云端稍后读 | **命不由己**：关停只给两周导出、限期清库——"数据不出机"叙事的最佳广告 |
| Cubox | 中文云端闭环 | 多渠道（扩展/微信转发）+ 快照兜底 + AI 解读；Pro 年订阅；微信助手接口受制第三方 |
| 简悦 SimpRead | 中文扩展 | 本地为主 + 一次性买断 + 插件接各笔记库；抽取质量靠个人长期堆站点适配 |
| 语雀/印象笔记/有道 | 生态配件 | 剪藏非主线即失修；专有格式困住迁移 |
| **Obsidian Web Clipper** | 开源事实标准（MIT） | 免费 + 本地 MD + JSON 导出 + 登录态直剪（公众号/知乎场景佳） |
| Joplin Clipper | 开源（AGPL） | 简化 MD+截图，需本地服务 |
| Firecrawl / Jina Reader | API 型 | URL→MD 已服务化；全文经第三方 → 熵减不可默认依赖（Firecrawl 可自托管；Jina 有本地 ReaderLM 1.5b 模型） |

### 2025-2026 趋势
1. **云端稍后读大清洗**：幸存者分化为"AI 体验派"与"本地优先开源派"两极；开源化=信任叙事（MD 可迁移 + 自托管对冲停服焦虑）。
2. **AI 从单篇摘要转向带引用、可溯源的库级问答**（NotebookLM 范式），采集管道前置化。
3. **"剪藏直通笔记/闪卡"是防吃灰共识**：收藏即终点 = 收藏夹；闭环 = 学习工具。

### 空白登记（远期路线，不在本次范围）
视频课程/字幕级网页剪藏无人做好（Cubox 的 B 站字幕至今是未落地 feature request）——与熵减"视频知识提取"定位直接互补；留待 `kind=web` 会话模型成熟后按同模型扩展（正文源=字幕直采），不新造脊柱。

## 四、机制定案：三件套架构

```
浏览器扩展(前哨)              桌面应用(Rust 主进程)
┌────────────────────┐        ┌────────────────────────────────┐
│ 已登录 DOM 上下文     │  POST   │ ① 本地收件服务 axum/tiny-http    │
│ readability+turndown │ ─────→  │    绑 127.0.0.1 随机端口+token     │
│ → MD + 元数据 + 原HTML│         │    /ping 端口探测（Joplin 范式）    │
└────────────────────┘        │ ② 解析入库：MD → kind=web 会话      │
                               │    图 base64/URL → 落盘+改写引用      │
                               │ ③ 快照：隐藏 wry 窗口注入 DOM 内联 JS │
                               │    降级：monolith(静态) → 截图        │
                               └────────────────────────────────┘
```

**五条分叉裁决**：

| # | 分叉 | 裁决 | 一句话依据 |
|---|---|---|---|
| 1 | 产品定位 | 有条件翻案 #26（进料管道，非收集中枢） | 素材外延扩大 + 架构预留 + 市场窗口 |
| 2 | 实现机制 | 扩展前哨 + loopback 收件 + 应用内解析 | 登录墙靠扩展用户态；全文不经第三方；本地优先红线兼容 |
| 3 | 会话模型 | **`kind=web` 会话** + `BodySource::Web` 变体 | photo 先例 + ADR-021 预留位；避免第二套容器 |
| 4 | 落地顺序 | **内核先行**：URL 采集静态闭环 → 扩展薄壳（同一 POST 契约）→ 快照/AI 殿后 | 摄入协议只设计一次，扩展零返工 |
| 5 | 入口形态 | 课堂助手动线区单入口（第四条动线「URL 采集」） | 产物统一进会话列表；扩展投递无感同列 |

**SPA/动态站缺口**：阶段 1 reqwest 静态管线不覆盖 JS 渲染站——由阶段 2 扩展（读已渲染 DOM）自然补齐，无需 WebView 抓取前置。

## 五、阶段路线

- **阶段 1 · 内核（应用内 URL 采集）**：粘贴 URL → Rust fetch → 静态抽取（scraper+readability crate+ammonia+mdka-rs 或 WebView 注入 readability）→ `kind=web` 会话草稿（正文 MD + 元数据 + 标题层级）→ 转笔记链路复用
- **阶段 2 · 扩展薄壳**：Chromium/Firefox 扩展（扩展内 readability+turndown → POST 本地服务）；覆盖公众号/知乎/付费墙/SPA；图 base64 随投，落盘 `session-images/`
- **阶段 3 · 快照与 AI**：隐藏 wry 窗口 DOM 内联快照（自研，规避 SingleFile AGPL）；monolith 静态降级；AI 摘要/带引文问答作可选增强（复用 AiSettings 闸门，本地规则默认，不绑订阅）

**兜底链**：正文抽取失败 → 保留原 HTML 附件；快照失败 → 截图（图文动线兜底）；扩展缺失 → URL 采集仍可用（登录墙内容除外）；离线不可达 → 错误提示不产生半成品会话。

## 六、与笔记管线衔接（8 类体系语境）

- **预处理**：抽取即净化（外来内容预处理最重一步由机器完成）；正文以"整篇初稿 + 标题层级结构线索"形态入库——**可逆**（可随时再切块），原子化拆解与 8 类精细分类留给核心处理阶段，两阶段不互相阻塞
- **来源留痕**：URL/站点名/作者/抓取时间进 notes.properties 扩展位（v0.10.0 预留），对齐"元数据 + MD/JSON 可迁移导出"基础契约
- **回链语义**：段落→来源回链从"时间戳锚点"变为"标题锚点"（点段落跳原文对应标题处）
- **闭环**：正文 → 转笔记 → 归组 → 检索/闪卡——剪藏不独立成"收藏区"，对抗"收藏即吃灰"

## 七、风险与开放项

1. 扩展商店发布（Edge/Chrome/Firefox 三店）周期与审核不确定性 → 阶段 2 前置评估
2. 抽取质量缺少本机验收口径 → 以 trafilatura 建离线基准数据集（仅验收用，不嵌入产品）
3. 反爬/站点结构变动 → 不做全站承诺；失败走兜底链，不给用户"剪坏了"的体验
4. 协议契约（MD+元数据+图 base64）需在阶段 1 定义时就留扩展字段位（source=extension/url 等），防阶段 2 返工
5. 安全审计：token 展示/轮换、loopback 绑定、CORS、长度校验——与 AGENTS.md Tauri IPC 校验红线一致

## 参考来源

- GitHub：mozilla/readability、kumabook/readability、trafilatura、turndown、SingleFile、monolith、Joplin（REST API 文档/AGPL 公告）、siyuan-chrome、Obsidian Web Clipper（obsidian.md/blog/save-the-web、github.com/obsidianmd/obsidian-clipper）、ArchiveBox docs、Karakeep docs、Linkwarden docs、Omnivore（github.com/omnivore-app/omnivore）、LLM Wiki（github.com/nashsu/llm_wiki）、zedi（issue #339）、mdSilo、tauri#5441 / PR#14925（wry eval_with_callback）
- 市场：TechCrunch（Pocket 关停）、DEV 2026 RIL 对比与 Reader/ Raindrop 评测、Obsidian 官方剪藏博客、Joplin clipper 文档、Firecrawl 定价页、jina-ai/reader + ReaderLM-1.5b（HuggingFace）、NotebookLM 官方博客、简悦官网/定价/issue #4472、Cubox help/Pro 规则/微信助手公告、收趣停运公告、语雀剪藏官方、有道服务公告、思源小书签（ld246）、SiYuanWebClipper（AMO）、Obsidian Clipper 中文解读（blog.iaieye.com）、飞书剪存帮助、小红书第三方导出（xhs-favorites-exporter）
