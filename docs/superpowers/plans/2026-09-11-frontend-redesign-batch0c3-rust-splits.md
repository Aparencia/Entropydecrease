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
- **顺序：`lib.rs` 第一个拆**（不是因为别人依赖它 —— 见下条，新模块**不必**进 `lib.rs`），而是因为它的注册清单改动是本批**最高危、唯一会静默失败**的一处（334 条、漏一条只有真机报 `command not found`），要在没有其他改动干扰时一次做干净、并当场建好注册一致性门禁。
- **★ 新模块的声明位置（本批统一口径，与 `lib.rs` 无关）**：新文件由**父模块自己**用 `#[path]` 声明，**不动 `lib.rs` 的 `mod` 块**：
  ```rust
  /// <为什么拆出来>（≤300 行约束 / AGENTS.md §3）
  #[path = "note_filter_chain.rs"]
  mod note_filter_chain;
  ```
  本仓先例：`streaming_asr.rs:31`（`#[path = "streaming_endpoint.rs"] mod endpoint;`）、`watermark_filter.rs:178`（`#[path = "watermark_cluster.rs"] mod watermark_cluster;`）。
  **理由**：① `lib.rs` 是 AGENTS.md §10 的额外审查文件（IPC 安全边界），少动一次少一次审查面；② 避免多个拆分任务在同一段 `mod` 块里互相冲突（分析 `note-filter` 的 U6 就点了这条）；③ 子模块路径在**父文件所在目录**解析 = `src/`，所以文件仍是平铺的 `src/<name>.rs`。
  ⚠️ 若不用 `#[path]`：`src/types.rs` 里的 `mod foo;` 会去找 `src/types/foo.rs`（**不是** `src/foo.rs`）—— 这是最容易踩的编译错误。子目录形态（`src/ai_refine_task/workers.rs`）同样用 `#[path = "ai_refine_task/workers.rs"]` 或让父文件变 `mod.rs`；**两种都可以，但都必须由父模块声明**。
  ⇒ 由此推论：`types.rs` 的门面、`db_goals.rs` 的 `#[path]` 子模块、`ai_refine_task/` 子目录都能**独立于 `lib.rs` 的拆分进展**开工。
- **★ 门禁现在每次提交都跑数值一致性**：`.husky/pre-commit` = `node scripts/line-limits.mjs --full && node scripts/docs-check.mjs`（本批会再加一条注册一致性检查）。⇒ **每个拆分提交都必须同时带上刷新后的登记表**，否则 `(e)` 会拦下你的提交。
- **多步拆分的门禁时机**（与 `0-C2` 同一条规则，逐字适用）：主文件**仍 >600** 时那条 `FROZEN_OVER_LIMIT` **必须留着**；一旦**降到 ≤600**，那条**必须立刻删掉**并在**同一个提交**里 `node scripts/line-limits.mjs --write` 刷新登记表。每步提交前先量行数再决定「不改 / 删棘轮行 + 刷表」。
- **提交纪律**：`git add <显式路径>`（**禁止** `git add -A`）· **禁止** `git stash`（本仓无 `.gitattributes` 且 `core.autocrlf=true`，会把源码变 CRLF）· **禁止** `git checkout -- <file>` 回滚 · **禁止** `--no-verify` · **切勿** `git gc --prune=now`（悬空备份 commit 是丢改动时唯一的找回途径）· 提交信息 Conventional Commits，subject ≤50 字。
- ⚠️ 判定原生命令结果用 `2>file` 或 `$LASTEXITCODE`，**不要用** `2>&1 |`（PS 5.1 会把原生 stderr 包成 `NativeCommandError`，让成功的命令报 exit 1）。
- **串行执行**：同一时刻只有一个实施者动 `scripts/line-limits.mjs` / `docs/standards/line-limit-exemptions.md` / `lib.rs`（并发会互相覆盖，且 `git add` 与 `git commit` 交错会把别人的暂存文件卷进自己的提交）。控制方一次派发一个文件。

### 每个拆分任务的统一作业模式（Task 1–10 共用，逐条照做）

