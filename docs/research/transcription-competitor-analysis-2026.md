# 课堂/会议转写产品「识别能力」竞品调研报告（2025–2026）

> 调研范围：通义听悟、讯飞听见、Otter.ai、飞书妙记、Notta、腾讯会议 AI 小助手、B 站 AI 字幕、YouTube 自动字幕、小宇宙生态、tldv/Recall/Fireflies。
> 调研方式：Web 公开信息检索；每条结论附来源 URL 与时点（文章公开日期；无明确日期者标注「官方文档/第三方综述，检索于 2026」）。
> 口径说明：本文区隔「官方宣传口径」与「第三方实测/推测」；凡未获官方确认的机制（如 Otter 早期供应商）均明确标注。

---

## 1. 通义听悟（阿里 / 达摩院）

### 核心识别能力
- **实时转写**：浏览器插件（Chrome/Edge）对网页端音视频会议实时出字；移动端实时录音转写；2024 年起通过百炼平台开放「实时转写能力集成」（Realtime Tingwu Meeting Agent），可嵌入第三方应用。
- **中英自由说（混说）**：同一段语音中中英文自由切换均被识别，官方 2022 年 11 月进阶版发布即主打该能力。
- **说话人分离**：按声纹区分多人并标注说话人（官方帮助中心有「识别说话人」操作说明）。
- **PPT 抽取**：对录屏/视频会议画面抽帧识别幻灯片内容并与转写对齐，形成「音画字」同步的笔记。
- **章节速览**：基于大模型对转写自动分段、生成章节标题与摘要。
- **问答回顾**：2024 年 3 月升级为「音视频问答」，可对超长音视频/上百条音视频批量提问，并生成思维导图。
- **双语字幕/翻译**：音视频双语文案字幕。

### 实现机制（公开信息）
- 识别底座为**达摩院自研 ASR**（媒体 2023 年报道「达摩院自研 AI 模型立功」；开发者社区问答确认其语音识别基于 FunASR 可组合模型框架/Paraformer 系列）。
- 摘要、问答、章节、纪要等全部由**通义千问大模型**做 LLM 后处理（官方称「接入通义千问理解与摘要能力」）。

### 2025–2026 最新变化
- 2025 年 9 月：上线「通义听悟智能纪要 Agent」，可在百炼平台一键部署成独立纪要机器人（2025-09，阿里云产品动态）。
- 2025–2026：实时转写能力以 Meeting Agent 形态开放 API 集成（阿里云百炼帮助文档，检索于 2026）。
- 高校公益计划持续：高校师生用 edu 邮箱认证后可领免费权益（2024-03 报道为**免费送 500 小时转写时长、存储 20G→200G**；现状以官方权益页为准）。

### 定价/权益现状
- 免费版：每月免费转写时长（官方「免费试用权益与付费版计费详情」页，具体分钟数以页面为准）。
- 付费版：订阅制（转写时长 + 存储扩容），面向个人与企业两种档位。
- 高校公益计划官网页：`tingwu.aliyun.com/equity/edu`（edu 邮箱认证）。

### 来源
- 中英自由说/访谈整理发布：https://www.ccidnet.com/2022/1104/10595665.shtml （2022-11-04）；达摩院进阶版：https://developer.aliyun.com/article/1210207 （2022-11）
- 达摩院自研模型报道：https://news.pconline.com.cn/broadcasting/2306/16210184.html （2023-06）；FunASR 相关问答：https://developer.aliyun.com/ask/606189
- 官方功能清单/规格：https://help.aliyun.com/zh/tingwu/features ；核心优势：https://help.aliyun.com/zh/tingwu/benefits
- 2024-03 升级（超长问答/思维导图/高校公益）：https://www.tmtpost.com/6994002.html （钛媒体）；https://m.mydrivers.com/newsview/969536.html （快科技）
- 高校公益计划申请教程：https://studentdiscounthub.com/tutorials/tingwu-edu/ ；官方权益页：https://tingwu.aliyun.com/equity/edu
- 定价页：https://help.aliyun.com/zh/tingwu/pricing-and-billing-rules
- 实时转写能力集成（Meeting Agent）：https://help.aliyun.com/zh/model-studio/realtime-tingwu-meeting-agent-integration ；智能纪要 Agent 上线：https://cn.aliyun.com/product/news/28093 （2025-09）
- 说话人识别操作说明：https://www.php.cn/faq/2841072.html
- 公测免费 100 小时（历史）：https://baijiahao.baidu.com/s?id=1767487497580617101 （2023-06）

