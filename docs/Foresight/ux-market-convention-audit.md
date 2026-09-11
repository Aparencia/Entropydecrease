# UX 市场惯例符合度审计：操作习惯偏差清单（综合报告）

> **状态**: 前瞻审计报告（2026-09-05，静态代码审计产物；未裁决、未排期）
> **审计方法**: 6 个并行审计员对 app/src 全量页面/组件按交互面分工逐行只读取证（壳层导航 / 会话课堂助手 / 笔记 / 知识体系·复习·目标 / AI 交互 / 通用交互基座），证据均带 文件:行
> **市场基线**: Notion/Obsidian/语雀/飞书/通义听悟/讯飞妙记/Anki/主流 Windows 桌面惯例
> **局限**: 静态审计未运行应用；[需人工确认] 处为运行态/后端语义/视觉呈现，需真机路径验证后定级；行号未经逐一复核，实施前应回代码确认
> **相关**: [UI/UX 系统规格](../product/ui-ux-system.md)（宣称规格）· [主题理念](../product/theme.md) · 各审计面原始报告存于 2026-09-05 讨论会话

---

## 0. 顶层结论

1. **无 P0（数据损坏级）发现**；代码的底层纪律（防呆、诚实文案、降级闭环、保存四层保险、级联删除文案透明）**显著高于一般自研工具**——亮点清单见 §4。
2. **最大系统性问题 = 设计系统文档与实现系统性脱节（spec-drift）**：`--ed-*` tokens 全库 0 处定义、主色实为 teal `#0d9488`（规格宣称靛蓝 `#3B5BDB`）、App.css 为未 import 的 Vite 模板残留、无深色主题、导航形态（顶部 7 Tab vs 规格 240px 左导航）、无骨架屏/统一空态/hover 反馈/焦点环。ui-ux-system.md 自称"活跃（2026-08-24）"，实现注释至 v0.19.x——**规格超前于实现，需产品侧裁决归属**（改规范 or 投落地）。
3. **差距集中在三类**：① 高频微操作缺位（原地改名、新建即输、Ctrl+K/F/N/B/I 等市场语义键）；② 桌面操作习惯细节不一致（右键语义三套、确认双通道、删除防护分布无规律、弹层 ESC/焦点不统一）；③ 中文输入法基础卫生（IME 组合守卫仅 1/9）。
4. **有真实快捷键冲突**（正文 Ctrl+Shift+S 拆段 与 全局截图同键双触发）与**隐藏页 keydown 泄漏**（display:none 保留挂载页面快捷键仍全局生效）。
5. **删除哲学悬而未决**：ui-ux-system.md §2.3 "删除体面、无确认弹窗惊扰" 未被实现兑现（无相变动效、无撤销/回收站），同时单条笔记删除、里程碑删除等是**无确认直删**——规格、实现、数据安全三者互相打架，需裁决（推荐：回收站/软删 + 撤销 toast，两全）。

---

## 1. 主题化偏差清单（合并去重后）

### A. 设计系统落地治理（spec-drift，工作量最大）〔P1〕

| # | 偏差 | 代表证据 | 影响 | 建议 |
|---|---|---|---|---|
| A1 | 全局导航 = 顶部 56px 7 Tab（emoji+文字）；规格宣称"左导航 240px 可折叠 + 列表栏 + 主内容" | ui-ux-system.md:13,19 vs App.tsx:38-48,222-253 | 与 Notion/Obsidian/桌面惯例（左侧 rail）整体分叉；品牌+7 Tab+徽标+toast 挤单行，960px 窗口拥挤 | 裁决：改规格 or 迁移左 rail；至少解决顶栏拥挤与溢出策略 |
| A2 | `--ed-*` tokens 全库 0 处定义；全站内联硬编码（teal #0d9488/#0f766e）；无 data-theme 深色主题（深色系统下白底扎眼） | 全站 grep；App.tsx:244-247；ColumnResizer.tsx:77 | 主题/换肤无从谈起；两套色系并存，持续漂移 | 先落 CSS 变量 + data-theme，组件按面迁移（列表/弹层/阅读区优先） |
| A3 | App.css（Vite 模板残留 + 乱码注释）未被 import；规格细滚动条 6px 未落地；主内容未限宽（1920 窗≈1180px 行长 vs 规格 720–900 居中） | main.tsx:5；App.css；NotesPage.tsx:472；NoteReadingView.tsx:243 | 死代码；长行可读性受损 | 清理死代码；正文容器 maxWidth ~860px 居中；补细滚动条 |
| A4 | 规格 §五 空态（48 图标/17 标题/行动钮）、骨架屏、hover 120ms、焦点环 2px、minWidth 960×640 全未落地 | 全站 grep；tauri.conf.json:13 | 首启路径无主行动按钮；处理中只有"加载中…"灰字；行/按钮无可点性反馈；键盘导航弱 | 抽 EmptyState/Skeleton/hover 层/focus-visible；补 minWidth |

### B. 键盘与快捷键体系〔P1×2 + P2〕