1. **先读结构分析的实测结论**：`.superpowers/sdd/2026-09-11-frontend-redesign-batch0c3-rust-splits/analysis-<file>.md`（顶层项与行号、依赖面、提议边界、风险表、测试覆盖）。计划里该任务的「拆分边界」节据它写成；**若你读代码后发现与分析不符，以代码为准并在报告里指出**。
2. **录基线**：该文件行数（`ReadAllLines` 口径）· `cargo test --test app_lib_tests` 的通过/失败/忽略数 · `cargo clippy` 的 error 数 · 该文件的直接测试覆盖（哪些 `*_tests.rs` 引用它）。
3. **抽出单元 → 新文件**：新文件含 `//! @ai-context`（业务背景 / 副作用 / 边界）；公共 API（`pub`/`pub(crate)` 可见性、函数签名、结构体字段顺序）保持兼容；**新模块由「父模块自己」用 `#[path]` 声明**（见 Global Constraints 的「新模块的声明位置」——**不要**往 `lib.rs` 的 `mod` 块里加行）：`#[path = "<新文件>.rs"] mod <短名>;`。**例外只有一个**：`lib.rs` 自己的 Task 1（它本就是 crate 根，加 `mod app_commands;`）。
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
| 9 | `app/src-tauri/src/artifact_templates.rs` | 632 | ✅ `analysis-artifact-templates.md` | 按**档案族**拆（**不是**字面量文件 —— 见 Task 9 的口径纠偏）；代码帧子域留主文件 |
| 10 | `app/src-tauri/src/video_profile.rs` | 628 | ✅ `analysis-video-profile.md` | 枚举 ↔ 前后端字面量契约 |

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
- Create（**6 个，全部 ≤300，平铺 `src/`**）：`types_session.rs`(~135) · `types_knowledge.rs`(~245) · `types_note.rs`(~230) · `types_ocr.rs`(~82) · `types_extract.rs`(~68) · `types_decision.rs`(~75)
- 声明方式：**在 `types.rs` 里用 `#[path]` 声明**（`#[path = "types_session.rs"] mod types_session;` …×6 + `pub use types_session::*;` …×6）—— **`lib.rs:469` 的 `mod types;` 不动**，也**不要**指望 `mod types_session;` 能解析到 `src/types_session.rs`（它会去找 `src/types/types_session.rs`）
- Consumes: 分析报告；**引用面 157 个文件 / 236 处 `crate::types::…`（92 非测试 + 65 测试）⇒ 一处都不改**
- Produces: 上述 6 个模块 + 门面；`crate::types::X` 对全仓可见性**完全等价**（门面再导出）

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
- Produces: 上述 6 个模块（**由 `live_session_frame.rs` 自己用 `#[path]` 声明，不动 `lib.rs` 的 `mod` 块**）；`run_screen_worker` 的**公共签名与调用点保持不变**（改由 `FrameWorkerState` 聚合上下文 + 分文件 `impl`；`impl` 与被 impl 的类型同 crate 即可，模块不同不影响）

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
- Produces: 上述 3 个模块（**由 `note_filter.rs` 用 `#[path]` 声明，不动 `lib.rs` 的 `mod` 块**）

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

### Task 9: 拆 `app/src-tauri/src/artifact_templates.rs`（632 → ≈218）

> **边界取自**：`.../analysis-artifact-templates.md`（303 行：20 个顶层项、字面量 vs 逻辑行数统计、17 个用例的断言覆盖、风险 R1/R3）。
> ⚠️ **口径纠偏（分析实测推翻了我的初判）**：本文件**不是**模板正文字面量文件 —— 多行字面量 / raw string / `{{}}` / `{0}` / `%s` / emoji **全部 0 命中**，产物可见文本字面量仅 **8 行 / 约 69 字符 / 1.3%**，纯逻辑 **485 行**。⇒ **按「档案族」拆**，实施者不要去翻不存在的模板正文块、更不要自行发明边界。

**Files:**
- Modify: `app/src-tauri/src/artifact_templates.rs`（终态 ≈218）
- Create（2 个，平铺 `src/`）：`artifact_templates_visual.rs`(~205：lecture + hands_on + step_cards，私有回退随 569 闭合组) · `artifact_templates_voice.rs`(~236：talking_head + storytelling + interview + meeting，私有回退随 196 闭合组)
- 声明方式：**在 `artifact_templates.rs` 内用 `#[path]` 声明**（`#[path = "artifact_templates_visual.rs"] mod visual;`）—— **不动 `lib.rs`**
- Consumes: 分析报告；唯一生产消费者 `commands_artifacts.rs:13,45`；测试直接调用 `code_blocks` / 构造 `CodeFrame`
- Produces: 上述 2 个模块；`pub` 面仅 3 项（`CodeFrame` 403 / `code_blocks` 421 / `build_artifact` 578）**可见性不得变**

