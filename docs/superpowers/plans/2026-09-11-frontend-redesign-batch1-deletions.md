# 批 1 删除批实施计划（IPC 面收敛 + 补缝三连连带模块 + ADR-010 退役 + 死文案清理）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `app/src-tauri/src/app_commands.rs` 的 IPC 注册面从 **334 条降到 312 条**（删 **22** 条「有定义、有注册、前端生产代码零调用」的命令），连同它们的注册行、模块文档、专用私有 helper、**整模块级连带死代码**（`ai_judge` 模块 + `AiMockAdapter::enhance`，连带 **16 条 Rust 测试**〔**2026-09-12 更正**：连同 `ai_protocol.rs` 的 `AiEnhance*` 半边，实际连带 **26 条**（9+7+10）；批内另有 Task 3 的 −25〕）、`structuredBlocks.ts` 的过时占位死文案，并把 **ADR-010 修订为退役**；本批**纯减法**——不迁任何调用点、不改任何界面、不动 `app/src/ui/primitives/**`。

**Architecture:** 删除面沿**已有的模块边界**切分（每条命令的 `#[tauri::command] fn` 在哪个文件、注册条目在 `app_commands.rs` 的哪一行，逐条给出 `文件:行`）。每个删除任务 = **一个文件（或一族同构命令）+ `app_commands.rs` 的注册行 + 行数豁免表刷新 + 一次显式路径提交**。删除后必须同时满足三条机器判据：① `scripts/check-command-registry.mjs` 三向一致且计数按预期下降（改 `app_commands.rs` 是**唯一会静默失败的面**：漏一条只有真机点到才报 `command … not found`）；② `cargo test --test app_lib_tests` 用例数**只按被删测试数下降**（**2026-09-12 更正**：原写「2359 → 2343，仅在 Task 5」；实际 **2359 → 2334**（Task 3，−25）**→ 2308**（Task 4+5 合并为 `fd9dd8f9`，−26 = 9+7+10））；③ `node scripts/line-limits.mjs --full` exit 0 —— 删除会让**已登记文件的行数变化**，因此**每个任务都必须同提交刷新 `docs/standards/line-limit-exemptions.md`**，否则 pre-commit 的 `--full` 会当场拦下提交。

**Tech Stack:** Tauri 2.11.5 + Rust 2021（`[lib] name = "app_lib"`，测试唯一入口 `cargo test --test app_lib_tests`）· React 19.1 + TypeScript 5.8（`strict`，禁 `any`）· Vitest 4 · Node 24（`scripts/*.mjs` 门禁）

**Spec:** [2026-09-11-frontend-redesign-design.md](../specs/2026-09-11-frontend-redesign-design.md)（§2 现状基线与 `[DEAD]` 污染警告 · §9 47 条未接线命令最终处置表 · §10 批次划分批 1 行 · §11 验收口径第 7 条 · §14 文档与提交）

**输入材料（开工前五份，优先级即此序）**

1. `.superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions/tmp/CONTROL-FINDINGS-dead-commands.md`（**控制方独立普查 + 两轮追加裁决**；本计划的 `open_capture_float` 改判与 `structuredBlocks` 边界裁决均出自它）
2. 本计划的 **§现状普查与 47 条处置总表**（计划者独立复算，含与控制方数字的并列与差异原因）
3. 规格对应节（§2 / §9 / §10 / §11 / §14）
4. `.superpowers/sdd/DISPATCH-TEMPLATE.md`（实施者纪律：§一 硬约束 · §二 门禁纪律 · §三 提交与协作纪律 · §四 机械等价证据 · §五 报告与收尾）· `.superpowers/sdd/REVIEW-TEMPLATE.md`（评审者纪律）
5. 兄弟计划 [2026-09-11-frontend-redesign-batch0d-primitives.md](./2026-09-11-frontend-redesign-batch0d-primitives.md)（**house style**：任务粒度、验收写法、报告落点；⚠️ 那是**新建代码**批，本批是**删除**批，验收口径不同——见「每个删除任务的统一作业模式」）

## Global Constraints

- **本批范围（控制方裁决）**：**22 条命令的删除**（规格原写 21 条 ＋ 控制方改判的 `open_capture_float`）· 补缝三连的**模块级连带死代码** · `structuredBlocks.ts` 的 `aiPlaceholderLabel()` 死文案 · **ADR-010 修订为退役** · 规格与需求池的同步回写。
- **★ 本批不迁移任何调用点、不改任何界面**（规格 §10「批 0–1–2 期间界面几乎不变 —— 这是设计意图」）。唯一的前端改动是 Task 9 的**删除**（删一个死函数 + 一条测试），不新增任何渲染路径。
- **★ 不碰 `app/src/ui/primitives/**`**：批 0-D 刚落地 10 类原语（41 个文件，逐个 ≤300 行）；该目录此刻**还有别的 agent 在改**（实测工作树 `M app/src/ui/primitives/{Loading.css,Loading.test.tsx,Loading.tsx,motion.css,style-contract.test.ts}` + `?? app/src/ui/primitives/motion-coverage.test.ts`）⇒ **本批一个字节都不动它**，也不要以它作为「前端基线」的计数依据（它的文件数/用例数随时在变）。
- **★ 不碰仓库根 `tmp/`**（实测 `?? tmp/`，他人临时树）、不碰 `docs/tech-debt/`（实测 `docs/tech-debt/` **0 tracked**，未入库 ⇒ 本批只在报告里引用其结论，**不改它、不 `git add` 它**）。
- **行数红线**：单文件 ≤300 行（全部行数，含空行）。唯一有效口径 = `node scripts/line-limits.mjs` 的 `countLines()` == `[System.IO.File]::ReadAllLines($p,[System.Text.Encoding]::UTF8).Count`。⚠️ **禁用**：`Get-Content`（本机 PowerShell 5.1 + 码页 `gb2312` 按 GBK 解码、**少算可达 56 行**；`docs/versions/v0.22.md:114-117` 有实测记录）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数（末尾无换行的文件少算 1）。301–600 区间必须登记在 `docs/standards/line-limit-exemptions.md`；>600 必须硬拆；**新文件一律不得登记为豁免**。本批只**减行**，因此只有两种登记动作：**数值更新**（仍 301–600）或**整行删除**（已回落到 ≤300，由 `--write` 自动完成，check `(d)` 强制）。
- **★ 行数豁免表是共享生成物**：`docs/standards/line-limit-exemptions.md` 的表头写明「**不要手改数字**、手加行或手删行」⇒ **刷新只走 `node scripts/line-limits.mjs --write`**（幂等），**不要手改 `| 文件 | 行数 |` 的数字**。`--write` 之后**必须** `git diff --stat -- docs/standards/line-limit-exemptions.md` 并**如实记录**：若 diff 里出现本批未触碰的文件行（并行 agent 的在飞改动），按 `DISPATCH-TEMPLATE.md` §三第 2 条**照实登记「这一行是在哪次提交落库的」，不要为掩盖它去改别人的行**。
- **删命令 = 改 IPC 契约面（本仓唯一的静默失败面）**：`app_commands.rs` 是 AGENTS.md §10 的额外审查文件，`lib.rs` 同。**每条命令删除前必须三向复核**：① 前端生产代码（`app/src/**` 去掉 `*.test.ts(x)`）对该命令名的**字面量**引用为 0；② 前端测试文件为 0（若不为 0，删除面多一块：测试也要删）；③ Rust 侧除「定义处 + 注册处」外的**调用形态**引用为 0（注释命中不算引用，但要人工判一次并把结论写进报告）。三向都空才可删。
- **★ 判「前端是否调用」的正确匹配式**：`(?<![A-Za-z0-9_])["'\`]<命令名>["'\`]`（**引号定界的字面量**）。**不可用 `String.includes()`** —— 实测反例：`"auto_refine_session"` 含 `refine_session`、`"finish_photo_session"` 含 `finish_session` ⇒ 子串判定会把**死的判成活的**；反之 `"video_profile_memory.json"`（`app_setup.rs:97` 的**文件名串**）会把命令 `video_profile_memory` 判成活。计划者实测：同一份注册清单，`includes()` 口径得 **42** 条、字面量边界口径得 **47** 条 —— **差 5 条全在「补 UI」桶里**（见 §现状普查第三节）。
- **★ 解析 `app_commands.rs` 的正确姿势**：IPC 名 = **路径末段 ident**（`tauri-macros-2.6.3/src/command/handler.rs:46-58`）。两个坑：① `generate_handler![…]` 清单**内部**含 `#[cfg(target_os = "windows")]`，其 `]` 会截断朴素的非贪婪正则 `/generate_handler!\s*\[([\s\S]*?)\]/` ⇒ 实测只拿到 **148/334**，并把清单之后的普通函数调用误当条目；必须**方括号配平**（官方门禁 `scripts/check-command-registry.mjs:130-152` 就是这么做的）；② 用 `crate::([a-z_]+)::([a-z0-9_]+)` 这类**两段**正则会把三段路径的**中间段**当成命令名 —— 实测产出 `views ×3`（`crate::commands_goals::views::list_goals`）· `milestones ×7`（`crate::commands_goals::milestones::…`）· `workbench ×1`（`crate::commands_ai_refine::workbench::refine_workbench`）这些**假命令名**，从而把「死命令数」虚高 14 条。⇒ **一律照官方门禁的逐行解析口径**（按行 trim 后必须以 `,` 结尾、路径必须匹配 `^[A-Za-z_][A-Za-z0-9_]*(::[A-Za-z_][A-Za-z0-9_]*)*$`）。
- **★★ 同名不同函数：删除必须「按定义位置精确圈定」，禁止按名字全仓替换/批量删除**（控制方 2026-09-11 第三轮补充，本批最容易炸编译的一条）。实测两组同名碰撞：

  | 名字 | **要删的 Tauri 命令** | **仍然活的同名函数**（不同作用域） | 活函数的调用者 |
  |---|---|---|---|
  | `recognize_image` | `commands.rs:236`（`#[tauri::command] pub async fn`，收 `State<'_, AppState>`） | `engine.rs:348 pub fn recognize_image(&self, image: RgbImage)` · `ocr.rs:109 pub fn recognize_image(&self, …)`（**引擎/OCR 的方法**） | `commands_device.rs:158 let _ = engine.recognize_image(…)` · `engine_worker.rs:232 match engine.recognize_image(…)` · `ocr.rs:102 self.recognize_image(…)` |
  | `transcribe_audio` | `commands.rs:218`（同上，收 `State`） | `import_transcribe.rs:16 pub fn transcribe_audio<F: Fn(&ImportProgress)>(…)`（**自由函数**） | `import.rs:169 crate::import_transcribe::transcribe_audio(…)` |

  两个方向都会错：**「grep 有命中 ⇒ 还活着」⇒ 漏删死命令**（违反规格 #18/#24）；**「删掉所有匹配」⇒ 炸掉 OCR 引擎与导入转写链路**（`cargo build` 红）。⇒ 硬纪律：
  1. **只删定义位置**：删 `#[tauri::command]` 属主的那个 `fn` + 它在 `app_commands.rs` 的注册行；**不得**按名字全仓替换/删除。
  2. **验收判据不是「grep 零命中」**，而是三者合取：**命令函数已消失** ∧ `cargo build` 绿（exit 0、warning 不增）∧ `cargo test --test app_lib_tests` 绿（2359 基线，删命令后**只减不增**且无新失败）。
  3. **区分调用者看接收者前缀/路径**：`engine.` / `self.` / `crate::import_transcribe::` 都指向活函数；**Tauri 命令只能被前端 `invoke("…")` 调用**（该侧实测零命中）。
  4. **签名比对是第二把尺**：命令多为 `pub async fn`/`pub fn` 且收 `State<'_, AppState>` 等注入参数，同名活函数多收 `&self` / 泛型 `F` / 图像类型 ⇒ 签名不同即可区分。
  5. **此纪律适用于全清单每一条**：删前分别证明三类归属 —— **①命令本身 · ②同名活函数（若有） · ③注释里提到的名字**（注释命中不算引用，但必须人工判一次并写进报告）。
- **每个任务结束必须全绿**（不可跳步，不可"稍后一起跑"）：
  - `cd app && npx tsc --noEmit` → 0 错
  - `cd app && npx vitest run` → **基线见 Task 1 Step 1 的冻结值**；本批**只有 Task 9 允许下降 1 条**（删 `aiPlaceholderClass` 的那条断言），其余任务**必须完全持平**
  - `cd app/src-tauri && cargo build` → **不新增任何 warning**（与 Task 1 Step 1 的 `clippy-before.txt` 逐类比对）
  - `cd app/src-tauri && cargo test --test app_lib_tests` → **2359 passed / 0 failed / 6 ignored**（唯一入口；`[lib] test = false` ⇒ **没有 `cargo test --lib`**）。⚠️ **只有 Task 5 允许下降 16 条**（→ 2343〔**该数字已作废，见紧随其后的更正**〕），其余任务持平。**2026-09-12 更正**：实际链为 **2359 → 2334**（Task 3，−25，控制方扩大删除面所致）**→ 2308**（Task 4+5 合并为一次提交，−26 = T5 本体的 9+7 ＋ `ai_protocol.rs` 的 `AiEnhance*` 半边 10）；「逐任务写死允许降多少」这条纪律不变。
  - 仓库根 `node scripts/line-limits.mjs --full` · `node scripts/docs-check.mjs` · `node scripts/check-command-registry.mjs` → 全 exit 0
- **⚠️ 判退出码的固定口径（PS 5.1）**：`cargo` 往 stderr 写 warning 时，`2>&1 | …` 会被 PS 5.1 包成 `NativeCommandError`，让**成功的命令报 exit 1**（`docs/versions/v0.22.md:121-126` 实测）。⇒ 原生命令一律 `2>file` 重定向或直接读 `$LASTEXITCODE`，**不要用 `2>&1 |`**。
- **⚠️ `ffmpeg::tests::run_captured_handles_large_output` 是装载敏感偶发失败**（内含 10s 墙钟超时；同时跑 `cargo build` + `vitest` 时会被拖超时）。实测本会话就撞过一次（`2358 passed; 1 failed`）⇒ 判定门禁时**串行执行**，或单独复跑该用例再下结论（`docs/versions/v0.22.md:133` 已登记）。
- **★ 文本扫描型守卫会被注释/测试名里的字面量误伤**（批 0-D Task 10 实测）：本批涉及 `app/src/ui/icons/no-inline-svg.test.ts`（整文件文本扫描）与 `app/src/ui/primitives/*.test.ts` 的类名守卫。**若某个测试必须提到被删命令名/被删字符串，用拼接写法**（`"transcribe_" + "audio"`）**或改述**，**绝不为了绕开守卫去改守卫本身**。
- **报告与临时文件**：报告写 `.superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions/task-<N>-report.md`，评审写同目录 `task-<N>-review.md`；**该目录已被 `.superpowers/sdd/.gitignore`（内容为 `*`）整体忽略** ⇒ **永不 `git add -f`**。探针/日志/基线一律写 `.superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions/tmp/`，**不许放仓库根**。
- **提交纪律**：`git commit --only -m "<msg>" -- <显式路径…>`（本仓**多 agent 并行**，裸 `git commit` 会扫走别人已暂存的条目**包括 `D` 删除条目**）。禁止 `git add -A` / `git add .` / `git stash` / `git checkout -- <file>` / `git clean`（任何形式）/ `--no-verify`。提交信息 Conventional Commits：`<type>(<scope>): <subject>`，subject ≤50 字、动词开头、无句号。**删除文件用 `git rm <路径>` 单独暂存**，并在 `git diff --cached --stat --diff-filter=D` 里复核删除清单。
- **★ 可验证主张必须带 `git log -S`**：本批两条「首次」主张的工具化证据见 Task 1 Step 1 与 Task 10 Step 1 —— 不得写成无证据的形容词。
- **★ 提交树上判门禁**：判「某个提交是否自洽」必须导出该提交的树再跑（`git -c core.autocrlf=false archive -o t.tar <commit>` → `tar -xf` → 在该树内跑它自带的脚本），**不要**拿工作树当时的绿当提交事实（`DISPATCH-TEMPLATE.md` §三末条）。

## 本批执行中的控制方裁决（2026-09-12 追加 —— 只加注记，不改写上文）

> 执行期间控制方作出的裁决与实测纪律**改变了本计划的部分条文与数字**。原文一律**保留不删**，改动处就地加注；本节只是**指针**，完整理由与读数见台账 `progress.md` §〇·9–§〇·14（该目录不入库）。

- **(a) §四·3 的 L211 已被推翻**：`ai_protocol.rs` 的 `AiEnhance*` 半边**不予保留**，已随 `fd9dd8f9` 删除（理由、规格先例与可逆性见 §四·3 表下注记）；受影响的测试数一并更正为 **2308**。
- **(b) §四·3「不删」清单已被实测证伪三次**：L210 由 Task 3 推翻（`artifact_templates` 家族实际整族删除）· L211 由 Task 4 推翻 · Task 2 复核行 **L445** 的「5 处调用点」实测只有 3 处 `recognize_image` + 1 处 `transcribe_audio`。⇒ **后续任务必须对每一条「不删」条目自己实测复核，不得直接采信本计划的判断。**　⛔ **2026-09-12 收口更新：证伪次数最终为 **五次**（+ Task 6 的 `vad_threshold_slot` 三符号、Task 7 的 `spec_from_kind`）——逐条清单与「按删除后可达性判断」的替代方法见「收口回写」节收口一。**
- **(c) 还原或重新施加源文件后必须 `touch` 再复验**：`Copy-Item` 保留源 mtime ⇒ cargo 判定产物最新（`Finished in 0.5–0.6s`），复验读到的是**陈旧缓存里的警告集**（曾读出 build 20 / clippy 35 的假读数，与哈希证据矛盾）。
- **(d) `git archive` 把当前工作目录当作 pathspec 过滤器**：在**未跟踪的子目录**里执行会产出 **10240 字节的空归档且 exit 0** ⇒ 基于该归档文件清单的残留扫描会**全报 0 命中（假绿）**。**一律在仓库根执行 + 绝对 `-o` 路径**（完整树约 14.6 MB，可作自检判据）。
- **(e) `dead_code` 不是完整的死代码清单**：它既不覆盖 **crate 根可达的 `pub` 项**，也不覆盖**被 serde derive 掩蔽、只在测试里构造的项**（Task 3 实测：20 个枚举变体零诊断地孤儿化）⇒ 警告普查之外**必须另做 `pub` 面可达性分析与 serde 面复核**。

---

## 收口回写（Task 11，2026-09-12 —— 批 1 终态 · 计划级冲突完整账 · 给批 2+ 的更正）

> 本节由**收口单元**写入。上文一律**保留不改**，本节只做**加注**与**归账**；完整读数、逐条理由与前后对照见台账 `.superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions/progress.md` §〇·9–§〇·20（该目录**不入库**，故关键结论在此**写全**，不留给读者去翻台账）。

### 收口一 · ★「不删」清单被实测**证伪五次**（第 5 次使计划自身不可达绿）