---

## 2. 讯飞听见（科大讯飞）

### 核心识别能力
- **实时转写**：App/网页/PC 端实时录音转文字，支持会议、课程场景。
- **自定义热词 / 替换热词双机制**：
  - 转写前：设置「个性化词库/热词」，把专有名词、人名、专业术语注入识别引擎提升命中（官方「会记高精度转写、热词优化功能」2023-12 上线；多篇教程教「关键词优化语音识别准确率」）。
  - 转写后：直接在转写稿中修改/替换错字与术语，且支持**实时转写过程中同步修改文字**；官方宣传「会议纪要生成中的纠错机制与 AI 学习」——用户修正会被用于后续转写。
- **语篇规整（口语书面化）**：自动去除「嗯、啊、那个」等语气词/口头禅，修正口语语法，输出书面化通稿（「会记」功能体系内）。
- **声卡录音（内录）**：PC 端可录制**电脑内部声音**（会议软件/网页音频输出走声卡内录），官方称内录可显著提高转写准确度（避免外放拾音噪声）。
- **离线录音后转写**：App 支持无网离线录音，联网后上传云端转写；企业侧另有私有云/离线会议系统（本地转写翻译一体机方案）。
- **说话人分离**：声纹识别「像声音指纹一样精准分人」，输出分角色逐字稿；同传场景支持中英等多语种同传。

### 准确率宣传口径与实测
- 官方宣传口径：通用中文识别准确率 98%（讯飞长期宣传口径）。
- 第三方实测：什么值得买实测 3 场景发现「98% 这个承诺真没那么简单」——安静环境高语速/标准普通话效果好，方言、嘈杂、专业术语场景明显下降；历史报道重庆话识别率约 85%（2018）。

### 实现机制（公开信息）
- **自研 ASR**：科大讯飞为国内头部自研语音厂商，识别引擎自研（「讯飞听见技术解析」一文描述从识别引擎到开发者生态的全链路）；对外提供流式听写 WebAPI（流式分片 + 热词 + 标点 + 语义断句）。
- 纪要生成：转写后由大模型做摘要、待办抽取（会记体系）。

### 2025–2026 最新变化
- 2026 年：讯飞听见同传新版（应用商店 2026 版）；会记持续迭代（热词、语篇规整、待办同步为现行主打卖点）。
- 声卡内录、实时修改转写等「隐藏功能」官方持续以教程形式推广（iflyrec 官方博客 2024–2025 多篇）。

### 来源
- 个性化词库提升精度：https://www.php.cn/faq/2746730.html ；关键词优化：https://www.php.cn/faq/2736179.html
- 会记热词优化上线：https://huiji.iflyrec.com/huiji_versionupdate/654c8ccd.html （2023-12）
- 专有名词零出错实操：https://post.smzdm.com/p/ak8eopq8/ （什么值得买）
- 实时转写中同步修改文字：https://www.iflyrec.com/zhuanxie/67d8e38a.html （官方博客 2025）
- 纠错机制与 AI 学习：https://www.php.cn/faq/2733809.html
- 会记功能清单（含语篇规整类能力）：https://huiji.iflyrec.com/huiji_qa/6532523f.html ；自动生成纪要攻略：https://www.iflyrec.com/zhuanxie/680740d4.html
- 内录（声卡）功能：https://www.iflyrec.com/zhuanxie/67ea66e9.html ；会记录制电脑内部声音：https://huiji.iflyrec.com/huiji_qa/65855700.html ；PC 端内录教程：https://mydown.yesky.com/news/272094.html
- 录音文件快速转写（离线→上传链路）：https://www.iflyrec.com/zhuanxie/649aa81e.html
- 私有云/离线会议转写方案：https://www.iflyrec.com/html/products/znhy.html
- 声纹识别分人：https://www.xfyun.cn/site/3462.html （讯飞开放平台）
- 98% 宣传 vs 实测：https://post.smzdm.com/p/a5rnxpzk/ ；重庆话 85%：https://cq.cri.cn/chinanews/20180104/5a34da18-ea5a-c643-8126-8be2ba88efa4.html （2018-01）
- 自研链路解析：https://cloud.tencent.cn/developer/article/2569055 ；流式听写 WebAPI：https://developer.baidu.com/article/detail.html?id=3705701
- 讯飞听见同传 2026 版：https://pc.qq.com/detail/15/detail_34495.html