**★ 裁决（分析 D1–D5）**：**D1 布局 = `#[path]` 平铺同级文件**（本批统一口径；分析给的 A 案「`artifact_templates.rs` + `artifact_templates/` 子目录」仓内 0 先例、C 案要动 `lib.rs`）· **D2 2 个文件** · **D3 一步做完**（最小可行 = **1 步**：单提交即 ≤300，地板 ≈218）· **D4 代码帧子域 398–534（137 行）留主文件**（测试直接调用，移出就得改已登记的 423 行测试文件）· **D5 不补测试**（出界，另立条目）。

**分步（单提交）**：抽 2 个文件 → 主文件 ≈218（≤600 **且** ≤300）⇒ **同一个提交里删 `FROZEN_OVER_LIMIT` 的 `artifact_templates.rs` 行 + `--write`**（≤600 会触发守卫 (b)；≤300 ⇒ 档位行不生成）。验收后 `>600` 计数应为 **13 / 123 / 137**。

**★ 等价核对（第一优先 = 输出文本没有金值拦网）**
1. **17 个用例对输出文本零断言**：`"# {}"` / `"本章小结 @ {}ms"` / `"full/{}.webp"` / `"步骤 {}"` / `"{}（{}）"` 全无整串快照（只有 292 行的 code 文本、368 行的 label 有金值）⇒ **改一个字符测试照样绿**。**必须 `git diff` 逐行核对这 8 行字面量**（26 / 34 / 104 / 143 / 388 / 132 / 549 / 556；其中含全角括号的恰 1 行 = 556）。
2. 全文件 **CRLF** ⇒ **禁止任何 formatter 触碰**这两处新老文件（本机没有 prettier 管辖权，但手工重排/去尾空格同样会改字节）。
3. 档案族归属：`lecture_blocks`(18–112，最大单元 95 行) / `meeting_blocks`(66) / `talking_head_blocks`(63) 等按族整块搬，**不按函数大小硬切**。
4. `build_artifact` 的分派臂与私有回退（196、569 闭合组）**必须与它调用的族函数同侧可见**（子模块可用 `super::` 访问父模块私有项；父模块调子模块项需 `pub(super)`）。

**验证**：`cargo test --test app_lib_tests`（`artifact_templates` 用例数不减，含全 13 kind 矩阵）· `cargo build` · `cargo clippy`（不增）· `node scripts/line-limits.mjs --full`。
**报告**：`.../task-9-report.md`。

---

### Task 4: 拆 `app/src-tauri/src/commands_ai_refine.rs`（751 → ≈205）

> **边界取自**：`.../analysis-commands-ai-refine.md`（258 行：27 个顶层项、`ai_refine_start` 108 行的内部拆解、9 条命令的注册行号、7 个决策点 + 7 条不确定项）。

**Files:**
- Modify: `app/src-tauri/src/commands_ai_refine.rs` → **目录模块**：`app/src-tauri/src/commands_ai_refine/mod.rs`（外壳 ≈75）+ 子模块 `dto.rs`(~58) · `registry.rs`(~95) · `gate.rs`(~52) · `workbench.rs`(~205) · `session.rs`(~250) · `apply.rs`(~130)
- 声明方式：**目录模块**（`mod.rs`）⇒ `lib.rs:48` 的 `mod commands_ai_refine;` **不动**，`crate::commands_ai_refine::X` 对 10 文件 20 处外部引用**零改动**（目录模块是 `/capture/` 之外的第二个先例，但 `capture/` 已证明可行）
- Consumes: 分析报告；`lib.rs:916–923 + 929` 的 9 条注册；测试仅 2 个内联用例 + 外部 3 个用例（`commands_proofread_tests.rs` 2 + `db_ai_tasks_tests.rs` 1）
- Produces: 上述目录模块；**9 个 `#[tauri::command]` 的 IPC 名逐字不变**