| # | 「不删」清单条目（§四·3 表内，按符号定位） | 证伪者 | 实测结果 |
|---|---|---|---|
| 1 | `artifact.rs` / `artifact_templates.rs` / `db_artifacts.rs`「refine 链路在用」（原文 L210） | Task 3 `6f90f7b1` | **整族删除**：`commands_artifacts.rs` + `artifact_templates{,_visual,_voice,_tests}.rs` + `narrative_detect{,_tests}.rs`（7 文件 / −1526 行 / −25 用例）。原文的「`build_artifact` 实测 25 处命中」**多为产物子系统内部自引用** ⇒ 删后 0 处。`artifact.rs` / `db_artifacts.rs` 本体确实仍活（`get_artifact` / `replace_artifact` 仍有活消费者）⇒ 该条**部分**成立 |
| 2 | `ai_protocol.rs` 的 `AiEnhance*` 半边「登记给批 8」（原文 L211） | Task 4 `fd9dd8f9` | 8 符号 + 10 条测试删除。保留它**必然** +8 条 `dead_code` ⇒ 与 Global Constraints「不新增任何 warning」冲突（表下注记已完整写明理由） |
| 3 | 「`engine.recognize_image(` / `self.recognize_image(` 的 **5 处调用点一个不少**」（Task 2 复核行，原文 L445） | Task 2 复核 | 实测 **4 处调用 + 3 处定义**（口径错位；活函数**一处未少**，非误删） |
| 4 | `vad_threshold_slot` 模块「`app_setup.rs:154` 建槽、`live_session.rs:71` / `live_session_loop.rs:61` 消费」（原文 L219） | Task 6 `bd85dc46` | 删 `vad_threshold_diag` 后，`VadThresholdView:43` + `VadThresholdSlot::{read,source_session_id}` 失去**唯一**生产消费者 ⇒ 3 符号 + 4 条专属内联测试删除（**写端 `publish` 保留**，`live_session_loop.rs:195` 一字未动） |
| 5 | `video_profile_spec::spec_from_kind()`「属**待接线**而非死代码，留待批 7 判定」（原文 L215 与「未做（登记）」表内同条 L1090） | Task 7 `86136294` | 其唯一生产消费者**就是被删命令体**（`commands_video.rs:360`）⇒ 保留必然 +4 条 `dead_code`，与**同一份** Global Constraints 冲突；已删（连同 `ocr_tags_to_domain` / `ProfileMemory::remember` / `ProfileKind::default_tier`，+15 处夹具改写） |

**⇒ 给批 2+ 的四条硬纪律（本批最重要的方法论交付）**：

1. **「这个模块看起来还有人用」不是保留依据。** 判断一块代码是否仍连着，唯一可靠的方法是**删除后的可达性分析**：从 `generate_handler!` 注册表 + `bin/` 入口反向走，看目标是否仍有活路径。**先删、再用编译器与门禁说话**，比先读代码猜可靠。
2. **命中数不是连通性。** `build_artifact` 的「25 处命中」里绝大多数是**同一子系统内部自引用**——只有内部互引的子系统，命中数恒 >0 却可以整族死（证伪 #1）。
3. **`dead_code` 清单的权威性是有条件的**：它只覆盖**私有**死符号，且**只要清单里有符号落在计划明令保留的文件里，它就不再是「可照单删除」的清单**，而是「计划不自洽」的证据（证伪 #2、#5）。
4. **任何「不删 / 保留 / 登记给后续批次」的条目，下游任务开工前必须自己实测复核一遍**，并把复核命令与输出写进报告；**不得**直接采信上游计划或规格的判断。

### 收口二 · 被证伪的「测试数预测」——逐任务改正（本批实删 **55** 条，计划原预测 **16** 条）

| 任务 | 计划预测 | 实测 | 差额来源（全部经控制方裁决） |
|---|---|---|---|
| T1 / T2 | Δ0 | **Δ0** | ✅ 成立（只删命令与死常量，无专属测试） |
| T3 | Δ0（原文「本族 0 测试」） | **−25（2359 → 2334）** | 计划外扩大删除面：整族 7 文件（`artifact_templates_tests` 17 + `narrative_detect_tests` 8） |
| T4+T5（合并单元） | −16（T5 本体 9+7） | **−26（2334 → 2308）** | 追加 `ai_protocol.rs` 的 `AiEnhance*` 半边 10 条 |
| T6 | Δ0（原文「本任务 0 测试；不许再降」） | **−4（2308 → 2304）** | 方案 B：3 个孤儿符号的 4 条专属访问器测试随删（见 Task 6 的 Verification 行注） |
| T7 | Δ0（原文「实测不引用这 4 条 ⇒ 不许降」） | **−4（2304 → 2300）** | B-full：4 个孤儿符号的 4 条专属测试随删（见 Task 7 的 Verification 行注） |
| T8 | Δ0 | **Δ0** | ✅ 成立 |
| T9（前端） | −1 | **−1（1125 → 1124）** | ✅ 成立 |

**⇒ 纪律**：「某任务删 0 条测试」是**预测**，不是判据。凡删除命令/符号的任务，**必须**在报告里给出「消失的测试名集合」与「新增 0」的对拍（本批每次都是这么做才抓到 −4/−25/−26 的真实来源）；**预测与实测不符时停下报告，由控制方裁决，不得改判据去迁就预测**。

### 收口三 · 「全仓 0 命中」这类判据在本仓**不可执行**（Task 8 Verification 行已就地改口径）

Task 8 的 Verification 原文要求「全仓 0 命中」。**按字面不可执行**：`docs/versions/v0.12.0.md:187` · `docs/versions/v0.12.3.md:40/85` 等**已发布版本的历史记录**合法地保留了 `open_capture_float` 这个名字——改写它们等于**伪造历史**（与 `CHANGELOG.md` 同一口径，本批 T1 D-2 已确立）。⇒ 口径统一为 **「live-code 面 0 命中」**：`app/src/**`（含测试）+ `app/src-tauri/src/**` + `capabilities/*.json` + `scripts/**` 为 0；`docs/versions/**` · `CHANGELOG.md` · `docs/archive/**` **豁免**（历史快照）。**同类判据在本批共出现 6 次假绿/假阴性**（`\b` 在全角 `）` 前不匹配 · `git archive` 空归档 · 解包树内 `git grep` 无 `.git` · `Get-Content` GBK 吞行 · 裸 `includes()` 子串碰撞 6 例 · 全树 grep 扫进 `.superpowers/**/tmp/` 解包副本）⇒ **任何「0 命中」结论必须写明仪器，并先证明该仪器能命中一个已知存在的串、且对无意义串报 0**。

### 收口四 · `app_commands.rs` 行数终值与预算对账

计划的 §五预算写「503 → **~478**」（**全批终值**），Task 7 落点实测 **479**、Task 8 落点实测 **478**（T7 删 4 条注册、T8 再删 1 条 ⇒ 479 − 1 = 478）⇒ **无矛盾**：`479` 是 T7 提交点的中间值，`478` 是批终值，豁免表登记值与 HEAD 实测**逐字相等**（478）。

### 收口五 · 本批终态读数（Task 11 收口时实测，2026-09-12；门禁全部串行、单跑）

| 门禁 | 终态 |
|---|---|
| `node scripts/check-command-registry.mjs` | exit 0 · **定义 312 / 注册 312 / 重复 0** |
| `node scripts/line-limits.mjs --full` | exit 0 · **`>600` 0 · 301–600 档 123 · 登记条目 123** |
| `node scripts/docs-check.mjs` | exit 0 |
| `cd app; npx tsc --noEmit` | exit 0（0 错） |
| `cd app; npx vitest run` | exit 0 · **124 文件 / 1124 用例** |
| `cd app/src-tauri; cargo build` | exit 0 · **0 条 `dead_code`**（1 条既有 multi-target 提示 + 1–3 行 build-script DLL 占用噪声，均为环境噪声） |
| `cd app/src-tauri; cargo clippy --all-targets` | exit 0 · **19 条，集合与开工基线 identical** |
| `cd app/src-tauri; cargo test --test app_lib_tests` | exit 0 · **2300 passed / 0 failed / 6 ignored** |

### 收口六 · 本批删除面总账

**registry 334 → 312（−22）** · **Rust 用例 2359 → 2300（−55）** · **前端 1125 → 1124（−1）** · **删文件 10 个**（`git diff --name-status --diff-filter=D e96ab63d HEAD`：`ai_judge.rs` · `ai_judge_tests.rs` · `ai_mock_tests.rs` · `artifact_templates.rs` · `artifact_templates_tests.rs` · `artifact_templates_visual.rs` · `artifact_templates_voice.rs` · `commands_artifacts.rs` · `narrative_detect.rs` · `narrative_detect_tests.rs`）· **301–600 档 125 → 123**（`commands_ai.rs` 回落 ≤300 整行移除 + `artifact_templates_tests.rs` 删文件）。
**注意 Task 11 Verification 的 `git log --diff-filter=D` 行原文期望「只含 4 个文件」已失效**——实际 **10 个**（T3 扩大面 +7、T4+5 再 +3），已在该行就地标注。


---

## 现状普查与 47 条处置总表（计划者独立复算，控制方数字并列）

> 复算时间点：`dev@bd8e61f0`，**收笔前在 `dev@52856ab6` 复测过一遍全部读数**（期间并行 agent 落了 3 个 `app/src/ui/primitives/**` 提交：`44de78d5` / `f1da12e5` / `52856ab6`；复测结论：注册面仍 **334/334/0** · `line-limits --full` 仍 **125 档 / 125 登记** · vitest 仍 **124 文件 / 1125 用例** · 受影响 Rust 文件行数（`commands.rs` 597 / `lib.rs` 577 / `app_commands.rs` 503 / `commands_ai.rs` 388）**全部未变**）。**所有数字都能用本节的命令原地复现**；规格若与本节冲突，**以代码为准**（见文末「规格漂移」节）。

### 一、基数与两条互相独立的读数

| 量 | 实测 | 复现命令（仓库根） |
|---|---|---|
| 注册条目（官方逐行口径） | **334** | `node scripts/check-command-registry.mjs` → `✅ 命令注册一致：定义 334 / 注册 334 / 重复 0` |
| 前端生产代码零引用的命令 | **47** | 见下方「复算脚本」；与规格 §9 的 47 条**逐条相同（0 漂移）** |
| Rust 非测试用例总数（含 ignored） | **2365**（2359 有效 + 6 ignored） | `cargo test --test app_lib_tests` |
| `app/src-tauri/src` 里由本批删除的测试 | **16**（**2026-09-12 更正：本批实际共删 51 条**） | `cargo test --test app_lib_tests ai_judge::` = 9 · `cargo test --test app_lib_tests ai_mock::` = 7 —— 另有 Task 3 连带 **−25**（控制方扩大删除面）与 `ai_protocol.rs` 的 `AiEnhance*` 半边 **−10** ⇒ `cargo test --test app_lib_tests` **2359 → 2334 → 2308** |
| 前端 vitest 基线 | **124 文件 / 1125 用例全绿**（`dev@52856ab6` 复测，exit 0） | `cd app && npx vitest run` |

**复算脚本（不要新建文件；用一段内联 node 或按上面的正则手写 PowerShell 均可，判据逐条对应本节的匹配式）**

```powershell
# 仓库根执行；输出 = 前端生产代码零引用的命令名清单（本计划实测 47 条）
node -e "const{readFileSync,readdirSync,statSync}=require('fs');const{join,extname}=require('path');const ROOT=process.cwd();const src=readFileSync(join(ROOT,'app/src-tauri/src/app_commands.rs'),'utf8');const m=/generate_handler\s*!\s*\[/.exec(src);let i=m.index+m[0].length,depth=1;while(i<src.length){const c=src[i];if(c==='[')depth++;else if(c===']'&&--depth===0)break;i++;}const body=src.slice(m.index+m[0].length,i);const names=body.split('\n').map(s=>s.trim()).filter(t=>t&&!/^#\[cfg\(.*\)\]$/.test(t)).filter(t=>t.endsWith(',')).map(t=>t.slice(0,-1).trim()).filter(p=>/^[A-Za-z_][A-Za-z0-9_]*(::[A-Za-z_][A-Za-z0-9_]*)*$/.test(p)).map(p=>p.split('::').pop());const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p];});const prod=walk(join(ROOT,'app/src')).filter(f=>/\.tsx?$/.test(f)&&!/\.(test|spec)\.tsx?$/.test(f)).map(f=>readFileSync(f,'utf8')).join('\n');const dead=names.filter(n=>!new RegExp('(?<![A-Za-z0-9_])[\"\\'\`]'+n+'[\"\\'\`]').test(prod));console.log(names.length,dead.length);console.log(dead.sort().join('\n'));"
```
> 期望头行：`334 47`。

### 二、控制方数字并列（**不静默取一个**）

| 口径 | 控制方 | 计划者 | 差异原因（已证） |
|---|---|---|---|
| 「前端生产代码零引用」命令数 | **45**（`tmp/probe-dead-commands.mjs`） | **47** | ① 控制方探针用 `includes()` 判活 ⇒ `refine_session`（被 `"auto_refine_session"` 包含）与 `finish_session`（被 `"finish_photo_session"` 包含）被误判为活；② 其 `crate::mod::name` 两段正则会产出 `views` / `milestones` / `workbench` 等**假命令名**（清单里三段路径的中间段），把死数虚高。计划者用**官方逐行解析 + 引号定界字面量**复算得 47。 |
| 与规格 §9 的 47 条是否一致 | — | **逐条一致，0 漂移** | 47 = 47，成员逐一相同（`ai_clear_key` … `update_knowledge_system`）。⇒ **规格 §9 的普查表本身没有漂移**；本批的删除清单唯一变化来自控制方对 `open_capture_float` 的**改判**（待核实 → 删）。 |
| 测试与 Rust 内部也零引用 | 33 | 见 §四逐条表 | 两者相差不多，差异同样来自匹配口径；**本批不据「更干净」做取舍**，只据规格的处置分类。 |

### 三、47 条处置总表（**控制方要求：45−21=24 的每一条都要有处置**）

下面把规格 §9 的 47 条**全部列出**，并给出**本批是否动手**与**归属批次**。「本批」= 本计划删除；其余一律**不动**。

| # | 命令 | 规格处置 | 本批动作 | 归属 / 理由（实测） |
|---|---|---|---|---|
| 1 | `ai_clear_key` | 删 | **Task 1 删** | 旧单 provider 密钥链；前端 0 引用 |
| 2 | `ai_enhance_mock` | 删 | **Task 4 删** | 补缝三连；宿主 ArtifactView 已下线（v0.11.5） |
| 3 | `ai_enhance_status` | 删 | **Task 4 删** | 返回常量，自包含零外溢 |
| 4 | `ai_goal_plan_estimate` | 补 UI · 登记不排期 | **不动** | 批 7 未排期（目标规划成本预估面板） |
| 5 | `ai_save_key` | 删 | **Task 1 删** | 旧单 provider；`API_KEY_MAX_CHARS` 随之成死常量 |
| 6 | `ai_test_connection` | 删 | **Task 1 删** | 旧单 provider（`ai_get_balance` 已覆盖同能力） |
| 7 | `artifact_to_note` | 删 | **Task 3 删**（整模块） | 产物视图 v0.11.5 已删 |
| 8 | `build_draft` | 删 | **Task 2 删** | 旧草稿链；`MAX_INPUT_ITEMS` 随之成死常量 |
| 9 | `build_session_artifact` | 删 | **Task 3 删**（整模块） | 产物视图 |
| 10 | `export_manual_fill_done` | 补 UI · 登记不排期 | **不动** | 批 7 未排期（周回顾手动回填） |
| 11 | `export_write_todotxt_file` | 补 UI · 登记不排期 | **不动** | 批 7 未排期（迁出 `.todo.txt`） |
| 12 | `get_note_group` | 删 | **Task 6 删** | 已被 `list_note_groups` 全量 + 前端 map 取代 |
| 13 | `get_session_artifact` | 删 | **Task 3 删**（整模块） | 产物视图 |
| 14 | `kb_search` | 补 UI（本批=批 7） | **不动** | 批 7：⌘K 的数据源（ADR-029 RAG 层） |
| 15 | `learning_metrics` | 补 UI · 登记不排期 | **不动** | 批 7 未排期 |
| 16 | `list_group_fragments` | 删 | **Task 6 删** | 被 `list_fragments` 全量 + 收件箱取代；**DB 层 `db.list_fragments_by_group` 保留**（实测仍被 `commands_flashcards.rs:69`、`commands_settlement.rs:145,190` 消费） |
| 17 | `quiz_group_cards` | 补 UI · 登记不排期 | **不动** | 批 7 未排期 |
| 18 | `recognize_image` | 删 | **Task 2 删** | 旧直调（**注意同名不同物**：`engine.rs:348` / `ocr.rs:109` 的同名方法**保留**） |
| 19 | `reset_tag_color` | 补 UI（本批=批 7） | **不动** | 批 7 标签线；与 `set_tag_color` **成对处理，不可只删 reset** |
| 20 | `save_draft_as_note` | 删 | **Task 2 删** | 旧草稿链（`concat.rs` / `NoteDraft` 类型**保留**，`concat.rs:27` 仍被用） |
| 21 | `scan_ai_candidates` | 删 | **Task 4 删** | 补缝三连；其唯一消费者删除后，`ai_judge` 整模块成死 ⇒ Task 5 |
| 22 | `session_outline` | 补 UI · 登记不排期 | **不动** | 批 7 未排期（与笔记大纲回归一起评估） |
| 23 | `structure_models_dir_cmd` | 删 | **Task 6 删** | 自述「前端展示用」但前端 0 引用；`structure_models_dir()` 私有 helper 仍被 `commands_refine.rs:90` 一带消费 |
| 24 | `transcribe_audio` | 删 | **Task 2 删** | 旧直调（**同名不同物**：`import_transcribe.rs:16` 的 `pub fn transcribe_audio` **保留**，被 `import.rs:169` 调用） |
| 25 | `update_note_tags` | 补 UI（本批=批 7） | **不动** | 批 7 标签可写；全仓现无写 `notes.tags` 的生产路径 |
| 26 | `vad_threshold_diag` | 删 | **Task 6 删** | 开发诊断用；`vad_threshold_slot` 模块**保留**（`app_setup.rs:154` / `live_session.rs:71` 仍在用） |
| 27 | `video_profile_by_kind` | 删 | **Task 7 删** | 前端已有等价 `profiles.find(...)`；`video_profile::profile_by_kind()` **保留**（`analysis.rs:95` / `import.rs:185` / `live_session.rs:249,274` 在用） |
| 28 | `video_profile_for_spec` | 留（本批接线） | **不动** | 档位通道读端 ⇒ 批 7 |
| 29 | `video_profile_memory` | 有意保留 | **不动** | 自述「诊断用」，零成本 |
| 30 | `video_profile_spec_by_kind` | 删 | **Task 7 删** | 前端已有 `KIND_TO_FORM` / `KIND_TO_TIER` 双写。⚠️ 连带面**只到 command 包装层**：`video_profile_spec::spec_from_kind()`（`video_profile_spec.rs:217`）**保留**（删掉本命令后它只剩自有 2 条测试引用 ⇒ **test-only 但保留**，理由见 Task 7「不删清单」） |
| 31 | `action_badge_count` | 有意保留 | **不动** | 文档明确「保留命令无前端调用方」 |
| 32 | `add_session_ocr_block` | 撤下 IPC，保留内部函数 | **不动** | 批 7（B 桶 3 条撤下 IPC） |
| 33 | `add_session_segment` | 撤下 IPC，保留内部函数 | **不动** | 批 7 |
| 34 | `analyze_session_command` | 补 UI（本批=批 7） | **不动** | 批 7 |
| 35 | `audit_due_for_system` | 补 UI · 登记不排期 | **不动** | 批 7 未排期 |
| 36 | `create_session` | 撤下 IPC，保留内部函数 | **不动** | 批 7；⚠️ 实测它在 Rust 侧有 **25 处调用形态命中**（含 `commands_session.rs` / `import.rs` / 多个 `db_*_tests.rs`）⇒ 撤 IPC 时**只删注册行**，函数原样留 |
| 37 | `delete_session_images_all` | 补 UI（本批=批 7） | **不动** | 批 7 |
| 38 | `detect_video_domain` | 删 | **Task 7 删** | 上游 OCR 标签通道从未建起来 |
| 39 | `finish_session` | 补 UI（本批=批 7） | **不动** | 批 7；`"finish_photo_session"` 子串是 `includes()` 口径的假活来源 |
| 40 | `get_decision` | 补 UI（本批=批 7） | **不动** | 批 7 |
| 41 | `open_capture_float` | ~~待核实~~ → **改判：删** | **Task 8 删** | 控制方 2026-09-11 结清：FE 0 引用；活路径是 `float_toggle`（`useClassroomFloat.ts:38`）+ `close_capture_float`；本命令只是又包一层 `float_open_core(&app)` |
| 42 | `refine_session` | 补 UI（本批=批 7） | **不动** | 批 7 |
| 43 | `release_live_prepare` | 有意保留 | **不动** | 前端注释「保留供未来显式调用」 |
| 44 | `remember_video_profile` | 删 | **Task 7 删** | 功能被 `remember_video_profile_form` 完整覆盖（**注意**：`remember_video_profile_form` / `_domain` 是**活命令，保留**） |
| 45 | `set_tag_color` | 补 UI（本批=批 7） | **不动** | 批 7 标签线 |
| 46 | `update_fragment_group` | 补 UI（本批=批 7） | **不动** | 批 7；REQ-201 记录需同步修正（批 7 一起做） |
| 47 | `update_knowledge_system` | 补 UI（本批=批 7） | **不动** | 批 7（体系改名/核心问题/状态） |