| # | 偏差 | 代表证据 | 影响 | 建议 |
|---|---|---|---|---|
| B1 | **真实冲突**：正文 Ctrl+Shift+S=拆段（textarea 未 stopPropagation），同键 ClassroomPage window 监听同时触发截图 invoke | NoteEditView.tsx:180-184 vs useClassroomShortcuts.ts（Ctrl+Shift+S 监听）〔拆分前 = ClassroomPage.tsx:240-246〕 | 编辑笔记按该键 = 拆段 + 误触发截图 | 局部监听 stopPropagation 或全局按 e.target 排除编辑器 |
| B2 | window keydown 注册散落 3 处，无集中注册表/冲突检测/帮助入口；display:none 保留挂载页的快捷键/ESC 仍全局生效（隐藏页编辑态可被误改） | App.tsx:204-213；NotesPage.tsx:205-228；useClassroomShortcuts.ts（Ctrl+Shift+S）+ useClassroomFloat.ts（Ctrl+Shift+F）〔拆分前 = ClassroomPage.tsx:239-250 / :282-293〕；App.tsx:314-399 | 跨页串扰；无快捷键发现性 | 命令注册中心 + 可见性/焦点守卫 + 快捷键帮助弹层 |
| B3 | IME 组合守卫仅 1/9（GroupSidebarRow 有；GoalDetail/VocabManager/KnowledgeConceptDialog/KnowledgeModelDialog/KnowledgeTreeView/LinkEntityPicker/RefineStrategyPicker 无） | GroupSidebarRow.tsx:109-116 vs 其余 9 处 | **中文输入法候选回车直接创建/保存/触发动作**（中文桌面高发 bug），同仓不一致 | 抽 `useFormEnterSubmit`（含 isComposing）统一替换 |
| B4 | 市场语义键缺位：无 Ctrl+K 切换器/聚焦搜索、Ctrl+F 页内、Ctrl+N 新建、Mod+B/I（tooltip 宣称存在但全库无绑定）、Tab 切换、Delete/F2 | 全库 grep；RichEditorView.tsx:242-243 | 键盘流用户全走鼠标；误导性 UI 文案 | 补语义键：Ctrl+F 聚焦页内搜索、Ctrl+K 笔记切换器、Ctrl+B/I 绑定、F2 改名 |
| B5 | 复习面仅 Esc，无空格翻面/1-4 评分（Anki 固化心智） | ReviewSessionOverlay.tsx:138-174 | 复习速度低于基准 | 空格=翻面、1-4=评分、Esc=退出（两段式） |

### C. 数据安全与删除语义〔P1×3〕
| # | 偏差 | 代表证据 | 影响 | 建议 |
|---|---|---|---|---|
| C1 | 单条笔记删除（含右键菜单）无确认无撤销直删；同对象批量删除却有 confirm（"不可恢复"） | NotesPage.tsx:236-244,251-269；NoteRowContextMenu.tsx:144-150；NoteReadingView.tsx:181-186 | 路径间防护不一致；右键=误触高危路径裸奔 | 全库统一：回收站/软删除 或 删除 toast 附撤销；与批量一致 |
| C2 | 确认双通道并存：plugin-dialog confirm() 12+ 处 vs window.confirm 6 处（AiProviderSettings/BackupPanel/FeedFragmentList/GoalDetail/NotePreviewView/VersionPanel） | App.tsx:179；各组件 | window.confirm 在 wry/WebView2 可能静默返回 false → 删除/恢复/回滚入口点击无反应 [需人工确认]；样式不统一 | 统一 plugin-dialog 或自绘 ConfirmDialog |
| C3 | 无确认直删散例：图文采集「放弃」整场级联丢弃（P1）、里程碑删除、会话图集单图、引用撤销；恢复通道全无 | PhotoCapturePanel.tsx:140-150；GoalDetail.tsx:113；ImageGallery.tsx:52-59；KnowledgeLinkSection.tsx:122-129 | 误触即永久丢失 | 确认三档：低危可逆=无确认+即时撤销；高危=确认；采集弃置累计>0 必确认 |

### D. 弹层体系与草稿保护〔P1×3〕
| # | 偏差 | 代表证据 | 影响 | 建议 |
|---|---|---|---|---|
| D1 | 概念/模型详情草稿仅点「保存更改」才落库；切换选中实体/外部刷新无脏检查整组覆盖未保存编辑（数分钟三问长文静默丢失） | KnowledgeDetailPanel.tsx:69-90；KnowledgePage.tsx:119-134 | 静默丢稿无拦截 | isDirty 守卫（切换前内联确认）或失焦自动保存 |
| D2 | 四类填写浮层（概念/模型/概念卡/记一次使用）遮罩/✕/取消一律直接关；ConceptDialog canClose 为死代码；多数弹层无 ESC/role=dialog/焦点陷阱；GroupCreateDialog 无 autoFocus 无 Enter 提交（同族组件却有） | KnowledgeConceptDialog.tsx:50-66；KnowledgeModelDialog.tsx:53-59；ModelCardCreateDialog.tsx:58-60；KnowledgeDecisionForm.tsx:159；全库 grep role=dialog=0 | 表单误触一键丢弃；键盘可达性差；同族不一致 | 抽 BaseModal（ESC/遮罩/焦点管理/Enter 提交）+ 脏守卫，逐弹层接入 |
| D3 | 目标系弹窗（访谈/审批/毕业）无 Esc/遮罩；✕ 静默丢 5 步答案无草稿；AI 规划在向导最终确认前先建库（异常才回滚）→ 孤儿+重复目标；毕业结果屏与父卸载同帧提交几乎不可见 [需人工确认] | InterviewDialog.tsx:79-95,116-143,148-156；GoalPlanApprovalDialog.tsx；GraduateDialog.tsx:44-46；GoalDetail.tsx:346-352 | 长输入丢失；污染列表与回顾流；高光仪式可能从未被看见 | 向导确认前零持久副作用（转待定草稿）；先渲染结果屏、onGraduated 移入「完成」按钮 |
| D4 | 概念名全库唯一仅后端强制，冲突把原始 error 拼进"创建失败:…"红块，无字段定位、无"关联既有"引导；表单错误一律聚合底部红块无字段级标红 | KnowledgeConceptDialog.tsx:7-8,131-135；KnowledgeDetailPanel.tsx:106,126；KnowledgeTreeView.tsx:301 等 5 处 | 重名高发却不知错在哪；多字段报错自行找字段 | 提交前/失焦查重（"与 XX 重名"+关联既有引导）；字段就近红字并聚焦 |
| D5 | 建体系向导 ✕/遮罩有"放弃?"确认、底部「取消」却绕行直关；树行内改名无 Enter/Esc；子节点新增无 autoFocus | KnowledgeSystemWizard.tsx:126-134,261-263；KnowledgeTreeView.tsx:168-176,207-212 | 同窗退出语义不一致；同树两套键盘语义 | 「取消」同走 doClose；改名补 Enter/Esc；新增输入统一 autoFocus |

