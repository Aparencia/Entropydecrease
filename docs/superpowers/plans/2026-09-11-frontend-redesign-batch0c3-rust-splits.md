# 批 0-C3 Rust 超限文件拆分实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 10 个 >600 行的 Rust 文件从 `>600` 集合里**清零**（`scripts/line-limits.mjs` 的 `FROZEN_OVER_LIMIT` 清空、`--full` 绿、登记表 100% 一致），且**行为等价**。这是批 0 验收门槛 1「15 个 >600 行文件 → 0」的后半段（前半段是 `0-C2` 的 5 个前端文件）。

**Architecture:** 沿用本仓既有拆分形态 —— **顶层同级 `.rs` 文件**（先例：`commands_goals.rs` ↔ `commands_goals_lifecycle.rs`/`_plan.rs`；`note_filter.rs` ↔ `note_filter_ai.rs`/`_discourse.rs`/`_ocr.rs`；`video_profile.rs` ↔ 10 个 `video_profile_*`；`capture/` 是唯一的目录模块）。每拆出一个新模块，在 `lib.rs` 声明块按现有分组插入一行 `mod xxx;`。每次只动**一个文件**，抽出的形态**优先纯函数/参数表/状态聚合**，编排与锁语义留在原文件。

**Tech Stack:** Rust 2021 · Tauri 2.11.5（`tauri-macros` 2.6.3）· rusqlite/sqlx · sherpa-onnx · paddle-ocr