**汇总**：本批**删 22** · 批 7 补 UI **11** + 留（本批接线）**1** · 登记不排期 **7** · 撤下 IPC（批 7）**3** · 有意保留 **3** · 待核实 **0** ＝ **47**。

### 四、删除清单（`文件:行` 全部为本次实测）

#### 四·1 规格权威 **21 条**逐条对账表（控制方从规格表抽取，实测恰 21 行，自洽）

> 评审可**机械核对**：本表 21 行的 `#号 / 命令名 / 定义处 / 注册行 / 计划动作` 五列必须与规格 §9 的 21 个 `**删**` 行一一对应。**「同名活函数」列是本批的炸编译风险栏** —— 非空者禁止按名字删除（见 Global Constraints 的同名碰撞纪律）。

| 规格 # | 命令 | 定义处（`#[tauri::command]` 属主的 `fn`） | 注册行（`app/src-tauri/src/app_commands.rs`） | 计划动作 | ⚠️ 同名活函数（**禁删**） |
|---|---|---|---|---|---|
| #1 | `ai_clear_key` | `commands_ai_settings.rs:110`（doc `:108-109`） | `:371` | T1 删 | — |
| #2 | `ai_enhance_mock` | `commands_ai.rs:46`（doc `:39-45`） | `:362` | T4 删（+ `simple_hash`） | — |
| #3 | `ai_enhance_status` | `commands_ai.rs:105`（doc `:103-104`） | `:363` | T4 删（+ `AiEnhanceStatus`） | — |
| #5 | `ai_save_key` | `commands_ai_settings.rs:97`（doc `:95-96`） | `:370` | T1 删（+ `API_KEY_MAX_CHARS`） | — |
| #6 | `ai_test_connection` | `commands_ai_settings.rs:255`（doc `:250-254`） | `:379` | T1 删 | — |
| #7 | `artifact_to_note` | `commands_artifacts.rs:70`（doc `:65-69`） | `:359` | T3 删（整模块） | — |
| #8 | `build_draft` | `commands.rs:254`（doc `:252-253`） | `:55` | T2 删（+ `MAX_INPUT_ITEMS`） | — |
| #9 | `build_session_artifact` | `commands_artifacts.rs:20`（doc `:18`） | `:357` | T3 删（整模块） | — |
| #12 | `get_note_group` | `commands_groups.rs:53`（doc `:51`） | `:82` | T6 删 | — |
| #13 | `get_session_artifact` | `commands_artifacts.rs:55`（doc `:53`） | `:358` | T3 删（整模块） | — |
| #16 | `list_group_fragments` | `commands_fragments.rs:135`（doc `:133`） | `:102` | T6 删 | — |
| #18 | `recognize_image` | **`commands.rs:236`**（doc `:234-235`） | `:54` | T2 删 | **`engine.rs:348`** · **`ocr.rs:109`**（方法）⇒ 禁删 |
| #20 | `save_draft_as_note` | `commands.rs:270`（doc `:268-269`） | `:56` | T2 删 | — |
| #21 | `scan_ai_candidates` | `commands_ai.rs:30`（doc `:28`） | `:361` | T4 删（连带 `ai_judge` 模块 ⇒ T5） | — |
| #23 | `structure_models_dir_cmd` | `commands_refine.rs:100`（doc `:98`） | `:441` | T6 删 | `structure_models_dir()`（私有 helper，仍被 `:90` 一带消费）⇒ 保留 |
| #24 | `transcribe_audio` | **`commands.rs:218`**（doc `:216-217`） | `:53` | T2 删 | **`import_transcribe.rs:16`**（自由函数，被 `import.rs:169` 调用）⇒ 禁删 |
| #26 | `vad_threshold_diag` | `commands_diag.rs:121`（doc `:114-120`） | `:326`（注释 `:325` 同删） | T6 删 | `vad_threshold_slot` 模块（`app_setup.rs:154` / `live_session.rs:71` 在用）⇒ 保留 |
| #27 | `video_profile_by_kind` | `commands_video.rs:330`（doc `:328`） | `:288` | T7 删 | `video_profile::profile_by_kind()`（6 处非测试消费）⇒ 保留 |
| #30 | `video_profile_spec_by_kind` | `commands_video.rs:358`（doc `:356`） | `:291` | T7 删 | `video_profile_spec::spec_from_kind()`（旧档案映射读端）⇒ 保留（登记批 7） |
| #38 | `detect_video_domain` | `commands_video.rs:140`（doc `:131-138`） | `:294` | T7 删 | — |
| #44 | `remember_video_profile` | `commands_video.rs:292`（doc `:287-290`） | `:286` | T7 删 | `remember_video_profile_form`（`:369`，**活命令**）· `remember_video_profile_domain`（`:230`，**活命令**）⇒ 禁删 |

#### 四·2 第 **22** 条（规格 #41，控制方 2026-09-11 改判「待核实」→「删」）

| 规格 # | 命令 | 定义处 | 注册行 | 计划动作 | 备注 |
|---|---|---|---|---|---|
| #41 | `open_capture_float` | `commands_window.rs:268`（doc `:260-266`） | `:300`（注释 `:299` 改写） | **T8 删** | 前端 0 调用者；开路径由 `float_toggle`（`useClassroomFloat.ts:38`）与 `FloatAction::Open => float_open_core`（`commands_window.rs:250`）承载 ⇒ 本命令只是同义包装层。**规格四处文案同 Task 8 回写** |

⇒ 本批删除 = **21（规格权威）+ 1（控制方改判）＝ 22**；`check-command-registry` 计数 **334 → 312**。

#### 四·3 连带删除（模块级死代码，本批一并处理）

| 符号 / 文件 | 为何成死 | 任务 |
|---|---|---|
| `ai_judge.rs`（158 行，整模块） | 其唯一生产消费者是 `scan_ai_candidates`（`commands_ai.rs:16` 的 `use`）；删后仅剩自身 `ai_judge_tests.rs` 引用 ⇒ **模块级死代码**（规格 §9 L505 明写的「唯一例外」） | T5 |
| `ai_judge_tests.rs`（139 行 / **9 条测试**） | 随模块删 | T5 |
| `mod ai_judge;`（`lib.rs:8`） | 模块删则声明删 | T5 |
| `AiMockAdapter::enhance`（`ai_mock.rs:24-89`，66 行） | 其唯一生产消费者是 `ai_enhance_mock`；`AiMockAdapter` 本身**保留**（`refine` / `review_text` / `enrich` 仍被 refine 链路与文本复核消费） | T5 |
| `ai_mock_tests.rs`（87 行 / **7 条测试**） | 7 条**全部**在测 `enhance`（逐行核对过）⇒ 随 `enhance` 删 | T5 |
| `commands_artifacts.rs`（163 行，整模块） | 三条命令全删；`render_artifact_markdown` / `render_block` 实测**无其他消费者** | T3 |
| `mod commands_artifacts;`（`lib.rs:177`） | 模块删则声明删 | T3 |
| `simple_hash()`（`commands_ai.rs:96-101`） | 仅 `ai_enhance_mock` 调用（实测 2 处命中：定义 + 调用） | T4 |
| `AiEnhanceStatus`（`commands_ai.rs:116-120` 结构体 + `:113` doc） | 仅 `ai_enhance_status` 使用（实测 3 处命中全在本文件） | T4 |
| `API_KEY_MAX_CHARS`（`commands_ai_settings.rs:20` + 其 doc） | 仅 `ai_save_key` 使用（实测 3 处命中全在本文件） | T1 |
| `MAX_INPUT_ITEMS`（`commands.rs:32-33`） | 仅 `build_draft` 使用（实测 3 处命中全在本文件） | T2 |

**★ 明确「不删」清单（防过度删除——控制方两轮都点名这件事）**

| 符号 | 为何留 |
|---|---|
| `video_profile_spec::spec_from_kind()` | 删掉 `video_profile_spec_by_kind` 后只剩自有 2 条测试引用；它是**档位通道的旧档案映射读端**，而批 7 要「档位通道做完整」（规格 §1 #34）⇒ 属**待接线**而非死代码，留待批 7 判定 |
| `video_profile::profile_by_kind()` | 6 处非测试消费者（`analysis.rs:95` / `import.rs:185` / `live_session.rs:249,274` / `live_session_worker_state.rs:158`） |
| `import_transcribe::transcribe_audio()` / `engine`&`ocr` 的 `recognize_image()` | **同名不同物**；前者被 `import.rs:169` 调用，后者是引擎层原语（`commands_device.rs:158` / `engine_worker.rs:232` 等在用） |
| `concat.rs` / `NoteDraft` / `NewNote` | `concat::build_note_draft` 仍被 `commands.rs:343` 的 `process_to_note` 调用 |
| `vad_threshold_slot` 模块 | `app_setup.rs:154` 建槽、`live_session.rs:71` / `live_session_loop.rs:61` 消费 |
| `artifact.rs` / `artifact_templates.rs` / `db_artifacts.rs` | `refine.rs:86` / `db_artifacts.rs` 等 refine 链路在用（`build_artifact` 实测 25 处命中、`replace_artifact` / `get_artifact` 各有非本模块消费者） |
| `ai_protocol.rs` 的 `AiEnhance*` 半边 | `ai_protocol.rs` **与活的 REQ-085 文本复核共用**（`TextFilterRequest/Response/Decision/Action` 被 `ai_text_filter.rs:18`、`note_filter_ai.rs:13`、`commands_session_note.rs:18`、`commands_ai.rs` 消费）⇒ **不为删半边而切一个共用的 17 条测试的协议文件**；登记给批 8（见「未做（登记）」）　⛔ **2026-09-12 控制方裁决：本行已被推翻——该半边已随 `fd9dd8f9` 删除，理由与先例见本表下方注记** |
| `structuredBlocks.ts` 的其余 3 个导出与整模块 | 控制方 2026-09-11 裁决：**整模块存废不归批 1**；`lowConfidenceClass` 是规格 §4.1 `--due` 行点名的「低置信点线」消费场景 ⇒ 属**有意要的功能**，二选一（接线 / 删除）登记给**批 7** |
| `App.css:119` 的 `.ed-low-confidence` 记述 | 该文件**已于批 0-D Task 13 删除**（实测工作树无 `app/src/App.css`）；只在 Task 9 报告里记录闭环关系，不产生改动 |

> ⛔ **控制方注记（2026-09-12 收口）：上表在批 1 执行中被实测证伪 **五次**（本表 4 条：`artifact_templates` 族 / `AiEnhance*` 半边 / `vad_threshold_slot` 三符号 / `spec_from_kind`；另加 Task 2 复核行的调用点计数）** —— 逐条清单、证伪者、落地读数与「**按删除后的可达性判断，而不是按『看起来还有人用』判断**」这条替代方法，见「收口回写」节**收口一**。⇒ **本表不得被批 2+ 当作保留依据直接引用**；每一条都要自己实测复核并把命令与输出写进报告。

> ⛔ **控制方注记（2026-09-12，批 1 执行中；上文一字未删，仅加注）**：上表 `ai_protocol.rs` 的 `AiEnhance*` 半边一行**已被推翻**。
> ① **理由**：删掉补缝三连（`scan_ai_candidates` / `ai_enhance_mock` / `ai_enhance_status`）后，该半边的 7 个类型（`AiEnhanceRequest` / `AiRequestType` / `AiSourceRef` / `AiContext` / `AiEnhanceResponse` / `AiResponseContent` / `AiNode`）＋ `AiEnhanceResponse::validate` 共 **8 个符号已无任何生产消费者**（实测活代码只消费 `TextFilter{Request,Response,Decision,Action}` 四类型，对其 **0 依赖**），保留即必然新增 **8 条 `dead_code` 警告** ⇒ **与本计划自己的 Global Constraints（每个任务必须全绿 · 不新增任何 warning）冲突，即计划与其自身约束不自洽，批 1 收口门禁不可达绿** ⇒ **以 Global Constraints 为准**。
> ② **规格先例**：`vad_threshold_diag` 判删的原文理由是「开发诊断用；未来若需要，届时按诊断需求重新引入，**不留半成品**」——`AiEnhance*` 半边正是「唯一生产消费者已被删的半成品脚手架」，处境完全同构。
> ③ **可逆**：git 历史完整保留，`git show fd9dd8f9^:app/src-tauri/src/ai_protocol.rs` 可取回（与 `ASR_REQUEST_TIMEOUT` 同一口径）。
> ④ **落地读数**（`fd9dd8f9`）：`ai_protocol.rs` 251 → **104** 行 · `ai_protocol_tests.rs` 17 → **7** 条（`TextFilter` 四类型与其 7 条测试**逐字节未改**）· registry 321/321/0 · `cargo test` **2308 / 0 / 6**。详见台账 **§〇·13**（裁决）与 **§〇·14**（落地）。

### 五、行数落点预算（**实测为准**；预算值用于交叉核对，差 >5 行必须查原因）

| 文件 | 现（`countLines()`） | 任务后预算 | 登记动作 |
|---|---|---|---|
| `app/src-tauri/src/commands_ai_settings.rs` | 349 | ~315 | 更新数值（301–600） |
| `app/src-tauri/src/commands.rs` | 597 | ~523 | 更新数值 |
| `app/src-tauri/src/commands_artifacts.rs` | 163 | **0（删文件）** | 不在登记表 |
| `app/src-tauri/src/commands_ai.rs` | 388 | ~291 | **整行删除**（回落到 ≤300） |
| `app/src-tauri/src/ai_judge.rs` | 158 | **0（删文件）** | 不在登记表 |
| `app/src-tauri/src/ai_judge_tests.rs` | 139 | **0（删文件）** | 不在登记表 |
| `app/src-tauri/src/ai_mock.rs` | 229 | ~157 | 不在登记表 |
| `app/src-tauri/src/ai_mock_tests.rs` | 87 | **0（删文件）** | 不在登记表 |
| `app/src-tauri/src/commands_groups.rs` | 285 | ~272 | 不在登记表（仍 ≤300） |
| `app/src-tauri/src/commands_fragments.rs` | 374 | ~365 | 更新数值 |
| `app/src-tauri/src/commands_refine.rs` | 179 | ~173 | 不在登记表 |
| `app/src-tauri/src/commands_diag.rs` | 144 | ~121 | 不在登记表 |
| `app/src-tauri/src/commands_video.rs` | 399 | ~311 | 更新数值 |
| `app/src-tauri/src/commands_window.rs` | 369 | ~357 | 更新数值 |
| `app/src-tauri/src/app_setup.rs` | 420 | **420（只改注释文字，行数不变）** | 数值不变（属 (e) 守卫的正向用例） |
| `app/src-tauri/src/app_commands.rs` | 503 | ~478 | 更新数值（**批终值**：Task 7 落点 479、Task 8 再删 1 条注册 ⇒ 478；收口实测与登记值逐字相等，见「收口回写」节收口四） |
| `app/src-tauri/src/lib.rs` | 577 | ~575 | 更新数值 |
| `app/src/components/structuredBlocks.ts` | 64 | ~60 | 不在登记表 |
| `app/src/components/structuredBlocks.test.ts` | 94 | ~91 | 不在登记表 |
| `docs/adr/ADR-010-gap-filling-ai.md` | 93 | ~135（+退役节） | 不在 `SCAN_DIRS`（只扫 `app/src` + `app/src-tauri/src`） |
| `docs/standards/line-limit-exemptions.md` | 生成物 | 由 `--write` 刷新 | 每个 Rust 删除任务同提交刷新 |

### 每个删除任务的统一作业模式（Task 1–8 共用，逐条照做）

> ⚠️ **本批与 0-C2/0-C3 的关键差别**：那两批是**纯搬运**（等价性靠机械对拍）；本批是**删除**，等价性不再是判据。验收转为：**注册面计数按预期下降 + 三向引用复核为空 + 用例数只按被删测试数下降 + 行数门禁绿 + 文档同提交**。

1. **先复核（三向引用）**：对任务内的每条命令，跑三条 grep，**把输出贴进报告**：
   ```powershell
   # ① 前端生产代码（应 0 命中）
   Select-String -Path (Get-ChildItem app\src -Recurse -Include *.ts,*.tsx -File ^| Where-Object { $_.FullName -notmatch '\.(test|spec)\.tsx?$' }).FullName -Pattern '"<命令名>"' -SimpleMatch
   # ② 前端测试（应 0 命中；非 0 ⇒ 测试也要删，别只删命令）
   Select-String -Path (Get-ChildItem app\src -Recurse -Include *.test.ts,*.test.tsx,*.spec.ts,*.spec.tsx -File).FullName -Pattern '"<命令名>"' -SimpleMatch
   # ③ Rust 侧除定义/注册处的调用形态（应只剩 `<模块文件>:<定义行>` 与 `app_commands.rs:<注册行>`；注释命中要人工判一次）
   Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\b<命令名>\s*\('
   ```
   ⚠️ PowerShell 5.1 的 `Select-String -Path` 不接受管道表达式，上面的 `(... ^| Where-Object …)` 只是伪写法 —— 实际请**先 `$files = Get-ChildItem … | Where-Object … | ForEach-Object FullName`，再 `Select-String -Path $files -Pattern …`**。
2. **★ 同名三域归属（每条命令都做，不是只做 `recognize_image` / `transcribe_audio`）**：把该名字的全部 Rust 命中分成三类并**逐条写出归属** —— **①要删的命令**（`#[tauri::command]` 属主 + 收 `State<'_, AppState>` 等注入参数）· **②同名活函数/方法**（`&self` 接收者 · 泛型 `F` · 一般自由函数 · 引擎/OCR/导入链路）· **③注释里提到的名字**（不算引用，人工判一次）。**按定义位置精确圈定删除面**，禁止按名字全仓替换；每条命令的归属结论写进报告（评审者的必查项）。
3. **删函数**：删 `#[tauri::command]` 属性行 + 整个 `fn` + 其上方的 `///` 文档注释（含 `@ai-context:` 段）。**不要**顺手改函数体逻辑、不要顺手改其他命令、不要动同名的**不同物**（见「不删清单」）。
4. **删/改模块文档**：文件头 `//!` 里点名该命令的句子要么删、要么改写（否则文档说谎）。
5. **删连带死代码**：按 §四·3 的连带表逐条删；**每删一个 helper，再跑一次第 1 步的 ③**（helper 的引用面可能与命令不同）。
6. **删注册行**：在 `app_commands.rs` 删对应条目行；**若其上方的 `//` 注释只覆盖被删条目 ⇒ 注释同删；若注释还覆盖保留条目 ⇒ 改写注释使陈述为真**（本批 3 处需改写：`:289` 的「旧档案映射」、`:293` 的「领域标签检测 + 」、`:299` 的「打开/关闭」）。
7. **刷新行数登记表**：
   ```powershell
   node scripts/line-limits.mjs --full      # 期望 exit 1，且只报本任务改过的文件 (e) 行数不一致（这是"删除生效"的正向证据）
   node scripts/line-limits.mjs --write     # 重生成；会顺带把回落到 ≤300 的文件整行移除（check (d) 要求）
   node scripts/line-limits.mjs --full      # 期望 exit 0
   git diff --stat -- docs/standards/line-limit-exemptions.md
   ```