**★ 裁决（分析 D1–D7）**
- **D1 目录模块**（`mod.rs` 外壳）：唯一同时做到「零 `lib.rs` 改动」+「外部引用零改动」+（配合 D2）「≤300」的形态。
- **D2 命令定义随域下沉，并同步改注册路径**：9 个命令**可以**移到子模块，但注册路径必须同批改成 `crate::commands_ai_refine::<子模块>::<cmd>`。
  **为什么这是安全的**：① IPC 名 = 路径**末段** ⇒ 名不变（`tauri-macros-2.6.3/src/command/handler.rs:46-58` 已核实）；② 路径写错 = **编译期**找不到 `__cmd__<fn>` ⇒ **响亮失败**，不是静默；③ `pub use` **不能**替代（宏不随 `pub use` 重导出，仓内实证注释 `lib.rs:740–741`）。
  **验收**：改完必须 `node scripts/check-command-registry.mjs` 报 334/334（Task 1 已建），并用注册清单探针证明「丢失 N 条 ↔ 新增 N 条」**按末段一一配对**：
  ```powershell
  $S = ".superpowers/sdd/2026-09-11-frontend-redesign-batch0c3-rust-splits"
  node $S/probe-registry-parity.mjs verify $S/snap-registry-baseline.json app/src-tauri/src/app_commands.rs
  ```
  （它会报 `丢失 …`/`新增 …` 两组，**逐条列出末段相同的配对**作为"IPC 名未变"的证据；这一步是本任务唯一的静默风险面。）
- **D3 `gate.rs` 独立**（余额/配额门控）· **D4 只放宽必要的可见性**（`stats_from` → `pub(super)`，不做整片改）· **D5 测试随迁**（`#[cfg(test)] #[path]` 声明跟着走，删声明 = 静默丢覆盖）· **D6 子模块命名按域**（`mod.rs` 文件头必须逐条写明每个子模块的职责）· **D7 既有缺陷只搬不改**。

**分步（每步一个提交）**：≈751 → 步 1 建 `mod.rs` 外壳 + `dto`/`registry` → 步 2 `gate` + `workbench`（**主文件 ≈575 ≤600 ⇒ 本步提交里删 `FROZEN_OVER_LIMIT` 行 + `--write`**）→ 步 3 `session` → 步 4 `apply`（**≤300 ⇒ 档位行自动消失**）。步后行数以实测为准。

**★ 等价核对**：① `ai_refine_start`(137–250) 的**三段顺序**（余额+配额校验 → DB 落库 → 去重）不可重排、不可提前/延后 await；② 9 条注册路径与 `check-command-registry` 全绿；③ 本文件测试覆盖极低（9 个 command 与 `ensure_balance_for` **零测试**）⇒ 改动只能靠**逐行 diff + 真机 IPC 冒烟**兜底；④ 既有缺陷（分析 §4 列出的）只记录不改。

**验证**：`cargo test --test app_lib_tests`（用例数不减）· `cargo build` · `cargo clippy`（不增）· `node scripts/check-command-registry.mjs` · 探针配对 · `node scripts/line-limits.mjs --full`。**只能真机**：AI 精修的 9 个入口各点一次（只验可达，红线默认关），控制台不得出现 `command … not found`。
**报告**：`.../task-4-report.md`。

---

### Task 5: 拆 `app/src-tauri/src/db_goals.rs`（707 → ≈258）

> **边界取自**：`.../analysis-db-goals.md`（255 行：6 个顶层项、`goal_plan_context` 69 行的段级拆解、9 条 `CREATE` 的行号、7 个决策点）。

**Files:**
- Modify: `app/src-tauri/src/db_goals.rs`（终态 ≈88 地板 + 分派）
- Create（6 个，平铺 `src/`）：`db_goals_milestone.rs`(~131) · `db_goals_plan.rs`(~220) · `db_goals_goal.rs`(~133) · `db_goals_retro.rs`(~96) · `db_goals_binding.rs`(~60) · `db_goals_graduation.rs`(~46)
- 声明方式：**在 `db_goals.rs` 内 `#[path = "db_goals_plan.rs"] mod plan;` 逐条声明** ⇒ `lib.rs:248` 与 `crate::db_goals::init`（`db_migrations.rs:513`）**零改动**
- Consumes: 分析报告；40 个相关用例全在 `cargo test --test app_lib_tests`（全内存库）
- Produces: 上述 6 个模块；`Db` 的 `pub fn` 面不变（`impl Db` 与类型同 crate ⇒ 分模块 `impl` 合法）