### E. 笔记高频微操作与阅读"最后一公里"〔P1×2 + P2×13〕
| # | 偏差 | 代表证据 | 建议 |
|---|---|---|---|
| E1 | 新建笔记无焦点（主编辑器无 focus()，降级 textarea 才有）——"零对话框即建即写"闭环断链 | NotesPage.tsx:338-353；RichEditorView.tsx:299-313 | CM 挂载后 focus() |
| E2 | 笔记改名 3 步化（打开→编辑→改标题）；组行却有内联改名；列表无 F2 | NoteRowContextMenu.tsx:126-150 | 右键"重命名"+F2 内联（复用组改名 IME 守卫） |
| E3 | 组过滤态下"+ 新建"清过滤落"未分组"，无"在此组新建" | NotesPage.tsx:339-353；NoteListView.tsx:448 | 组过滤激活时新建归组并保留过滤 |
| E4 | 正文命中搜索只显标题行，无 snippet/命中高亮；A6 注意力数据仅 console.debug | NoteListRow.tsx:113-140；useNoteAttention.ts:22-27 | 行内 snippet+<mark>；"最近浏览"排序 |
| E5 | A1 段合并/拆分只在 CM 失败降级的 textarea；主编辑器无；无划选浮层/段落 hover 动作 | RichEditorView.tsx:125-138 vs NoteEditView.tsx:163-185 | CM 补 merge/split；划选浮层（粗体/荧光/链接） |
| E6 | 编辑态无法插入任务框；勾选仅阅读态 | RichEditorView.tsx:241-297 | 工具栏"▢ 任务"+Ctrl+Enter 行首转 `- [ ]` |
| E7 | 降级 textarea 无草稿层（draftStore 仅主编辑器引用）；无未保存离开提示 | draftStore 引用点 | 草稿层下沉共用 |
| E8 | 自动保存无"保存中/已保存"指示；"保存失败/图片导入失败"也渲染成绿色（固定 #047857） | RichEditorView.tsx:289-315；NoteEditView.tsx:404 | 保存态指示；成功/错误双色分离 |
| E9 | `[[ts:ms]]` 芯片只传 sessionId、ms 链路丢弃，仅打开会话页——宣称"时间戳可跳转/追溯视频时间点"未兑现 [需人工确认会话页有无 seek] | NoteMarkdown.tsx:190-207 → App.tsx:352-361 | 链路带 ts，会话页打开定位/高亮对应片段 |
| E10 | 大纲锚点对含内联格式（**/==高亮==）标题匹配失败，点击静默无跳转 | NoteReadingView.tsx:82-96 vs NoteMarkdown.tsx:107-135 | 文本归一化匹配或按索引挂锚 |
| E11 | 引用块/深层结构内任务行不计索引→勾选改写错行或静默无效 [需人工确认 remark-gfm 行为] | NoteMarkdown.tsx:98-105,137-150 | 渲染计数回查源行双向对齐 |
| E12 | 每勾选任务=1 版本快照；若 bump updated_at 列表重排行跳顶 [需人工确认] | NotesPage.tsx:283-291 | 勾选走轻量保存/合并提交 |
| E13 | 图片灯箱单图 contain 无缩放/翻页 | ImagePreviewOverlay.tsx:26-66 | 滚轮缩放 + ←/→ 同笔记翻图 |
| E14 | 主文全宽 + 14/1.8（规格 15/22、限宽 720–900） | NoteReadingView.tsx:243；NotesPage.tsx:472 | 限宽居中 + 排印对齐（并入 A3） |

