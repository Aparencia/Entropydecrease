# 技术债清单（权威：2026-08-18 第二轮，代码审查后滚动）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：重构区 v0.2.0 代码审查产出（2026-08-18 第二轮审查，7 维度 + CodeReview 子代理）。

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-001 | process_to_note 单图 OCR 失败静默吞错（if let Ok 丢弃错误，用户无感知） | 无意 | P1 | 2026-08-18 | carried |
| TD-002 | AGENTS.md 未同步窗口枚举模块（windows.rs / list_windows 未登记 §10 审查清单） | 腐化 | P2 | 2026-08-18 | carried |
| TD-003 | NotesPage 搜索无防抖且存在响应竞态（慢响应可能覆盖新结果） | 无意 | P2 | 2026-08-18 | carried |
| TD-004 | App 页面切换重挂载导致重复窗口枚举（每次切换 100-500ms 停顿） | 无意 | P2 | 2026-08-18 | carried |
| TD-005 | command 层入参未校验（旧 command 仍缺；新增 command 已补校验，部分偿还） | 无意 | P1 | 2026-08-18 | carried |
| TD-006 | build.rs OUT_DIR ancestors().nth(3) 依赖 Cargo 内部目录结构，变更时静默失效 | 有意 | P3 | 2026-08-18 | carried |
| TD-007 | 窗口枚举未过滤系统窗口噪声（Program Manager 等进入"全部"列表） | 无意 | P3 | 2026-08-18 | carried |
| TD-008 | DXGI staging 纹理 BindFlags=RENDER_TARGET / MiscFlags=SHARED 对 STAGING usage 无意义，可能创建失败静默降级 GDI（审查 L1） | 无意 | P2 | 2026-08-18 审查 | open |
| TD-009 | resample_linear 未防御 src_rate=0：ratio=0 → out_len 溢出 → Vec::with_capacity panic（审查 L2） | 无意 | P2 | 2026-08-18 审查 | open |
| TD-010 | dxgi_capture Map 失败提前返回未 ReleaseFrame，帧悬挂（审查 L5） | 无意 | P2 | 2026-08-18 审查 | open |
| TD-011 | GDI 降级路径仅捕获主显示器（GetSystemMetrics），副屏窗口内容错误（审查 L6） | 无意 | P2 | 2026-08-18 审查 | open |
| TD-012 | 实时链路临时 BMP 删除失败被忽略，进程崩溃残留文件永不清理（审查 L7） | 无意 | P3 | 2026-08-18 审查 | open |
| TD-013 | add_segments_batch 注释"100 段/批"与实际单事务全量不符（审查 L8） | 腐化 | P3 | 2026-08-18 审查 | open |
| TD-014 | GDI DeleteObject 在对象仍被选入 DC 时调用会失败；BitBlt 失败仍继续 GetDIBits（审查 L9） | 无意 | P2 | 2026-08-18 审查 | open |
| TD-015 | escape_like 在 db.rs 与 db_sessions.rs 重复定义两份（审查 L4） | 腐化 | P3 | 2026-08-18 审查 | open |
| TD-016 | ClassroomPage modelStatus invoke 失败时按钮永久禁用且无提示（审查 L10） | 无意 | P3 | 2026-08-18 审查 | open |
| TD-017 | dxgi_capture.rs `let _ = desc;` 冗余变量（审查 L12） | 腐化 | P3 | 2026-08-18 审查 | open |

## 今日已偿

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查修复） | 审查严重问题 S1：WAVEFORMATEXTENSIBLE SubFormat 未判断导致 32-bit float 设备音频链路静默失效 | 本次会话修复（audio_loopback.rs 读取 SubFormat GUID；未提交，待 commit） |
| （审查修复） | 审查严重问题 S2：音频时间戳仅随有效音频推进，静默期时间轴压缩破坏融合对齐 | 本次会话修复（audio_loopback.rs 改墙钟时间戳；未提交，待 commit） |
| （审查修复） | 审查中等问题 M1：rewrite_with_fusion 非原子，失败丢原段 | 本次会话修复（db.replace_segments 单事务；未提交，待 commit） |
| （审查修复） | 审查中等问题 M3：启动失败不 emit live:status，前端假"录制中" | 本次会话修复（emit_error 补发状态；未提交，待 commit） |
| （审查修复） | 审查中等问题 M5：字幕采样频率与音频负载耦合，OCR 排队积压 | 本次会话修复（1s 墙钟节流 + DualRateScheduler(2,5)；未提交，待 commit） |
| （审查修复） | 审查中等问题 M6：分块变化检测对单行字幕漏检（min_changed_blocks=2） | 本次会话修复（字幕区 detector=1，双 detector 按区域切换；未提交，待 commit） |
| （审查修复） | 审查中等问题 M7：下载脚本截断残留被误判为有效文件 | 本次会话修复（.part 原子写入 + Content-Length 比对；未提交，待 commit） |
| （审查修复） | 审查中等问题 M8：ADR-001~005 文档 UTF-8 乱码损坏 | 本次会话修复（Write 工具重写 5 份 ADR；未提交，待 commit） |

## 登记规则

- 类型四分类：有意（deliberate）/ 无意（inadvertent）/ 环境变化（environment）/ 腐化（bit rot）
- 优先级：P0 立即处理 / P1 近期 / P2 排期 / P3 观察
- 偿还时在"今日已偿"登记，状态改 closed；代码未提交的偿还注"待 commit"
