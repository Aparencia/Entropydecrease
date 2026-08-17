# 技术债清单（权威：2026-08-17）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 昨日（2026-08-16）债务已逐条核对：TD-001 今日无偿还提交（无 WebGPU/WebGL 相关变更），继承为 carried；TD-002/003/004/008 均无相关变更，继承为 carried。

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-001 | WebGPU 渲染后端因 R3F 兼容性回退 WebGL；GPU 粒子已先迁 vertex shader，待 three/R3F 生态成熟后重试 | 有意 | P3 | 2026-08-10 | carried |
| TD-002 | useClassroomEvents.ts（596 行）/ useClassroomCapture.ts（355 行）/ modelManager.ts（323 行）超 300 行规范；建议下个迭代把场景处理/修正回写/说话人标注拆子 hook | 腐化 | P3 | 2026-08-16 | carried |
| TD-003 | P2-1/2/3 本地 OCR 推理管线骨架态：模型文件未随仓库分发需环境联调；公式引擎与版面解析未接入（依赖 P2-1）；P2-6 输入事件触发需安全评审后实施（降级契约完整、零回归） | 环境变化 | P2 | 2026-08-16 | carried |
| TD-004 | P2-5 VLM 分类：规则版已上线达标（≥80%），VLM 版待本地 VLM/网关视觉端点就绪后替换（接入路径已文档化） | 环境变化 | P3 | 2026-08-16 | carried |
| TD-008 | IPC_CHANNELS.WINDOW_MEMORY_RECORD/CLEAR 在 channels.ts 定义，但 screenCaptureHandlers.ts 使用原始字符串而非引用常量，重命名不同步风险 | 无意 | P3 | 2026-08-16 | carried |
| TD-009 | P2-⑦ 多格式导出（Anki 优先/Markdown 次之）未实施；闪卡 front/back/cloze 结构与 apkg 导出路径已文档化（随增强策略文档归档） | 有意 | P2 | 2026-08-17 | open |
| TD-010 | 时间戳格式化三处新增重复实现（UnifiedTimeline/SegmentList/ClassroomPage），未收敛到 lib/utils/time 的 formatTimeWithSeconds；且 toLocaleTimeString 缺 hour12:false（en-US locale 下破坏 [HH:MM:SS] 契约） | 腐化 | P3 | 2026-08-17 | open |
| TD-011 | UnifiedTimeline.tsx（399 行）/ sessionAnalyzer.ts（321 行）/ smartSampler.ts（307 行）超 300 行规范；批量插入区块与页级切分逻辑建议下次重构拆子组件/子模块 | 腐化 | P3 | 2026-08-17 | open |
| TD-012 | SegmentList.tsx 头注释过期（L6 仍写"当前落地为复制剪贴板"，实际已改为打开笔记弹窗），误导维护者 | 无意 | P3 | 2026-08-17 | open |
| TD-013 | NoteInsertDialog rawContent 语义不一致：fine 路径勾选 3 段插入后切"原始转写"tab 显示全量 segments（非选中集），用户困惑 | 无意 | P3 | 2026-08-17 | open |

## 今日已偿

| ID | 摘要 | 偿还提交 |
|----|------|----------|
| （无） | 今日无已偿债务 | — |