### F. AI 交互一致性〔P1×2 + P2×12〕
| # | 偏差 | 代表证据 | 建议 |
|---|---|---|---|
| F1 | 同一"精修/补充"能力入口参数模型分裂：对话页仅目标下拉+原生 confirm（恒默认档、补充固定九子项），工作台却有档位/意图/旋钮/画面理解选择；且精修框内误显示"补充默认九子项"文案 | TaskLaunchDialog.tsx:84-88,127-131 vs RefineLaunchDialog.tsx:197-260 | 复用同一启动器或明确"按默认档执行"；修正文案 |
| F2 | 授权卡文案硬编码"上传…至 DeepSeek"，BYOK 多 Provider 下同意书谎报接收方（信任红线） | EnrichPanel.tsx:240 | 文案取当前 Provider 名或改通用表述 |
| F3 | partial_failed 任务在侧栏/dock 恒显"…"伪进行中（无终态、无重试）；aborted 无继续/重新生成；失败重试路径碎片化（各处入口不同/置灰/仅提示"到 AI 对话页"） | ChatSidebar.tsx:141-143；AiConversationDock.tsx:161-176；ChatMessageList.tsx:92-104；AiTaskPanel.tsx:167-171 | 统一终态语义与重试（就地可重试或明示去向） |
| F4 | 无复制按钮（消息/代码块）；流式每帧强制 scrollIntoView(smooth)（无法上翻历史）；chatBlink keyframes 全库无定义（打字光标不闪烁） | ChatMessageList.tsx:57-60,106-134,147 | 复制按钮；距底阈值判断再滚；补 keyframes |
| F5 | 编辑重发无模式条/无取消，后续任意发送都带 resendMessageId [需人工确认后端截断语义] | ChatPage.tsx:274-280,340-343 | 编辑态横幅+取消；与普通发送视觉区分 |
| F6 | 模型下拉仅 Provider 级；侧栏首条消息后不刷新（流终态只 loadMessages）[需人工确认后端自动命名]；追问入口 10 分钟窗口即消失且预填跨会话语境 | ChatPage.tsx:97-100,165-167,402-415；TaskThreadCard.tsx:43-49 | 级联模型选择；流终态刷新；任务详情常驻追问+预填绑来源会话 |
| F7 | 采纳前预览硬截断尾部 800 字符，插入位置不可见；「💬 查看提示词」死按钮（onClick 空）；成本确认不显示将用哪个 Provider/模型 | EnrichPanel.tsx:308-310；RefineWorkbench.tsx:323-330；RefineLaunchDialog.tsx:263-278 | 可展开全量预览；接跳转或移除；发起处显示模型身份 |
| F8 | 云端首次同意一次性 localStorage 记忆，无重置入口（换 Provider 不再复问） | ChatPage.tsx:53-57,268-273 | 设置页提供重置或"本次/总是" |
| F9 | 30s 卡住与错误文案直出开发者语（"请查看 tauri 终端日志"、raw String(e)） | AiRefineCard.tsx:100-103；EnrichPanel.tsx:75-78 | 用户可理解文案+自助动作 |

### G. 会话/课堂助手〔P1×1 + P2×6〕
| # | 偏差 | 代表证据 | 建议 |
|---|---|---|---|
| G1 | 图文采集「放弃」无确认即级联丢弃整场截图集合（与删除会话带确认双重标准） | PhotoCapturePanel.tsx:140-150 | 累计>0 时 confirm（列明将删 N 张）或撤销 toast |
| G2 | 录制中会话可勾选入批量删除（无豁免/警示）[需人工确认后端行为] | SessionListPanel.tsx:245-251；SessionsPage.tsx:245-268 | 过滤录制态并提示"先停止再删除" |
| G3 | 停止单点即停无确认/撤销；暂停与停止三钮紧邻 | ClassroomCapturePanel.tsx「⏹ 停止」按钮组〔拆分前 = ClassroomPage.tsx:651-665〕；CaptureFloatPanel.tsx:72-76 | 停止后融合前留 5s「撤销/继续」出口或强视觉分离 |
| G4 | 计时=墙钟差：暂停照走、停止不清 ref，跨会话累加 | LiveActivityPanel.tsx:146-151,153-157,287 | 维护累计活动时长；stop/失败重置 |
| G5 | OCR 画面检索命中宣称"点击跳详情"却不定位命中屏（锚点已存在无人消费） | SessionListPanel.tsx:439-455；SessionDetailPanel.tsx:457 | openDetail 带屏锚点 scrollIntoView |
| G6 | 就绪清单仅挂载检查+手动⟳，与同页内联模型卡下载完成态冲突（上卡红✗下卡✓并存） | ReadyCheckCard.tsx:111-155；ClassroomCapturePanel.tsx（页内流式模型卡：未就绪缺件/下载中/⟳ 重试）〔拆分前 = ClassroomPage.tsx:208-217〕 | 订阅下载事件/回页面自动复查 |
| G7 | 采集中窗口卡仍可改选（无效果无提示）；时间轴纯文本不可点、无回听/段↔屏联动（音频保留 30 天却无播放消费路径） | ClassroomCapturePanel.tsx（采集中状态行「● 正在采集（实时内容见右侧面板）」）〔拆分前 = ClassroomPage.tsx:547-553〕；SessionDetailPanel.tsx:416-435,451-558 | 采集中锁定并标注目标；行点击联动同时间屏卡 |

