# 批 2 包体治理实施计划（`manualChunks` + 按页动态 import + 首屏 gzip 达标或瓶颈清单）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `app/` 生产构建的**首屏 JS gzip** 从实测 **654.72 kB**（单一 chunk、零代码分割）降到 `docs/standards/performance.md:28` 的既有预算 **< 200 kB**；若控制方裁决否掉唯一能达标的路线，则按规格 §10 允许的另一半交付 —— **一份带实测读数、复现命令与归属批次的「包体瓶颈清单」**。

**Architecture:** 本批**只动三个面**：① `app/vite.config.ts` 的 `build.rollupOptions.output.manualChunks`（vendor 分组 + 为批 6 预留 GSAP 独立 chunk 槽）；② `app/src/App.tsx` 的**模块加载边界**（9 个静态页面 import → 按页动态 import + **首访挂载保活**；两个窗口变体与全局对话面板同样改为按需）；③ 新增两个**纯函数/脚本**交付物（`app/src/build/manualChunks.ts` + `scripts/check-bundle-budget.mjs`），让「首屏 gzip」与「GSAP 独立 chunk」从形容词变成机器判据。**不新增任何依赖、不改任何 Rust、不迁移任何原语调用点、不重构 `app/src/ui/primitives/**`。**

**Tech Stack:** Tauri 2 · React 19.1 · TypeScript 5.8（`strict`，禁 `any`）· Vite 7.3.6（`build.rollupOptions`）· Vitest 4（全局 `environment: "node"`）· Node 24（`scripts/*.mjs` 门禁）

**Spec:** [2026-09-11-frontend-redesign-design.md](../specs/2026-09-11-frontend-redesign-design.md)（§2 现状基线「包体」行 · §3 红线 2「不引入路由库」· **§10 批次划分批 2 行** · §11 验收口径第 9 条 · §13 风险表「包体继续膨胀」行）

**输入材料（开工前五份，优先级即此序）**

1. **本计划的 §实测基线**（计划者在 `dev@f12aba6d` 实跑 `npm run build` + 两个探针得到的全部读数；**下游任何任务都不得引用规格 §2 的 651.25 kB —— 那是过期快照，实测是 654.72 kB**）
2. `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/`（探针原始输出：`build-before.txt` · `probe-pkg.txt` · `probe-eager-graph` 与 `probe-route-ceiling` 的脚本与输出；**该目录不入库**）
3. 规格对应节（§2 / §10 / §11 / §13 / §14）与 `docs/standards/performance.md`（预算真源）
4. `.superpowers/sdd/DISPATCH-TEMPLATE.md`（实施者纪律）· `.superpowers/sdd/REVIEW-TEMPLATE.md`（评审者纪律）
5. 兄弟计划 [2026-09-11-frontend-redesign-batch1-deletions.md](./2026-09-11-frontend-redesign-batch1-deletions.md) —— **必读它的「收口回写」节**（该节是批 1 用五次证伪换来的方法论，本计划的「连通性判据」「仪器自检」「提交纪律」三节全部从它派生）

---

## Global Constraints

- **本批范围（控制方 2026-09-12 交办 + 规格 §10 批 2 行）**：`manualChunks` · 按页动态 import · 量首屏 gzip · **产出瓶颈清单** · 为批 6 预留 GSAP 独立懒加载 chunk 槽（**不装 GSAP**）。
- **★ 本批的四个非目标（违反即任务失败）**
  1. **不装 GSAP**（批 6 才装）。本批只让「批 6 装了之后 GSAP 必然落进自己的懒加载 chunk」这件事**机器可证**（Task 5）。
  2. **不动 `app/src/ui/primitives/**`**（批 0-D 交付的 L1 层，42 个文件，契约见 ADR-033）。本批一个字节都不改它，也不以它作为前端基线计数依据。
  3. **不改运行行为、不改界面**：业务逻辑、渲染结果、Tauri 调用面一律不变。**既有 vitest 测试必须逐条原样通过（0 处断言修改、0 处新增 `await`、0 处改 mock）**。唯一被允许的「行为差异」是 Task 6–8 的**首访挂载时序**（见下条待裁决项），且**必须由控制方书面裁决后才可落地**。
  4. **不碰任何 Rust 代码**（`app/src-tauri/**` 本批只读；`cargo test` 只作门禁，不作改动对象）。
- **★ 控制方待裁决项（本批唯一的前置阻塞；未裁决前 Task 6 不得开工，Task 1–5 / 7–12 不受阻）**
  「按页动态 import」在本仓**不是**套一层 `React.lazy` 就成立：`app/src/App.tsx` 今天**静态 import 了全部 9 个页面**（`:20-34`），并在 `<main>` 里**同时渲染全部 9 个**（`:311-419`，用 `display:none` 切可见性，`type Page` 联合在 `:47`）。所有页面永远被渲染 ⇒ **单纯 `lazy()` 不会推迟任何加载，首屏一个字节都不会降**。要真降，必须让未访问的页面**不被挂载**，而这改变了启动时序（今天 9 页在启动时各自跑首屏数据加载与事件订阅，改后推迟到首次访问）。两条路线与**实测上限**：

  | 路线 | 内容 | 首屏仍可达的应用源文件 | 首屏仍拉入的 npm 包 | 依赖 gzip 近似 | 能否达标(<200) | 代价 |
  |---|---|---|---|---|---|---|
  | **A · 叶级懒加载** | 只把**已经被条件渲染**的重组件改为 `lazy`：`NoteMarkdown` / `RichEditorView` / `ChatMessageMarkdown` / `KnowledgeCanvasView` / `KnowledgeGraphView` | 251 → **221** | 15 → **5** | **88.8** | ❌ **不能**（应用代码 221 个文件仍全在首屏） | **测试面风险**：`KnowledgePage.test.tsx`（同步 `getBy` ×6）· `NotesPage.test.tsx`（×7）· `NoteReadingView.test.tsx` 都直接渲染这些消费者，`lazy` 会让首帧挂起 ⇒ 可能需要加 `await`，**与「0 处断言修改」非目标直接冲突** |
  | **B′ · 页级 + 面板 + 两窗变体** | 9 页按页 `lazy` + **首访挂载保活**；`CaptureFloatPanel`/`CaptureOverlayPanel` 按窗口变体 `lazy`；`AiConversationDock` 首开挂载 | 251 → **47** | 15 → **4** | **64.1** | ✅ **能**（预估首屏 ≈ 105–135 kB） | **运行行为有变**：未访问过的页面在启动时不再挂载（其首屏数据加载与事件订阅推迟到首次访问） |
  | **B′ 被否时的兜底** | 只做 `manualChunks` + 窗口变体 + 对话面板（Task 7/8），页面级顺延给批 5 与「惰性挂载」一并做 | 251 → 251 | 15 → 4 | 64.1 | ❌ 不能 | 首屏 ≈ 250–300 kB ⇒ **按规格 §10 后半句交付瓶颈清单**，本批仍算成功 |

  **要求**：控制方在 Task 2 开工前给出书面裁决（写入 `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/progress.md`），二选一 —— 授权 **B′**（含对「不改运行行为」非目标的**显式改判**，因为二者不可兼得），或否掉 B′ 走兜底。**实施者不得自行选择**（批 1 已五次证明「计划自己拍板的范围决策会被现实证伪」，而这次涉及**页面挂载时序**，代价与批 1 的纯死代码删除不可同日而语）。无论选哪条，**Task 1–5 与 Task 9–12 照常执行**。
  > 若走 B′：**未保存原文不会丢** —— B′ 是「首访挂载 + 保活」，一旦页面被访问过就**永不卸载**（与今天 TD-004 的保活语义一致），因此「笔记编辑态切页丢稿」这一类风险**不在本批引入**（那是批 5「切视图先 flushSave」的范围，规格 §7.3 约束 3）。这一条必须由控制方在裁决时一并确认。
- **★ 达标定义（见下节 §达标定义；规格未给数字，本计划从既有标准文档取得并提请批准）**
- **行数红线（唯一有效口径）**：单文件 **≤300 行**（**全部行数，含空行**）。唯一有效口径 = `[System.IO.File]::ReadAllLines($p,[System.Text.Encoding]::UTF8).Count` == `scripts/line-limits.mjs` 的 `countLines()`。⚠️ **绝不使用**：`Get-Content`（本机 PowerShell 5.1 + 码页 `gb2312` 按 GBK 解码、**少算可达 56 行**，文档域实测少算 138 行）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数（末尾无换行的文件少算 1）。301–600 区间必须登记在 `docs/standards/line-limit-exemptions.md`；>600 必须硬拆。**本批只新增 3 个小文件 + 改 3 个既有文件，一律不得新增豁免登记**；`docs/standards/line-limit-exemptions.md` 里**只许调整已有行的数值**（由 `node scripts/line-limits.mjs --write` 生成，**不得手改数字**）。
- **改造后必须平齐的门禁基线（批 1 收口实测，`dev@f12aba6d`）**

  | 门禁 | 基线 |
  |---|---|
  | `node scripts/check-command-registry.mjs` | exit 0 · **定义 312 / 注册 312 / 重复 0** |
  | `node scripts/line-limits.mjs --full` | exit 0 · **`>600` 0 · 301–600 档 123 · 登记条目 123** |
  | `node scripts/docs-check.mjs` | exit 0 |
  | `cd app; npx tsc --noEmit` | exit 0（0 错） |
  | `cd app; npx vitest run` | exit 0 · **124 文件 / 1124 用例**（本批**只许持平**；任何下降都要 STOP 并报控制方） |
  | `cd app/src-tauri; cargo test --test app_lib_tests` | exit 0 · **2300 passed / 0 failed / 6 ignored**（本批不动 Rust ⇒ 必须逐字持平） |
  | `cd app/src-tauri; cargo clippy --all-targets` | exit 0 · **19 条，集合与开工基线 identical** |

  > **每个任务都必须以这六条全绿收尾**，不可「稍后一起跑」。本批改动**不碰 Rust**，故 `cargo` 两条**必须逐字不动**；一旦变动即说明改错了面。`ffmpeg::tests::run_captured_handles_large_output` 是**装载敏感偶发失败**（内含 10s 墙钟超时）⇒ 门禁**串行执行**，或单独复跑该用例再下结论。

  > **2026-09-12 更正（Task 12 回写）—— clippy 的判据只能是「集合」，不能是「sha256」**：Task 1 把开工基线冻结为 `.superpowers/.../tmp/clippy-baseline.txt`（**BOM + CRLF**，1724 B），而抽取器的输出是**无 BOM + LF**（1702 B）⇒ **比 sha256 会永远假红**（Task 3 实测 `F889CA71…` vs `76319132…`，**集合本身 19/19 逐行相同**）。⇒ 本表第四列「identical」一律理解为 **`诊断文本 @ 文件:行:列` 排序去重后的集合逐行相等**（Task 12 复跑：`baseline rows: 19 | now rows: 19 · only in baseline: 0 · only in now: 0 · SET-IDENTICAL`，比对器自检注入 1 条伪造诊断 ⇒ 报 1 处差异）。
- **⚠️ 判退出码的固定口径（PS 5.1）**：`cargo` 往 stderr 写 warning 时，`2>&1 | …` 会被 PS 5.1 包成 `NativeCommandError`，让**成功的命令报 exit 1**（`docs/versions/v0.22.md:156` 实测）。⇒ 原生命令一律 `2>file` 重定向或直接读 `$LASTEXITCODE`，**绝不 `2>&1 |`**；需要回看输出时**重定向到文件再读回**。
- **★ 仪器纪律（批 1「收口三」的四条硬纪律 + 本批新增第 5 条，逐条适用）**
  1. **任何「0 命中」结论必须点名仪器，并先证明该仪器能命中一个已知存在的串、且对无意义串报 0。**（批 1 实测 6 次假绿/假阴性。）本批每个「0 命中」型声明都必须附这样一对自检。
  2. **禁用裸 `includes()` / 子串 grep 判连通性**：用**引号定界字面量**或**正则词边界**。本批实测的同类陷阱就在眼前：`node_modules/react` 是 `react-dom` / `react-markdown` / `@xyflow/react` 的子串 —— 用它做 `manualChunks` 会把三个不相干的包并进 `vendor-react`，**直接破坏懒加载边界**（Task 3 有一条反例守卫专钉这条）。
  3. **`\b` 在全角 `）`（U+FF09）前永不匹配**；需要边界时用显式字符类（如 `(?<![A-Za-z0-9_])`）。
  4. **PowerShell 的 `-Include` 在没有 `-Recurse` 时不生效**：`Get-ChildItem "app\src" -File -Include *.tsx` 返回 **0 个文件**（2026-09-12 控制方实测踩到，把「页面 import」误报成 0 命中）。正确写法 = `Get-ChildItem -Recurse -File | Where-Object { $_.Extension -in '.tsx','.ts' }`。这是批 1 记录的第 7 类假阴性仪器。
  5. **全树扫描必须排除 `.superpowers/`**：各批 `tmp/` 下解包的历史归档副本会被当成命中源（批 1 一次假 313 命中）。本批的扫描命令统一加 `--glob '!.superpowers/**'` 或先 `Get-ChildItem -Exclude .superpowers`。

  > **2026-09-12 追加（Task 12 回写）：本批实测又新增 8 类仪器陷阱（累计 13 类），后续批次一律照用。**
  > 6. **`\b`/正则遇全角 `）` 与中文**：含中文的搜索模式**不得经 PowerShell 字符串层传递**（PS 5.1 按 GBK 误解码 ⇒ 把中文模式搜成 `瀛愪覆`，**给出 0 命中的假阴性**）；用 Node/Python 或 UTF-8 读文件。同族：**无 BOM 的 UTF-8 `.ps1` 含中文会被 GBK 解码**（`-File` 执行时连脚本内的 `cmd` 行一起毁掉）⇒ 交给 `-File` 的脚本保持纯 ASCII。
  > 7. **整树 ripgrep 会遵守 `.gitignore`** ⇒ 对**被忽略目录整体失明**（本批实测：`app/src/build/manualChunks.ts` 里的 `vendorGroupOf` 在 `app/` 下报 **0 命中**，窄域 grep 报 **19**）。⇒ 用 `rg --no-ignore` / `git grep --no-index` / 显式遍历。
  > 8. **PS `-Include` 无 `-Recurse` 时静默返回 0 个文件**（`Get-ChildItem app\src -File -Include *.tsx` = 0；正确写法 `-Recurse -File | Where-Object Extension`）。
  > 9. **PS 5.1 `>` 重定向写 UTF-16LE** ⇒ Node `JSON.parse` 读 `--json` 捕获文件会失败；用 `cmd /c "… > f"` 或 `Out-File -Encoding utf8`。
  > 10. **Tauri 命令名不是唯一的 chunk 标记**（`close_capture_float` 在 `ClassroomPage.tsx` 里也有）⇒ 用「panel-only 标记 + 不跟随动态边」；**chunk 依赖边是模块图的性质，不是归属表的性质** —— 迁移模块必须连它自己的依赖闭包一起迁，否则边还在（本批 md↔katex 环的根因）。
  > 11. **`git archive` 在未跟踪子目录产出 10240 字节空归档 + exit 0**；**解包树里 `git grep` 静默 0 命中**（无 `.git`）⇒ 一律在仓库根 + 绝对 `-o`。
  > 12. **`Copy-Item` 保留 mtime** ⇒ cargo 回放陈旧诊断，还原文件后先 `touch`。
  > 13. **A/B Δ 恰为 0 时先当仪器故障**（不是「无差异」）：先自证仪器能测出已知差异，再下结论。
- **★ 连通性判据（批 1「收口一」第 1 条，本批的技术底座）**：**「这个模块看起来还有人用」不是保留依据**；判一块代码是否仍连着，唯一可靠的方法是**从入口反向做可达性分析**。本批四个任务（1 / 2 / 9 / 10）全部采用同一把尺：**从 `app/src/main.tsx` 出发、只沿静态 ESM `import`/`export … from` 走、把 `import(…)` 当作断点**，得到「首屏可达模块集合」。探针脚本已在 `tmp/probe-eager-graph.mjs`，Task 1 会把它固化成 `scripts/bundle-eager-graph.mjs`。
- **★ 文本扫描型守卫会被注释/测试名里的字面量误伤**（批 0-D Task 10 实测）：若某个测试必须提到本批新增/改动的字符串，**用拼接写法**（`"vendor-" + "gsap"`）**或改述**，**绝不为了绕开守卫去改守卫本身**。
- **★ 提交纪律**：`git commit --only -m "<msg>" -- <显式路径…>`（本仓**多 agent 并行**，裸 `git commit` 会扫走别人已暂存的条目，包括 `D` 删除条目 —— 已实际发生）。**禁止**：`git add -A` · `git add .` · `git stash` · `git checkout --` · `git restore` · `git clean` · `git reset --hard` · `--no-verify`。提交信息 Conventional Commits：`<type>(<scope>): <subject>`，subject ≤50 字、动词开头、无结尾句号。**本批禁止任何删除操作**（无文件删除、无依赖卸载）—— 若某任务确需删除，STOP 并报控制方。
- **★ 判门禁要在提交树上判**：要证「某个提交自洽」，必须导出该提交的树再跑（`git -c core.autocrlf=false archive -o <绝对路径>.tar <commit>` → 解包到 `.superpowers/sdd/<batch>/tmp/<子目录>/` → 在该树内跑它自带的脚本）。⚠️ **`git archive` 必须在仓库根执行 + `-o` 用绝对路径**（在未跟踪子目录里执行会产出 **10240 字节空归档且 exit 0**）；且在解包树里**没有 `.git`**，`git grep` 会**静默 0 命中**（仪器坏，不是树干净）。
- **★ `cmd` 会吃掉 `^`**：`cmd /c "git show X^:path"` 静默变成看当前提交。读历史文件一律在 PowerShell 里读**完整**文件，绝不读 diff hunk 推断全文。
- **★ `Copy-Item` 保留 mtime** ⇒ cargo 判定产物最新、复验读到**陈旧缓存**里的诊断集。本批不碰 Rust，但若任何步骤还原了文件，**先 `touch` 再复验**。
- **★ 辅助函数/变量禁用 PowerShell 内置别名名**：`rd` `rm` `mv` `cp` `ls` `cd` `cat` `sc` `gi` `si` —— 别名会**静默覆盖**你的函数（批 1 因此发生一次真实破坏性事故：7 个文件被删、`lib.rs` 被写成 1 行）。
- **★ `core.autocrlf=true` + 工作树存在 LF-only 异类文件** ⇒ `git hash-object` 相等**与**空的 `git diff` 都可能掩盖 EOL 差异；**`git status` 干净是唯一可靠判据**。
- **报告与临时文件**：报告写 `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/task-<N>-report.md`，评审写同目录 `task-<N>-review.md`。**该目录已被 `.superpowers/sdd/.gitignore`（内容为 `*`）整体忽略** ⇒ **永不 `git add -f`**。探针/日志/基线/解包树一律写 `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/` 下的**子目录**，**不许放仓库根**。
- **★ 本批新门禁脚本不进 `pre-commit`**（有意，须在报告中写明理由）：`.husky/pre-commit` 是**共享文件**，现跑 `line-limits --full && docs-check && check-command-registry` 三条**纯文本只读全树扫描**；本批的 `check-bundle-budget.mjs` 需要先跑一次 **4.2 秒的 vite 构建**并写 `app/dist/`，把它塞进 pre-commit 会让**每个 agent 的每次提交**都依赖「此刻工作树能构建成功」，在并行期必然互相打断。⇒ **接线留给批 8（治理收口）**，本批只保证脚本存在、可跑、自检通过，并**在每个涉及包体的任务里手工跑它**。此项登记见 Task 11 的瓶颈清单与 Task 12 的 follow-ups。
- **★ 规格文档的写法纪律**：本计划的 §实测基线 与 §达标定义 是**计划者实测**，若与规格 §2/§10 冲突，**以本计划为准**（并在 Task 12 回写规格）。但 **Task 6 的路线裁决不得由实施者自行作出**（见待裁决项）。

---

## 达标定义（规格未给数字；本计划从既有标准文档取得，**提请控制方批准口径**）

**达标 = 首屏 JS gzip < 200 kB。**

- **数字来源不是本计划发明的**：`docs/standards/performance.md:28` 的绩效预算表已写死 —— 「页面包大小 (JS) | **< 200KB (gzip)** | Bundle 分析」。规格 §2 的包体行也引用了它（「`performance.md` 预算为 **<200KB gzip** → 超标 3.26 倍」）。⇒ 本计划**采用既有预算**，不另立数字。
- **需要控制方批准的只有「首屏」这个词的口径**（标准文档只写「页面包大小 (JS)」，未定义首屏）：
  1. **首屏 chunk 集合** = `app/dist/index.html` 里 `<script type="module">` 指向的入口 chunk，**加上从入口出发只沿静态 ESM `import` / `export … from` 可达的全部 `.js` chunk**；`import(…)` 动态 chunk **不计**入首屏。（理由：Tauri 走本地 asset 协议，入口 HTML 拉起的 module graph 就是「主窗出现之前的 JS 传输量」。）
  2. **只算 `.js`**：CSS（今天 11.75 kB gzip）与字体资产不计入这 200 kB（标准文档括号里写的是 JS）。**但它们不得因此失控** —— Task 10 必须把 CSS/字体读数一并记录进瓶颈清单。
  3. **度量工具** = `node scripts/check-bundle-budget.mjs`（Task 2 交付），其 gzip 用 `zlib.gzipSync(buf, { level: 6 })`。**已校准**：对今天的唯一 chunk 该口径得 **654,722 字节 = 654.72 kB**，与 vite 自己打印的 `gzip: 654.72 kB` **逐字相等**（vite 用十进制 kB，即 ÷1000，不是 KiB）。
  4. **附加达标线（窗口变体）**：`index.html?float=1` 与 `?overlay=1` 两个**独立窗口**的首屏 JS gzip，今天与主窗**完全相同**（同一个入口、同一个 654.72 kB chunk）—— 采集浮窗是 `alwaysOnTop` 的常驻窗口，为它加载完整主壳是纯浪费。**本计划提议该值 < 60 kB**（Task 7 后实测预期 ≈ 50–60 kB；作为**建议项**而非硬门禁，控制方可另定）。