**★ 裁决（分析 D1–D7）**：**D1 用 `#[path]` 从父文件声明平铺子模块**（先例 `streaming_asr.rs:31` / `watermark_filter.rs:178`；不碰 `lib.rs`）· **D2 6 个文件** · **D3 `init` 原地不动**（它含 9 条 `CREATE`，**schema 敏感**）· **D4 步序按域**（先 `milestone` → 再 `plan` → 再 `goal` → 其余）· **D5 中间态照全局规则处理**（≤600 即删棘轮行 + `--write`，不要合并成一个大提交）· **D6 注释只搬不改** · **D7 同步 `docs/` 里的行号锚点**（若引用了本文件行号）。

**★ schema 红线**：本任务**不触碰** schema —— `init`(20–69) 与 9 条 `CREATE`（23/35/36/48/49/56/59/66）**SQL 文本逐字不动**，**0 条** `PRAGMA`/`ALTER`/`DROP`。跨文件依赖：`contracts` 唯一索引（`db_migrations.rs:171`）、`knowledge_links` 无约束 —— 均不改。

**分步（每步一个提交）**：707 → 步 1 `milestone`(~587) → 步 2 `plan`(~380) → 步 3 `goal`(**~258 ≤300**)。⚠️ **S1 后主文件 ≤600 ⇒ 必须在 S1 的提交里删 `FROZEN_OVER_LIMIT` 行 + `--write`**（守卫 (b) 否则 exit 1）；S3 后 ≤300 ⇒ 档位行由 `--write` 自动删除。步后行数以实测为准（±5%）。

**★ 等价核对**：① **`add_milestone_row` 是三条写路径共用**（`create_goal` / `add_milestone` / `apply_plan_core`）⇒ 搬它必须同时确认三个调用点仍解析到同一函数（可见性 `pub(super)` 最小放宽）；② **`with_conn` 锁不可重入** ⇒ 367/587 的**预取行必须留在闭包之外**（搬进闭包 = 运行期自锁死）；③ 最大函数 `goal_plan_context`(582–654) **恰好是唯一零测试覆盖的方法** ⇒ 逐行 diff + 人工核对 4 个 SQL 执行点与 15 行 SQL 文本；④ `impl Db` 分模块后 `use` 面要够（漏 `use` = 编译失败，属响亮失败）。

**验证**：`cargo test --test app_lib_tests`（40 个相关用例不减；全内存库，不连真实数据）· `cargo build` · `cargo clippy`（不增）· `node scripts/line-limits.mjs --full`。**只能真机**：目标创建/里程碑/计划应用/复盘/绑定/毕业六条动线的读写往返。
**报告**：`.../task-5-report.md`。

---

### Task 7: 拆 `app/src-tauri/src/ai_refine_task.rs`（670 → ≈256）

> **边界取自**：`.../analysis-ai-refine-task.md`（278 行：15 个顶层项、`refine_slices_concurrent` 180 行的三段拆解、12 条共享状态、2 个事件、7 个决策点）。

**Files:**
- Modify: `app/src-tauri/src/ai_refine_task.rs`（保留为模块根，**不改成 `mod.rs`**）
- Create（4 个，**子目录**）：`ai_refine_task/workers.rs`(~240) · `ai_refine_task/skeleton.rs`(~113) · `ai_refine_task/vision.rs`(~72) · `ai_refine_task/stream.rs`(~36)
- 声明方式：**在 `ai_refine_task.rs` 内 `#[path = "ai_refine_task/workers.rs"] mod workers;`** ⇒ `lib.rs:41` 的 `mod ai_refine_task;` **零改动**，父文件路径不变（先例 `streaming_asr.rs:31`）
- Consumes: 分析报告；**本文件 0 专属测试**（`ai_refine_task_tests.rs` 不存在）；仅 `ai_note_refine_task_tests.rs:27` 引用 `RefineStreamFrame`；全仓 `#[tokio::test]` = 0
- Produces: 上述 4 个模块；`RefineStreamFrame` 类型可见性不变

**★ 裁决（分析 D1–D7）**：**D1 子目录 + 父文件用 `#[path]` 声明**（`lib.rs` 零改动；父文件保持 670 行的模块根身份）· **D2 4 个文件** · **D3 做满到 ≤300**（≈670 → 442 → 348 → **284**，推荐 4 步 ≈256）· **D4 `RefineCtx` 归属**：随 `workers.rs`（它是 worker 池的上下文）· **D5 帧类型 `RefineStreamFrame` 留在父文件**（外部唯一引用点）、由子模块 `use super::RefineStreamFrame` · **D6 门禁时机照全局规则**（步 1 后 ≈442 ≤600 ⇒ **步 1 的提交必须同删 `FROZEN_OVER_LIMIT` 行 + `--write`**）· **D7 本批不补测试**（本文件零覆盖，补测试另立条目）。