8. **门禁（全绿才提交）**：`cd app; npx tsc --noEmit; npx vitest run` → `cd src-tauri; cargo build 2>$tmp\build.txt; cargo test --test app_lib_tests 2>$tmp\rusttest.txt` → 仓库根三件套（`line-limits --full` / `docs-check` / `check-command-registry`）。**串行跑**（避免 §Global Constraints 的 ffmpeg 偶发超时）。
9. **提交**：`git add <本任务显式路径…>`（含 `docs/standards/line-limit-exemptions.md`）→ `git diff --cached --stat` 复核 → `git commit --only -m "<type>(rust): …" -- <同一条路径清单>`。删除的文件用 `git rm` 先暂存。
10. **报告**：`.../tmp/` 放原始输出；`.../task-<N>-report.md` 必含：三向引用命令与输出 · **同名三域归属结论（逐条）** · 逐条删除的 `文件:行` · **注册计数前后**（`定义 X / 注册 X / 重复 0`）· **用例数前后** · 豁免表 diff（含任何非本批文件行）· `@ai-context` 与注释改写清单 · **你没能验证的地方**（诚实单列）。

### 派发顺序与并行纪律

| Task | 内容 | 依赖 | 可否并行 |
|---|---|---|---|
| 1 | 基线冻结 + `commands_ai_settings` 三连 | — | **先做且不并行**（冻结 it 基线；此后各任务与它比） |
| 2 | `commands.rs` 旧直调四连 | T1 | ❌ 与 T3–T8 串行 |
| 3 | `commands_artifacts` 整模块 | T2 | 同上 |
| 4 | `commands_ai.rs` 补缝三连 | T3 | 同上 |
| 5 | 补缝连带模块（`ai_judge` + `enhance`，−16 用例） | T4 | 同上（**必须紧跟 T4**：T4 之后才成死代码）　⛔ **2026-09-12 实况：与 T4 合并为一次提交（`fd9dd8f9`），并连带 `ai_protocol.rs` 的 `AiEnhance*` 半边 ⇒ 实际 −26 用例、落地 2308**。**T3 的删除面亦经控制方扩大 ⇒ T3 实测 −25** |
| 6 | 四单体（groups / fragments / refine / diag） | T5 | 同上 |
| 7 | `commands_video` 四连 | T6 | 同上 |
| 8 | `open_capture_float` 改判删除 | T7 | 同上 |
| 9 | `structuredBlocks.ts` 死文案（前端） | — | ✅ 可与 T1–T8 任意并行（不共享文件；但会改前端用例数 ⇒ 从 T1 冻结值 **−1**） |
| 10 | ADR-010 退役 + 索引/交叉引用/需求池 | — | ✅ 可与 T1–T9 任意并行（只碰 docs） |
| 11 | 收口（豁免表终态 · 规格进度 · v0.22 交付记录 · 全门禁 · 后续登记） | 全部 | ❌ 最后 |

> **T1–T8 为何必须串行**：每个任务都要改**同一份** `app/src-tauri/src/app_commands.rs`（唯一注册点）**和同一份** `docs/standards/line-limit-exemptions.md`（生成物）。并行会造成 `git add`/`git commit` 交错污染与登记表数值互相覆盖（`DISPATCH-TEMPLATE.md` §三已列 0-C 期 10 次实测事故）。**T9 / T10 与它们不共享任何文件，可安全并行**；同一时刻**最多一个实施者动 `app_commands.rs` 与登记表**。

---

### Task 1: 基线冻结 + `commands_ai_settings` 三连删除

**Files:**
- Modify: `app/src-tauri/src/commands_ai_settings.rs`（删 3 命令 + 1 死常量）
- Modify: `app/src-tauri/src/app_commands.rs`（删注册 `:370` / `:371` / `:379`）
- Modify: `docs/standards/line-limit-exemptions.md`（`--write` 生成）
- Create（**不入库**）: `.superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions/tmp/{census-before.txt,clippy-before.txt,vitest-before.txt,rusttest-before.txt}`

**Why:** 本任务承担两件事：① **冻结本批全部基线**（并行 agent 正在改 `app/src/ui/primitives/**`，前端用例数随时漂移 ⇒ 不冻结就无法判「只许下降 N 条」）；② 删掉 `ai_settings` 域里旧单 provider 的三条命令——它们自 v0.11.6（BYOK 多端点）起就被 `commands_ai_providers.rs` 取代，前端 0 引用。

**Interfaces:**
- Consumes: 无
- Produces（T2–T11 依赖的冻结值，写进 `tmp/baseline.md` 并在任务报告里复述）:
  - `REGISTRY_BEFORE = 334`（定义/注册/重复 = 334/334/0）
  - `RUST_BEFORE = 2359 passed / 0 failed / 6 ignored`
  - `VITEST_BEFORE = <实测 文件数 / 用例数>`
  - `CLIPPY_BEFORE = <warning 行数>`（`cargo clippy --all-targets --message-format short` 的 `warning:` 计数）
  - 两条「首次」主张的 `git log -S` 证据（见 Step 3）

- [ ] **Step 1: 冻结四条基线（原始输出落 `tmp/`）**

```powershell
$S = ".superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions"
New-Item -ItemType Directory -Force -Path "$S/tmp" | Out-Null
# ① 注册面
node scripts/check-command-registry.mjs *> "$S/tmp/registry-before.txt"      # 期望 ✅ 定义 334 / 注册 334 / 重复 0
# ② Rust 用例（唯一入口；2>file 不要 2>&1 |）
Push-Location app/src-tauri; cargo test --test app_lib_tests 2> "../../$S/tmp/rusttest-before.txt" | Out-Null; "rust exit=$LASTEXITCODE"
cargo clippy --all-targets --message-format short 2> "../../$S/tmp/clippy-before.txt" | Out-Null; "clippy exit=$LASTEXITCODE"
Pop-Location
# ③ 前端用例（含并行 agent 的在飞内容——如实记录，不作"干净基线"宣称）
Push-Location app; npx vitest run *> "../$S/tmp/vitest-before.txt"; "vitest exit=$LASTEXITCODE"; Pop-Location
# ④ 冻结值
Select-String -Path "$S/tmp/rusttest-before.txt" -Pattern "test result:"
Select-String -Path "$S/tmp/vitest-before.txt"   -Pattern "Test Files|Tests "
(Select-String -Path "$S/tmp/clippy-before.txt" -Pattern "^warning:").Count
```
期望：`定义 334 / 注册 334 / 重复 0`；`test result: ok. 2359 passed; 0 failed; 6 ignored`；`Test Files 124 passed (124)` / `Tests 1125 passed (1125)`；clippy warning 计数记为 `CLIPPY_BEFORE`（本仓**预存** clippy warning，判据是**不增**，不是零）。
⚠️ 若 `rusttest-before.txt` 出现 `ffmpeg::tests::run_captured_handles_large_output` 失败：**单独复跑该用例**（`cargo test --test app_lib_tests run_captured_handles_large_output`）确认是装载敏感偶发，再重新冻结；两次结果都写进报告。

- [ ] **Step 2: 复算 47 条普查（与计划 §现状普查逐条对照）**

用 §现状普查第一节给出的内联 node 脚本跑一次，期望头行 `334 47`，并把 47 行输出存 `tmp/census-before.txt`。**与计划清单逐条 diff**：若有差异，先查是不是并行任务改了前端代码，把差异写进报告。

- [ ] **Step 3: 两条「首次」主张的工具化证据（可验证主张，不是形容词）**

```powershell
# 主张 A：本仓从未从 IPC 面删除过命令（app_commands.rs 之前从未有注册条目被删）
git log --diff-filter=D --oneline -- app/src-tauri/src            # 期望仅 2 条，且都是文件级重构（c5c04480 / c37bf7fe），无命令注册条目
git log -S "crate::commands::transcribe_audio" -- app/src-tauri/src/app_commands.rs   # 期望仅 c409a956（搬入提交）⇒ 从未被删过
# 主张 B：ADR-010 自创建起从未被实质修订
git log --oneline -- docs/adr/ADR-010-gap-filling-ai.md          # 期望仅 2 条：0a4dabf0（创建）/ 1cbb56bf（归档搬移）
```

- [ ] **Step 4: 删 3 条命令 + 1 个死常量**

`commands_ai_settings.rs`：
- 删 `ai_save_key`（`:95-106`，含 doc `:95-96`）与 `ai_clear_key`（`:108-112`，含 doc `:108-109`）**整段**（连同段间那一行空行）。
- 删 `ai_test_connection`（`:250-261`，含 doc `:250-254`）。
- 删 `const API_KEY_MAX_CHARS`（`:20`）及其上方 `///` 注释行（`Select-String -Path app\src-tauri\src -Recurse -Pattern '\bAPI_KEY_MAX_CHARS\b'` 复核：删完应 **0 命中**）。
- **不删**：`balance_adapter`（`:326` 的 `ai_get_balance` 仍在用）· `push_audit`（`ai_get_balance` / `ai_audit_*` 在用）· `snapshot_settings`（`:317` 在用）· `state.ai_credentials` 字段（`commands_ai_providers.rs` 十余处在用）。
- ⚠️ 文件头若点名这三条命令，同步改写。

- [ ] **Step 5: 删注册行**

`app_commands.rs` 删 `:370`（`crate::commands_ai_settings::ai_save_key,`）与 `:371`（`…ai_clear_key,`）—— 上方 `:367-368` 的注释还覆盖保留条目（`ai_get_settings` / `ai_update_settings` / `ai_set_authorized` …）⇒ **注释保留**；删 `:379`（`…ai_test_connection,`），其相邻注释 `:376` 覆盖保留条目 ⇒ **保留**。

- [ ] **Step 6: 登记表刷新 + 门禁 + 提交（照「统一作业模式」6→9 步）**

```powershell
node scripts/line-limits.mjs --full ; node scripts/line-limits.mjs --write ; node scripts/line-limits.mjs --full
git add app/src-tauri/src/commands_ai_settings.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
git diff --cached --stat
git commit --only -m "chore(rust): 删旧单 provider 密钥三命令" -- app/src-tauri/src/commands_ai_settings.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
```

**Verification（确切命令 + 期望可观测输出）**

| 命令 | 期望 |
|---|---|
| `node scripts/check-command-registry.mjs` | `✅ 命令注册一致：定义 331 / 注册 331 / 重复 0` |
| `cd app; npx tsc --noEmit` | exit 0，无输出 |
| `cd app; npx vitest run` | 与 `VITEST_BEFORE` **完全相同**（本任务不碰前端） |
| `cd app/src-tauri; cargo build 2> …` | exit 0；warning 计数 ≤ `CLIPPY_BEFORE` |
| `cd app/src-tauri; cargo test --test app_lib_tests` | `2359 passed; 0 failed; 6 ignored`（**不许变**） |
| `node scripts/line-limits.mjs --full` | exit 0；`301–600 档` 计数不变（`commands_ai_settings.rs` 仍在档内，数值已更新） |
| `[System.IO.File]::ReadAllLines('app/src-tauri/src/commands_ai_settings.rs',[Text.Encoding]::UTF8).Count` | 与豁免表登记值**逐字相等**（预算 ~315） |

**Rollback:** 纯删除且已提交 ⇒ `git revert <commit>` 即可完整恢复（无 schema、无数据、无迁移）。若只想回退注册面：把 3 行条目加回 `app_commands.rs` 并恢复被删函数（`git show <commit>^:<path>` 取原文）。

---

### Task 2: `commands.rs` 旧直调四连删除

**Files:**
- Modify: `app/src-tauri/src/commands.rs`（删 4 命令 + `MAX_INPUT_ITEMS` + 未用 import 名）
- Modify: `app/src-tauri/src/app_commands.rs`（删注册 `:53-56`）
- Modify: `docs/standards/line-limit-exemptions.md`（`--write`）

**Why:** `transcribe_audio` / `recognize_image` / `build_draft` / `save_draft_as_note` 是 v0.1.0 的「单文件直调」入口，早已被导入管线（`import.rs` → `import_transcribe::transcribe_audio`）、引擎层（`engine.rs` / `ocr.rs` 的 `recognize_image_timeout`）与 `process_to_note` 取代；前端 0 引用（实测）。**这是本批风险最高的一族**，因为存在**三个同名不同物的 `recognize_image` / `transcribe_audio`**（见 §四「不删清单」）。

**Interfaces:**
- Consumes: T1 的冻结基线
- Produces: `REGISTRY_AFTER = 327`；`commands.rs` 新行数（预算 ~523）

- [ ] **Step 1: 三向复核 + ★「同名三域归属」证明（本族 4 条命令，逐条跑，输出贴报告）**

**本族是本批同名碰撞的重灾区**（`recognize_image` / `transcribe_audio` 各有一个仍然活的同名函数）。⇒ Step 1 除了三向引用，还必须**逐条证明三类归属**：**①要删的命令本身 · ②同名活函数（若有） · ③注释里提到的名字**。

```powershell
$fe  = (Get-ChildItem app\src -Recurse -Include *.ts,*.tsx -File | Where-Object { $_.FullName -notmatch '\.(test|spec)\.tsx?$' }).FullName
$fet = (Get-ChildItem app\src -Recurse -Include *.test.ts,*.test.tsx,*.spec.ts,*.spec.tsx -File).FullName
$rs  = (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName
# ① 前端生产代码（字面量，期望 0）+ 前端测试（裸名，期望 0）
Select-String -Path $fe  -Pattern '"transcribe_audio"','"recognize_image"','"build_draft"','"save_draft_as_note"'
Select-String -Path $fet -Pattern 'transcribe_audio','recognize_image','build_draft','save_draft_as_note'
# ② Rust 侧路径调用（期望 0：没有任何 crate::commands:: 路径指向这四条）
Select-String -Path $rs  -Pattern 'crate::commands::(transcribe_audio|recognize_image|build_draft|save_draft_as_note)'
# ③ ★ 同名三域归属：按【接收者前缀 / 路径限定】逐条归类，禁止只看名字
Select-String -Path $rs  -Pattern '\btranscribe_audio\s*[<(]'   # 期望 2 处：commands.rs:218（要删）· import_transcribe.rs:16（活，保留）
Select-String -Path $rs  -Pattern '\brecognize_image\s*\('      # 期望：commands.rs:236（要删）· engine.rs:348 / ocr.rs:109（活方法，保留）· commands_device.rs:158 / engine_worker.rs:232 / ocr.rs:102（活调用，保留）
Select-String -Path $rs  -Pattern 'engine\.recognize_image|self\.recognize_image|crate::import_transcribe::transcribe_audio'  # 期望 >=5 处 ⇒ 全部指向【活函数】
Select-String -Path $rs  -Pattern 'fn (transcribe_audio|recognize_image)' -Context 0,1   # ★ 第二把尺：签名比对（命令收 State/AppState；活方法收 &self 或泛型 F）
# ④ 注释提及（不算引用，但必须人工判一次并写进报告）
Select-String -Path $rs  -Pattern '//.*\b(transcribe_audio|recognize_image)\b'
```
**判据**：③ 的输出里，凡带 `engine.` / `self.` / `crate::import_transcribe::` 前缀或属于 `engine.rs` / `ocr.rs` / `import_transcribe.rs` 的命中，**一律是活函数，禁删**；只有 `commands.rs:218` / `:236` 这两个 `#[tauri::command]` 属主的函数进删除面。

- [ ] **Step 2: 删 4 条命令 + 死常量**

`commands.rs` 删 `:216-287` 整段（`transcribe_audio` `:216-232` · `recognize_image` `:234-250` · `build_draft` `:252-266` · `save_draft_as_note` `:268-286`，含各自 `///` 文档注释与段间空行），再删 `:32-33` 的 `MAX_INPUT_ITEMS`（含 doc）。
**保留**：`require_media_extension`（`:44`，`process_to_note` `:313`/`:316` 在用）· `AUDIO_EXTENSIONS` / `IMAGE_EXTENSIONS`（同上）· `MAX_IMAGES`（`:31`）· `CONTENT_MAX_CHARS`（`:25`，`:273` 一处随 `save_draft_as_note` 消失 ⇒ **逐个复核它是否还有别的使用者**：`Select-String … '\bCONTENT_MAX_CHARS\b'`，若为 0 则一并删并记进报告——**这是计划者未逐条定死的一项，实施者必须实测判定**）。
`:18` 的 `use crate::types::{NewNote, Note, NoteDraft, OcrBlock, TranscriptSegment};`：删掉本族命令后逐个复核每个名字的剩余使用（`NoteDraft` 只在本族用过 ⇒ 删；`OcrBlock` / `TranscriptSegment` 若只剩 import 行 ⇒ 删；**判据是 `cargo build` 的 `unused_imports` warning 数为 0，不许靠猜**）。

- [ ] **Step 3: 删注册行（`:53-56` 四行连续）**

`app_commands.rs` 删 `crate::commands::transcribe_audio,` / `recognize_image,` / `build_draft,` / `save_draft_as_note,` —— 上方无专属注释（`:52` 是 `list_windows`，保留）。

- [ ] **Step 4: 登记表刷新 + 门禁 + 提交**

```powershell
node scripts/line-limits.mjs --full ; node scripts/line-limits.mjs --write ; node scripts/line-limits.mjs --full
git add app/src-tauri/src/commands.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
git commit --only -m "chore(rust): 删旧直调四命令与死常量" -- app/src-tauri/src/commands.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
```

**Verification**

| 命令 | 期望 |
|---|---|
| `node scripts/check-command-registry.mjs` | `定义 327 / 注册 327 / 重复 0` |
| `cd app/src-tauri; cargo test --test app_lib_tests` | `2359 passed; 0 failed; 6 ignored`（**不许变**：本族 0 测试） |
| `cargo build` warning 计数 | ≤ `CLIPPY_BEFORE`（**任何新增 `unused_imports` 都算失败**） |
| **★ 命令函数已消失（不是「grep 零命中」）** | `Select-String -Path $rs -Pattern 'crate::commands::(transcribe_audio\|recognize_image\|build_draft\|save_draft_as_note)'` = 全仓 0 命中 ∧ 在 `commands.rs` 内 `\b(transcribe_audio\|recognize_image\|build_draft\|save_draft_as_note)\s*[<(]` = **0 命中**（该文件里这四个名字再无任何形态） |
| **★ 同名活函数仍在（禁删面）** | `import_transcribe.rs:16` 的 `pub fn transcribe_audio<F: …>` 仍在 且 `import.rs:169` 的调用点未动 ∧ `engine.rs:348` / `ocr.rs:109` 的 `recognize_image` 方法仍在 且 `engine.recognize_image(` / `self.recognize_image(` 的**5 处调用点一个不少**（⛔ **2026-09-12 Task 2 复核：实测 4 处调用 + 3 处定义，「5 处」是口径错位；活函数与调用点一处未少，已在 `f74ff551` 由控制方独立验证**） |
| **★ 三者合取判据** | ① 命令函数已消失（上一行）∧ ② `cargo build` exit 0 且 warning 计数 ≤ `CLIPPY_BEFORE` ∧ ③ `cargo test --test app_lib_tests` 全绿无新失败。**任一项不成立即失败**（只看 grep 会漏删，只删匹配会炸 OCR/导入链路） |
| `node scripts/line-limits.mjs --full` | exit 0；`commands.rs` 登记值 = 实测值（预算 ~523） |

**Rollback:** `git revert <commit>`。

---

### Task 3: 删整个 `commands_artifacts` 模块（产物三命令）

**Files:**
- Delete: `app/src-tauri/src/commands_artifacts.rs`（163 行）
- Modify: `app/src-tauri/src/lib.rs`（删 `mod commands_artifacts;` `:177`）
- Modify: `app/src-tauri/src/app_commands.rs`（删 `:356-359`：注释 + 3 条注册）
- Modify: `docs/standards/line-limit-exemptions.md`（`--write`）