---

## 3. Otter.ai

### 核心识别能力
- **实时转写 + 逐词同步高亮回放**：直播式逐词上屏，回放时文字随音频逐词高亮（word-level sync），点击文字跳转对应音频位置。
- **AI Meeting Agent（即 OtterPilot 的演进）**：绑定日历后**自动加入会议**（Zoom/Meet/Teams 等），静默参会并实时转写、录音、抓取共享屏幕，会后生成摘要/行动项/重点；2025 年官方叙事转向「agentic AI」——从「静默观察者」变为「主动参与者」（会中可被点名、提问）。
- **词汇表（Vocabulary/Glossary）**：可在设置中维护自定义词库（专有名词/缩写/人名），提升识别命中；可管理已有词汇条目。
- **AI Chat 多轮问答**：针对单场或跨多场会议转写做多轮问答，可引用原文出处（AI Chat 为 Otter 付费核心能力）。
- 说话人分离：自动区分说话人并标注姓名（与日历/通讯录映射）。

### 实现机制（公开信息）
- **ASR 自研**：第三方分析（Sacra）明确「Otter Built Its Own ASR」；业界普遍报道其早期（2016 年成立前后）基于 Google Speech API 起家，后自研识别引擎——此项为公开报道口径，官方未系统披露技术细节（Wikipedia 条目亦未详述引擎，检索于 2026）。
- 链路推断（公开信息拼合）：录音/会议音频 → 自研流式 ASR → 说话人聚类 → 大模型（摘要/AI Chat）。Otter 未公开 VAD/纠错细节。

### 2025–2026 最新变化
- 2025：OtterPilot 概念并入「AI Meeting Agent」，VentureBeat 报道其向 agentic（主动听会、会中交互）方向演进（2025-03）。
- 2026 定价综述（第三方）：免费版约 300 分钟/月；Pro 约 $16.99/月（年付折合更低）；Business 约 $20/用户/月（各第三方定价页口径略有差异，以官网为准）。
- 主要支持英文；中文/多语种支持弱于国产产品（第三方评测共识）。

### 来源
- 官方功能页（实时转写/逐词高亮/Agent）：https://otter.ai/features ；AI Meeting Assistant 页：https://get.otter.ai/ai_meeting_assistant_facebook2/
- Otter Notetaker 选择加入哪些会议（官方帮助）：https://help.otter.ai/hc/en-us/articles/26010355877911
- Agentic AI 方向（VentureBeat）：https://venturebeat.com/ai/beyond-transcription-how-agentic-ai-is-set-to-change-enterprise-meetings （2025-03）
- 自研 ASR（Sacra）：https://sacra.com/chat/h/0f9af95a-b175-4a87-9b19-0a83cf2d15a7/ ；公司史（Wikipedia）：https://en.wikipedia.org/wiki/Otter.ai ；创始人口述史：https://startupfounderstories.com/stories/sam-liang-otter-ai
- 自定义词汇表：https://otter.ai/blog/custom-vocabulary ；管理词汇（帮助中心）：https://help.otter.ai/hc/en-us/articles/360048571373-Manage-vocabulary
- 2026 功能/定价综述：https://www.eesel.ai/en/blog/otter-ai （含 AI Chat 说明）；定价：https://www.notta.ai/en/blog/otter-ai-pricing 、https://felloai.com/otter-ai-pricing/ 、https://get-alfred.ai/blog/otter-pricing
- 修复转写错误（说话人/术语/格式）：https://gotranscript.com/en/blog/fix-otter-transcription-errors-speakers-terms-formatting

