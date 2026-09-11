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

<!-- 剩余：Task 2–10（types.rs 1017 / live_session_frame.rs 974 / commands_ai_refine.rs 751 / db_goals.rs 707 /
     commands_goals.rs 673 / ai_refine_task.rs 670 / note_filter.rs 642 / artifact_templates.rs 632 / video_profile.rs 628）
     按与 Task 1 相同的模式补入 —— **补入前不得派发该任务的实施者**（否则实施者会自行发明边界）。
     已落盘的三份分析：analysis-types-rs.md（178 行）· analysis-live-session-frame.md（159 行）· analysis-lib-rs.md（189 行，已用）。
     其余 7 份由控制方并行派发的只读分析产出中。 -->

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
**占位符扫描**：**Task 1 已写完**；**Task 2–10 待各自分析落盘后按同一模式补入**（10 份分析中 3 份已落盘，7 份由控制方并行派发中）。补入前不得派发对应任务的实施者。
**执行纪律**：串行（一次一个文件，一个实施者 + 一次任务评审），理由同 `0-C2`（共享登记表/棘轮/`lib.rs`，且 `git add` 与 `git commit` 交错会互相污染提交）。