**Why:** 三条命令全删（产物视图 v0.11.5 已下线）⇒ 模块内**再无 `#[tauri::command]`**；其两个 `pub fn`（`render_artifact_markdown` / 私有 `render_block`）实测**无其他消费者**（`Select-String '\brender_artifact_markdown\b'` = 2 处命中，全在本文件）⇒ 整个文件成为死模块。**这是本批第二个「整模块删除」**。

**Interfaces:**
- Consumes: T2
- Produces: `REGISTRY_AFTER = 324`

- [ ] **Step 1: 三向复核 + 模块级复核**

```powershell
$fe = (Get-ChildItem app\src -Recurse -Include *.ts,*.tsx -File | Where-Object { $_.FullName -notmatch '\.(test|spec)\.tsx?$' }).FullName
Select-String -Path $fe -Pattern '"build_session_artifact"','"get_session_artifact"','"artifact_to_note"'   # 期望 0
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\brender_artifact_markdown\b'  # 期望仅 commands_artifacts.rs:88,113
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern 'build_artifact|replace_artifact|get_artifact'  # 复核：这些仍在 refine/db 链路被用 ⇒ 只删 commands_artifacts.rs，不删 artifact*.rs / db_artifacts.rs
```

- [ ] **Step 2: 删文件 + `mod` 声明 + 注册段**

```powershell
git rm app/src-tauri/src/commands_artifacts.rs
```
删 `lib.rs:177` 的 `mod commands_artifacts;`。删 `app_commands.rs:356-359`（`:356` 注释「// 会话产物（REQ-052/053，v0.5.0 M7：模板构建/读取/落笔记）」**只覆盖这三条** ⇒ 注释同删）。

- [ ] **Step 3: 登记表刷新 + 门禁 + 提交**

```powershell
node scripts/line-limits.mjs --full ; node scripts/line-limits.mjs --write ; node scripts/line-limits.mjs --full
git add app/src-tauri/src/lib.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
git diff --cached --stat --diff-filter=D      # 期望恰好 1 个路径：app/src-tauri/src/commands_artifacts.rs
git commit --only -m "chore(rust): 删产物命令整模块" -- app/src-tauri/src/commands_artifacts.rs app/src-tauri/src/lib.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
```

**Verification**

| 命令 | 期望 |
|---|---|
| `node scripts/check-command-registry.mjs` | `定义 324 / 注册 324 / 重复 0` |
| `cd app/src-tauri; cargo test --test app_lib_tests` | `2334 passed; 0 failed; 6 ignored`（**2026-09-12 更正**：原写「2359，本模块 0 测试」；控制方裁决扩大 Task 3 删除面后实测 **2359 → 2334 = −25**（17+8），落地 `6f90f7b1`） |
| `Test-Path app/src-tauri/src/commands_artifacts.rs` | `False` |
| `Select-String … 'commands_artifacts'` | 全仓 0 命中（含 `lib.rs` / `app_commands.rs`） |
| `node scripts/line-limits.mjs --full` | exit 0；`lib.rs` 与 `app_commands.rs` 登记值更新 |

**Rollback:** `git revert <commit>`（`git rm` 的删除会被 revert 恢复为新增文件）。

---

### Task 4: `commands_ai.rs` 补缝三连删除

**Files:**
- Modify: `app/src-tauri/src/commands_ai.rs`（删 3 命令 + `simple_hash` + `AiEnhanceStatus` + 模块文档改写 + import 收窄）
- Modify: `app/src-tauri/src/app_commands.rs`（删 `:360-363`：注释 + 3 条注册）
- Modify: `docs/standards/line-limit-exemptions.md`（`--write`；本文件**预期整行消失**）

**Why:** 补缝三连（`scan_ai_candidates` / `ai_enhance_mock` / `ai_enhance_status`）是 ADR-010「补缝式 AI」的前置三命令；宿主产物视图已下线、云端实装从未发生、前端 0 引用。**控制方实测牵连面**：`commands_ai.rs` **6 处**（module doc `:6,7,8` + 定义 `:30,46,105`）· `app_commands.rs` **3 处**（注册 `:361-363`）· **前端 0**。本任务**只删命令符号与其专用 helper**；模块级连带死代码是 Task 5（可独立裁决）。

**Interfaces:**
- Consumes: T3
- Produces: `REGISTRY_AFTER = 321`；`commands_ai.rs` 新行数（预算 **~291** ⇒ **回落到 ≤300，豁免表整行删除**）

- [ ] **Step 1: 三向复核**

```powershell
$fe = (Get-ChildItem app\src -Recurse -Include *.ts,*.tsx -File | Where-Object { $_.FullName -notmatch '\.(test|spec)\.tsx?$' }).FullName
Select-String -Path $fe -Pattern '"scan_ai_candidates"','"ai_enhance_mock"','"ai_enhance_status"'    # 期望 0
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\b(simple_hash|AiEnhanceStatus)\b'  # 期望各 2/3 处，全在 commands_ai.rs
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\bjudge_candidates\b|\bto_request\b|\bAiJudgeConfig\b|\bAiCandidate\b'  # 期望：只剩 ai_judge.rs / ai_judge_tests.rs / commands_ai.rs ⇒ 提示 Task 5
```

- [ ] **Step 2: 删命令与专用 helper**

`commands_ai.rs`：
- 删 module doc 里点名三条命令的两行 `//! @ai-context:`（`:6-8`；`:3-5` 那句「调用判定器（ai_judge）+ mock（ai_mock）」**必须改写** —— 删完 T4 后本文件不再调用 `ai_judge`）。
- 删 `scan_ai_candidates`（`:28-37`）· `ai_enhance_mock`（`:39-93`）· `simple_hash`（`:95-101`，含 doc）· `ai_enhance_status`（`:103-111`）· `AiEnhanceStatus` 结构体（`:113-120`，含 doc）。
- import 收窄：`:16` 的 `use crate::ai_judge::{…};` **整行删除**；`:18-21` 的 `use crate::ai_protocol::{AiEnhanceResponse, TextFilterDecision, TextFilterRequest, TextFilterResponse, TextFilterSegment};` 删掉 `AiEnhanceResponse`（其余四个被 `review_text_filter` / `text_filter_status` 使用 ⇒ 保留）。
- **保留**：`use crate::ai_mock::AiMockAdapter;`（`:253` 的 `let mock_adapter = AiMockAdapter;` 仍在 `review_text_filter` 内）· `review_text_filter` / `text_filter_status` / `AiReviewMeta` / `TextFilterReview` / `TextFilterStatus`（REQ-085 活功能）。

- [ ] **Step 3: 删注册段（`:360-363`）**

删注释 `:360`（只覆盖这三条）+ 三条注册。`:364` 的「// 笔记 AI 复核（REQ-085…）」注释**保留**（覆盖 `review_text_filter` / `text_filter_status`）。

- [ ] **Step 4: 登记表刷新（**核对整行是否消失**）+ 门禁 + 提交**

```powershell
node scripts/line-limits.mjs --full      # 期望 exit 1；commands_ai.rs 报 (e) 行数不一致
node scripts/line-limits.mjs --write
Select-String -Path docs\standards\line-limit-exemptions.md -Pattern 'commands_ai\.rs'   # 期望 0 命中（已回落到 ≤300 ⇒ 整行消失）
node scripts/line-limits.mjs --full      # 期望 exit 0
git add app/src-tauri/src/commands_ai.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
git commit --only -m "chore(rust): 删补缝三连命令（ADR-010 退役前置）" -- app/src-tauri/src/commands_ai.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
```

**Verification**

| 命令 | 期望 |
|---|---|
| `node scripts/check-command-registry.mjs` | `定义 321 / 注册 321 / 重复 0` |
| `cd app/src-tauri; cargo test --test app_lib_tests` | `2334 passed; 0 failed; 6 ignored`（**不许变**：`commands_ai.rs` 无内联测试）（**2026-09-12 更正**：原写 2359 —— Task 3 已先降至 2334；本任务与 Task 5 合并落地后为 **2308**） |
| `[System.IO.File]::ReadAllLines('app/src-tauri/src/commands_ai.rs',[Text.Encoding]::UTF8).Count` | ≤300（预算 ~291）且**与豁免表无该行**一致 |
| `Select-String … '\bai_judge\b'`（在 `commands_ai.rs` 内） | 0 命中 |
| `node scripts/line-limits.mjs --full` | exit 0；`301–600 档` 计数 **−1** |
| `cd app; npx tsc --noEmit` + `npx vitest run` | 与 `VITEST_BEFORE` 相同 |

**Rollback:** `git revert <commit>`。若 `--write` 把 `commands_ai.rs` 的行整行删了而你想回退：revert 会同时恢复源码与登记行。

---

### Task 5: 补缝连带模块删除（`ai_judge` + `AiMockAdapter::enhance`，−16 用例）　⛔ **2026-09-12 控制方裁决：本任务与本批 Task 4 合并为一次提交（`fd9dd8f9`），并连带删除 `ai_protocol.rs` 的 `AiEnhance*` 半边 ⇒ 实际 −26 用例（9+7+10），落地 `2308 passed / 0 failed / 6 ignored`**

> **本任务是规格 §9 L505「唯一例外是补缝三连的模块级连带死代码」的落地**，也是本批**唯一会改变 Rust 用例数**的任务。⚠️ **它是可独立裁剪的**：跳过它不影响 T1–T4 / T6–T8 的任何数字（注册计数仍是 321→317 的下一步起点），若控制方裁决「删除面再窄一点」，**直接跳过本任务并把它登记给批 8** 即可。　⛔ **2026-09-12 实况：控制方裁决为「执行」而不是跳过**（见「本批执行中的控制方裁决」(a)），且删除面扩到 `ai_protocol.rs` 的 `AiEnhance*` 半边 ⇒ 实际 −26 用例。

**Files:**
- Delete: `app/src-tauri/src/ai_judge.rs`（158 行）· `app/src-tauri/src/ai_judge_tests.rs`（139 行 / 9 用例）
- Modify: `app/src-tauri/src/lib.rs`（删 `mod ai_judge;` `:8`）
- Modify: `app/src-tauri/src/ai_mock.rs`（删 `enhance` `:24-89` + import 收窄 + 模块 doc 改写 + 删 `mod tests` 块 `:226-229`）
- Delete: `app/src-tauri/src/ai_mock_tests.rs`（87 行 / 7 用例 —— 逐行核对：7 条全在测 `enhance`）
- Modify: `docs/standards/line-limit-exemptions.md`（`--write` 只在 `app_commands.rs` 计数变化时有必要；本任务**不改** `app_commands.rs` ⇒ 理论上登记表无变化，仍跑一次 `--full` 确认 exit 0）

**Why:** `scan_ai_candidates` 是 `ai_judge` 模块**唯一的生产消费者**（`commands_ai.rs:16` 的 `use`）⇒ T4 之后该模块只被自己的测试引用 = **模块级死代码**；`AiMockAdapter::enhance` 的唯一生产消费者是 `ai_enhance_mock` ⇒ 同为死代码，其 7 条测试全部只测该方法。**反向复核（防误删）**：`AiMockAdapter` 的 `refine` / `review_text` / `enrich` 仍被 `ai_refine_task/workers.rs:20,42`、`ai_note_refine_task.rs:12`、`commands_ai_enrich.rs:302`、`refine_golden_tests.rs:69`、`commands_ai.rs:253` 消费 ⇒ **只删 `enhance` 一个方法，不删结构体**。

**Interfaces:**
- Consumes: T4
- Produces: `RUST_AFTER = 2308 passed / 0 failed / 6 ignored`（**2026-09-12 更正**：原写 2343 —— = 合并单元入口值 2334 − 26）；注册计数**仍 321**

- [ ] **Step 1: 死代码三重确认（每条都要有输出）**

```powershell
$rs = (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName
Select-String -Path $rs -Pattern '\bai_judge\b'                       # 期望：ai_judge.rs 自身 / ai_judge_tests.rs / lib.rs:8 —— 三处，无第四处
Select-String -Path $rs -Pattern '\b(AiCandidate|AiJudgeConfig|judge_candidates|to_request)\b'  # 期望：只剩 ai_judge.rs + ai_judge_tests.rs
Select-String -Path $rs -Pattern '\.enhance\('                        # 期望：ai_mock_tests.rs ×7 + （T4 后应为 0 处生产调用）
Select-String -Path $rs -Pattern '\bAiMockAdapter\b'                  # 期望：>=6 个文件仍引用结构体 ⇒ 结构体保留
cd app/src-tauri; cargo test --test app_lib_tests ai_judge:: 2> ..\..\$S\tmp\t5-aj.txt ; cargo test --test app_lib_tests ai_mock:: 2> ..\..\$S\tmp\t5-am.txt
Select-String -Path ..\..\$S\tmp\t5-aj.txt -Pattern 'running \d+ tests|test result'   # 期望 running 9 tests / ok. 9 passed
Select-String -Path ..\..\$S\tmp\t5-am.txt -Pattern 'running \d+ tests|test result'   # 期望 running 7 tests / ok. 7 passed
```
⚠️ **任一期望落空 ⇒ 停下，把实测写进报告并上报控制方**（说明模块并非全死）。

- [ ] **Step 2: 删模块与模块级测试**

```powershell
git rm app/src-tauri/src/ai_judge.rs app/src-tauri/src/ai_judge_tests.rs app/src-tauri/src/ai_mock_tests.rs
```
删 `lib.rs:8` 的 `mod ai_judge;`。
⚠️ `ai_judge_tests.rs` 由 `ai_judge.rs:156-158` 的 `#[cfg(test)] #[path = "ai_judge_tests.rs"] mod tests;` 挂载；`ai_mock_tests.rs` 由 `ai_mock.rs:226-229` 同法挂载 ⇒ 两个挂载块随文件一起删（Step 3 处理 `ai_mock.rs` 的那一个）。

- [ ] **Step 3: 删 `AiMockAdapter::enhance` 与挂载块**

`ai_mock.rs`：
- 删 `:24-89`（`enhance` 的 doc `:24-27` + 方法体 `:28-89`）。
- import 收窄 `:11-14` → `use crate::ai_protocol::{TextFilterAction, TextFilterDecision, TextFilterRequest, TextFilterResponse};`（`AiEnhanceRequest` / `AiEnhanceResponse` / `AiRequestType` / `AiResponseContent` 在删掉 `enhance` 后 0 使用 —— **以 `cargo build` 的 `unused_imports` 为最终判据**）。
- module doc `:3-7` 里描述「按请求类型规则生成合法响应 / mock 响应对请求类型做结构化回复」两句**改写**为只描述 `review_text` / `refine` / `enrich`（否则文档说谎）。
- 删尾部 `:226-229` 的 `/// 单测独立文件…` + `#[cfg(test)] #[path = "ai_mock_tests.rs"] mod tests;`。

- [ ] **Step 4: 门禁（用例数必须精确下降 16）+ 提交** —— **2026-09-12 更正：合并单元须精确下降 26**（T5 本体 16 ＋ `ai_protocol.rs` 的 AiEnhance 侧 10）

```powershell
cd app/src-tauri
cargo build 2> ..\..\$S\tmp\t5-build.txt
cargo test --test app_lib_tests 2> ..\..\$S\tmp\t5-rust.txt ; "exit=$LASTEXITCODE"
Select-String -Path ..\..\$S\tmp\t5-rust.txt -Pattern 'test result:'      # 期望 ok. 2308 passed; 0 failed; 6 ignored（2026-09-12 更正：原写 2343）
cd ../..
node scripts/line-limits.mjs --full ; node scripts/docs-check.mjs ; node scripts/check-command-registry.mjs   # 321/321/0
git add app/src-tauri/src/lib.rs app/src-tauri/src/ai_mock.rs
git diff --cached --stat --diff-filter=D      # 期望恰好 3 个路径：ai_judge.rs / ai_judge_tests.rs / ai_mock_tests.rs
git commit --only -m "chore(rust): 删补缝判定器与 mock 增强死模块" -- app/src-tauri/src/ai_judge.rs app/src-tauri/src/ai_judge_tests.rs app/src-tauri/src/ai_mock.rs app/src-tauri/src/ai_mock_tests.rs app/src-tauri/src/lib.rs
```

**Verification**

| 命令 | 期望 |
|---|---|
| `node scripts/check-command-registry.mjs` | `定义 321 / 注册 321 / 重复 0`（**与 T4 相同**：本任务不删命令） |
| `cd app/src-tauri; cargo test --test app_lib_tests` | **`2308 passed; 0 failed; 6 ignored`**（**2026-09-12 更正**：原写 2343）—— 必须**恰好**比合并单元的入口值 `2334` 少 **26**（T5 本体 9+7 = 16 ＋ `ai_protocol.rs` 的 `AiEnhance*` 半边 10）；若少 27 或多 1 ⇒ 停手上报（说明有别的测试引用了被删符号） |
| `Test-Path app/src-tauri/src/ai_judge.rs` 等三文件 | 全 `False` |
| `Select-String … '\bai_judge\b'` | 全仓 0 命中 |
| `cargo build` warning 计数 | ≤ `CLIPPY_BEFORE` |
| `node scripts/line-limits.mjs --full` | exit 0（`ai_judge.rs` / `ai_mock.rs` 均不在登记表） |

**Rollback:** `git revert <commit>` —— 会一并恢复 3 个文件与 `lib.rs` 的 `mod` 行；因为 `ai_judge_tests.rs` 的挂载点在被恢复的 `ai_judge.rs` 内，revert 后测试数回到 **2334**（**2026-09-12 更正**：原写 2359 —— T4+T5 已合并为 `fd9dd8f9`，回滚该提交即回到其入口值 2334，也就是 Task 3 之后的态）（**独立验证 revert 完整性的一次机会**，建议在报告里给一次 revert 演练的干跑结论，若时间不允许则如实写「未演练」）。

---

### Task 6: 四个单体命令删除（groups / fragments / refine / diag）

**Files:**
- Modify: `app/src-tauri/src/commands_groups.rs`（`get_note_group` `:51-62`）
- Modify: `app/src-tauri/src/commands_fragments.rs`（`list_group_fragments` `:133-140`）
- Modify: `app/src-tauri/src/commands_refine.rs`（`structure_models_dir_cmd` `:98-102`）
- Modify: `app/src-tauri/src/commands_diag.rs`（`vad_threshold_diag` `:114-135`）
- Modify: `app/src-tauri/src/app_commands.rs`（删 `:82` / `:102` / `:441` / `:325-326`）
- Modify: `docs/standards/line-limit-exemptions.md`（`--write`；`commands_fragments.rs` 数值更新）

**Why:** 四条都是被更好的路径取代的读/诊断命令（组详情被全量列表 + 前端 map 取代 · 组内碎片被 `list_fragments` 全量取代 · 结构模型目录自述「前端展示用」但前端 0 引用 · VAD 阈值诊断是开发期工具）。**四条各在一个文件、互不相干，合起来仍是「一个可独立评审的删除单元」**（判据：四条都不牵连私有 helper —— `structure_models_dir()` 仍被 `:90` 一带消费、`vad_threshold_slot` 模块仍被 live 链路消费、`db.list_fragments_by_group` 仍被 flashcards/settlement 消费）。

**Interfaces:**
- Consumes: T5
- Produces: `REGISTRY_AFTER = 317`

- [ ] **Step 1: 三向复核（4 条各跑一遍「统一作业模式」第 1 步）**

重点复核（写进报告）：
```powershell
# list_group_fragments 的「DB 层保留」必须成立
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\blist_fragments_by_group\b'   # 期望 >=5 处（db_fragments.rs 定义 + flashcards/settlement 消费 + 测试）
# structure_models_dir_cmd 的私有 helper 仍在用
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\bstructure_models_dir\b'
# vad 槽位仍在用（删命令 ≠ 删模块）
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\bvad_threshold_slot\b'      # 期望 >=5 处
# get_note_group 的 db 层仍在用
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\bget_group\b'                # 期望多处（别的命令在用）
```

- [ ] **Step 2: 删 4 条命令 + 4 处注册**