---

## 4. 飞书妙记（字节跳动 / 飞书）

### 核心识别能力
- **转写–纪要联动**：音视频/会议自动转写，转写稿与 AI 纪要（要点、待办、行动项）并存且互相引用。
- **改字同步**：转写稿可直接编辑；修正文本与纪要、时间轴联动更新（官方帮助与开源 Skill 文档均有「替换说话人/编辑转写」操作）。
- **说话人重新识别**：支持对已转写的录音**重新识别说话人**（官方帮助文档专文），可批量替换/合并说话人标签。
- **音画时间轴**：逐字稿与音视频时间轴双向定位——点击任意一句文字即跳转播放到对应时刻（核心复习/校对体验）。
- 实时转写：妙记移动端/PC 端录音实时出字（2024–2025 版本持续优化「实时转写精准流畅」，如 V7.44 妙记录音优化）。

### 实现机制（公开信息）
- 识别底座为字节自研语音识别（未见官方披露模型细节；飞书开放平台提供 Lark Minutes 能力文档/API，含转写、说话人替换等操作接口）。
- AI 纪要、访谈助手（「AI 访谈助手」妙记+AI）等为 LLM 后处理。

### 2025–2026 最新变化
- 2025-11 飞书月度更新持续迭代妙记（录制、转写、AI 纪要相关条目见「飞书 25 年 11 月重要更新」）。
- 妙记深化「访谈/课堂」场景：AI 访谈助手让访谈过程留痕、细节尽揽。
- 与飞书多维表格/文档深度联动（转写结果直接沉淀为文档/表格行）。

### 来源
- 妙记场景与功能总览：https://www.feishu.cn/content/article/7578773484596153570 ；语音转文字适用场景：https://www.feishu.cn/content/article/7564315568456531969
- 重新识别说话人（官方帮助）：https://www.feishu.cn/hc/zh-CN/articles/812241214493-在妙记中重新识别说话人
- Lark Minutes 能力文档（转写/说话人替换/时间轴对齐，GitHub）：https://github.com/aiskillstore/marketplace/blob/4b8e5c25dbf1e7bdc1a33f0d3e847e85410a4ee6/skills/larksuite/lark-minutes/SKILL.md ；speaker-replace 参考：https://github.com/aiskillstore/marketplace/blob/4b8e5c25dbf1e7bdc1a33f0d3e847e85410a4ee6/skills/larksuite/lark-minutes/references/lark-minutes-speaker-replace.md
- V7.44 妙记录音/实时转写优化：https://www.fklzl.cnpc.com.cn/hc/zh-CN/articles/772105146309
- 飞书 25 年 11 月更新：https://bytedance.larkoffice.com/wiki/DNsJwceemichvUkrjBzc4TwZnsf ；AI 访谈助手：https://bytedance.larkoffice.com/wiki/GzLHwWSTRiqsOckpNPcc57pyndh
- 百度百科（产品沿革）：https://baike.baidu.com/item/飞书妙记/67388857

---

## 5. Notta

### 核心识别能力
- **多语言实时转写**：官方宣传支持 58 种语言（早期营销口径；近年部分页面宣传 100+，以官网为准），支持同一音频内多语言混合识别（官方帮助「How to improve transcription quality」等）。
- **自定义词汇表**：帮助中心提供「Add English Vocabulary / Add Japanese Vocabulary」——按语言维护用户词条，提升专有名词识别（各语言词条独立维护）。
- **摘要/行动项**：AI 生成会议摘要、行动项、关键词；转写后问答。
- 说话人分离：自动分说话人并支持改名（第三方评测普遍确认）。

### 实现机制（公开信息）
- 官方未公开 ASR 供应商（推测为第三方引擎聚合，未获证实）；实时转写基于 WebSocket 流式链路。
- 2024 年并购 Airgram（AI 会议记录工具）并入 Notta，补齐会议 Agent 能力（2024 官方公告）。