### H. 体系/复习/目标（除 D 外）〔P1×4 + P2×20〕
| # | 偏差 | 代表证据 | 建议 |
|---|---|---|---|
| H1 | 「重新访谈」编辑态零预填（名称/期限/答案全空，5 步全重问）——抑制迭代循环 | GoalDetail.tsx:337-344；InterviewDialog.tsx:47-58 | 预填现值；提供"只重判据"短流程 |
| H2 | feed「升为闪卡」成功/素材不足均零反馈、无已升标记 | FeedFragmentList.tsx:137-153,202-210 | 成功 toast+已升徽标；n=0 给原因 |
| H3 | 答「忘了」的卡直接出队不重回本轮（Anki: again 分钟级当日重学）；Esc/遮罩退出与注释意图不符（revealed 态误按整轮退出） | ReviewSessionOverlay.tsx:37,75-76,51-58 | again 排本轮尾部；revealed 态首次 Esc 先确认 |
| H4 | 已有全局体系时侧栏"＋新建体系"仍开全局向导→三步走完必然后端报错（必败漏斗） | KnowledgePage.tsx:247-249；KnowledgeSystemWizard.tsx:105-109 | 有全局体系时导向新建领域体系或禁用+文案 |
| H5 | 级联删/日志删 confirm 但不可逆；引用「撤销」无确认即删；体系归档无恢复入口；级联删除零恢复通道 | KnowledgeTreeView.tsx:124-133；KnowledgeDecisionLog.tsx:56-64,93；KnowledgeLinkSection.tsx:122-129 | 级联删除入回收站/软删或 5s 可撤销 toast（并入 C 方案） |
| H6 | 引用行只渲染类型徽标+裸 #id（组名已加载未用）→无法核对挂接目标 | KnowledgeLinkSection.tsx:105,136-140 | 行内显示目标名；撤销带归属确认 |
| H7 | 决策表单引用=四组全量 checkbox 无搜索；碎片 limit:500 静默截断；候选池点一个「+」清空全部（收 1 丢 4）；日志只读 ellipsis 无展开/分页 | KnowledgeDecisionForm.tsx:101,180-199；FeedFragmentList.tsx:83,265；VocabManager.tsx:66-77；KnowledgeDecisionLog.tsx:48-96 | 复用 LinkEntityPicker 范式；分批/加载更多；候选逐条移除 |
| H8 | 概念/模型无删除入口只能 archived（归档静默承担删除语义）[需人工确认页级入口]；模型状态下拉英文原值同屏中英混杂；"暂不落库"黑话 | ConceptCardRow.tsx:27-50；KnowledgeDetailPanel.tsx:249-251；PromoteCardButton.tsx:26 | 删除+级联声明或归档说明化为一等出口；状态中文 |
| H9 | 画布/图谱连线只读（connectable=false）无建线/删线/undo；无框选/多选/新建入口；概念/模型禁拖但界面称"位置由你决定"；刷新每次 fitView 重置视野；焦点外节点须先点空白再点目标 | KnowledgeCanvasView.tsx:373-399,199-206；KnowledgeGraphView.tsx:98-105,113-133,155-178,205 | 规格已知边界——**需产品裁决**（补连线管理+撤销；多选批量拖；fitView 仅首次/显式） |
| H10 | 画布防抖自动保存无指示、卸载 flush 无 catch；「布局」onChange 即全量覆盖手摆位置写库，危险提示仅 select title 无确认无撤销 | KnowledgeCanvasView.tsx:128-161,301-340,408-417 | 保存指示+兜底报错；重排前确认或并入撤销栈 |
| H11 | 里程碑勾选 await 后端整页刷新（非乐观）；毕业/启动禁用原因仅 title（disabled 下 tooltip 常不显示）；里程碑/解绑直删无确认 | GoalDetail.tsx:89-92,113-115,304-306 | 乐观更新+失败回滚；行内禁用原因；删除确认+级联 |
| H12 | AI 规划"新建体系"确认前只显示名称/计数摘要，概念三问不预览即落库；周契约无解约入口、断签后无恢复引导；任务完成反馈卡 10 分钟后消失、排队任务无取消 | GoalPlanApprovalDialog.tsx:127-141；WeekContractCard.tsx:98-111,167-174；TaskThreadCard.tsx:43-50,87-105 | 展开预览；断签小结+重新立约；完成卡常驻近 N 条+取消排队 |
| H13 | 模型下载仅"处理中…"无进度；已下载未加载仍显「下载」诱导重复；全量重建无确认；复制示例中途失败留半成品 | LearningLibraryEngineSection.tsx:90-107；LearningLibraryPanel.tsx:110-142；KnowledgeSampleView.tsx:59-101 | 进度条+状态机按钮；重建确认；失败清理/删除入口 |
| H14 | 任务启动串联最多 2 个原生 OS confirm（授权+成本）割裂体验；ai_set_authorized 失败被 .catch 吞掉仍继续启动（假授权致后续莫名失败） | TaskLaunchDialog.tsx:62-82,70 | 合并一次应用内确认；授权失败中止报错 |
| H15 | 问题树每行常显 ➕✏️🗑 emoji 三键（视觉噪声+误触面）；残留"毕业仪式 M2"过时文案与已上线仪式并存 | KnowledgeTreeView.tsx:183-188；GoalDetail.tsx:159 | hover 显现或收进"⋯"菜单；清理残留（P3） |

### I. 反馈与状态可见性（跨域）〔P2〕
- 全局 toast 仅 AI 任务专用（导航栏内嵌文字）；成功操作常无回执；错误信息出现在列表最底部（视觉盲区）〔generic#11〕
- 空态无统一组件：8 处抽查全 11-13px 灰字无行动按钮（"暂无笔记/暂无会话"），整页级空态反而合格〔generic#12〕
- 右键语义三套：笔记行=自绘完整菜单、组行=ⓘ 弹层、会话行=直接开详情（无菜单）；原生右键被全局抑制后大面积区域静默〔generic#10〕
- 深链（跨页直达）无"返回来源"入口、无前进/后退心智；窗口标题固定不随当前对象（笔记/会话标题）更新〔shell#6,#14〕

---

## 2. 汇总统计

| 域 | P1 | P2 | P3 | 亮点数 |
|---|---|---|---|---|
| 壳层/导航 | 1 | 13 | – | 10 |
| 会话/课堂助手 | 1 | 7 | 9 | 9 |
| 笔记 | 2 | 17 | – | 10 |
| 体系/复习/目标 | 8 | 23 | 2 | 12 |
| AI 交互 | 2 | 13 | 5 | 8 |
| 通用交互基座 | 7 | 8 | – | 7 |
| **原始合计** | **21** | **81** | **16** | — |
| **去重合并后主题**（§1 A–I） | **约 14** | — | — | — |

---

## 3. 亮点（不动清单，代码实证）