- **不达标时的合法交付**（规格 §10 原文：「从 651KB gzip 降到达标**或给出瓶颈清单**」）：若控制方否掉路线 B′，或落地后仍 > 200 kB，本批的验收物转为 **Task 11 的瓶颈清单**，且清单必须逐项给出 **实测 gzip / 为什么降不下去 / 归属批次 / 复现命令** 四列。**「降不下去」是有证据的合法结论，不是失败。**

---

## 实测基线（计划者 2026-09-12 在 `dev@f12aba6d` 实跑；下游一切目标与排序都从此派生）

### 表 1 · 生产构建基线

**命令**（规格要求记录逐字命令；仓库根执行）：

```powershell
cd app; npm run build            # = tsc && vite build
```

**观测输出**（节选，全文见 `tmp/build-before.txt`）：

```
vite v7.3.6 building client environment for production...
✓ 746 modules transformed.
dist/index.html                                           0.49 kB │ gzip:   0.31 kB
dist/assets/index-DEye2S6d.css                           49.28 kB │ gzip:  11.75 kB
dist/assets/index-BctYHBP-.js                         2,106.46 kB │ gzip: 654.72 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
✓ built in 4.18s
```

| 量 | 实测 | 说明 |
|---|---|---|
| JS chunk 数 | **1** | 零代码分割 |
| JS 原始 / gzip | **2,106.46 kB / 654.72 kB** | 十进制 kB（vite 口径，÷1000）；磁盘字节 2,106,457 |
| CSS 原始 / gzip | 49.28 kB / 11.75 kB | 单一 `index-*.css` |
| `index.html` | 0.49 kB / 0.31 kB | |
| KaTeX 字体资产 | **59 个文件 / 1,047.80 kB**（`.woff2` 19 / 250.16 · `.woff` 20 / 296.01 · `.ttf` 20 / 501.63） | 按需 `@font-face`，**不进首屏**，但进安装包 |
| `app/dist` 合计 | 3,157.49 kB | |
| 构建耗时 | 4.18s · 746 modules | |
| 独立复算 | `zlib.gzipSync(buf,{level:6}).length` = **654,722 字节** | 与 vite 打印值**逐字相等** ⇒ 该口径可作机器判据 |

> **2026-09-12 更正（Task 12 回写，本表两处单位错标）**：本表其余各行都是**十进制 kB（÷1000）**，但
> · 「KaTeX 字体资产 **1,047.80 kB**」实为 **KiB** ⇒ 十进制是 **1,072,948 B = 1,072.95 kB**；
> · 「`app/dist` 合计 **3,157.49 kB**」实为 **KiB** ⇒ 十进制是 **3,233,274 B = 3,233.27 kB**（批 2 终态 3,228,859 B = 3,228.86 kB）。
> ⇒ 引用这两行**必须连单位一起抄**，否则会凭空多出 **≈25 kB 字体 / ≈76 kB dist** 的假 Δ。（子项 `.woff2`/`.woff`/`.ttf` 三行同源，也是 KiB。）

> **规格漂移（第 1 处）**：规格 §2 现状基线写「JS 2,093.85 kB / gzip **651.25** kB」，实测 **2,106.46 / 654.72**（+12.61 kB 原始 / +3.47 kB gzip）。规格 §10 批 2 行与 §11 验收 9 的「651KB」同源过期。⇒ Task 12 回写。
> **规格漂移（第 2 处）**：规格 §2 那句「单个 chunk，**零代码分割**」**成立**，但 §10 把「`manualChunks`」列为降首屏的手段 —— 实测/推理结论：**`manualChunks` 本身一个字节都不降首屏**。它只把同一批字节切成多个文件，入口仍静态依赖全部 chunk。它的真实价值是 ① 让批 6 的 GSAP 能落进独立懒加载 chunk（规格 §13 风险表要求）② 让 `import()` 产生的懒 chunk 有稳定的共享 vendor 边界、不被 rollup 默认算法复制或打散。⇒ Task 12 在规格 §10 批 2 行补一条口径注。

### 表 2 · 依赖归因（探针构建：把每个 npm 包强制切成独立 chunk）

**仪器**：`tmp/probe-pkg-sizes.config.mjs`（一次性 vite config，`manualChunks(id)` 按包名分组）
**命令**：

```powershell
cd app; npx vite build --config "<仓库根>\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp\probe-pkg-sizes.config.mjs"
```

> ⚠️ **仪器局限（必须先读再引用）**：该探针把 133 个包切成 133 个 chunk，**总 gzip 从 654.72 膨胀到 695.95 kB（+41.23 kB / +6.3%）** —— 增量是 chunk 样板与跨 chunk `import` 语句。⇒ **探针只用于「归因占比」，绝不可把探针之和当作落地后的尺寸预测**。任务 10 的对比一律以**真实构建输出**为准。
> ⚠️ **表的归组口径 ≠ 落地的归组口径（两者都在本计划里，别混用）**：本表的族边界取自**探针的包名分组**；**落地分组的唯一真源是 Task 3 的 `EXACT` / `PREFIX` 表**。两处对少数**共享包**的归属不同 —— 例：`property-information` / `hastscript` / `web-namespaces` 本表记在 `vendor-md` 行，Task 3 记在 `vendor-katex`。这类差异**只在两个懒 chunk 之间搬字节**，对首屏总量与达标判定**一个字节都不影响**（两边都是懒 chunk）；引用数字时以本表看**占比**、以 Task 3 看**落点**。

| 族 | gzip (kB) | 占比 | 内容 |
|---|---|---|---|
| `vendor-editor` | **218.69** | 31.4% | `@codemirror/view` 62.59 · `@lezer/javascript` 30.69 · `@codemirror/state` 15.30 · `@codemirror/autocomplete` 12.66 · `@lezer/markdown` 12.02 · `@codemirror/language` 9.89 · `@lezer/common` 9.55 · `@lezer/lr` 8.83 · `@lezer/css` 8.08 · `@codemirror/commands` 7.83 · `@codemirror/search` 6.83 · `@lezer/html` 6.26 · `@codemirror/lang-html` 5.51 · `@codemirror/lang-css` 4.53 · `@codemirror/lint` 4.62 · `@codemirror/lang-markdown` 3.82 · `@codemirror/lang-javascript` 2.93 · `@lezer/highlight` 2.83 · 其余 5 个小件 |
| `<<应用源码>>` | **190.52** | 27.4% | `app/src/**` 全部（**静态可达 251 个文件**，见 `tmp/probe-eager-graph.mjs` 输出） |
| `vendor-katex` | **88.00** | 12.6% | `rehype-katex` 78.09（**内含嵌套的 `katex@0.16.47` JS**）· `katex` CSS 8.06 · `hast-util-from-dom` 0.51 · `hast-util-to-text` 1.34 |
| `vendor-canvas` | **65.66** | 9.4% | `@xyflow/react` 24.67 · `@xyflow/system` 17.16 · 9 个 `d3-*` 合计 19.33 · `zustand` 0.80 · `use-sync-external-store` 0.85 · `classcat` 0.18 |
| `vendor-md` | **65.30** | 9.4% | `react-markdown` 1.35 · `micromark-core-commonmark` 7.17 · `property-information` 6.05 · `micromark` 4.10 · `mdast-util-to-hast` 3.41 · `mdast-util-to-markdown` 3.60 · `mdast-util-from-markdown` 3.22 · 其余 40 个 mdast/micromark/unist/hast/vfile 小件 |
| `vendor-react` | **61.01** | 8.8% | `react-dom` 56.29 · `react` 3.14 · `scheduler` 1.58 |
| `vendor-tauri` | 4.70 | 0.7% | `@tauri-apps/api` 4.28 · `@tauri-apps/plugin-dialog` 0.42 |
| **探针合计** | **695.95** | | 真实构建 **654.72**（差 +6.3% 见上注） |

**归因的三条硬结论（本批全部任务的排序依据）**

1. **三大「可选」族合计 372.35 kB gzip**（editor 218.69 + katex 88.00 + canvas 65.66）＝ 真实总量 654.72 的 **57%**。而它们**只被三个域用到**：editor → 笔记编辑态；katex → 笔记阅读 / 对话消息；canvas → 体系画布 / 图谱。
2. **`react` + `react-dom` + `scheduler` = 61.01 kB gzip 是不可谈判的底线**（占 200 kB 预算的 31%）。
3. **应用源码自己就是 190.52 kB gzip（27.4%）** —— 这一块的体量与三大族同量级，且**只有把页面变成动态入口才能移出首屏**。这解释了为什么路线 A（221/251 个源文件仍静态可达）**不可能达标**。

### 表 3 · 首屏静态可达性场景模拟（探针：在模块图上按候选边界切边）

**仪器**：`tmp/probe-route-ceiling.mjs`（从 `app/src/main.tsx` 出发做静态 import BFS，按候选边界把 `import` 边切成动态）
**命令**：`node .superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/probe-route-ceiling.mjs`

| 场景 | 首屏应用源文件 | 首屏 npm 包 | 依赖 gzip 近似 | 达标 |
|---|---|---|---|---|
| 现状 baseline | **251 / 276**（非测试源文件总数 276） | 15 | 259.00 | ❌ |
| 路线 A（叶级 6 处切边） | 221 | 5 | 88.80 | ❌（应用代码仍 221 文件） |
| 路线 B（8 页 + 2 窗变体） | 51 | 10 | 152.23 | 边界 |
| **路线 B + 对话面板** | **47** | **4** | **64.13** | ✅ |
| 路线 A+B | 50 | 4 | 64.13 | ✅（A 被 B 完全包含） |
| 路线 B+面板+课堂页也懒加载 | 17 | 4 | 64.13 | ✅（本批**不做** —— 课堂是默认页，懒加载它等于首屏必拉一次动态 chunk） |

**⇒ 关键发现（本计划最重要的一条，也是「按页动态 import」这个动作的真正理由）**：`AiConversationDock` 被 `App.tsx:36` **静态 import、在 `:422` 常驻挂载**，而它 `:8` 静态 import 了 `TaskConversationView`，后者 `:14` 静态 import 了 `ChatMessageMarkdown`，后者 `:12/:13` import 了 `rehype-katex` 与 `katex/dist/katex.min.css`。⇒ **即使把 9 个页面全部改成按页懒加载，主窗首屏仍会拉进整条 markdown + katex 栈（≈153 kB gzip）**，`@xyflow/react` 同理。
⇒ **路线 B 必须与 Task 7（两窗变体）+ Task 8（对话面板）合起来才达标**；三条缺一不可。这条链只有靠「静态可达性」这把尺才看得见 —— 用「这个组件看起来按需渲染」的直觉判断会**全部漏掉**（批 1 的「不删清单」就是这么被证伪五次的）。

### 表 4 · 本批要改的真实落点（逐个 `文件:行`，均为计划者实测）

| 落点 | 事实 | 证据 |
|---|---|---|
| `app/vite.config.ts` | 40 行；**完全没有 `build` 段**（无 `rollupOptions`/`manualChunks`）；形态是 `defineConfig(async () => ({ … }))` | 全文已读 |
| `app/package.json` | `"build": "tsc && vite build"`；12 个 `dependencies` / 9 个 `devDependencies`；**无 `gsap`** | 全文已读 |
| `app/src/App.tsx` | **439 行**（301–600 档，已在豁免表）；`:20-34` **9 处静态页面 import**；`:36` `AiConversationDock`；`:38` `CaptureFloatPanel`；`:39` `CaptureOverlayPanel`；`:47` `type Page`；`:72-83` 两个窗口变体早返回；`:98` `useState<Page>("classroom")`；`:311-419` 9 个 `display:none` 容器 | 全文已读 |
| `app/src/pages/` | 9 个页面：`ClassroomPage.tsx` 278 行 · `NotesPage.tsx` 295 · `SessionsPage.tsx` 352 · `ActionPage.tsx` 41 · `ReviewPage.tsx` 222 · `ChatPage.tsx` **593** · `SettingsPage.tsx` 146 · `KnowledgePage.tsx` 437 · `GoalsPage.tsx` 152 | 控制方 2026-09-12 实测 |
| `app/src/build/` | **不存在**（本批新建目录，放纯函数 `manualChunks.ts` + 单测） | `Get-ChildItem app/src -Directory` 实测 |
| `scripts/` | 现有 9 个 `.mjs`：`check-command-registry` · `docs-check` · `line-limits` · `session-*` ×3 · `validate-all`（**重构前遗留、指向不存在的 `client/`/`server/`，不要参考它**）· `version-bump` | 实测 |
| `app/tsconfig.json` | `include: ["src"]`，**没有 `@types/node`**；`node:fs`/`node:path`/`node:url` 的最小声明在 `app/src/node-builtins.d.ts`（**只有** `readFileSync`/`readdirSync`/`statSync` · `dirname`/`join`/`relative`/`sep` · `fileURLToPath`；**没有 `resolve`、没有 `existsSync`、没有 `process`**） | 全文已读 |
| 测试文件路径范式 | `const HERE = dirname(fileURLToPath(import.meta.url))` 然后 `join(HERE, …)`（`app/src/ui/tokens.drift.test.ts:18`、`app/src/ui/icons/no-inline-svg.test.ts:18`） | 实测 |
| **不存在 `App.test.tsx`** | ⇒ **路线 B′ / Task 7 / Task 8 的测试面为 0**（没有任何测试渲染 `App.tsx`），这正是 B′ 的测试风险低于路线 A 的原因 | `Get-ChildItem app/src -Recurse -File -Filter *.test.*` 实测 |

---

## 任务总表与派发顺序

| Task | 内容 | 依赖 | 可否并行 | 改的文件 |
|---|---|---|---|---|
| **1** | 基线冻结：真实构建 + 六门禁读数 + 把可达性探针固化成 `scripts/bundle-eager-graph.mjs` | — | ✅ 与 T2 并行 | 新增 `scripts/bundle-eager-graph.mjs` |
| **2** | 首屏预算守卫 `scripts/check-bundle-budget.mjs`（把「达标」变成机器判据） | T1（口径与校准值） | ✅ 与 T1 并行 | 新增 1 个脚本 |
| **3** | `manualChunks` 纯函数 + 单测（`app/src/build/manualChunks.ts`） | — | ✅ 与 T1/T2 并行 | 新建 2 个文件 |
| **4** | `vite.config.ts` 接线 + 分块拓扑验收 | T3 | ❌ 串行（T3 之后） | `app/vite.config.ts` |
| **5** | GSAP 独立 chunk 预留槽 + 反例守卫（**不装 GSAP**） | T3 | ❌ 串行（T3 之后） | `app/src/build/manualChunks.ts` + 测试 |
| **6** | **按页动态 import + 首访挂载保活**（9 页） | **T4 · 控制方路线裁决** | ❌ 串行（独占 `App.tsx`） | `app/src/App.tsx` |
| **7** | 两个窗口变体懒加载（`?float=1` / `?overlay=1`） | T6（同文件，顺位） | ❌ 串行 | `app/src/App.tsx` |
| **8** | 对话面板首开挂载（`AiConversationDock` + 保活） | T7（同文件，顺位） | ❌ 串行 | `app/src/App.tsx` |
| **9** | 重依赖去重与传递链审计（分裂后复测；过「size-only ∧ behavior-neutral」双闸才动） | T4–T8 | ✅ 与 T10 前半并行 | 预计 0 个文件（审计型；若过闸则另立子步） |
| **10** | 终测：同命令复跑 + 前后对比 + 窗口变体首屏 | T4–T9 | ❌ 最后测量 | 0（只产出读数） |
| **11** | **瓶颈清单**（规格交付物，写入本计划 §收口回写） | T10 | ❌ | 本计划文件 |
| **12** | 收口：六门禁 + 规格 §10 进度标记 + v0.22 台账 + follow-ups | 全部 | ❌ 最后 | 规格 · `docs/versions/v0.22.md` · 豁免表（如需） |

> **T6/T7/T8 必须串行**：三者都改 `app/src/App.tsx`（共享文件），并行会造成 `git add`/`git commit` 交错污染（批 0-C 期实测 10 次事故）。**同一时刻最多一个实施者动 `App.tsx`。**
> **T1/T2/T3 可安全并行**（三套互不相交的新文件）。

### 每个改造任务的统一作业模式（Task 4–8 共用，逐条照做）

1. **先立影响面**：开工前跑一次该任务会碰到的**全部**测试文件与门禁，把读数写进报告的「开工读数组」。（本批的任务会改**模块加载边界**，「改完才知道破了什么」是不可接受的。）
2. **一次只切一个边界**：改一处 → 跑门禁 → 绿则继续，红则**回退这一处**并记录，**不得**为了变绿去改测试、改 mock、加 `await`。
3. **验收判据是「既有测试逐条原样通过」**，不是「新测试覆盖了」。用例数**只许持平**（`124 文件 / 1124 用例`）；**任何下降或断言改动 ⇒ STOP 并报控制方**。
4. **构建读数必须留痕**：涉及 `App.tsx` / `vite.config.ts` 的任务都要跑 `cd app; npm run build` 并保存完整输出到 `tmp/build-task<N>.txt`，同时跑 `node scripts/check-bundle-budget.mjs --no-build` 记录首屏 gzip 的**逐任务变化曲线**（这是本批最有价值的过程数据）。
5. **报告必含「你没能验证的地方」**（诚实单列）。
6. **提交**：`git diff --stat` 复核只含自己的文件 → `git commit --only -m "<msg>" -- <显式路径…>`。

---

### Task 1: 基线冻结（真实构建 + 六门禁读数 + 可达性探针固化）

> **为什么第一个做**：规格要求「先测量」。本任务同时把计划者的**一次性探针**固化成**可复跑的门禁级脚本** `scripts/bundle-eager-graph.mjs` —— 后续四个任务（2/4/9/10）都要用它量「首屏还剩多少模块」。**本任务不改任何生产代码。**

**Files:**
- Create: `scripts/bundle-eager-graph.mjs`（≤300 行）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/baseline.md`（不入库）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/build-before.txt`（不入库）
- Read（只读，不改）: `app/package.json` · `app/src/App.tsx` · `app/vite.config.ts`

**Interfaces:**
- Produces: `scripts/bundle-eager-graph.mjs`，CLI 契约 —— `node scripts/bundle-eager-graph.mjs [--json] [--entry <path>]`，stdout 打印「首屏可达的应用源文件数 / 首屏 npm 包清单 / 逐文件清单」，退出码 0 正常、1 入口不存在。**Task 2 会调用它的纯函数版本**（见 Task 2 的 `--eager-files` 说明），Task 9/10 直接跑它。