### 2025–2026 最新变化
- 2026 第三方评测持续更新：实时多语种转写 + 智能会议笔记为主要卖点（aiworker 2026 评测）。
- Notta vs tldv 等对比文章高频出现，定位为 Otter 的平价替代。

### 来源
- 官方实时转写页：https://www.notta.ai/en/tools/speech-to-text ；转写指南：https://www.notta.ai/en/blog/notta-transcription-guide
- 词汇表帮助（英文/日文词条）：https://support.notta.ai/hc/en-us/articles/7410568101019-Add-English-Vocabulary 、https://support.notta.ai/hc/en-us/articles/44545358731163-Add-Japanese-Vocabulary ；提升转写质量：https://support.notta.ai/hc/en-us/articles/4403163772827
- 各档计划内容：https://support.notta.ai/hc/en-us/articles/45649026891419-What-is-included-in-each-Notta-plan
- 2026 评测：https://aiworker.info/notta-ai-2026-review-real-time-multilingual-transcription-meeting-notes/ ；https://www.unite.ai/notta-ai-review/ （多语言一次转写）
- 收购 Airgram：https://www.notta.ai/en/welcome-airgram
- 对比 tldv：https://www.notta.ai/en/compare/notta-vs-tldv

---

## 6. 新锐/其他值得关注

### 6.1 腾讯会议（AI 小助手 / 智能录制 / AI 托管）
- **转写与字幕**：会议字幕（实时语音转文字）+ 文字转写（会后逐字稿），支持**语音识别热词设置**（官方文档「设置语音识别热词」，可提升人名/术语识别）。
- **AI 小助手**：会前（议程/资料）、会中（实时问答、要点）、会后（纪要、待办、行动项）全流程 LLM 能力。
- **智能录制**：录制+转写+纪要一体化；2026-08 报道「AI 录音笔」升级——线下面对面沟通也可用 Agent 录音转写，完整留存线下沟通资产。
- **AI 托管（2025-09 上线）**：与腾讯元宝打通，元宝可替你参会听会，**自主完成语音识别与会议内容记录**，会后输出纪要。
- 识别底座为腾讯自研 ASR（腾讯云语音识别开放平台，提供自定义热词库 API）。

来源：
- 设置语音识别热词：https://cloud.tencent.com.cn/document/product/1095/106033 ；会议字幕：https://cloud.tencent.com.cn/document/product/1095/80884 ；智能录制：https://cloud.tencent.com.cn/document/product/1095/94172
- AI 小助手会前/会中/会后：https://cloud.tencent.cn/developer/article/2675027
- AI 托管上线：https://meeting.tencent.com/news/aitg20250904.html （2025-09）；报道：https://www.qbitai.com/2025/09/330614.html
- AI 录音笔升级（2026-08）：https://finance.sina.cn/2026-08-13/detail-inineqhm3396287.d.html ；https://zhidx.com/news/43155.html
- 转写留存/智能：https://meeting.tencent.com/news/bbsx241114.html （2024-11）
- 自定义热词库 API：https://cloud.tencent.cn/document/product/862/116244

### 6.2 Bilibili（课堂 / AI 字幕）
- 2024-09：B 站上线**自研大模型「index」**，应用于 AI 字幕，具备**近 10 种语言实时翻译**能力（陈睿在 2024 年 Q2 财报会披露；日均支持数十万非中文稿件翻译）。
- **AI 原声翻译**：自动生成 UP 主英文声线配音 + 英文字幕（国际版能力）。
- **B 站课堂**：课程视频字幕多为平台 AI 字幕；第三方生态有大量「B 站课程转笔记/提取字幕」工具（含基于 AI 字幕+抽帧 OCR 生成带截图笔记的开源项目），说明 B 站课堂本身不提供结构化转写笔记，社区自建。

来源：
- 自研大模型 index 与 AI 字幕：https://m.ithome.com/html/798699.htm （2024-09-26）；https://news.qq.com/rain/a/20240926A09V9A00
- AI 原声翻译：https://m.mydrivers.com/newsview/1066079.html
- 课堂字幕提取讨论：https://linux.do/t/topic/835143/12
- 第三方 B 站视频转带截图笔记项目：https://github.com/asdhabdua/bilibili-video-notes-skill