**★ 等价核对（并发语义第一优先）**
1. **`turns` 锁的语句级临时守卫（596–607）**：`build_system` / `turn_user_text` / `to_string(&r)` **全在持锁下执行** —— 「先建 `AiTurn` 再 `push`」= 缩短锁窗口 = **并发行为变更（禁止）**。
2. **`rx.iter()`(627) 必须在 `scope` join 之后**（搬进 scope 内 = 死锁）。
3. 线程创建链不变：命令层 `spawn_blocking`(`commands_ai_refine.rs:246`，JoinHandle 未 await) → `std::thread::scope`(506) → `scope.spawn`(521，1..=3 线程)；**本文件 0 处 tokio/abort/cancel/timeout**（超时在 `ai_client.rs:238` 的 300s）。
4. 12 条共享状态的「谁写/谁读/持锁范围」逐条不变（含 worker 局部 `Arc<Mutex<VecDeque>>`(483) / `Arc<Mutex<Vec<AiTurn>>>`(487) / **std `mpsc`**(484)）。
5. 事件名逐字不变：`"ai:refine-stream"`（唯一 emit 点 67，5 种帧）+ `"ai:task-update"`（经 `set_task`；本文件触发 4 处）。

**验证**：`cargo test --test app_lib_tests`（用例数不减）· `cargo build` · `cargo clippy`（不增）· `cargo build --bin cer_bench --bin asr_eval` · `node scripts/line-limits.mjs --full`。**只能真机**：AI 精修并发（1..=3 线程）· 流式帧 5 种形态 · 任务状态流转 · 取消/失败路径。
**报告**：`.../task-7-report.md`。

---

### Task 6: 拆 `app/src-tauri/src/commands_goals.rs`（673 → ≈253）

> **边界取自**：`.../analysis-commands-goals.md`（430 行：48 个顶层项、15 条 command 的注册行号、11 处 emit 站点、7 个决策点 + 7 条不确定项）。

**Files:**
- Modify: `app/src-tauri/src/commands_goals.rs`（终态 ≈253；内容地板 213 行，≤300 可达）
- Create（3 个，平铺 `src/`）：`commands_goals_views.rs`(~194：读侧 5 DTO + 3 命令，**0 emit**) · `commands_goals_milestones.rs`(~180：7 命令 + 4 inner + 2 常量，**6 emit**) · `commands_goals_intent.rs`(~102：输入 DTO + 纯助手，**无命令**)
- 声明方式：**在 `commands_goals.rs` 内 `#[path = "commands_goals_views.rs"] mod views;` 逐条声明** ⇒ `lib.rs:150` 的 `mod commands_goals;` **零改动**
- Consumes: 分析报告；15 条命令注册在 `lib.rs:648–662`；测试 3 文件 23 用例（全直调 `*_inner` + `Db::open(":memory:")`）
- Produces: 上述 3 个模块；**15 条 IPC 名逐字不变**（注册路径由两段变三段）

**★ 裁决（分析 D1–D7）**：**D1 3 个文件**（不用目录模块、**不用 `pub use` 重导出**——tauri 宏生成项不随 `pub use` 走，`lib.rs:740–741` + `tauri-macros-2.6.3` wrapper.rs:296–352 取证）· **D2 bind/unbind 归 `milestones`**（与 6 处 emit 同侧）· **D3 输入 DTO 独立成 `intent.rs`**（不并入 `goal_interview.rs`：那是另一模块的职责，并入会把它推到 ~297 行）· **D4 测试 `use` 行直接改**（编译期可查；不加兼容层）· **D5 步序 views → milestones → intent** · **D6 不补**那 4 条零覆盖命令的测试（出界，另立条目）· **D7 不做 facade**。