1. 笔记多选三通道（Ctrl/⌘/Shift 区间/组头划选）+ 批量操作锚定可见序、折叠组排除——超多数桌面笔记应用
2. 保存四层保险（2s 防抖/30s maxWait/卸载保存/三出口先落库再刷新 + 草稿恢复条）；双编辑器统一接口、CM 失败降级不白屏
3. 版本链超常规：来源徽标/双版 diff/回滚不破链/AI 成本透明
4. 删除文案诚实透明：级联语义说清、笔记保留明示；组删除自绘确认展示级联影响
5. 停止→融合→直达详情/笔记的跨页闭环 + focus 深链消费即清 + 命中词注入高亮
6. 采集多信号可见（红点/VU/三类横幅/暂停恢复语义）+ starting/stopping 看门狗 + 防双击
7. BrowserChrome 文本右键菜单（剪切/复制/粘贴/全选 + 边界裁剪 + ESC 收起）质量高
8. 复习面克制诚实（四档 FSRS、间隔推进透明、升格按钮不打断评分流）；组内改名带 IME 守卫（全仓范式，可惜未推广）
9. 授权红线体系（画面理解独立闸门默认关、文案条件化不虚称、同意卡在设置页）；失败四类引导+本地规则版兜底
10. 引用挂接防呆（重复目标前置拦截、范围切换+计数）；问题树行内操作零弹窗；空态与上手路径（摄影示例只读浏览/主动复制）全站最佳
11. 状态保持（display:none 常驻挂载不丢列表/滚动/草稿）、列布局宽度/折叠记忆 + 窄窗自动折叠
12. 周契约"断签不清零+本周自…起"承诺式文案；毕业报告快照永久保留

---

## 4. 需产品裁决清单

| # | 裁决项 | 选项 | 备注 |
|---|---|---|---|
| D1 | **ui-ux-system.md 权威状态** | ① 视为愿景、代码先行（回写规范为"目标态"并标注版本差距）② 本轮启动基座落地（tokens/主题/空态/骨架/hover/焦点） | 两套色系并存已造成持续漂移；AGENTS.md 规定"规范与代码冲突以规范为准；规范过时先改规范" |
| D2 | **删除哲学** | ① 全库软删/回收站+撤销 toast（推荐，两全规格与安全）② 维持直删但全路径补确认 ③ 保持现状 | 规格 §2.3"体面无确认"需相变动效+可逆兜底才成立 |
| D3 | **导航形态** | ① 维持顶部 Tab（改规范）② 迁移左 rail（大动）③ 折中：顶部保留但压缩/溢出策略+键盘 Tab 切换 | 与市场惯例最相关的一项 |
| D4 | 复习面键盘化（空格/1-4）| 做 / 延后 | Anki 心智，成本低 |
| D5 | 画布/图谱连线与多选 | 补能力 / 维持规格边界但补"如实引导" | 规格明示不做连边——若维持需产品背书 |
| D6 | 大纲回归评估 | guide 已下线大纲（v0.11.5+）；是否作为笔记导航回归 | 笔记阅读"最后一公里"依赖它 |
| D7 | `[[ts]]` 证据回链精确定位（会话页 seek/高亮） | 做 / 延后 | 兑现"每句话可追溯"核心承诺 |
| D8 | Enter 发送语义（对齐 DSH/DeepSeek Web 的有意选择）| 维持 / 提供开关 | 与桌面聊天惯例相反，需产品背书 |

## 5. 需真机/人工验证项（定级前置）

- window.confirm 在 wry/WebView2 的真实行为（静默 false or 原生弹窗）
- delete_session 对录制中会话的实际行为；任务勾选是否 bump updated_at（行跳顶）；chat_regenerate 定位语义；会话自动命名时机
- GraduateDialog 结果屏是否真不可见（React 批处理运行验证）；ChatSaveNoteDialog/RefineLaunchDialog/TaskLaunchDialog 等 ESC 实况
- 折叠列手柄/顶栏拥挤的视觉实况；remark-gfm 在 blockquote 内 checkbox 渲染实况；概念/模型删除的页级入口是否存在

## 6. 建议修复路线（按批）

- **批 1（数据安全，最优先，改动小）**：C1/C2/C3 + G1 + H5 级联——删除统一确认渠道；单删与批量一致；采集弃置确认
- **批 2（中文输入与键盘冲突）**：B1（Ctrl+Shift+S 冲突，单点修复）+ B3（IME 守卫统一，抽 hook 替换 8 处）+ B2 可见性门控
- **批 3（弹层与草稿保护）**：D1/D2/D3/D5——BaseModal + 脏守卫 + 向导副作用时序（AI 规划后置、毕业结果屏分离）
- **批 4（高频微操作，笔记/复习）**：E1 新建聚焦、E2 原地改名+F2、E5 划选浮层与 CM 段操作、B5 复习键盘化、E6 任务框
- **批 5（AI 一致性）**：F1（同能力同启动器+文案修复）、F2 授权文案、F3 终态/重试语义、F7 死按钮
- **批 6（基座治理，大）**：A1–A4 tokens/主题/导航裁决后落地/滚动条/空态/骨架/hover/焦点
- **批 7（阅读与回链最后一公里）**：E9 ts 精确定位、E10 大纲锚点、E13 图片灯箱、E14 限宽排印、G5 OCR 命中定位、G7 时间轴回听（需音频播放能力裁决）
- **批 8（其余 P2/P3）**：按域认领（会话计时 G4、体系 H3/H4/H7/H10-H13、AI F4-F9、反馈 I）

---

## J. 布局与视觉专项审计（2026-09-05 第二轮补充）