### 6.3 YouTube 自动字幕
- 机制（公开信息）：视频上传后由 YouTube 自研 ASR 自动生成字幕（auto-captions），支持自动翻译字幕（多语言）；创作者可上传/编辑字幕覆盖自动结果。官方未披露模型细节；第三方指南确认 2025 年自动字幕覆盖语言范围持续扩大、准确率随语言而异（英语最好）。
- 对课堂/学习场景的意义：自动字幕 + 时间轴跳转 = 免费「逐字稿+定位回放」，是 Otter/飞书妙记时间轴体验的免费替代。

来源：
- 2025 自动字幕指南：https://virbo.wondershare.com/ai-video-translation/closed-captioning-for-youtube.html ；替换自动字幕指南：https://marketing.riverside.fm/blog/youtubes-automatic-subtitles ；Sonix 说明：https://sonix.ai/resources/zh/youtube-字幕转录/

### 6.4 小宇宙播客转写生态
- **小宇宙官方无转写功能**；转写由第三方完成：PodNote App（小宇宙链接→云端转写→结构化笔记）、开源 Skill（xiaoyuzhou-podcast-notes：单集播客转 Markdown）、podnote（Tauri 桌面端，本地+云端转写）。
- 对熵减的参考价值：桌面端「播客/课程音频 → 云端或本地转写 → 结构化笔记」的产品形态已被验证，且与学生听播客学英语场景重合。

来源：
- PodNote App：https://apps.apple.com/cn/app/podnote-ai-总结播客笔记/id6502375089
- GitHub xiaoyuzhou-podcast-notes：https://github.com/weisi-gu/xiaoyuzhou-podcast-notes ；podnote：https://github.com/zuijiaosy/podnote ；onepod-Skill（播客处理全家桶）：https://github.com/SpaceZephyr/onepod-Skill

### 6.5 tldv / Recall.ai / Fireflies.ai
- **tldv**：会议录制+AI 转写+剪辑高光片段（Notta 官方对比页可见其功能定位）；ASR 供应商未公开。
- **Recall.ai**：会议数据 API 供应商，**不自研 ASR**，聚合第三方引擎（官方合作页：Speechmatics、Gladia、Rev AI、Deepgram 等）；公开博客披露「如何构建会议记录器」识别链路：采集 → **VAD 语音活动检测切段** → 流式 ASR → **说话人分离（diarization）** → LLM 总结；其对「说话人分离实现」有专门技术博客。
- **Fireflies.ai**：转写引擎自研（官方宣称专有模型），同时提供 **Deepgram 集成**（Zapier 连接器，可选第三方引擎）；**说话人标记**为卖点（官方/第三方文章：自动标注说话人、可编辑说话人标签与姓名、Voice Intel 说话人分析）；提供转写 API。

来源：
- Recall.ai 合作页：https://www.recall.ai/partners/speechmatics 、https://www.recall.ai/partners/gladia ；Rev 合作：https://www.recall.ai/blog/recall-ai-and-rev-partner-to-empower-developers-to-work-with-meeting-data
- 构建会议记录器（识别链路）：https://www.recall.ai/blog/how-to-build-a-meeting-notetaker ；说话人分离技术：https://www.recall.ai/blog/speaker-diarization
- Fireflies + Deepgram：https://zapier.com/apps/fireflies/integrations/deepgram ；说话人标记精度：https://gotranscript.com/public/enhancing-transcript-accuracy-with-fireflies-speaker-labeling ；编辑说话人标签：https://guide.fireflies.ai/articles/4994477228-how-to-edit-speaker-labels-or-names-in-a-transcript ；API：https://fireflies.ai/api
- tldv 对比：https://www.notta.ai/en/compare/notta-vs-tldv

---

## 7. 识别能力背后的供应商与技术（汇总）

