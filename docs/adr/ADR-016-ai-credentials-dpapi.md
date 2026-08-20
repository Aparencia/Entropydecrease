# ADR-016: AI 密钥凭据存储——DPAPI 直写（keyring spike 因网络约束跳过）

## 状态

已接受（v0.8.0 M1，REQ-138 落地；[v0.8.0 规划](../versions/v0.8.0.md)开放问题"Credential Manager 集成"裁决）

## 日期

2026-08-21

## 背景

v0.8.0 M1（REQ-138）需要 AI 密钥（SiliconFlow API Key）的安全存储：**明文红线**——密钥不得落 SQLite/明文文件。规划指定的两条路径：

1. **keyring crate**（Windows Credential Manager 集成，spike 前置）——最贴合"Credential Manager"语义；
2. **DPAPI 直写 fallback**（spike 失败时）——`CryptProtectData` 加密后写入应用数据目录文件，仍非明文。

本机环境约束：TLS 拦截导致 rustls 对部分 CDN 报 `UnknownIssuer`，crates.io 新依赖下载不可靠（既有工程已用 `sherpa-archive/` 本地库 + `.cargo/config.toml` 规避）。keyring crate 及其依赖链（windows-sys/keyring 平台后端）为**新增依赖**，spike 存在下载失败风险。

## 决策

**跳过 keyring spike，直接采用 DPAPI 直写 fallback 路径**（规划已批准的备选方案）：

- 新增 `ai_credentials.rs` 模块：`CredentialStore` trait（save/load/clear）+ `DpapiCredentialStore`（Windows 实现）+ `MemoryCredentialStore`（测试桩/非 Windows 兜底）。
- DPAPI 通过**既有依赖** `windows = "0.61"` crate 的 `Win32_Security_Cryptography` feature 实现（`CryptProtectData`/`CryptUnprotectData`，`CRYPTPROTECT_UI_FORBIDDEN` 禁弹窗，输出 `LocalFree` 归还）——**零新增依赖**，规避 TLS 拦截下的下载风险。
- 密钥加密后写入应用数据目录 `ai_credentials.bin`（当前用户作用域数据保护：管理员与其他用户不可解；换机器/换用户不可迁移——符合本地优先与安全语义）。
- 环境变量 `SILICONFLOW_API_KEY` 保留为开发路径，优先级：**环境变量 > 凭据库**（command 层解析，`ai_client.rs` 聚合）。
- 前端永不回传密钥：设置视图只有 `has_key`/`key_source`（credential|env|none）布尔标识；保存时输入框留空即不改密钥。

## 备选方案

### 方案 A：keyring crate（Windows Credential Manager）
- 优点：密钥进系统凭据管理器，用户可在系统凭据查看器中管理；多应用隔离。
- 缺点：**新增依赖链需联网下载（本机 TLS 拦截下不可靠）**；keyring 在 Tauri 2 Windows 的可用性本身就是 spike 对象；凭据管理器 UI 与设置页交互割裂。
- 适用场景：依赖下载无障碍的 CI/发布环境（后续可换，trait 已抽象）。

### 方案 B：DPAPI 直写加密文件（选定）
- 优点：零新增依赖（windows crate 已存在）；加密强度等同凭据管理器（同一 DPAPI）；`CRYPTPROTECT_UI_FORBIDDEN` 无弹窗不卡 UI；trait 抽象可随时换实现。
- 缺点：加密文件独立于系统凭据管理器（换用户/机器不可迁移）；文件删除即密钥丢失（可接受——重输即可）。
- 适用场景：本工程当前网络约束环境；本地优先应用。

### 方案 C：明文配置文件 / SQLite 存储
- 优点：实现最简单。
- 缺点：**违反明文红线（AGENTS.md §4 安全红线）**——直接否决。

## 选择理由

1. **网络约束优先**：keyring spike 的目标是验证可用性，而本机连下载都不可靠——spike 前置条件不成立，直接走规划已批准的 fallback（规划原文："keyring crate 在 Tauri 2 Windows 的可用性——失败则 DPAPI 直写 fallback（仍非明文）"）。
2. **零新增依赖**：DPAPI 复用既有 windows crate（仅加 feature 开关，crate 已在本地缓存）——符合依赖管理纪律（新依赖必须可下载）。
3. **安全语义等价**：DPAPI 是 Credential Manager 的底层机制，加密强度一致；trait 抽象保留未来切换 keyring 的能力（M5 契约测试走内存桩，与实现解耦）。

## 影响

### 正面影响
- 密钥不落 SQLite/明文文件（明文红线满足）；重启可用（文件持久化）。
- 零新增依赖，构建不依赖网络；错误密钥验证有明确提示（401/403 → "密钥无效"）。
- 测试用内存桩，M5 契约测试与平台实现解耦。

### 负面影响 / 代价
- 换机器/换用户需重新输入密钥（DPAPI 作用域限制——本地优先可接受）。
- 凭据不在系统凭据管理器 UI 中可见（设置页自管）。

### 风险
- `ai_credentials.bin` 被用户误删 → 需重新配置密钥（引导文案兜底）。
- 非 Windows 平台仅内存存储（开发路径告警）——实时链路本为 Windows-only，可接受。

## 合规性验证

- `ai_credentials.rs` 单测（内存桩 roundtrip/清除/空密钥拒绝）；DPAPI 为系统调用不单测（与 model_downloader 同口径）。
- 构建验证：`cargo build` 在 windows crate 增加 `Win32_Security_Cryptography` feature 后通过。
- 代码审查：设置视图无密钥字段回传；`ai_save_key` 仅写凭据库。

## 相关决策

- [ADR-010](../adr/ADR-010-gap-filling-ai.md)：AI 为增强层·本地兜底铁律
- [v0.8.0 规划](../versions/v0.8.0.md)：REQ-138（密钥管理）、REQ-139（余额）、REQ-140（授权审计）

## 参考

- [v0.8.0 规划 §六 开放问题：Credential Manager 集成（spike）](../versions/v0.8.0.md)
- [头脑风暴 v0.8 AI 精修（已归档）](../archive/2026-08-19/brainstorming-v0.8-ai-note-refine.md)