删各文件的 `///` 文档 + `#[tauri::command]` + `fn` 整段（行号见 Files）。删 `app_commands.rs` 的 `:82` / `:102` / `:441` 三条注册，以及 `:325` 的专属注释（「// REQ-115（v0.7.0 M2）：VAD 阈值诊断（口径对照可查）」只覆盖 `:326`）+ `:326`。

- [ ] **Step 3: 登记表刷新 + 门禁 + 提交**

```powershell
node scripts/line-limits.mjs --full ; node scripts/line-limits.mjs --write ; node scripts/line-limits.mjs --full
git add app/src-tauri/src/commands_groups.rs app/src-tauri/src/commands_fragments.rs app/src-tauri/src/commands_refine.rs app/src-tauri/src/commands_diag.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
git commit --only -m "chore(rust): 删组/碎片/精修/诊断四单体命令" -- app/src-tauri/src/commands_groups.rs app/src-tauri/src/commands_fragments.rs app/src-tauri/src/commands_refine.rs app/src-tauri/src/commands_diag.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
```

**Verification**

| 命令 | 期望 |
|---|---|
| `node scripts/check-command-registry.mjs` | `定义 317 / 注册 317 / 重复 0` |
| `cd app/src-tauri; cargo test --test app_lib_tests` | `2308 passed; 0 failed; 6 ignored`（本任务 0 测试；**不许再降**）（**2026-09-12 更正**：原写 2343）　⛔ **收口实测：本行预测被证伪——Task 6 实际 −4（2308 → 2304）**：删 `vad_threshold_diag` 后 `VadThresholdView:43` + `VadThresholdSlot::{read,source_session_id}` 成孤儿，控制方裁决「方案 B」把 3 符号及其**专属 4 条内联测试**一并删除（写端 `publish` 与 `bits`/`source_session` 未动）。见「收口回写」节收口二与台账 §〇·16/§〇·17 |
| `node scripts/line-limits.mjs --full` | exit 0；`commands_groups.rs`（~272）/`commands_refine.rs`（~173）/`commands_diag.rs`（~121）**均不在登记表**（≤300）；`commands_fragments.rs` 数值更新 |
| `cd app; npx vitest run` | 与 `VITEST_BEFORE` 相同 |

**Rollback:** `git revert <commit>`。

---

### Task 7: `commands_video` 四连删除

**Files:**
- Modify: `app/src-tauri/src/commands_video.rs`（删 `detect_video_domain` `:131-173` · `remember_video_profile` `:287-316` · `video_profile_by_kind` `:328-332` · `video_profile_spec_by_kind` `:356-361`）
- Modify: `app/src-tauri/src/app_commands.rs`（删 `:286` / `:288` / `:291` / `:294` + 改写两处注释）
- Modify: `docs/standards/line-limit-exemptions.md`（`--write`；数值更新）

**Why:** 四条都被更新的通道取代：`detect_video_domain` 的上游 OCR 标签通道从未建起来（`infer_platform` 已从标题/URL 自行补标签）· `remember_video_profile` 被 `remember_video_profile_form` **完整覆盖**（规格 §9 #44，双重死亡）· `video_profile_by_kind` / `video_profile_spec_by_kind` 前端已有 `KIND_TO_FORM` / `KIND_TO_TIER` 双写。**⚠️ 本任务最容易误删**：文件里还有 7 条**活**命令（`video_profiles` / `detect_video_profile` / `video_profile_memory` / `video_profile_for_spec` / `remember_video_profile_form` / `remember_video_profile_domain` / `list_domain_fine` / `preheat_domain_hotwords`）与 `KIND_MAX_CHARS` 常量（`Select-String '\bKIND_MAX_CHARS\b'` 删后应仍有 3 处使用）。

**Interfaces:**
- Consumes: T6
- Produces: `REGISTRY_AFTER = 313`

- [ ] **Step 1: 三向复核 + 「同名不同物」复核**

```powershell
$fe = (Get-ChildItem app\src -Recurse -Include *.ts,*.tsx -File | Where-Object { $_.FullName -notmatch '\.(test|spec)\.tsx?$' }).FullName
Select-String -Path $fe -Pattern '"remember_video_profile"' -SimpleMatch      # 期望 0（注意：ProfileDetector.tsx:180/216 用的是 _form / _domain，活）
Select-String -Path $fe -Pattern '"video_profile_by_kind"','"video_profile_spec_by_kind"','"detect_video_domain"'   # 期望 0
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\bprofile_by_kind\b'   # 期望仍 >=6 处非测试消费（analysis/import/live_session*）⇒ 只删命令包装
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\bspec_from_kind\b'    # 期望删后仅 video_profile_spec.rs:217 + video_profile_spec_tests.rs:208,213 ⇒ 保留（见「不删清单」）
```

- [ ] **Step 2: 删 4 条命令 + 注册行 + 两处注释改写**

- 删 4 个 `///` 文档 + `#[tauri::command]` + `fn` 整段（含段间空行）。
- `app_commands.rs`：删 `:286` / `:288` / `:291` / `:294` 四条注册。
- **改写注释（陈述必须为真）**：
  - `:289` 「// v0.9.0 M1（REQ-188）：四维解耦 command（矩阵查询/旧档案映射/形态记忆）」→ 「// v0.9.0 M1（REQ-188）：四维解耦 command（矩阵查询/形态记忆）」（`旧档案映射` 的命令已删）。
  - `:293` 「// v0.9.0 M3（REQ-190）：领域标签检测 + hotwords 预热」→ 「// v0.9.0 M3（REQ-190）：hotwords 预热」（`preheat_domain_hotwords` `:295` 保留）。
  - `:283` 与 `:296` 的注释覆盖保留条目 ⇒ 不动。

- [ ] **Step 3: 登记表刷新 + 门禁 + 提交**

```powershell
node scripts/line-limits.mjs --full ; node scripts/line-limits.mjs --write ; node scripts/line-limits.mjs --full
git add app/src-tauri/src/commands_video.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
git commit --only -m "chore(rust): 删旧视频档案四命令" -- app/src-tauri/src/commands_video.rs app/src-tauri/src/app_commands.rs docs/standards/line-limit-exemptions.md
```

**Verification**

| 命令 | 期望 |
|---|---|
| `node scripts/check-command-registry.mjs` | `定义 313 / 注册 313 / 重复 0` |
| `cd app/src-tauri; cargo test --test app_lib_tests` | `2308 passed; 0 failed; 6 ignored`（`commands_video.rs` 的测试在独立文件 `commands_video_tests.rs`，实测**不引用**这 4 条 ⇒ 不许降）（**2026-09-12 更正**：原写 2343）　⛔ **收口实测：本行预测被证伪——Task 7 实际 −4（2304 → 2300）**：4 个二阶孤儿符号（`ocr_tags_to_domain` / `ProfileMemory::remember` / `spec_from_kind` / `ProfileKind::default_tier`，后者逐字列在本计划「不删」清单里）各带专属测试，控制方裁决 **B-full** 一并删除 ⇒ 与「不删」清单第 5 次证伪同源。见「收口回写」节收口一/收口二与台账 §〇·19/§〇·20 |
| `Select-String … 'commands_video::'`（在 `app_commands.rs` 内） | 剩余条目数 = 删除前 − 4；且 `remember_video_profile_form` / `_domain` / `video_profile_for_spec` / `video_profile_memory` **仍在** |
| `node scripts/line-limits.mjs --full` | exit 0；`commands_video.rs` 登记值 ≈311 |

**Rollback:** `git revert <commit>`。

---

### Task 8: `open_capture_float` 改判删除（规格「待核实」结清）

**Files:**
- Modify: `app/src-tauri/src/commands_window.rs`（删 `open_capture_float` `:260-270`）
- Modify: `app/src-tauri/src/app_commands.rs`（删 `:299-300`：注释改写 + 条目删）
- Modify: `app/src-tauri/src/app_setup.rs`（`:318` 的注释改指真实兜底路径，**行数不变**）
- Modify: `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§9 `:493` 行改判 + 汇总 `:501` + §10 `:515` + §12 `:558`）
- Modify: `docs/standards/line-limit-exemptions.md`（`--write`；`commands_window.rs` 数值更新）
- Modify（**计划漏列，实现者补做；纯注释、行数不变**）：`app/src-tauri/src/lib.rs` 的模块理由注释 —— 原文「采集浮窗窗口命令（`open_capture_float`/…）」随删除失真 ⇒ 改写为 `close_capture_float`/`float_toggle`（**AGENTS §10 文件，仅注释**；`lib.rs` 登记值 572 是批终值，行数不变故不触发 (e)）

**Why:** 规格把 `open_capture_float` 标为「待核实（B 桶唯一无把握项）」。控制方 2026-09-11 独立结清：**前端 0 调用者**（全仓仅注册处 / 定义处 / `app_setup.rs:318` 的一句注释）；浮窗的**开**路径由两条活路径承载 —— `float_toggle`（前端 `app/src/hooks/useClassroomFloat.ts:38`）与 `FloatAction::Open => float_open_core(app)`（`commands_window.rs:250`）；`open_capture_float` 只是又包了一层 `float_open_core(&app)`。**计划者独立复核同上**。⇒ 改判为**删**，并同步规格四处文案（这是规格**必须**改的事实，不属「重写历史」）。

**Interfaces:**
- Consumes: T7
- Produces: `REGISTRY_AFTER = 312`；规格 §9 汇总变为「删 22 · 补 UI 12 · 登记不排期 7 · 撤下 IPC 3 · 有意保留 3 · 待核实 0 ＝ 47」

- [ ] **Step 1: 复核（三条活路径必须在场）**

```powershell
$fe = (Get-ChildItem app\src -Recurse -Include *.ts,*.tsx -File).FullName
Select-String -Path $fe -Pattern '"open_capture_float"' -SimpleMatch                     # 期望 0
Select-String -Path $fe -Pattern 'float_toggle|close_capture_float'                      # 期望 >=6 处（useClassroomFloat.ts / CaptureFloatPanel.tsx / ClassroomPage.tsx）
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern '\bfloat_open_core\b'   # 期望 3 处：定义 :164 · FloatAction::Open :250（活）· open_capture_float :269（将删）
Select-String -Path (Get-ChildItem app\src-tauri\src -Recurse -Include *.rs -File).FullName -Pattern 'precreate_float'       # 期望 2 处（app_setup.rs:319 启动期预创建 + 定义）
```

- [ ] **Step 2: 删命令 + 注册 + 注释改指**

- `commands_window.rs`：删 `:260-270`（doc 含两段 `@ai-context:` + `#[tauri::command]` + `fn` + 段末空行）。**保留** `float_open_core`（`:164` 定义，被 `:250` 的 `FloatAction::Open` 消费）。
- `app_commands.rs`：`:299` 注释「// v0.12.0 M6（采集体验债）：采集浮窗打开/关闭」→ 「// v0.12.0 M6（采集体验债）：采集浮窗关闭」；删 `:300` 条目（`:301 close_capture_float` 保留）。
- `app_setup.rs:318`：注释里的「（open_capture_float 内部兜底）」已失指 ⇒ 改为「（`float_open_core` 内部兜底）」或等义表达；**行数必须保持 2 行**（本文件在登记表内，行数不变才不触发 (e)）。

- [ ] **Step 3: 规格同步（四处，逐字给出新文本）**

1. §9 `:493`：`| 41 | \`open_capture_float\` | **待核实** | 前端现有开浮窗方式未确认（B 桶唯一无把握项） |` → `| 41 | \`open_capture_float\` | **删** | 2026-09-11 结清：前端 0 调用者；开路径由 \`float_toggle\`（\`useClassroomFloat.ts:38\`）与 \`FloatAction::Open => float_open_core\`（\`commands_window.rs:250\`）承载，本命令只是又包一层 \`float_open_core\` ⇒ 批 1 Task 8 删 |`
2. §9 `:501` 汇总行：`删 **21** … 待核实 **1** ＝ 47` → `删 **22** · 本批补 UI **12** · 登记不排期 **7** · 撤下 IPC **3** · 有意保留 **3** · 待核实 **0** ＝ 47`，并在汇总下方补一句：`> **2026-09-11 改判**：#41 \`open_capture_float\` 由「待核实」改为「删」（依据见该行说明）⇒ 删除批由 21 条升至 **22** 条。`
3. §10 `:515` 批 1 行：`21 条命令` → `**22** 条命令`。
4. §12 `:558`：`| \`open_capture_float\` 前端现有开法 | **需核实**（B 桶唯一无把握项） |` → `| \`open_capture_float\` 前端现有开法 | ✅ **已结清 2026-09-11**：前端 0 调用者（活路径为 \`float_toggle\` + \`close_capture_float\`）⇒ 改判为「删」，落地于**批 1** |`
⚠️ 规格正在被并行任务编辑（实测行数已从 606 涨到 **610**，§11 验收 5 已被批 0-D 追补）⇒ **每处都用内容锚定位后再改**，不要只按行号跳；改完 `node scripts/docs-check.mjs` 必须绿（相对链接完整性）。

- [ ] **Step 4: 登记表刷新 + 门禁 + 提交**

```powershell
node scripts/line-limits.mjs --full ; node scripts/line-limits.mjs --write ; node scripts/line-limits.mjs --full
git add app/src-tauri/src/commands_window.rs app/src-tauri/src/app_commands.rs app/src-tauri/src/app_setup.rs docs/superpowers/specs/2026-09-11-frontend-redesign-design.md docs/standards/line-limit-exemptions.md
git commit --only -m "chore(rust): 删 open_capture_float 并同步规格改判" -- app/src-tauri/src/commands_window.rs app/src-tauri/src/app_commands.rs app/src-tauri/src/app_setup.rs docs/superpowers/specs/2026-09-11-frontend-redesign-design.md docs/standards/line-limit-exemptions.md
```

**Verification**

| 命令 | 期望 |
|---|---|
| `node scripts/check-command-registry.mjs` | `定义 312 / 注册 312 / 重复 0` |
| `cd app/src-tauri; cargo test --test app_lib_tests` | `2308 passed; 0 failed; 6 ignored`（`commands_window.rs` 的 2 条测试与 `open_capture_float` 无关 ⇒ 不许降）（**2026-09-12 更正**：原写 2343） |
| `Select-String … 'open_capture_float'` | **live-code 面 0 命中**（含 `app_setup.rs` 注释）　⛔ **2026-09-12 收口改口径**：原文写「全仓 0 命中」，**按字面不可执行** —— `docs/versions/v0.12.0.md:187` · `v0.12.3.md:40/85` 属**已发布版本的历史记录**，合法保留该名（改写 = 伪造历史，与 `CHANGELOG.md` 同口径）。判定面 = `app/src/**`（含测试）+ `app/src-tauri/src/**` + `capabilities/*.json` + `scripts/**`；`docs/versions/**` · `CHANGELOG.md` · `docs/archive/**` 豁免 |
| `node scripts/docs-check.mjs` | exit 0（规格改动未破坏链接） |
| `node scripts/line-limits.mjs --full` | exit 0；`commands_window.rs` 登记值 ≈357；**`app_setup.rs` 数值仍 420**（行数不变的正向用例） |
| `Select-String -Path docs\superpowers\specs\2026-09-11-frontend-redesign-design.md -Pattern '删 \*\*22\*\*'` | 1 命中 |

**Rollback:** `git revert <commit>`（同时回退规格四处文案，避免「规格说删、代码没删」的悬空状态）。

---

### Task 9: 清 `structuredBlocks.ts` 死文案（严格照规格字面）

**Files:**
- Modify: `app/src/components/structuredBlocks.ts`（删 `aiPlaceholderLabel` `:61-64` + 改写模块头 `:5`）
- Modify: `app/src/components/structuredBlocks.test.ts`（删 import 名 `:8` + describe 标题 `:82` + 用例 `:91-93`）

**Why:** 规格 §10 批 1 行写「清理 `structuredBlocks.ts:63` 死文案」。实测 `:63` 是 `aiPlaceholderLabel()` 的返回串 `"AI 增强待 V1.0"` —— AI 增强**早已上线**（`commands_ai.rs` 的 REQ-085 文本复核、`commands_ai_refine.rs` 的精修链路都在跑），该占位是**过时死文案**，且函数**无生产调用者**（`Select-String '\baiPlaceholderLabel\b'` = 4 处全在定义 + 自己的测试里）。

**★ 边界（控制方 2026-09-11 裁决，必须照此执行）**：**只删 `aiPlaceholderLabel()` 及其测试**。**整模块存废不归批 1** —— `lowConfidenceClass()`（`:57-59`）是规格 §4.1 `--due` 行点名的「低置信点线」消费场景，属**有意要的功能**，二选一（(a) 接线 / (b) 删除）**登记给批 7**（见「未做（登记）」）。在一个删除批里顺手删掉一个被设计系统点名要的功能 = **越权改产品**。

**Interfaces:**
- Consumes: 无（可与 T1–T8 并行）
- Produces: 前端用例数 **−1**（其余文件不动）

- [ ] **Step 1: 复核（含「不得顺手删」的反证据）**

```powershell
$fe = (Get-ChildItem app\src -Recurse -Include *.ts,*.tsx -File).FullName
Select-String -Path $fe -Pattern '\baiPlaceholderLabel\b'      # 期望 4 处：structuredBlocks.ts:62 定义 + 测试 :8/:82/:92
Select-String -Path $fe -Pattern 'structuredBlocks'            # 期望：唯一 importer 是 structuredBlocks.test.ts:12（另有 motion-coverage.test.ts 的注释提及 :58，属注释）
Select-String -Path $fe -Pattern '\blowConfidenceClass\b'      # 期望 7 处 ⇒ 保留（不在本任务范围）
Select-String -Path $fe -Pattern 'ed-low-confidence'           # 期望 4 处（产者 + 测试 + motion-coverage 的两处注释名）
```
⚠️ **不得引用 `docs/tech-debt/review-2026-09-11.md` 的「18 个死运行时导出」这类汇总结论**：控制方抽查 4 个已发现反例（`orderedBlockFrames` 1/1 死 · `systemKindLabel` 1/1 死 · `parseNoteTags` 2/2 疑似死 · **`relativeLuminance` 11 处总命中 / 6 处非测试 ⇒ 活的**）⇒ **汇总结论两个方向都会错**；本任务不采用该数字，也不做超出 `aiPlaceholderLabel` 的删除。

- [ ] **Step 2: 删函数 + 改模块头 + 删测试三处**

`structuredBlocks.ts`：删 `:61`（doc）+ `:62-64`（`aiPlaceholderLabel`）。模块头 `:5` 的 `… / AI 占位样式（"AI 增强待 V1.0"）。` 改为 `… / 低置信样式（黄色虚线下划线）。`（`renderLatex` / `renderMarkdownTable` / `lowConfidenceClass` 三个导出**原样保留**）。
`structuredBlocks.test.ts`：`:8` 从 import 列表删 `aiPlaceholderLabel,`；`:82` 的 `describe("lowConfidenceClass / aiPlaceholderLabel", …)` → `describe("lowConfidenceClass", …)`；删 `:91-93` 的 `it("AI 占位文案为诚实声明", …)` 整块。
⚠️ **文本扫描守卫提示**：本任务不需要在任何测试里提到被删字符串；若实施者在注释/测试名里写 `"AI 增强待 V1.0"`，注意 `app/src/ui/primitives/style-contract.test.ts` / `motion-coverage.test.ts` 都是**整文件文本扫描**型守卫 —— 需要提及时用拼接写法。

- [ ] **Step 3: 门禁（前端三件 + 仓库根三件）+ 提交**

```powershell
cd app; npx tsc --noEmit ; npx vitest run src/components/structuredBlocks.test.ts ; npx vitest run ; cd ..
node scripts/line-limits.mjs --full ; node scripts/docs-check.mjs ; node scripts/check-command-registry.mjs
git add app/src/components/structuredBlocks.ts app/src/components/structuredBlocks.test.ts
git commit --only -m "chore(ui): 删 structuredBlocks 过时 AI 占位死文案" -- app/src/components/structuredBlocks.ts app/src/components/structuredBlocks.test.ts
```

**Verification**