**Spec:** `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§10 批 0「拆超限文件」、§11 验收口径第 1 条）· 与 `0-C2`（前端 5 个）同属批 0-C，两者**串行**执行（共享同一份登记表与棘轮名单）。

## Global Constraints

- **行数口径（唯一有效）**：`[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count` = `node scripts/line-limits.mjs` 的 `countLines()`。⚠️ **不要用** `Get-Content`（本机 PS 5.1 + 码页 `gb2312` 按 GBK 解码，**少算可达 56 行**）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数（末尾无换行的文件少算 1）。
- **红线**：单文件 ≤300 行；**>600 行必须硬拆（不允许豁免）**；300–600 行必须在 `docs/standards/line-limit-exemptions.md` 登记豁免理由。**`lib.rs` 是唯一被裁决为"结构性地板"的文件**（321 `mod` + 16 `#[cfg]` = 337 行地板 + 161 行模块理由注释 + 装配逻辑），它的目标不是 ≤300 而是 ≤600 并如实登记 —— 见 Task 1。
- **行为等价**：纯搬运。不改逻辑、不改 SQL/`PRAGMA`/schema、不改 `serde` 属性与**字段声明顺序**（= JSON 键序）、不改 IPC 命令名与事件名、不改超时/重试/取消参数、**不改锁的粒度与加锁顺序**、不改文案、不顺手修 bug、不顺手清理 `dead_code`。
- **★ Rust 侧只有一条可用测试门禁**：`cd app/src-tauri && cargo test --test app_lib_tests`（`Cargo.toml` 里 `[[test]] name = "app_lib_tests" path = "src/lib.rs"` 且 `[lib] test = false` ⇒ **`cargo test --lib` 根本不存在**，别把它当成"测试挂了"；本机 ONNX DLL 冲突那条路与本批无关）。基线：**2357 passed / 0 failed / 6 ignored**。
- **`cargo clippy` 有预存失败**：本批之前就有 **15 个 error**（`-D warnings` 口径）⇒ 判据是「**错误数不增加**」，开工先录基线、收工再比一次。
- **顺序硬约束：`lib.rs` 必须第一个拆**。其余 9 个文件每拆一个都要给 `lib.rs` 加 1–2 行 `mod`，而 `lib.rs` 现在 **1025 行 >600** —— 不先把它降到 ≤600，就是在往"未拆完的 >600 文件"里加代码（v0.22 红线）。
- **★ 门禁现在每次提交都跑数值一致性**：`.husky/pre-commit` = `node scripts/line-limits.mjs --full && node scripts/docs-check.mjs`（本批会再加一条注册一致性检查）。⇒ **每个拆分提交都必须同时带上刷新后的登记表**，否则 `(e)` 会拦下你的提交。
- **多步拆分的门禁时机**（与 `0-C2` 同一条规则，逐字适用）：主文件**仍 >600** 时那条 `FROZEN_OVER_LIMIT` **必须留着**；一旦**降到 ≤600**，那条**必须立刻删掉**并在**同一个提交**里 `node scripts/line-limits.mjs --write` 刷新登记表。每步提交前先量行数再决定「不改 / 删棘轮行 + 刷表」。
- **提交纪律**：`git add <显式路径>`（**禁止** `git add -A`）· **禁止** `git stash`（本仓无 `.gitattributes` 且 `core.autocrlf=true`，会把源码变 CRLF）· **禁止** `git checkout -- <file>` 回滚 · **禁止** `--no-verify` · **切勿** `git gc --prune=now`（悬空备份 commit 是丢改动时唯一的找回途径）· 提交信息 Conventional Commits，subject ≤50 字。
- ⚠️ 判定原生命令结果用 `2>file` 或 `$LASTEXITCODE`，**不要用** `2>&1 |`（PS 5.1 会把原生 stderr 包成 `NativeCommandError`，让成功的命令报 exit 1）。
- **串行执行**：同一时刻只有一个实施者动 `scripts/line-limits.mjs` / `docs/standards/line-limit-exemptions.md` / `lib.rs`（并发会互相覆盖，且 `git add` 与 `git commit` 交错会把别人的暂存文件卷进自己的提交）。控制方一次派发一个文件。

### 每个拆分任务的统一作业模式（Task 1–10 共用，逐条照做）

1. **先读结构分析的实测结论**：`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c3-rust-splits/analysis-<file>.md`（顶层项与行号、依赖面、提议边界、风险表、测试覆盖）。计划里该任务的「拆分边界」节据它写成；**若你读代码后发现与分析不符，以代码为准并在报告里指出**。
2. **录基线**：该文件行数（`ReadAllLines` 口径）· `cargo test --test app_lib_tests` 的通过/失败/忽略数 · `cargo clippy` 的 error 数 · 该文件的直接测试覆盖（哪些 `*_tests.rs` 引用它）。
3. **抽出单元 → 新文件**：新文件含 `//! @ai-context`（业务背景 / 副作用 / 边界）；公共 API（`pub`/`pub(crate)` 可见性、函数签名、结构体字段顺序）保持兼容；**在 `lib.rs` 声明块按现有分组插入 `mod <新文件>;`**（若目标是私有模块，插在对应分组旁；`pub mod` 需保持 `pub` 且在 crate 根）。
4. **跑门禁**（`app/src-tauri/` 下）：`cargo test --test app_lib_tests`（必绿、用例数不减）→ `cargo clippy`（error 数不增）→ `cargo build`。
5. **刷新登记表并从棘轮名单删行**（仓库根）：`node scripts/line-limits.mjs --write` → 从 `scripts/line-limits.mjs` 的 `FROZEN_OVER_LIMIT` 删掉本文件路径 → `node scripts/line-limits.mjs --full`（期望 exit 0，且 `>600` 计数比拆前少 1）。
6. **行为等价的证明**（写进报告）：用例数与结果不减 + 对**测试未覆盖**的路径给出**人工核对清单**（至少：`pub` 可见性未变、`use` 路径可达、`serde` 属性与字段顺序逐字未变、`emit` 事件名未变、IPC 命令名未变、锁的加锁顺序与持锁范围未变）。**纯搬运类改动**（清单/常量/注释）优先用**机械 diff 证据**（见 Task 1 的注册清单探针）。
7. **提交**：`git add <新文件…> <原文件> app/src-tauri/src/lib.rs scripts/line-limits.mjs docs/standards/line-limit-exemptions.md` → `git commit -m "refactor(rust): 拆 <原文件> 至 ≤600 行"`（多步则每步一个提交）。
8. **报告**：`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c3-rust-splits/task-<n>-report.md`（拆前/拆后行数对照 · 新文件 `@ai-context` 摘要 · 门禁输出与 exit · 人工核对清单及结论 · 登记表与棘轮改动 · 顾虑，尤其**你没能验证的**地方）。

### 派发顺序（控制方按此逐个派发，不并发）

| # | 文件 | 基线行数 | 分析报告 | 备注 |
|---|---|---|---|---|
| 1 | `app/src-tauri/src/lib.rs` | 1025 | ✅ `analysis-lib-rs.md` | **必须先做**（注册边界 + 解锁其余任务的 `mod` 追加） |
| 2 | `app/src-tauri/src/types.rs` | 1017 | ✅ `analysis-types-rs.md` | 157 文件 / 236 处 `crate::types` 引用面 ⇒ `pub use` 门面 |
| 3 | `app/src-tauri/src/live_session_frame.rs` | 974 | ✅ `analysis-live-session-frame.md` | 1s 主循环 + 长锁窗口（禁止缩短） |
| 4 | `app/src-tauri/src/commands_ai_refine.rs` | 751 | ⏳ | |
| 5 | `app/src-tauri/src/db_goals.rs` | 707 | ⏳ | schema 敏感（若含建表/迁移） |
| 6 | `app/src-tauri/src/commands_goals.rs` | 673 | ⏳ | 注册清单路径须同步 |
| 7 | `app/src-tauri/src/ai_refine_task.rs` | 670 | ⏳ | 线程/锁/取消语义 |
| 8 | `app/src-tauri/src/note_filter.rs` | 642 | ⏳ | 测试面厚 |
| 9 | `app/src-tauri/src/artifact_templates.rs` | 632 | ⏳ | 字面量为主 |
| 10 | `app/src-tauri/src/video_profile.rs` | 628 | ⏳ | 枚举 ↔ 前后端字面量契约 |

---

### Task 1: 拆 `app/src-tauri/src/lib.rs`（1025 → ≈575，**结构性地板**）

> **边界取自**：`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c3-rust-splits/analysis-lib-rs.md`（189 行：321 条 `mod` 的逐条行号表、"两份追加式清单 = 93%"的体积构成、5 条风险、6 个决策点）。**开工先读它**。

**Files:**
- Modify: `app/src-tauri/src/lib.rs`
- Create: `app/src-tauri/src/app_commands.rs`（≈465 行：334 条注册条目 + 106 行原有注释 + 10 条 `#[cfg(target_os = "windows")]` + 头部 `//! @ai-context` 与 `handle()` 签名）
- Create: `scripts/check-command-registry.mjs`（新门禁，≤300 行；**必须自带 `--self-test`**）
- Modify: `scripts/line-limits.mjs`（删 `FROZEN_OVER_LIMIT` 里的 lib.rs 行）· `docs/standards/line-limit-exemptions.md`（`--write` + 人工列）· `.husky/pre-commit` 与 `.github/workflows/pr-check.yml`（接入新门禁）

**Interfaces:**
- Consumes: 分析报告 · 控制方探针 `.superpowers/sdd/2026-09-11-frontend-redesign-batch0c3-rust-splits/probe-registry-parity.mjs` + 基线快照 `snap-registry-baseline.json`（**334 条 / 0 重复 / 10 条 cfg 门控**）· vendored 宏源码 `tauri-macros-2.6.3/src/command/handler.rs`
- Produces: `app_commands::handle<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static`；`lib.rs` 的 `run()` 里只有一行 `invoke_handler(app_commands::handle())`；**334 个 IPC 命令名逐字不变**

**★ 已由宏源码核实的三条硬事实（不必再盲目 spike）**
1. **加 `crate::` 前缀不改 IPC 名**：命令名取路径**末段** ident（`handler.rs:46-58`：`path_to_command(&mut wrapper)` → `last.ident`）⇒ `crate::commands_x::y` 与 `commands_x::y` 同名 `y` ⇒ 前端 `invoke("…")` 与 `capabilities/` ACL **零影响**。
2. **多域清单 + 闭包组合不可行**：宏展开是 `move |__tauri_invoke__| { let __tauri_cmd__ = __tauri_invoke__.message.command(); match __tauri_cmd__ { … } }`（`handler.rs:174-183`）—— `Invoke` **按值**送进第一个 handler ⇒ `if a(invoke) { true } else { b(invoke) }` 是 use-after-move（E0382）。要组合就得"先按命令名路由"，那要在每个域再维护一份**名字表**（新的漂移面）。⇒ **本任务采用单文件清单**（分析报告 D1 的 A 案），并把这条理由写进 `app_commands.rs` 的文件头注释。
3. **每条目可带 `#[cfg(...)]` 外层属性**：`handler.rs:16-23` 解析 outer attrs、`177` 行把它们贴在 match 臂上 ⇒ **10 条 Windows 门控逐字随迁**（`probe-registry-parity` 会把它们计进"含 cfg 门控"的条数）。

**★ 为什么 `lib.rs` 落在 ≈575（300–600 登记豁免带）而不是 ≤300（分析 D2 的裁决）**
- **337 行地板**：321 条 `mod` + 16 条 `#[cfg]` 是硬性的 —— `mod` 声明必须在 crate 根（全仓大量 `crate::<module>::…` 调用；挪进子模块会把路径变成 `crate::x::y`，等于全仓重写 = 违反行为等价）。
- 再加 161 行模块理由注释 + 16 行 `use`/`punctuation_model` + 59 行装配逻辑 ⇒ **≈575 就是本文件的结构性下界**（估算，以实测为准）。
- **已评估并否决的两条「硬压到 300」的路**：① `include!("app_modules.rs")` ⇒ lib.rs ≈78，但把 337 行声明块藏进外部文件（crate 根的模块树不再可见），而那个文件自己仍 337 行 —— 只是把行数挪个地方，可读性净损失；② 把 161 行理由注释分发进 161 个模块文件头 —— 爆炸半径远超收益。⇒ **接受 300–600 并如实登记**（AGENTS.md §3 明文允许），把"337 行地板"写进豁免理由与「拆分计划」列。

**本任务只做一步（单提交）**
```rust
// app/src-tauri/src/app_commands.rs（新文件）
//! @ai-context …（为什么是单文件清单：见上面"硬事实 2"）
pub fn handle<R: tauri::Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    // 334 条逐字搬来，只加 crate:: 前缀；注释与 #[cfg] 原样跟随
    let handler = tauri::generate_handler![ /* … */ ];
    move |invoke: tauri::ipc::Invoke<R>| handler(invoke)
}
```
```rust
// lib.rs
mod app_commands;                                   // 声明块里按现有分组插入
        .invoke_handler(app_commands::handle())     // 原来那 452 行 generate_handler![…] 整体移除
```
- 预计：`lib.rs` 1025 → **≈575**（−452 +1 `mod` +1 `--write` 刷新带来的行数变动），`app_commands.rs` ≈465。**两步都以实测为准**；若 `app_commands.rs` 落到 301–600，**它也要登记豁免行**（`--write` 会自动加，理由人工回写：宏约束下的唯一注册点，条目是数据不是逻辑）。
- **`run()` 的装配链一律不动**：`.plugin`(dialog / global_shortcut) · `.setup` · `.on_window_event` · `.run(generate_context!())` 全部留在 `run()`；`app_commands.rs` 里**禁止**出现 `tauri::Builder` 片段（插件重复 init 是运行期故障）。

**★ `scripts/check-command-registry.mjs`（必须做，且必须自证有效）**
- 扫 `app/src-tauri/src/**/*.rs` 的全部 `#[tauri::command]` 函数名（注意 `pub`/`pub(crate)`/`async`/多属性行/属性与 `fn` 分行等变体）↔ 解析 `app_commands.rs` 的 `generate_handler!` 条目（归一化去 `crate::`，**只比末段名字** —— 那就是 IPC 名）。
- 三向检查，任一命中即 **exit 1** 并打印明细：**漏注册**（有定义无条目）· **多注册**（有条目无定义）· **重名**（同一名字出现两次）。
- 支持 `--registry <path>` / `--src-dir <path>` 覆盖（供评审用夹具证伪），以及 **`--self-test`**：在临时目录构造「漏 / 多 / 重」三种故障并断言全部被抓到；漏抓任一 → exit 1。
- 输出一行摘要：`✅ 命令注册一致：定义 334 / 注册 334 / 重复 0`。
- 接入 `.husky/pre-commit`（`node scripts/check-command-registry.mjs`，纯文本扫描、无需 Rust 工具链）与 `.github/workflows/pr-check.yml` 的 `line-limits` job（**不要**动 `app-rust` job：它现在预存 15 个 clippy error，与本批无关）。

**★ 机械等价证据（本任务的主要证据 —— 拆分前后必须逐条相同）**
```powershell
$S = ".superpowers/sdd/2026-09-11-frontend-redesign-batch0c3-rust-splits"
node $S/probe-registry-parity.mjs verify $S/snap-registry-baseline.json app/src-tauri/src/app_commands.rs
```
期望：`✅ 注册清单等价：334 条逐条相同（含 10 条 cfg 门控），顺序保持不变`。
**另需**：`node scripts/check-command-registry.mjs` 报 334/334；`app_commands.rs` 内 `git diff` 逐行人工抽检 3 个域（注释与 `#[cfg]` 未错位）。

**其他必须核对的点**
1. **`punctuation_model` 留在 `lib.rs`**：它是 crate 根级共享函数，被 `commands_live.rs:90,255` 以 `crate::punctuation_model(..)` 调用 ⇒ 不动（搬家要改调用点，越出"纯搬运"）。
2. **7 个 `pub mod` 必须保持 `pub` 且在 crate 根**（`audio_preprocess`/`cer`/`eval_confusion`/`eval_report`/`eval_samples`/`eval_session`/`dtw_align`）—— `src/bin/cer_bench.rs`、`src/bin/asr_eval.rs` 是 crate 外消费者。本任务不动声明块 ⇒ 天然满足，但收工要跑 `cargo build --bin cer_bench --bin asr_eval` 证明。
3. **不存在 `#[cfg(test)] #[path]` 迁移面**：`lib.rs` 内 0 个；`#[path = "…_tests.rs"]` 全仓 201 处都在**同级模块文件**里，本任务不移动任何模块文件。
4. `lib.rs` 内 **0 个** `static`/`OnceLock`/`thread::spawn`、**0 个** `.manage()` ⇒ 无归属冲突。
5. `src/main.rs`（4 行）只调 `app_lib::run()` ⇒ `run()` 签名不变则**零改动**。
6. `app/scripts/download-punctuation.mjs` / `download-streaming-asr.mjs` 的注释锚定 `lib.rs` 内的路径构造函数 ⇒ 本任务不动那些函数，**不改**这两个脚本。

**收尾**（仓库根）
```powershell
node scripts/line-limits.mjs --write
# 删 scripts/line-limits.mjs 的 FROZEN_OVER_LIMIT 里 'app/src-tauri/src/lib.rs' 那一行
node scripts/line-limits.mjs --full      # 期望 exit 0，>600 计数比拆前少 1（14 → 13）
node scripts/docs-check.mjs              # 期望 exit 0
```
登记表动作：`lib.rs` 行的理由改写为「crate 根 321 `mod` + 16 `#[cfg]` = **337 行地板**；注册清单已移至 `app_commands.rs`（452 行，同属豁免带的**数据文件**）——结构性下界，非欠债」；「拆分计划」列改写为已完成；「已拆分 / 登记移除记录」节追加一条（含实测行数与本次裁决）。

**验证**
```powershell
cd app/src-tauri
cargo test --test app_lib_tests     # 必绿：2357 passed / 0 failed / 6 ignored（用例数不减）
cargo build
cargo build --bin cer_bench --bin asr_eval
cargo clippy 2>clippy.txt            # error 数不得 > 15（先录基线）
cd ../..
node scripts/check-command-registry.mjs
node scripts/line-limits.mjs --full
```
**只能人工（真机）**：`cd app && npm run dev` → 按域各抽 1 条命令（笔记域 / AI 域 / 会话域 / 知识域）+ `start_live_session`（Windows 门控）+ 1 条 AI 设置类（只验可达，红线默认关），控制台不得出现 `command … not found`；全局快捷键插件仍工作（浮窗键）；关窗拦截仍工作（`on_window_event` 读 `AppState`）。
**报告**：`.../task-1-report.md`（含：`lib.rs`/`app_commands.rs` 实测行数 · 探针与门禁输出 · clippy 基线对比 · 6 条核对点逐条结论 · 登记表改动 · 真机冒烟结论 · 顾虑）。

---

### Task 2: 拆 `app/src-tauri/src/types.rs`（1017 → ≈25 门面）

> **边界取自**：`.../analysis-types-rs.md`（178 行：54 个顶层项的行号表、12 个域分组、serde 契约分布、5 条风险、5 个决策点）。

**Files:**
- Modify: `app/src-tauri/src/types.rs`（终态 = 门面：模块文档 + `mod` 声明 + `pub use …::*;`）
- Create（**6 个，全部 ≤300**）：`types_session.rs`(~135) · `types_knowledge.rs`(~245) · `types_note.rs`(~230) · `types_ocr.rs`(~82) · `types_extract.rs`(~68) · `types_decision.rs`(~75)
- Consumes: 分析报告；**引用面 157 个文件 / 236 处 `crate::types::…`（92 非测试 + 65 测试）⇒ 一处都不改**
- Produces: 上述 6 个模块 + 门面；`lib.rs:469` 的 `mod types;` **不动**

**★ 裁决（分析 D1–D5）**：**D1 `pub use` 门面**（改引用点 0 处；禁「顺手把 `crate::types::X` 改成 `crate::types_note::X`」——那会把一次搬运变成 236 处编辑 + 双份回归面）· **D2 6 文件**（不建 `types_learning.rs`，待 `types_note` 超 ~250 行再摘）· **D3 保留 `types_extract.rs`**（ADR-004 已定性为引擎层内存态）· **D4 只给门面补 `@ai-context`，不改任何字段级注释**；契约快照测试**单独一个提交**（不与搬运混提，否则失败无法二分）· **D5 一步一文件一提交**。

**分步（每步一个提交；每步 `--write` + 量行数）**

| 步 | 动作 | 主文件 | 棘轮 / 登记动作 |
|---|---|---|---|
| S1 | 门面骨架 + `types_session.rs` | ~826 | **仍 >600 ⇒ 棘轮行保留**；`--write` |
| S2 | `types_knowledge.rs` | ~597 | **≤600 ⇒ 本步提交里删 `FROZEN_OVER_LIMIT` 行 + `--write`**（转入 301–600 档） |
| S3 | `types_note.rs` | ~378 | `--write` |
| S4 | `types_ocr.rs` | ~308 | `--write` |
| S5 | `types_extract.rs` | ~254 | **≤300 ⇒ 档位行由 `--write` 自动消失** |
| S6 | `types_decision.rs` | ~25 | `--write` |

⚠️ **S1 必须先建门面 + `pub use` 再删旧体**（否则同名项重复定义 = 编译失败）。行数为估算，**每步以实测为准**。

**★ 等价核对（第一优先 = serde 契约逐字）**
1. **36 个 `rename_all="camelCase"` + 16 个刻意没有 `rename_all` + 1 个 enum `kebab-case`（`NoteSortMode`）** —— 16 个里含 `SessionScreen`，而它的同域邻居 `SessionListItem` **有** camelCase：这是历史有意的**不对称**，**禁止顺手统一**（一次改坏 16 个类型的线格式）。
2. `#[serde(rename = "type")]` ×3（`KnowledgeNode`/`NewKnowledgeNode`/`GraphEdge`）· `skip_serializing_if = "Option::is_none"` ×1（`GraphNode.system_id`，丢了会让 `null` 字段重新出现）· `default` ×89 · `default = "default_tags"` 1 处（**`default_tags()` 与 `Note` 必须同模块**）。
3. **字段声明顺序 = JSON 键序** ⇒ 逐字节搬运、不重排、不重排属性行。
4. `#[allow(dead_code)]` ×3（`KnowledgeDecision`/`NewKnowledgeDecision`/`UsedRefs`，M1 预埋）**原样带走**（本仓无 `deny(warnings)`，漏带只多 warning、不会失败）。
5. 跨域 `use` 仅 3 处：`types_ocr` → `super::types_extract::TextBox`；`types_session` → `super::types_ocr::{SessionOcrBlock, SessionScreen}`；`PromoteNoteResult` → `Note`（同域）。**避免两子模块 `pub use` 同名项**（本切法无名冲突）。
6. 本文件 **0 个 `impl`**、全仓对 53 个类型名 `^impl <Type>` **0 命中** ⇒ 无孤儿规则问题。

**验证**：`cargo test --test app_lib_tests`（逐步全绿、用例数不减；65 个测试文件仅 `use crate::types::…`，靠门面零改动）· `cargo build` · `cargo build --bin cer_bench --bin asr_eval` · `cargo clippy`（错误数不增）· `node scripts/line-limits.mjs --full`。
**建议（分析 D4）**：另起一个提交加**契约快照测试**（对每个类型 `serde_json::to_value` 断言键集合与键序）—— 这是本文件唯一「改坏了也没人报错」的面。
**报告**：`.../task-2-report.md`。

---

### Task 3: 拆 `app/src-tauri/src/live_session_frame.rs`（974 → ≈236）

> **边界取自**：`.../analysis-live-session-frame.md`（159 行：`run_screen_worker` 735 行的内部结构拆解、9 条同步原语归属、15 处 emit 站点、两次历史拆分与"只增不减"的 10+ 提交证据、7 个决策点）。

**Files:**
- Modify: `app/src-tauri/src/live_session_frame.rs`
- Create（6 个，200–250 行区间，全 ≤300）：`live_session_liveness.rs`(~120) · `live_frame_worker_state.rs`(~240) · `live_session_pause_poll.rs`(~230) · `live_player_probe.rs`(~230) · `live_profile_runtime.rs`(~250) · `live_frame_consume.rs`(~220)
- Consumes: 分析报告；调用点 `live_session.rs:305`；测试模块 `live_session_frame_tests.rs`（49 行 / 4 例）
- Produces: 上述 6 个模块；`run_screen_worker` 的**公共签名与调用点保持不变**（改由 `FrameWorkerState` 聚合上下文 + 分文件 `impl`）

**★ 裁决（分析 D1–D7）**：**D1 命名守 §10**：碰屏幕/暂停/隐私的用 `live_session_*`（liveness、pause_poll、consume），纯档案/领域决策用 `live_profile_runtime.rs` —— **不得为规避 §10 额外审查而取名 `live_frame_*`** · **D2 采用 `FrameWorkerState`**（20 参数 → 1；登记表 TD-24-A 既定方案）+ 分文件 `impl` · **D3 不修** 816–875 / 451–476 的长锁窗口（持锁做 CV + 落库 + IPC；改锁粒度 = 并发行为变更）⇒ 单独立项 · **D4 `LatestCapturedFrame` 不迁**（6 处跨 5 文件引用 + 命令层查询路径）· **D5 `light_poll_enabled` 随函数迁到 `live_session_pause_poll_tests.rs`**（否则 `use super::*` 断链 + 丢 2 个真值表用例）；`bgra_*` 两测归 `region_ocr` 所有，留原处 · **D6 不碰**其他 300–600 文件（如 `live_frame_process.rs` 529，出界）· **D7 抽 `FrameWorkerState::compensated_epoch()`**（纯读 `SeqCst`），三处调用时机不变（393 在暂停分支内、902 在收尾）。

**分步（每步一个提交）**

| 步 | 动作 | 净减 | 主文件 | 棘轮 / 登记动作 |
|---|---|---|---|---|
| 1 | `live_session_liveness.rs`（无锁改动、3 个调用点） | −88 | ~886 | 保留棘轮行；`--write` |
| 2 | `FrameWorkerState`（Ctx 聚合，后续块改 `impl` 方法） | −112 | ~774 | 保留；`--write` |
| 3 | `live_session_pause_poll.rs`（含纯函数 + 测试随迁） | −140 | ~634 | 保留；`--write` |
| 4 | `live_player_probe.rs`（含 FFI 超时变体） | −136 | ~498 | **≤600 ⇒ 删棘轮行 + `--write`** |
| 5 | `live_profile_runtime.rs`（三步一体的状态机，整块搬） | −192 | ~306 | `--write` |
| 6 | `live_frame_consume.rs` + 诊断打印 | −70 | **~236** | **≤300 ⇒ 档位行自动消失** |

**★ 等价核对（顺序 / 锁 / 时序第一优先）**
1. **1s 主循环节拍顺序不可变**：门控 250ms → 暂停检查 → 恢复沿 `sleep(100ms)` → `comp_epoch` → 媒体 1s → 负载 2s → 采样 1s（内含 fg 2s / tier 观测 / override 消费 / 领域 150s / 播放器 5s / 信息 10s）→ 15s 诊断 → `sleep(50ms)`。块间**隐式数据流**必须保持：`stats.diff_pass/ocr_ok` 在 `process_frame` 内更新、**其后**被 tier 观测读差量；`accumulated_ocr_text` 更新后被领域重评读；`got_frame` 由 `process_frame`/`capture_latest_only` **内部清零**（契约注释）再被读。
2. **`if let Some(f) = latest_frame.lock()…clone()` 的守卫活到整个 `if let` 块结束**（edition 2021）⇒ 816–875 与 451–476 的**持锁窗口逐字保留**，**禁止**把 clone 提到 `if` 之前。
3. **嵌套锁顺序不得倒置**：`profile_override` → `applied_profile`（693 取锁 → 728 取锁 → 729 `emit`，IPC 在持锁中发出）；700 也在持 `profile_override` 时取 `applied_tier`。
4. **`db 写 → pause.request_* → app.emit` 三元组顺序**在 6 处（424–439 / 460–473 / 517–527 / 830–833 / 848–862 / 869–872）反复出现，不可重排；**15 处 emit 的事件名逐字不变**。
5. **9 条同步原语归属**：`stop`(SeqCst) / `speech_active`(**Relaxed，勿改 SeqCst**) / `subtitle_segments`(762 的守卫必须保持短) / `latest_frame` / `media_sound`(锁中毒按无声处理，**勿加 `unwrap`**) / 4 个 override 槽（本线程是唯一消费者，`guard.take()`） / `pause`（`total_paused_ms` 的唯一维护者是**捕获线程**，本文件只读） / `ScreenCaptureSampler`（**非 Send 的 COM 对象**，本线程内创建与显式释放）。本文件 **0 个 `spawn` / 0 个 mpsc/watch/oneshot**（线程由 `live_session.rs:304` spawn）。
6. **FFI 边界**：`engines.recognize_image_timeout(img, crate::engine::OCR_REQUEST_TIMEOUT)`（H2 的有界等待）**不得**被"统一"成无界 `recognize_image`；`bgraw.is_empty()` 的双重提前返回不可合并；`bgra_to_rgb_image` 返回 `Option` 需失败即返回。
7. **`Ctx` 聚合的坑**：`screen.as_mut()` 与 `&mut liveness`/`&mut trigger` 同时借用 ⇒ 逐块按字段借用而非整 `&mut self`；`image_store`/`foreground_monitor` 是**按值传入的 `mut` 局部量**（非 `Arc`）⇒ 建字段时保留 move 语义；`&ui_junk`（共享借用）与 `&mut last_changed_texts` 混用。

**验证**：`cargo test --test app_lib_tests`（逐步全绿；本文件只有 1 个 `#[path]` 测试模块，其余靠间接覆盖）· `cargo build` · `cargo clippy`（不增）· `node scripts/line-limits.mjs --full`。**只能真机**：WGC 停更判定与 `revive_wgc` 自愈 · 暂停冻结与 `comp_epoch` 时间戳补偿 · 空闲降频与 5s 探针唤醒 · 负载降级 0.1fps 封顶 · 前台切换 ROI 重扫 · 播放器图标检测 · `live:tier-downgrade-request` → 前端确认往返 · 截图命令读 `latest_frame`。
**报告**：`.../task-3-report.md`。

---

### Task 8: 拆 `app/src-tauri/src/note_filter.rs`（642 → ≈240–255）

> **边界取自**：`.../analysis-note-filter.md`（239 行：25 个顶层命名项、`filter_note_transcript` 167 行的 8 阶段拆解、62 例域内测试分布、7 个决策点、6 条未核实项）。
> ⚠️ **口径纠偏（分析实测）**：本文件**不是**查询构造层 —— SQL / `regex` / `LIKE` / `OnceLock` / `target_os` / feature 全部 **0 命中**，是**纯内存文本过滤管线**（无 IO、无 DB、无正则）。

**Files:**
- Modify: `app/src-tauri/src/note_filter.rs`（终态 ≈240–255，≤300 ⇒ 登记条目整行删除）
- Create（3 个，平铺 `src/`）：`note_filter_render.rs`(~140) · `note_filter_purify.rs`(~118) · `note_filter_chain.rs`(~185)
- Consumes: 分析报告；域内测试 62 例（本文件挂载 25 例 = tests 11 + golden 14）
- Produces: 上述 3 个模块 + `lib.rs` 新增 3 行 `mod`

**★ 裁决（分析 D1–D7）**：**D1 平铺顶层同级文件**（本仓既有形态；不用目录模块）· **D2 3 个文件**（**2 步不可达**：最大双单元 295 < 需搬 342）· **D3 叶子优先步序**（S1 render → S2 purify → S3 chain）· **D4 允许把必要的私有 fn 放宽到 `pub(crate)`**（9 个私有 fn 零直测，放宽不破测试；**只放宽必要的**，不整片改可见性）· **D5 再导出用 `pub(crate) use` 与项可见性 1:1**（`pub use` 再导出 `pub(crate)` 项会撞 E0365；分析未编译验证，按可见性对齐最稳）· **D6 6 条既有缺陷只搬不改**（含 `filter_note_empty` 丢 `env`、`refresh_screen_points` 对 `BodySource::Web` 退化为标题仅）· **D7 一步一提交**。

**分步（每步一个提交）**
| 步 | 动作 | 主文件 | 棘轮 / 登记动作 |
|---|---|---|---|
| S1 | 抽 `note_filter_render.rs` | ~517 | **≤600 ⇒ 本步提交里删 `FROZEN_OVER_LIMIT` 行 + `--write`**（转入 301–600 档，标注"拆分进行中"） |
| S2 | 抽 `note_filter_purify.rs` | ~380 | `--write` |
| S3 | 抽 `note_filter_chain.rs` | **~240–255** | **≤300 ⇒ 档位行自动消失** |

**★ 等价核对（判定顺序 = 语义，第一优先）**
1. **8 阶段单遍顺序不可重排**：③过渡判定先于⑤碎片、⑥净化先于⑧去重、⑦跨段后置 pass、fold 先于书面化 —— 任何重排都会静默改变输出文本（测试未必覆盖）。
2. **`filter_note_transcript`（212–378）整块搬迁时逐行保持**；`purify_segment`(46) 与 `FilterStats`(40) 次之。
3. **`use super::*` 的导入依赖**：25 个测试靠主文件的 `use` 行拿到类型名 ⇒ 拆完后主文件与新文件的 `use` 必须**仍能让 25 例编译**（剪导入 = 25 例集体编译失败）。移动测试时同步搬 `#[path]` 声明，**删声明 = 静默丢覆盖**。
4. **测试盲区**：25 例中**无一例带 `image_ref`** ⇒ 配图行格式串（509–514 的 markdown 直接拼接、519 的路径串）**没有测试拦网**，只能**逐字 diff** 证明未改；既有注入面（OCR 文本直拼 markdown）**只记录不改**。
5. 本文件 **0 IO / 0 DB** ⇒ 拆分不涉及连接/事务/锁语义；`#[cfg(test)] mod` 有 2 个挂载点，都要随对应单元走。

**验证**：`cargo test --test app_lib_tests`（逐步全绿；域内 62 例计数不减 —— `note_filter` / `note_filter_ai` / `note_filter_discourse` / `note_filter_ocr` 各自用例数不变）· `cargo build` · `cargo clippy`（不增）· `node scripts/line-limits.mjs --full`。
**报告**：`.../task-8-report.md`。

---

<!-- 剩余：Task 4–7 / 9（commands_ai_refine.rs 751 / db_goals.rs 707 / commands_goals.rs 673 / ai_refine_task.rs 670 /
     artifact_templates.rs 632）按同一模式补入 —— **补入前不得派发该任务的实施者**。
     已落盘分析：lib-rs(189) · types-rs(178) · live-session-frame(159) · video-profile(258) · note-filter(239)。
     ⚠️ 分析 note-filter 的 U6 提醒：**与 lib.rs 并行拆分会在 lib.rs 同一段插 `mod` 行而冲突** ——
     本计划已用「lib.rs 必须第一个拆」消解（lib.rs 落定后其余任务才允许追加 `mod`）。 -->

---

### Task 10: 拆 `app/src-tauri/src/video_profile.rs`（628 → ≈272）

> **边界取自**：`.../analysis-video-profile.md`（258 行：25 个顶层项行号表、三表同源契约、6 个决策点、6 条未核实项）。

**Files:**
- Modify: `app/src-tauri/src/video_profile.rs`
- Create（2 个）：`video_profile_detect.rs`(~150) · `video_profile_memory.rs`(~230)
- Consumes: 分析报告；落库值消费方 `live_session_lifecycle.rs:68` / `ai_refine_task.rs:318` / `artifact_templates.rs:624`；前端独立真值表 `app/src/types/live.ts:110–124` + `ProfileDetector.tsx:29/57/73/373`
- Produces: 上述 2 个模块；`lib.rs:475` 的 `mod video_profile;` 不动 + 新增 2 行 `mod`

**★ 裁决（分析 D1–D6）**：**D1 采用职责横切**（每档参数表 v0.5.0 已抽到 `video_profile_data.rs`，按档横切无标的；与登记表既定名 `video_profile_detect.rs` 吻合）· **D2 做满 2 步**（无地板障碍）· **D3 `apply_profile_memory` 象限③「需确认时记忆反而生效」是已裁决行为，禁止顺手修** · **D4 不拆测试文件**（`video_profile_tests.rs` 属 300–600 档，出界）· **D5 命名 = `video_profile_detect.rs` / `video_profile_memory.rs`** · **D6 顶层同级文件 + `lib.rs` 加 2 行 `mod`**（`lib.rs` 已在 Task 1 降到 ≤600 ⇒ 追加合规；**不用**目录模块）。

**分步（每步一个提交）**
| 步 | 动作 | 主文件 | 棘轮 / 登记动作 |
|---|---|---|---|
| 1 | 抽 `video_profile_detect.rs` | ~487 | **≤600 ⇒ 本步删 `FROZEN_OVER_LIMIT` 行 + `--write`**（转入 301–600 档） |
| 2 | 抽 `video_profile_memory.rs` | **~272** | **≤300 ⇒ 档位行自动消失** |

**★ 等价核对（第一优先 = `ProfileKind` 三表同源）**
1. **`ProfileKind` 有 3 张必须同步的表**：serde `rename_all = "kebab-case"` + `parse` 12 臂（**无显式 `"lecture"` 臂，靠 `_` 兜底**）+ `as_str` 13 臂。**`as_str()` 是落库值**（3 个消费方）⇒ **搬错一臂编译与单测都不报错**。逐臂比对 + 与前端真值表逐字对照。
2. **投票顺序即语义**：先剥系列名 → `max ≤ 0` 早返回 `Unknown`(score 1.0) → 稳定排序（平分依赖数据表顺序）→ 2.5 / 1.0 阈值。禁止重排、禁止改阈值。
3. **`impl ProfileMemory`（179 行 / 13 方法）整块搬**，含 `apply_profile_memory` 的既有裁决行为。
4. 本文件**零 `#[cfg]`/feature 门控**（仅文件末尾 `#[cfg(test)]`）；**无测试依赖私有项**（`score_profile`、2 个阈值 const、5 个私有 lookup 均无测试引用 ⇒ 33 个用例可整体不迁），但 `use super::*` 要求**再导出块齐全**（漏项 = 编译失败，属响亮失败）。
5. 测试基线：`cargo test --test app_lib_tests video_profile` = **74 例**。

**验证**：`cargo test --test app_lib_tests`（逐步全绿、74 例不减）· `cargo build` · `cargo clippy`（不增）· `node scripts/line-limits.mjs --full`。**只能真机**：档案三维热切换 + 自动重评（`apply_profile_memory` 三分支）。
**报告**：`.../task-10-report.md`。

---

## 完成本计划后的状态

- 10 个 Rust `>600` 文件全部脱离 `FROZEN_OVER_LIMIT`（`lib.rs` 停在 300–600 豁免带并已登记地板理由；其余 9 个目标 ≤300，实测以收尾为准）
- 全仓 `>600` 计数 = **0**（`node scripts/line-limits.mjs --full` 绿、`(a)`–`(e)` 全过）
- 新增门禁 `scripts/check-command-registry.mjs`（命令注册一致性从人眼转成机器）
- `FROZEN_OVER_LIMIT` 清空；登记表 100% 一致；「已拆分」节含本批 10 条记录

## 未做（登记）

- **CI 的 `app-rust` 预存失败**：本地以 CI 同一条命令实测 `cargo clippy -- -D warnings` = exit 101 / 15 个 error（与本批无关）⇒ 本批**不修**，但要求"错误数不增"。
- **4 个扫描域外文件**（`0-C1` 登记）：`app/src-tauri/build.rs` 152 · `app/src-tauri/examples/capture_ocr_diag.rs` 208 · `app/vite.config.ts` 40 · `app/vitest.config.ts` 23 —— 均 ≤300，不归红线管辖（扫描域 = `app/src` + `app/src-tauri/src` 的 `.ts/.tsx/.rs`）。
- **`lib.rs` 的 ≤300 目标**：结构性不可达（337 行地板）⇒ 已登记为豁免带，`include!` 方案经评估**否决**（理由见 Task 1）。
- **注册清单为何不拆成 4 个域文件**：`generate_handler!` 的 `Invoke` 按值语义使闭包组合不可行（Task 1「硬事实 2」）⇒ 单文件 + 机器门禁替代人眼审计。
- **`.qoder/repowiki/**` 里的行号锚点**（生成物、非门禁）会在本批后失效 —— 不修，另立条目。
- **`docs/tech-debt/` 未入库**、**Starter Kit 双重身份**（`0-C1` 登记项，仍未决）。

## 自审记录

**规范覆盖**：对应规格 §10 批 0「拆超限文件」与 §11 验收口径第 1 条；Rust 侧 10 个文件的行数由批 0-C1 以 `ReadAllLines` 口径全量实测得出，并与 `docs/standards/line-limit-exemptions.md`（生成物）一致。
**顺序依据**：`lib.rs` 第一 —— 其余 9 个任务的 `mod` 追加都落在它身上，而它现在 >600；不先降下来就会持续违反 v0.22 红线。
**已核实的宏行为**：`generate_handler!` 的命令名取路径末段、`Invoke` 按值传递、条目支持 `#[cfg]` 外层属性 —— 三条均读自本机 vendored 源码 `tauri-macros-2.6.3/src/command/handler.rs`（第 16–23 / 46–58 / 174–183 行），不是推测。
**占位符扫描**：**Task 1 / 2 / 3 / 10 已写完**（lib.rs · types.rs · live_session_frame.rs · video_profile.rs，对应分析报告各 159–258 行）；**Task 4–9 待各自分析落盘后补入**（`commands_ai_refine.rs` / `db_goals.rs` / `commands_goals.rs` / `ai_refine_task.rs` / `note_filter.rs` / `artifact_templates.rs`，6 份只读分析由控制方并行派发中）。补入前**不得派发**对应任务的实施者（否则实施者会自行发明边界）。
**位置计数更正**：派发顺序表的「Task #」= 文件在该表中的序号（Task 10 = `video_profile.rs`），与实际派发顺序一致。
**执行纪律**：串行（一次一个文件，一个实施者 + 一次任务评审），理由同 `0-C2`（共享登记表/棘轮/`lib.rs`，且 `git add` 与 `git commit` 交错会互相污染提交）。