| 产品 | ASR 来源 | 公开信息要点 |
|---|---|---|
| 讯飞听见 | **自研**（科大讯飞） | 讯飞为头部自研语音厂商；流式听写 WebAPI 公开；声纹识别分人 |
| 通义听悟 | **自研**（阿里达摩院） | 媒体确认达摩院自研模型；开发者社区确认基于 FunASR/Paraformer 可组合框架 |
| 腾讯会议 | **自研**（腾讯云 ASR） | 提供语音识别 API + 自定义热词库；字幕/转写/热词设置文档齐全 |
| Otter.ai | **自研**（早期业界报道用 Google Speech 起家） | Sacra 分析确认自研 ASR；官方未公开链路细节 |
| 飞书妙记 | 字节自研（未官方披露） | Lark Minutes 开放能力文档含转写/说话人替换接口 |
| Notta | 未公开（疑第三方聚合，未证实） | 官方仅提供词汇表/质量优化帮助文档 |
| Fireflies.ai | 自研为主 + **可选 Deepgram** | 官方 API 页 + Zapier Deepgram 连接器 |
| Recall.ai（API） | **不自研，聚合第三方** | 合作 Speechmatics/Gladia/Rev/Deepgram 等 |
| YouTube | 自研 ASR | 自动字幕 + 自动翻译字幕 |
| B 站 | 自研（大模型 index） | AI 字幕 + 近 10 语言实时翻译（2024-09 官方披露） |

**识别链路公开信息（跨产品共性，最完整的公开描述来自 Recall.ai 博客）**：
1. **音频采集/切流**：会议平台音轨或内录（讯飞声卡内录、Otter 静默参会、腾讯 AI 托管）。
2. **VAD 语音活动检测切段**：检测人声起止，切成可流式处理的片段（Recall.ai 博客明示）。
3. **流式 ASR 识别**：自研引擎（讯飞/阿里/腾讯/Otter/Fireflies）或第三方引擎（Recall 聚合）；支持热词注入（讯飞、腾讯、Otter Vocabulary、Notta 词汇表）。
4. **说话人分离（diarization）**：声纹聚类 + 说话人标签映射（通义、讯飞、Otter、Fireflies、飞书妙记「重新识别说话人」）。
5. **LLM 后处理/纠错**：口语书面化、语气词清除、纪要/章节/行动项、多轮问答（通义千问、讯飞会记、腾讯元宝、Otter AI Chat、飞书妙记 AI 纪要）。部分产品把用户修正回写为后续识别先验（讯飞「纠错+AI 学习」）。

---

## 8. 竞品识别能力共性机制总结

| 机制 | 竞品实现方式 | 效果与差异 |
|---|---|---|
| **热词/自定义词库** | 转写前注入：讯飞「个性化词库/热词优化」、腾讯会议「语音识别热词」、Otter「Vocabulary」、Notta「Add Vocabulary」；转写后替换：讯飞「替换热词/实时改字」、Otter/飞书转写稿直接编辑 | 注入式提升专有名词命中是共识；「转写后全局替换 + 用户修正回写」是讯飞独有的双机制闭环，对学生党纠老师名字/专业术语最实用 |
| **说话人分离** | 声纹聚类（通义、讯飞、Otter、Fireflies、飞书妙记），飞书支持「重新识别」批量替换标签，Fireflies 可编辑姓名并做 Voice Intel 分析 | 中文产品分人效果普遍够用；「重新识别/手动合并」兜底机制（飞书）是课堂多人场景的关键体验 |
| **中英混说/多语言** | 通义「中英自由说」单引擎混说；Notta 多语言混合；B 站 index 近 10 语言实时翻译；Otter 基本只支持英文 | 中文课程/代码课「中文讲解+英文术语」混说是国产产品主场；英文产品（Otter）在中文场景明显弱势 |
| **口语书面化（语篇规整）** | 讯飞会记「语篇规整」去语气词/口头禅、输出书面通稿；通义/腾讯/飞书由 LLM 纪要间接完成书面化 | 讯飞是唯一把「口语→书面」做成独立开关的产品；其余产品靠 LLM 摘要间接实现 |
| **截图/PPT 与转写对齐** | 通义听悟「PPT 抽取」抽帧识别幻灯片并与转写对齐；B 站生态第三方「抽帧+OCR+感知哈希去重+AI 打分」生成带截图笔记；Otter/Fireflies 抓取共享屏幕 | 官方只有通义明示该能力；B 站开源方案证明「抽帧→OCR→对齐时间轴→LLM 融合」全链路可自建，且与熵减「截图/PPT 与转写对齐」诉求完全吻合 |
| **LLM 后处理纠错/摘要** | 通义（千问）、讯飞会记、腾讯 AI 小助手/元宝、Otter AI Chat、飞书妙记 AI 纪要/访谈助手 | 所有产品都已把 LLM 当作识别后处理的固定环节；差异在问答深度（Otter AI Chat 跨会议引用原文）与摘要结构（行动项/待办抽取） |