- [ ] **Step 1: 记录门禁基线（六条，串行）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full
node scripts/docs-check.mjs
node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit
cd app; npx vitest run
cd app/src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp\cargo-before.txt"
```

预期（与 Global Constraints 的基线表逐字相符）：`>600: 0 · 301–600: 123 · registered: 123` · `docs-check 通过` · `定义 312 / 注册 312 / 重复 0` · `tsc` exit 0 · **`124 个测试文件 / 1124 个用例`** · **`2300 passed / 0 failed / 6 ignored`**。
**任一条不符 ⇒ 先停下报控制方**（说明开工点不是干净的批 1 收口态），不要继续。

- [ ] **Step 2: 跑真实生产构建并保存全文**

```powershell
$d = "D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp"
cmd /c "cd /d `"D:\Program own\aicode\work space\Entropydecrease\app`" && npm run build > `"$d\build-before.txt`" 2>&1"
"exit=$LASTEXITCODE"
```
> 这里用 `cmd /c … > file 2>&1` 是**允许的**（重定向发生在 cmd 内、由文件承载，不走 PowerShell 管道）；**禁止的是** `npm run build 2>&1 | Select-Object …`。

预期：`exit=0`，`build-before.txt` 里出现 `dist/assets/index-*.js  <N> kB │ gzip: 654.72 kB`。**记录实际文件名与数字**（hash 会变，gzip 值应与本计划 §表 1 一致；不一致就是 HEAD 变了，立即报控制方）。

- [ ] **Step 3: 独立复算 gzip 以校准口径**

```powershell
cd app
node -e "const z=require('zlib'),f=require('fs'),p=require('path');const dir='dist/assets';const js=f.readdirSync(dir).filter(n=>n.endsWith('.js'));for(const n of js){const b=f.readFileSync(p.join(dir,n));console.log(n,b.length,'bytes =',(b.length/1000).toFixed(2),'kB | gzip',z.gzipSync(b,{level:6}).length,'bytes =',(z.gzipSync(b,{level:6}).length/1000).toFixed(2),'kB');}"
```

预期：`index-*.js 2106457 bytes = 2106.46 kB | gzip 654722 bytes = 654.72 kB` —— **与 vite 打印值逐字相等**。这一条就是 Task 2 判据的校准依据，必须写进报告。

- [ ] **Step 4: 写 `scripts/bundle-eager-graph.mjs`**

```js
#!/usr/bin/env node
/**
 * @ai-context 首屏静态可达性探针（批 2 包体治理的连通性尺子）。
 *
 * Why：本仓唯一的「首屏」定义是**模块加载边界**，不是「组件看起来是不是按需渲染」。
 *      批 1 的「不删清单」被证伪五次，根因就是用「看起来还有人用」代替「删除后的可达性」；
 *      包体治理是同一类问题的镜像 —— `AiConversationDock` 看起来「按需唤起」，
 *      但它被 App.tsx 静态 import 且常驻挂载，于是整条 markdown+katex 栈都在首屏。
 *      唯一可靠的判据是：从 app/src/main.tsx 出发、只沿静态 ESM import 走。
 *
 * 口径：静态边 = `from "…"` 与裸 `import "…"`；`import(…)` 是动态边界，**不跟**。
 *      相对说明符按 Node 解析顺序补扩展名（"", .ts, .tsx, .js, .jsx, /index.ts, /index.tsx）；
 *      裸说明符按包名归并（`@scope/name` 取两段）。
 *
 * 副作用：只读文件系统；不写任何文件。
 * 边界：不做 tsconfig paths 解析、不处理 `export * as ns from`（本仓未使用）。
 * 用法：node scripts/bundle-eager-graph.mjs [--json] [--entry app/src/main.tsx]
 * 退出码：0 = 正常；1 = 入口不存在。
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, relative, sep, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const entryArg = argv.indexOf("--entry") >= 0 ? argv[argv.indexOf("--entry") + 1] : "app/src/main.tsx";
const ENTRY = resolve(ROOT, entryArg);
const EXT = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];
const RE_FROM = /\bfrom\s*["']([^"']+)["']/g;
const RE_BARE = /\bimport\s*["']([^"']+)["']/g;

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const e of EXT) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

export function eagerGraph(entry) {
  const visited = new Set();
  const packages = new Map();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    const specs = [];
    for (const re of [RE_FROM, RE_BARE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) specs.push(m[1]);
    }
    for (const spec of specs) {
      const resolved = resolveSpec(file, spec);
      if (resolved) { if (!visited.has(resolved)) queue.push(resolved); }
      else if (!spec.startsWith(".")) {
        const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        packages.set(name, (packages.get(name) ?? 0) + 1);
      }
    }
  }
  return { files: [...visited].sort(), packages: [...packages.keys()].sort() };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (!existsSync(ENTRY)) {
    console.error(`❌ 入口不存在：${relative(ROOT, ENTRY)}`);
    process.exit(1);
  }
  const { files, packages } = eagerGraph(ENTRY);
  if (AS_JSON) {
    console.log(JSON.stringify({ entry: relative(ROOT, ENTRY), files: files.map((f) => relative(ROOT, f)), packages }, null, 2));
  } else {
    console.log(`入口：${relative(ROOT, ENTRY)}`);
    console.log(`首屏静态可达应用源文件：${files.length}`);
    console.log(`首屏拉入的 npm 包：${packages.length}`);
    for (const p of packages) console.log(`  - ${p}`);
    console.log(`逐文件清单：加 --json 输出`);
  }
}
```

- [ ] **Step 5: 仪器自检（三条，缺一不可）**

```powershell
# (a) 已知存在的串必须命中：--entry 指向一个确定存在的文件，包清单里必须出现 react
node scripts/bundle-eager-graph.mjs --json | Select-String '"react"'
# (b) 无意义串必须 0 命中（同一个仪器，同一个口径）
node scripts/bundle-eager-graph.mjs --json | Select-String 'zzz-not-a-real-package'
# (c) 入口不存在必须 exit 1
node scripts/bundle-eager-graph.mjs --entry app/src/does-not-exist.tsx; "exit=$LASTEXITCODE"
```
预期：(a) 命中 1 行 `"react"`；(b) **0 行**（`Select-String` 无输出）；(c) `❌ 入口不存在` + `exit=1`。
**把 (a)/(b)/(c) 的原始输出贴进报告** —— 这是本批「任何 0 命中结论都要点名仪器并自检」纪律的第一份证据。

- [ ] **Step 6: 固化基线文档**

把 Step 1–3 的读数写进 `tmp/baseline.md`，含：六门禁逐条读数与 exit · `build-before.txt` 的关键行 · gzip 复算值 · `bundle-eager-graph` 的三条自检输出 · **`app/src` 非测试源文件总数（276）与首屏可达数（251）**。

- [ ] **Step 7: 提交**

```powershell
git diff --stat                       # 只应有 scripts/bundle-eager-graph.mjs 一个新增文件
git commit --only -m "build(scripts): add first-screen reachability probe" -- scripts/bundle-eager-graph.mjs
```

> **2026-09-12 更正（Task 12 回写）**：上面这个 subject **51 字符，超 `AGENTS.md` §5 的 ≤50 字上限**，且**照抄落地**了（`e46e0e82`）。**门禁不会拦**：`commitlint.config.js` 的 `header-max-length` 沿用 config-conventional 的 **100**，未覆盖为 50。**Task 2 Step 5 的 subject 同样是 51 字符**（同一处失误，已实测入库 `f0592654`）。⇒ 抄写提交命令前请人工数字符数。

**Verification（本任务的验收，逐条给命令与期望）**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `node scripts/bundle-eager-graph.mjs` | `首屏静态可达应用源文件：251` · `首屏拉入的 npm 包：15`（与 §表 3 baseline 行一致；不一致说明 HEAD 变了，报控制方） |
| V2 | 上条命令的输出里含 `@xyflow/react` `codemirror` `katex` `rehype-katex` `react-markdown` | 五个都在（它们就是本批要移出首屏的对象） |
| V3 | Step 5 的三条自检 | (a) 命中 · (b) 0 行 · (c) exit 1 |
| V4 | `node scripts/line-limits.mjs --full` | exit 0（`scripts/` 不在 `SCAN_DIRS`，本任务不改变任何读数） |
| V5 | `git status --short` | 只剩未跟踪的 `.superpowers/`（本来就未跟踪）与 `docs/tech-debt/`（批 1 登记过，**不要动它**） |

---

### Task 2: 首屏预算守卫 `scripts/check-bundle-budget.mjs`

> **为什么第二个做**：规格的验收是「首屏 gzip 达标**或**给出瓶颈清单」。**没有机器判据时，「达标」是形容词。** 本任务把 §达标定义 的口径变成一条可复跑的命令，后续每个任务都用它记录曲线。**本任务不改任何生产代码。**

**Files:**
- Create: `scripts/check-bundle-budget.mjs`（≤300 行）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/budget-after-task2.txt`（不入库）
- Read: `app/dist/index.html` · `app/dist/assets/*.js` · `docs/standards/performance.md`

**Interfaces:**
- Consumes: 无（不 import Task 1 的脚本 —— 两者口径不同：Task 1 量**源码模块**图，本任务量**产物 chunk** 图；刻意不共用代码以免一个的口径污染另一个）
- Produces: `node scripts/check-bundle-budget.mjs [--no-build] [--budget <kB>] [--json] [--self-test]`，stdout 打印首屏 chunk 清单 + 首屏 gzip 合计 + 预算判定，exit 0 = 达标、1 = 超标、2 = 构建失败/产物缺失。**Task 4–10 每个任务都要跑它（`--no-build`）并记录读数。**

- [ ] **Step 1: 写脚本（核心：入口 → 静态 import 闭包 → gzip 求和）**

```js
#!/usr/bin/env node
/**
 * @ai-context 首屏 JS 预算守卫（批 2 包体治理的「达标」判据）。
 *
 * Why：规格把批 2 的验收写成「从 651KB gzip 降到达标或给出瓶颈清单」，
 *      但「达标」与「首屏」两个字都没有机器口径。本脚本按计划 §达标定义 固化：
 *      首屏 = dist/index.html 的 module 入口 + 从它出发**只沿静态 ESM import 可达**的全部 .js chunk；
 *      gzip 用 zlib level 6（已校准：与 vite 打印值逐字相等）。
 *
 * 口径陷阱（已实测，勿改）：
 *  - vite 打印的 kB 是**十进制**（÷1000），不是 KiB（÷1024）。本脚本一律 ÷1000。
 *  - 动态 import 在产物里是 `import("./x.js")`（紧跟左括号），静态是 `import"…"` / `from"…"`。
 *    故静态扫描的正则**要求引号紧跟**，天然不匹配 `import(`。为稳妥，先剥掉 `import(…)` 形态再扫。
 *  - rollup 的产物里同一 chunk 名可能被 `__vitePreload(()=>import(…))` 引用 —— 那是动态，不计。
 *
 * 副作用：默认会执行 `npm run build`（写 app/dist/）；传 `--no-build` 则只读既有产物。
 * 边界：只认 `./` 相对引用的同目录 chunk；不做 sourcemap、不解析 CSS 里的 url()。
 * 用法：node scripts/check-bundle-budget.mjs [--no-build] [--budget 200] [--json] [--self-test]
 * 退出码：0 达标 · 1 超标 · 2 构建失败或产物缺失
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "app");
const DIST = join(APP, "dist");
const argv = process.argv.slice(2);
const NO_BUILD = argv.includes("--no-build");
const SELF_TEST = argv.includes("--self-test");
const AS_JSON = argv.includes("--json");
const BUDGET_KB = argv.includes("--budget") ? Number(argv[argv.indexOf("--budget") + 1]) : 200;

/** 动态 import 形态：`import(` 后紧跟引号/括号，先整段剔除，避免污染静态扫描。 */
const stripDynamic = (s) => s.replace(/import\s*\(\s*["'][^"']+["']\s*\)/g, "");
/** 静态形态：`from "./x.js"` 与裸 `import "./x.js"`。 */
const RE_STATIC_FROM = /\bfrom\s*["']\.\/([\w.-]+\.js)["']/g;
const RE_STATIC_BARE = /\bimport\s*["']\.\/([\w.-]+\.js)["']/g;

function gzipKb(bytes) {
  return gzipSync(bytes, { level: 6 }).length / 1000;
}

/** 从 index.html 找入口 chunk 文件名。 */
function entryChunkName() {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const m = /<script[^>]+type=["']module["'][^>]+src=["'][^"']*?([\w.-]+\.js)["']/.exec(html);
  if (!m) throw new Error("dist/index.html 里找不到 type=module 的入口 script");
  return m[1];
}

/** 入口 + 静态 import 闭包（BFS）。返回 Map<chunk 文件名, {bytes, gzip}>。 */
function firstScreenChunks() {
  const eager = new Map();
  const queue = [entryChunkName()];
  while (queue.length) {
    const name = queue.shift();
    if (eager.has(name)) continue;
    const p = join(DIST, "assets", name);
    if (!existsSync(p) || !statSync(p).isFile()) throw new Error(`首屏引用了不存在的 chunk：${name}`);
    const bytes = readFileSync(p);
    eager.set(name, { bytes: bytes.length, gzip: gzipKb(bytes) });
    const text = stripDynamic(bytes.toString("utf8"));
    for (const re of [RE_STATIC_FROM, RE_STATIC_BARE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) if (!eager.has(m[1])) queue.push(m[1]);
    }
  }
  return eager;
}

/** 全部产物 chunk（首屏之外的即懒加载 chunk）。 */
function allChunks() {
  return readdirSync(join(DIST, "assets")).filter((n) => n.endsWith(".js"));
}
```

> 脚本余下部分（自检、构建、报表、退出码）按下面 Step 2–4 补完；**整文件必须 ≤300 行**，超了就把 `allChunks/allJsTotal` 一段删掉（它们只服务于报表，不服务于判据）。

- [ ] **Step 2: 补完 `--self-test`（仪器的三条自检，必须内置）**

```js
function selfTest() {
  const problems = [];
  // 1) 入口 chunk 必须真实存在于磁盘
  const entry = entryChunkName();
  if (!existsSync(join(DIST, "assets", entry))) problems.push(`入口 chunk 不存在：${entry}`);
  // 2) gzip 口径必须与 vite 打印值一致（用入口 chunk 的实测值对拍）
  //    已知校准点：单一 chunk 构建下 index-*.js 应为 654.72 kB（HEAD f12aba6d）
  const eager = firstScreenChunks();
  const total = [...eager.values()].reduce((a, c) => a + c.gzip, 0);
  console.log(`self-test: 入口=${entry} 首屏 chunk=${eager.size} 合计 gzip=${total.toFixed(2)} kB`);
  // 3) 无意义 chunk 名必须解析不到（证明「找不到就报错」这条路径真的会走）
  let threw = false;
  try { readFileSync(join(DIST, "assets", "zzz-not-a-real-chunk.js")); } catch { threw = true; }
  if (!threw) problems.push("不存在的 chunk 名没有抛错 —— 仪器坏了");
  if (problems.length) { problems.forEach((p) => console.error(`❌ ${p}`)); process.exit(2); }
  console.log("✅ self-test 通过");
  process.exit(0);
}
```

- [ ] **Step 3: 补完构建、报表与退出码**

```js
if (SELF_TEST) selfTest();

if (!NO_BUILD) {
  const r = spawnSync("npm", ["run", "build"], { cwd: APP, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error("❌ npm run build 失败"); process.exit(2); }
}
if (!existsSync(join(DIST, "index.html"))) { console.error("❌ 找不到 app/dist/index.html（先构建）"); process.exit(2); }

const eager = firstScreenChunks();
const eagerTotal = [...eager.values()].reduce((a, c) => a + c.gzip, 0);
const lazy = allChunks().filter((n) => !eager.has(n));
const lazyTotal = lazy.reduce((a, n) => a + gzipKb(readFileSync(join(DIST, "assets", n))), 0);

if (AS_JSON) {
  console.log(JSON.stringify({
    budgetKb: BUDGET_KB,
    firstScreen: { chunks: [...eager].map(([name, v]) => ({ name, gzipKb: Number(v.gzip.toFixed(2)) })), totalKb: Number(eagerTotal.toFixed(2)) },
    lazy: { count: lazy.length, totalKb: Number(lazyTotal.toFixed(2)) },
    pass: eagerTotal < BUDGET_KB,
  }, null, 2));
} else {
  console.log(`首屏 chunk（${eager.size} 个）：`);
  for (const [name, v] of eager) console.log(`  ${name.padEnd(34)} gzip ${v.gzip.toFixed(2).padStart(8)} kB`);
  console.log(`首屏 JS gzip 合计：${eagerTotal.toFixed(2)} kB ／ 预算 ${BUDGET_KB} kB ⇒ ${eagerTotal < BUDGET_KB ? "✅ 达标" : "❌ 超标"}`);
  console.log(`懒加载 chunk：${lazy.length} 个，gzip 合计 ${lazyTotal.toFixed(2)} kB`);
}
process.exit(eagerTotal < BUDGET_KB ? 0 : 1);
```

- [ ] **Step 4: 跑一次并存证（此时必然超标，这是预期的）**

```powershell
node scripts/check-bundle-budget.mjs 2>&1 | Out-File -Encoding utf8 ".superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp\budget-after-task2.txt"; "exit=$LASTEXITCODE"
node scripts/check-bundle-budget.mjs --no-build --self-test; "selftest-exit=$LASTEXITCODE"
```

预期：首屏 **1 个 chunk / gzip 654.72 kB** ⇒ `❌ 超标` + **exit 1**；self-test `✅` + exit 0。
> ⚠️ 第一条命令里的 `2>&1 |` 在这里**安全**（`node` 不往 stderr 写 warning 型噪声），但**更稳的写法是 `cmd /c "… > file 2>&1"`** —— 本项目对原生命令一律用后者。

- [ ] **Step 5: 提交**

```powershell
git diff --stat
git commit --only -m "build(scripts): add first-screen bundle budget gate" -- scripts/check-bundle-budget.mjs
```

> **2026-09-12 更正（Task 12 回写）**：上面这个 subject **51 字符，超 `AGENTS.md` §5 的 ≤50 字上限**，且**照抄落地**了（`f0592654`）。**门禁不会拦**（`commitlint.config.js` 的 `header-max-length` = **100**）。**Task 1 Step 7 的 subject 同为 51 字符**（`e46e0e82`）；本批计划里超限的提交命令共 **3 处**（第三处是 Task 7 Step 5 的 53 字符）。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `node scripts/check-bundle-budget.mjs --no-build` | `首屏 JS gzip 合计：654.72 kB ／ 预算 200 kB ⇒ ❌ 超标`，exit 1 |
| V2 | `node scripts/check-bundle-budget.mjs --no-build --self-test` | `✅ self-test 通过`，exit 0 |
| V3 | `node scripts/check-bundle-budget.mjs --no-build --json` | `firstScreen.totalKb` = `654.72`（±0.01）且 `firstScreen.chunks` 长度 = 1 |
| V4 | 仪器自检的「无意义串」一条 | Step 2 第 3 项：不存在的 chunk 名必须抛错（**在报告里贴出这段代码与它被触发的输出**） |
| V5 | `node scripts/line-limits.mjs --full` | exit 0 |

> **2026-09-12 追加（Task 12 回写）—— 本守卫交付后实测出两个缺口，读本节的后续批次必须先看这两条：**
> **(a) 嵌套输出路径盲区（真·静默假绿，已用真实构建复现）**：Step 1 的 `allChunks()` 只 `readdirSync(join(DIST,"assets"))` **平铺一层**，而 `firstScreen` 的正则 `[^"'/\\]+\.js` **排斥 `/`** ⇒ 若产物出现 `assets/vendor/*.js`，这些 chunk **既不计入首屏、也不计入懒加载**，守卫仍打印 `✅ 达标` + **exit 0**。Task 4 评审用「commit 自带规则表 + 一行 `"vendor/" + manualChunks(id)`」跑**真实 vite 构建**复现了这一假绿（产物 `assets/vendor/*.js`，守卫报「达标：余量 12.60 kB」，而真实首屏 650.34 kB）。**今天未触发**（产物全平铺、`VendorGroup` 返回值无 `/`、批 6 的 `vendor-gsap` 同样不含 `/`），但缺口是**活的**。
> **(b) 输出文案在说谎**：守卫把「非首屏」一律标成「**懒加载 chunk（仅动态可达）**」，它**从未验证动态可达性** —— 放一个**孤儿 chunk** 也会被计成「仅动态可达 1 个」。判定与冻结基线读数不受影响，但**这句输出是假的**（与本批宗旨「守卫的说法必须为真」同一条）。
> ⇒ 两条均**登记批 8**（修法建议：检测到 `assets/` 下有子目录或外部 `.js` 即 `fail()` exit 2 + `--self-test` 加一条嵌套夹具；文案改「非首屏 chunk（懒/孤儿未区分）」或真的验证动态可达性）。**完整证据见本计划 §收口回写 §瓶颈清单对应两行。**

---

### Task 3: `manualChunks` 纯函数 + 单测（`app/src/build/manualChunks.ts`）

> **为什么先做纯函数**：本仓的生成工作流是**自底向上（原子层 → 业务层 → 系统层）**。`manualChunks` 是一段**纯映射逻辑**，把它放进 `vite.config.ts` 会同时失去三样东西：`tsc` 的检查（`tsconfig.json` 的 `include` 只有 `src`，`vite.config.ts` **不在其中**）、vitest 的覆盖、以及 `line-limits` 的管辖。放进 `app/src/build/` 后三样全有。**本任务只新建文件，不接线。**

**Files:**
- Create: `app/src/build/manualChunks.ts`（≤300 行）
- Create: `app/src/build/manualChunks.test.ts`（≤300 行）
- Read: `app/package.json`（测试要读它的 `dependencies`）

**Interfaces:**
- Produces:
  - `export type VendorGroup = "vendor-gsap" | "vendor-react" | "vendor-tauri" | "vendor-katex" | "vendor-editor" | "vendor-canvas" | "vendor-md";`
  - `export function packageNameOf(moduleId: string): string | undefined` —— 从 rollup 模块 id 解析出**最内层**包名（`@scope/name` 两段）。
  - `export function vendorGroupOf(moduleId: string): VendorGroup | undefined`
  - `export function manualChunks(moduleId: string): string | undefined` —— 直接交给 vite 的 `output.manualChunks`（Task 4 接线）。
- Consumes: 无。

- [ ] **Step 1: 写测试（先红）**

```ts
/**
 * manualChunks.test.ts — vendor 分组规则的钉值测试（node 环境）。
 *
 * @ai-context: 为什么要有这个文件：分组规则一旦被子串匹配污染，懒加载边界会**静默失效**
 *              （构建照样成功、gzip 照样下降一点、但 GSAP 与 react 混在一个 chunk 里，
 *              批 6 的「GSAP 独立 chunk 懒加载」当场落空）。这是本批唯一无法靠人工 review
 *              稳定发现的失效模式，必须机器钉住。
 * @ai-context: 副作用：读 app/package.json（只读）。边界：只覆盖
 *              `dependencies`（devDependencies 不进浏览器产物）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { manualChunks, packageNameOf, vendorGroupOf, type VendorGroup } from "./manualChunks";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("packageNameOf", () => {
  it("取最内层 node_modules 之后的包名（嵌套依赖不能解析成外层）", () => {
    expect(packageNameOf("/r/node_modules/katex/dist/katex.mjs")).toBe("katex");
    expect(packageNameOf("/r/node_modules/rehype-katex/node_modules/katex/dist/katex.mjs")).toBe("katex");
    expect(packageNameOf("/r/node_modules/@codemirror/view/dist/index.js")).toBe("@codemirror/view");
    expect(packageNameOf("/r/app/src/App.tsx")).toBeUndefined();
    expect(packageNameOf("D:\\r\\node_modules\\react-dom\\client.js")).toBe("react-dom");
  });
});

describe("vendorGroupOf 钉值", () => {
  const cases: readonly (readonly [string, VendorGroup | undefined])[] = [
    ["/r/node_modules/react/index.js", "vendor-react"],
    ["/r/node_modules/react-dom/client.js", "vendor-react"],
    ["/r/node_modules/scheduler/index.js", "vendor-react"],
    ["/r/node_modules/react-markdown/lib/index.js", "vendor-md"],
    ["/r/node_modules/@xyflow/react/dist/esm/index.js", "vendor-canvas"],
    ["/r/node_modules/@xyflow/system/dist/esm/index.js", "vendor-canvas"],
    ["/r/node_modules/d3-zoom/src/index.js", "vendor-canvas"],
    ["/r/node_modules/zustand/esm/index.mjs", "vendor-canvas"],
    ["/r/node_modules/use-sync-external-store/shim/index.js", "vendor-canvas"],
    ["/r/node_modules/classcat/index.js", "vendor-canvas"],
    ["/r/node_modules/gsap/index.js", "vendor-gsap"],
    ["/r/node_modules/@gsap/react/dist/index.js", "vendor-gsap"],
    ["/r/node_modules/katex/dist/katex.mjs", "vendor-katex"],
    ["/r/node_modules/rehype-katex/lib/index.js", "vendor-katex"],
    ["/r/node_modules/hast-util-to-text/lib/index.js", "vendor-katex"],
    ["/r/node_modules/hast-util-from-dom/lib/index.js", "vendor-katex"],
    ["/r/node_modules/hast-util-to-jsx-runtime/lib/index.js", "vendor-md"],
    ["/r/node_modules/property-information/lib/index.js", "vendor-katex"],
    ["/r/node_modules/hastscript/index.js", "vendor-katex"],
    ["/r/node_modules/@tauri-apps/api/core.js", "vendor-tauri"],
    ["/r/node_modules/@tauri-apps/plugin-dialog/dist-js/index.js", "vendor-tauri"],
    ["/r/node_modules/codemirror/dist/index.js", "vendor-editor"],
    ["/r/node_modules/@codemirror/lang-markdown/dist/index.js", "vendor-editor"],
    ["/r/node_modules/@lezer/javascript/dist/index.js", "vendor-editor"],
    ["/r/node_modules/@marijn/find-cluster-break/src/index.js", "vendor-editor"],
    ["/r/node_modules/crelt/index.js", "vendor-editor"],
    ["/r/node_modules/micromark-core-commonmark/dev/index.js", "vendor-md"],
    ["/r/node_modules/mdast-util-to-hast/lib/index.js", "vendor-md"],
    ["/r/node_modules/unist-util-visit/index.js", "vendor-md"],
    ["/r/node_modules/vfile/index.js", "vendor-md"],
    ["/r/node_modules/remark-gfm/index.js", "vendor-md"],
    ["/r/node_modules/@ungap/structured-clone/esm/index.js", "vendor-md"],
    // 反例：应用源码与非 node_modules 路径一律交回 rollup 默认算法
    ["/r/app/src/App.tsx", undefined],
    ["/r/app/src/pages/NotesPage.tsx", undefined],
    ["/r/vendor/node_modules_backup/react/index.js", undefined],
    ["/r/node_modules/not-a-real-package/index.js", undefined],
  ];
  for (const [id, expected] of cases) {
    it(`${id} → ${String(expected)}`, () => expect(vendorGroupOf(id)).toBe(expected));
  }
});

describe("子串碰撞陷阱（批 1 六例假活教训的镜像）", () => {
  it("裸 includes('node_modules/react') 会把 react-dom / react-markdown / @xyflow/react 一起吞掉", () => {
    const naive = (id: string) => (id.includes("node_modules/react") ? "vendor-react" : undefined);
    // 先证明「朴素口径确实会错」——否则这条守卫是空转的
    expect(naive("/r/node_modules/react-dom/client.js")).toBe("vendor-react");
    expect(naive("/r/node_modules/@xyflow/react/dist/index.js")).toBe("vendor-react");
    // 再证明本实现不会
    expect(vendorGroupOf("/r/node_modules/react-dom/client.js")).toBe("vendor-react"); // 同组，但走的是精确匹配
    expect(vendorGroupOf("/r/node_modules/react-markdown/lib/index.js")).toBe("vendor-md");
    expect(vendorGroupOf("/r/node_modules/@xyflow/react/dist/index.js")).toBe("vendor-canvas");
  });

  it("manualChunks 是 vendorGroupOf 的直通（接线面不许有第二套逻辑）", () => {
    expect(manualChunks("/r/node_modules/gsap/index.js")).toBe("vendor-gsap");
    expect(manualChunks("/r/app/src/App.tsx")).toBeUndefined();
  });
});

describe("覆盖闸：package.json 的每个运行时依赖都必须有归属", () => {
  it("dependencies 全部可归组（漏一个就会被 rollup 默认算法打散，懒加载边界失效）", () => {
    const pkg = JSON.parse(readFileSync(join(HERE, "..", "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length).toBeGreaterThan(0);
    const ungrouped = deps.filter((d) => vendorGroupOf(`/r/node_modules/${d}/index.js`) === undefined);
    expect(ungrouped).toEqual([]);
  });
});
```

> ⚠️ **`package.json` 在 `app/` 下，`HERE` 是 `app/src/build/` ⇒ 相对路径是 `"..", "..", "package.json"`**（`join(HERE, "..", "..", "package.json")` = `app/package.json`）。**不要写成 `".."`** —— 那会去读 `app/src/package.json`（不存在），测试会以 `ENOENT` 红。
> ⚠️ `JSON.parse` 的返回标了类型断言；**本仓禁 `any`**，断言到具体形状是允许的（先例：`app/src/ui/tokens.drift.test.ts`）。若 `tsc` 报 `noUnusedLocals` 相关错误，检查是否有多余解构。

- [ ] **Step 2: 跑一次确认红**

```powershell
cd app; npx vitest run src/build/manualChunks.test.ts
```
预期：**FAIL** —— `Failed to resolve import "./manualChunks"`（模块还不存在）。把这条红的原文贴进报告。

- [ ] **Step 3: 写实现**

```ts
/**
 * manualChunks — 生产构建的 vendor 分组规则（纯函数、可单测）。
 *
 * @ai-context: 批 2 包体治理的原子层。Vite 的 `build.rollupOptions.output.manualChunks`
 *              接收模块 id，返回 chunk 名；返回 `undefined` 表示「交回 rollup 默认算法」。
 * @ai-context: 为什么**必须按「解析出的包名」精确匹配**，而不是 `id.includes("node_modules/react")`：
 *              本仓实测的子串碰撞 —— `node_modules/react` 同时是
 *              `react-dom` / `react-markdown` / `@xyflow/react` 的子串。用 includes 会把
 *              markdown 栈与画布栈并进 `vendor-react`，懒加载边界**静默失效**
 *              （构建照样成功、gzip 照样降一点，但批 6 的 GSAP 独立 chunk 承诺当场落空）。
 *              这是批 1 六例「裸 includes 判活」教训在构建配置上的镜像。
 * @ai-context: 为什么 GSAP 现在就在表里（而依赖还没装）：规格 §13 风险表要求
 *              「GSAP 独立 chunk 懒加载」。本函数用**包名精确匹配**表达这条承诺，
 *              因此 gsap 未安装时规则**天然惰性**（没有任何模块 id 会解析出包名 `gsap`），
 *              装了之后**零改动自动生效**。切不可改写成对象形式
 *              `{ "vendor-gsap": ["gsap"] }` —— 那会在 gsap 未安装时**直接让构建失败**。
 *
 * 副作用：无（纯函数）。
 * 边界：入参是 rollup 的模块 id（Windows 上可能含 `\`）；不解析 tsconfig paths；不处理虚拟模块（`\0` 前缀）。
 */

/** vendor 分组名（同时决定产物 chunk 的文件名前缀）。 */
export type VendorGroup =
  | "vendor-gsap"
  | "vendor-react"
  | "vendor-tauri"
  | "vendor-katex"
  | "vendor-editor"
  | "vendor-canvas"
  | "vendor-md";

/** 精确包名 → 分组。**先于前缀族匹配**，因此 `rehype-katex` 不会被 `rehype-` 抢走。 */
const EXACT: Readonly<Record<string, VendorGroup>> = {
  // 批 6 预留（本批不安装；规则惰性，见文件头注释）
  gsap: "vendor-gsap",
  "@gsap/react": "vendor-gsap",
  // React 运行时：必须同组，避免出现两份 React 实例
  react: "vendor-react",
  "react-dom": "vendor-react",
  scheduler: "vendor-react",
  // Tauri IPC
  "@tauri-apps/api": "vendor-tauri",
  "@tauri-apps/plugin-dialog": "vendor-tauri",
  // 数学渲染（katex 在 node_modules 里有两份：顶层 0.18.4 与 rehype-katex 嵌套的 0.16.47，
  // 但 `packageNameOf` 取最内层 ⇒ 两者都归到本组，不会出现「同名两 chunk」）
  katex: "vendor-katex",
  "rehype-katex": "vendor-katex",
  "hast-util-from-dom": "vendor-katex",
  "hast-util-to-text": "vendor-katex",
  "hast-util-from-html-isomorphic": "vendor-katex",
  "hast-util-is-element": "vendor-katex",
  "hast-util-parse-selector": "vendor-katex",
  hastscript: "vendor-katex",
  "property-information": "vendor-katex",
  "web-namespaces": "vendor-katex",
  // 编辑器（CodeMirror 6 无 scope 的几件）
  codemirror: "vendor-editor",
  crelt: "vendor-editor",
  "style-mod": "vendor-editor",
  "w3c-keyname": "vendor-editor",
  // 画布 / 图谱（无 scope 的几件）
  classcat: "vendor-canvas",
  zustand: "vendor-canvas",
  "use-sync-external-store": "vendor-canvas",
  // Markdown 管线
  "react-markdown": "vendor-md",
  unified: "vendor-md",
  bail: "vendor-md",
  trough: "vendor-md",
  vfile: "vendor-md",
  "vfile-message": "vendor-md",
  extend: "vendor-md",
  "is-plain-obj": "vendor-md",
  devlop: "vendor-md",
  zwitch: "vendor-md",
  ccount: "vendor-md",
  "longest-streak": "vendor-md",
  "markdown-table": "vendor-md",
  "trim-lines": "vendor-md",
  "escape-string-regexp": "vendor-md",
  "decode-named-character-reference": "vendor-md",
  "comma-separated-tokens": "vendor-md",
  "space-separated-tokens": "vendor-md",
  "html-url-attributes": "vendor-md",
  "style-to-js": "vendor-md",
  "style-to-object": "vendor-md",
  "inline-style-parser": "vendor-md",
  "estree-util-is-identifier-name": "vendor-md",
  "@ungap/structured-clone": "vendor-md",
};

/** 前缀族 → 分组。**按数组顺序匹配，先到先得**；不得加宽到能吃掉上面 EXACT 的包。 */
const PREFIX: readonly (readonly [RegExp, VendorGroup])[] = [
  [/^@codemirror\//, "vendor-editor"],
  [/^@lezer\//, "vendor-editor"],
  [/^@marijn\//, "vendor-editor"],
  [/^@xyflow\//, "vendor-canvas"],
  [/^d3-/, "vendor-canvas"],
  [/^micromark/, "vendor-md"],
  [/^mdast-util/, "vendor-md"],
  [/^hast-util/, "vendor-md"],
  [/^unist-util/, "vendor-md"],
  [/^remark-/, "vendor-md"],
  [/^rehype-/, "vendor-md"],
  [/^vfile/, "vendor-md"],
];

/** 从 rollup 模块 id 解析出**最内层** `node_modules` 之后的包名。 */
export function packageNameOf(moduleId: string): string | undefined {
  const id = moduleId.replace(/\\/g, "/");
  const marker = "/node_modules/";
  const at = id.lastIndexOf(marker);
  if (at < 0) return undefined;
  const seg = id.slice(at + marker.length).split("/");
  if (seg.length === 0 || seg[0] === "") return undefined;
  if (seg[0].startsWith("@")) return seg.length >= 2 && seg[1] !== "" ? `${seg[0]}/${seg[1]}` : undefined;
  return seg[0];
}

/** 模块 id → vendor 分组；非 node_modules 或未登记包返回 undefined（交回 rollup）。 */
export function vendorGroupOf(moduleId: string): VendorGroup | undefined {
  const name = packageNameOf(moduleId);
  if (name === undefined) return undefined;
  const exact = EXACT[name];
  if (exact !== undefined) return exact;
  for (const [re, group] of PREFIX) if (re.test(name)) return group;
  return undefined;
}

/** 直接交给 `build.rollupOptions.output.manualChunks`（Task 4 接线）。 */
export function manualChunks(moduleId: string): string | undefined {
  return vendorGroupOf(moduleId);
}
```

- [ ] **Step 4: 跑测试确认绿，并检查行数**

```powershell
cd app; npx vitest run src/build/manualChunks.test.ts
cd ..; node scripts/line-limits.mjs --full
$p = "app\src\build\manualChunks.ts"; "manualChunks.ts = " + [System.IO.File]::ReadAllLines((Resolve-Path $p),[Text.Encoding]::UTF8).Count
$q = "app\src\build\manualChunks.test.ts"; "manualChunks.test.ts = " + [System.IO.File]::ReadAllLines((Resolve-Path $q),[Text.Encoding]::UTF8).Count
```
预期：全绿（含覆盖闸那条）；`line-limits --full` exit 0（两个新文件都 ≤300 ⇒ **不新增任何豁免登记**）。

- [ ] **Step 5: 跑全量门禁**

```powershell
cd app; npx tsc --noEmit; npx vitest run
```
预期：`tsc` 0 错；vitest **124 文件 → 125 文件**、**1124 用例 → 1124 + N 用例**（N = 本任务新增用例数，**只增不减**；把实际数字写进报告）。

- [ ] **Step 6: 提交**

```powershell
git diff --stat
git commit --only -m "build(app): add pure manualChunks vendor grouping" -- app/src/build/manualChunks.ts app/src/build/manualChunks.test.ts
```

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/build/manualChunks.test.ts` | 全绿；含「子串碰撞陷阱」两条与「覆盖闸」一条 |
| V2 | 该测试里 `gsap` / `@gsap/react` 两条 | PASS（**GSAP 未安装也能证明它在独立组**，这是 Task 5 的核心证据） |
| V3 | `cd app; npx tsc --noEmit` | exit 0 |
| V4 | `node scripts/line-limits.mjs --full` | exit 0，且 `301–600 档` 仍为 **123**（两文件均 ≤300，未新增登记） |
| V5 | `git show --stat HEAD` | 只含两个新文件 |

---

### Task 4: `vite.config.ts` 接线 + 分块拓扑验收

**Files:**
- Modify: `app/vite.config.ts`（现 40 行 → 预计 ~52 行；**不在 `line-limits` 的 `SCAN_DIRS` 内，但仍须自守 ≤300**）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/build-task4.txt`（不入库）

**Interfaces:**
- Consumes: `manualChunks` from `./src/build/manualChunks`（Task 3）
- Produces: 生产构建的 chunk 拓扑（`vendor-react` / `vendor-tauri` / `vendor-katex` / `vendor-editor` / `vendor-canvas` / `vendor-md` + 自动的 `index`）。**这些 chunk 名是 Task 9/10/11 报表的稳定指称对象。**

- [ ] **Step 1: 记录开工读数**

```powershell
node scripts/check-bundle-budget.mjs --no-build --json
node scripts/bundle-eager-graph.mjs
```
预期：首屏 654.72 kB / 1 chunk；可达源文件 **251**、包 **15**。（Task 4 只改分块拓扑，**不应改变这两个可达性数字** —— 它是本任务的对照不变量。）

- [ ] **Step 2: 改 `app/vite.config.ts`（按它真实的异步函数形态加 `build` 段）**

在 `plugins: [react()],` 之后插入：

```ts
  // 批 2 包体治理：vendor 分组。
  // Why 放在这里而不是对象形式 `{ "vendor-react": ["react", …] }`：
  //   ① 对象形式在包未安装时**直接让构建失败**（rollup 解析不到入口），
  //      而本批必须为批 6 的 GSAP 预留一个「现在惰性、将来自动生效」的槽；
  //   ② 函数形式可以按**解析出的包名**精确匹配，避开 `node_modules/react`
  //      同时是 react-dom / react-markdown / @xyflow/react 子串的碰撞陷阱。
  // 规则与单测见 src/build/manualChunks.ts（纯函数，tsc 与 vitest 都覆盖得到）。
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => manualChunks(id),
      },
    },
  },
```

并在文件顶部加 import：

```ts
import { manualChunks } from "./src/build/manualChunks";
```

> ⚠️ **`vite.config.ts` 不在 `app/tsconfig.json` 的 `include`（只有 `["src"]`）里 ⇒ `tsc --noEmit` 看不到它**，语法/类型错误只能靠 `vite build` 暴露。因此本任务**必须**跑构建，不能只跑 `tsc`。
> ⚠️ **`build` 键在 `defineConfig(async () => ({ … }))` 返回的对象里**，与现有 `plugins`/`clearScreen`/`server` 平级 —— 不要误插进 `server` 里。

- [ ] **Step 3: 构建并记录新拓扑**

```powershell
$d = "D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp"
cmd /c "cd /d `"D:\Program own\aicode\work space\Entropydecrease\app`" && npm run build > `"$d\build-task4.txt`" 2>&1"
"exit=$LASTEXITCODE"
node scripts/check-bundle-budget.mjs --no-build
```

预期：`exit=0`；产物出现 `vendor-react-*.js` / `vendor-tauri-*.js` / `vendor-katex-*.js` / `vendor-editor-*.js` / `vendor-canvas-*.js` / `vendor-md-*.js` 六个 vendor chunk；**首屏 gzip 仍 ≈ 654.72 kB（±3 kB）⇒ 仍 `❌ 超标`，这是预期的** —— 分块只改拓扑、不改首屏总量（见 §实测基线 表 1 的规格漂移第 2 处）。
> **本任务的验收不是「gzip 降了」，而是**：① 六个 vendor chunk 全部生成；② 每个 chunk 的内容与它声明的族一致（用一个**已知只属于某族**的字符串抽查，见 V2）；③ 首屏 gzip 变化 ≤ 3 kB（超过说明 `manualChunks` 意外地把某些模块复制进了多个 chunk，必须查）。

- [ ] **Step 4: 检查组内内容（用「只有这一族才有的字符串」抽查）**

```powershell
cd app
# react-dom 的独有串只应出现在 vendor-react 里
Select-String -Path "dist/assets/vendor-react-*.js" -Pattern "react-dom" -Quiet
# @xyflow 的独有串只应出现在 vendor-canvas 里（而**不应**出现在 vendor-react 里）
Select-String -Path "dist/assets/vendor-canvas-*.js" -Pattern "xyflow" -Quiet
Select-String -Path "dist/assets/vendor-react-*.js" -Pattern "xyflow" -Quiet
```
预期：前两条 `True`；**第三条 `False`**（`@xyflow/react` 没被并进 `vendor-react` —— 这正是 Task 3 那条子串碰撞守卫在生产产物上的落地证据）。**把三条输出贴进报告。**

- [ ] **Step 5: 全量门禁 + 提交**

```powershell
cd app; npx tsc --noEmit; npx vitest run
cd ..; node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
git diff --stat
git commit --only -m "build(app): wire vendor manualChunks into vite" -- app/vite.config.ts
```

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npm run build` | exit 0；产物含 6 个 `vendor-*` chunk |
| V2 | Step 4 的三条 `Select-String` | `True` / `True` / **`False`** |
| V3 | `node scripts/check-bundle-budget.mjs --no-build` | 首屏 gzip 与 654.72 相差 **≤3 kB** |
| V4 | `node scripts/bundle-eager-graph.mjs` | 仍为 **251 / 15**（分块不改变源码可达性） |
| V5 | `cd app; npx vitest run` | **124 文件 / 1124 用例**，逐字持平（本任务不改源码） |
| V6 | 六条门禁 | 全 exit 0 |

---

### Task 5: GSAP 独立 chunk 预留槽 + 反例守卫（**不装 GSAP**）

> **本任务不装任何依赖、不改任何产物。** 它交付的是「批 6 装了 GSAP 之后，它必然落进自己的懒加载 chunk」这件事的**机器证明**，且证明必须在 GSAP 缺席时就能跑。

**Files:**
- Modify: `app/src/build/manualChunks.test.ts`（新增一个 `describe` 块）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/gsap-slot.md`（不入库，存证据）

**Interfaces:**
- Consumes: `vendorGroupOf` / `manualChunks`（Task 3）
- Produces: 无新导出面。**产出的是一条可复跑的判据**，Task 12 会把它写进规格 §13 的缓解栏。

- [ ] **Step 1: 先证明「GSAP 现在没有装」**

```powershell
# 仪器自检：(a) 能命中一个已知存在的依赖名；(b) 对 gsap 报 0
Select-String -Path app/package.json -Pattern '"react"' | Measure-Object | Select-Object -ExpandProperty Count
Select-String -Path app/package.json -Pattern '"gsap"' | Measure-Object | Select-Object -ExpandProperty Count
Select-String -Path app/package.json -Pattern '"@gsap/react"' | Measure-Object | Select-Object -ExpandProperty Count
Test-Path app/node_modules/gsap
```
预期：`1` / **`0`** / **`0`** / **`False`**。第一条命中证明仪器有效，后三条是本任务的立足点。
> ⚠️ 不要用 `Get-ChildItem app\src -File -Include *.tsx` 这类写法（`-Include` 无 `-Recurse` 时**返回 0 个文件**，2026-09-12 实测踩到）。上面的 `Select-String -Path <单文件>` 不涉及该陷阱。

- [ ] **Step 2: 新增守卫（追加到 `manualChunks.test.ts` 末尾）**

```ts
describe("批 6 预留：GSAP 必须落进独立懒加载 chunk（本批不安装 GSAP）", () => {
  it("GSAP 的两个包名都归 vendor-gsap，且与 react 不同组", () => {
    const gsap = vendorGroupOf("/r/node_modules/gsap/index.js");
    const gsapReact = vendorGroupOf("/r/node_modules/@gsap/react/dist/index.js");
    expect(gsap).toBe("vendor-gsap");
    expect(gsapReact).toBe("vendor-gsap");
    expect(gsap).not.toBe(vendorGroupOf("/r/node_modules/react/index.js"));
  });

  it("分组表里存在 vendor-gsap 槽位，而 package.json 里此刻没有 gsap（两者必须同时成立）", () => {
    const pkg = JSON.parse(readFileSync(join(HERE, "..", "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    // 槽位在（上一条已证）且依赖不在 —— 一旦批 6 装了 gsap，这条会红，
    // 提醒执行者：该去 build 一次并核对 vendor-gsap chunk 真的独立生成、且只在动态 import 里。
    expect(Object.keys(all).filter((d) => d === "gsap" || d === "@gsap/react")).toEqual([]);
    expect(vendorGroupOf("/r/node_modules/gsap/index.js")).toBe("vendor-gsap");
  });

  it("反例：vendor-gsap 槽位不得被任何前缀规则吞掉（防将来有人加宽 ^g 前缀）", () => {
    expect(vendorGroupOf("/r/node_modules/gsap-core/index.js")).toBeUndefined();
    expect(vendorGroupOf("/r/node_modules/not-gsap/index.js")).toBeUndefined();
  });
});
```

> ⚠️ 第三条是**反例守门**（批 0-D 的范式 B）：它证明 `vendor-gsap` 来自**精确包名**而不是某个宽松前缀 —— 否则 `gsap-core` / `not-gsap` 这类包会被误并进来。**没有这条，前两条可能因一个过宽的规则而假绿。**

- [ ] **Step 3: 跑绿并写证据**

```powershell
cd app; npx vitest run src/build/manualChunks.test.ts
Select-String -Path vite.config.ts -Pattern "manualChunks" | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" }
```
预期：全绿；`vite.config.ts` 里 `manualChunks` 接线行可见（Task 4 产物）。

- [ ] **Step 4: 把「批 6 落地清单」写进 `tmp/gsap-slot.md`（供 Task 11/12 引用）**

必须写全：① 批 6 装 GSAP 后**必须**用 `import()`（静态 import 会让它落进首屏，槽位形同虚设）；② 判据 = 构建产物里出现 `vendor-gsap-*.js` **且** `node scripts/check-bundle-budget.mjs --no-build --json` 的 `firstScreen.chunks` **不含**它；③ 本批已把这条写进规格 §13 缓解栏（Task 12 执行）。

- [ ] **Step 5: 全量门禁 + 提交**

```powershell
cd app; npx tsc --noEmit; npx vitest run
cd ..; node scripts/line-limits.mjs --full
git diff --stat
git commit --only -m "test(build): guard reserved gsap vendor chunk slot" -- app/src/build/manualChunks.test.ts
```

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/build/manualChunks.test.ts` | 新增 3 条全绿 |
| V2 | Step 1 的四条探测 | `1` / `0` / `0` / `False` |
| V3 | `Test-Path app/node_modules/gsap` | `False`（**本批结束时仍须为 `False`** —— 装了 GSAP 就是越界，STOP 报控制方） |
| V4 | `cd app; npm run build` 后 `Get-ChildItem app/dist/assets -Filter "vendor-gsap*"` | **空**（槽位惰性：没有模块会命中它） |
| V5 | `node scripts/check-bundle-budget.mjs --no-build` | 首屏不含 `vendor-gsap`，gzip 与 Task 4 持平 |

---

### Task 6: 按页动态 import + 首访挂载保活（9 页）

> ⛔ **前置门禁：本任务的 Step 1 必须先确认控制方已就 Global Constraints 的「★ 控制方待裁决项」给出书面裁决，且裁决为「授权路线 B′」。若裁决为「否掉 B′」或裁决不存在 ⇒ 本任务整体跳过，改为在报告里写「未做（登记给批 5）」，并**照常执行 Task 7–12**。**
> **这是本批唯一会改变运行行为的任务**（未访问过的页面在启动时不再挂载）。改动集中在一个文件，可单点回退。

**Files:**
- Modify: `app/src/App.tsx`（现 **439 行**，301–600 档已登记；改后预计 ~430 行，**仍须落在 ≤600 且如实复核**）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/build-task6.txt`（不入库）

> **2026-09-12 更正（Task 12 回写，原文一律保留）**：本任务的 Files 清单**漏了一项必须的改动** —— `docs/standards/line-limit-exemptions.md`。`App.tsx` 实测 **439 → 519 行**（仍落 301–600 档），登记值必须由 `node scripts/line-limits.mjs --write` 刷新，否则 `line-limits --full` 的 (e)「登记值 == 实测值」当场变红。**Task 8 的 Files 清单有同一处遗漏**。
> **2026-09-12 更正（Task 12 回写）**：本任务全篇写的「**9 页**按页 `lazy`」是**计划态**，**交付态是 8 懒 + 课堂页静态**（控制方 2026-09-12 裁决 2 末条：课堂是默认页，懒它等于首屏必拉一次动态 chunk，且该 chunk 首屏即被抓取却被记作 lazy ⇒ **首屏读数被低估 20.04 kB**）。受影响的行：**L1101**（预期「页面静态 import = 9」）、**L1104**（Step 3 标题）、**L1109**（注释「9 个页面」）、**L1114**（`ClassroomPage` 不在交付的 lazy 清单里）、**L1236**（提交 subject 实为 `perf(app): lazy-load eight pages on first visit`，见 `62c4c369`）、**L1243 V1**（实测 **8**）、**L1244 V2**（实测 **1**，不是 0）。

**Interfaces:**
- Consumes: Task 4 的 vendor chunk 拓扑
- Produces: `PageSlot` 局部组件（文件内，不导出）—— Task 7/8 沿用同一模式改另两处。

- [ ] **Step 1: 核对路线裁决（硬前置）**

```powershell
Select-String -Path ".superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\progress.md" -Pattern "路线|裁决|B′|B'" | ForEach-Object { "$($_.LineNumber): $($_.Line)" }
```
预期：能看到控制方对本批路线的书面裁决。**没有就 STOP**，报告「待裁决项未结清」，并转 Task 7。
同时固化不变量：`cd app; npx vitest run` → **124 / 1124**（本任务改完必须逐字持平）。

- [ ] **Step 2: 备份四类影响面读数**

```powershell
node scripts/bundle-eager-graph.mjs
node scripts/check-bundle-budget.mjs --no-build
cd app
Select-String -Path "src\App.tsx" -Pattern '^import .+ from "\./pages/' | Measure-Object | Select-Object -ExpandProperty Count
```
预期：**251 / 15 包**；首屏 654.72 kB（6 个 vendor chunk 但总和不变）；**页面静态 import = 9**。
> 第三条是「仪器自检」：若返回 `0`，说明你的正则没命中已知存在的 9 行（**那 9 行确实在 `App.tsx:20-34`**），仪器坏了，先修仪器再往下走。

- [ ] **Step 3: 把 9 个静态 import 换成 `lazy` 工厂**

把 `app/src/App.tsx:20-34` 的 9 行 `import X from "./pages/X";` 全部删除，替换为：

```tsx
// 批 2 包体治理：9 个页面从静态 import 改为按页动态 import。
// @ai-context: 「保留挂载（TD-004）」的语义按页保留 —— **访问过的页常驻、永不卸载**；
//              只是「从未访问过的页」不再进入首屏 module graph。
// @ai-context: 不引入路由库（规格 §3 红线 2）：入口仍是 useState<Page> + NAV_ITEMS，
//              只是每个页面成为一个独立 chunk。
const ClassroomPage = lazy(() => import("./pages/ClassroomPage"));
const NotesPage = lazy(() => import("./pages/NotesPage"));
const SessionsPage = lazy(() => import("./pages/SessionsPage"));
const ActionPage = lazy(() => import("./pages/ActionPage"));
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const KnowledgePage = lazy(() => import("./pages/KnowledgePage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
```

并把 `:15` 的 react import 改为：

```tsx
import { lazy, Suspense, useEffect, useRef, useState } from "react";
```

> `useRef` 已在文件中使用（`toastTimer`），**必须保留**，否则 `npx tsc --noEmit` 会报 `TS6133`。

- [ ] **Step 4: 加页容器组件 + 挂载闸门**

在 `MainShell` 函数**之前**（`App` 函数之后）加入：

```tsx
/**
 * PageSlot — 页面容器：首访挂载 + 保活 + display 门控 + 独立 Suspense。
 *
 * @ai-context: 批 2 包体治理的挂载闸门，也是「保留挂载」语义的唯一实现点。
 *   · mounted=false ⇒ 整棵子树不渲染 ⇒ 该页的 lazy chunk **不会被请求**（首屏收益的来源）；
 *   · mounted=true 之后永不回到 false ⇒ 已访问页面常驻（TD-004 保活语义，状态与事件监听不重置）；
 *   · 每页一个独立 Suspense（fallback=null）：只有**新挂载**的页会挂起，
 *     已经可见的页不会因为邻居加载而被替换成 fallback（避免可见的闪烁）。
 * @ai-context: 为什么 fallback 是 null 而不是原语层的 Loading：本批是**尺寸治理批**，
 *   引入原语会把它连同 CSS 一起拉进首屏，与目标冲突；「首访加载态」登记给批 3/4
 *   （壳层与加载原语一起做），见计划 Task 11 的瓶颈清单。
 * @ai-context: 动态 import 失败时 React 会把它抛到最近的错误边界 —— App.tsx:87 的
 *   AppErrorBoundary 仍在最外层包着 MainShell，因此「chunk 加载失败」有兜底 UI，不会白屏。
 * 副作用：无。边界：children 是懒组件元素，未 mounted 时不会被 React 渲染 ⇒ 不触发 dynamic import。
 */
function PageSlot({ show, mounted, children }: { show: boolean; mounted: boolean; children: React.ReactNode }) {
  if (!mounted) return null;
  return (
    <div style={{ flex: 1, display: show ? "block" : "none", overflow: "hidden" }}>
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
```

在 `MainShell` 内、`const [page, setPage] = useState<Page>("classroom");` 之后加入：

```tsx
  // 批 2：首访挂载集合。初始只有默认页 —— 其余页面在首次被选中后的下一帧挂载。
  // @ai-context: 用 useState + useEffect 而不是「渲染期 ref.add」：渲染期改 ref 在
  //   StrictMode 下虽幂等，但仍是渲染副作用；本仓 React 19 StrictMode 会双调用渲染。
  //   代价是切页时首帧内容区为空（本来也要等 chunk 下载），无观感回归。
  const [mountedPages, setMountedPages] = useState<ReadonlySet<Page>>(() => new Set<Page>(["classroom"]));
  useEffect(() => {
    setMountedPages((prev) => (prev.has(page) ? prev : new Set(prev).add(page)));
  }, [page]);
```

- [ ] **Step 5: 把 9 个容器替换成 `PageSlot`**

`:311-419` 的 9 个 `<div style={{ flex: 1, display: page === "X" ? "block" : "none", overflow: "hidden" }}>…</div>` 逐个改为 `<PageSlot show={page === "X"} mounted={mountedPages.has("X")}>…</PageSlot>`，**子元素与 props 一字不改**。逐页对照：

```tsx
<PageSlot show={page === "classroom"} mounted={mountedPages.has("classroom")}>
  <ClassroomPage onOpenSessions={(id) => { setFocusSessionId(id); setPage("sessions"); }} />
</PageSlot>
<PageSlot show={page === "sessions"} mounted={mountedPages.has("sessions")}>
  <SessionsPage … 原 props 逐字保留 … />
</PageSlot>
<PageSlot show={page === "notes"} mounted={mountedPages.has("notes")}>
  <NotesPage … 原 props 逐字保留 … />
</PageSlot>
<PageSlot show={page === "action"} mounted={mountedPages.has("action")}>
  <ActionPage active={page === "action"} />
</PageSlot>
<PageSlot show={page === "review"} mounted={mountedPages.has("review")}>
  <ReviewPage … 原 props 逐字保留 … />
</PageSlot>
<PageSlot show={page === "chat"} mounted={mountedPages.has("chat")}>
  <ChatPage … 原 props 逐字保留 … />
</PageSlot>
<PageSlot show={page === "knowledge"} mounted={mountedPages.has("knowledge")}>
  <KnowledgePage … 原 props 逐字保留 … />
</PageSlot>
<PageSlot show={page === "goals"} mounted={mountedPages.has("goals")}>
  <GoalsPage />
</PageSlot>
<PageSlot show={page === "settings"} mounted={mountedPages.has("settings")}>
  <SettingsPage active={page === "settings"} />
</PageSlot>
```

> ⚠️ **`… 原 props 逐字保留 …` 不是占位符**：实施者必须打开 `App.tsx` 把该容器内**原有的全部 props 与 JSX 注释**原样搬进 `PageSlot`。九处替换的验收判据是 **`git diff` 里 `<XxxPage` 的 props 行数不变**（见 V3）。

- [ ] **Step 6: 构建 + 三条测量**

```powershell
$d = "D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp"
cmd /c "cd /d `"D:\Program own\aicode\work space\Entropydecrease\app`" && npm run build > `"$d\build-task6.txt`" 2>&1"
"exit=$LASTEXITCODE"
node scripts/check-bundle-budget.mjs --no-build
node scripts/bundle-eager-graph.mjs
cd app; (Get-ChildItem dist/assets -Filter "*.js").Count
```
预期：`exit=0`；首屏 gzip **显著下降**（应落到 200–320 区间，因为 `AiConversationDock` 仍静态在首屏 —— Task 8 才摘掉它）；可达源文件应降到 **≈51**（与 §表 3「路线 B」行一致）；产物 chunk 数明显增加（每个页面 + 若干共享 chunk）。

- [ ] **Step 7: 全量门禁（本任务最关键的一步）**

```powershell
cd app; npx tsc --noEmit; npx vitest run
cd ..; node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
```
预期：**vitest 必须逐字为 `124 文件 / 1124 用例` 全绿**。若有任何一条红 ⇒ **回退本任务**（`git restore` 被禁止，改用 `git checkout HEAD -- app/src/App.tsx` 也被禁止 ⇒ 正确做法是**用 `git show HEAD:app/src/App.tsx` 读出原文、以写文件方式还原**，然后重新设计边界），并在报告里写明「该边界不可为：会使 N 条既有断言失效」。**绝不修改任何测试文件来迁就。**

- [ ] **Step 8: 提交**

```powershell
git diff --stat
git commit --only -m "perf(app): lazy-load nine pages on first visit" -- app/src/App.tsx
```

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `Select-String -Path app/src/App.tsx -Pattern 'lazy\(\(\) => import\("\./pages/' \| Measure-Object` | **9** |
| V2 | `Select-String -Path app/src/App.tsx -Pattern '^import .+ from "\./pages/' \| Measure-Object` | **0**（仪器自检：同一命令对 `vite.config.ts` 附近的已知串须能命中，见 V6） |
| V3 | `git diff -- app/src/App.tsx` 里九处 `<XxxPage` 的 props 行 | 与改动前**逐字相同**（评审者按 diff 逐条核对，**这是本任务唯一的等价性证据**） |
| V4 | `node scripts/bundle-eager-graph.mjs` | 可达源文件 **≈51**（±3）；包清单里**不再有** `codemirror` / `@codemirror/*` / `@xyflow/react` / `katex` / `rehype-katex` |
| V5 | `node scripts/check-bundle-budget.mjs --no-build` | 首屏 gzip **< 330 kB**（本任务预期值；写实际值进报告） |
| V6 | `cd app; npx vitest run` | **124 文件 / 1124 用例全绿**，且 `git status --short` 里**没有任何测试文件被改** |
| V7 | `[System.IO.File]::ReadAllLines("app\src\App.tsx",[Text.Encoding]::UTF8).Count` | **≤600**（仍落在已登记的 301–600 档；若 >600 ⇒ 立即 STOP，红线违规） |

> **2026-09-12 实测更正（Task 12 回写）**：**V1 = 8**（不是 9）· **V2 = 1**（不是 0，留下的是静态 `ClassroomPage`）—— 见上方 Files 节的两条更正。**V6 的 vitest 基线过期**：交付时是 **125 文件 / 1233 用例**（批 2 净增 1 个测试文件 `app/src/build/manualChunks.test.ts`，全批 **0 处断言修改 / 0 处新增 `await` / 0 处改 mock**，Task 6 自己前后逐字相同）。本表 V1–V7 其余各项实测通过；`App.tsx` 实际落在 **519 行**。

---

### Task 7: 两个窗口变体懒加载（`?float=1` / `?overlay=1`）

> **为什么单独一个任务**：这两个面板今天被 `App.tsx:38-39` **静态 import**，因此**采集浮窗**（`alwaysOnTop` 常驻窗口）与**覆盖层截图窗**每次打开都要加载完整主壳（2,057 kB JS）。二者各自只在**自己的窗口**里被渲染（`:72-83` 的两个早返回），是纯度最高的懒加载边界。它与 Task 6 **不共享代码路径**，可独立回退。

**Files:**
- Modify: `app/src/App.tsx`
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/build-task7.txt`（不入库）

**Interfaces:**
- Consumes: Task 6 的 `PageSlot` 模式与 `Suspense` import
- Produces: 两个窗口变体的独立 chunk（`CaptureFloatPanel` 闭包 / `CaptureOverlayPanel` 闭包）

- [ ] **Step 1: 记录开工读数**

```powershell
node scripts/check-bundle-budget.mjs --no-build
Select-String -Path app/src/App.tsx -Pattern '^import .+ from "\./components/(CaptureFloatPanel|CaptureOverlayPanel)"' | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" }
```
预期：能看到 `:38` / `:39` 两行（**这就是仪器自检** —— 若 0 行说明正则写错了）。

- [ ] **Step 2: 改两处 import 为 `lazy`**

```tsx
// 批 2：两个窗口变体面板改为按需加载。
// @ai-context: 这两个面板只在**自己的窗口**里渲染（?float=1 / ?overlay=1 的早返回，
//   见 App() 函数顶部），主窗永远用不到；静态 import 会让采集浮窗（alwaysOnTop 常驻）
//   与覆盖层窗口每次启动都拉完整主壳。改为 lazy 后它们各自成为独立 chunk。
const CaptureFloatPanel = lazy(() => import("./components/CaptureFloatPanel"));
const CaptureOverlayPanel = lazy(() => import("./components/CaptureOverlayPanel"));
```

- [ ] **Step 3: 给两个早返回包上 `Suspense`**

```tsx
  if (query.get("overlay") === "1") {
    return (
      <Suspense fallback={null}>
        <CaptureOverlayPanel />
      </Suspense>
    );
  }
  if (query.get("float") === "1") {
    return (
      <CaptureStatusProvider>
        <Suspense fallback={null}>
          <CaptureFloatPanel />
        </Suspense>
      </CaptureStatusProvider>
    );
  }
```

> ⚠️ `float` 分支里 `<CaptureStatusProvider>` **必须留在 Suspense 外层**：provider 是该窗口内「每窗恰一个实例」的采集状态源（`App.tsx:6-8` 的 `@ai-context` 明写），把它塞进 Suspense 会改变它的挂载时机。

- [ ] **Step 4: 构建 + 量两个窗口变体的首屏**

```powershell
$d = "D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp"
cmd /c "cd /d `"D:\Program own\aicode\work space\Entropydecrease\app`" && npm run build > `"$d\build-task7.txt`" 2>&1"
node scripts/check-bundle-budget.mjs --no-build
cd app; Get-ChildItem dist/assets -Filter "*.js" | Sort-Object Length -Descending | Select-Object -First 12 Name, @{n="kB";e={[math]::Round($_.Length/1000,2)}}
```
预期：主窗首屏 gzip **再降一截**；产物里出现包含 `CaptureOverlayPanel` 内容的小 chunk。

> **窗口变体首屏的度量**：本批不做第二套入口 HTML，因此窗口变体首屏 = `index.html` 入口 chunk 的 gzip（**同一份**）＋ **零** vendor 依赖（因为早返回在 `MainShell` 之前，9 个页面与 vendor 全部不会被拉）。⇒ 实测判据改为：`check-bundle-budget.mjs --json` 里 `firstScreen.chunks` 只有入口那一个 chunk 时，`totalKb` 就是窗口变体首屏的**上界**。把这条推理与实测值一起写进报告（Task 11 会引用）。

> **2026-09-12 更正（Task 12 回写）—— 上面这条推理是错的，实测推翻**：变体首屏**不是**「入口 + 零 vendor」，而是 **入口 + 4 个 vendor chunk**（`vendor-react` / `vendor-md` / `vendor-katex` / `vendor-tauri`）。根因：**三个窗口共用同一份 `index.html`**（已证：恰 1 个 `<script type=module>`、`index.html` 里 0 处 `float=`/`overlay=`；Rust 用 `WebviewUrl::App("index.html?float=1")` 打开），⇒ **入口的静态闭包逐字节相同**，早返回只能切断**动态**边，**切不断静态**边。
> **实测**（Task 7/Task 10）：`?float=1` **97.29 kB** · `?overlay=1` **94.19 kB**（口径 = 入口静态闭包 ∪ 本变体动态 chunk）。
> ⇒ 连带作废的还有「变体 < 60 kB」这条**建议项**：`vendor-react` 单独就是 **60,367 B > 60 kB** ⇒ **任何渲染 React 的窗口都不可能 < 60 kB**，该值**结构性不可达**（幸好控制方裁决 3 已把它定为建议项而非硬门禁）。完整推理与两行实测见本计划 §收口回写 §瓶颈清单。

- [ ] **Step 5: 全量门禁 + 提交**

```powershell
cd app; npx tsc --noEmit; npx vitest run
cd ..; node scripts/line-limits.mjs --full; node scripts/docs-check.mjs
git diff --stat
git commit --only -m "perf(app): lazy-load capture float and overlay panels" -- app/src/App.tsx
```

> **2026-09-12 更正（Task 12 回写）**：上面这个 commit subject **53 字符，超 `AGENTS.md` §5 的 ≤50 字上限**。交付时改用 **42 字符**的 `perf(app): lazy-load window variant panels`（`63536018`，同一动作、同一显式路径）。
> ⚠️ **Task 12 逐条普查（码点计数，脚本 `tmp/task12/subject-len.mjs`）发现：计划里超限的提交命令不是 1 处而是 3 处** —— 本行（53）· **Task 1 步骤（L400，51）** · **Task 2 Step 5（L582，51）**；后两条**被逐字照抄落地**（`e46e0e82` / `f0592654`）。**根因是这条规则没有任何机器门禁**：`commitlint.config.js` 沿用 `@commitlint/config-conventional` 的 `header-max-length = 100`，**未覆盖为 50**，故 51 字符的提交**能通过 commit-msg 钩子**（已实测：两条确实入库）。⇒ 后续批次派发词里的提交命令**必须人工数字符数**（或另立一条 `header-max-length` 规则 —— 登记批 8）。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `Select-String -Path app/src/App.tsx -Pattern 'import\("\./components/Capture(Float|Overlay)Panel"\)' \| Measure-Object` | **2** |
| V2 | `Select-String -Path app/src/App.tsx -Pattern '^import Capture(Float|Overlay)Panel' \| Measure-Object` | **0**；同仪器对 `^import BrowserChrome` 须命中 **1**（自检） |
| V3 | `git diff` 里 `<CaptureStatusProvider>` 仍在 `<Suspense>` **外层** | 是 |
| V4 | `cd app; npx vitest run` | **124 / 1124** 全绿，测试文件 0 改动 |
| V5 | `node scripts/check-bundle-budget.mjs --no-build --json` | `firstScreen.chunks` 里**不含**含 `CaptureFloat`/`CaptureOverlay` 的 chunk |

---

### Task 8: 对话面板首开挂载（`AiConversationDock` + 保活）

> **这是达标链条的最后一环**（见 §实测基线 表 3 的关键发现）：`AiConversationDock` → `TaskConversationView` → `ChatMessageMarkdown` → `rehype-katex` + `katex` CSS，整条 **≈153 kB gzip** 的栈今天就靠这一条静态 import 挂在首屏。摘掉它，首屏才可能进 200 kB。

**Files:**
- Modify: `app/src/App.tsx`
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/build-task8.txt`（不入库）

> **2026-09-12 更正（Task 12 回写，与 Task 6 同源）**：本 Files 清单**同样漏了 `docs/standards/line-limit-exemptions.md`** —— Task 6/7/8 三次都改 `app/src/App.tsx`，交付终值 **519 行**（原 439），登记值必须 `node scripts/line-limits.mjs --write` 刷新。另：本任务 Verification 里的 vitest 期望 **124 / 1124** 已过期，交付态是 **125 文件 / 1233 用例**（批 2 净增 1 个测试文件）。

**Interfaces:**
- Consumes: Task 6 的 `Suspense` import 与挂载闸门模式
- Produces: `dockMounted` 状态（文件内，不导出）

- [ ] **Step 1: 记录开工读数与保活契约**

```powershell
node scripts/bundle-eager-graph.mjs
Select-String -Path app/src/App.tsx -Pattern 'AiConversationDock|dockOpen' | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" }
```
预期：首屏包清单里仍有 `react-markdown` / `rehype-katex` / `katex`（**这就是本任务要摘掉的东西** —— 也请顺手证明它确实来自这条链：`Select-String -Path app/src/components/AiConversationDock.tsx -Pattern 'TaskConversationView'` 与 `app/src/components/TaskConversationView.tsx` 里的 `ChatMessageMarkdown`、`ChatMessageMarkdown.tsx` 里的 `rehype-katex`，把三跳的 `文件:行` 贴进报告）。
**保活契约（必须原样保留）**：`App.tsx:421` 的注释写明「常驻挂载——开合仅切 display，选中态/后台任务保活」。⇒ 本任务只把「**首次打开之前**不挂载」作为闸门，一旦打开过就**永不卸载**。

- [ ] **Step 2: 改为 `lazy` + 首开挂载**

```tsx
// 批 2：全局对话面板改为「首开挂载 + 之后常驻」。
// @ai-context: 原语义（App.tsx:421 注释）是「常驻挂载——开合仅切 display，选中态/后台任务保活」。
//   本任务只加一道**首开之前不挂载**的闸门：一旦 dockOpen 为真过一次，dockMounted 永为真，
//   之后的 open/close 仍是纯 display 切换 ⇒ 保活语义逐字保留。
// @ai-context: 收益来自它的静态依赖链 AiConversationDock → TaskConversationView →
//   ChatMessageMarkdown → rehype-katex + katex/dist/katex.min.css（实测 ≈153 kB gzip）。
const AiConversationDock = lazy(() => import("./components/AiConversationDock"));
```

在 `const [dockOpen, setDockOpen] = useState(false);` 之后加入：

```tsx
  // 批 2：首次打开之前的挂载闸门（打开过即常驻，见上条 @ai-context）
  const [dockMounted, setDockMounted] = useState(false);
  useEffect(() => {
    if (dockOpen) setDockMounted(true);
  }, [dockOpen]);
```

把 `:422-434` 的 `<AiConversationDock … />` 包起来：

```tsx
      {dockMounted && (
        <Suspense fallback={null}>
          <AiConversationDock … 原 props 逐字保留 … />
        </Suspense>
      )}
```

- [ ] **Step 3: 构建 + 达标判定**

```powershell
$d = "D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp"
cmd /c "cd /d `"D:\Program own\aicode\work space\Entropydecrease\app`" && npm run build > `"$d\build-task8.txt`" 2>&1"
"exit=$LASTEXITCODE"
node scripts/check-bundle-budget.mjs --no-build; "budget-exit=$LASTEXITCODE"
node scripts/bundle-eager-graph.mjs
```
预期：可达源文件 **≈47**、包 **4**（`react` / `react-dom` / `scheduler` / `@tauri-apps/api` / `@tauri-apps/plugin-dialog`，计 5 个包名）；首屏 gzip **应 < 200 kB** ⇒ `✅ 达标` + `budget-exit=0`。
**若仍 > 200 kB**：不要惊慌、不要改判据。把实测值与首屏 chunk 清单写进报告（Task 11 会据此写瓶颈清单 —— 规格允许的合法交付），并把该场景报告给控制方。

- [ ] **Step 4: 全量门禁 + 提交**

```powershell
cd app; npx tsc --noEmit; npx vitest run
cd ..; node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
git diff --stat
git commit --only -m "perf(app): mount conversation dock on first open" -- app/src/App.tsx
```

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `node scripts/bundle-eager-graph.mjs` | 包清单**不含** `react-markdown` / `rehype-katex` / `katex` / `remark-*`；只含 react 系 + `@tauri-apps/*` |
| V2 | `node scripts/check-bundle-budget.mjs --no-build; $LASTEXITCODE` | `✅ 达标` 且 exit **0**（或如实记录仍超标并转 Task 11） |
| V3 | `Select-String -Path app/src/App.tsx -Pattern 'dockMounted' \| Measure-Object` | ≥ **3**（声明 + effect 里置真 + JSX 门控） |
| V4 | `git diff` 里 `AiConversationDock` 的 props | 与改动前逐字相同 |
| V5 | `cd app; npx vitest run` | **124 / 1124** 全绿，测试文件 0 改动 |
| V6 | 六条门禁 | 全 exit 0 |

---

### Task 9: 重依赖去重与传递链审计（分裂后复测）

> **为什么是「审计型」任务**：控制方交办要求「清理测量揭示的重复/重依赖」。计划者**已经测过**，结论是**四条候选里没有一条同时满足「只减尺寸 ∧ 零行为变化」**（见下表）。本任务的价值不是「动手删」，而是**在分裂之后重测一遍**（分裂改变了什么在首屏、什么在懒 chunk），把结论固化成 Task 11 瓶颈清单的一节，并**把每条登记给正确的批次**。
> ⚠️ **纪律**：本任务**默认产物是 0 个代码改动**。若某条重测后**过闸**（同时满足「只减尺寸」与「零行为变化、零测试改动」），实施者**必须先 STOP 报控制方**，取得授权后再作为独立子步执行并单独提交。**不得自行扩大范围。**

> **2026-09-12 更正（Task 12 回写，原文保留）**：计数写错了 —— 上文与 **L1438**（`Produces: … 四行结论表`）都说「**四**条候选」，而 Step 1 实际逐条测的是 **五**条：(1) `katex` 双版本 · (2) `structuredBlocks.ts` 孤儿 · (3) `@codemirror/lang-markdown` 传递链 · (4) `basicSetup` 附带件 · (5) 59 个 KaTeX 字体。交付态是**五行结论表**（`tmp/dep-audit.md`），Task 11 的瓶颈清单逐条引用了全部五条，**无一条过「size-only ∧ behavior-neutral」双闸**。

**Files:**
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/dep-audit.md`（不入库）
- 预计 Modify: **无**

**Interfaces:**
- Consumes: Task 4–8 的产物（`app/dist/assets/*`）与 `scripts/bundle-eager-graph.mjs`
- Produces: `tmp/dep-audit.md` —— 四行结论表（候选 / 实测影响 / 是否过闸 / 归属批次），Task 11 直接引用。

- [ ] **Step 1: 逐条重测四个候选（每条都要给命令与输出）**

**(1) `katex` 双版本（顶层 `0.18.4` ＋ `rehype-katex` 嵌套的 `0.16.47`）**

```powershell
cd app
node -e "console.log('top   ', require('./node_modules/katex/package.json').version)"
node -e "console.log('nested', require('./node_modules/rehype-katex/node_modules/katex/package.json').version)"
Select-String -Path "dist/assets/*.js" -Pattern "katex" -List | ForEach-Object { $_.Path }
```
已测结论（复核用）：顶层 `0.18.4` 的 **JS 根本没有进产物**（探针构建里没有 `katex` 的 JS chunk）—— 因为它的唯一生产引用 `app/src/components/structuredBlocks.ts:8` 所在的模块**在产物图里不可达**。真正被打进去的是嵌套的 `0.16.47`（经 `rehype-katex`）。而**被打进产物的是顶层 0.18.4 的 CSS**（`ChatMessageMarkdown.tsx:13` 与 `structuredBlocks.ts:9` 都 `import "katex/dist/katex.min.css"`，前者活）⇒ **CSS 与 JS 版本偏斜**。
⇒ **对首屏 gzip 的影响：0**（除去重后版本不变）。**归属：批 7**（`structuredBlocks.ts` 整模块存废已由批 1 定在批 7；`app/package.json` 里的 `katex` + `@types/katex` 直接依赖随之处理）。**登记理由**：本条**不是包体瓶颈**，是版本偏斜风险。

**(2) `app/src/components/structuredBlocks.ts` 是不是生产孤儿 —— 用产物反证**

```powershell
Select-String -Path app/src/**/*.ts,app/src/**/*.tsx -Pattern 'from "\./structuredBlocks"|from "\.\./components/structuredBlocks"' | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
# 仪器自检：同一命令对已知存在的引用必须命中
Select-String -Path app/src/**/*.ts,app/src/**/*.tsx -Pattern 'from "\./ChatMessageMarkdown"' | ForEach-Object { "$($_.Path):$($_.LineNumber)" }
```
预期：第一条**只有 `structuredBlocks.test.ts`** 命中（生产零引用）；第二条命中 `ChatMessageList.tsx` 与 `TaskConversationView.tsx`（自检通过）。
**产物级独立佐证**（本任务新增的判据）：`app/dist/assets` 里**不存在**只含 `katex` 包 JS 的 chunk（`structuredBlocks.ts:8` 的 `import katex from "katex"` 若可达，必定生成一个；不存在 ⇒ 它被 tree-shake ⇒ 该模块从入口不可达）。
⇒ **归属：批 7**（批 1 控制方裁决：「接线或删除二选一，**批 1 未决前不得删**」）。本任务**只补证据，不动它**。

**(3) `@codemirror/lang-markdown` 拖进来的 html/js/css 传递链**

```powershell
cd app
node -e "const p=require('./node_modules/@codemirror/lang-markdown/package.json');console.log(JSON.stringify(p.dependencies,null,2))"
Get-ChildItem dist/assets -Filter "*.js" | ForEach-Object { $_.Name + ' ' + [math]::Round($_.Length/1000,2) + ' kB' } | Sort-Object
```
已测结论（复核用）：`@codemirror/lang-html` → `@codemirror/lang-javascript` + `@codemirror/lang-css`，连带 `@lezer/javascript` 30.69 · `@lezer/css` 8.08 · `@lezer/html` 6.26 · `@codemirror/lang-html` 5.51 · `@codemirror/lang-css` 4.53 · `@codemirror/lang-javascript` 2.93 = **≈59.07 kB gzip**，全部由 `RichEditorView.tsx:16` 的一句 `import { markdown } from "@codemirror/lang-markdown"` 拖入。
⇒ **分裂之后它落在懒加载的 `vendor-editor` chunk 里，对首屏 gzip 影响：0**。去掉它需要改 `markdown({ htmlTagLanguage: … })` 之类配置，**会改变编辑器里 markdown 内联 HTML 的高亮/补全行为** ⇒ **不过闸**。**归属：批 4/5**（编辑器体验与视图层）。**登记理由**：非首屏瓶颈；属编辑器体验裁决。

**(4) `codemirror` 的 `basicSetup` 附带件**

```powershell
Select-String -Path app/src/components/RichEditorView.tsx -Pattern "basicSetup" | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" }
```
已测结论：`RichEditorView.tsx:15` 用 `basicSetup`，它连带 `@codemirror/autocomplete` 12.66 + `@codemirror/lint` 4.62 + `@codemirror/search` 6.83 = **≈24.11 kB gzip**。同样是**懒 chunk 内**，首屏影响 0；替换成显式扩展列表会**去掉自动补全/搜索/诊断**（行为变化）⇒ **不过闸**。**归属：批 4/5**。

> **2026-09-12 更正（Task 12 回写，单位与口径）**：候选 3/4 的 `≈59.07` / `≈24.11 kB` 是**分裂前的探针读数**（§表 2 的「每包一 chunk」探针，其总量比真实构建膨胀 +6.3%），**不是**落地后的可省字节。分裂后由 Task 9 用真实构建做的 A/B 实测值是：
> · 候选 3（stub `@codemirror/lang-markdown` 传递链 9 包）：`vendor-editor` 208,585 → **124,549 B = −84.04 kB**；
> · 候选 4（stub `basicSetup`）：`vendor-editor` 208,585 → **163,484 B = −45.10 kB**；
> 两者**都 100% 落在懒 chunk 内**，对首屏 **0 B**（判据是 `check-bundle-budget.mjs --no-build --dist <stub 产物>` 的 `lazy` 栏）。
> ⇒ **引用时不得把 59.07 / 24.11 当作「可省的 kB 数」**；它们在探针口径下只是**归因占比**。Task 11 的瓶颈清单已用 −84.04 / −45.10 入账。

**(5) 59 个 KaTeX 字体（1,047.80 kB：`.woff2` 19/250.16 · `.woff` 20/296.01 · `.ttf` 20/501.63）**

```powershell
cd app
node -e "const z=require('zlib'),f=require('fs');for(const e of ['.woff2','.woff','.ttf']){const ns=f.readdirSync('dist/assets').filter(n=>n.endsWith(e));console.log(e,ns.length,'files',(ns.reduce((a,n)=>a+f.statSync('dist/assets/'+n).size,0)/1024).toFixed(2),'KiB');}"
Select-String -Path "node_modules/katex/dist/katex.min.css" -Pattern "font-face|src:" | Measure-Object | Select-Object -ExpandProperty Count
```
已测结论：首屏与任何 JS chunk 都**不含**字体（CSS `@font-face` 按需取），**对 200 kB 预算影响 0**；只影响安装包体积。WebView2 支持 woff2 ⇒ 仅留 `.woff2` 可省 **≈797.64 kB 原始字节**。⇒ **不过闸**（要改的是第三方 CSS 的 `src:` 列表，属构建后处理，本批无此工具链）。**归属：批 8（治理收口）**，与「安装包体积」一并裁决。

> **2026-09-12 更正（Task 12 回写，单位）**：本条的 `1,047.80` 与 `797.64` 是 **KiB**（Step 1 的探针命令自己写着 `… /1024).toFixed(2),'KiB'`），但被冠以 `kB`。**十进制（÷1000，vite 口径）**：字体总计 **1,072,948 B = 1,072.95 kB**；仅留 `.woff2` 可省 **816,780 B = 816.78 kB**。⇒ 按 `kB` 抄这行会**凭空少 25.15 kB**。`§表 1` 第 122/123 行有同一处单位错标（见该表下注）。

- [ ] **Step 2: 写 `tmp/dep-audit.md`**

四列固定：**候选 / 实测 gzip 影响 / 是否过「size-only ∧ behavior-neutral」双闸 / 归属批次 + 理由**。每条必须带 Step 1 的**复现命令**与**输出摘要**。

- [ ] **Step 3: 若全部不过闸（预期），本任务 0 代码改动**

```powershell
git status --short
```
预期：工作树**只**多出未跟踪的 `.superpowers/`（本来就未跟踪）。**没有提交** —— 在报告里写明「本任务产物是审计文档，无提交」。

- [ ] **Step 4: 全量门禁（确认没被本任务碰坏）**

```powershell
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
node scripts/check-bundle-budget.mjs --no-build
cd app; npx tsc --noEmit; npx vitest run
```

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `Test-Path .superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/dep-audit.md` | `True`，且五条候选齐备、每条带复现命令 |
| V2 | `git status --short` | 除未跟踪的 `.superpowers/` 外**无改动** |
| V3 | `Test-Path app/node_modules/gsap` | **`False`** |
| V4 | 五条门禁 | 全 exit 0；vitest 仍 **124 / 1124** |
| V5 | 报告里「过闸项」一栏 | 要么是「无」，要么带**控制方授权记录** |

---

### Task 10: 终测（同命令复跑 + 前后对比 + 窗口变体首屏）

**Files:**
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/build-after.txt`（不入库）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/final-numbers.md`（不入库）

**Interfaces:**
- Consumes: Task 1 的 `build-before.txt` 与 `baseline.md`
- Produces: `final-numbers.md` —— **Task 11 瓶颈清单的唯一数据源**。

- [ ] **Step 1: 用与 Task 1 逐字相同的命令重跑**

```powershell
$d = "D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp"
cmd /c "cd /d `"D:\Program own\aicode\work space\Entropydecrease\app`" && npm run build > `"$d\build-after.txt`" 2>&1"
"exit=$LASTEXITCODE"
```
> **「逐字相同」是要点**：同一个 `npm run build`（= `tsc && vite build`）、同一个 shell、同一个 cwd。**不要**换成 `npx vite build`（会跳过 `tsc`），也**不要**加 `--minify`/`--mode` 之类的旗标（会破坏可比性）。

- [ ] **Step 2: 逐 chunk 列表与总量**

```powershell
node scripts/check-bundle-budget.mjs --no-build
node scripts/check-bundle-budget.mjs --no-build --json > "$d\final-budget.json"
node scripts/bundle-eager-graph.mjs --json > "$d\final-graph.json"
cd app; Get-ChildItem dist/assets -Filter "*.js" | ForEach-Object { [pscustomobject]@{ Name=$_.Name; kB=[math]::Round($_.Length/1000,2) } } | Sort-Object kB -Descending | Format-Table -AutoSize
```

- [ ] **Step 3: 汇编前后对比表（写进 `final-numbers.md`）**

必须含七行：① JS 总原始大小 ② JS 总 gzip（全部 chunk 之和，含懒的）③ **首屏 JS gzip**（判据）④ 首屏 chunk 数 ⑤ CSS 原始/gzip ⑥ 字体资产（文件数 + 原始）⑦ `dist` 总大小。每行给「前 / 后 / Δ」，并注明读数来自哪个命令。

- [ ] **Step 4: 六门禁终测（串行、单跑）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full
node scripts/docs-check.mjs
node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit
cd app; npx vitest run
cd app/src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp\cargo-after.txt"
cd app/src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp\clippy-after.txt"
```
预期：与基线**逐字相同**（`0 / 123 / 123` · exit 0 · `312/312/0` · tsc 0 · **124 / 1124** · **2300/0/6** · clippy **19**）。

> **2026-09-12 更正（Task 12 回写）**：`124 / 1124` 这条**不可能逐字相同** —— 批 2 自己净增 1 个测试文件（`app/src/build/manualChunks.test.ts`，Task 3 建、Task 5/补强单元扩），交付终态是 **125 文件 / 1233 用例**（Task 12 收口复跑：`Test Files 125 passed (125)` · `Tests 1233 passed (1233)` · exit 0）。**其余六项与基线逐字相同**（`0/123/123` · `312/312/0` · tsc 0 · **2300 passed / 0 failed / 6 ignored** · clippy 19 **集合 identical**）。⇒ 本表的 V4「与基线表逐字相同」**应读作「除 vitest 用例数外逐字相同」**，用例数判据是**只增不减**（0 处断言修改）。
> 若 `ffmpeg::tests::run_captured_handles_large_output` 偶发失败：**单独复跑该用例**再下结论（装载敏感，10s 墙钟超时）。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `build-after.txt` 里出现 `✓ built in` 且 exit 0 | 是 |
| V2 | `final-numbers.md` 七行齐备、每行带命令与「前/后/Δ」 | 是 |
| V3 | `node scripts/check-bundle-budget.mjs --no-build; $LASTEXITCODE` | 二选一并**如实记录**：`✅ 达标` + exit 0，或 `❌ 超标` + exit 1（后者转 Task 11） |
| V4 | 六门禁终测 | 与基线表逐字相同 |
| V5 | `git status --short` | 除未跟踪 `.superpowers/` 外**无改动**（终测不产生提交） |

---

### Task 11: 瓶颈清单（规格 §10 明确要求的交付物）

> 规格 §10 批 2 行原文：「从 651KB gzip 降到达标**或给出瓶颈清单**」；§11 验收 9：「JS 包首屏 gzip 达标**或给出瓶颈清单**」。⇒ **这是一份正式交付物，不是备注。** 它同时是批 3+ 计划的前置输入（规格 L534：「后一批的计划在前一批验收通过后再写 —— 因为批 3 之后的细节依赖批 0–2 的实测结果（**尤其是包体治理量出的瓶颈清单**）」）。

**Files:**
- Modify: `docs/superpowers/plans/2026-09-11-frontend-redesign-batch2-bundle.md`（**在文件末尾追加 `## 收口回写（Task 11/12）` 节** —— 与批 1 计划同构：后批来读的是**兄弟计划**，把清单写在这里，批 3 的计划者读得到）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp/bottleneck-draft.md`（不入库；正式文本落到上面那份计划文件）

**Interfaces:**
- Consumes: `final-numbers.md`（Task 10）· `dep-audit.md`（Task 9）· `gsap-slot.md`（Task 5）
- Produces: 计划文件里的 §收口回写 节，含**瓶颈清单表**（固定六列：**项 / 实测 gzip / 占比 / 为什么降不下去 / 归属批次 / 复现命令**）与**达标结论**。

- [ ] **Step 1: 先写「降得下去的」与「降不下去的」两栏**

清单**必须**包含（缺一即不合格）：

| 项 | 内容要求 |
|---|---|
| 1 | 首屏剩下的每一个 chunk 及其 gzip（逐行列出，标注它为什么必须在首屏） |
| 2 | vendor-react（≈61 kB）—— 不可降，理由：React 运行时是硬底线 |
| 3 | `@tauri-apps/api`（≈4.7 kB）—— 不可降，理由：IPC 是所有页面的公共依赖 |
| 4 | 应用源码中仍静态可达的部分（用 `scripts/bundle-eager-graph.mjs` 的实际数字）—— 逐类说明为什么仍在首屏（壳层 / 默认页 / provider / 错误边界 / 浏览器痕迹抑制） |
| 5 | Task 9 的五条候选（katex 双版本 · `structuredBlocks` 孤儿 · codemirror html 传递链 · `basicSetup` 附带件 · 59 个 KaTeX 字体），逐条给「首屏影响 0，理由 = 落在懒 chunk / 不进 JS 预算」与归属批次 |
| 6 | 若 `❌ 超标`：把**超出的 kB 数**与**唯一能补上它的动作**写清楚，并给出该动作的代价与归属批次 |
| 7 | **未做的两件事**：路线 A（叶级懒加载，被路线 B 完全包含，且测试面风险更高）· `check-bundle-budget.mjs` 的门禁接线（归属批 8） |

- [ ] **Step 2: 每条都要有复现命令，且仪器自检通过**

清单里出现的每一个数字，必须能由一条写在清单里的命令复现。**若某条命令的输出在自检里 0 命中**（例如某个包名/字符串其实不存在），**改掉那条结论** —— 这是批 1「收口三」的直接应用。

- [ ] **Step 3: 写进计划文件**

用 `edit` 工具在 `docs/superpowers/plans/2026-09-11-frontend-redesign-batch2-bundle.md` 末尾追加：

```markdown
---

## 收口回写（Task 11/12，<YYYY-MM-DD> —— 批 2 终态 · 瓶颈清单 · 给批 3+ 的输入）

> 本节由**收口单元**写入。上文一律**保留不改**，本节只做**加注**与**归账**。
> **批 3 的计划者：你需要的瓶颈清单就是本节 §瓶颈清单。** 规格 L534 明写后批细节依赖本清单。

### 瓶颈清单（首屏 JS gzip 判据 = `docs/standards/performance.md:28` 的 < 200 kB）

<六列表格>

### 达标结论
<达标 / 未达标 + 实测读数 + 复现命令>

### 未做（登记，逐条带归属批次）
<…>
```

- [ ] **Step 4: 跑 `docs-check` 与行数复核**

```powershell
node scripts/docs-check.mjs
$p="docs\superpowers\plans\2026-09-11-frontend-redesign-batch2-bundle.md"; [System.IO.File]::ReadAllLines((Resolve-Path $p),[Text.Encoding]::UTF8).Count
```
预期：`docs-check` exit 0（**新增的所有相对链接必须真实存在**；`.superpowers/...` 的路径**不要写成 Markdown 链接** —— 它不入库，会让新克隆断链，批 1 已有先例并刻意不写成链接）。
> ⚠️ 计划文件本身**不受 `line-limits` 管辖**（`SCAN_DIRS` 只有 `app/src` 与 `app/src-tauri/src`），但仍应保持结构清晰。

- [ ] **Step 5: 提交**

```powershell
git diff --stat
git commit --only -m "docs(plans): record batch2 bundle bottleneck list" -- docs/superpowers/plans/2026-09-11-frontend-redesign-batch2-bundle.md
```

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `git show --stat HEAD` | 只含那一个计划文件 |
| V2 | 清单七类项齐备、每条带复现命令 | 是（评审者逐条核对） |
| V3 | `node scripts/check-bundle-budget.mjs --no-build` 的读数与清单首行 | 逐字一致 |
| V4 | `node scripts/docs-check.mjs` | exit 0 |
| V5 | 清单里**没有任何** Markdown 链接指向 `.superpowers/` | 是 |

---

### Task 12: 收口（六门禁 + 规格进度标记 + 台账 + follow-ups）

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§10 批 2 行 + §2 包体行 + §11 验收 9 + §13 风险表「包体继续膨胀」行）
- Modify: `docs/versions/v0.22.md`（新增 `### 批 2 · 包体治理` 节，紧随批 1 节之后）
- Modify: `docs/standards/line-limit-exemptions.md`（**只有当 `App.tsx` 行数变化时才刷新，且只走 `node scripts/line-limits.mjs --write`**）
- Modify（如需要）: `.husky/pre-commit` —— **不改**（本批有意不接线，理由已写在 Global Constraints；改它属越界，STOP）

**Interfaces:**
- Consumes: 全部前序任务的报告与读数
- Produces: 规格与台账的终态；本批的「未做（登记）」表（每条带**具名归属批次**）。

- [ ] **Step 1: 六门禁最终复核（串行、单跑）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full
node scripts/docs-check.mjs
node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit
cd app; npx vitest run
cd app/src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch2-bundle\tmp\cargo-final.txt"
```
预期与基线表**逐字相同**（含 `0 / 123 / 123`、`312/312/0`、`124 文件 / 1124 用例`、`2300 passed / 0 failed / 6 ignored`）。
**任一条不符 ⇒ 不许提交收口**，先查。

- [ ] **Step 2: 更新豁免表（只 `--write`，不手改）**

```powershell
node scripts/line-limits.mjs --write
git diff --stat -- docs/standards/line-limit-exemptions.md
```
`App.tsx` 从 439 行变到新值 ⇒ 该行数值会被 `--write` 更新。**若 diff 里出现本批未触碰的文件行（并行 agent 的在飞改动），照实登记「这一行是在哪次提交落库的」，不要为掩盖它去改别人的行。**

- [ ] **Step 3: 回写规格（四处，逐处给原文与新文）**

1. **§2 现状基线「包体」行**：把「**JS 2,093.85 kB / gzip 651.25 kB**（单个 chunk，零代码分割）」更正为批 2 终态实测值 + 一条注：「**651.25 kB 是批 2 开工前的过期快照；`f12aba6d` 实测 654.72 kB**」。
2. **§10 批 2 行**：加进度标记（照批 1 行的写法），并在其后补一条**口径注**：「`manualChunks` 本身不降低首屏字节（同一批字节切成多文件，入口仍静态依赖全部 chunk）；它的作用是 ① 让 GSAP 落进独立懒加载 chunk ② 给 `import()` 产生的懒 chunk 稳定的共享 vendor 边界。首屏下降到 **<200 kB** 靠的是**按页动态 import + 首访挂载保活 + 窗口变体/对话面板按需**。」
3. **§11 验收第 9 条**：在「JS 包首屏 gzip 达标或给出瓶颈清单；GSAP 只在独立 chunk 懒加载」后加进度注（达标/未达标 + 实测值 + 「GSAP 独立 chunk 槽位已在 `app/src/build/manualChunks.ts` 预留并被单测钉住（GSAP 未安装）；批 6 装 GSAP 时**必须**用 `import()`，判据见 Task 5」）。
4. **§13 风险表「包体继续膨胀」行**：缓解栏补「**批 2 已落**：`manualChunks` 的 `vendor-gsap` 精确包名槽位（`app/src/build/manualChunks.ts`）+ 单测三条（含反例）+ 首屏预算守卫 `scripts/check-bundle-budget.mjs`。批 6 接入时**必须** `import()` 动态加载；接线到 pre-commit/CI 归属**批 8**」。

> ⚠️ **§10 的批 2 行同时是「批 3+ 计划的前置输入」的指针**：在该行末尾加一句「本批的包体瓶颈清单见批 2 计划 §收口回写」，并把它写成**从 `docs/superpowers/specs/` 出发的相对链接** `../plans/2026-09-11-frontend-redesign-batch2-bundle.md`。⚠️ **只许写这一个方向**：计划文件在 `docs/superpowers/plans/`，反向写 `./plans/…` 会解析成 `docs/superpowers/plans/plans/…`（不存在）⇒ `docs-check` 当场变红。

- [ ] **Step 4: 写台账 `docs/versions/v0.22.md`**

在「批 1 · 删除批」节之后新增 `### 批 2 · 包体治理（<日期>，<起始提交>..<结束提交>，N 个提交）`，节内固定七段（照批 1 节的粒度）：
**交付** · **验收（六门禁实测）** · **账（首屏 gzip 前后对比 + chunk 拓扑）** · **规格漂移纠正** · **过程中纠正的计划错误** · **未做（登记，逐条带归属）** · **瓶颈清单指针**。
> 批 1 节里那句话（「每一笔计划外删除都由控制方在 STOP → 实测绿色解 → 授权 → 落地 → 门禁回绿的闭环里逐条裁决」）是本系列台账的写法标准：**本批同样必须逐条归因，不得只写结论。**

- [ ] **Step 5: 写 follow-ups（每条必须带具名归属批次）**

至少覆盖（按实测补充）：

| # | 未做项 | 归属 |
|---|---|---|
| 1 | 路线 A（叶级懒加载 `NoteMarkdown`/`RichEditorView`/`ChatMessageMarkdown`/`KnowledgeCanvasView`/`KnowledgeGraphView`）—— 被路线 B′ 在**首屏**上完全包含 | **批 5**（视图层「惰性挂载」本来就做这件事，规格 §7.3 约束 2） |
| 2 | `scripts/check-bundle-budget.mjs` 接线到 `.husky/pre-commit` / CI | **批 8**（治理收口） |
| 3 | `structuredBlocks.ts` 整模块存废（含 `katex` + `@types/katex` 直接依赖与 `katex` CSS/JS 版本偏斜） | **批 7**（批 1 已裁定） |
| 4 | `@codemirror/lang-markdown` 的 html/js/css 传递链（≈59 kB，懒 chunk 内）+ `basicSetup` 附带件（≈24 kB） | **批 4/5**（编辑器体验裁决） |
| 5 | 59 个 KaTeX 字体（1,047.80 kB 原始，仅 woff2 可省 ≈797 kB） | **批 8**（安装包体积一并裁决） |
| 6 | 首访加载态（`Suspense fallback={null}` 的观感）—— 应改用 L1 原语 `Loading` | **批 3/4**（壳层 + 加载原语一起做） |
| 7 | 批 6 接入 GSAP 时必须用 `import()` 且核对 `vendor-gsap` 独立 chunk | **批 6** |
| 8 | 窗口变体首屏（`?float=1`/`?overlay=1`）的**正式**度量口径（本批只给上界推理） | **批 3**（壳层会改动窗口启动路径） |

- [ ] **Step 6: 最终门禁 + 提交**

```powershell
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
git diff --stat
git commit --only -m "docs(batch2): close bundle governance batch" -- docs/superpowers/specs/2026-09-11-frontend-redesign-design.md docs/versions/v0.22.md docs/standards/line-limit-exemptions.md
```
> `docs/standards/line-limit-exemptions.md` **只在 Step 2 的 `git diff --stat` 非空时才加进这次提交**（空则从命令里去掉）。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | 六门禁 | 与基线表逐字相同 |
| V2 | `node scripts/line-limits.mjs --full` | exit 0；`>600: 0` · 301–600 档 = 登记条目数 |
| V3 | `node scripts/docs-check.mjs` | exit 0（规格里新增的 `../plans/…` 链接可达） |
| V4 | `git show --stat HEAD` | 只含 Step 6 列出的文件 |
| V5 | follow-ups 表 | ≥8 行，**每行都有具名归属批次**，无「不知道」 |
| V6 | `git log --oneline -12` | 提交信息全为 Conventional Commits、subject ≤50 字、无句号 |

---

## 自审记录（计划者自查，不属执行范围）

- **规格覆盖**：§10 批 2 行的三个动作 → `manualChunks`（T3/T4）· 按页动态 import（T6）· 量首屏 gzip（T1/T2/T10）；§10 后半句「达标或瓶颈清单」→ §达标定义 + T11；§11 验收 9 的「GSAP 只在独立 chunk 懒加载」→ T5；§13 风险表「批 2 先治理」→ 全批 + T12 Step 3 第 4 处回写；§14「文档与提交」→ T12。
- **非目标覆盖**：不装 GSAP（T5 的 V3/V4 + T9 V3 双重守门）· 不动 `ui/primitives/**`（全批无该目录路径）· 不改运行行为（Global Constraints 待裁决项 + T6/T7/T8 的「vitest 逐字持平 + 0 处测试改动」判据）· 不碰 Rust（Global Constraints + 六门禁的 cargo 两条必须逐字不动）。
- **类型一致性**：`VendorGroup` 的七个成员在 T3 定义、T4 接线、T5 断言、T9/T10 报表引用，**同名同形**；`manualChunks(moduleId: string): string | undefined` 在 T3 定义、T4 以 `(id: string) => manualChunks(id)` 消费；`scripts/check-bundle-budget.mjs` 的 `--no-build/--json/--self-test/--budget` 四个旗标在 T2 定义，T4–T12 消费，**无第五个**。
- **占位符扫描**：T6 Step 5 里的 `… 原 props 逐字保留 …` 是**刻意**的（该处必须由实施者从现行文件搬运，写死会让 props 在并行改动后过期），并已在同一步给出**机器判据 V3**（`git diff` 里 props 行逐字相同）—— 它不是「TBD」，而是「以现行文件为准 + 有机器验收」。
- **风险最高的两处**已就地标注：T6 的测试面（红即回退，绝不改测试）· T8 的达标判定（不达标是**合法**结果，转 T11）。

---

## 收口回写（Task 11/12，2026-09-12 —— 批 2 终态 · 瓶颈清单 · 给批 3+ 的输入）

> 本节由**收口单元**写入。上文一律**保留不改**，本节只做**加注**与**归账**。
> **批 3 的计划者：你需要的瓶颈清单就是本节 §瓶颈清单。** 规格 L534 明写后批细节依赖本清单。
> 分工：**Task 11** 写 §瓶颈清单 · §达标结论 · §未做（登记）；**Task 12** 在本节追加终态六门禁读数与规格、台账的回写指针。

### 瓶颈清单（首屏 JS gzip 判据 = `docs/standards/performance.md:28` 的 < 200 kB）

**读数口径**：`kB` 一律**十进制 ÷1000**（vite 口径）；凡 ÷1024 一律写作 **KiB**，并同时给出十进制值。
**数据源**：`final-numbers.md`（Task 10 终测，本清单**唯一数据源**）· `dep-audit.md`（Task 9）· `gsap-slot.md`（Task 5）。
**占比** = 占首屏 **92.79 kB** 的比例；`—` = 非字节项（失败路径 / 行数 / 未做项），该列无意义。
**「归属批次」列的 `—（硬底线，不派单）` 是明确决定**（不是漏填）：该行今天没有可执行的降本动作，要动它须先立 ADR。
**`<T>`** = 下表复现命令里的留档目录 `.superpowers/sdd/2026-09-11-frontend-redesign-batch2-bundle/tmp`（**不入库**，故只写行内代码、不写成 Markdown 链接）；命令 cwd 除注明外均为仓库根。

| 项 | 实测 gzip | 占比 | 为什么降不下去 | 归属批次 | 复现命令 |
|---|---|---|---|---|---|
| `index-C4ezj_on.js`（入口 chunk：`main.tsx` + `App.tsx` 导航壳 + 默认页） | 87,573 B 原始 → **27,874 B = 27.87 kB** | 30.0% | 入口必须首屏；**默认页 `ClassroomPage` 静态保留**（首屏必渲染页，改 lazy 只把同一批字节挪进动态 chunk，且让守卫读数失真 —— 控制方 2026-09-12 裁决 2 末条）。壳层内 5 类构成见下一行 | 批 3/4（壳层：页级错误边界 + 加载原语）· 批 5（默认页内视图级惰性挂载） | `node scripts/check-bundle-budget.mjs --no-build` |
| `vendor-react-V0PkpIKo.js`（react + react-dom + scheduler） | 192,521 B 原始 → **60,367 B = 60.37 kB** | 65.1% | React 运行时是硬底线；**它单独就 60,367 B > 60 kB** ⇒ 计划「建议项 < 60 kB/窗变体」结构性不可达（见下方变体两行） | —（硬底线，不派单；要动只能改非 React 渲染或第二套入口 HTML，属架构变更、须先立 ADR —— 提请批 3/4 记录） | `node scripts/check-bundle-budget.mjs --no-build` |
| `vendor-tauri-UIF4jgRy.js`（`@tauri-apps/api` + `plugin-dialog`） | 17,143 B 原始 → **4,548 B = 4.55 kB** | 4.9% | IPC 是全部页面的公共依赖（21 处静态引用方）；再分包只把它拆到更多文件，不减字节 | —（硬底线，不派单） | 同上 |
| 应用源码中仍静态可达的部分（**47 文件 / 4 包**；入口 chunk 内 39 module · 161,368 B pre-minify） | 已计入首行那个 **27.87 kB** | 30.0% | 逐类（pre-minify `renderedLength`，仅表类别占比）：默认页依赖树 26 module / 128,923 B（79.9%，含 provider `useLiveCaptureControl.tsx` 6,610 B）· 壳层 `App.tsx`+`main.tsx` 2 / 16,673 B（10.3%）· `ClassroomPage` 1 / 5,268 B（3.3%）· `BrowserChrome`（浏览器痕迹抑制，须全局生效）1 / 4,327 B（2.7%）· vite 运行时垫片 3 / 3,045 B（1.9%）· `AppErrorBoundary`（须在任何渲染之前存在）1 / 2,039 B（1.3%）· types/utils/css 5 / 1,093 B（0.7%） | 批 3/4（壳层 / 错误边界 / 加载原语）· 批 5（默认页内视图惰性挂载） | `node scripts/bundle-eager-graph.mjs`（47 文件 / 4 包）· 类别占比仪器见 `<T>/task9/attrib-base.json` + `<T>/task11/xcheck-entry-attrib.mjs` |
| Task 9-① `katex` 双版本（顶层 0.18.4 + 嵌套 0.16.47 ×2 目录） | 首屏 **0 B**（唯一渲染出字节的副本在懒 chunk `vendor-katex-7KF2nzwm.js` **79,916 B = 79.92 kB**） | 0% | 去重 = 0.16.47 → 0.18.4 = **换渲染库版本**（行为不中性）；实测去重首屏 Δ **0 B**（92,789 → 92,783 = 命名域噪声）、`vendor-katex` **+53 B**、全部 JS **+63 B** ⇒ 尺寸闸与行为闸**双双不过** | 批 7（版本偏斜 + `structuredBlocks` 存废 + `package.json` 的 `katex`/`@types/katex` 一并裁决） | `node -e "console.log(require('./app/node_modules/katex/package.json').version, require('./app/node_modules/rehype-katex/node_modules/katex/package.json').version)"` → `0.18.4 0.16.47`；A/B `<T>/task9/attrib.mjs dedup-katex` |
| Task 9-② `app/src/components/structuredBlocks.ts`（生产孤儿） | 首屏 **0 B**，且**不在任何 chunk 的模块表里**（产物中不存在 ⇒ 无字节可省） | 0% | 删除会打断 `app/src/ui/primitives/motion-coverage.test.ts:60,68` 的钉值 ⇒ 非行为中性；存废须连它自身测试与 `katex` 直接依赖一起裁决 | 批 7 | `git grep -n "structuredBlocks" -- app/src` → 4 命中，**唯一 importer 是它自己的测试**（另 2 条是注释与 primitives 钉值）；产物级 `<T>/task9/recon.mjs` |
| Task 9-③ `@codemirror/lang-markdown` 传递链（9 包：`@lezer/*` + `@codemirror/lang-{html,css,javascript}`） | 首屏 **0 B**；整链全在懒 chunk（stub 后 `vendor-editor` 208,585 → **124,549 B = −84.04 kB**） | 0% | 9 个包的懒 `renderedLength` = 338,319 B，**100% 落在懒 chunk**；去掉即改变编辑器内联 HTML/JS/CSS 的高亮与补全 ⇒ 非行为中性 | 批 4/5（编辑器体验裁决） | `node scripts/check-bundle-budget.mjs --no-build --dist <T>/task9/dist-stub-langmd --json`（`lazy` 里 `vendor-editor-*` = 124,549 B）；A/B `<T>/task9/attrib.mjs stub-langmd` |
| Task 9-④ `codemirror` 的 `basicSetup` 附带件（`@codemirror/{autocomplete,search,lint}`） | 首屏 **0 B**；懒 chunk **208,585 → 163,484 B = −45.10 kB** | 0% | 换成显式扩展表 = 去掉自动补全 / 搜索 / 诊断 ⇒ 非行为中性；且与 ③ 耦合（stub 掉 `basicSetup` 后 `@codemirror/autocomplete` 仍因 ③ 保留 20,540 B）⇒ 两者必须一起裁决 | 批 4/5 | `node scripts/check-bundle-budget.mjs --no-build --dist <T>/task9/dist-stub-basicsetup --json`；A/B `<T>/task9/attrib.mjs stub-basicsetup` |
| Task 9-⑤ 59 个 KaTeX 字体 | **1,072,948 B = 1,072.95 kB（= 1,047.80 KiB）**；对 200 kB **JS** 预算的作用面 **0** | 0%（不进 JS 预算） | 59 个文件里 `.js` = **0 个**（仪器自检）；字体只被 `vendor-katex-CEK31ho9.css` 的 59 处 `url()` 引用；仅留 `.woff2` 可省 **816,780 B = 816.78 kB（797.64 KiB）**，但要改第三方 CSS ⇒ 与安装包体积一并裁决 | 批 8（安装包体积） | `<T>/task9/cand2and5.mjs` |
| `vendor-editor-CTQefJ4X.js`（懒 chunk 里最大的块） | **608,384 B 原始 / 208,585 B = 208.59 kB** gzip | 0%（懒 chunk，不计入判据） | vite `>500 kB` 警告仍在：它把编辑器栈并成一块；③+④ 全做可降 −129.14 kB，但两条都不行为中性；**拆成多文件不降字节**（总 JS 只多不少） | 批 4/5 | `cmd /c "cd /d <repo>\app && npm run build > <T>\task11\build.log 2>&1"` 后 `findstr /C:"larger than 500" <T>\task11\build.log`（现成留档 `<T>/build-after.txt:100`） |
| Task 6 评审判定 M-1：`PageSlot` 的 `<Suspense fallback={null}>` 之上只有**全局** `AppErrorBoundary` ⇒ 懒 chunk 加载失败**卸载整个 `MainShell`**，已访问页状态（含笔记编辑态）一起丢 | —（失败路径，非字节项） | — | 不是白屏、也不是规范违背（有兜底 UI），但与裁决 2「保活 + 不丢稿」取向相反：保活是为了不丢状态，这条路径一次丢光。**这是本批新增的失败模式**（单 chunk 时代不存在 chunk 拉取失败） | 批 3/4（与「首访加载态」同批） | `git grep -n -e AppErrorBoundary -e 'Suspense fallback' -- app/src/App.tsx` → 唯一边界 `:119` 包 `MainShell`，`PageSlot` 的 Suspense 在 `:146`（HEAD `dea1a6a3`） |
| Task 7 风险 1：两个窗口变体分支**没有错误边界**（`<Suspense fallback={null}>` + 无 `AppErrorBoundary`）⇒ chunk 加载失败 = 该窗**全空白** | —（失败路径）；变体首屏实测 `?float=1` **97.29 kB** / `?overlay=1` **94.19 kB** | — | 这两个分支**改动前后都没有边界**；本批新增的只是「chunk 可能加载失败」这条失败模式。给变体加边界会改错误语义 ⇒ 超出 Task 7 字面范围 | 批 3/4 | `git grep -n 'query.get' -- app/src/App.tsx` → `:95`（overlay）/ `:105`（float）两个早返回；读数 `<T>/task7/variant-firstscreen.mjs --budget-json <T>/final-budget.json` |
| Task 7 转交：计划里的「建议项 < 60 kB/窗变体」**结构性不可达** | 实测 **97.29 / 94.19 kB**（对 60 kB = 1.62× / 1.57×） | — | ① 三窗共用同一 `index.html` ⇒ 入口静态闭包**逐字节相同**，省不掉共用闭包（要真正分开必须第二套入口 HTML，本批禁改面）；② `vendor-react` 单独即 60,367 B > 60 kB ⇒ **任何渲染 React 的窗口，首屏下限已超 60 kB** | 批 3（正式口径：变体首屏 = 入口静态闭包 ∪ 本变体动态 chunk）+ Task 12 回写（计划 L1317「零 vendor 依赖」是错误推理，`< 60 kB` 须标注不可达） | 上行变体仪器命令 + `node scripts/check-bundle-budget.mjs --no-build`（`vendor-react` 行 60,367 B） |
| Task 5/Task 4 转交：预算守卫的**嵌套输出路径盲区**（I2）—— 产物出现 `assets/vendor/*.js` 这类子目录 chunk 时，它**既不计入首屏、也不计入懒加载**，守卫仍打印 `✅ 达标` 且 exit 0 | 夹具实测：守卫只多给一行「modulepreload 声明但静态闭包未覆盖 1 个（参考项，不影响判定）」 | — | 守卫只遍历 `dist/assets/` **平铺层**的 `.js`；本批产物全平铺（子目录 0 个、`manualChunks` 返回值无 `/`、批 6 的 `vendor-gsap` 同样不含 `/`）⇒ 本批未触发，但缺口**是活的**：将来谁改 `chunkFileNames` 或返回含 `/` 的名字，守卫会**静默假绿** | 批 8（或改动者在当次一并处理） | `node scripts/check-bundle-budget.mjs --no-build --dist <T>/task4/i2-fixture` → 实测 `✅ 达标` + exit 0，而 `assets/vendor/nested-vendor.js` 计不进任何一栏（夹具真实存在） |
| Task 5 转交：**没有任何门禁看构建日志里的 `Circular chunk`**（md↔katex 环） | —（构建日志项） | — | 环本批已断（`df72e8bf` 警告 1 条 → 终态 **0** 条），但「`micromark-extension-math → katex` 今天是 tree-shake 掉的死边」——**依赖升级可能让它静默复活**，而守卫是规则层的、看不见 | 批 8（或后续批次的 Task 10 顺手加一条「构建日志不得出现 `Circular chunk`」断言） | `node -e "const s=require('fs').readFileSync('<T>/build-after.txt','utf8');console.log('Circular chunk x'+((s.match(/Circular chunk/g) ?? []).length))"` → `x0` |
| Task 10 转交：`scripts/check-bundle-budget.mjs` **299/300 行**（余 1 行）· `app/src/build/manualChunks.test.ts` **292/300 行**（余 8 行） | —（行数，非字节） | — | 两者都贴着 `AGENTS.md` 的单文件 300 行上限：**任何新增都必须按语义拆分**（守卫拆「口径 / CLI」，测试拆「分组规则 / 反例」），否则 `line-limits --full` 当场变红 | 批 8（治理收口）· 任何下次改动这两个文件的单元**当次**拆分 | `[System.IO.File]::ReadAllLines((Resolve-Path scripts/check-bundle-budget.mjs),[Text.Encoding]::UTF8).Count` → 299；同式对 `app/src/build/manualChunks.test.ts` → 292（`manualChunks.ts` 159） |
| 未做：路线 A 叶级懒加载（`NoteMarkdown` / `RichEditorView` / `ChatMessageMarkdown` / `KnowledgeCanvasView` / `KnowledgeGraphView`） | —（未做项） | — | 被路线 B′ 在**首屏**上完全包含（B′ 已把整页移出首屏），且测试面风险更高 | 批 5（视图层「惰性挂载」，规格 §7.3 约束 2） | 判据同 `node scripts/check-bundle-budget.mjs --no-build` |
| 未做：`check-bundle-budget.mjs` 未接进 `.husky/pre-commit` / CI（**本批有意**：它要跑一次真实构建并写 `app/dist/`，塞进共享的 pre-commit 会让并行期每次提交都依赖「此刻工作树可构建」） | —（未做项） | — | 本批策略 = **每个涉及包体的任务手工跑**；自动化接线属治理收口 | 批 8 | `git grep -n "check-bundle-budget" -- .husky` → **0 命中**（阳性对照：同路径 `line-limits` 命中 3 处，证明仪器与路径都对） |

### 达标结论

- **判据**：首屏 JS gzip < **200 kB** —— 来源 `docs/standards/performance.md:28`（「页面包大小 (JS) | < 200KB (gzip)」）。
- **实测（HEAD `dea1a6a3`）**：**92,789 B = 92.79 kB** ⇒ **✅ 达标**，守卫 **exit 0**，余量 **107,211 B = 107.21 kB**（预算利用率 **46.39%**）。
- **开工前**：**654,722 B = 654.72 kB**（单 chunk = 3.27× 预算）⇒ 本批 **−561,933 B = −85.83%**。
- **复现**：`node scripts/check-bundle-budget.mjs --no-build`（判据）· `node scripts/check-bundle-budget.mjs --self-test`（仪器自检 14 条，全绿）。
- **首屏 3 个 chunk**：见 §瓶颈清单前三行；懒加载 **22 个 · 574,841 B = 574.84 kB**（不计入判据）。
- **两窗变体也在预算内**：`?float=1` **97.29 kB** · `?overlay=1` **94.19 kB**（口径 = 入口静态闭包 ∪ 本变体动态 chunk）。
- **「若 ❌ 超标」分支不适用**：Task 11 Step 1 第 6 项（写超出的 kB 数与唯一能补上它的动作）**N/A** —— 本批达标。
- **诚实代价（不许省略）**：① 全部 JS gzip **+12,908 B = +12.91 kB（+1.97%）**（654,722 → 667,630 B：25 个 chunk 的样板与跨 chunk `import` 开销，**总量守恒不成立**）；② `>500 kB` 警告仍在（`vendor-editor` 208.59 kB，懒 chunk）；③ CSS gzip **+36 B**（11,745 → 11,781）、`index.html` **+166 B**（488 → 654，两条 `modulepreload`）；④ `dist` 总量只降 **4,415 B = −0.14%**（字体 1,072,948 B 一字节未动 ⇒ **磁盘与安装包不因此变小**）。
- **单位纪律**：本清单所有 kB 均为十进制 ÷1000；字体 **1,072.95 kB = 1,047.80 KiB**、`dist` **3,228.86 kB = 3,153.18 KiB** —— 计划 §表 1 曾把这两行的 KiB 值写成 kB，引用时**必须连单位一起抄**，否则凭空多出 25 kB 字体 / 76 kB dist 的假 Δ。

### 未做（登记，逐条带归属批次）

| # | 未做项 | 归属批次 |
|---|---|---|
| 1 | 路线 A 叶级懒加载（被 B′ 在首屏上完全包含 · 测试面更险） | 批 5 |
| 2 | `scripts/check-bundle-budget.mjs` 接线 `.husky/pre-commit` / CI（本批有意不接，理由见 Global Constraints 与清单末行） | 批 8 |
| 3 | 页级错误边界 / 懒 chunk 加载失败重试（M-1「整壳卸载」） | 批 3/4 |
| 4 | 窗口变体分支的错误边界（chunk 加载失败 = 空白窗） | 批 3/4 |
| 5 | 变体首屏**正式**度量口径 + 把 `< 60 kB` 标注为不可达（计划 L1317 推理错误） | 批 3（口径）· Task 12（回写） |
| 6 | 首访加载态：`Suspense fallback={null}` → L1 `Loading` 原语（本批是尺寸治理批，引入原语会把其 CSS 拉回首屏） | 批 3/4 |
| 7 | 预算守卫的嵌套输出路径盲区（I2 静默假绿） | 批 8 |
| 8 | 构建日志 `Circular chunk` 无门禁看管 + 依赖升级后死边复活风险 | 批 8 |
| 9 | `check-bundle-budget.mjs` 299/300 行 · `manualChunks.test.ts` 292/300 行 ⇒ 新增须按语义拆分 | 批 8 · 下次改动者当次拆 |
| 10 | `structuredBlocks.ts` 整模块存废 + `katex` 版本偏斜（含 `@types/katex`） | 批 7 |
| 11 | `@codemirror/lang-markdown` 传递链（懒 chunk −84.04 kB）+ `basicSetup` 附带件（−45.10 kB）—— 两条耦合，须一起裁决 | 批 4/5 |
| 12 | 59 个 KaTeX 字体 1,072.95 kB（仅 `.woff2` 可省 816.78 kB） | 批 8 |
| 13 | 批 6 装 GSAP **必须**用 `import()`，且核对 `vendor-gsap` 不在首屏（槽位已预留并被单测钉住，判据见 Task 5） | 批 6 |
| 14 | 首屏三个 chunk 的**逐 chunk** 口径复核（本轮已由守卫 + 独立复算确认，无待办）—— 登记为「已复核」而非待办 | 已闭环 |

---

### Task 12 收口终态（2026-09-12 —— 六门禁实跑 · 回写台账 · follow-ups）

> 本节由 Task 12（收口单元）在 Task 11 的清单之后追加。**上文一律保留不改**，本节只做**终态读数**与**归账**。

**终态六门禁（HEAD `9921767c`，串行单跑，全部 exit 0）**

| 门禁 | 终态实测 | 与开工基线（`f12aba6d`）的关系 |
|---|---|---|
| `node scripts/line-limits.mjs --full` | exit 0 · **`>600` 0 · 301–600 档 123 · 登记条目 123** | 逐字持平（`App.tsx` 439 → **519** 行，登记值已同步刷新） |
| `node scripts/docs-check.mjs` | exit 0 · 扫描 273 个 Markdown、检查 173 个，5 项全 ✅ | 持平（新增本批文档与链接） |
| `node scripts/check-command-registry.mjs` | exit 0 · **定义 312 / 注册 312 / 重复 0** | 逐字持平（本批 0 Rust 改动） |
| `cd app && npx tsc --noEmit` | exit 0 · 0 错 | 持平 |
| `cd app && npx vitest run` | exit 0 · **125 文件 / 1233 用例** | **+1 文件 / +109 用例**（唯一允许的偏离：批 2 新增 `manualChunks.test.ts`；**0 处既有断言修改**） |
| `cd app/src-tauri && cargo test --test app_lib_tests` | exit 0 · **2300 passed / 0 failed / 6 ignored** | 逐字持平（本批 0 Rust 改动） |
| `node scripts/check-bundle-budget.mjs`（含真实构建） | exit 0 · 首屏 **92,789 B = 92.79 kB** · 余量 **107.21 kB** · 懒 22 个 574.84 kB | **−561,933 B = −85.83%**（654.72 → 92.79 kB） |
| `cd app/src-tauri && cargo clippy --all-targets` | exit 0 · **19 条诊断，集合 identical** | **集合比对**（禁止比 sha256，见 Global Constraints 注） |

**回写落点（本轮逐条就地加注，原文均保留）**

| # | 落点 | 更正内容 |
|---|---|---|
| 1 | Task 6 Files（+ Task 8 Files） | Files 清单**漏 `docs/standards/line-limit-exemptions.md`** 刷新 |
| 2 | Task 6 Files / L1101 / L1104 / L1109 / L1114 / L1236 / V1 / V2 | 「9 页 lazy」→ 交付态 **8 懒 + 课堂静态**；提交 subject 实为 `eight pages`；V1=8、V2=1 |
| 3 | Task 6 Verification 注 | vitest 基线 `124/1124` → 交付态 **125/1233** |
| 4 | Task 7 Step 5 注 | 计划给的 commit subject **53 字符超 50 限**，实际用 42 字符 |
| 5 | Task 7「窗口变体首屏」段 | 「入口 + **零** vendor」**为假**，实测 **入口 + 4 vendor = 97.29 / 94.19 kB**；`< 60 kB` **结构性不可达** |
| 6 | Task 9 引言 / Produces | 「**四**条候选」→ 实为 **五**条（五行结论表） |
| 7 | Task 9 候选 3/4 | `59.07 / 24.11 kB` 是**分裂前探针值**；落地 A/B 实测是 **−84.04 / −45.10 kB，且 100% 在懒 chunk 内** |
| 8 | Task 9 候选 5 | `1,047.80 / 797.64` 是 **KiB**，十进制 **1,072.95 / 816.78 kB** |
| 9 | §表 1 注 | 「字体 1,047.80 kB」「dist 3,157.49 kB」两行 **KiB 误标为 kB**，十进制 **1,072.95 / 3,233.27 kB** |
| 10 | Task 10 终测注 | vitest `124/1124` 不可能逐字相同，判据改为**只增不减** |
| 11 | Task 2 注 | 守卫的**嵌套路径盲区**（静默假绿，真实构建复现）+ 输出把「非首屏」说成「仅动态可达」的**假文案** |
| 12 | Global Constraints 仪器纪律 | 追加**第 6–13 类仪器陷阱**（累计 13 类） |
| 13 | Global Constraints 门禁基线注 | clippy 判据 = **集合比对**，**禁止比 Task 1 的 sha256**（BOM+CRLF vs LF，永远假红） |
| 14 | Task 1 Step 7 / Task 2 Step 5 / Task 7 Step 5 注 | 计划里**超 ≤50 的提交命令共 3 处**（**51 / 51 / 53** 字符，脚本 `tmp/task12/subject-len.mjs` 逐条普查），其中**两处被照抄落地**（`e46e0e82` / `f0592654`）；根因 = `commitlint.config.js` 的 `header-max-length` 沿用默认 **100**，**该规则无机器门禁** |

**规格与台账同步（Task 12 同批提交）**：规格 §2 包体行 / §10 批 2 行 + 口径注 + 瓶颈清单指针 / §11 验收 9 进度注 / §13 风险表 / §14 交付记录落点行；`docs/versions/v0.22.md` 新增 `### 批 2 · 包体治理` 节（含七段固定结构与 v0.22.2 行、验收门槛 9 的进度标记）。

**Task 12 追加登记的 follow-ups（Task 11 表之外的补充，逐条具名归属）**

| # | 未做项 | 归属 |
|---|---|---|
| 15 | `.gitignore` 的 `build/` **未锚定**（本批只做了点状取反 `!app/src/build/**`，未动锚定语义）⇒ 任何新出现的 `build/` 目录都会被静默吞掉 | 批 8 |
| 16 | `scripts/**/*.mjs` **不在 `line-limits` 的扫描域**（`SOURCE_EXT` 不吃 `.mjs`、`SCAN_DIRS` 只有两处）⇒ 本批两个新脚本（299 / 86 行）**无门禁保护** | 批 8 |
| 17 | `app/vite.config.ts` **同时**不在 `line-limits` 扫描域**与** `tsc --noEmit` 的 program（`--listFilesOnly` 879 文件 0 命中，正样本 `main.tsx` = 1）⇒ 只靠 `vite build` 兜底 | 批 8 |
| 18 | 计划自带的「子串碰撞」反例**恒假红**（`@xyflow/react` 的 id 里没有连续子串 `node_modules/react`）· `@types/katex` 覆盖闸必然红（`dependencies` 实为 **14** 个，计划写 12）· V3 判据「Δ ≤3 kB」实测 −4.39 kB 突破 ⇒ 已改判为「**只许变小 ∧ modules 不变**」 | 已就地更正（批 8 只承接 F4：把 `@types/*` 挪 `devDependencies`） |
| 19 | **`AGENTS.md` §5 的「subject ≤50」是一条无门禁的约定** —— `commitlint.config.js` 未覆盖 `header-max-length`（默认 **100**），故 51 字符的提交能过 commit-msg 钩子并被照抄落地（本批 2 例）。建议加一条 `'header-max-length': [2, 'always', 50]`，或至少在派发词里要求人工数字符数 | 批 8 |

> **Task 12 未验证（诚实单列）**：① 真 WebView 的时序 / 网络抓包 / 两窗变体实测（静态推理 + 守卫读数，未在真机跑）；② CSS 三文件加载顺序未做 WebView 实测；③ `dist` 未做安装包级实测（字体 1,072,948 B 一字节未动 ⇒ 安装包体积未改善）；④ 本批的 `Circular chunk` 归零只在**规则层**被守卫，**构建日志仍无门禁看管**（登记批 8）；⑤ 收口门禁跑在**工作树**而非导出提交树（`node_modules` 不在归档内，故 `tsc`/`vitest`/`cargo` 无法在导出树上复跑 —— 与 Task 1 同一限制）。