| 命令 | 期望 |
|---|---|
| `cd app; npx vitest run` | 文件数与用例数 = `VITEST_BEFORE` **−1 用例**（文件数不变：该测试文件还有 7 条用例） |
| `npx tsc --noEmit` | 0 错（若报 TS2305 说明 import 名没删干净） |
| `Select-String … '\baiPlaceholderLabel\b'` | 全仓 0 命中 |
| `[System.IO.File]::ReadAllLines('app/src/components/structuredBlocks.ts',[Text.Encoding]::UTF8).Count` | 60（预算；实测为准） |
| `node scripts/line-limits.mjs --full` | exit 0（前端文件 ≤300，不在登记表） |
| `node scripts/check-command-registry.mjs` | **与前一任务相同**（本任务不碰 Rust） |

**Rollback:** `git revert <commit>`（纯前端、无副作用）。

---

### Task 10: 修订 ADR-010 为退役（+ 索引 / 交叉引用 / 需求池同步）

**Files:**
- Modify: `docs/adr/ADR-010-gap-filling-ai.md`（**保留文件**，93 行 → 追加退役节 + 状态改写）
- Modify: `docs/adr/README.md`（索引 `:17` 的状态单元格）
- Modify: `docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md`（`:250` 的登记节 + `:259` 的相关决策行）
- Modify: `docs/product/requirements-pool.md`（REQ-055 `:76` 状态；REQ-056 `:537` 的依赖说明）
- Modify: `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§14 文档表的 ADR-010 行）

**Why:** 规格 §10 批 1 明写「ADR-010 修订为退役」，§14 文档表写「**修订为退役**」，§1 L1 #10 写「**修订 ADR-010**」。**ADR 是历史决策记录 ⇒ 绝不删文件**（删掉会破坏 8 处交叉引用与 `docs-check` 的索引覆盖）。`docs/standards/adr.md:120` 的状态流转是 `Proposed → Accepted → (Deprecated | Superseded)`，本仓 `docs/adr/README.md` 的中文词表是 `提议 / 已接受 / 已废弃 / 已取代` ⇒ **取「已废弃」**（「不再适用，但保留供历史追溯」），因为**没有一条新 ADR 取代它**（ADR-034/035 已被批 3 / 批 6 占用，且退役不是"被取代"而是"被撤回"）。

**★ 本任务最要紧的一件事（否则会误伤红线）**：ADR-010 被 **8 条 ADR** 当作「AI 为增强层·本地兜底铁律」的出处引用（`ADR-016:75` · `ADR-017:33,102` · `ADR-021:69` · `ADR-023:24,58` · `ADR-026:4` · `ADR-027:4,40` · `ADR-028:38` · `ADR-029:4,17,55` · `ADR-030:42`）。**退役的是「补缝式 AI 的具体形态」（判定器 / `ai_candidate` 块 / 协议 schema / mock 适配器），不是「本地优先 + AI 默认关 + 可降级」这条红线**（AGENTS.md §4 与规格 §3 红线 1 仍强制）。⇒ 退役节**必须显式切割**这两件事，并逐条列出**仍然生效**的条款。

**Interfaces:**
- Consumes: T1–T9（退役节的「已删除物」清单要与代码事实一致）
- Produces: ADR-010 状态 = **已废弃**；需求池 REQ-055 状态改写

- [ ] **Step 1: 证据冻结（写进退役节）**

```powershell
git log --oneline -- docs/adr/ADR-010-gap-filling-ai.md     # 期望仅 2 条（0a4dabf0 创建 / 1cbb56bf 归档搬移）⇒ "从未被实质修订"
node scripts/check-command-registry.mjs                     # 删完后应为 312/312/0（退役节的计数锚）
Select-String -Path (Get-ChildItem docs\adr -Include *.md -File).FullName -Pattern 'ADR-010'   # 交叉引用清单（退役节要逐条点名）
```

- [ ] **Step 2: 在 ADR-010 内写退役修订（结构照 `docs/templates/adr-template.md` 与 ADR-032 的写法）**

把 `## 状态` 一节（`:3-5`）改为：

```markdown
## 状态

**已废弃（2026-09-11，退役修订）** —— 原「已接受（2026-08-18，六轮头脑风暴轮 6 产出；0.5.0 做协议前置构建，V1.0 实装云端）」。
退役依据：[前端重设计规格 §9/§10](../superpowers/specs/2026-09-11-frontend-redesign-design.md)（批 1「删除批」）· 控制方 2026-09-11 裁决。
**本文档保留供历史追溯，不删除**（ADR 纪律：被废弃的 ADR 不删除，见 [ADR 标准](../standards/adr.md)）。
⚠️ 上面两条相对链接是**按本文件位于 `docs/adr/` 写的**（`../superpowers/…` / `../standards/…`）—— 实施者照抄时**不要**照抄本计划里其他地方的 `../../` 层级。
```

并在文档末尾（`## 参考` 之后）追加一节：

```markdown
## 退役修订（2026-09-11）

### 退役范围（**只此一项**）

**「补缝式 AI」这一具体形态退役**：块级 `ai_candidate` 判定器 · 上传协议 schema 与 mock 适配器 · 三条前置 IPC 命令（`scan_ai_candidates` / `ai_enhance_mock` / `ai_enhance_status`）· `ai_judge` 判定器模块。
落地：**批 1（2026-09-11）** —— 注册命令 **334 → 312**（本批共删 22 条，其中补缝三连 3 条）；`ai_judge.rs`（158 行）与 `ai_judge_tests.rs`（9 用例）、`AiMockAdapter::enhance` 与 `ai_mock_tests.rs`（7 用例）同批删除。

### 退役理由（三条，均为实测）

1. **宿主特性已下线**：本决策的渲染宿主「产物视图」在 v0.11.5 已删除 ⇒ `ai_candidate` 块与 `AiEnhanceResponse` 的渲染链路没有消费端。
2. **能力已被更好的通道覆盖**：本地失败块的「文本侧」由 REQ-085 文本复核（`review_text_filter` / `text_filter_status`，活）承载；「图像侧」由 ADR-023 的精修图片理解承载；二者都不依赖 `ai_candidate` 判定器。
3. **从未实装且不再排期**：V1.0 云端实装（REQ-056）从未开工，规格 §9 已把三条命令归入「删」。

### ★ 退役**不包含**的内容（仍然生效，逐条）

下列条款**继续有效**，其出处仍在本文档（因此其他 ADR 对本 ADR 的引用不失效）：

- **本地优先**：数据不出本机；本地结果永远保留（AI 是叠加层而非替代层）。
- **AI 默认关闭 + 用户授权**：任何上传必须用户显式授权，上传前可见、可拒绝。
- **必须有本地降级路径**：云端不可用/未授权/超配额 ⇒ 回退纯本地结果，永不阻断主链路（现由 `review_text_filter` 的降级链与 `ai_refine_task` 的纯文本降级承载）。
- **上传最小化**：只传完成本次理解所必需的最小内容（现由精修切片与文本复核批次承载）。
- **凭据与隐私**：密钥走 DPAPI 凭据库（ADR-016），审计留痕（`ai_guardrails`）。

⇒ **本 ADR 退役 ≠ 本地优先红线放松**。红线全文见 `AGENTS.md` §4 与规格 §3。

### 未随本批删除的残留（登记，给批 8）

`app/src-tauri/src/ai_protocol.rs` 里 `AiEnhanceRequest` / `AiEnhanceResponse` / `AiResponseContent` / `AiNode` / `AiRequestType` 等类型在删掉 `enhance` 后已无生产消费者，但该文件**与活的 REQ-085 文本复核共用**（`TextFilterRequest/Response/Decision/Action`）⇒ 不为删半边而切一个共用的 17 用例协议文件；登记给**批 8（治理收口）**。
```

- [ ] **Step 3: 索引与交叉引用同步**

1. `docs/adr/README.md:17`：`| ADR-010 | [补缝式 AI（Gap-filling AI）：…](./ADR-010-gap-filling-ai.md) | 已接受 | 2026-08-18 |` → 状态单元格改 **已废弃**，并在日期单元格后补「（2026-09-11 退役修订）」或改日期列为 `2026-08-18 / 修订 2026-09-11`（**保持 4 列**，否则表结构漂移）。
2. `docs/adr/ADR-033-…md:250`：「**ADR-010 修订为退役**属**批 1**」→ 「**ADR-010 修订为退役** —— ✅ **批 1 已落（2026-09-11）**，见其「退役修订」节」。
3. `docs/adr/ADR-033-…md:259`：`- [ADR-010](./ADR-010-gap-filling-ai.md)：补缝式 AI —— 待批 1 修订为退役` → `- [ADR-010](./ADR-010-gap-filling-ai.md)：补缝式 AI —— **已废弃（2026-09-11 退役修订；本地优先/授权/降级条款仍生效）**`。
4. `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` §14 文档表：`| \`docs/adr/ADR-010-gap-filling-ai.md\` | **修订为退役** |` → 补「✅ 批 1 已落（2026-09-11）」。

- [ ] **Step 4: 需求池同步（文档必须与代码一致，AGENTS.md §6）**

`docs/product/requirements-pool.md`（属 AGENTS.md §10「额外审查」目录）：
- `:76` REQ-055（补缝式 AI 前置）：状态列 `已实施（M8）` → `**已退役（2026-09-11，批 1 删除；ADR-010 转已废弃）**`；备注列保留历史，并补一句「实现（判定器/协议/mock/三命令）已于批 1 删除，见 ADR-010「退役修订」」。
- `:537` REQ-056（补缝式 AI 实装）：备注「复用 REQ-055 协议与 mock」→ 补「⚠️ REQ-055 的实现已于批 1 删除 ⇒ 若重启，需按 ADR-023 的图片理解通道重新设计，不再复用已删协议」。
- **不改** REQ-050 / REQ-053 / REQ-135 / REQ-201 里对「AI 补缝」的历史性提及（那是各版本当时的记录）；只有**声称"已实施且依赖被删实现"**的两行必须改。

- [ ] **Step 5: 门禁 + 提交**

```powershell
node scripts/docs-check.mjs            # 期望 exit 0（链接完整 + 索引覆盖完整）
node scripts/line-limits.mjs --full    # 期望 exit 0（本任务不碰 SCAN_DIRS）
node scripts/check-command-registry.mjs
git add docs/adr/ADR-010-gap-filling-ai.md docs/adr/README.md docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md docs/product/requirements-pool.md docs/superpowers/specs/2026-09-11-frontend-redesign-design.md
git commit --only -m "docs(adr): ADR-010 修订为退役并同步索引与需求池" -- docs/adr/ADR-010-gap-filling-ai.md docs/adr/README.md docs/adr/ADR-033-l1-primitives-and-view-layer-contract.md docs/product/requirements-pool.md docs/superpowers/specs/2026-09-11-frontend-redesign-design.md
```

**Verification**

| 命令 | 期望 |
|---|---|
| `node scripts/docs-check.mjs` | `✅ 相对链接全部有效` + `✅ 索引覆盖完整` + `✅ docs-check 通过` |
| `Select-String -Path docs\adr\README.md -Pattern 'ADR-010'` | 1 命中，且该行含 **已废弃** |
| `Select-String -Path docs\adr\ADR-010-gap-filling-ai.md -Pattern '退役修订'` | ≥1 命中；文件**仍存在**（`Test-Path` = True） |
| `Select-String -Path docs\adr\ADR-010-gap-filling-ai.md -Pattern '仍然生效'` | ≥1 命中（红线切割节存在） |
| `cd app; npx vitest run` / `cargo test --test app_lib_tests` | 与任务前相同（本任务零代码改动） |

**Rollback:** `git revert <commit>`。

---

### Task 11: 收口（豁免表终态 · 规格进度标记 · 交付记录 · 全门禁 · 后续登记）

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§9 汇总复核 · §10 批 1 行进度标记 · §11 验收 7 的进度注 · §13 风险表的「删命令删到活代码」缓解栏）
- Modify: `docs/versions/v0.22.md`（**交付记录**追加「批 1」节）
- Modify: `docs/standards/line-limit-exemptions.md`（若前序任务的 `--write` 已到位则**不再改**；本任务只复核）
- Create（**不入库**）: `.superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions/progress.md`（批次台账 · 最终版）

**Why:** 规格 §10 的批次表与 §11 的验收口径是本系列的**单一事实源**；批 0-D 收口时已在 §5 与 §10 写过落地状态 ⇒ 批 1 必须照同样的体例写一次，否则「规格说待做、代码已做完」会在批 2 开工时误导下一位实施者。`docs/versions/v0.22.md` 的「交付记录」节写明「逐批追加」。

- [ ] **Step 1: 全门禁一次性复核（串行；原始输出落 `tmp/final-*`）**

```powershell
$S = ".superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions"
node scripts/check-command-registry.mjs *> "$S/tmp/final-registry.txt"
node scripts/line-limits.mjs --full     *> "$S/tmp/final-linelimits.txt"
node scripts/docs-check.mjs             *> "$S/tmp/final-docscheck.txt"
Push-Location app; npx tsc --noEmit *> "../$S/tmp/final-tsc.txt"; npx vitest run *> "../$S/tmp/final-vitest.txt"; Pop-Location
Push-Location app/src-tauri; cargo build 2> "../../$S/tmp/final-build.txt" | Out-Null
cargo test --test app_lib_tests 2> "../../$S/tmp/final-rust.txt" | Out-Null; "rust exit=$LASTEXITCODE"; Pop-Location
Select-String -Path "$S/tmp/final-registry.txt"    -Pattern '命令注册一致'
Select-String -Path "$S/tmp/final-linelimits.txt"  -Pattern 'line-limits'
Select-String -Path "$S/tmp/final-rust.txt"        -Pattern 'test result:'
Select-String -Path "$S/tmp/final-vitest.txt"      -Pattern 'Test Files|Tests '
git status --short
```

**期望（本批终态）**：

| 门禁 | 终态 |
|---|---|
| `check-command-registry.mjs` | `✅ 命令注册一致：定义 312 / 注册 312 / 重复 0` |
| `line-limits.mjs --full` | exit 0；`>600 硬限 0（棘轮内）· 301–600 档 **123**（比开工前 **−2**）· 登记条目 **123**`　⛔ **2026-09-12 收口更正：原文写「124（−1）」——实测 123**（开工 125 起：`commands_ai.rs` 回落 ≤300 整行移除 = −1；Task 3 删掉 `artifact_templates_tests.rs` = −1 ⇒ **共 −2**） |
| `docs-check.mjs` | exit 0 |
| `npx tsc --noEmit` | 0 错 |
| `npx vitest run` | `VITEST_BEFORE` **−1 用例**（仅 Task 9 的删除） |
| `cargo test --test app_lib_tests` | **`2308 passed / 0 failed / 6 ignored`**（**2026-09-12 更正**：原写 2343） |
| `cargo build` warning | ≤ `CLIPPY_BEFORE` |
| `git status --short` | 只剩历史遗留的 `?? docs/tech-debt/`、`?? tmp/`、以及并行 agent 的文件（**本批不碰**） |

- [ ] **Step 2: 复算「删除后还剩几条未接线」并写进台账**

```powershell
git show --stat --oneline HEAD~N..HEAD | Select-String 'app_commands.rs'   # 本批 8 个删除提交的注册面改动
# 复跑 §现状普查第一节的内联脚本；期望头行从 334 47 变为 312 25
```
期望：**312 注册 / 25 条前端零引用**（47 − 22）。这 25 条的处置 = §现状普查第三节里「不动」的全部行（补 UI 12 · 登记不排期 7 · 撤下 IPC 3 · 有意保留 3），逐条在台账里点名归属批次。**规格 §11 验收 7「47 条逐个有结论」在本批达成 22/47，余 25 条结论已写定、执行归批 7。**

- [ ] **Step 3: 规格进度标记（照批 0-D 的体例）**

1. §10 `:515` 批 1 行：在「内容」列后补 `**✅ 已落（2026-09-11，批 1）**`，并把验收列写真：`注册表 334→312（22 条）；cargo test 2308/0/6 全绿；ADR-010 已废弃；structuredBlocks:63 死文案已清`（**2026-09-12 更正**：原写 `2343/0/6`）。
2. §10 表下补一行归属注（与批 0 那条 ADR 归属注同体例）：`| ↳ 批 1 的收口（批 1 完成时更新） | **22 条命令已删**（规格原写 21 + #41 \`open_capture_float\` 改判）· **补缝三连连带模块已删**（\`ai_judge\` + \`AiMockAdapter::enhance\`，−26 用例〔**2026-09-12 更正**：原写 −16；实际含 `ai_protocol.rs` 的 `AiEnhance*` 半边 10 条〕）· **ADR-010 已废弃** · **\`structuredBlocks\` 死文案已清**（整模块存废登记给批 7） | — |`
3. §11 验收 7 下方补进度注：`> **进度（2026-09-11 批 1）**：47 条中 **22 条已删**、**25 条处置已定但未执行**（补 UI 12 → 批 7 · 登记不排期 7 → 批 7/无期 · 撤下 IPC 3 → 批 7 · 有意保留 3）。无「不知道」。`
4. §13 风险表「删命令删到活代码」行的缓解栏：`**每条删除前重新确认调用方**（一次 grep）` → 补实测结论：`**每条删除前三向复核（前端字面量 / 前端测试 / Rust 调用形态）；本批 22 条全部为空**（机械口径见批 1 计划 §现状普查；⚠️ \`includes()\` 子串判定会误判，实测 \`"auto_refine_session"\` 含 \`refine_session\`、\`"finish_photo_session"\` 含 \`finish_session\`）`。

- [ ] **Step 4: `docs/versions/v0.22.md` 交付记录追加「批 1」节**

在「### 批 0 其余部分（未落地）」之后（或交付记录节末尾）追加，体例照批 0-A/0-B：**交付**（22 条命令 + 连带模块 + 26 用例〔**2026-09-12 更正**：原写 16 用例；另含 `ai_protocol.rs` 的 `AiEnhance*` 半边 10 条〕 + 文档）+ **验收**（四条门禁的确切数字）+ **规格漂移纠正清单**（见本计划文末「规格漂移」节，逐条抄入）+ **过程中纠正的计划错误**（由实施者/评审者实测抓出的，逐条列出）+ **未做（登记）**。

- [ ] **Step 5: 批次台账 `progress.md`（不入库）+ 提交**

`.superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions/progress.md` 必含：范围与用户裁决（含 `open_capture_float` 改判与 `structuredBlocks` 边界）+ 22 条删除清单与 `文件:行` + 47 条处置总表 + 各任务 commit 号 + 门禁前后对照 + **控制方数字与本计划数字的并列与差异原因**（不得只留一个）+ 未验证项清单。
`docs/` 三处改动的提交：

```powershell
git add docs/superpowers/specs/2026-09-11-frontend-redesign-design.md docs/versions/v0.22.md
git commit --only -m "docs(spec): 批 1 收口——进度标记与交付记录" -- docs/superpowers/specs/2026-09-11-frontend-redesign-design.md docs/versions/v0.22.md
```

**Verification**

| 命令 | 期望 |
|---|---|
| `node scripts/check-command-registry.mjs` | `定义 312 / 注册 312 / 重复 0` |
| `node scripts/line-limits.mjs --full` | exit 0 · `301–600 档 **123**` · `登记条目 **123**`（比开工前各 **−2**）　⛔ **2026-09-12 收口更正：原写 124 / 「各 −1」** |
| `Select-String -Path docs\versions\v0.22.md -Pattern '批 1'` | ≥2 命中（批次表 + 交付记录节） |
| `Select-String -Path docs\superpowers\specs\2026-09-11-frontend-redesign-design.md -Pattern '已落（2026-09-11，批 1）'` | 1 命中 |
| `git log --oneline --since=<开工时间> -- app/src-tauri/src/app_commands.rs` | **8 个提交**（T1–T8 各一），无裸 `git commit` 造成的连带路径 |
| `git log --diff-filter=D --oneline -- app/src-tauri/src` | 本批新增的删除提交**只含**：`commands_artifacts.rs` / `ai_judge.rs` / `ai_judge_tests.rs` / `ai_mock_tests.rs` 四个文件　⛔ **2026-09-12 收口更正：实际 10 个** = 上述 4 个 ＋ T3 扩大删除面新增的 6 个（`artifact_templates.rs` / `artifact_templates_visual.rs` / `artifact_templates_voice.rs` / `artifact_templates_tests.rs` / `narrative_detect.rs` / `narrative_detect_tests.rs`）；实测命令 `git diff --name-status --diff-filter=D e96ab63d HEAD`，清单见「收口回写」节收口六 |