> 补充审计 3 个并行审计员：壳层/窗口布局 · 7 页页面级布局 · 排版/间距/视觉系统（静态只读，证据带 文件:行；[需视觉确认] 为运行态推断）。原始报告存于 2026-09-05 讨论会话。

### J0. 布局维度顶层结论

1. **壳层结构与规格 §一 结构性背离且无 ADR**：实际 = 顶部 56px 7 Tab（App.tsx:38-48,223-309）+ 每页自持栏；规格 = 240px 可折叠左导航 + 720–900 居中主栏——"导航栏"这一栏在全局根本不存在，三栏规格退化为两栏模型。
2. **主内容限宽零落地**：全宽（会话详情/笔记阅读/目标详情/课堂转写/知识中列）· 640 局部（课堂右栏部分分支）· 720 左对齐（设置页）· 气泡 86%（对话）**四档并存**，无一居中限宽 720–900。
3. **视觉系统"文档化但零落地"**：`--ed-*` tokens 0 命中、SVG 图标 0 个、emoji 310 处/93 文件、60 个硬编码 hex 并行、**83% 字号 ≤12.5px**（10px 文本 95 处）、1933 处内联 style、App.css 死代码（未被 import，含 GBK 乱码孤儿规则）。规范文件与实现全面背离，非局部 bug——须按"建 tokens + 抽图标层 + 字号 scale"三条线治理，勿逐组件微调。
4. **好消息**：可调列基础设施成熟（useColumnLayout + ColumnResizer 键盘微调/双击复位/折叠记忆，质量超多数 MVP），4 页在用；7 页全部 master–detail 主从结构一致；笔记三栏已近 Obsidian 心智。

### J1. 壳层/窗口发现（严重度已归一为 P1/P2/P3）

| # | 位置 | 现状 | 偏差与影响 | 建议 | 严重度 |
|---|---|---|---|---|---|
| J1-1 | tauri.conf.json:13-19 | 主窗 960×720 无 min 尺寸（规格最小 960×640） | 窄窗下 560px 固定 dock 超视口内容不可达 | 补 minWidth/minHeight | P1 |
| J1-2 | main.tsx:5；App.css（死代码）；CaptureFloatPanel.tsx:57-65（浮窗已自修） | 无 html/body 重置：body UA 8px margin + 100vh → 整窗疑常驻纵向滚动条/底缘白条；6px 细滚动条规格全站未实现 | 主窗漏修、滚动条规格空转 | 全局 `html,body,#root{margin:0;height:100%}` + 细滚动条 | P1 |
| J1-3 | NotesPage.tsx:92,481-482 + NoteReadingView.tsx:124 | 大纲列折叠后点 ColumnBar 仅翻 manualFolded；autoFoldBelow:1100 在默认 960 窗常折叠 → **折叠后永不展开（交互死局，默认窗口看不到大纲）** | 与同 hook 自带的 expand() 语义相悖 | onToggleOutline 改调 outlineCol.expand() | P1 |
| J1-4 | App.tsx:223-309 | 品牌+7Tab+双 marginLeft:auto 状态件挤 56px 单行，无响应式（≈925-950px 静态预算） | 960 临界；徽标/toast（≤420px）出现即压缩裁切 | 窄窗收为图标钮+tooltip；徽标/toast 移出导航行 | P2 |
| J1-5 | AiConversationDock.tsx:36,242-244 | 560px 固定覆盖层：不挤压内容、无 scrim、无 Esc、不可调、不记忆 | 默认 960 窗遮挡 58% 且被遮内容仍可点击；语义是"遮挡"非"跟随" | 开合让内容让位或宽 clamp；补 Esc/点外关闭 | P2 |
| J1-6 | NotesPage.tsx:92 + NoteReadingView.tsx:126 | outline hook 声明 140-260 可调+持久化，组件硬编码 180、无 resizer 接线 | 大纲宽度记忆永不生效（假可调） | 接线拖拽或删钩子只留折叠 | P2 |
| J1-7 | App.tsx:289-308 | AI toast 内联导航行（maxWidth 420） | 挤导航；3.5s 消失行内跳动 | 提为 fixed 通知层 | P2 |
| J1-8 | NotesPage:395/AiConversationDock:242/App:225 | calc(100vh-56px) 等 56px 魔数硬编码三处 | 导航高变更需同步多处 | --nav-h CSS 变量 | P3 |
| J1-9 | ColumnBar.tsx:20-36 | 折叠窄条 26px/11px 竖排字 | 命中区过窄（市场 rail 32-44） | ≥32-36px | P3 |

### J2. 页面级布局发现（7 页快照要点 + 跨页一致性问题）

