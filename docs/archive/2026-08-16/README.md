# 2026-08-16 归档索引

> 归档对象：课堂助手识别升级（P0/P1/P2 全部完成 ✅）+ PWA 移动端 MVP 设计/计划 + 配套知识卡 + 评估基线

## 归档内容

- 实施计划：2026-08-16-classroom-recognition-upgrade.md（P0 7/7、P1 9/9、P2 8/8 全部完成，2026-08-16 状态更新）
- 设计文档：2026-08-16-classroom-recognition-upgrade-design.md（已实施配套 spec）
- 知识卡（已验收实施文档）：
  - 2026-08-local-ocr-integration.md（P2-1 本地 OCR 完整实现：PP-OCRv5 det/rec 联调验证）
  - 2026-08-classroom-recognition-review.md（六维审查报告：6 项发现已修复 + 3 项遗留观察备案）
  - 2026-08-mixed-language-spike.md（P1-4/1-5 说话人重识别与中英混说 spike 结论）
- 评估基线：BASELINE-2026-08-16.md（P0-1 评估基线工具产出，CER + 热词命中率基准）
- PWA 移动端 MVP（实施完成 ✅，T0–M4 代码落地 + 门禁全绿）：
  - 实施计划：2026-08-16-pwa-mobile.md（T0 前置验证 → M1 基建+番茄钟 → M2 笔记+同步 → M3 课堂助手 → M4 联调发布，全部完成）
  - 设计文档：2026-08-16-pwa-mobile-design.md（v4 定稿，音频源决策：录屏导入为主 + 麦克风应急）

## 技术债摘要

- 继承（carried）：TD-001 WebGPU 渲染后端回退（P3，有意）
- 新增（open）：TD-002 课堂 hook 超行规范（P3）/ TD-003 本地 OCR 推理管线骨架态（P2）/ TD-004 VLM 分类待替换（P3）/ TD-005 WebCaptureAdapter 尾段丢失+暂停未接（P2）/ TD-006 视频上传未复用 401/429 处理（P3）/ TD-007 剪藏 innerText 无截断（P3）
- 详见 tech-debt.md

## 备注

- 不归档：窗口识别优化设计/计划（实施进行中）；PWA 发布清单（pwa-mobile-deployment.md）保留活跃——含待执行的真机验证（V1–V8）与部署前置（D1–D4）
- 归档文档内部断链已修正（plan↔spec 相对链接、review/BASELINE 路径引用）