---

## 完成本批后的状态

- **IPC 注册面 334 → 312**（净删 22 条），`app_commands.rs` 与命令定义侧三向一致（`scripts/check-command-registry.mjs` 机器守）。
- **补缝式 AI 在代码层清空**：三条命令 + `ai_judge` 判定器模块 + `AiMockAdapter::enhance` + `ai_protocol.rs` 的 `AiEnhance*` 半边，连带 **26 条 Rust 用例**（**2026-09-12 更正**：原写「16 条 /（2359 → 2343）」；实际 T4+T5 合并单元 **2334 → 2308 = −26**（−16 = 9+7 · −10 = AiEnhance 侧），精确下降、无附带损失；批内另有 Task 3 的 −25）。
- **ADR-010 转为「已废弃」**，文件保留、索引与 2 处交叉引用同步；**退役节显式切割**「补缝式 AI 形态」与「本地优先/AI 授权/降级红线」，8 条引用它的 ADR 不产生悬空主张。
- **规格与需求池同步**：§9 `open_capture_float` 改判（待核实 → 删）、汇总 21 → 22、§10 批 1 进度标记与归属注、§11 验收 7 的进度注、§12 该行结清、§14 ADR 行落地、REQ-055/056 状态改写。
- **死文案清理**：`structuredBlocks.ts:63` 的 `"AI 增强待 V1.0"` 与 `aiPlaceholderLabel()` 及其 1 条测试消失；**整模块存废留给批 7**（控制方裁决），本批不越权。
- **行数治理**：豁免表 301–600 档从 **125 → 124**（`commands_ai.rs` 388 → ~291 回落出档），其余受影响文件数值全部刷新到实测值；`--full` 的 (e) 断言在本批每一次提交的**提交树**上都成立。
- **界面零变化**：本批唯一的界面侧改动是删除一个从不被生产代码调用的函数与其断言。

## 未做（登记 · 每条带归属批次）

| 项 | 归属 | 说明 |
|---|---|---|
| `structuredBlocks.ts` **整模块**存废（连同 `.ed-low-confidence`） | **批 7（未接线落地）** | 二选一：**(a) 接线**（用真实置信度数据渲染「低置信点线」——规格 §4.1 `--due` 行点名它是 token 消费场景；4 个导出全部接入）；**(b) 删除**（连同类名与规格/登记表一并移除）。**批 7 未决之前不得删**（控制方 2026-09-11 裁决） |
| `ai_protocol.rs` 的 `AiEnhance*` 半边（`AiEnhanceRequest` / `AiEnhanceResponse` / `AiResponseContent` / `AiNode` / `AiRequestType`） | **批 8（治理收口）**　⛔ **2026-09-12 控制方裁决：本行已被推翻——该项已在批 1（`fd9dd8f9`）删除** | 删掉 `enhance` 后已无生产消费者，但与活的 REQ-085 文本复核共用文件 ⇒ 不为删半边切一个 17 用例的共用协议文件。**2026-09-12 更正**：保留该半边必然新增 8 条 `dead_code`，使本批收口门禁不可达绿 ⇒ 实删 8 符号 + 10 条测试；`TextFilter` 半边与其 7 条测试**逐字节保留**。见 §四·3 表下注记 |
| `video_profile_spec::spec_from_kind()` | **批 7（档位通道）**　⛔ **2026-09-12 收口更正：本行已被推翻——该符号已在批 1（`86136294`）删除** | 原文「只剩自有 2 条测试引用 ⇒ 属待接线」**被实测证伪**：其唯一生产消费者就是被删命令体（`commands_video.rs:360`），保留必然 +4 条 `dead_code` ⇒ 与 Global Constraints 冲突；控制方裁决 **B-full** 删除（连同 `default_tier` / `ocr_tags_to_domain` / `ProfileMemory::remember`）。**若批 7 的档位通道需要旧档案映射读端，请按新需求重新设计，不要从历史里"恢复"**（取回：`git show 86136294^:app/src-tauri/src/video_profile_spec.rs`） |
| 25 条「处置已定但未执行」的命令（补 UI 11 + 档位读端 1 + 登记不排期 7 + 撤下 IPC 3 + 有意保留 3） | **批 7**（有意保留的 3 条**无期**） | 逐条清单见 §现状普查第三节 |
| REQ-201 的记录修正（`update_fragment_group` 声称已接线但实际无调用方） | **批 7** | 规格 §14 已登记；与「补 UI」同批。✅ **2026-09-12：需求池那一半已由 Task 10 落地**（`requirements-pool.md` REQ-201 状态改「部分回退」+ 实证备注）；批 7 仍需决定该命令接线或删除 |
| `ASR_REQUEST_TIMEOUT` 的删除（计划外连带，`f74ff551`） | **登记（无期）· 重引入触发条件见右** | 删 `commands.rs::transcribe_audio` 后其**唯一**消费者消失 ⇒ 成死常量并被删（`engine.rs:25-28`，60s，与 `ASR_FILE_TIMEOUT` 不同物）。**取回**：`git show f74ff551^:app/src-tauri/src/engine.rs`。**触发条件**：「短请求 ASR 需要 <30min 级超时」的需求出现时，**有意识地重新引入**，而不是被重新发现（实施者当时**未能证伪**它属"待接线预留"，故登记为待议） |
| 旧单 provider 凭据槽 `"default"` 从此**无任何 IPC 写/清路径** | **处理 AI 凭据的批次**（产品裁决；建议与批 7/批 8 的产品文档 pass 同批） | `command_ai_settings` 三连删除后，`commands_ai_providers.rs:237` 与 `app_setup.rs:183-185` 的写/清全部改用 `provider_scope(id)` ⇒ 旧密钥**在应用内永久不可撤销**（读兜底与启动迁移仍在，前端本就 0 引用；**非回归、非状态搁浅**）。正解 = **新增**一条 provider 通道的「清理遗留 scope」命令，**不是**恢复旧命令 |
| VAD 写端（`VadThresholdSlot::publish`，`live_session_loop.rs:195` 调用）**当前 0 测试覆盖** | **批 7 或「VAD 诊断」相关批次（可选项）** | T6 删掉的 4 条测试**同时**是 `publish` 的唯一测试 ⇒ 写端覆盖降为 0（读端已删，语义不可观测，属授权保留）。若将来重新引入读端/诊断命令，**同批补一条 `publish` 侧测试** |
| `artifact` 行**已无任何新建路径**（`build_session_artifact` 删除后） | **登记（无期）· 与批 7 的产物判定同批** | `run_refine` 只向**已存在**的行合并（`commands_refine_inner.rs:107-119` 在 `get_artifact` 为 `None` 时**静默丢弃**升级块）⇒ **refine 链剩余的存在理由只对「历史产物行」成立**；无用户可见回归（创建者本就 0 个前端调用者、产物视图已下线、历史行仍经 `get_session_detail` 渲染）。**批 7 若判定产物体系整体退役，须先处理历史行** |
| `commands_video.rs:279` 的 `@param form - …（非法值 → 仅记 kind 兼容字段）` 与实现不符 | **登记（无期）· 纯注释** | 实现在非法值时直接 `Err("非法形态标识: …")`（`:291-292`）；该行**在批 1 之前就存在**，不是本批引入。修法 = 改写这一句注释（1 行事务） |
| `requirements-pool.md` REQ-050 / REQ-052 / REQ-053 的**功能级**陈旧表述（「走 AI 补缝（V1.0）」「五档案模板 + 产物视图 + 落笔记」「低置信/AI 占位样式」） | **产品文档 pass（建议与批 7 同批）** | Task 10 已把**点名已删符号**的行改真（REQ-055/056/135/193/201）；这三条不点名符号，属**产品功能级**状态重写 ⇒ 删除批不做产品功能改写，登记待办 |
| ⚠️ **「23 条警告 ≠ 新死符号全集」**：`dead_code` 不覆盖 crate 根可达的 `pub` 项，也不覆盖 **serde 派生掩蔽、只在测试里构造**的项 | **登记（跨批纪律）** | Task 3 实测：`artifact.rs` 的 14 个 `ArtifactKind` 变体 + 6 个 `BlockPayload` 变体**零诊断孤儿化**，但它们是 `artifact_blocks.kind`/`payload_json` 的**持久化格式契约**，删除会让历史行读取失败 ⇒ **绝不可删**。已在 `artifact.rs` 模块头写入声明（收口补），后续删除批**必须另做 `pub` 面 + 持久化契约面可达性分析** |
| `capabilities/*.json` 的自定义命令 ACL | **无（本批已复核为空）** | 实测 `app/src-tauri/capabilities/{default,float,overlay}.json` 对 22 条命令名 0 命中 ⇒ 无需改动（复核结论写进 Task 11 台账） |
| 真机 IPC 冒烟（22 条删除后逐条确认「不再可达」） | **无（按 0-C3 先例主动跳过）** | `docs/standards/line-limit-exemptions.md:207` 记载 2026-09-11 用户裁决「本批真机冒烟跳过验证」⇒ 本批的等价性依据是**静态证据链**（三向引用为空 + 注册面门禁三向一致 + 编译期路径解析）。⚠️ **这是本批最大的未验证面，必须在报告与台账里如实登记**；若后续批次（批 3 起会动壳层）需要真机结论，应重新派发一次真机验收，**不要沿用「已跳过」** |
| `open_capture_float` 的删除对浮窗首开路径的**运行态**影响 | **批 3（壳层落地）真机走查时顺带覆盖** | 静态证据：开路径 = `float_toggle` → `float_toggle_core` → `FloatAction::Open => float_open_core`（`:250`）+ 启动期 `precreate_float`（`app_setup.rs:319`），删掉的只是同义包装层 |
| ⚠️ 本批**没有**为「命令名不得重回注册面」加任何棘轮守卫 | 登记（无期） | 与 0-B 的 `no-inline-svg` 棘轮不同，本批没有天然的「只许减少」判据（新命令会合法新增）⇒ 依赖 `check-command-registry` 的三向一致 + 代码评审 |

## 规格漂移（本计划实测发现，逐条给证据）

> 判据：**代码与实测优先于规格文本**。除第 1、2 条需在 Task 8 / Task 10 回写规格外，其余记录在案即可。

1. **§9 汇总「删 21 … 待核实 1」与 §10 批 1 行「21 条命令」** —— 控制方 2026-09-11 结清 `open_capture_float`（前端 0 调用者；活路径 `float_toggle` + `close_capture_float`；`float_open_core` 仅 `:250` 与 `:269` 两个调用点）后应改为 **删 22 / 待核实 0**。**回写位置**：规格 `:493` / `:501` / `:515` / `:558`（Task 8 Step 3 + Task 11 Step 3）。
2. **§9 `:505`「删除的通用影响面：仅 `lib.rs` 的 `generate_handler!`」** —— **两处过时**：① 注册清单**已不在 `lib.rs`**，批 0-C3 Task 1（提交 `c409a956`）把它整体搬到 `app/src-tauri/src/app_commands.rs`（`git log -S "crate::commands::transcribe_audio" -- app/src-tauri/src/app_commands.rs` 只有那一个搬入提交）；② 真实影响面**不止注册清单**：整模块删除要动 `lib.rs` 的 `mod` 声明、行数变化要刷 `docs/standards/line-limit-exemptions.md`（否则 `--full` 的 (e) 当场拦提交）、补缝三连还有**模块级连带死代码**（同一行的后半句已自认此例外）。
3. **§9 `:505`「单测全为 `#[cfg(test)]` 内联且不引用这些命令」** —— 对**命令符号**成立（实测：22 条命令名在全部 `*.rs` 测试文件中 **0 命中**），但**连带模块的测试必须同删**：`ai_judge_tests.rs` **9 条** + `ai_mock_tests.rs` **7 条** = **16 条**，另加 `ai_protocol_tests.rs` 的 AiEnhance 侧 **10 条** = **26 条** ⇒ `cargo test --test app_lib_tests` 由 **2359 → 2334**（Task 3，控制方扩大删除面）**→ 2308**（Task 4+5）。本计划把这个数字写死为 Task 5 的验收判据（**2026-09-12 更正**：原写「16 条 ⇒ 2359 → 2343」，目标值应为 **2308**；规格未给该数字）。
4. **§2 的 `[DEAD]` 污染警告成立，且污染是双向的** —— ① 「被测试引用 ⇒ 误判为活」的实例：`ai_judge` 模块与 `AiMockAdapter::enhance`（唯一生产消费者都是被删命令，却被各自的 `*_tests.rs` 引用）；② 「汇总结论把活的算成死的」的实例：`docs/tech-debt/review-2026-09-11.md` 称相关有「18 个死运行时导出」，控制方抽查即发现反例 —— `relativeLuminance` **11 处总命中 / 6 处非测试 ⇒ 活的**（另有 `parseNoteTags` 2/2 疑似死、`orderedBlockFrames` 1/1 死、`systemKindLabel` 1/1 死）。⇒ 本计划**不采用**任何「N 个死导出」的汇总结论，只采用**逐条三向复核**的结论。
5. **§9 `:493` 的「待核实」是本批唯一一条被改判的处置** —— 其余 46 条的成员与分类与代码实测**逐条一致（0 漂移）**：计划者用官方逐行解析复算得「前端生产零引用 = **47**」，与规格 §9 的 47 条**成员完全相同**。
6. **控制方普查「45 条」与计划者「47 条」并列（不静默取一个）** —— 差异已定位：控制方探针用 `String.includes()` 判活（`"auto_refine_session"` 含 `refine_session`、`"finish_photo_session"` 含 `finish_session` ⇒ 2 条被误判为活），并用 `crate::mod::name` 两段正则在 `generate_handler!` 块体上取名字（三段路径 `crate::commands_goals::views::list_goals` 会被读成假命令名 `views`，同类还有 `milestones ×7` / `workbench ×1` ⇒ 死数虚高）。**正确口径**：官方逐行解析（清单条目必须以 `,` 结尾、路径必须匹配全路径正则，IPC 名取**末段**）+ 引号定界字面量匹配。
7. **§10 `:515`「清理 `structuredBlocks.ts:63` 死文案」的落点比规格更宽也更窄** —— 宽：`:63` 只是函数体一行，实际要删的是整个 `aiPlaceholderLabel()`（`:61-64`）+ 模块头 `:5` 的措辞 + 测试 3 处（`:8` / `:82` / `:92`）；窄：**整模块（64 行 / 4 导出 / 唯一 importer 是自身测试）不在批 1 范围**（控制方裁决，理由见 Task 9）。
8. **规格文本自身在并行变动** —— 计划者首读时 606 行，Task 编写时实测 **610 行**（§11 验收 5 已被批 0-D 追补为「基类名单 + 动画落点名单」判据）。⇒ 本计划所有「规格 `:NNN`」只作**导航用**，实施者**必须先用内容锚定位**再改（例如按 `| 41 | \`open_capture_float\` |` 定位），并在报告里记下**实际改动的行号**。

## 自审记录

**规范覆盖（逐条对照规格 §10 批 1 行的四项交付 + §11 验收 7）**：
- 「21 条命令」→ **Task 1–8 删 22 条**（含控制方改判 1 条），逐条 `文件:行` 见 §四；注册面 334 → 312。
- 「补缝三连连带模块」→ **Task 4（命令）+ Task 5（模块级死代码）**（**2026-09-12 实况**：两者合并为一次提交 `fd9dd8f9`）；规格 §9 `:505` 自认的「唯一例外」被具体化并给出删除判据与 **26 条**用例的精确账（**2026-09-12 更正**：原写 16 条 —— 16 = 9+7 属 T5 本体，另 10 条属 `ai_protocol.rs` 的 `AiEnhance*` 半边）。
- 「ADR-010 修订」→ **Task 10**（文件保留 + 状态改「已废弃」+ 退役节 + 索引 + 2 处交叉引用 + 需求池 2 行 + 规格 §14 行）。
- 「清理 `structuredBlocks.ts:63` 死文案」→ **Task 9**（严格照字面 + 控制方边界裁决）。
- §11 验收 7「47 条逐个有结论」→ §现状普查第三节给出 **47/47 的处置表**（本批执行 22 · 其余 25 条归属点名）；Task 11 Step 2 复算删除后余量并要求写进台账。

**占位符扫描**：无 TBD / TODO / 「类似 Task N」；每条命令的删除位置、注册行、连带 helper、期望计数、门禁命令与提交信息**逐条写出**。计划里**唯一需要实施者实测判定**的两处已显式标注：① Task 2 的 `CONTENT_MAX_CHARS` 是否随 `save_draft_as_note` 成死常量（给了判据命令与「若为 0 则一并删」的处置）；② 各文件删除后的**最终行数以 `--write` 实测为准**（给了预算值用于交叉核对，差 >5 行必须查原因）。

**类型/标识一致性（跨任务交叉检查过）**：`REGISTRY_AFTER` 序列 334 → 331（T1）→ 327（T2）→ 324（T3）→ **321（T4+T5 合并为一次提交 `fd9dd8f9`；T5 不删命令）** → 317（T6）→ 313（T7）→ 312（T8），与 §四清单的 22 条一一对应（实测链 334 → 331 → 327 → 324 → **321**，一致）；`RUST_AFTER` 在 T3 与 T4+T5 两处变化（**2359 → 2334**（T3，−25）**→ 2308**（T4+T5，−26 = 9+7+10）；**2026-09-12 更正**：原写「只在 T5 变化（2359 → 2343，−16 = 9 + 7）」）；`VITEST_AFTER` 只在 T9 变化（−1）；豁免表动作只有三种（**数值更新** / **整行删除** / **不变**），与 §五逐文件对应；三个「同名不同物」的陷阱（`recognize_image` / `transcribe_audio` / `profile_by_kind`）在 §四「不删清单」与 Task 2 / Task 7 的复核步骤里各拦一次。

**删除批特有的一次性风险（本计划已全部显式化）**：① 注册面是**唯一静默失败面** ⇒ 每个任务 Step 1 的三向复核 + 门禁三向一致；② 行数登记表是**共享生成物** ⇒ 统一走 `--write`，禁止手改数字，`--full` 在**提交树上**判；③ 并行 agent ⇒ T1–T8 串行、T9/T10 可并行、禁 `git add -A` / `git clean` / 裸 `commit`；④ 测试数**下降是预期**而非回归 ⇒ 每个任务把「允许降多少」写死（**2026-09-12 实测更正：T3 = 25（控制方扩大删除面）· T4+T5 = 26（原写 T5 = 16）· T9 = 1，其余 0**）；⑤ 加载敏感的 `ffmpeg` 用例 ⇒ 串行跑门禁 + 单跑复核。

**报告与评审的落点（每个 Unit 一对一）**：实施者报告 `.superpowers/sdd/2026-09-11-frontend-redesign-batch1-deletions/task-<N>-report.md`；独立任务评审报告同目录 `task-<N>-review.md`。**11 个 Task = 11 个实施者 Unit（T9 / T10 可与 T1–T8 并行）+ 11 份独立任务评审**，分别照 `.superpowers/sdd/DISPATCH-TEMPLATE.md` 与 `.superpowers/sdd/REVIEW-TEMPLATE.md` 执行 —— 本计划**不复制**那两个模板的条文。**评审者特别检查项**：删除清单是否**恰好**是 §四的 22 条（多删/少删都是失败）· 「不删清单」里的每一项是否**仍在** · 期望计数是否与实测一致 · 豁免表 diff 里有无非本批文件的行（若有，是否已在报告里如实归因）。