| # | 位置 | 现状 | 建议 | 严重度 |
|---|---|---|---|---|
| J2-1 | 各页主内容（Sessions:301、NoteReadingView:243、GoalDetail:144、Knowledge 中列、LiveActivityPanel:383、ClassroomRightPane:89） | flex 全宽无 maxWidth（宽窗 1500px+ 超长行） | 内容滚动区统一 wrap：maxWidth 720–900 + margin:auto | P1 |
| J2-2 | 壳层 App.tsx vs 规格 §一 | 无左导航列 | 引入 240px 左导航或回写规格（裁决 D3） | P1 |
| J2-3 | SessionsPage:301 vs NoteReadingView:243 | 详情滚动在外层（会话标题/转笔记/删除随滚消失）vs 内层粘性头 | 详情头固定仅正文滚动 | P2 |
| J2-4 | SessionsPage:311-388、NoteListView:428-472 | 列表列 chrome 2–3 层 ≈120-132px 固定；按钮 24-33px | 合并搜索/筛选单行工具栏；按钮统一 36px | P2 |
| J2-5 | GoalsPage:80 | 左列 380 固定：不可拖/折/记忆/无窄窗兜底（其余 4 数据页均已接入 useColumnLayout） | 接入 useColumnLayout | P2 |
| J2-6 | ChatSidebar:63 | 侧栏 240 固定不可调/折叠；行高 29px | 接入 useColumnLayout + autoFold；行高 ≥36 | P2 |
| J2-7 | ClassroomRightPane:60/81/114 vs 89-111 | 同右栏 640 与全宽分支混用（状态切换宽度跳动） | 统一 wrapper | P2 |
| J2-8 | ClassroomBanners.tsx（页面级横幅叠放）+ ClassroomSourceColumn.tsx（六模块纵向堆；模型四态卡见 ClassroomCapturePanel.tsx）〔拆分前 = ClassroomPage:498-529,531〕 | 4 类横幅可叠 + 6 模块纵向堆 | 横幅合并/置底，采集入口首屏可达 | P2 |
| J2-9 | 弹窗组（13 个） | 宽度 340–680 五档以上、遮罩/圆角/居中/限高各表（680 破规格 560） | 定 S/M/L 三档 + 统一 overlay/radius | P2 |
| J2-10 | KnowledgeDetailPanel:130-138 | 折叠 34px 窄条 + 折叠态不持久（其余列 26px+记忆） | 并入 detailCol hook | P3 |
| J2-11 | 页头三套（固定 44/padding 式/无）+ 行高三档（29/44/56）+ 空态五套 + 高度链 calc 与 100% 混用 | 跨页观感参差 | 页头统一 44/48、列头 40、行高统一、EmptyState 组件 | P2/P3 |

### J3. 排版/间距/视觉系统发现

| # | 位置 | 现状 | 建议 | 严重度 |
|---|---|---|---|---|
| J3-1 | 全站 | tokens/data-theme/规格双色 0 命中；App.css 死代码（.ed-low-confidence 从未生效） | 建 tokens.ts + CSS 变量层 + data-theme，逐步替换内联色值 | P1 |
| J3-2 | 全站 | 品牌色 teal #0D9488（规格靛蓝 #3B5BDB）；60 个硬编码 hex 并行（语义双色漂移，重点全重） | 回写 §十 双色语义（红=危险保留，紫=概念可议） | P1 |
| J3-3 | 全站字号 | 1062 处 fontSize 字面量 19 档；83% ≤12.5px；10px×95、11px×400（中文 10-11px 可读性差）；全 px 无 rem（§九 200% 缩放破） | 定 4-5 档字号 token；消灭 <12px 正文 | P2 |
| J3-4 | 全站图标 | 0 个 <svg>；310 emoji/93 文件作导航/按钮/徽标/状态（跨平台渲染不一致、无法语义着色、排版抖动） | 引入 SVG 线性图标集；emoji 仅留内容语境 | P2 |
| J3-5 | 间距 | 8px 网格零落地（10 14/5 10/2 8/3 6 泛滥） | 间距 token 化（4/8/12/16/24） | P2 |
| J3-6 | 对比度 | #9CA3AF 2.5:1×207、#D1D5DB 1.7:1（大纲空态）、#0D9488 on #F0FDFA ≈3.5:1（§九 正文≥4.5:1） | 次要文本 #6B7280 起步；标签底加深 | P1（元信息大量不可达 AA） |
| J3-7 | 组件高度 | 按钮实高 ≈26-30px、chip ≈16-17px、树行 ≈30px（规格 36/40/22/44） | 行 44、次级操作 ≥32 | P3 |
| J3-8 | 阅读排版 | 主文 14/1.8（规格 15/22）；h4-h6 无样式层级塌陷；时间回链 teal 药丸（规格琥珀脚注式）；暗色主题全空转 | 排印对齐规格；证据感语义（琥珀）恢复 | P2 |

### J4. 布局亮点（保留清单）

- ColumnResizer：键盘 ←/→ ±16（Shift=8）、双击复位、pointer capture、REQ-285 增量修复——含键盘微调的拖拽体系，优于多数市场桌面端
- useColumnLayout：manual/auto 折叠分离 + localStorage 记忆 + expand() 清双态（NotesPage:92 大纲列消费偏差是唯一病点）
- 浮窗窗口生命周期：双形态联动 setSize、边缘吸附、工作区钳制防丢窗、"绝不把用户留在无可见窗口"回显兜底
- 列内独立滚动 + flexShrink:0 头部纪律；窄窗 autoFold 阈值（860/700/1100）成体系
- 7 页全部 master–detail 主从结构；KnowledgePage 整页空态全站最佳
- 内容渲染层"会排版"：表格/代码块/blockquote/搜索 mark/荧光笔 12 色 WCAG 系统 + tabular-nums 部分合规

### J5. 布局维度裁决与批次建议（并入 §4/§6）

- 裁决 D9：**主内容限宽统一策略**——① 阅读/详情类统一 720–900 居中 wrap（推荐，市场通识）② 维持全宽
- 裁决 D10：**图标语言**——引入 SVG 线性图标集（大改，涉及导航/按钮/徽标全站）③ 维持 emoji（回写规格 §八）
- 布局修复并入批 6（基座治理）：J1-1/J1-2/J3-1/J3-2/J3-3/J3-6 为必做项；J1-3（大纲折叠死局）与 J1-6（假可调）为**单点高价值修复，可独立提前**
- 页面级：J2-5/J2-6（Goals/Chat 列接入既有基础设施）成本低收益直感，可提前；J2-3 会话详情粘性头独立可做
