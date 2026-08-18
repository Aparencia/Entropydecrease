# 技术债清单（权威：2026-08-18 第三轮，二次审查后滚动）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：重构区 v0.2.0 二次代码审查产出（2026-08-18 第三轮，CodeReview 子代理 + P0/P1 修复）。
> 四轮（同日）：技术债专项处理，19 笔未偿全部偿还（再分析验证 + 修复，待 commit）；
> 同日追加 TD-032（sherpa-onnx 空热词流崩溃）已偿。

## 未偿债务

当前无未偿债务（四轮全部偿还，见下）。

## 今日已偿（二轮 8 笔 + 三轮 11 笔 + 四轮 20 笔）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （二轮 S1） | EXTENSIBLE SubFormat 未判断导致 32-bit float 设备音频链路静默失效 | audio_loopback.rs 读取 SubFormat GUID（未提交，待 commit） |
| （二轮 S2） | 音频时间戳仅随有效音频推进，静默期时间轴压缩破坏融合对齐 | audio_loopback.rs 改墙钟时间戳（未提交，待 commit） |
| （二轮 M1） | rewrite_with_fusion 非原子，失败丢原段 | db.replace_segments 单事务（未提交，待 commit） |
| （二轮 M3） | 启动失败不 emit live:status，前端假"录制中" | emit_error 补发状态（未提交，待 commit） |
| （二轮 M5） | 字幕采样频率与音频负载耦合，OCR 排队积压 | 1s 墙钟节流 + DualRateScheduler(2,5)（未提交，待 commit） |
| （二轮 M6） | 分块变化检测对单行字幕漏检 | 字幕区 detector=1，双 detector 按区域切换（未提交，待 commit） |
| （二轮 M7） | 下载脚本截断残留被误判为有效文件 | .part 原子写入 + Content-Length 比对（未提交，待 commit） |
| （二轮 M8） | ADR-001~005 文档 UTF-8 乱码损坏 | Write 工具重写 5 份 ADR（未提交，待 commit） |
| TD-008 | DXGI staging 纹理 BindFlags/MiscFlags 违反 STAGING 契约（二次审查 M2） | dxgi_capture.rs BindFlags=0/MiscFlags=0（未提交，待 commit） |
| TD-015 | escape_like 在 db.rs 与 db_sessions.rs 重复定义两份 | 收敛为 db.rs pub(crate) 单一实现（未提交，待 commit） |
| TD-017 | dxgi_capture.rs `let _ = desc;` 冗余变量 | 删除 output_desc 字段与死语句（未提交，待 commit） |
| TD-018 | D3D11CreateDevice SDKVersion 传 11（应为 D3D11_SDK_VERSION=7）→ DXGI 主路径必然失败静默降级 GDI（二次审查 S1，P0） | 改用 D3D11_SDK_VERSION 常量（未提交，待 commit） |
| TD-019 | ureq 请求无读超时，下载线程网络挂起永久阻塞 | AgentBuilder.timeout(30min)（未提交，待 commit） |
| TD-020 | 模型下载失败不推送事件，前端永久"下载中"无法重试 | emit model:download-failed + 前端监听重置（未提交，待 commit） |
| TD-021 | LiveSessionManager 线程内启动失败后 active 假占用，无法重启会话 | active_session_id 检查 thread.is_finished 自动清理（未提交，待 commit） |
| TD-022 | 停止链路 join 无超时，可能无限挂起阻塞 IPC | stop_active 有界等待 5s 超时 detach（未提交，待 commit） |
| TD-023 | DXGI 主路径未按窗口矩形裁剪（ADR-002 承诺未落地） | capture 先窗口裁剪再叠加区域裁剪（未提交，待 commit） |
| TD-030 | maybe_rescore 失败回填句音频被端点 clear 立即清空（无效防御） | 删除回填分支（未提交，待 commit） |
| TD-031 | 下载脚本 fetch 无超时（同 M5 脚本侧） | AbortSignal.timeout(30min)（未提交，待 commit） |
| TD-001 | process_to_note 单图 OCR 失败静默吞错，用户无感知 | 失败收集 eprintln + 笔记尾部追加 ⚠ 警告段落（四轮，待 commit） |
| TD-002 | AGENTS.md 未同步窗口枚举模块 | §10 补登 windows.rs / live_session*.rs / capture/（四轮，待 commit） |
| TD-003 | NotesPage 搜索无防抖且存在响应竞态 | 300ms 防抖 + 请求序号防覆盖（四轮，待 commit） |
| TD-004 | App 页面切换重挂载导致重复窗口枚举 | 保留挂载 + display 切换（四轮，待 commit） |
| TD-005 | command 层入参未校验（旧 command 仍缺） | 全部旧 command 补齐：title 归一化/id>0/正文截断/列表有界；normalize_title 收敛到 commands.rs 单一实现（四轮，待 commit） |
| TD-006 | build.rs OUT_DIR ancestors().nth(3) 依赖 Cargo 内部目录结构 | 改为按 "build" 目录名定位祖先（四轮，待 commit） |
| TD-007 | 窗口枚举未过滤系统窗口噪声（Program Manager 等） | 过滤 GetShellWindow + 无 PID 窗口（四轮，待 commit） |
| TD-009 | resample_linear src_rate=0 → ratio=0 → out_len 溢出 panic | 补 src_rate=0 防御 + 回归测试（四轮，待 commit；二次确认：此前仅防 dst_rate） |
| TD-010 | dxgi_capture Map 失败提前返回未 ReleaseFrame，帧悬挂 | Map 失败先 ReleaseFrame 再返回（四轮，待 commit） |
| TD-011 | GDI 降级路径仅捕获主显示器 | 改用 SM_X/Y/CX/CYVIRTUALSCREEN 虚拟屏幕边界（四轮，待 commit） |
| TD-012 | 实时链路临时 BMP 删除失败被忽略，崩溃残留 | 随 TD-025 消除——内存 OCR 不再写临时文件，bmp.rs 删除（四轮，待 commit） |
| TD-013 | add_segments_batch 注释"100 段/批"与实际不符 | 注释修正为单事务全量 + 批次由调用方控制（四轮，待 commit） |
| TD-014 | GDI DeleteObject 在对象仍选入 DC 时调用失败；BitBlt 失败仍继续 GetDIBits | BitBlt 失败短路清理；恢复旧对象后再 DeleteObject（四轮，待 commit） |
| TD-016 | ClassroomPage modelStatus invoke 失败时按钮永久禁用且无提示 | invoke 加 catch + 错误展示 + 重试检查按钮（四轮，待 commit） |
| TD-024 | fusion 融合段文本重复：ASR 句跨多字幕段时整句在多个补缝段复制 | 补缝文本按空隙时长比例切分（末段吃余数）+ 回归测试（四轮，待 commit） |
| TD-025 | 字幕帧 OCR 走磁盘临时 BMP 文件，写放大 + 崩溃残留 | oar-ocr predict 支持 image::RgbImage 内存输入：engine/ocr 增加 RecognizeImage 通道，帧 BGRA→RGB 直送（四轮，待 commit） |
| TD-026 | 会话线程内同步 OCR 阻塞音频消费，ASR 字幕延迟抖动 | 屏幕采样移入独立线程（run_screen_worker），字幕段经 Arc<Mutex> 共享，停止时有界 join（四轮，待 commit） |
| TD-027 | live_session 系模块无 cfg(windows) 门控，非 Windows 编译失败 | lib.rs/commands.rs 补 #[cfg(target_os="windows")]（四轮，待 commit） |
| TD-028 | run_capture 线程内 CoInitializeEx 无配对 CoUninitialize | ComInitGuard drop 自动配对（四轮，待 commit） |
| TD-032 | create_stream_with_hotwords("") 无条件创建 ContextGraph，greedy_search 解码器触发 "This interface is for OnlineTransducerModifiedBeamSearchDecoder" 断言 abort（exit 0xffffffff） | 无热词改用 create_stream()，有热词才走 with_hotwords（new_stream 分支，四轮，待 commit） |

## 登记规则

- 类型四分类：有意（deliberate）/ 无意（inadvertent）/ 环境变化（environment）/ 腐化（bit rot）
- 优先级：P0 立即处理 / P1 近期 / P2 排期 / P3 观察
- 偿还时在"今日已偿"登记，状态改 closed；代码未提交的偿还注"待 commit"
- 行数豁免登记见 [standards/line-limit-exemptions.md](../../standards/line-limit-exemptions.md)