**★ 注册路径必改（本任务唯一静默风险面）**：10 条注册项要改成 `crate::commands_goals::<子模块>::<cmd>`，**必须在 `app_commands.rs`（Task 1 的产物）里同批改**，并跑：
```powershell
node scripts/check-command-registry.mjs        # 期望 ✅ 定义 334 / 注册 334 / 重复 0
$S = ".superpowers/sdd/2026-09-11-frontend-redesign-batch0c3-rust-splits"
node $S/probe-registry-parity.mjs verify $S/snap-registry-baseline.json app/src-tauri/src/app_commands.rs
# 期望：✅ 按末段名逐条相同 + 打印若干条「路径前缀变化」——这就是"IPC 名未变"的机械证据
```
**失败模式是静默的**：把注册行整条删掉 ⇒ 编译通过 + 23 个用例全绿，**只有真机点该功能才报 `command not found`**（`pub fn` 不触 `dead_code`）。反面已证伪：ACL 静默过滤在本仓不触发（`REMOVE_UNUSED_COMMANDS` 0 命中、无 `permissions/`）。

**分步（每步一个提交）**：673 → 步 1 `views`(~500 ⇒ **删 `FROZEN_OVER_LIMIT` 行 + `--write`**) → 步 2 `milestones`(~345) → 步 3 `intent`(**~253 ≤300 ⇒ 档位行自动消失**)。步后行数以实测为准。

**★ 等价核对**
1. **11 处 `emit_changed(DataDomain::Goals)` 的位置与条件逐字不变**（其中 `add_goal_milestone` 是**唯一无条件** emit）；视图侧 0 emit。
2. 15 条命令壳的入参/返回/`State` 用法不变 —— **15 条命令壳与 11 处 emit 完全未被测试覆盖**（既有 23 个用例只直调 `*_inner`；前端测试 mock 掉 `invoke`、只断言名字串 ⇒ 不能替代注册验证）。
3. 3 个测试文件的 `use` 行改完后仍全绿（`#[path]` 测试声明**不得删**，删了 = 静默丢覆盖）。
4. 既有缺陷只搬不改。

**验证**：`cargo test --test app_lib_tests`（goals 相关 ≥23 用例且不降）· `cargo build` · `cargo clippy`（不增）· `node scripts/check-command-registry.mjs` · 注册清单探针 · `node scripts/line-limits.mjs --full`。**只能真机**：15 条命令各点一次（只验可达）。
**报告**：`.../task-6-report.md`。

---

<!-- 全部 10 个 Task 节已写完。10 份只读分析全部落盘：lib-rs(189) · types-rs(178) · live-session-frame(159) ·
     commands-ai-refine(258) · db-goals(255) · commands-goals(430) · ai-refine-task(278) · note-filter(239) ·
     artifact-templates(303) · video-profile(258)。**无占位符待补。** -->

---

### Task 10: 拆 `app/src-tauri/src/video_profile.rs`（628 → ≈272）

> **边界取自**：`.../analysis-video-profile.md`（258 行：25 个顶层项行号表、三表同源契约、6 个决策点、6 条未核实项）。

**Files:**
- Modify: `app/src-tauri/src/video_profile.rs`
- Create（2 个）：`video_profile_detect.rs`(~150) · `video_profile_memory.rs`(~230)
- Consumes: 分析报告；落库值消费方 `live_session_lifecycle.rs:68` / `ai_refine_task.rs:318` / `artifact_templates.rs:624`；前端独立真值表 `app/src/types/live.ts:110–124` + `ProfileDetector.tsx:29/57/73/373`
- Produces: 上述 2 个模块（**由 `video_profile.rs` 用 `#[path]` 声明，不动 `lib.rs` 的 `mod` 块**）

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
**占位符扫描**：**Task 1–10 全部写完**（10 份只读分析全部落盘，各 159–430 行）—— 每节含：源自分析的边界与新文件清单、分步表（含**每一步**的 `FROZEN_OVER_LIMIT`/登记表动作）、控制方对分析所提决策点的**裁决**、该文件特有的等价核对清单、验证命令与报告路径。**无占位符**。
**口径一致性（本轮修掉的一处自相矛盾）**：统一作业模式第 3 步原写「在 `lib.rs` 声明块插入 `mod`」，与 Global Constraints 的「新模块由父模块用 `#[path]` 声明」冲突（分析 `commands-goals` 代理发现并登记）⇒ 已统一为「**父模块 `#[path]` 声明，唯一例外是 `lib.rs` 自己的 Task 1**」。
**执行纪律**：串行（一次一个文件，一个实施者 + 一次任务评审），理由同 `0-C2`（共享登记表/棘轮/`lib.rs`，且 `git add` 与 `git commit` 交错会互相污染提交）。