---

## 9. 熵减课堂助手（本地优先 / Electron 桌面 / 学生向）可直接借鉴的识别功能机制清单

按优先级排序：

1. **本地流式转写 + VAD 自动切段（核心底座，P0）**
   借鉴 Recall.ai 公开链路：采集音轨 → VAD 检测人声起止切段 → 流式 ASR。熵减可基于本地引擎（如 FunASR/Paraformer 开源、Whisper 系列）实现实时出字，VAD 负责断句与静音跳过，完全契合「本地优先 + 离线降级」。这是其余所有功能的地基。

2. **热词双机制：转写前注入 + 转写后替换回写（P0）**
   对齐讯飞/腾讯/Otter：课程开始前让学生录入「课程名、老师姓名、专业术语」，注入本地识别引擎提升命中；转写后提供全局替换（一键把错字批量改对），且**用户修正写入本地词库、下次识别自动生效**——这是讯飞「纠错+AI 学习」的学生版，成本低、感知强。

3. **说话人分离 + 手动重新识别兜底（P1）**
   声纹聚类自动分「老师/同学」，但必须提供飞书式兜底：手动重命名、合并、**对整节课重新识别说话人**。课堂录音人声杂乱，纯自动分人必然出错，可纠正是留存信心的关键。

4. **音画时间轴：逐句/逐词定位回放（P1）**
   Otter 逐词高亮、飞书妙记时间轴双向定位，是复习场景最高频交互。熵减应做到：点击任何一句转写文字 → 本地音频跳转到对应时刻播放；支持变速播放（0.5–2×）。这是「费曼学习法 + 间隔重复」复习卡片的直接触发入口。

5. **LLM 后处理流水线：口语书面化 + 章节速览 + 行动项（P2，云端可选项）**
   本地 LLM（Ollama，熵减已有集成）做语篇规整（去语气词、整理成书面笔记）与章节分段标题；云端 AI 网关可选项做深度问答。对齐通义「章节速览+问答回顾」、讯飞「语篇规整」，但默认离线跑通，符合本地优先。

6. **截图/PPT 与转写对齐（P2）**
   借鉴通义「PPT 抽取」与 B 站开源「抽帧+OCR+去重」链路：课堂录屏抽帧 → OCR（如已有 PaddleOCR 集成）→ 与转写时间戳对齐 → 生成「幻灯片 + 讲解文字」的双栏笔记。这是把转写工具升级为「学习笔记生成器」的差异化卖点，且 OCR 已可在本地完成。

7. **中英混说支持（P2，视课程类型）**
   代码课/留学生课程普遍「中文讲解+英文术语」混说。需验证本地引擎的 code-switching 能力（Paraformer 中英混说、Whisper 多语种均可作为候选），必要时做「双引擎并行投票」。

8. **用户纠错数据驱动的持续优化（P3，长期）**
   把学生在第 2、3 条的修正（改字、说话人改名）沉淀为本地语料，形成个人/课程级词库与声纹档案，让「越用越准」。这与熵减「终身学习」定位契合，且数据 100% 本地、无隐私成本。

---

### 附：调研局限说明
- Otter 早期 Google Speech 供应商、Notta ASR 供应商为业界报道/推测，官方未证实，已标注。
- 各产品定价、免费额度随时间变动频繁，本文给出口径与来源页，落地前请以官网为准。
- 本文信息检索时点为 2026 年（各来源公开日期已逐一标注）。
