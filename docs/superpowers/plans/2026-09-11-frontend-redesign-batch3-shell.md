# 批 3 壳层落地实施计划（A′ 顶栏 + ⌘K + 溢出策略 + 窗口尺寸 + 列注册表 + 断点 + `--nav-h`）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把壳层从「手写 9 Tab + 每页自建列 + 7 处硬编码尺寸」改造成「**单一导航注册表 + 单一列注册表 + 一套断点 + `--nav-h` 变量**」，使规格 §10 批 3 行的三条验收全部成立：**9 页全走注册表 · 1024 无溢出 · 7 处魔数归零**。

**Architecture:** 本批**只动壳层与布局常数**：① 新增 `app/src/shell/` 目录承载四个纯数据模块（`navRegistry` / `columnRegistry` / `breakpoints` / `windowSize`）与它们的守卫测试；② `app/src/App.tsx` 的顶栏改由注册表渲染，并接 ⌘K 入口；③ `--nav-h` 走 token 生成器（`app/scripts/gen-tokens.mjs`）产出，8 个页面的 `calc(100vh - 56px)` 与 `AiConversationDock` 的 `top: 56` 全部改为消费它；④ `useColumnLayout` 保留（它是**执行器**不是契约），但它今天的 7 处调用点全部改为从 `columnRegistry` **取规格**。**不迁移原语调用点、不做视图切换、不装 GSAP、不碰 Rust。**

**Tech Stack:** Tauri 2 · React 19.1 · TypeScript 5.8（`strict`，禁 `any`）· Vite 7.3.6 · Vitest 4（全局 `environment: "node"`；jsdom 30 用于组件测试）· Node 24（`scripts/*.mjs` 门禁）

**Spec:** [2026-09-11-frontend-redesign-design.md](../specs/2026-09-11-frontend-redesign-design.md)（§1 决策 12–18 · **§6 L2 壳层与列契约（§6.1 顶栏 / §6.2 列契约与阈值口径 / §6.3 相变两态）** · §10 批 3 行 · §11 验收口径 · §13 风险表 · §14 文档与提交）

**输入材料（开工前五份，优先级即此序）**

1. **本计划的 §实测基线**（计划者在 `dev@f5c35990` 实跑八条门禁 + 一个 CDP 宽度探针得到的全部读数；**下游任何任务都不得引用规格 §2 的「9 个顶部 Tab」当作今日事实** —— 今天的顶栏是 **9 个 Tab（含「⚙ 设置」）+ 对话面板按钮 + 采集徽标 + AI toast**，规格 §6.1 要的是 **8 项 + 齿轮**）
2. `.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/tmp/`（探针与原始读数：`edge-probe/nav-measure3.mjs`（CDP 精确视口探针，含自检）· `edge-probe/scale-selftest.mjs`（仪器自检）· `clippy-set.mjs`（诊断集合抽取器，含自检）· `bundle-baseline.txt` · `clippy-baseline.txt` + `clippy-baseline-set.txt`；**该目录不入库**）
3. 规格对应节（§1 / §6 / §10 / §11 / §13 / §14）与 `docs/product/ui-ux-system.md`、`docs/product/theme.md`（AGENTS.md §10 额外审查文件）
4. `.superpowers/sdd/DISPATCH-TEMPLATE.md`（实施者纪律）· `.superpowers/sdd/REVIEW-TEMPLATE.md`（评审者纪律）
5. 兄弟计划 [批 2](./2026-09-11-frontend-redesign-batch2-bundle.md) 的 **§收口回写**（**必读**：它的「瓶颈清单」逐条写明哪一项归批 3、哪一项不许批 3 碰）· [批 1](./2026-09-11-frontend-redesign-batch1-deletions.md) 的「收口回写」（连通性四纪律、仪器自检的出处）

---

## Global Constraints

- **本批范围（规格 §10 批 3 行逐字）**：A′ 顶栏 + ⌘K + 溢出策略 + 窗口尺寸 + 列注册表 + 断点 + `--nav-h`。
- **★ 本批的四个非目标（违反即任务失败）**
  1. **不重做批 2 的包体工作**。批 2 已收口（首屏 **654.72 → 92.79 kB**，守卫 exit 0）。批 2 §瓶颈清单里**点名归批 3 的只有三条**（见「批 2 转交给批 3 的三条」），其余（`structuredBlocks` 存废 · `katex` 版本偏斜 · KaTeX 字体 · 编辑器传递链 · 守卫接线 CI · 嵌套路径盲区）**一律不碰**，各有具名归属。
  2. **不把组件迁移到 L1 原语**（`app/src/ui/primitives/**` 42 个文件，契约见 ADR-033）——**那是批 4**。本批的顶栏/命令面板**不得** import `ui/primitives`：导入它会把 `motion.css` 与整层 CSS 拉进首屏，直接吃掉批 2 挣来的 107 kB 余量。新壳层文件只允许 import `ui/icons`（图标集，批 0-B 已交付）与 `ui/zIndex`（六档标尺，批 0-A 已交付）。
  3. **不建视图层**（`ViewSpec` / `viewRegistry` / `ViewSwitcher` / 会话 4 视图 / 笔记 3 视图 / 惰性挂载 / flushSave 守卫）——**那是批 5**（规格 §7、§10 批 5 行）。
  4. **不装 GSAP、不加任何动效**（`transition` / `@keyframes` / `useGSAP` / 强度三档 / 相变凝固）——**那是批 6**（规格 §8、§10 批 6 行）。本批新增的 CSS **只允许静态布局属性**；`prefers-reduced-motion` 块仍只有 `ui/primitives/motion.css` 一处（批 0-D 交付）。
- **★ 行数红线（唯一有效口径）**：单文件 **≤300 行**（**全部行数，含空行**）。唯一有效口径 = `[System.IO.File]::ReadAllLines($p,[System.Text.Encoding]::UTF8).Count` == `scripts/line-limits.mjs` 的 `countLines()`。⚠️ **绝不使用**：`Get-Content`（本机 PowerShell 5.1 + 码页 `gb2312` 按 GBK 解码、**少算可达 56 行**）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数（末尾无换行的文件少算 1）。301–600 区间必须登记在 `docs/standards/line-limit-exemptions.md`；>600 必须硬拆。**本批只新增 ≤300 行的小文件 + 改既有文件**；豁免表里**只许调整已有行的数值**（`node scripts/line-limits.mjs --write` 生成，**不得手改数字**，更**不得新增豁免登记**）。
- **🔴 三个贴边的文件（动手前先量，别等门禁红）**

  | 文件 | 实测 | 余量 | 纪律 |
  |---|---|---|---|
  | `scripts/line-limits.mjs` | **300/300** | **0** | **一个字都不许加**（本批不许改它；它是门禁本体） |
  | `scripts/check-command-registry.mjs` | **300/300** | **0** | 同上 |
  | `scripts/check-bundle-budget.mjs` | **299/300** | 1 | 任何新增必须**按语义拆分**（拆「口径 / CLI」） |
  | `app/src/build/manualChunks.test.ts` | **292/300** | 8 | 任何新增必须**按语义拆分**（拆「分组规则 / 反例守卫」） |
  | `app/src/pages/ChatPage.tsx` | **593/600** | 7 | **本批不许改 ChatPage.tsx**（列接线走 `ChatSidebar` 的 props，页面文件不动） |
  | `app/src/App.tsx` | **519/600** | 81 | 唯一允许增长的文件，但每步都要量；>600 即**硬限违规**，必须先拆 |
  | `app/scripts/gen-tokens.mjs` | 255/300 | 45 | 只加 `navHeight` 一处真源 + 两行产出 |
  | `app/src/components/AiConversationDock.tsx` | 316（已登记） | — | 只改 `top: 56` → `top: var(--ed-nav-h)` 一行；改完 **=`--write` 刷新登记值** |

  > ⚠️ **`app/scripts/*.mjs` 与 `scripts/*.mjs` 不在 `line-limits` 的扫描域**（`SCAN_DIRS=['app/src','app/src-tauri/src']`、`SOURCE_EXT=/\.(ts|tsx|rs)$/`）⇒ 上表两处「300/300」**没有门禁保护**，只能靠手工量（批 2 follow-up #16 已登记，归批 8）。**本计划的所有新增脚本一律放 `app/src/shell/*.ts` 或 `app/src/**/*.test.ts`**（在扫描域内），**不新增 `scripts/*.mjs`**。
- **改造后必须平齐的门禁基线（`dev@f5c35990` 计划者实测，八条）**

  | 门禁 | 基线 |
  |---|---|
  | `node scripts/check-command-registry.mjs` | exit 0 · **定义 312 / 注册 312 / 重复 0** |
  | `node scripts/line-limits.mjs --full` | exit 0 · **`>600` 0 · 301–600 档 123 · 登记条目 123** |
  | `node scripts/docs-check.mjs` | exit 0 · 扫描 273 个 Markdown（检查 173 个），5 项全 ✅ |
  | `cd app; npx tsc --noEmit` | exit 0（0 错） |
  | `cd app; npx vitest run` | exit 0 · **125 文件 / 1233 用例**（本批**只许增加**；任何既有用例的**断言修改**都要 STOP 并报控制方） |
  | `cd app/src-tauri; cargo test --test app_lib_tests` | exit 0 · **2300 passed / 0 failed / 6 ignored**（本批不动 Rust ⇒ 必须逐字持平） |
  | `node scripts/check-bundle-budget.mjs --no-build` | exit 0 · 首屏 **92.79 kB**（入口 27.87 + `vendor-react` 60.37 + `vendor-tauri` 4.55）· 余量 **107.21 kB** |
  | `cd app/src-tauri; cargo clippy --all-targets` | exit 0 · 判据 = **`诊断文本 @ 文件:行:列` 排序去重后的集合**；计划者实测集合 **20 条位置**（`src-tauri` 相对路径，见下文「clippy 判据」） |

  > **每个任务都必须以这八条全绿收尾**，不可「稍后一起跑」。本批改动**不碰 Rust**，故 `cargo` 两条**必须逐字不动**；一旦变动即说明改错了面。
  > **★ clippy 判据（承批 2 的实测更正，不许再犯）**：**禁止比 sha256** —— 批 2 实测基线与复跑的行尾/编码不同（BOM+CRLF vs LF，1724 B vs 1702 B），sha256 永远假红而集合逐行相同。本批用 `tmp/clippy-set.mjs` 抽 `--> src/x.rs:行:列` 去重排序成集合再比（该脚本自带自检：阳性样本 2 条必命中、无 `-->` 的文本必 0 条）。⚠️ **口径警告（必须先读再引用）**：批 2 台账写的「**19 条诊断**」是 `(lib test) generated 19 warnings` 这个 **cargo 汇总行**的数；计划者用 `--all-targets` 抽到的**唯一位置集合是 20 条**（`db_migrations.rs` 同文件两处、`commands_proofread.rs` 四处）。**集合对集合比**时请以本次实测的 20 为基线，并**在报告里写清你用的是哪个口径**。
- **⚠️ 判退出码的固定口径（PS 5.1）**：`cargo` 往 stderr 写 warning 时，`2>&1 | …` 会被 PS 5.1 包成 `NativeCommandError`，让**成功的命令报 exit 1**。⇒ 原生命令一律 `2>file` 重定向或直接读 `$LASTEXITCODE`，**绝不 `2>&1 |`**；需要回看输出时**重定向到文件再读回**。
- **★ 仪器纪律（承批 1/批 2 的 13 类陷阱，本批新增第 14–17 类；逐条适用）**
  1. **任何「0 命中」/「不存在」结论必须点名仪器，并先证明该仪器能命中一个已知存在的串、且对无意义串报 0。** 本批每个「0 命中」型声明都要附这样一对自检。**「文件不存在」在批 2 被误报两次** ⇒ 判存在性一律**当场列目录**（`Get-ChildItem <父目录>`），不用「我记得」。
  2. **禁用裸 `includes()` / 子串 grep 判连通性**：用**引号定界字面量**或**正则词边界**（批 1 实测 6 例误判：`refine_session` ⊂ `auto_refine_session` 等）。
  3. **`\b` 在全角 `）`（U+FF09）前永不匹配**；需要边界时用显式字符类（如 `(?<![A-Za-z0-9_])`）。
  4. **PowerShell `-Include` 无 `-Recurse` 时静默返回 0 个文件**（`Get-ChildItem app\src -File -Include *.tsx` = **0**）；正确写法 `Get-ChildItem -Recurse -File | Where-Object { $_.Extension -in '.tsx','.ts' }`。
  5. **全树扫描必须排除 `.superpowers/`**（各批 `tmp/` 下的历史归档副本会被当成命中源）。
  6. **🔴 任何含中文的搜索/脚本一律不得经 PowerShell 字符串层**：PS 5.1 按 GBK 误解码，中文模式被搜成 `瀛愪覆` ⇒ **假 0 命中**。用 Node/Python，或把内容写进 **UTF-8 文件**再读。**本计划里所有中文串的检查都用 `*.test.ts`（Node 读 UTF-8）实现。**
  7. **整树 ripgrep 遵守 `.gitignore`** ⇒ 对**被忽略目录整体失明**（批 2 实测：`app/src/build/manualChunks.ts` 在 `app/` 下报 0 命中、窄域报 19）。⇒ 用 `rg --no-ignore` / `git grep --no-index` / 显式遍历。
  8. **PS 5.1 `>` 重定向写 UTF-16LE** ⇒ Node `JSON.parse` 读捕获文件会失败；用 `cmd /c "… > f"` 或 `Out-File -Encoding utf8`。
  9. **`git archive` 在未跟踪子目录产出 10240 字节空归档 + exit 0**；解包树里 `git grep` **静默 0 命中**（无 `.git`）⇒ 一律在仓库根 + 绝对 `-o`。**且 `git archive` 走不到未跟踪文件** ⇒ 判「提交自洽」前先 `git add` 或改用工作树。
  10. **`Copy-Item` 保留 mtime** ⇒ cargo 回放陈旧诊断；还原文件后**先 `touch`**。
  11. **`cmd` 会吃掉 `^`**（`cmd /c "git show X^:path"` 静默变成看当前提交）。
  12. **辅助函数/变量禁用 PowerShell 内置别名名**：`rd` `rm` `mv` `cp` `ls` `cd` `cat` `sc` `gi` `si`。
  13. **A/B Δ 恰为 0 时先当仪器故障**：先自证仪器能测出已知差异，再下结论。
  14. **🆕 CSS px 的测量必须用 CDP 精确视口，不能用 `--window-size` + `--dump-dom`**：批 3 计划期实测该路径下**文本字形宽度随视口漂移** —— 同一页、同一字体栈、同一字号，品牌串在窗口 1024 量到 **83 px**、1180 量到 **109**、1440 量到 **142**；而同页 `width:500px` 固定块恒 500、15px/700 的六汉字哨兵恒 **90.00**、`dpr` 恒 1、`document.fonts.status` 恒 `loaded` ⇒ **不是字体未就绪、不是缩放，是该路径下度量本身不可信**。正解见 `tmp/edge-probe/nav-measure3.mjs`（`Emulation.setDeviceMetricsOverride` 把视口钉成精确值）。
  15. **🆕 不能用 `scrollWidth` 量 flex 项**：顶栏是 `display:flex`，`scrollWidth` 对**被压缩**的元素返回压缩后的**整数**值 —— 实测品牌项固有宽 **141.8125**，1024 视口下 `scrollWidth` = **83**（静默低估 ≈ 59 px，足以把「溢出 352 px」读成「余量 26 px」）。正解：先把待测元素 `flex:0 0 auto` + `opacity:0`，再用 `getBoundingClientRect().width` 量，量完**逐项恢复**。
  16. **🆕 emoji 不进任何宽度预算**：`--dump-dom` 路径下同一元素（含 `✨`）在窗口 1024 量到 **191 px**、1180 量到 **245 px**（+28%）。**所有像素结论一律以剥除 emoji 的纯文字/纯图标形态下判**；带 emoji 的读数只作参考。
  17. **🆕 模板字符串里的注释不许出现反引号**：在 `write`/`edit` 写出的 Node 探针里，JS 模板字符串内的 `` ` ``（哪怕在 `//` 注释里）会**提前闭合模板**，报 `SyntaxError: Unexpected identifier`。本批实测踩到一次。写作时用「」代替。
  18. **🆕 本仓的组件测试底座与常见假设不同（计划期实测，照抄勿改）**：`app/vitest.config.ts:13` 全局 `environment: "node"` ⇒ **每个组件测试文件首行必须写 `// @vitest-environment jsdom`**（先例 `app/src/ui/primitives/Button.test.tsx:1`），否则 `document is not defined`；且**未装** `jest-dom` 与 `user-event`（`Button.test.tsx:14` 明写「硬约束：不新增依赖」）⇒ **断言用原生 DOM API**（`getAttribute` / `textContent` / `toBeTruthy`），**不许** `toBeInTheDocument()`；**交互用 `fireEvent`**，**不许** `import userEvent from "@testing-library/user-event"`（包不存在，`tsc` 与 vitest 双红）。另有 `setupFiles: ["src/test/setup.ts"]`（CMS6 的 `Range` 几何桩）；`testTimeout: 15000`。
- **★ 连通性判据（批 1「收口一」第 1 条）**：**「这段代码看起来还有人在用」不是保留依据**；判一块代码是否仍连着，唯一可靠的方法是**从入口反向做可达性分析**。本批有三处必须这样判：① 改 `top: 56` 会不会漏掉别的消费者（**答案：会 —— `ui/zIndex.guard.test.ts` 的冻结名单逐字钉着那一行**）；② 删/改 `NAV_ITEMS` 会不会漏掉别的消费者（用 `node scripts/bundle-eager-graph.mjs` 看首屏可达集）；③ 列宽改为注册表后，`components/ClassroomSourceColumn.tsx` 等**经 props 注入**的消费者是否仍在（**props 契约不是连通性证据，import 图才是**）。
- **★ 「删/改一行」也必须先量冻结名单**：本批要改 `AiConversationDock.tsx:242` 的 `top: 56`，而 `app/src/ui/zIndex.guard.test.ts:57` 的 `FROZEN_NUMERIC_ZINDEX` **逐字**含那一行。该守卫第 2 个 `it`（「冻结名单没有过期项」）会在改完当场变红 ⇒ **必须在同一次提交里把那条名单项改成新行原文**（`key` 刻意不含行号，故只需改文本）。名单**长度不变**（20→20 之外的这一条不增不减），棘轮语义（只许变短）不破。
- **★ 文本扫描型守卫会被新增文件误伤**：新壳层文件里若要提到被守卫的字符串（如 `"vendor-gsap"`、裸 `zIndex: <数字>`），**用拼接写法或改述**，**绝不为了绕开守卫去改守卫本身**。本批要特别小心 `ui/zIndex.guard.test.ts`（口径④：`/zIndex\s*:\s*-?\d+/` 匹配内联裸数字）与 `ui/icons/no-inline-svg.test.ts`（新文件里**不许出现内联 `<svg` 字面量**，图标一律走 `<Icon name="…" />`）。
- **★ 提交纪律**：`git commit --only -m "<msg>" -- <显式路径…>`（本仓**多 agent 并行**，裸 `git commit` 会扫走别人已暂存的条目）。**新建文件必须两步**：`git add -- <path>` 然后同样的 `--only` 形态（裸 `--only` 对未跟踪路径报 `pathspec … did not match any file(s) known to git`）。**禁止**：`git add -A` · `git add .` · `git stash` · `git checkout --` · `git restore` · `git clean` · `git reset --hard` · `--no-verify` · `git add -f`（本批无被忽略的入库文件）。Conventional Commits：`<type>(<scope>): <subject>`，**subject ≤50 字**、动词开头、无结尾句号。⚠️ **`commitlint.config.js` 不拦 50**（`header-max-length` 沿用 config-conventional 的 **100**）⇒ **抄提交命令前人工数字符数**（批 2 有两处 51 字符被照抄落地）。
- **★ 判门禁要在提交树上判**：要证「某个提交自洽」，必须导出该提交的树再跑；⚠️ 但 `git archive` **取不到未跟踪文件**，且解包树里**没有 `.git`**（`git grep` 静默 0 命中）⇒ 本批的自洽判据是：**该提交的 `git show --stat` 含本步全部路径 + 工作树在该提交点全绿**（`node_modules` 因不入库无法在导出树上跑 tsc/vitest/cargo，与批 2 同一限制，**必须在报告里如实单列**）。
- **★ `core.autocrlf=true` + 工作树存在 LF-only 异类文件** ⇒ `git hash-object` 相等**与**空的 `git diff` 都可能掩盖 EOL 差异；**`git status` 干净是唯一可靠判据**。
- **★ 计划级冲突的处理（批 1 三处、批 2 两处，属正常）**：实施中发现**两条已批准要求互相排斥**时，**STOP，点名冲突，并把「绿色方案」也一并实测出来**（读数 + 命令 + 代价），一次报控制方裁决 —— **不要自行取舍，也不要两条都硬做**。本批已预判两处（见 §待裁决清单），遇到新的照此办理。
- **报告与临时文件**：报告写 `.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/task-<N>-report.md`，评审写同目录 `task-<N>-review.md`。**该目录已被 `.superpowers/sdd/.gitignore`（内容为 `*`）整体忽略** ⇒ **永不 `git add -f`**。探针/日志/基线/解包树一律写 `.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/tmp/` 下的**子目录**，**不许放仓库根**。
- **★ 每个任务结束都要跑完八条门禁**，并在报告里给出**逐条命令 + 观测输出 + exit code**；缺一条即视为未完成。
- **★ 规格漂移的处置**：本计划的 §实测基线 是**计划者实测**，与规格 §2/§6 冲突时**以本计划为准**，并在 Task 14 回写规格（§14 已规定「文档与代码同提交」）。**但 §待裁决清单里的两处不得由实施者自行裁决。**

---

## 实测基线（计划者 2026-09-11 在 `dev@f5c35990` 实跑；下游一切目标与排序都从此派生）

### 表 1 · 壳层结构（今天的真实形态，**不是规格 §2 那句「9 个顶部 Tab」**）

**命令**：`read app/src/App.tsx`（全文 519 行）· `grep -n "useColumnLayout" app/src` · `read app/src-tauri/tauri.conf.json`

| 维度 | 实测 | 证据 |
|---|---|---|
| 顶栏渲染 | `App.tsx:286-380` 一个 `<nav style={{height:56,…}}>`；品牌串 `:298`；`NAV_ITEMS.map` `:299-316`；对话面板按钮 `:318-331`；采集徽标 `:335-358`；AI toast `:360-379` | 全文已读 |
| `NAV_ITEMS` | `App.tsx:72-87`，**9 项**：classroom / sessions / notes / action / review / chat / knowledge / goals / **settings**（规格 §6.1 要 **8 项 + 齿轮** ⇒ 设置要下沉） | 全文已读 |
| 页面类型 | `App.tsx:70` `type Page = "classroom" \| … \| "settings"`（9 个字面量） | 全文已读 |
| 页面槽 | `PageSlot`（`:142-149`）**一页一个 slot**，`mountedPages`（`:159-162`）首访挂载 + 保活；9 个 slot 硬写在 `:385-492` | 全文已读 |
| 页面注册位置 | **没有注册表** —— 页面是 `App.tsx:23/29-42` 的 10 个 import（课堂静态 + 8 个 `lazy`）与 9 段 `<PageSlot>` JSX 的**双重硬编码** | 全文已读 |
| 列基础设施 | `app/src/hooks/useColumnLayout.ts`（**108 行**）是**执行器**：`w`/`folded`/`resizeBy`/`expand`，持久化键 `layout:col-width:{key}` / `layout:col-fold:{key}`（`:43,53`），阈值参数由调用方传（`autoFoldBelow`，`:75,81`） | 全文已读 |
| 列调用点 | **7 处 / 5 页**：`ClassroomPage.tsx:53`（860）· `SessionsPage.tsx:48`（860）· `NotesPage.tsx:89,90,91`（860 / **700** / **1100**）· `KnowledgePage.tsx:60,61`（860 / 无）。**ChatPage / GoalsPage / ActionPage / ReviewPage / SettingsPage 五页 0 调用** | `grep` 命中 50 行，逐条读过 |
| 未接入的硬编码列宽 | `components/ChatSidebar.tsx:65` `width: 240` · `pages/GoalsPage.tsx:80` `width: 380` · `components/NoteReadingView.tsx:174` `width: 180`（大纲列，**hook 声明 140–260 可调但组件写死 180**）· `components/KnowledgeDetailPanel.tsx:132` `width: 34`（折叠窄条，无持久化） | 逐文件读过 |
| 右栏跳动 | `components/ClassroomRightPane.tsx:60` `maxWidth: 640` / `:81` `maxWidth: 640` / `:114` `maxWidth: 640`，而 `:48` 宿主是 `flex:1` ⇒ 「640 与全宽两档跳动」 | 逐文件读过 |

### 表 2 · 7 处魔数（逐条 `文件:行`·**今日值**·规格目标）

> **口径**：规格 §10 批 3 行的「7 处魔数归零」**未逐条点名**是哪 7 处（见 §待裁决清单 A1）。本表是计划者按「规格 §6.2/§6.3 的列契约改动清单 + 审计 J1/J2 的 P1–P3 定级」**反推**出的 7 处，**每处都能在规格里找到对应的目标值**。加上 `--nav-h` 自身的定义点，全批共 **8 个文件族**。

| # | 魔数 | 今日落点（`文件:行`） | 今日值 | 规格目标 | 本批任务 |
|---|---|---|---|---|---|
| M1 | 导航高 | `App.tsx:288` `height: 56` + `AiConversationDock.tsx:242` `top: 56` + 8 个页面的 `calc(100vh - 56px)` | 56（**10 处/9 文件**） | `--nav-h` 变量（规格 §1 决策 16） | **T2 · T3** |
| M2 | 断点阈值散落 | `ClassroomPage.tsx:53` · `SessionsPage.tsx:48` · `NotesPage.tsx:89` · `KnowledgePage.tsx:60`（=**860**）；`NotesPage.tsx:90`（=**700**）；`NotesPage.tsx:91`（=**1100**） | 860×4 · 700×1 · 1100×1 | **1024 / 1100 / 1180**（规格 §1 决策 16）；§6.2 全表：三列页 1024 · 两列页 1100 · 大纲列 1280 | **T5** |
| M3 | AI 对话侧栏 | `ChatSidebar.tsx:65` | **240** | 260 / 200 / 320 · `autoFoldBelow` 1100（规格 §6.2「接入列基础设施」） | **T9** |
| M4 | 目标左列 | `GoalsPage.tsx:80` | **380** | 320 / 240 / 420 · 1100（§6.2「默认 380 → **320**」） | **T9** |
| M5 | 设置页宽度 | `SettingsPage.tsx:59` | `maxWidth: 720` **左对齐** | 居中 860（§6.2「现 720 左对齐 → 改居中」） | **T9** |
| M6 | 课堂右栏 640 | `ClassroomRightPane.tsx:60,81,114` | `maxWidth: 640`×3（与 `flex:1` 全宽并存） | 「统一 wrapper，消灭 640/全宽两档跳动」（§6.2 🌐 课堂 右面板行） | **T10** |
| M7 | 窗口尺寸 | `app/src-tauri/tauri.conf.json:16-17` | **960×720**，**无 `minWidth`/`minHeight`** | 默认 **1280×800**、最小 **1024×640**（§1 决策 17；另：`html,body,#root` reset + 滚动条 6px） | **T4** |

**同表另记（不计入 7 处，但同属本批要碰的硬编码）**：`NoteReadingView.tsx:174` 的 `width: 180`（§6.2「接线拖拽+记忆或删钩子」）→ **T8**；`KnowledgeDetailPanel.tsx:132` 的 `width: 34`（§6.2「34px 窄条收进统一列头」）→ **T8**；`app/index.html` 的 `<html lang="en">` 与缺 `#root` 高度 → **T4**。

### 表 3 · 顶栏宽度预算（**仪器：`tmp/edge-probe/nav-measure3.mjs`，CDP 精确视口**）

**仪器自检（每次运行都打印）**：`PROBE_SELFTEST=12345` · `MISS_COUNT=0` · `fixed_500=500` · `sentinel_text=90` · `dpr=1` · `fonts=loaded`。
**稳定性自检**：同一形态在 1024 与 1440 下**逐元素宽逐字相同**（1024 与 1440 两次运行 `nav_natural_width` 均为 **1375.74**）⇒ 仪器可复跑。

**命令**（逐个跑，每个形态 × 每个宽度各一次）：
```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node ".superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\edge-probe\nav-measure3.mjs" --width 1024 --mode current --port 9333
```

| 形态 | 视口 | 顶栏固有宽（含 toast） | **剔除 toast** | 剔除 toast 的余量 | 判定 |
|---|---|---|---|---|---|
| **current**（现网 9 Tab 文字） | 1024 | **1375.74** | **997.99** | **+26.01** | ⚠️ 常态勉强放下 |
| current | 1180 | 1375.74 | 997.99 | +182.01 | 常态宽松 |
| a-tabs（A′ 8 项纯文字） | 1024 | 1287.74 | 909.99 | +114.01 | ✅ |
| **icon-only**（A′ 8 项仅图标） | 1024 | 1127.83 | **750.08** | **+273.92** | ✅ **1024 档的真实余量来源** |

**逐元素固有宽（CDP 精确视口 1024，`getBoundingClientRect().width`）**：品牌 `熵减 · 本地知识提取` = **141.81**（+`marginRight` 20 = 161.81；独立哨兵交叉复核 **141.8125** ✅）；课堂助手 **84**；会话/笔记/行动/复习/体系/目标/设置 = **58**×7；`AI 对话` = **73.91**；对话面板按钮 **74**；`Ctrl+K` 占位 **60.27**；采集徽标 **58**；**AI toast = 373.75**。

**⇒ 三条硬结论（本批排序的依据）**

1. **今天的顶栏在 1024 下常态只剩 26 px 余量，而 AI toast 一出现就溢出 351.74 px（1375.74 > 1024）**。规格 §6.1 的「<1024 由最小窗兜底」**不成立** —— 1024 常态已在刀口上，1024–1180 的「仅图标」档**必须真的把文字撤掉**（撤掉后 750.08，余量 273.92），任何「图标+文字」的折中都撑不住 1024。**这是本批要达到「1024 无溢出」必须先解决的结构问题**（规格 §13 风险表与审计 J1-4/J1-7 都点了这一处，但都没有给出数字；本表给出数字）。
2. **toast/badge 挤在 56px 单行是溢出的唯一主因**（373.75 = 1024 视口的 36.5%），且今天 `dock 按钮` 与 `采集徽标` **各写了一个 `marginLeft:"auto"`**（`App.tsx:323` / `:338`），是双 auto 的脆弱布局。
3. **规格 §6.1 的「约 1070px / 约 720px」是**只数 Tab 的**估数**：实测 8 项纯文字 Tab 合计仅 **497.91**（84 + 58×4 + 73.91 + 58×2 中不含品牌与辅助件），**不含品牌（141.81）、对话面板钮（74）、⌘K（60.27）、徽标（58）、toast（373.75）**。⇒ 引用这两个数必须说明「不含品牌与右侧状态件」，否则会凭空少算 **≈ 334 px**（不含 toast）/ **≈ 708 px**（含 toast）。

### 表 4 · 本批要改的真实落点（逐个 `文件:行`，均为计划者实测）

| 落点 | 事实 | 证据 |
|---|---|---|
| `app/src/App.tsx` | **519 行**（301–600 档，登记值 519 已同步）；`:20-42` 10 个 import（课堂静态 + 8 lazy + dock）；`:70` `type Page`；`:72-87` `NAV_ITEMS` 9 项；`:142-149` `PageSlot`；`:159-162` `mountedPages`；`:286-380` 顶栏；`:385-492` 9 个 slot | 全文已读 |
| `app/src/ui/icons/` | **10 个文件**：`Icon.tsx` 46 · `index.ts` 19 · `paths.ts` 52 · `paths.domain.ts` 81 · `paths.action.ts` · `paths.test.ts` · `Icon.test.tsx` · `no-inline-svg.test.ts` · `types.ts`。**域图标 9 个**（`paths.domain.ts:18-80`：`classroom`/`sessions`/`notes`/`action`/`review`/`knowledge`/`goals`/`settings`/`ai`）—— **键名与 9 个 Page 一一对应**；动作图标含 `search`（`paths.action.ts:20`，⌘K 可用） | 逐个读过 |
| `app/scripts/gen-tokens.mjs` | **255 行**，`SCALE_SOURCE`（`:80-101`）→ `renderCss()`（`:120-162`）→ `renderTs()`（`:164-206`）；产物 `app/src/ui/tokens.css`（97 行）+ `tokens.gen.ts`（60 行）由 `tokens.drift.test.ts`（87 行）+ `--check` 双守。**没有任何高度/尺寸类 token** | 全文已读 |
| `app/src/ui/zIndex.guard.test.ts` | **184 行**；`FROZEN_NUMERIC_ZINDEX`（`:56-115`）**逐字**含 `"components/AiConversationDock.tsx::position: \"fixed\", top: 56, right: 0, bottom: 0, width: PANEL_W, zIndex: 900,"`（`:57`）；第 2 个 `it`（`:166-170`）要求名单项**必须仍在现网命中** | 全文已读 |
| `app/src-tauri/tauri.conf.json` | **40 行**；`app.windows[0]` 只有 `title`/`width:960`/`height:720`（`:14-18`），**无 `minWidth`/`minHeight`/`resizable`**；另有浮窗在 Rust 侧建：`commands_window.rs:112-117` `inner_size(360,240)` + `resizable(false)`（**不属本批 7 处**，规格 §1 决策 17 只管主窗） | 全文已读 |
| `app/index.html` | **14 行**；`<html lang="en">`（`:2`，中文应用）、`<title>Tauri + React + Typescript</title>`（`:7`）；**无任何 reset**、`#root` 无高度 | 全文已读 |
| `app/src/main.tsx` | **13 行**；只 import `./ui/tokens.css` 与 `./note-mark.css`；**没有全局 reset 的落点** | 全文已读 |
| 页面文件行数 | `ActionPage` 41 · `SettingsPage` 146 · `GoalsPage` 152 · `ReviewPage` 222 · `ClassroomPage` 278 · `NotesPage` 295 · `SessionsPage` 352 · `KnowledgePage` 437 · **`ChatPage` 593** | 逐文件 `ReadAllLines` |
| 关于 `AiConversationDock` | `PANEL_W = 560`（`:38`）· `top: 56`（`:242`）· 316 行已登记 | 全文已读 |
| `app/dist` | 已存在且为批 2 终态产物（`index-C4ezj_on.js` 87,573 B）⇒ 本批**不需要先构建**就能跑 `--no-build` 预算读数 | 实测列目录 |

### 表 5 · 批 2 转交给批 3 的三条（**只做这三条，其余一律不碰**）

| 来源 | 转交内容 | 本批落点 |
|---|---|---|
| 批 2 §瓶颈清单「Task 6 评审 M-1」 | **懒 chunk 加载失败会卸载整个 `MainShell`**（`PageSlot` 的 `<Suspense fallback={null}>` 之上只有全局 `AppErrorBoundary`，`:119` 包 `MainShell`），已访问页状态一起丢 ⇒ 与「保活 + 不丢稿」取向相反 | **T13**（叶级错误边界 + 失败态） |
| 批 2 §瓶颈清单「Task 7 风险 1」 | **两个窗口变体分支没有错误边界**（`?float=1` / `?overlay=1` 的早返回里只有 `Suspense`）⇒ chunk 加载失败 = 该窗**全空白** | **T13** |
| 批 2 §瓶颈清单「未做 #6」 | **首访加载态**：`Suspense fallback={null}` → L1 `Loading` 原语（批 2 因「引入原语会把 CSS 拉回首屏」而推迟） | **T13**，但**仍不得 import `ui/primitives`**（非目标 2）⇒ 用一个 ≤25 行的**自足**静态占位（见 T13），并在 T13 报告里说明「真正的原语化留在批 4」 |

> 批 2 的其余 follow-up（预算守卫接线 CI · 嵌套路径盲区 · `Circular chunk` 门禁 · `structuredBlocks` · `katex` 版本偏斜 · KaTeX 字体 · 编辑器传递链 · `build/` 未锚定 · `scripts/*.mjs` 不在扫描域 · `vite.config.ts` 不在扫描域 · `@types/*` 挪 devDependencies · `commitlint` 加 50 上限）**各有具名归属批次，本批一个都不做**。

### 表 6 · 规格漂移（计划期实测，逐条在 T14 就地回写；**原文一律保留 + 加注**）

| # | 规格原文（`文件:行`） | 实测 | 处置 |
|---|---|---|---|
| D1 | §2「无路由；`useState<Page>` + **9 个顶部 Tab**」（`:92`） | 顶栏**不只是 9 个 Tab**：还有对话面板按钮（`App.tsx:318-331`）、采集徽标（`:335-358`）、AI toast（`:360-379`），且**两个 `marginLeft:"auto"`** | T14 在 §2 该行加注；本计划表 1 已记 |
| D2 | §2「`useColumnLayout` 只被 **4/9 页**采用」（`:97`） | **5 页**（课堂 / 会话 / 笔记 / 体系）× **7 处**调用 | T14 在 §2 该行加注 |
| D3 | §6.2 笔记 列表列 `autoFoldBelow` 目标 **1024** | 今日是 **700**（`NotesPage.tsx:90`），**第三个互不相同的阈值** | T5 改判；T14 在 §6.2 加注「今日 860/700/1100 三值并存」 |
| D4 | 审计 J1-8「`calc(100vh-56px)` 等 56px 魔数硬编码**三处**」（`docs/Foresight/ux-market-convention-audit.md:214`） | **10 处 / 9 文件**（其中 `calc(100vh - 56px)` **8 文件 9 行**：`ReviewPage` 两处） | T3 归零；T14 在审计该行加注（审计文档属 §14 的同步面） |
| D5 | 审计 J1-8 的落点写 `NotesPage:395 / AiConversationDock:242 / App:225` | 今日实际：`App.tsx:288` · `AiConversationDock.tsx:242` · 8 个页面共 9 行（**`NotesPage:395` 已因批 0-C2 拆件而不再是那一行**） | T14 在审计该行改指新落点（照批 0-C2 对同一文档的处置先例） |
| D6 | §6.2 大纲列「**接线**拖拽+记忆**或删钩子**（现为「假可调」）」 | 现状是**删钩子更省事**的一条路：`useColumnLayout("notes-outline", {140,260})` 声明可调，而 `NoteReadingView.tsx:174` **写死 180**、且 `onToggleOutline` 走 `setManualFolded`（**不含 `expand()`** ⇒ J1-3 折叠后点窄条永不展开的交互死局） | T8 Step 4 选**接线**（`width` prop + `expand()`）；**若控制方选「删钩子」，T8 Step 4 整步改为删 `outlineCol` 并登记**——**属 A1 裁决范围** |
| D7 | §6.1「⌘K 命令入口用来替代现在手写的 **9 个 `focus*` 参数跳转**」 | 实测 **10 个**字段（`App.tsx:164-202`：多一个 `focusChatId`，REQ-274 引入） | T12 Step 5 **保守**：只做入口收敛、**不删字段**（删字段属批 5）；T14 在 §6.1 加注 |

---

## 待裁决清单（**控制方待裁决 —— 逐条在开工前裁决；未裁决的任务不受阻**）

> **每一条都标了 (控制方待裁决)**：规格在这五处**没有给出可直接执行的裁决**（或两处要求互相排斥），
> 计划者只能给出**可执行的两条走法 + 代价读数**，**不得自行拍板**（批 1 已五次证明「计划自己拍板的范围决策会被现实证伪」）。

| # | 事项 | 规格原文与分歧点 | 影响 | 建议（**仅供参考，不代替裁决**） |
|---|---|---|---|---|
| **A1** | **「7 处魔数」的点名口径**（控制方待裁决） | 规格 §10 只写「7 处魔数归零」，**全仓无一处逐条点名**。计划者按 §6.2 改动清单反推出了表 2 的 7 处（M1–M7，每处都能对上规格里的一句目标），但另有 4 处同样合规的候选：`NoteReadingView:174`(180) · `KnowledgeDetailPanel:132`(34) · `ColumnBar` 窄条宽 · `ClassroomRightPane` 是否算 1 处还是 3 处 | 决定「归零」的验收清单与 T8/T9/T10 的边界 | **采纳表 2 的 M1–M7 为验收清单，并把 T8 的两处作为「同批加做但单列」**（它们不做也不影响规格 §6.2 的其它行；做了会顺手让「假可调」缺陷消失） |
| **A2** | **≥1180 档「图标+文字」里的「文字」是 emoji 还是纯文字**（控制方待裁决） | 规格 §6.1 写「≥1180 图标+文字；1024–1180 仅图标+悬浮名」。今日 9 个 Tab 的 label 带 emoji（`📡 课堂助手` …）；规格 §4.2 已定图标语言为**自绘线性图标**，§6.1 又写「>1180 图标+文字」，**没说 emoji 是否撤** | 宽度：emoji+文字 1375.74 vs 纯文字 **1287.74**（差 88）；观感：emoji 与自绘图标**并排会出现两套图标语言** | **≥1180 = 自绘图标 + 纯文字 label（emoji 撤除）**，理由是 §4.2 的图标语言与 §1 决策 5（自绘图标集）已把 emoji 判出局；但**若控制方要保留 emoji 作辅助**，宽档预算须按 1375.74 复核 |
| **A3** | **AI toast / 采集徽标的归宿**（控制方待裁决） | 规格 §6.1 的 A′ 顶栏只列了「8 项 + ⌘K + 采集状态 + ⚙ 齿轮」，**没提 AI toast**；今日 toast 在导航行内（`App.tsx:360-379`，`✨ AI 任务已完成——…`）。审计 J1-7 判「提为 fixed 通知层」是 P2，但规格没有把 J1-7 列进任何批的改动清单 | 表 3 结论 1：toast 是 1024 溢出的**唯一主因**（373.75）。留在行内 ⇒ 「1024 无溢出」在**有 toast 时**必须另设机制（裁切/收起/toast 铺满） | **toast 移出顶栏行，改 `position:fixed` 顶部右侧覆盖层**（审计已给方案），徽标保留在顶栏（规格 §6.1 明确列了「采集状态」）。**但这是「不改运行行为」之外的一次结构调整** ⇒ 需控制方书面确认；若否，则 T11 走「行内裁切 + 徽标优先」的备选并**在验收里把「1024 无溢出」限定为常态（无 toast）** |
| **A4** | **1024 视口下 `--nav-h` 是否仍是 56**（控制方待裁决） | 规格 §1 决策 16/17 只定「`--nav-h` 变量」与「最小窗 1024×640」，**没给 `--nav-h` 的值**；今天的值是量出来的 56（v0.20.10 批 5 起 9 Tab，v0.18.0 起 8 Tab 也是 56） | 若 1024 档要放齿轮 + ⌘K + 状态件，56 是否够 | **保持 56**（§6.3 明确「采集态 58px LIVE 仪表」是另一根高度，常态 56 与之并列无冲突）。**本批不改高度值**，只把它变成变量 |
| **A5** | **列契约的执行器归属**（控制方待裁决） | 规格 §6.2 写「由单一注册表汇总，页面不再自建 hook」。**「不再自建 hook」不等于「删 `useColumnLayout`」** —— 它是唯一实现了「宽度记忆 + 手动/自动折叠分离 + min/max 夹取」的东西（108 行，已有 80 行单测），删掉要重写 | 若按「页面不再自建 hook」的字面理解去删 `useColumnLayout`，本批会变成一次**行为不等价**的重写 | **保留 `useColumnLayout` 作为唯一执行器**，把「规格」搬进注册表：页面改成 `useColumnLayout(col.key, columnSpec(col.key))`。注册表负责**声明与一致性**（单一真源 + 守卫测试），hook 负责**运行时**。**这与「9 页全走注册表」的验收一致** |

---

## 任务总表与派发顺序

| Task | 内容 | 依赖 | 可否并行 | 改的文件 |
|---|---|---|---|---|
| **1** | **壳层基线冻结**（结构 + 7 处魔数 + CDP 宽度预算 + 八门禁读数，全落 `tmp/`） | — | ✅ 与 T2 并行 | 0（只产出读数）→ 新增 `tmp/shell-baseline.md` |
| **2** | `--nav-h` 进 token 生成器（单一真源 + 产物刷新） | — | ✅ | `app/scripts/gen-tokens.mjs` · `app/src/ui/tokens.css` · `tokens.gen.ts` |
| **3** | `--nav-h` 归零：10 处 `56` 全改为消费变量（**含 zIndex 冻结名单改写**） | T2 | ❌ 串行 | `App.tsx` · 8 个页面 · `AiConversationDock.tsx` · `ui/zIndex.guard.test.ts` · 豁免表 |
| **4** | 窗口尺寸：默认 1280×800 / 最小 1024×640 + `html,body,#root` reset + 6px 滚动条 | — | ✅ | `tauri.conf.json` · `app/index.html` |
| **5** | 断点单一真源 `shell/breakpoints.ts` + 6 处阈值改判 | T1 | ✅ | 新建 2 文件 · `NotesPage` · `ClassroomPage` · `SessionsPage` · `KnowledgePage` |
| **6** | 导航注册表 `shell/navRegistry.ts` + 9 页接线 + 可达性探针 | T5 | ❌（独占 `App.tsx`，T3 之后） | 新建 2 文件 · `App.tsx` |
| **7** | A′ 顶栏重构（图标 + 溢出两档 + 齿轮 + 常态宽度验收） | T6 · **A2 裁决** | ❌ 串行（同文件） | 新建 3–4 文件 · `App.tsx` |
| **8** | 列注册表 `shell/columnRegistry.ts`（13 行规格）+ 阈值改判 + 大纲列接线 + 34px 窄条 | T5 | ✅ 与 T7 前半并行 | 新建 2 文件 · 6 处调用点 · `NoteReadingView` · `KnowledgeDetailPanel` |
| **9** | 未接入三处接入列基础设施（ChatSidebar / GoalsPage / SettingsPage） | T8 | ❌ 串行（消费 T8 的导出） | `ChatSidebar.tsx` · `GoalsPage.tsx` · `SettingsPage.tsx`（**不动 `ChatPage.tsx`**） |
| **10** | 课堂右栏统一 wrapper（消灭 640/全宽两档跳动） | T8 | ✅ 与 T9 并行 | `ClassroomRightPane.tsx` |
| **11** | 溢出策略终局：toast 归宿 + ⌘K 命令面板 | T7 · **A3 裁决** | ❌（同文件顺位） | 新建 2–3 文件 · `App.tsx` |
| **12** | ⌘K 数据源 `kb_search` 接线 + `focus*` 参数跳转收敛为命令 | T11 | ❌ 串行 | 新建 1–2 文件 · `App.tsx` |
| **13** | 批 2 转交三条：页级错误边界 + 变体错误边界 + 首访加载态（**不 import 原语**） | T6 | ✅ 与 T12 并行 | 新建 1 文件 · `App.tsx` |
| **14** | **验收测量 + 收口**：三条验收的机器判据 + 八门禁 + 规格 §10 回写 + v0.22 台账 + follow-ups | 全部 | ❌ 最后 | 规格 · `docs/versions/v0.22.md` · 豁免表（如需）· 本计划文件 |

> **`App.tsx` 是唯一热点**：T3 / T6 / T7 / T11 / T12 / T13 六次改同一文件 ⇒ **必须串行**（并行会造成 `git add`/`git commit` 交错污染，批 0-C 期实测 10 次事故）。**同一时刻最多一个实施者动 `App.tsx`。**
> **T2 / T4 / T5 / T8 可安全并行**（文件集互不相交）。

### 每个改造任务的统一作业模式（Task 3–13 共用，逐条照做）

1. **先立影响面**：开工前跑一次该任务会碰到的**全部**测试文件与八条门禁，把读数写进报告的「开工读数组」。
2. **一次只切一处**：改一处 → 跑门禁 → 绿则继续，红则**回退这一处**并记录，**不得**为了变绿去改测试、改 mock、加 `await`。
3. **验收判据是「既有测试逐条原样通过」+「新增用例只增不减」**；**任何既有断言的修改 ⇒ STOP 并报控制方**。
4. **凡涉及尺寸/宽度/断点的任务**都要跑一次 `node scripts/check-bundle-budget.mjs --no-build` 记首屏 gzip（本批在首屏入口 chunk 里加代码，**这是唯一会动的预算读数**），以及 `node scripts/bundle-eager-graph.mjs` 记首屏可达文件数（基线 **47 文件 / 4 包**）。
5. **报告必含「你没能验证的地方」**（诚实单列，逐条写清是「仪器不可达」还是「本批未做」）。
6. **提交**：`git diff --stat` 复核只含自己的文件 → 新建文件先 `git add -- <path>` → `git commit --only -m "<msg>" -- <显式路径…>`（subject 人工数到 ≤50）。
7. **冲突即 STOP**：发现两条已批准要求互相排斥，或本计划与实测冲突时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 复现命令 + 代价），一次报控制方裁决**。批 1 有三处、批 2 有两处，**属正常，不是失败**；**不许自行取舍，也不许两条都硬做**。本批已预判两处（A2 的 emoji 存废、A3 的 toast 归宿），遇到新的照此办理。

---

### Task 1: 壳层基线冻结（结构 + 7 处魔数 + CDP 宽度预算 + 八门禁读数）

> **为什么第一个做**：规格与本批的验收里有一句「9 页全走注册表」和一句「7 处魔数归零」，**两句在今日代码里都没有机器判据，而且规格没有逐条点名是哪 7 处**。本任务把计划者的实测固化下来，让后续每个任务的「前/后」都有同一个尺子。**本任务不改任何生产代码。**

**Files:**
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/tmp/shell-baseline.md`（不入库）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/tmp/build-before.txt`（不入库）
- Read（只读，不改）: `app/src/App.tsx` · `app/src/hooks/useColumnLayout.ts` · `app/src-tauri/tauri.conf.json` · `app/index.html` · `app/src/main.tsx` · `app/scripts/gen-tokens.mjs` · 9 个页面文件 · `ChatSidebar.tsx` · `GoalsPage.tsx` · `SettingsPage.tsx` · `ClassroomRightPane.tsx` · `NoteReadingView.tsx` · `KnowledgeDetailPanel.tsx`

**Interfaces:**
- Produces: `tmp/shell-baseline.md`，含**五张表**（结构 / 7 处魔数（照抄本计划表 2，逐条现场复核 `文件:行` 是否漂移） / 顶栏宽度预算 / 门禁读数 / 首屏可达 47 文件 4 包）。**T14 的验收测量必须与它逐条对比**。
- Produces: 复跑用的探针路径（`tmp/edge-probe/nav-measure3.mjs` 已在计划期落盘；本任务只需**复跑并核对**，不需要重写）。

- [ ] **Step 1: 记录八条门禁基线（串行；一条一条跑，别并行）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full
node scripts/docs-check.mjs
node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit
cd app; npx vitest run
cd app\src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-before.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-before.txt"
```

预期（与 Global Constraints 的门禁表逐字相符）：`>600: 0 · 301–600: 123 · 登记条目 123` · `docs-check 通过` · `定义 312 / 注册 312 / 重复 0` · `tsc` exit 0 · **`125 个测试文件 / 1233 个用例`** · **`2300 passed / 0 failed / 6 ignored`** · 首屏 **92.79 kB**（`⇒ ✅ 达标：余量 107.21 kB`）· clippy exit 0。
**任一条不符 ⇒ 先停下报控制方**（说明开工点不是干净的批 2 收口态），不要继续。

- [ ] **Step 2: 抽 clippy 诊断**（集合，不比哈希）

```powershell
$d = "D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp"
node "$d\clippy-set.mjs" --selftest
node "$d\clippy-set.mjs" --in "$d\clippy-before.txt" --out "$d\clippy-before-set.txt" --min 15
```
预期：自检两行 ✅（阳性样本命中 2 条、阴性样本 0 条）；抽取 **20 条**诊断位置（若与 20 不同，**先怀疑抽取器**：跑 `--selftest`、`--min 15`，并把两个数都记进报告）。

- [ ] **Step 3: 现场复核 7 处魔数**（用 Node 读文件，**不要用 PowerShell 传中文模式**）

```powershell
cd app
node -e "const fs=require('fs');const files=['src/App.tsx','src/components/AiConversationDock.tsx','src/pages/ActionPage.tsx','src/pages/ClassroomPage.tsx','src/pages/KnowledgePage.tsx','src/pages/NotesPage.tsx','src/pages/ReviewPage.tsx','src/pages/SessionsPage.tsx','src/pages/SettingsPage.tsx','src/components/ChatSidebar.tsx','src/pages/GoalsPage.tsx','src/components/ClassroomRightPane.tsx','src/components/NoteReadingView.tsx','src/components/KnowledgeDetailPanel.tsx'];const pats=[[/height:\s*56\b/,'M1 nav-h'],[/top:\s*56\b/,'M1 dock-top'],[/100vh\s*-\s*56px/,'M1 calc100vh'],[/autoFoldBelow:\s*(\d+)/,'M2 breakpoint'],[/width:\s*240\b/,'M3 chat-sidebar'],[/width:\s*380\b/,'M4 goals'],[/maxWidth:\s*720\b/,'M5 settings'],[/maxWidth:\s*640\b/,'M6 right-pane'],[/width:\s*180\b/,'(extra) outline'],[/width:\s*34\b/,'(extra) detail-strip']];for(const f of files){const L=fs.readFileSync(f,'utf8').split(/\r?\n/);L.forEach((l,i)=>{for(const [re,tag] of pats){if(re.test(l))console.log(tag+'\t'+f+':'+(i+1)+'\t'+l.trim().slice(0,110));}}});"
```
预期：**M1 共 10 处**（`App.tsx` height + `AiConversationDock` top + 8 个页面的 `calc(100vh - 56px)`；**注意 `ReviewPage.tsx` 是 2 处**，故页面级 9 行/8 文件）· **M2 六处**（860×4、700×2……**实测 `NotesPage.tsx:90` 是 700 而不是规格说的 1024 档**）· M3/M4/M5/M6 各就位。
**把逐行原始输出贴进报告** —— 这是本批「7 处魔数」的**现场证据**（含与表 2 的任何漂移）。

- [ ] **Step 4: 复跑 CDP 宽度探针，核对表 3 的两个关键读数**

```powershell
$d = "D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp"
node "$d\edge-probe\scale-selftest.mjs"                                  # 仪器自检：固定块恒 500、哨兵恒 90、dpr 恒 1
node "$d\edge-probe\nav-measure3.mjs" --width 1024 --mode current --port 9401
node "$d\edge-probe\nav-measure3.mjs" --width 1024 --mode icon-only --port 9402
node "$d\edge-probe\nav-measure3.mjs" --width 1180 --mode current --port 9403
```
预期：`scale-selftest` 四行 `fix:500`/`glyph:50`（加 `--force-device-scale-factor=1` 的两行亦然）⇒ 仪器无自动缩放；`current@1024` 的 `nav_natural_width=**1375.74**` / `nav_natural_without_toast=**997.99**` / `slack_px_excl_toast=**26.01**` / `fits_in_viewport_incl_toast=**false**`；`icon-only@1024` 的 `nav_natural_without_toast=**750.08**`。每个输出末两行必须是 `PROBE_SELFTEST=12345` 与 `MISS_COUNT=0`。
**若 current@1024 的两个数与 1375.74 / 997.99 不符 ⇒ 说明字体栈或 `NAV_ITEMS` 变了，先报控制方再继续。**

- [ ] **Step 5: 跑真实构建，记录首屏入口 chunk 的字节底数**

```powershell
cmd /c "cd /d `"D:\Program own\aicode\work space\Entropydecrease\app`" && npm run build > `"D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\build-before.txt`" 2>&1"
node scripts/check-bundle-budget.mjs --no-build
```
预期：`exit=0`；入口 chunk **`index-*.js` 87,573 B → gzip 27,874 B = 27.87 kB**；首屏合计 **92.79 kB**。记录实际文件名（hash 会变，**字节数应与 87,573 逐字相同**；不同即 HEAD 变了）。

- [ ] **Step 6: 记首屏可达性基线**

```powershell
node scripts/bundle-eager-graph.mjs
```
预期：`首屏静态可达应用源文件：47` · `首屏拉入的 npm 包：4`（`@tauri-apps/api` / `@tauri-apps/plugin-dialog` / `react` / `react-dom`）。**这是本批的连通性尺子**：T6 收尾时它应当**仍是 47**（注册表把 9 个页面收进一个数据模块，但页面仍是 `lazy`；若涨到 ≥48 说明有人在壳层里静态拉进了页面或原语）。

- [ ] **Step 7: 写 `tmp/shell-baseline.md` 并提交**

把 Step 1–6 的原始输出逐条粘进五张表。**本任务不产生任何生产代码变更** ⇒ 提交的是**空**提交是不允许的 ⇒ **本任务不提交**（探针与基线全在 `.superpowers/` 下，已被忽略）。**在报告里写明「本任务无提交」及其理由**。

**Verification（本任务的验收，逐条给命令与期望）**

| # | 命令 | 期望 |
|---|---|---|
| V1 | 八条门禁（Step 1 的八行命令） | 逐条 exit 0 且读数与 Global Constraints 表逐字相符 |
| V2 | `node "$d\clippy-set.mjs" --selftest` | 两行 ✅（阳性 2 条 / 阴性 0 条） |
| V3 | Step 3 的 Node 扫描 | M1 **10 处** · M2 **6 处** · M3/M4/M5/M6 各 ≥1 处，逐行 `文件:行` 列出 |
| V4 | `node "$d\edge-probe\nav-measure3.mjs" --width 1024 --mode current --port 9401` | `1375.74` / `997.99` / `26.01` / `fits_incl_toast=false` + 自检两行 |
| V5 | `node scripts/bundle-eager-graph.mjs` | `47` 文件 / `4` 包 |
| V6 | `git status --porcelain` | **只剩 `?? docs/tech-debt/`**（本批不该引入任何工作树变更） |

---

### Task 2: `--nav-h` 进 token 生成器（单一真源 + 产物刷新）

> **为什么先做它**：规格 §1 决策 16 把 `--nav-h` 列进列契约那一行，§14 把「断点与窗口」的文档回写留给批 8 —— 但**变量本身必须由 token 生成器产出**，否则它就是第 8 处魔数。`tokens.css` 顶部写着「由 `scripts/gen-tokens.mjs` 生成，请勿手改。手改会被 `src/ui/tokens.drift.test.ts` 判失败」⇒ **禁止直接编辑产物**。

**Files:**
- Modify: `app/scripts/gen-tokens.mjs`（255 行；`SCALE_SOURCE` 加一行、`renderCss()` 加两行、`renderTs()` 加一行）
- Modify（**生成物，必须由脚本重跑而不是手改**）: `app/src/ui/tokens.css` · `app/src/ui/tokens.gen.ts`
- Test: `app/src/ui/tokens.drift.test.ts`（已有，**不改**——它会自动覆盖新变量）

**Interfaces:**
- Consumes: 无（本任务不依赖任何前序任务）
- Produces: CSS 变量 **`--ed-nav-h`**（值 `56px`，定义在 `:root`）；TS 侧 **`SCALE_TOKENS.navHeight: 56`**（`number`）。T3/T4/T8 消费前者（`var(--ed-nav-h)`），T8–T10 消费后者（像素算术/测试断言）。

- [ ] **Step 1: 先证明今天的产物是干净的（不然改动无法归因）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
node scripts/gen-tokens.mjs --check
```
预期：`exit=0`（无 `✗ 漂移` 行）。**若非 0 ⇒ STOP**：产物已与生成器分叉，先报控制方。

- [ ] **Step 2: 加真源（`SCALE_SOURCE`）**

在 `app/scripts/gen-tokens.mjs` 的 `SCALE_SOURCE`（现 `:80-101`）里，`iconSizes` 那一行**之后**加：

```js
  /**
   * 顶栏高度（规格 §1 决策 16「`--nav-h` 变量」）。
   *
   * Why 进 SCALE_SOURCE 而不是留在调用点：它是**壳层与 9 个页面共用的纵向基准**
   * （8 个页面的 `calc(100vh - 56px)` + `AiConversationDock` 的 `top: 56` + 顶栏自身 `height`），
   * 散落时改一次高度要同步 10 处，且没有任何门禁看得见漏改的那一处。
   * 值 56 是**实测的既有值**（v0.18.0 起 8 Tab 就是 56，见 App.tsx 顶栏样式），本批不改高度、只把它变成变量。
   * 与 §6.3「采集态 58px LIVE 仪表」**不同**：那是相变态的另一根高度，属批 6。
   */
  navHeight: 56,
```

- [ ] **Step 3: 产出 CSS 变量**

在 `renderCss()` 的「图标」块（现 `:151-152`）**之前**插入：

```js
  /* 壳层纵向基准（规格 §1 决策 16）：顶栏高度 —— 页面用 calc(100vh - var(--ed-nav-h)) 消费 */
  --ed-nav-h: ${SCALE_SOURCE.navHeight}px;

```

- [ ] **Step 4: 产出 TS 真源**

在 `renderTs()` 的 `SCALE_TOKENS`（现 `:189-201`）里，`iconSizes` 之前加一行：

```js
  navHeight: ${SCALE_SOURCE.navHeight},
```

- [ ] **Step 5: 重跑生成器并确认产物只多了该加的东西**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
node scripts/gen-tokens.mjs
node scripts/gen-tokens.mjs --check
git diff --stat -- src/ui/tokens.css src/ui/tokens.gen.ts scripts/gen-tokens.mjs
```
预期：`✓ 已生成 …` 两行；`--check` exit 0；`git diff --stat` 只有这三个文件，且 `tokens.css` / `tokens.gen.ts` 的 diff **只含 `--ed-nav-h` / `navHeight` 相关内容**。
**若 diff 里出现别的行 ⇒ 说明有人手改过产物，STOP 并报控制方。**

- [ ] **Step 6: 独立复核产物里的变量（不许只看生成器输出）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
node -e "const fs=require('fs');const css=fs.readFileSync('src/ui/tokens.css','utf8');const ts=fs.readFileSync('src/ui/tokens.gen.ts','utf8');const hits=css.split(/\r?\n/).filter(l=>l.includes('--ed-nav-h'));console.log('css hits='+hits.length);console.log(hits.join('\n'));const m=/navHeight:\s*(\d+)/.exec(ts);console.log('ts navHeight='+(m?m[1]:'MISSING'));console.log('selftest-positive(bg-canvas)='+/--ed-bg-canvas:/.test(css));console.log('selftest-negative(--ed-nav-h2)=':/--ed-nav-h2/.test(css));"
```
预期：`css hits=1` + 该行含 `--ed-nav-h: 56px;`；`ts navHeight=56`；阳性自检 `true`；阴性自检 `false`。（**这一对自检就是本批「任何 0 命中结论要点名仪器并自检」纪律的样本**。）

- [ ] **Step 7: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t2.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t2.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git diff --stat
git commit --only -m "feat(ui): add nav height design token" -- app/scripts/gen-tokens.mjs app/src/ui/tokens.css app/src/ui/tokens.gen.ts
```
> subject 字符数人工核对：`feat(ui): add nav height design token` = **37** ✅（≤50）。
> 三个文件都**已被跟踪** ⇒ 无需 `git add`。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `node scripts/gen-tokens.mjs --check` | exit 0（无漂移） |
| V2 | `grep -c -- "--ed-nav-h" app/src/ui/tokens.css` | `1`（阳性对照：`grep -c -- "--ed-bg-canvas" app/src/ui/tokens.css` = `2`，亮/暗各一） |
| V3 | `grep -n "navHeight" app/src/ui/tokens.gen.ts` | 1 行，值 `56` |
| V4 | `cd app; npx vitest run src/ui/tokens.drift.test.ts` | 全绿（该测试自动覆盖新变量，**零修改**） |
| V5 | 八门禁 | 逐条 exit 0；`vitest` **125 文件 / 1233 用例**（本任务不新增用例） |
| V6 | `node scripts/check-bundle-budget.mjs --no-build` | 首屏 **92.79 kB** 不变（一个 CSS 变量不进 JS 预算；`tokens.css` 属 CSS 栏） |

---

### Task 3: `--nav-h` 归零（10 处 `56` 全改为消费变量）

> **本批「7 处魔数归零」的第 1 处**。**改之前先读 Global Constraints 的「删/改一行也必须先量冻结名单」**：`app/src/ui/zIndex.guard.test.ts:57` **逐字**钉着 `AiConversationDock.tsx` 的那一行，改完不改名单会当场变红。

**Files:**
- Modify: `app/src/App.tsx`（`:288` `height: 56`）
- Modify: `app/src/components/AiConversationDock.tsx`（`:242` `top: 56`）
- Modify: `app/src/pages/ActionPage.tsx:37` · `ClassroomPage.tsx:206` · `KnowledgePage.tsx:239` · `NotesPage.tsx:191` · `ReviewPage.tsx:117,140` · `SessionsPage.tsx:278` · `SettingsPage.tsx:58`
- Modify: `app/src/ui/zIndex.guard.test.ts`（`:57` 的冻结名单项改为新行原文）
- Modify: `docs/standards/line-limit-exemptions.md`（`AiConversationDock.tsx` 行数由 `--write` 刷新）
- Test: `app/src/shell/navHeight.consumption.test.ts`（**新建**，≤120 行）

**Interfaces:**
- Consumes: `--ed-nav-h`（T2）· `SCALE_TOKENS.navHeight`（T2）
- Produces: **零 `56px` 硬编码**的壳层（除 token 定义处与不相干的 CSS 值）。后续所有任务看到的高度基准都是变量。

- [ ] **Step 1: 写失败测试（先钉住「不许再有第二处 56」）**

新建 `app/src/shell/navHeight.consumption.test.ts`：

```ts
/**
 * @ai-context 壳层纵向基准的**棘轮守卫**（规格 §1 决策 16 / §10 批 3 行「7 处魔数归零」第 1 处）。
 *
 * Why 用测试而不是脚本：本仓 `scripts/*.mjs` 不在 `line-limits` 扫描域（批 2 follow-up #16），
 *   而 `app/src/**` 在 ⇒ 把守卫放进扫描域内，它自己也被 300 行红线看着。
 *
 * Why 只扫壳层相关文件而不是全树：全树 `height: 56` 还有无关命中（如 `ReviewPage.tsx:204` 的
 *   `padding: "56px 0"`）。本守卫的**扫描域是一份显式清单**（下方 SHELL_FILES），
 *   这样「漏了一个文件」是**清单的错**、不是正则的错 —— 口径可读、可评审。
 *
 * 口径：命中 = `height: 56` / `top: 56` / `100vh - 56px`（数字两边允许空白）。
 *   `var(--ed-nav-h)` 与 `calc(100vh - var(--ed-nav-h))` **不匹配**、不被误伤。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");

/** 壳层纵向基准**必须**经由变量的文件（相对 `app/src`，正斜杠） */
const SHELL_FILES = [
  "App.tsx",
  "components/AiConversationDock.tsx",
  "pages/ActionPage.tsx",
  "pages/ClassroomPage.tsx",
  "pages/KnowledgePage.tsx",
  "pages/NotesPage.tsx",
  "pages/ReviewPage.tsx",
  "pages/SessionsPage.tsx",
  "pages/SettingsPage.tsx",
] as const;

/** 三种消费形态的**旧写法**（命中即违规） */
const FORBIDDEN = [/height:\s*56\b/, /top:\s*56\b/, /100vh\s*-\s*56px/];
/** 新写法的正样本（守卫必须能认出来） */
const REQUIRED = /--ed-nav-h/;

function lines(rel: string): [number, string][] {
  return readFileSync(join(SRC, rel), "utf8")
    .split(/\r?\n/)
    .map((l, i) => [i + 1, l] as [number, string]);
}

describe("壳层纵向基准 --ed-nav-h", () => {
  it("壳层文件里不得再出现裸 56（height / top / calc）", () => {
    const hits: string[] = [];
    for (const rel of SHELL_FILES) {
      for (const [n, l] of lines(rel)) if (FORBIDDEN.some((re) => re.test(l))) hits.push(`${rel}:${n}  ${l.trim()}`);
    }
    expect(hits, `这些行仍硬编码 56（请改用 var(--ed-nav-h)）：\n${hits.join("\n")}`).toEqual([]);
  });

  it("每个壳层文件都**确实**消费了变量（防止用删代码的方式让上一条变绿）", () => {
    const missing = SHELL_FILES.filter((rel) => !lines(rel).some(([, l]) => REQUIRED.test(l)));
    expect(missing, `这些文件没有消费 --ed-nav-h（删掉旧写法不等于接上了变量）：\n${missing.join("\n")}`).toEqual([]);
  });

  it("扫描域自检：清单里的文件都真的存在且非空", () => {
    const empty = SHELL_FILES.filter((rel) => lines(rel).length < 10);
    expect(empty, `清单里的文件读不到或过短（路径写错了？）：\n${empty.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认它失败（且失败信息点名到行）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/shell/navHeight.consumption.test.ts
```
预期：**FAIL**，第 1 个 `it` 列出 **10 行**（`App.tsx:288` · `AiConversationDock.tsx:242` · 8 个页面共 9 行），第 2 个 `it` 列出全部 9 个文件。

- [ ] **Step 3: 逐处改（一次只改一处，每处改完心里核对形态）**

① `app/src/App.tsx:288`：`height: 56,` → `height: "var(--ed-nav-h)",`
② `app/src/components/AiConversationDock.tsx:242`：`position: "fixed", top: 56, right: 0, …` → `position: "fixed", top: "var(--ed-nav-h)", right: 0, …`
③ 八个页面共 9 处：`height: "calc(100vh - 56px)"` → `height: "calc(100vh - var(--ed-nav-h))"`（`ReviewPage.tsx` 有 **2 处**：`:117` 与 `:140`）

> ⚠️ **不许顺手改这些行的其它部分**（间距、颜色、注释、JSX 结构一律逐字保留）。本批是**常数替换**批，不是重构批。

- [ ] **Step 4: 修 zIndex 冻结名单（这是「连通面」而不是「顺手」）**

把 `app/src/ui/zIndex.guard.test.ts:57` 的名单项**逐字**改为改后的新行原文：

```ts
  "components/AiConversationDock.tsx::position: \"fixed\", top: \"var(--ed-nav-h)\", right: 0, bottom: 0, width: PANEL_W, zIndex: 900,",
```

> 为什么必须改：该守卫第 2 个 `it`（`:166-170`）要求名单里的每一项**必须仍在现网命中**；漏改会红。第 1 个 `it` 同时会因新行原文不在名单里而红。**两步一起做才绿。**
> 名单**长度不变**（这一条是替换不是新增），`expect(...).toBeLessThanOrEqual(FROZEN_NUMERIC_ZINDEX.length)`（`:161`）仍然成立。
> **绝不**用「删掉名单项」来变绿 —— 那会把棘轮关掉（第 3 个 `it` 会红）。

- [ ] **Step 5: 跑测试确认全绿 + 刷新豁免表数值**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/shell/navHeight.consumption.test.ts src/ui/zIndex.guard.test.ts src/ui/zIndex.test.ts
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full
```
预期：三个测试文件全绿（新增 3 用例）。`line-limits --full` 若报 `(e) 行数不一致`（`AiConversationDock.tsx` / `App.tsx` 因替换而变化），**先跑 `node scripts/line-limits.mjs --write`**（**只调已有行的数字，绝不新增条目**），再复跑 `--full`。

- [ ] **Step 6: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t3.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build; node scripts/bundle-eager-graph.mjs
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t3.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git status --porcelain
git add -- app/src/shell/navHeight.consumption.test.ts
git commit --only -m "refactor(shell): consume nav height token" -- app/src/App.tsx app/src/components/AiConversationDock.tsx app/src/pages/ActionPage.tsx app/src/pages/ClassroomPage.tsx app/src/pages/KnowledgePage.tsx app/src/pages/NotesPage.tsx app/src/pages/ReviewPage.tsx app/src/pages/SessionsPage.tsx app/src/pages/SettingsPage.tsx app/src/ui/zIndex.guard.test.ts app/src/shell/navHeight.consumption.test.ts docs/standards/line-limit-exemptions.md
```
> subject `refactor(shell): consume nav height token` = **40** ✅。
> **新建文件必须先 `git add --`**（上面第 1 行），否则 `--only` 报 `pathspec … did not match`。
> `docs/standards/line-limit-exemptions.md` **只有在 `--write` 真的改了数字时才写进路径清单**（`git status` 看它是否 modified）。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/navHeight.consumption.test.ts` | 3 用例全绿 |
| V2 | `cd app; npx vitest run src/ui/zIndex.guard.test.ts` | 4 用例全绿（名单仍 58 条、无过期项、无重复） |
| V3 | `node -e "const fs=require('fs');const d='app/src';const f=['App.tsx','components/AiConversationDock.tsx','pages/ActionPage.tsx','pages/ClassroomPage.tsx','pages/KnowledgePage.tsx','pages/NotesPage.tsx','pages/ReviewPage.tsx','pages/SessionsPage.tsx','pages/SettingsPage.tsx'];let n=0,v=0;for(const x of f){const L=fs.readFileSync(d+'/'+x,'utf8').split(/\r?\n/);for(const l of L){if(/height:\s*56\b|top:\s*56\b\|100vh\s*-\s*56px/.test(l))n++;if(l.includes('--ed-nav-h'))v++;}}console.log('bare56='+n,'varHits='+v);"` | `bare56=0` · `varHits=10` |
| V4 | 八门禁 | 逐条 exit 0；`vitest` **125 文件 / 1236 用例**（+3，本任务新增）；`cargo` 逐字持平 |
| V5 | `node scripts/check-bundle-budget.mjs --no-build` | 首屏 **≤ 92.79 kB**（本任务只把数字换成 `var()`，字节应基本不动；**若涨 >5 kB 说明误 import 了东西，STOP 排查**） |
| V6 | `node scripts/bundle-eager-graph.mjs` | 仍 **47 文件 / 4 包**（测试文件不进生产图，`--ed-nav-h` 只是字符串） |

---

### Task 4: 窗口尺寸（默认 1280×800 / 最小 1024×640）+ 全局 reset + 6px 滚动条

> **本批「7 处魔数归零」的第 7 处（M7）**，同时兑现规格 §1 决策 17 的三件事：窗口默认/最小值、`html,body,#root` reset、滚动条 6px。审计 J1-1（960×720 无 min 尺寸）与 J1-2（无 reset、UA 8px margin、6px 滚动条规格空转）都在这一条里结清。

**Files:**
- Modify: `app/src-tauri/tauri.conf.json`（40 行，`app.windows[0]`）
- Modify: `app/index.html`（14 行：`lang` / `title` / 一行 reset）
- Create: `app/src/shell/windowSize.ts`（≤40 行：三个数字的**单一真源**，供测试与文档引用）
- Create: `app/src/shell/windowSize.test.ts`（≤120 行）
- Read（只读）: `app/src-tauri/src/commands_window.rs:112-117`（浮窗 360×240 · `resizable(false)`，**本批不动**）

**Interfaces:**
- Consumes: 无
- Produces: `WINDOW_SIZE = { defaultWidth: 1280, defaultHeight: 800, minWidth: 1024, minHeight: 640 }`（`as const`）+ `NAV_MIN_WIDTH = 1024`；`--ed-nav-h`（T2）无关。T5 的断点下限、T14 的验收都引用 `minWidth`。

- [ ] **Step 1: 写失败测试（配置与代码不许分叉）**

新建 `app/src/shell/windowSize.ts`：

```ts
/**
 * @ai-context 主窗尺寸的**单一真源**（规格 §1 决策 17：默认 1280×800，最小 1024×640）。
 *
 * Why 要有这个 TS 常量：真值在 `app/src-tauri/tauri.conf.json`（JSON，TS 读不到也不该读），
 *   而前端有三处需要同一组数字 —— ① 断点下限（T5 的 1024 档）② 验收测试（T14 量「1024 无溢出」）
 *   ③ 守卫测试（读 JSON 逐字比对，防止有人只改一边）。
 *   没有它，「1024」会在前端再散落成第 8 处魔数 —— 正是本批要消灭的东西。
 *
 * 副作用：无。边界：只描述**主窗**；采集浮窗由 Rust 侧建（360×240，resizable=false），不在本文件表达。
 */
export const WINDOW_SIZE = {
  defaultWidth: 1280,
  defaultHeight: 800,
  minWidth: 1024,
  minHeight: 640,
} as const;

/** 顶栏溢出策略的下限（= 最小窗宽）；规格 §6.1「<1024 由最小窗兜底」 */
export const NAV_MIN_WIDTH = WINDOW_SIZE.minWidth;
```

新建 `app/src/shell/windowSize.test.ts`：

```ts
/**
 * @ai-context 主窗尺寸守卫：`tauri.conf.json` 与 `windowSize.ts` 必须逐字一致。
 *
 * Why 读 JSON 而不是信任常量：真值在 JSON 里，常量是**影子**。只有把两者钉在一起，
 *   「改了 JSON 忘了常量」才是红的（反之亦然）。规格 §1 决策 17 的两个数字是本测试的断言对象。
 *
 * 口径：只断言四个数字与存在性；**不**断言 JSON 里的其它字段（批 4/8 会动它们）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NAV_MIN_WIDTH, WINDOW_SIZE } from "./windowSize";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONF = join(APP, "src-tauri", "tauri.conf.json");

describe("主窗尺寸（规格 §1 决策 17）", () => {
  const conf = JSON.parse(readFileSync(CONF, "utf8"));
  const win = conf.app.windows[0];

  it("默认 1280×800", () => {
    expect(win.width).toBe(WINDOW_SIZE.defaultWidth);
    expect(win.height).toBe(WINDOW_SIZE.defaultHeight);
  });

  it("最小 1024×640（J1-1：今天完全没有 min 尺寸）", () => {
    expect(win.minWidth).toBe(WINDOW_SIZE.minWidth);
    expect(win.minHeight).toBe(WINDOW_SIZE.minHeight);
  });

  it("窗口可缩放（否则 min 尺寸无意义）", () => {
    expect(win.resizable ?? true).toBe(true);
  });

  it("断点下限 = 最小窗宽（防止两处各写一个 1024）", () => {
    expect(NAV_MIN_WIDTH).toBe(1024);
    expect(NAV_MIN_WIDTH).toBe(win.minWidth);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/shell/windowSize.test.ts
```
预期：**FAIL** —— `expected 960 to be 1280`、`expected undefined to be 1024`。

- [ ] **Step 3: 改 `tauri.conf.json`**

```json
      {
        "title": "熵减 · 本地知识提取",
        "width": 1280,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 640,
        "resizable": true
      }
```

> ⚠️ `app/src-tauri/tauri.conf.json` 是 **AGENTS.md §10 的「变更需额外审查」文件**（应用配置/权限边界）⇒ 本步的提交必须**只改这四个数字 + 一个 `resizable`**，`security` / `bundle` 段**逐字节不动**（`git diff` 人工复核 + 报告里贴 diff 全文）。
> ⚠️ 本批**不动 Rust**：`commands_window.rs` 的浮窗 `inner_size(360,240)` + `resizable(false)` **保持原样**（它不属于「主窗尺寸」这条验收）。

- [ ] **Step 4: 改 `index.html`（reset 的落点）**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>熵减 · 本地知识提取</title>
    <!-- J1-2：body 的 UA 8px margin + 无高度基准 ⇒ 整窗常驻纵向滚动条/底缘白条。
         reset 放 index.html 而不是 tokens.css：tokens.css 是生成物（改它会被 drift 测试判失败），
         而 reset 是**文档结构**约定，不是设计 token。 -->
    <style>
      html, body, #root { margin: 0; height: 100%; }
      /* 规格 §1 决策 17：细滚动条 6px（审计 J1-2「6px 细滚动条规格全站未实现」） */
      * { scrollbar-width: thin; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-thumb { background: #c9c4b8; border-radius: 3px; }
      ::-webkit-scrollbar-track { background: transparent; }
    </style>
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

> ⚠️ **色值纪律**：`#c9c4b8` 是 `--ed-border-strong` 的亮档值。**内联 `<style>` 里的 6 个 hex 会不会触犯 token 守卫？** 本步写完必须跑 `cd app; npx vitest run src/ui` —— 若 `contrast.test.ts` / `tokens.drift.test.ts` 变红，**改为 `var(--ed-border-strong, #c9c4b8)`**（`index.html` 的 `<style>` 在 `tokens.css` 之后加载？**不** —— `tokens.css` 由 `main.tsx` import，注入顺序晚于 `<style>`，故**必须带字面量兜底**，与 `Icon.tsx:19` 同一做法）。
> ⚠️ `app/index.html` **不在** `line-limits` 扫描域（非 `.ts/.tsx/.rs`）⇒ 它的行数无门禁，仍需保持精简（本步后 **约 26 行**）。

- [ ] **Step 5: 跑测试 + 全量门禁**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/shell/windowSize.test.ts
npx vitest run src/ui
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t4.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t4.txt"
```
预期：`windowSize.test.ts` **4 用例全绿**；八门禁 exit 0；`cargo` 两条**逐字持平**（**只改了 JSON 的一个字段，Rust 代码零字节变化** —— 若 `cargo test` 数字变了，说明改错了面，STOP）。

- [ ] **Step 6: 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
git diff --stat -- app/src-tauri/tauri.conf.json          # 只应有 1 file changed, 4 insertions(+), 2 deletions(-)
git add -- app/src/shell/windowSize.ts app/src/shell/windowSize.test.ts
git commit --only -m "feat(shell): set window size and reset html" -- app/src-tauri/tauri.conf.json app/index.html app/src/shell/windowSize.ts app/src/shell/windowSize.test.ts
```
> subject `feat(shell): set window size and reset html` = **42** ✅。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/windowSize.test.ts` | 4 用例全绿 |
| V2 | `git diff HEAD~1 -- app/src-tauri/tauri.conf.json` | 只含 `width/height/minWidth/minHeight/resizable` 五个键 |
| V3 | `node -e "const s=require('fs').readFileSync('app/index.html','utf8');console.log(/lang=\"zh-CN\"/.test(s), /html, body, #root \{ margin: 0; height: 100%; \}/.test(s), /::-webkit-scrollbar \{ width: 6px/.test(s));"` | `true true true` |
| V4 | 八门禁 | 逐条 exit 0；`cargo` **2300/0/6** 逐字持平（本任务不碰 Rust） |
| V5 | 真实构建 + `node scripts/check-bundle-budget.mjs --no-build` | 首屏 gzip 与 T1 基线**逐字节相同**（`index.html` 的 `<style>` 计入 CSS 栏，不进 JS 判据）；**`index.html` 会从 654 B 变大**，在报告里记下新值 |
| V6 | `git status --porcelain` | 只含本任务的 4 个路径 |

---

### Task 5: 断点单一真源 `shell/breakpoints.ts` + 6 处阈值改判

> **本批「7 处魔数归零」的第 2 处（M2）**。规格 §1 决策 16 定「断点 1024/1100/1180」，§6.2 的**阈值口径**给了推导规则（「按折叠后正文是否仍 ≥520px 反推 —— 三列页 1024 · 两列页 1100 · 大纲列 1280」）。今日 6 处 `autoFoldBelow` 是 860×4 / 700×1 / 1100×1。

**Files:**
- Create: `app/src/shell/breakpoints.ts`（≤60 行）
- Create: `app/src/shell/breakpoints.test.ts`（≤140 行）
- Modify: `app/src/pages/ClassroomPage.tsx:53` · `SessionsPage.tsx:48` · `NotesPage.tsx:89,90,91` · `KnowledgePage.tsx:60`

**Interfaces:**
- Consumes: `NAV_MIN_WIDTH`（T4）
- Produces: `BREAKPOINTS = { nav: 1024, navFull: 1180, twoCol: 1100, threeCol: 1024, outlineCol: 1280 }`（`as const`）；`breakpointFor(kind: "twoCol" | "threeCol" | "outlineCol"): number`。T8 的 `columnRegistry` 引用它填 `autoFoldBelow`；T7 的顶栏用 `nav` / `navFull`。

- [ ] **Step 1: 写 `shell/breakpoints.ts`**

```ts
/**
 * @ai-context 全站断点的**单一真源**（规格 §1 决策 16「断点 1024/1100/1180」+ §6.2 阈值口径）。
 *
 * Why 收成一处：今日同一个「窄窗自动折叠」概念在 6 个调用点写成了 3 个不同的数
 *   （860 出现 4 次、700 一次、1100 一次），且**没有一处能从数字反推出理由**。
 *   规格 §6.2 给了推导规则：「按折叠后正文是否仍 ≥520px 反推」——
 *   三列页 1024 · 两列页 1100 · 大纲列 1280。本模块把规则与数字放在一起。
 *
 * 口径：这些值是 `window.innerWidth` 的**下限**（视口宽 ≥ 该值时不折叠）；
 *   比较一律用严格小于（见 useColumnLayout: `window.innerWidth < autoFoldBelow` ⇒ 折叠）。
 *   ⇒ 写下 1100 的含义是「1099 折叠、1100 不折叠」。
 *
 * 副作用：无（纯数据）。
 * 边界：本模块**不**含 1180 之外的导航档位算术；顶栏的档位判定在 T7 的 TopBar 里，
 *   但它必须引用本模块的 `nav` / `navFull`，不得另写数字。
 */
export const BREAKPOINTS = {
  /** 导航下限 = 最小窗宽（规格 §6.1「<1024 由最小窗兜底」） */
  nav: 1024,
  /** 导航满档：≥1180 图标+文字，1024–1180 仅图标（规格 §6.1 溢出两级） */
  navFull: 1180,
  /** 两列页的自动折叠阈值（课堂源列 / 会话列表 / 体系左列 / 目标左列 / AI 侧栏） */
  twoCol: 1100,
  /** 三列页的自动折叠阈值（笔记组列 + 列表列） */
  threeCol: 1024,
  /** 大纲列（笔记第三列）：最晚折叠（规格 §6.2「大纲列 1280」） */
  outlineCol: 1280,
} as const;

export type BreakpointKind = keyof typeof BREAKPOINTS;

/** 取阈值的唯一入口（写 `BREAKPOINTS.twoCol` 也可，但走函数便于将来加权/改写） */
export function breakpointFor(kind: BreakpointKind): number {
  return BREAKPOINTS[kind];
}
```

- [ ] **Step 2: 写 `shell/breakpoints.test.ts`（钉住规格给的三个数字与相对序）**

```ts
/**
 * @ai-context 断点契约守卫（规格 §6.2 阈值口径）。
 *
 * Why 断言**相对序**而不是只断言三个常数：规格的推导规则是「三列页 < 两列页 < 大纲列」
 *   （列越多越早折叠）。只钉数字的话，将来有人把 `outlineCol` 改小会静默破坏规则。
 *
 * 口径：`nav === NAV_MIN_WIDTH`（导航下限必须等于最小窗宽，否则 1024 档无意义）。
 */
import { describe, expect, it } from "vitest";
import { BREAKPOINTS, breakpointFor } from "./breakpoints";
import { NAV_MIN_WIDTH } from "./windowSize";

describe("断点（规格 §1 决策 16 / §6.2 阈值口径）", () => {
  it("三个规格数字逐字就位", () => {
    expect(BREAKPOINTS.nav).toBe(1024);
    expect(BREAKPOINTS.twoCol).toBe(1100);
    expect(BREAKPOINTS.navFull).toBe(1180);
  });

  it("相对序：三列页最早折叠 < 两列页 < 大纲列最晚折叠", () => {
    expect(BREAKPOINTS.threeCol).toBeLessThan(BREAKPOINTS.twoCol);
    expect(BREAKPOINTS.twoCol).toBeLessThan(BREAKPOINTS.outlineCol);
  });

  it("导航下限 = 最小窗宽（两处不许各写一个 1024）", () => {
    expect(BREAKPOINTS.nav).toBe(NAV_MIN_WIDTH);
  });

  it("breakpointFor 对所有键都返回正数（防漏键导致 undefined 静默成 NaN 比较）", () => {
    for (const k of Object.keys(BREAKPOINTS) as (keyof typeof BREAKPOINTS)[]) {
      expect(breakpointFor(k), k).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: 跑测试确认绿（本步是新增真源，测试应当直接绿）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/shell/breakpoints.test.ts
```
预期：4 用例全绿。**若红** ⇒ 抄错数字，先改对再往下。

- [ ] **Step 4: 6 处调用点改判（**一次一处**，改完立刻量）**

| 文件:行 | 今日 | 改为 | 依据 |
|---|---|---|---|
| `pages/ClassroomPage.tsx:53` | `autoFoldBelow: 860` | `autoFoldBelow: breakpointFor("twoCol")`（1100） | §6.2「课堂 源列 … 阈值 860→1100」 |
| `pages/SessionsPage.tsx:48` | `autoFoldBelow: 860` | `breakpointFor("twoCol")`（1100） | §6.2「会话 列表列 … 1100」 |
| `pages/NotesPage.tsx:89` | `autoFoldBelow: 860` | `breakpointFor("threeCol")`（1024） | §6.2「笔记 组列 … 1024」 |
| `pages/NotesPage.tsx:90` | `autoFoldBelow: 700` | `breakpointFor("threeCol")`（1024） | §6.2「笔记 列表列 … 1024」（**700 是今日第三个不同的数**） |
| `pages/NotesPage.tsx:91` | `autoFoldBelow: 1100` | `breakpointFor("outlineCol")`（1280） | §6.2「笔记 大纲列 … 1280」 |
| `pages/KnowledgePage.tsx:60` | `autoFoldBelow: 860` | `breakpointFor("twoCol")`（1100） | §6.2「体系 体系列 … 阈值 860→1100」 |

> ⚠️ **`KnowledgePage.tsx:61`（详情列）保持无 `autoFoldBelow`** —— §6.2 写「不折叠」，逐字保留。
> ⚠️ **只改 `autoFoldBelow` 的实参**，`default`/`min`/`max` 三个数**本任务不动**（那是 T8 的活）。
> ⚠️ 每个文件加 `import { breakpointFor } from "../shell/breakpoints";`。
> ⚠️ `useColumnLayout.test.ts` 里也有一堆 `autoFoldBelow: 900`，那是**测试自己的夹具**（不是调用点），**不动**。

- [ ] **Step 5: 量「断点改判」的可见后果（诚实记录）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/hooks/useColumnLayout.test.ts
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/bundle-eager-graph.mjs
```
预期：`useColumnLayout.test.ts` 全绿（它与阈值实参无关，用的是自己的夹具）；首屏可达仍 **47 文件 / 4 包**。
**在报告里写清观感变化**：默认窗从 960 改成 **1280** 之后，`notes-outline` 的阈值从 1100 抬到 1280 ⇒ **在 1280 宽的默认窗里大纲列处于「恰好在阈值上（1280 ≥ 1280 ⇒ 不折叠）」**。这是规格要的「大纲列最晚折叠」，但它是**一个边界值**；若控制方希望默认窗内更稳，可把 `outlineCol` 定 1260 —— **登记为待观察项，不自行改**（规格写的就是 1280）。

- [ ] **Step 6: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t5.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t5.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git add -- app/src/shell/breakpoints.ts app/src/shell/breakpoints.test.ts
git commit --only -m "feat(shell): add single source of breakpoints" -- app/src/shell/breakpoints.ts app/src/shell/breakpoints.test.ts app/src/pages/ClassroomPage.tsx app/src/pages/SessionsPage.tsx app/src/pages/NotesPage.tsx app/src/pages/KnowledgePage.tsx
```
> subject `feat(shell): add single source of breakpoints` = **46** ✅。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/breakpoints.test.ts` | 4 用例全绿 |
| V2 | `node -e "const fs=require('fs');const f=['ClassroomPage','SessionsPage','NotesPage','KnowledgePage'].map(x=>'app/src/pages/'+x+'.tsx');let n=0;for(const p of f){const L=fs.readFileSync(p,'utf8').split(/\r?\n/);L.forEach((l,i)=>{if(/autoFoldBelow:\s*\d/.test(l)){n++;console.log(p+':'+(i+1)+'  '+l.trim());}});}console.log('bare-thresholds='+n);"` | `bare-thresholds=0` |
| V3 | `node -e "const fs=require('fs');const s=['ClassroomPage','SessionsPage','NotesPage','KnowledgePage'].map(x=>fs.readFileSync('app/src/pages/'+x+'.tsx','utf8')).join('');console.log((s.match(/breakpointFor\(/g)||[]).length);"` | `6`（6 处改判） |
| V4 | 八门禁 | 逐条 exit 0；`vitest` **127 文件**（+2 新测试文件）/ 用例数 +4 |
| V5 | `node scripts/bundle-eager-graph.mjs` | 仍 **47 文件 / 4 包** |
| V6 | `git status --porcelain` | 只含本任务 6 个路径 |

---

### Task 6: 导航注册表 `shell/navRegistry.ts` + 9 页接线 + 可达性探针

> **「9 页全走注册表」验收的主体**。今天 9 个页面是**双重硬编码**：`App.tsx:23-42` 的 import + `:385-492` 的 9 段 `<PageSlot>` JSX + `:72-87` 的 `NAV_ITEMS` + `:70` 的 `type Page`。本任务建一个**单一真源**并把 `type Page` 从它派生。**本任务不改顶栏外观**（那是 T7）。

**Files:**
- Create: `app/src/shell/navRegistry.ts`（≤120 行）
- Create: `app/src/shell/navRegistry.test.ts`（≤180 行）
- Modify: `app/src/App.tsx`（`type Page` 派生 + `NAV_ITEMS` 改为从注册表读；**slot JSX 与外观本任务不动**）

**Interfaces:**
- Consumes: 9 个页面模块的**默认导出**（`React.LazyExoticComponent` 或函数组件）· `ui/icons` 的 `IconName`
- Produces:
  - `export type PageKey = "classroom" | "sessions" | "notes" | "action" | "review" | "chat" | "knowledge" | "goals" | "settings"`
  - `export interface NavEntry { key: PageKey; label: string; icon: IconName; Component: ComponentType<any>; }`
  - `export const NAV_ENTRIES: readonly NavEntry[]`（**9 项**，顺序 = 今日 `NAV_ITEMS` 的顺序）
  - `export const PRIMARY_KEYS: readonly PageKey[]`（**8 项** = 9 项去掉 `settings`，规格 §6.1「设置下沉右上齿轮」）
  - `export function navEntry(key: PageKey): NavEntry`
  - `export function isPageKey(v: string): v is PageKey`
  - CLI：`node scripts/bundle-eager-graph.mjs` 不变（**不新增脚本**，见 Global Constraints）

> ⚠️ **`PageSlot` 的 9 段 JSX 本任务不动**（它们带 20+ 个 props，改它们属 T7/T11 的接线活；本任务只让**注册表成为 key/label/icon/组件**的真源）。**T14 的注册表探针只断言「每个 key 都能解析到一个已注册的组件 + 顶栏/页面槽的 key 集合 = 注册表键集」**，不要求 JSX 由注册表生成。

- [ ] **Step 1: 写 `shell/navRegistry.ts`**

```ts
/**
 * @ai-context 导航注册表 —— 9 个页面的**单一真源**（规格 §10 批 3 行「9 页全走注册表」）。
 *
 * Why：今天同一个事实（有哪 9 个页面）在 App.tsx 里写了**四遍** ——
 *   `:70` 的 `type Page` 字面量联合、`:29-42` 的 10 个 import、`:72-87` 的 `NAV_ITEMS`、
 *   `:385-492` 的 9 段 `<PageSlot>` JSX。加一页要改四处，漏一处是**静默**的
 *   （类型不报错、列表不报错、只有点进去才白屏）。本模块把「有哪些页面」收成一处，
 *   其余三处从它派生：`PageKey` 由键集派生、`NAV_ITEMS` 由它 map 出来、`isPageKey` 供 ⌘K/深链校验。
 *
 * 溢出策略（规格 §6.1）与列契约（§6.2）都以**本注册表的键集**为全集 —— 不许各自另立清单。
 *
 * 副作用：模块加载时构建一次数组（无 I/O、无 window 访问）。
 * 边界：本模块**只描述页面**，不描述列（列在 columnRegistry）、不描述视图（视图在批 5）。
 *   图标名必须来自 `ui/icons`（自绘图标集，批 0-B）；**不得内联 `<svg`**
 *   （`ui/icons/no-inline-svg.test.ts` 在看着）。
 */
import { lazy, type ComponentType } from "react";
import type { IconName } from "../ui/icons";
// 课堂页（默认页）保持静态 import：它是首屏必渲染页（批 2 控制方裁决 2 末条）
import ClassroomPage from "../pages/ClassroomPage";
const NotesPage = lazy(() => import("../pages/NotesPage"));
const SessionsPage = lazy(() => import("../pages/SessionsPage"));
const ActionPage = lazy(() => import("../pages/ActionPage"));
const ReviewPage = lazy(() => import("../pages/ReviewPage"));
const ChatPage = lazy(() => import("../pages/ChatPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const GoalsPage = lazy(() => import("../pages/GoalsPage"));

export interface NavEntry {
  readonly key: PageKey;
  /** 顶栏文字（规格 §6.1 的 8 项命名；设置项的 label 只在设置页标题里用） */
  readonly label: string;
  /** `ui/icons` 的键 —— `paths.domain.ts` 的 9 个域图标与 9 个 key 一一对应 */
  readonly icon: IconName;
  readonly Component: ComponentType<Record<string, never>> | React.LazyExoticComponent<ComponentType<Record<string, never>>>;
}

/** 注册表本体：**顺序 = 顶栏顺序**（规格 §6.1：📡课堂 · 🗂会话 · 📝笔记 · ✅行动 · 🔄复习 · 🧠体系 · 🎯目标 · 💬AI 对话） */
export const NAV_ENTRIES = [
  { key: "classroom", label: "课堂", icon: "classroom", Component: ClassroomPage },
  { key: "sessions", label: "会话", icon: "sessions", Component: SessionsPage },
  { key: "notes", label: "笔记", icon: "notes", Component: NotesPage },
  { key: "action", label: "行动", icon: "action", Component: ActionPage },
  { key: "review", label: "复习", icon: "review", Component: ReviewPage },
  { key: "knowledge", label: "体系", icon: "knowledge", Component: KnowledgePage },
  { key: "goals", label: "目标", icon: "goals", Component: GoalsPage },
  { key: "chat", label: "AI 对话", icon: "ai", Component: ChatPage },
] as const satisfies readonly NavEntry[];

/** 非顶栏项（规格 §6.1「设置下沉右上齿轮」）：仍在注册表内，故仍受「9 页全走注册表」覆盖 */
export const SETTINGS_ENTRY = { key: "settings", label: "设置", icon: "settings", Component: SettingsPage } as const satisfies NavEntry;

export type PageKey = (typeof NAV_ENTRIES)[number]["key"] | typeof SETTINGS_ENTRY["key"];

/** 全部 9 页（顶栏 8 项 + 设置），顺序稳定 —— 探针与守卫按它枚举 */
export const ALL_ENTRIES: readonly NavEntry[] = [...NAV_ENTRIES, SETTINGS_ENTRY];

export function navEntry(key: PageKey): NavEntry {
  const hit = ALL_ENTRIES.find((e) => e.key === key);
  if (!hit) throw new Error(`未注册的页面键：${key}`);
  return hit;
}

/** 运行期校验入口（⌘K 的命令参数、深链都可能带任意字符串） */
export function isPageKey(v: string): v is PageKey {
  return ALL_ENTRIES.some((e) => e.key === v);
}
```

> ⚠️ **`ComponentType<Record<string, never>>` 会在 tsc 处报错**（9 个页面的 props 各不相同，如 `ClassroomPage({ onOpenSessions })`）。**这是刻意的**：本步先让类型把问题顶出来，下一步用**最小的**类型放宽解决 —— 不许用 `any`（AGENTS.md §3.2）。
> **正解（下一步照做）**：`Component: ComponentType<any>` 也不许 ⇒ 用 `unknown` 收口：
> ```ts
> readonly Component: ComponentType<never> | LazyExoticComponent<ComponentType<never>>;
> ```
> 并在 `:385-492` 的 JSX 里由**调用点**保证 props（那里本来就有具体 props，类型由页面自己的签名约束）。**若 `ComponentType<never>` 也不成立 ⇒ STOP 并报控制方**（可能需要在批 5 引入 `ViewSpec` 式的泛型注册表；本批不自行发明）。

- [ ] **Step 2: 接线 `App.tsx`（只改三处，外观零变化）**

① 删掉 `:29-42` 的 8 个 `lazy(...)` 与 `:23` 的静态 import（它们搬进注册表），改为：

```ts
import { ALL_ENTRIES, NAV_ENTRIES, isPageKey, navEntry, type PageKey } from "./shell/navRegistry";
```

② `:70` 的 `type Page = "classroom" | … | "settings";` 改为：

```ts
type Page = PageKey;
```

③ `:72-87` 的 `NAV_ITEMS` 改为从注册表派生（**保留原 label 形态直到 T7**，避免本任务改变观感）：

```ts
// 批 3 T6：导航项改由注册表派生（单一真源）。本步**只把数据源换掉**，label 形态与 T7 一致前保持
// 「emoji + 文字」的**视觉等价**由 T7 负责 —— 本步的输出必须与输入逐屏相同。
const NAV_ITEMS: { key: Page; label: string }[] = ALL_ENTRIES.map((e) => ({ key: e.key, label: e.label }));
```

> ⚠️ **这一步会让顶栏的 label 立刻变成注册表的纯文字**（`课堂` 而不是 `📡 课堂助手`）—— **那是观感变化，T6 不允许有**。⇒ **正确做法**：注册表里 `label` 存**顶栏用的短名**（`课堂`），另存 `legacyLabel` 供 T6 过渡：
> ```ts
> readonly legacyLabel: string;  // T6 过渡期用（emoji + 长名，逐字抄自旧 NAV_ITEMS）
> ```
> 并在 `App.tsx` 里 `label: e.legacyLabel`。**T7 切到 `e.label` 时同一次提交删掉 `legacyLabel` 这一列**（T7 Step 里会写清）。

- [ ] **Step 3: 写 `shell/navRegistry.test.ts`（注册表探针 = 「9 页全走注册表」的机器判据）**

```ts
/**
 * @ai-context 导航注册表守卫 —— 规格 §10 批 3 行「9 页全走注册表」的**机器判据**。
 *
 * Why 用 vitest 而不是 `scripts/*.mjs`：`scripts/*.mjs` 不在 `line-limits` 扫描域
 *   （批 2 follow-up #16），而 `app/src/**` 在 ⇒ 守卫自己也被 300 行红线看着。
 *
 * 断言分四层（每层都能独立失败，报错各自点名）：
 *   ① 键集 = 9，且与 9 个页面文件**一一对应**（枚举 `app/src/pages/` 目录，不靠手写清单）；
 *   ② 每个 key 在 `App.tsx` 里**确实**被渲染（扫 `<PageSlot show={page === "key"}`）；
 *   ③ 图标名都在 `ui/icons` 的注册表里（拼错必须编译期/测试期报错）；
 *   ④ 没有孤儿页面文件（`pages/*.tsx` 里的非测试文件都在注册表里）。
 *
 * 口径：页面文件枚举 = `app/src/pages/*.tsx` 去掉 `*.test.tsx`。
 *   ⇒ 将来加第 10 个页面文件而没登记，本测试当场红（这正是「全走注册表」的意思）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_ENTRIES, NAV_ENTRIES, isPageKey, navEntry } from "./navRegistry";
import { ICON_PATHS } from "../ui/icons";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = join(SRC, "pages");

/** 页面文件 → 期望的 key（文件名小写去扩展名；`ChatPage` → `chat` 是唯一例外，见下） */
function pageFiles(): string[] {
  return readdirSync(PAGES)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => f.replace(/\.tsx$/, ""));
}

describe("导航注册表（规格 §10 批 3「9 页全走注册表」）", () => {
  it("① 注册表 9 项，键唯一", () => {
    expect(ALL_ENTRIES).toHaveLength(9);
    expect(new Set(ALL_ENTRIES.map((e) => e.key)).size).toBe(9);
  });

  it("① 每个页面文件都在注册表里（孤儿页面 = 没走注册表）", () => {
    const declared = new Set(ALL_ENTRIES.map((e) => `${e.key[0].toUpperCase()}${e.key.slice(1)}Page`));
    const orphans = pageFiles().filter((f) => !declared.has(f));
    expect(orphans, `这些页面文件没有登记进注册表：\n${orphans.join("\n")}`).toEqual([]);
  });

  it("② 每个 key 都在 App.tsx 里被渲染（注册了但没接线 = 点不到）", () => {
    const app = readFileSync(join(SRC, "App.tsx"), "utf8");
    const missing = ALL_ENTRIES.filter((e) => !app.includes(`page === "${e.key}"`)).map((e) => e.key);
    expect(missing, `这些 key 在 App.tsx 里没有对应的 page === 判断：\n${missing.join("\n")}`).toEqual([]);
  });

  it("③ 图标名都在 ui/icons 注册表里", () => {
    const unknown = ALL_ENTRIES.filter((e) => !(e.icon in ICON_PATHS)).map((e) => `${e.key} → ${e.icon}`);
    expect(unknown, `这些图标名没注册：\n${unknown.join("\n")}`).toEqual([]);
  });

  it("③ 顶栏 8 项 + 设置 1 项（规格 §6.1：设置下沉齿轮）", () => {
    expect(NAV_ENTRIES).toHaveLength(8);
    expect(NAV_ENTRIES.some((e) => e.key === "settings")).toBe(false);
    expect(ALL_ENTRIES.some((e) => e.key === "settings")).toBe(true);
  });

  it("④ navEntry/isPageKey 的行为（正样本 + 阴性样本）", () => {
    expect(navEntry("classroom").label).toBeTruthy();
    expect(isPageKey("notes")).toBe(true);
    expect(isPageKey("not-a-page")).toBe(false); // 阴性样本：必须 false
    expect(() => navEntry("not-a-page" as never)).toThrow(/未注册的页面键/);
  });
});
```

> ⚠️ **`app/src/pages/NotesPage.test.tsx` 等 5 个测试文件**会被 `pageFiles()` 的 `*.test.tsx` 过滤掉；**`app/src/pages/` 下今日恰好 9 个非测试 `.tsx`**（T1 已实测）。若将来加页面，本守卫 ① 会红 —— 这是设计意图。

- [ ] **Step 4: 跑测试，逐个失败修到绿**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/shell/navRegistry.test.ts
npx tsc --noEmit
```
预期：先红（`Component` 类型、`legacyLabel` 缺失、`pages` 目录枚举与声明不匹配），按报错逐个修。**`tsc` 报 `ComponentType` 不匹配 ⇒ 按 Step 1 的注改用 `ComponentType<never>`；若仍不成立 ⇒ STOP 报控制方**（不许退回 `any`）。

- [ ] **Step 5: 视觉等价验收（本任务不许有观感变化）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node ".superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\edge-probe\nav-measure3.mjs" --width 1024 --mode current --port 9421
node scripts/check-bundle-budget.mjs --no-build
node scripts/bundle-eager-graph.mjs
```
预期：`nav_natural_width` 与 T1 的 **1375.74** 逐字相同（`legacyLabel` 逐字沿用旧 emoji 长名 ⇒ 宽度不变）；首屏 gzip **≤ 92.79 + 4 kB**（注册表是一个 ≤120 行的小模块，进首屏入口 chunk）；首屏可达**仍 47 文件 / 4 包**（注册表把 8 个 `lazy` **搬了个位置**，不增加静态可达）。

- [ ] **Step 6: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t6.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t6.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git add -- app/src/shell/navRegistry.ts app/src/shell/navRegistry.test.ts
git commit --only -m "feat(shell): add navigation registry for nine pages" -- app/src/shell/navRegistry.ts app/src/shell/navRegistry.test.ts app/src/App.tsx docs/standards/line-limit-exemptions.md
```
> subject `feat(shell): add navigation registry for nine pages` = **48** ✅。
> `docs/standards/line-limit-exemptions.md` 只在 `--write` 真的改了 `App.tsx` 行数时才写进路径清单。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/navRegistry.test.ts` | 6 用例全绿（含阳性 `isPageKey("notes")` 与阴性 `isPageKey("not-a-page")`） |
| V2 | `cd app; npx tsc --noEmit` | exit 0（**不许出现 `any`**：`node -e "const s=require('fs').readFileSync('app/src/shell/navRegistry.ts','utf8');console.log(/:\s*any\b/.test(s));"` → `false`） |
| V3 | `node ".superpowers/.../nav-measure3.mjs" --width 1024 --mode current --port 9421` | `1375.74`（与 T1 逐字相同 ⇒ 观感零变化） |
| V4 | `node scripts/bundle-eager-graph.mjs` | `47` 文件 / `4` 包 |
| V5 | 八门禁 | 逐条 exit 0；`vitest` **128 文件**（+1）/ 用例 +6 |
| V6 | `git show --stat HEAD` | 只含 4 个路径（其中豁免表视 `--write` 结果而定） |

---

### Task 7: A′ 顶栏重构（图标 + 溢出两档 + 齿轮 + 常态宽度验收）

> 规格 §6.1 + §1 决策 12/14。**本任务是本批观感变化最大的一步**，也是「1024 无溢出」的第一半（A2 裁决影响本任务）。

**Files:**
- Create: `app/src/shell/TopBar.tsx`（≤220 行）
- Create: `app/src/shell/TopBar.css`（≤120 行）
- Create: `app/src/shell/TopBar.test.tsx`（≤200 行）
- Modify: `app/src/App.tsx`（顶栏 JSX `:286-380` 换成 `<TopBar … />`；删掉 `NAV_ITEMS`）
- Modify: `app/src/shell/navRegistry.ts`（删 `legacyLabel` 列）

**Interfaces:**
- Consumes: `NAV_ENTRIES` / `PageKey` / `navEntry`（T6）· `BREAKPOINTS.nav/navFull`（T5）· `Icon`（`ui/icons`）· `--ed-nav-h`（T2）
- Produces: `TopBar({ page, onSelect, onOpenSettings, onOpenPalette, right }: TopBarProps)`；`TopBarProps = { page: PageKey; onSelect: (k: PageKey) => void; onOpenSettings: () => void; onOpenPalette: () => void; right?: React.ReactNode }`。T11 用 `onOpenPalette`；采集徽标/toast 经 `right` 插槽注入（**T11 决定它们的归宿**）。

- [ ] **Step 1: 写 `shell/TopBar.css`（两档 + 悬浮名，**纯静态，零动效**）**

```css
/*
 * TopBar.css — A′ 顶栏（规格 §6.1）。批 3 只做静态布局与两档溢出。
 * 动效（墨渍 hover / 按下微陷 / 焦点环落纸）属批 6；本文件**不得**出现 transition / animation。
 * 高度消费 --ed-nav-h（T2 的 token）；两档断点消费 shell/breakpoints.ts 的数值，
 * 但 CSS 媒体查询**不能读 TS 常量** ⇒ 两处必须同值，由 TopBar.test.tsx 的守卫断言钉住。
 */
.ed-topbar {
  height: var(--ed-nav-h, 56px);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 16px;
  border-bottom: 1px solid var(--ed-border, #eae7e0);
  background: var(--ed-bg-surface, #fff);
  box-sizing: border-box;
}
.ed-topbar__brand { font-weight: 700; font-size: 15px; margin-right: 20px; white-space: nowrap; }
.ed-topbar__tabs { display: flex; align-items: center; gap: 4px; min-width: 0; }
.ed-topbar__tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; font-size: 13px; border: none; background: transparent;
  border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap;
}
.ed-topbar__tab[aria-current="page"] { font-weight: 600; color: var(--ed-link, #1f5fbf); border-bottom-color: var(--ed-link, #1f5fbf); }
.ed-topbar__right { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
/* 1024–1180：仅图标 + 悬浮名（规格 §6.1 第二级）。断点数值 = BREAKPOINTS.navFull */
@media (max-width: 1179px) {
  .ed-topbar__tab-label { display: none; }
  .ed-topbar__tab { padding: 8px; }
}
/* < 1024：规格 §6.1「由最小窗兜底」—— 最小窗是 1024（T4），故本档理论不可达。
   保留一条**防御性**规则：真到 1023 时宁可裁掉品牌，也不让状态件被推出视口（T11 会复核）。 */
@media (max-width: 1023px) {
  .ed-topbar__brand { display: none; }
}
```

- [ ] **Step 2: 写 `shell/TopBar.tsx`**

```tsx
/**
 * @ai-context A′ 顶栏（规格 §1 决策 12/14、§6.1）。
 *
 * 形态：品牌 + 8 个域 Tab（图标 + 文字）+ 右上（⌘K / 采集状态 / ⚙ 齿轮）；设置**不下沉为 Tab**。
 * 溢出两级：≥1180 图标+文字；1024–1180 仅图标 + 悬浮名（`title`）；<1024 由最小窗兜底。
 *
 * Why 用 CSS 媒体查询而不是 JS 读 innerWidth：JS 版要 `useState` + `resize` 监听，
 *   每次 resize 都触发 React 重渲染，而这只影响**标签显隐**这一件事；
 *   CSS 版零 JS、零重渲染、SSR/测试环境无 `window` 也能渲染（jsdom 里媒体查询不生效 ⇒
 *   测试断言的是**DOM 契约**（label 元素始终在、`title` 始终在），而不是像素）。
 *
 * 副作用：无（纯展示；所有交互经 props 回调）。
 * 边界：本组件**不**知道采集状态与 toast（它们经 `right` 插槽注入，归宿由 T11 定）。
 *   批 3 不加任何动效（`TopBar.css` 里禁止 transition/animation，由本文件的测试断言）。
 */
import type { ReactNode } from "react";
import { Icon } from "../ui/icons";
import { NAV_ENTRIES, navEntry, type PageKey } from "./navRegistry";
import "./TopBar.css";

export interface TopBarProps {
  page: PageKey;
  onSelect: (key: PageKey) => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
  /** 右侧状态区（采集徽标 / AI toast / 其它）—— 归宿见 T11 */
  right?: ReactNode;
}

export function TopBar({ page, onSelect, onOpenSettings, onOpenPalette, right }: TopBarProps) {
  const settings = navEntry("settings");
  return (
    <nav className="ed-topbar" data-testid="topbar" aria-label="主导航">
      <span className="ed-topbar__brand">熵减 · 本地知识提取</span>
      <div className="ed-topbar__tabs">
        {NAV_ENTRIES.map((e) => (
          <button
            key={e.key}
            type="button"
            className="ed-topbar__tab"
            data-testid={`topbar-tab-${e.key}`}
            title={e.label /* 1024–1180 档的「悬浮名」（规格 §6.1 第二级） */}
            aria-current={page === e.key ? "page" : undefined}
            onClick={() => onSelect(e.key)}
          >
            <Icon name={e.icon} size={20} />
            <span className="ed-topbar__tab-label">{e.label}</span>
          </button>
        ))}
      </div>
      <div className="ed-topbar__right">
        <button type="button" data-testid="topbar-palette" title="命令面板（Ctrl+K）" onClick={onOpenPalette} className="ed-topbar__tab">
          <Icon name="search" size={20} />
          <span className="ed-topbar__tab-label">Ctrl+K</span>
        </button>
        {right}
        <button
          type="button"
          data-testid="topbar-settings"
          title={settings.label}
          aria-current={page === "settings" ? "page" : undefined}
          onClick={onOpenSettings}
          className="ed-topbar__tab"
        >
          <Icon name="settings" size={20} />
          <span className="ed-topbar__tab-label">{settings.label}</span>
        </button>
      </div>
    </nav>
  );
}
```

> ⚠️ **`Icon name="search"`**：`search` 在 `paths.action.ts:20`，`IconName` 由 `paths.ts` 的 `GROUPS` 合并派生 ⇒ 类型成立。
> ⚠️ **不许内联 `<svg`**（`ui/icons/no-inline-svg.test.ts` 在看着）。
> ⚠️ **不许 import `ui/primitives`**（非目标 2：会把 `motion.css` 与整层 CSS 拉进首屏）。

- [ ] **Step 3: 写 `shell/TopBar.test.tsx`（DOM 契约 + 静态纪律）**

```tsx
// @vitest-environment jsdom
/**
 * @ai-context 顶栏契约守卫（规格 §6.1 / §1 决策 12、14）。
 *
 * 判据分三层：
 *   ① 结构：8 个域 Tab + 设置按钮 + 命令面板按钮；设置**不在**域 Tab 里；
 *   ② 两档溢出：每个 Tab **同时**有 label 元素与 title 属性 ⇒ 「文字撤掉后靠 title 悬浮名」
 *      这条规格要求是**DOM 可断言的**（像素不可断言，见下）；
 *   ③ 静态纪律：`.css` 里不得出现 transition / animation / @keyframes（批 6 才做动效）。
 *
 * ⚠️ 仪器局限（必须在报告里单列）：**jsdom 不实现 CSS 媒体查询的实际计算**，
 *   故「1180 以上显示文字 / 1180 以下只显示图标」这条**在本仓的测试环境里测不到**。
 *   本测试因此只断言**承载该行为的 DOM 与样式声明存在**（label 元素 + title + CSS 里那条媒体查询），
 *   真正的像素证据由 T14 的 headless Edge CDP 探针给出（`--width 1024` / `--width 1280`）。
 *
 * ⚠️ 本仓的测试底座（批 3 计划期实测，**照抄勿改**）：
 *   · `vitest.config.ts` 全局 `environment: "node"` ⇒ 组件测试**必须**在文件首行写
 *     `// @vitest-environment jsdom`（先例 `src/ui/primitives/Button.test.tsx:1`）；
 *   · **未装** `jest-dom` 与 `user-event`（`Button.test.tsx:14` 明写「硬约束：不新增依赖」）
 *     ⇒ 断言一律用原生 DOM API（`getAttribute` / `textContent`），交互一律用
 *     `@testing-library/react` 的 `fireEvent`，**不得** `import userEvent`、**不得** `toBeInTheDocument()`。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import { NAV_ENTRIES } from "./navRegistry";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("TopBar（规格 §6.1）", () => {
  it("① 8 个域 Tab，且不含设置", () => {
    render(<TopBar page="classroom" onSelect={vi.fn()} onOpenSettings={vi.fn()} onOpenPalette={vi.fn()} />);
    for (const e of NAV_ENTRIES) expect(screen.getByTestId(`topbar-tab-${e.key}`)).toBeTruthy();
    expect(screen.queryByTestId("topbar-tab-settings")).toBeNull();
    expect(screen.getByTestId("topbar-settings")).toBeTruthy();
  });

  it("① 选中态用 aria-current，不用自造字段", () => {
    render(<TopBar page="notes" onSelect={vi.fn()} onOpenSettings={vi.fn()} onOpenPalette={vi.fn()} />);
    expect(screen.getByTestId("topbar-tab-notes").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("topbar-tab-sessions").getAttribute("aria-current")).toBeNull();
  });

  it("② 每个 Tab 都有 title（1024–1180 档的悬浮名）", () => {
    render(<TopBar page="classroom" onSelect={vi.fn()} onOpenSettings={vi.fn()} onOpenPalette={vi.fn()} />);
    for (const e of NAV_ENTRIES) {
      expect(screen.getByTestId(`topbar-tab-${e.key}`).getAttribute("title"), e.key).toBe(e.label);
    }
  });

  it("点击与键盘都能切换（无障碍路径；用 fireEvent —— 本仓未装 user-event）", () => {
    const onSelect = vi.fn();
    render(<TopBar page="classroom" onSelect={onSelect} onOpenSettings={vi.fn()} onOpenPalette={vi.fn()} />);
    fireEvent.click(screen.getByTestId("topbar-tab-notes"));
    expect(onSelect).toHaveBeenCalledWith("notes");
    fireEvent.click(screen.getByTestId("topbar-tab-notes"));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("③ 顶栏 CSS 里没有动效声明（批 6 才加）", () => {
    const css = readFileSync(join(HERE, "TopBar.css"), "utf8");
    const banned = [/transition\s*:/, /animation\s*:/, /@keyframes/];
    const hits = banned.filter((re) => re.test(css)).map(String);
    expect(hits, `批 3 的顶栏 CSS 不得含动效（属批 6）：${hits.join(" / ")}`).toEqual([]);
  });

  it("③ 高度消费 --ed-nav-h（不许再写 56）", () => {
    const css = readFileSync(join(HERE, "TopBar.css"), "utf8");
    expect(/height:\s*var\(--ed-nav-h/.test(css)).toBe(true);
    expect(/height:\s*56px/.test(css)).toBe(false);
  });
});
```

- [ ] **Step 4: 接线 `App.tsx`**

把 `:286-380` 的整段 `<nav …>…</nav>` 换成：

```tsx
      {/* 批 3 T7：A′ 顶栏（规格 §6.1）。原内联 9-Tab + 双 marginLeft:auto 布局已删除；
          采集徽标与 AI toast 的归宿由 T11 裁决（本步先原样放进 right 插槽，观感不变）。 */}
      <TopBar
        page={page}
        onSelect={setPage}
        onOpenSettings={() => setPage("settings")}
        onOpenPalette={() => { /* T11 接线命令面板 */ }}
        right={null}
      />
```

> ⚠️ **本步会一次性改变观感（emoji → 自绘图标、9 Tab → 8 + 齿轮、对话面板按钮暂缺）** —— 这是规格要的。**但「采集徽标 + AI toast」在本步暂时消失**（`right={null}`）⇒ **T11 必须紧接着完成**，且**本步的提交信息里要写明这一过渡状态**；若控制方要求「任何单次提交都不得让已接线功能不可见」，则把本步与 T11 合并为一次提交（**属 §待裁决 A3 的范围，按裁决执行**）。
> ⚠️ 删掉 `NAV_ITEMS` 与 `legacyLabel` 列；`import { NAV_ENTRIES }` 若不再被 `App.tsx` 使用则一并删除（`tsc` 的 `noUnusedLocals` 会报）。
> ⚠️ `dock-toggle`（对话面板按钮，`data-testid="dock-toggle"`）**必须保留可达**：本步暂时把它放进 `right` 插槽（`right={<button data-testid="dock-toggle" …>}`），**T11 决定它最终进命令面板还是留在顶栏**。**不许在本步删掉它** —— 它是 REQ-274 的唯一显式入口。

- [ ] **Step 5: 量两档宽度（真实证据）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"; $d=".superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp"
node "$d\edge-probe\nav-measure3.mjs" --width 1024 --mode icon-only --port 9431   # 1024 档应命中 icon-only 形态
node "$d\edge-probe\nav-measure3.mjs" --width 1280 --mode a-tabs --port 9432      # 1180+ 档应命中文字形态
node "$d\edge-probe\scale-selftest.mjs"
```
预期：`icon-only@1024` 的 `nav_natural_without_toast` **≈ 750.08**（T1 基线）⇒ 1024 档余量 **≈ 274 px**；`a-tabs@1280` 的 `nav_natural_without_toast` **≈ 909.99** ⇒ 余量 **≈ 370 px**。
> **注意探针是**离线复刻**（它渲染的是探针页自己的 HTML，不是真应用的 DOM）—— 它的用途是**预算算术**，不是「应用真的没溢出」。**真应用的像素证据在 T14**（T14 会把探针升级为「渲染真实构建产物」的形式，见 T14 Step 2）。

- [ ] **Step 6: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t7.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build; node scripts/bundle-eager-graph.mjs
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t7.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git add -- app/src/shell/TopBar.tsx app/src/shell/TopBar.css app/src/shell/TopBar.test.tsx
git commit --only -m "feat(shell): rebuild top bar with icon tabs" -- app/src/shell/TopBar.tsx app/src/shell/TopBar.css app/src/shell/TopBar.test.tsx app/src/shell/navRegistry.ts app/src/App.tsx docs/standards/line-limit-exemptions.md
```
> subject `feat(shell): rebuild top bar with icon tabs` = **42** ✅。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/TopBar.test.tsx` | 6 用例全绿 |
| V2 | `node -e "const s=require('fs').readFileSync('app/src/shell/TopBar.css','utf8');console.log('transition='+/transition\s*:/.test(s),'animation='+/animation\s*:/.test(s));"` | `transition=false animation=false` |
| V3 | `node -e "const s=require('fs').readFileSync('app/src/shell/TopBar.tsx','utf8');console.log('primitives='+/ui\/primitives/.test(s),'inlineSvg='+/<svg/.test(s));"` | `primitives=false inlineSvg=false` |
| V4 | `node scripts/bundle-eager-graph.mjs` | **47 文件 / 4 包**（TopBar 与 CSS 不新增 npm 依赖；若包数涨到 5 ⇒ STOP，说明误装了依赖或误 import 了重模块） |
| V5 | 八门禁 | 逐条 exit 0；首屏 gzip 记下新值（应 ≤ 92.79 + 8 kB） |
| V6 | `git status --porcelain` | 只含本任务 6 个路径 |

---

### Task 8: 列注册表 `shell/columnRegistry.ts`（13 行规格）+ 阈值改判 + 大纲列接线 + 34px 窄条

> 规格 §6.2 的**列契约表逐行落地**：`ColumnSpec = { key, default, min, max, autoFoldBelow, pinnable }`，「由单一注册表汇总，页面不再自建 hook」（**执行器归属见 §待裁决 A5**）。

**Files:**
- Create: `app/src/shell/columnRegistry.ts`（≤160 行）
- Create: `app/src/shell/columnRegistry.test.ts`（≤200 行）
- Modify: `app/src/hooks/useColumnLayout.ts`（**只加一个便利重载/类型**，不改行为；若加不下则新建 `useRegisteredColumn.ts`）
- Modify: `app/src/pages/ClassroomPage.tsx:53` · `SessionsPage.tsx:48` · `NotesPage.tsx:89,90,91` · `KnowledgePage.tsx:60,61`
- Modify: `app/src/components/NoteReadingView.tsx:174` · `app/src/components/KnowledgeDetailPanel.tsx:132`
- Test: `app/src/shell/columnRegistry.test.ts`（覆盖上面两处组件改动）

**Interfaces:**
- Consumes: `BREAKPOINTS` / `breakpointFor`（T5）· `PageKey`（T6）· `useColumnLayout`（既有）
- Produces:
  - `export interface ColumnSpec { key: string; page: PageKey; default: number; min: number; max: number; autoFoldBelow?: number; pinnable: boolean; }`
  - `export const COLUMN_SPECS: readonly ColumnSpec[]`（**13 行**，逐行抄规格 §6.2 表）
  - `export function columnSpec(key: string): ColumnSpec`（未注册即抛）
  - `export function columnsOf(page: PageKey): readonly ColumnSpec[]`
  - `export const COLUMN_KEYS: readonly string[]`（stable 顺序，供测试与文档）

- [ ] **Step 1: 写 `shell/columnRegistry.ts`（真源逐行抄规格 §6.2）**

```ts
/**
 * @ai-context 列契约的**单一注册表**（规格 §1 决策 16「单一注册表 ColumnSpec」+ §6.2 表）。
 *
 * Why：今天「列有多宽」这件事有 4 种写法 —— ① `useColumnLayout` 的 7 处调用（5 页）
 *   ② 未接入的 4 处硬编码（ChatSidebar 240 / GoalsPage 380 / NoteReadingView 180 / KnowledgeDetailPanel 34）
 *   ③ 组件的 `width` 默认参数（SessionListPanel 320 / GroupSidebar 240 / KnowledgeDetailPanel 320）
 *   ④ 老师的口头约定。⇒ 同一个「笔记组列 240」在 4 处各写一遍，改一处漏三处是静默的。
 *   本模块把 §6.2 的 13 行变成可枚举、可断言的契约；hook 仍是**唯一执行器**（见 A5 裁决）。
 *
 * 口径（逐字对应 §6.2）：
 *   · `autoFoldBelow` = 窗口宽**低于**该值时自动折叠（与 useColumnLayout 的 `<` 语义一致）；
 *     `undefined` = 不折叠（§6.2 写「—」或「不折叠」的行）。
 *   · `pinnable` = 该列是否允许用户固定（§6.2 未逐行给值 ⇒ 本注册表取保守默认 `false`，
 *     **除笔记大纲列**（§6.2 明写「接线拖拽+记忆或删钩子」）为 `true`。**见注：这是本批唯一一处
 *     「规格没给值、计划者取默认」的字段，已在报告里单列。**
 *   · 主体顺序 = §6.2 表的行序（便于逐行比对）。
 *
 * 副作用：无（纯数据）。
 * 边界：**只管宽度与折叠**；不描述列的内容、组件的挂载、也不描述列的可见性（采集态整列隐藏属批 6）。
 */
import { breakpointFor } from "./breakpoints";
import type { PageKey } from "./navRegistry";

export interface ColumnSpec {
  /** 全局唯一键（`useColumnLayout` 的持久化键就用它 ⇒ 迁移时**不得改名**，改名等于丢掉用户的列宽记忆） */
  readonly key: string;
  readonly page: PageKey;
  /** 默认宽（= 今日既有值，迁移零视觉变化） */
  readonly default: number;
  readonly min: number;
  readonly max: number;
  /** 窗口宽低于该值时自动折叠；`undefined` = 不折叠 */
  readonly autoFoldBelow?: number;
  readonly pinnable: boolean;
}

/** 规格 §6.2 的 13 行，逐行落表（顺序 = 规格表行序） */
export const COLUMN_SPECS = [
  // 📡 课堂
  { key: "classroom-left", page: "classroom", default: 320, min: 240, max: 420, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  { key: "classroom-right", page: "classroom", default: 0, min: 0, max: 0, pinnable: false }, // flex 列：宽由容器决定，不参与拖拽（T10 消费）
  // 🗂 会话
  { key: "sessions-list", page: "sessions", default: 320, min: 240, max: 420, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  // 📝 笔记
  { key: "notes-groups", page: "notes", default: 240, min: 180, max: 320, autoFoldBelow: breakpointFor("threeCol"), pinnable: false },
  { key: "notes-list", page: "notes", default: 320, min: 240, max: 420, autoFoldBelow: breakpointFor("threeCol"), pinnable: false },
  { key: "notes-outline", page: "notes", default: 180, min: 140, max: 260, autoFoldBelow: breakpointFor("outlineCol"), pinnable: true },
  // ✅ 行动 / 🔄 复习：单列，无自动折叠（§6.2 两行都是「单列」）
  { key: "action-main", page: "action", default: 0, min: 0, max: 0, pinnable: false },
  { key: "review-main", page: "review", default: 0, min: 0, max: 0, pinnable: false },
  // 💬 AI 对话（T9 接线：现硬编码 240）
  { key: "chat-sidebar", page: "chat", default: 260, min: 200, max: 320, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  // 🧠 体系
  { key: "knowledge-left", page: "knowledge", default: 260, min: 200, max: 360, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  { key: "knowledge-detail", page: "knowledge", default: 320, min: 260, max: 420, pinnable: false }, // §6.2「不折叠」
  // 🎯 目标（T9 接线：现硬编码 380 → 默认 320）
  { key: "goals-left", page: "goals", default: 320, min: 240, max: 420, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  // ⚙ 设置：单列居中 860（无 min/max，不参与拖拽）
  { key: "settings-main", page: "settings", default: 860, min: 0, max: 0, pinnable: false },
] as const satisfies readonly ColumnSpec[];

export const COLUMN_KEYS: readonly string[] = COLUMN_SPECS.map((c) => c.key);

export function columnSpec(key: string): ColumnSpec {
  const hit = COLUMN_SPECS.find((c) => c.key === key);
  if (!hit) throw new Error(`未注册的列键：${key}`);
  return hit;
}

export function columnsOf(page: PageKey): readonly ColumnSpec[] {
  return COLUMN_SPECS.filter((c) => c.page === page);
}
```

> ⚠️ **`default: 0 / min: 0 / max: 0` 的六行**（flex 列、单列）是本计划对 §6.2「flex」/「—」/「页签内分区」的**编码**。**若控制方认为这些列不该进注册表**，删掉对应行即可（其余行不受影响）—— 登记为 A1 裁决的一部分。
> ⚠️ **`pinnable` 字段在 §6.2 里没有逐行值** ⇒ 本表取「除笔记大纲列外都是 false」。**这一点必须在报告与 T14 的规格回写里写明**。

- [ ] **Step 2: 写 `shell/columnRegistry.test.ts`（逐行对规格 + 与 hook 的契约一致）**

```ts
/**
 * @ai-context 列注册表守卫 —— 规格 §6.2 的 13 行必须逐字可核。
 *
 * 断言分四层：
 *   ① 13 行全在，键唯一，且键集与 `useColumnLayout` 的持久化键**同形**（`layout:col-width:{key}`）；
 *   ② 每行 min ≤ default ≤ max（`default:0` 的 flex/单列行豁免 —— 它们的 min=max=default=0）；
 *   ③ 每个 `page` 都是注册表里的 PageKey（防止列挂在已删页上）；
 *   ④ 阈值只来自 `BREAKPOINTS`（不许出现裸数字 860/700/1024 字面量）。
 *
 * ⚠️ 仪器局限：本测试**读不到**「组件实际用了哪个宽度」—— 那由各页的集成测试与 T14 的像素探针覆盖。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLUMN_SPECS, columnSpec, columnsOf } from "./columnRegistry";
import { BREAKPOINTS } from "./breakpoints";
import { ALL_ENTRIES } from "./navRegistry";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("列注册表（规格 §6.2）", () => {
  it("① 13 行、键唯一、顺序稳定", () => {
    expect(COLUMN_SPECS).toHaveLength(13);
    expect(new Set(COLUMN_SPECS.map((c) => c.key)).size).toBe(13);
    expect(COLUMN_SPECS.map((c) => c.key)[0]).toBe("classroom-left");
  });

  it("② min ≤ default ≤ max（0 宽行除外，它们的三个数必须同时为 0）", () => {
    const bad = COLUMN_SPECS.filter((c) =>
      c.default === 0 ? !(c.min === 0 && c.max === 0) : !(c.min <= c.default && c.default <= c.max));
    expect(bad.map((c) => c.key), "这些列的三元组不合法").toEqual([]);
  });

  it("③ 每个 page 都在导航注册表里", () => {
    const pages = new Set(ALL_ENTRIES.map((e) => e.key as string));
    const bad = COLUMN_SPECS.filter((c) => !pages.has(c.page)).map((c) => `${c.key} → ${c.page}`);
    expect(bad, `这些列挂在不存在的页上：\n${bad.join("\n")}`).toEqual([]);
  });

  it("④ 阈值只来自 BREAKPOINTS（模块里不得出现裸阈值字面量）", () => {
    const src = readFileSync(join(HERE, "columnRegistry.ts"), "utf8");
    const loose = [...src.matchAll(/autoFoldBelow:\s*(\d+)/g)].map((m) => m[1]);
    expect(loose, `这些 autoFoldBelow 是裸数字（应写 breakpointFor(...)）：${loose.join(", ")}`).toEqual([]);
    const used = new Set(COLUMN_SPECS.map((c) => c.autoFoldBelow).filter((v): v is number => v != null));
    for (const v of used) expect(Object.values(BREAKPOINTS)).toContain(v);
  });

  it("④ columnSpec 正样本 / 阴性样本", () => {
    expect(columnSpec("notes-list").default).toBe(320);
    expect(() => columnSpec("nope")).toThrow(/未注册的列键/);
    expect(columnsOf("notes")).toHaveLength(3);
    expect(columnsOf("action")).toHaveLength(1);
  });

  it("① 与规格 §6.2 的九个数字逐字一致（抽样锚点，防整表被改错）", () => {
    expect(columnSpec("classroom-left").default).toBe(320);
    expect(columnSpec("notes-groups").default).toBe(240);
    expect(columnSpec("notes-outline").default).toBe(180);
    expect(columnSpec("chat-sidebar").default).toBe(260);
    expect(columnSpec("knowledge-left").default).toBe(260);
    expect(columnSpec("goals-left").default).toBe(320);
    expect(columnSpec("settings-main").default).toBe(860);
    expect(columnSpec("knowledge-detail").autoFoldBelow).toBeUndefined();
  });
});
```

- [ ] **Step 3: 6 处调用点改为从注册表取规格**

```ts
// 之前
const leftCol = useColumnLayout("classroom-left", { default: 320, min: 240, max: 420, autoFoldBelow: breakpointFor("twoCol") });
// 之后
const leftCol = useColumnLayout("classroom-left", columnSpec("classroom-left"));
```

> ⚠️ **`useColumnLayout` 的 `Options` 是 `{default,min,max,autoFoldBelow?}`，而 `ColumnSpec` 多了 `key`/`page`/`pinnable`** ⇒ 直接传会因多余属性报错。**两种正解，择一并写进报告**：
> **(a)** 给 hook 加一个窄化入口（`app/src/hooks/useColumnLayout.ts` 只加 3 行）：
> ```ts
> /** 从注册表消费规格（批 3）：只取执行器认识的四个字段，多余字段不进 hook —— hook 不感知注册表 */
> export type ColumnSpecInput = Pick<Options, "default" | "min" | "max" | "autoFoldBelow">;
> ```
> 调用点写 `useColumnLayout(s.key, s)`（`s` 的多余属性在**变量**位置不做多余属性检查，故合法）。
> **(b)** 每页 `const s = columnSpec("classroom-left"); useColumnLayout(s.key, { default: s.default, min: s.min, max: s.max, autoFoldBelow: s.autoFoldBelow });` —— **啰嗦但零改动 hook**。
> **计划推荐 (a)**（3 行改动、调用点最干净），但 **(a) 会改 `useColumnLayout.ts` 的公开类型** ⇒ 若你选 (a)，把 `useColumnLayout.ts` 加进本任务的 Files 与提交路径清单。**两种都合法，报告里写明选了哪种。**

- [ ] **Step 4: 大纲列接线（消灭 J1-6「假可调」）**

`app/src/components/NoteReadingView.tsx:174` 的 `<div style={{ width: 180, … }}>` 改为经 props 注入的宽度：

```tsx
        <div style={{ width: outlineWidth, flexShrink: 0, borderRight: "1px solid #f3f4f6", overflowY: "auto", padding: "12px 8px", background: "#fafafa" }}>
```

并在 `Props` 里加：

```ts
  /** v0.15 大纲列宽（批 3：由页面从 columnSpec("notes-outline") 的 hook 传入；此前组件写死 180 ⇒ 记忆永不生效） */
  outlineWidth?: number;
```

默认值 `outlineWidth = columnSpec("notes-outline").default`（**180，零视觉变化**）。
`NotesPage.tsx` 把 `outlineCol.width` 传下去；`onToggleOutline` **改为 `outlineCol.expand()`**（J1-3「折叠后永不展开」的交互死局 —— §6.2 明写「接线拖拽+记忆**或删钩子**」，本计划选**接线**）。
`ColumnResizer` 接到大纲列（与其它列同款）。

- [ ] **Step 5: 34px 窄条收进统一列头（`KnowledgeDetailPanel.tsx:132`）**

```tsx
      // §6.2「34px 窄条收进统一列头」：宽度取自注册表，不再是魔法 34
      <div data-testid="detail-panel" style={{ width: collapsedWidth, flexShrink: 0, borderLeft: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa" }}>
```
其中 `collapsedWidth` 来自新增 prop（默认 `34` ⇒ 零视觉变化；由 `KnowledgePage` 传入 `columnSpec("knowledge-detail").min` 的**派生值**或一个显式常量）。

> ⚠️ **这一步与 §6.2 的「折叠态持久化」是两件事**：持久化要求 `useColumnLayout` 记忆**手动折叠态**（它已经在做：`layout:col-fold:{key}`）。本步只需把 34 从组件里搬走。
> **若你认为「搬走 34」收益不足**：**允许跳过本步**并在报告里写明「§6.2 该行未做，登记给批 4」。**不许**为了做它引入新的 magic number。

- [ ] **Step 6: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t8.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build; node scripts/bundle-eager-graph.mjs
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t8.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git add -- app/src/shell/columnRegistry.ts app/src/shell/columnRegistry.test.ts
git commit --only -m "feat(shell): add column spec registry" -- app/src/shell/columnRegistry.ts app/src/shell/columnRegistry.test.ts app/src/hooks/useColumnLayout.ts app/src/pages/ClassroomPage.tsx app/src/pages/SessionsPage.tsx app/src/pages/NotesPage.tsx app/src/pages/KnowledgePage.tsx app/src/components/NoteReadingView.tsx app/src/components/KnowledgeDetailPanel.tsx docs/standards/line-limit-exemptions.md
```
> subject `feat(shell): add column spec registry` = **37** ✅。**把没改的文件从路径清单里删掉**（`--only` 对未改动路径会报 pathspec 错）。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/columnRegistry.test.ts` | 6 用例全绿 |
| V2 | `node -e "const fs=require('fs');const f=['ClassroomPage','SessionsPage','NotesPage','KnowledgePage'].map(x=>'app/src/pages/'+x+'.tsx');let bad=[];for(const p of f){const L=fs.readFileSync(p,'utf8').split(/\r?\n/);L.forEach((l,i)=>{if(/useColumnLayout\(/.test(l)&&!/columnSpec\(/.test(l))bad.push(p+':'+(i+1));});}console.log(bad.join('\n')||'all-from-registry');"` | `all-from-registry` |
| V3 | `cd app; npx vitest run src/components/NoteReadingView.test.tsx src/components/KnowledgePage.test.tsx` | 全绿（**零断言修改**） |
| V4 | 八门禁 | 逐条 exit 0；`vitest` **129 文件**（+1）/ 用例 +6 |
| V5 | `node scripts/bundle-eager-graph.mjs` | **47 文件 / 4 包**（注册表是纯数据模块；**若变 48 ⇒ 说明有页面被静态拉回首屏，STOP**） |
| V6 | `git status --porcelain` | 只含本任务改动路径 |

---

### Task 9: 未接入三处接入列基础设施（`ChatSidebar` / `GoalsPage` / `SettingsPage`）

> 规格 §6.2 的三个「本次改动」格：AI 对话侧栏「**接入列基础设施**（现硬编码 240）」· 目标左列「**接入列基础设施**；默认 380 → **320**」· 设置「现 720 **左对齐** → 改居中」（居中 860）。

**Files:**
- Modify: `app/src/components/ChatSidebar.tsx:65`（`width: 240` → 经 props 注入）
- Modify: `app/src/pages/GoalsPage.tsx:80`（`width: 380` → 经 hook）
- Modify: `app/src/pages/SettingsPage.tsx:59`（`maxWidth: 720` 左对齐 → 居中 860）
- Modify: `app/src/pages/ChatPage.tsx` ⇒ **只允许「把 `chatCol.width` 传给 `<ChatSidebar width={…} />`」这一处 props 传递**（**593/600，余 7 行 ⇒ 任何其它改动都不许进这个文件**）
- Test: `app/src/shell/columnConsumption.test.ts`（**新建**，≤120 行：钉住三处不再硬编码）

**Interfaces:**
- Consumes: `columnSpec`（T8）
- Produces: 三处消费注册表；`ChatSidebarProps.width?: number`（默认取注册表值 260）· `GoalsPage` 内的 `goalsCol` · `SettingsPage` 居中样式。

- [ ] **Step 1: `ChatSidebar` 接列基础设施**

```tsx
export interface ChatSidebarProps {
  /** 批 3（规格 §6.2）：侧栏宽由页面从 columnSpec("chat-sidebar") 的 hook 传入；此前写死 240 */
  width?: number;
  /** 批 3：折叠态（窄窗自动折叠）；折叠时渲染 26px 窄条 */
  folded?: boolean;
  // …其余既有 props 逐字保留…
}
```
组件内：`<div style={{ width, … }}>`；`folded` 为真时渲染 `<ColumnBar>`（与其它列同款）。

- [ ] **Step 2: `ChatPage` 只加两行（**这是本批唯一允许动 ChatPage 的地方**）**

在 `ChatSidebar` 用点（`ChatPage.tsx:404`）之前加：

```tsx
  const chatCol = useColumnLayout("chat-sidebar", columnSpec("chat-sidebar"));
```
并把 `<ChatSidebar … />` 改为 `<ChatSidebar width={chatCol.width} folded={chatCol.folded} … />`。
> ⚠️ 改完**立刻量行数**：`[System.IO.File]::ReadAllLines((Resolve-Path app\src\pages\ChatPage.tsx),[Text.Encoding]::UTF8).Count` —— **必须仍 ≤ 600**（余 7 行）。若超 ⇒ **不许硬塞**，改为把 `useColumnLayout` 调用**下沉进 `ChatSidebar` 自己**（组件内自取注册表规格），页面零改动。**报告里写明你走了哪条路。**

- [ ] **Step 3: `GoalsPage` 接列基础设施（默认 380 → 320）**

```tsx
  const goalsCol = useColumnLayout("goals-left", columnSpec("goals-left"));
```
`GoalsPage.tsx:80` 的 `width: 380` → `width: goalsCol.width`，并按其它页同款加 `ColumnResizer` 与折叠态 `ColumnBar`。

- [ ] **Step 4: `SettingsPage` 居中 860**

`SettingsPage.tsx:59` 的 `maxWidth: 720` → 取注册表值并居中：

```tsx
      <div style={{ maxWidth: columnSpec("settings-main").default, margin: "0 auto", padding: "12px 16px 24px" }}>
```
（`settings-main.default = 860`；`margin: "0 auto"` 即「改居中」。）

- [ ] **Step 5: 写 `shell/columnConsumption.test.ts`（三处不再硬编码的机器判据）**

```ts
/**
 * @ai-context 未接入三处的**接线守卫**（规格 §6.2 的三个「本次改动」格）。
 * 口径：只扫三个文件的源码文本，断言旧字面量消失、新消费点在位。**不看渲染结果**（那由 T14 像素探针与各页测试覆盖）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("未接入三处的列接线（规格 §6.2）", () => {
  it("ChatSidebar 不再写死 240，且接受 width/folded", () => {
    const s = read("components/ChatSidebar.tsx");
    expect(/width:\s*240\b/.test(s), "ChatSidebar 仍硬编码 240").toBe(false);
    expect(s.includes("width?: number")).toBe(true);
  });

  it("GoalsPage 不再写死 380，且消费注册表", () => {
    const s = read("pages/GoalsPage.tsx");
    expect(/width:\s*380\b/.test(s), "GoalsPage 仍硬编码 380").toBe(false);
    expect(s.includes('columnSpec("goals-left")')).toBe(true);
  });

  it("SettingsPage 改为居中 860", () => {
    const s = read("pages/SettingsPage.tsx");
    expect(/maxWidth:\s*720\b/.test(s), "SettingsPage 仍是 720").toBe(false);
    expect(s.includes('columnSpec("settings-main")')).toBe(true);
    expect(/margin:\s*"0 auto"/.test(s)).toBe(true);
  });

  it("扫描域自检：三个文件都读得到（防路径写错导致假绿）", () => {
    for (const f of ["components/ChatSidebar.tsx", "pages/GoalsPage.tsx", "pages/SettingsPage.tsx"]) {
      expect(read(f).length, f).toBeGreaterThan(500);
    }
  });
});
```

- [ ] **Step 6: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t9.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t9.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git add -- app/src/shell/columnConsumption.test.ts
git commit --only -m "feat(shell): wire three pages to column specs" -- app/src/components/ChatSidebar.tsx app/src/pages/GoalsPage.tsx app/src/pages/SettingsPage.tsx app/src/pages/ChatPage.tsx app/src/shell/columnConsumption.test.ts docs/standards/line-limit-exemptions.md
```
> subject `feat(shell): wire three pages to column specs` = **46** ✅。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/columnConsumption.test.ts` | 4 用例全绿 |
| V2 | `[System.IO.File]::ReadAllLines((Resolve-Path app\src\pages\ChatPage.tsx),[Text.Encoding]::UTF8).Count` | **≤600**（记录确切数；基线 593） |
| V3 | `node -e "const s=require('fs').readFileSync('app/src/pages/GoalsPage.tsx','utf8');console.log(/width:\s*380/.test(s), /columnSpec\(\"goals-left\"\)/.test(s));"` | `false true` |
| V4 | 八门禁 | 逐条 exit 0；`line-limits --full` 的 `301–600` 档数值与登记条目同步（`ChatSidebar` 若 >300 需 `--write` 登记 —— **它今天 161 行，加接线后仍应 ≤300；若 >300 见下注**） |
| V5 | `node scripts/check-bundle-budget.mjs --no-build` | 首屏增幅 ≤ 4 kB（三处接线） |
| V6 | `git status --porcelain` | 只含本任务路径 |

> ⚠️ **若 `ChatSidebar.tsx` 接线后 >300 行**：`--write` 会**新增一条登记**，而 Global Constraints **禁止新增豁免登记** ⇒ **STOP 并报控制方**（正解是把折叠窄条与列头拆成独立小组件，属一次语义拆分，需要授权）。

---

### Task 10: 课堂右栏统一 wrapper（消灭 640 / 全宽两档跳动）

> 规格 §6.2「📡 课堂 右面板 | flex | — | **统一 wrapper，消灭 640/全宽两档跳动**」。

**Files:**
- Modify: `app/src/components/ClassroomRightPane.tsx`（136 行；`:48` 宿主 `flex:1`，`:60/:81/:114` 三处 `maxWidth: 640`）
- Test: `app/src/components/ClassroomRightPane.test.tsx`（若已存在则**只加用例**；不存在则新建 ≤120 行）

**Interfaces:**
- Consumes: `columnSpec("classroom-right")`（T8，`default:0` 的 flex 列）
- Produces: 一个统一的 `.ed-pane-body` 包装（宽由**一处**决定）。

- [ ] **Step 1: 写失败测试（钉住「只有一处宽度决定点」）**

> ⚠️ 若 `app/src/components/ClassroomRightPane.test.tsx` **不存在**（批 3 计划期未在 `components/` 下见到它），
> 新建文件首行必须写 `// @vitest-environment jsdom`（全局是 node），且**只**用 `fireEvent` 与原生断言（见仪器纪律第 18 条）。

```tsx
// @vitest-environment jsdom
/**
 * @ai-context 课堂右栏的**单宽度决定点**守卫（规格 §6.2「统一 wrapper，消灭 640/全宽两档跳动」）。
 * 口径：源码文本层面断言 `maxWidth` 只出现一次（且值来自注册表/常量而非裸 640）。
 *   ⚠️ 仪器局限：这**不是**像素断言 —— 真正的宽度由 T14 的像素探针在 1024/1280 两档各测一次。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("课堂右栏统一 wrapper", () => {
  const src = readFileSync(join(SRC, "components/ClassroomRightPane.tsx"), "utf8");

  it("maxWidth 只在 wrapper 一处出现（今天散在 3 处）", () => {
    const hits = [...src.matchAll(/maxWidth/g)].length;
    expect(hits, `maxWidth 出现 ${hits} 次（应恰好 1 次，在 wrapper 上）`).toBe(1);
  });

  it("不再出现裸 640", () => {
    expect(/maxWidth:\s*640\b/.test(src), "仍硬编码 640").toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/components/ClassroomRightPane.test.tsx
```
预期：**FAIL**，`maxWidth 出现 3 次`。

- [ ] **Step 3: 改造成单一 wrapper**

把三处 `padding: "…", maxWidth: 640` 的内容 div 改为**不带 maxWidth** 的普通 div，并让它们共同坐在一个 wrapper 里：

```tsx
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {/* 批 3（规格 §6.2）：唯一的内容宽决定点。此前三处分支各写一份 maxWidth: 640，
              与宿主的 flex:1 并存 ⇒ 状态切换时在 640 与全宽之间跳。现统一由此 wrapper 决定。 */}
          <div style={{ maxWidth: columnSpec("classroom-right").max || PANE_BODY_MAX, margin: "0 auto" }}>
            …三个分支的内容（各自只保留 padding）…
          </div>
        </div>
```

其中 `PANE_BODY_MAX` 是本文件顶部的一个具名常量（**72** 行的 §6.2 观感基准 —— 取阅读舒适宽 **860**，与设置页的居中宽同源；见下注）。

> ⚠️ **`classroom-right` 在注册表里是 `default:0` 的 flex 列**（宽度由容器决定）⇒ `columnSpec(…).max` 为 0。**因此本步不能从注册表取内容宽**。**正解二选一，报告里写明选了哪个**：
> **(a)** 把内容宽作为**独立常量** `PANE_BODY_MAX = 860` 放在本文件顶部（**一处**，注释写明它来自 §6.2 的「统一 wrapper」要求）；
> **(b)** 在 `columnRegistry` 里给 `classroom-right` 补一个**内容宽字段**（会改 T8 的接口 ⇒ 需要 T8 已合并）。
> **推荐 (a)**（本任务与 T8 解耦；`maxWidth` 仍只有一处）。

- [ ] **Step 4: 跑测试 + 相关页测试**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/components/ClassroomRightPane.test.tsx
npx vitest run src --testNamePattern="Classroom"
```
预期：全绿（`ClassroomPage` 无自动化覆盖 —— 批 0-C2 已实测「本页零自动化覆盖」，故**必须**在报告里写明「本任务的自动化证据只有源码级守卫 + T14 的像素探针」）。

- [ ] **Step 5: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t10.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t10.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git add -- app/src/components/ClassroomRightPane.test.tsx
git commit --only -m "fix(classroom): unify right pane width wrapper" -- app/src/components/ClassroomRightPane.tsx app/src/components/ClassroomRightPane.test.tsx docs/standards/line-limit-exemptions.md
```
> subject `fix(classroom): unify right pane width wrapper` = **47** ✅。**类型用 `fix`**（这是修一个既有缺陷：宽度跳动）。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/components/ClassroomRightPane.test.tsx` | 2 用例全绿 |
| V2 | `node -e "const s=require('fs').readFileSync('app/src/components/ClassroomRightPane.tsx','utf8');console.log('maxWidth='+(s.match(/maxWidth/g)||[]).length);"` | `maxWidth=1` |
| V3 | 八门禁 | 逐条 exit 0 |
| V4 | `node scripts/check-bundle-budget.mjs --no-build` | 首屏增幅 ≤ 2 kB |
| V5 | `git show --stat HEAD` | 只含 2–3 个路径 |

---

### Task 11: 溢出策略终局（toast 归宿 + ⌘K 命令面板）

> **本任务是「1024 无溢出」的第二半**，也是**唯一需要 A3 裁决才能定形**的任务。规格 §6.1「⌘K 命令入口用来替代现在手写的 9 个 `focus*` 参数跳转，数据源接 `kb_search`」；§6.1 的顶栏清单**没有 toast**。

**Files:**
- Create: `app/src/shell/CommandPalette.tsx`（≤220 行）
- Create: `app/src/shell/CommandPalette.css`（≤120 行）
- Create: `app/src/shell/CommandPalette.test.tsx`（≤200 行）
- Modify: `app/src/App.tsx`（toast 归宿 + 面板挂载 + `Ctrl+K` 监听）
- Read（只读）: `app/src-tauri/src/commands_kb.rs:36`（`kb_search` 签名）· `app/src-tauri/src/kb_search.rs:20`（`KbHit` 结构）

**Interfaces:**
- Consumes: `TopBar.onOpenPalette`（T7）· `isPageKey` / `ALL_ENTRIES`（T6）· `zIndex("modal")`（`ui/zIndex`，批 0-A）
- Produces: `CommandPalette({ open, onClose, onPick }: CommandPaletteProps)`；`CommandPaletteProps = { open: boolean; onClose: () => void; onPick: (cmd: Command) => void }`；`type Command = { id: string; label: string; hint?: string; run: () => void }`。**T12 接 `kb_search` 时会新增「结果命令」这一类。**

- [ ] **Step 1: 按 A3 裁决处理 toast（**两种走法，只走裁决指定的那一种**）**

**走法甲（A3 = toast 移出顶栏，推荐）**：
`App.tsx` 的 AI toast 从 `<nav>` 内部（`:360-379`）移到 `MainShell` 最外层的 fixed 覆盖层：

```tsx
      {/* 批 3（规格 §6.1 + 审计 J1-7）：AI toast 从 56px 导航行移出（它是 1024 溢出的主因，
          实测 373.75 px = 1024 视口的 36.5%），改 fixed 覆盖层，不参与顶栏宽度分配。 */}
      {aiToast && (
        <div
          data-testid="ai-toast"
          style={{
            position: "fixed", top: "calc(var(--ed-nav-h) + 8px)", right: 16,
            zIndex: zIndex("toast"), maxWidth: 420,
            fontSize: 12, fontWeight: 500, borderRadius: 12, padding: "6px 12px",
            color: aiToast.kind === "ok" ? "#047857" : "#b91c1c",
            background: aiToast.kind === "ok" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${aiToast.kind === "ok" ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          {aiToast.text}
        </div>
      )}
```
采集徽标留在顶栏，经 `<TopBar right={…} />` 注入（规格 §6.1 明确列了「采集状态」）。

**走法乙（A3 = toast 留在行内）**：徽标与 toast 都进 `right`，且**显式裁切**（`overflow:hidden` + `flex-shrink:1` + `min-width:0`），并在 T14 的验收里把「1024 无溢出」限定为**常态（无 toast）**。**走法乙的读数必须写进报告**：`nav_natural_width`（含 toast）@1024 = **1375.74 > 1024** ⇒ **有 toast 时仍然溢出**，这是走法乙的既知代价。

> ⚠️ `zIndex("toast")` 是批 0-A 的六档标尺（t6=500）。**不许写裸数字**（`ui/zIndex.guard.test.ts` 会红）。

- [ ] **Step 2: 写 `shell/CommandPalette.tsx`**

```tsx
/**
 * @ai-context ⌘K 命令面板（规格 §6.1「⌘K 命令入口用来替代现在手写的 9 个 focus* 参数跳转」）。
 *
 * 本任务（T11）交付：**壳**——开合、键盘导航（↑↓/Enter/Esc）、命令列表、页面跳转命令。
 * T12 交付：**数据源**——把 `kb_search` 的命中变成「结果命令」。
 *
 * Why 不用 L1 的 `Modal` 原语：批 3 的非目标 2 明令不许 import `ui/primitives`
 *   （会把 `motion.css` 与整层 CSS 拉进首屏，吃掉批 2 挣来的余量）。本组件自带遮罩 + Esc + 焦点，
 *   **但必须与 Modal 的契约一致**（role=dialog / aria-modal / 焦点陷阱 / ESC 关 / 点遮罩关）
 *   —— 批 4 会把它换成 `Modal`（届时删掉本文件的遮罩与键盘代码），故**这一处是批 4 的迁移点，
 *   必须在文件头写明**，否则批 4 会漏掉它。
 *
 * 副作用：`open` 为真时注册一个 window keydown（上下键 / Enter / Esc）；关闭即解绑。
 * 边界：不做模糊搜索排序（T12 接 kb_search 后由后端给序）；不做动效（批 6）。
 */
```

实现要点（**逐条都要有**）：
- `role="dialog"` + `aria-modal="true"` + `aria-label="命令面板"`；
- 输入框 `autoFocus`；`↑`/`↓` 改 `activeIndex`；`Enter` 执行；`Esc` 关；点遮罩关；
- **IME 守卫**：`Enter` 提交前调 `isImeComposing` 的**等价判断**（`e.nativeEvent.isComposing`）—— **不许 import `ui/primitives`**（那里有 `ime.ts`，但 import 它就是 import 整层）；在文件里写明「批 4 换成 `primitives` 的 `isImeComposing()`」；
- 列表首屏 8 条页面跳转命令（来自 `ALL_ENTRIES`）+ T12 追加的搜索结果；
- `zIndex("modal")`（`ui/zIndex`）。

- [ ] **Step 3: 写 `shell/CommandPalette.test.tsx`**

> ⚠️ **文件首行必须是 `// @vitest-environment jsdom`**（`vitest.config.ts` 全局 `environment: "node"`），
> 且**未装 `jest-dom` / `user-event`** ⇒ 断言用原生 DOM API、交互用 `fireEvent`（先例 `src/ui/primitives/Button.test.tsx:1,14,20`）。

必测（逐条对应上面「实现要点」；`fireEvent` 派发，不用 `userEvent`）：
```tsx
// @vitest-environment jsdom
  it("role=dialog + aria-modal（批 4 迁移到 Modal 前的契约对齐）", …);
  it("Esc 关闭；点遮罩关闭；面板内点击不关闭", …);          // fireEvent.keyDown(window, { key: "Escape" })
  it("↑↓ 改选中项，Enter 执行并关闭", …);                   // fireEvent.keyDown(input, { key: "ArrowDown" })
  it("IME 组合中按 Enter **不**提交（中文输入法不能误触）", …); // fireEvent.keyDown(input, { key: "Enter", isComposing: true }) 不发生 onPick
  it("命令列表含 9 个页面跳转命令（来自导航注册表）", …);
  it("CSS 里没有 transition/animation（批 6 才做）", …);
```

- [ ] **Step 4: `App.tsx` 接线（`Ctrl+K` + 面板挂载）**

```tsx
  // 批 3 T11：⌘K / Ctrl+K 命令面板（规格 §6.1）。与既有的 Ctrl+Shift+A（对话面板）并列，
  // 两者互不遮蔽：Ctrl+K 无 Shift，Ctrl+Shift+A 有 Shift（先判更具体的组合）。
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
```
挂载：`<CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onPick={…} />`。
`onPick` 至少支持：`{ kind: "page", key }`（`isPageKey` 校验后 `setPage`）与 `{ kind: "dock" }`（开对话面板）。

- [ ] **Step 5: 量「1024 无溢出」（**本步给出 1024 档的最终读数**）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"; $d=".superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp"
node "$d\edge-probe\nav-measure3.mjs" --width 1024 --mode icon-only --port 9441
node "$d\edge-probe\nav-measure3.mjs" --width 1024 --mode current --port 9442    # 走法甲：这个形态不再存在（toast 已移出）
node scripts/check-bundle-budget.mjs --no-build
node scripts/bundle-eager-graph.mjs
```
预期：`icon-only@1024` 的 `nav_natural_without_toast` **≈ 750.08** ⇒ **余量 ≈ 274 px**；`current@1024`（含 toast 的假设形态）在走法甲下**已不适用**（toast 不再占位）。
**报告必须写清**：探针是**离线复刻**，「≈750」是预算算术；**真应用的像素证据在 T14**。

- [ ] **Step 6: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t11.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t11.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git add -- app/src/shell/CommandPalette.tsx app/src/shell/CommandPalette.css app/src/shell/CommandPalette.test.tsx
git commit --only -m "feat(shell): add command palette and move toast" -- app/src/shell/CommandPalette.tsx app/src/shell/CommandPalette.css app/src/shell/CommandPalette.test.tsx app/src/App.tsx docs/standards/line-limit-exemptions.md
```
> subject `feat(shell): add command palette and move toast` = **47** ✅。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/CommandPalette.test.tsx` | 6 用例全绿（含 IME 守卫） |
| V2 | `node -e "const s=require('fs').readFileSync('app/src/shell/CommandPalette.tsx','utf8');console.log('primitives='+/ui\/primitives/.test(s),'roleDialog='+/role=\"dialog\"/.test(s),'ariaModal='+/aria-modal/.test(s),'zIndexFn='+/zIndex\(/.test(s),'bareZ='+/zIndex:\s*\d/.test(s));"` | `false true true true false` |
| V3 | A3 走法甲 ⇒ `node -e "const s=require('fs').readFileSync('app/src/App.tsx','utf8');console.log(/top:\s*56\b/.test(s), /--ed-nav-h/.test(s));"` | `false true` |
| V4 | 八门禁 | 逐条 exit 0 |
| V5 | `node scripts/check-bundle-budget.mjs --no-build` | 首屏 ≤ 92.79 + 12 kB（面板 + CSS） |
| V6 | `git status --porcelain` | 只含本任务路径 |

---

### Task 12: ⌘K 数据源 `kb_search` 接线 + `focus*` 参数跳转收敛为命令

> 规格 §9 表第 14 行：`kb_search` → **补 UI（本批）**，说明写「**⌘K 的数据源**（ADR-029 RAG 层）」；§6.1「⌘K 命令入口用来替代现在手写的 9 个 `focus*` 参数跳转」。**这是批 3 里唯一碰 IPC 的任务。**

**Files:**
- Create: `app/src/shell/kbCommands.ts`（≤140 行：把一个 `KbHit` 变成一条 `Command`，纯函数）
- Create: `app/src/shell/kbCommands.test.ts`（≤160 行）
- Modify: `app/src/shell/CommandPalette.tsx`（接 `kb_search` 的异步结果 + 防抖 + 失败降级）
- Modify: `app/src/App.tsx`（`focus*` 跳转经命令收敛：**只收敛「页面级跳转」那 9 个 `setPage` 入口，不改 `focus*` 状态机本身**）

**Interfaces:**
- Consumes: `Command`（T11）· `PageKey` / `isPageKey`（T6）
- Produces: `export function commandsFromHits(hits: KbHit[]): Command[]`；`export async function searchCommands(q: string, limit?: number): Promise<Command[]>`

- [ ] **Step 1: 先读 Rust 侧的真实签名（**不许凭记忆写契约**）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
```
然后 `read app/src-tauri/src/commands_kb.rs`（全文）与 `read app/src-tauri/src/kb_search.rs` 的 `KbHit` 定义。**把 `kb_search` 的入参名、类型、返回结构、错误形态逐字抄进本步报告** —— 这三项是本任务唯一的对外契约。
> ⚠️ `kb_search` 是 312 条注册表命令之一（批 1 已确认它**在**注册表里，未被删除）；`node scripts/check-command-registry.mjs` 必须仍 **312/312/0**（本任务不增删命令）。

- [ ] **Step 2: 写 `shell/kbCommands.ts`（纯函数 + 防御性降级）**

```ts
/**
 * @ai-context ⌘K 的**数据源适配层**（规格 §9 表 #14：`kb_search` → 补 UI（本批），「⌘K 的数据源」）。
 *
 * Why 单独立文件：把「IPC 结果 → 命令列表」做成**纯函数**，就能在没有 Tauri 运行时的
 *   vitest 环境里测（本仓 vitest 全局 `environment:"node"`，`invoke` 不可用）。
 *   组件只负责调用与渲染，不负责数据形状 —— 这样 T12 的测试面是 100%，而不是 0%。
 *
 * 防御性（AGENTS.md §3.4：系统调用必须有超时/重试/降级）：
 *   · 查询串空白 ⇒ **不发 IPC**，返回空列表（Rust 侧对空白串返回空，但省一次往返）；
 *   · IPC 抛错 ⇒ 返回空列表且**不抛出**（⌘K 是导航入口，不能因为检索失败而不可用）；
 *   · 命中缺字段 ⇒ 跳过该条（不让一条脏数据毁掉整个列表）。
 *
 * 边界：本模块**不 import 任何 React**（纯逻辑）；不做排序（由后端给序）；
 *   不做中文分词（Rust 侧 `kb_fts.rs` 已把中文规划成 trigram）。
 */
```

- [ ] **Step 3: 写 `shell/kbCommands.test.ts`（纯函数全覆盖 + 阴性样本）**

必测：空串不发 IPC（用 `vi.mock("@tauri-apps/api/core")` 计数）· 正常命中 → 命令列表 · IPC 抛错 → 空列表且不抛 · 脏命中 → 跳过 · 命令 `run()` 的页面跳转经 `isPageKey` 校验。

- [ ] **Step 4: `CommandPalette` 接入（异步 + 防抖 + 计次守卫）**

要求：
- 输入变化后 **180ms** 防抖再查（**这是唯一允许的计时器**；不得引入动效）；
- **只认最后一次请求**（`seq` 计数，与 `NotesPage` 的 `seqRef` 同款）—— 防止慢响应覆盖新结果；
- 结果与页面跳转命令**合并展示**（页面命令恒在最前）；
- **失败时静默降级**为「只有页面跳转命令」并显示一行灰色提示（**不许空 catch**，`console.warn` 带上下文）。

- [ ] **Step 5: `focus*` 跳转收敛（**只做「入口收敛」，不删状态机**）**

规格 §6.1 要「替代现在手写的 9 个 `focus*` 参数跳转」。**今日的 `focus*` 有 9 个字段**（`App.tsx:164-202`：`focusSessionId` / `focusNoteId` / `focusNoteSearch` / `focusSystemId` / `createSystemSignal` / `focusGroupId` / `focusReviewGroupId` / `focusRefineTaskId` / `focusChatTaskId` / `focusChatId`）。

**本批只做**：把这 9 个字段对应的「**跨页跳转入口**」在 ⌘K 里各给一条命令（如「去会话页」「去笔记页（带词高亮）」…），**状态机与各页消费逻辑一个字节不动**。
**本批不做**：删 `focus*` 字段、改它们的类型、把跳转改成路由参数 —— **那是批 5**（视图层与深链重构）。**在报告里写明这条边界**（否则会被误读为「§6.1 没做完」）。

- [ ] **Step 6: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t12.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t12.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git add -- app/src/shell/kbCommands.ts app/src/shell/kbCommands.test.ts
git commit --only -m "feat(shell): wire kb search into palette" -- app/src/shell/kbCommands.ts app/src/shell/kbCommands.test.ts app/src/shell/CommandPalette.tsx app/src/App.tsx
```
> subject `feat(shell): wire kb search into palette` = **41** ✅。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/kbCommands.test.ts src/shell/CommandPalette.test.tsx` | 全绿（含端到端式：mock IPC → 输入 → 列出命中） |
| V2 | `node scripts/check-command-registry.mjs` | **定义 312 / 注册 312 / 重复 0**（本任务**不增删命令**；`kb_search` 早已注册） |
| V3 | `node -e "const s=require('fs').readFileSync('app/src/shell/kbCommands.ts','utf8');console.log('react='+/from \"react\"/.test(s),'emptyCatch='+/catch\s*\{\s*\}/.test(s));"` | `react=false emptyCatch=false` |
| V4 | 八门禁 | 逐条 exit 0；`cargo` 两条逐字持平（本任务**不改 Rust**） |
| V5 | `node scripts/check-bundle-budget.mjs --no-build` | 首屏增幅 ≤ 4 kB（`kbCommands` 是纯函数，`@tauri-apps/api` 早已在首屏） |
| V6 | `git status --porcelain` | 只含本任务路径 |

---

### Task 13: 批 2 转交三条（页级错误边界 + 变体错误边界 + 首访加载态）

> 三条都来自批 2 §瓶颈清单（Task 6 评审 M-1 · Task 7 风险 1 · 未做 #6）。**非目标 2 仍然生效：不许 import `ui/primitives`。**

**Files:**
- Create: `app/src/shell/ShellFallback.tsx`（≤60 行：一个自足的静态占位 + 一个叶级错误边界）
- Create: `app/src/shell/ShellFallback.test.tsx`（≤120 行）
- Modify: `app/src/App.tsx`（`PageSlot` 的 `<Suspense fallback={null}>` → `<Suspense fallback={<ShellFallback />}>`；两个窗口变体分支各包一层边界）

**Interfaces:**
- Consumes: 无（零依赖，刻意不 import `ui/primitives`）
- Produces: `export function ShellFallback(): JSX.Element`（首访加载态）· `export class SlotErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }>`（**叶级**，只卸载出错的那一页，不卸载 `MainShell`）

- [ ] **Step 1: 写 `shell/ShellFallback.tsx`**

```tsx
/**
 * @ai-context 壳层的两个失败/等待态（批 2 §瓶颈清单转交的三条）。
 *
 * Why 不用 L1 原语（`Loading` / `ErrorState`）：批 3 的非目标 2 明令不许 import `ui/primitives`
 *   —— 那会把 `motion.css` 与整层 CSS 拉回首屏，吃掉批 2 挣来的 107 kB 余量。
 *   **这两个组件是批 4 的迁移点**（换成 `Loading` / `StatusLine`），文件头必须写明，否则批 4 会漏。
 *
 * 覆盖的三条：
 *   ① Task 6 评审 M-1：`PageSlot` 的 Suspense 之上只有全局 `AppErrorBoundary` ⇒ 懒 chunk 加载失败
 *      会卸载**整个 MainShell**（已访问页状态一起丢）⇒ 本文件的 `SlotErrorBoundary` 是**叶级**的。
 *   ② Task 7 风险 1：两个窗口变体（`?float=1` / `?overlay=1`）没有边界 ⇒ chunk 失败 = 全空白。
 *   ③ 未做 #6：首访加载态 `fallback={null}` ⇒ 改用 `ShellFallback`（**静态**，无动效）。
 *
 * 副作用：`SlotErrorBoundary` 只读 `getDerivedStateFromError`；不发日志、不上报（本地优先）。
 * 边界：不做重试按钮（重试语义要与 Tauri 的 chunk 缓存一起设计，登记给批 4/8）。
 */
```

- [ ] **Step 2: 写 `shell/ShellFallback.test.tsx`**

> ⚠️ 首行 `// @vitest-environment jsdom`（全局 node）；**只**用 `fireEvent` 与原生断言（见仪器纪律第 18 条）。

必测：`ShellFallback` 渲染一行文字（可及性：`role="status"`）· `SlotErrorBoundary` 在子组件抛错时**只**渲染自己的失败卡片、且 `children` 不再挂载 · **兄弟节点仍渲染**（关键：证明是叶级而不是整树）· CSS 里无动效（若带 CSS）。
> ⚠️ 「子组件抛错」在 React 19 下会让测试进程打印 `console.error`（错误边界已捕获，但 React 仍会 `console.error`）⇒ 用例里用 `vi.spyOn(console, "error").mockImplementation(() => {})` 抑制，**并在断言后 `mockRestore()`**（否则会污染其它用例）。

- [ ] **Step 3: `App.tsx` 接线**

- `PageSlot`（`:142-149`）：`<Suspense fallback={<ShellFallback />}>{children}</Suspense>`；
- `?overlay=1` 分支（`:95-102`）：`<SlotErrorBoundary><Suspense fallback={<ShellFallback />}><CaptureOverlayPanel /></Suspense></SlotErrorBoundary>`；
- `?float=1` 分支（`:105-115`）：**`CaptureStatusProvider` 必须仍在边界外层**（它是「每窗恰一个实例」的采集状态源，见文件头 `@ai-context`）⇒ `<CaptureStatusProvider><SlotErrorBoundary><Suspense …>…</Suspense></SlotErrorBoundary></CaptureStatusProvider>`；
- `AiConversationDock` 的 `Suspense`（`:498-514`）：同样加边界（否则 dock chunk 失败会拖垮整壳）。

- [ ] **Step 4: 跑测试 + 全量门禁**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/shell/ShellFallback.test.tsx
npx vitest run src/App.test.tsx 2>$null; if ($LASTEXITCODE -ne 0) { "（预期：本仓无 App.test.tsx，见批 2 实测）" }
```
预期：`ShellFallback.test.tsx` 全绿；`App.test.tsx` **不存在**（批 2 已实测「不存在 `App.test.tsx`」）⇒ 本任务对 `App.tsx` 的改动**仍无测试面**，**报告必须诚实单列**，并给出唯一可达证据：`tsc` + 构建 + T14 的像素探针。

- [ ] **Step 5: 八门禁 + 提交**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full; node scripts/docs-check.mjs; node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit; npx vitest run
cd src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-t13.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs --no-build
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-t13.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; git add -- app/src/shell/ShellFallback.tsx app/src/shell/ShellFallback.test.tsx
git commit --only -m "feat(shell): add slot error boundary and loading" -- app/src/shell/ShellFallback.tsx app/src/shell/ShellFallback.test.tsx app/src/App.tsx
```
> subject `feat(shell): add slot error boundary and loading` = **48** ✅。

**Verification**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell/ShellFallback.test.tsx` | 4 用例全绿（含「兄弟节点仍渲染」） |
| V2 | `node -e "const s=require('fs').readFileSync('app/src/shell/ShellFallback.tsx','utf8');console.log('primitives='+/ui\/primitives/.test(s));"` | `false` |
| V3 | `node -e "const s=require('fs').readFileSync('app/src/App.tsx','utf8');console.log('fallbackNull='+/Suspense fallback=\{null\}/.test(s),'boundaries='+(s.match(/SlotErrorBoundary/g)||[]).length);"` | `fallbackNull=false` · `boundaries≥4` |
| V4 | 八门禁 | 逐条 exit 0；首屏增幅 ≤ 3 kB |
| V5 | `node scripts/bundle-eager-graph.mjs` | 仍 **47 文件 / 4 包** |

---

### Task 14: 验收测量 + 收口（三条验收的机器判据 + 八门禁 + 规格 §10 回写 + 台账 + follow-ups）

> 规格 §10 批 3 行的验收是三条：**「9 页全走注册表；1024 无溢出；7 处魔数归零」**。本任务给每条一个**点名仪器的机器判据**，并完成规格 §10 的进度回写、`docs/versions/v0.22.md` 的台账与 follow-ups。**本任务不再改生产代码**（只改文档；若测量发现缺陷，**回退到对应任务修**，不在本任务里夹带）。

**Files:**
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/tmp/viewport-probe.mjs`（**真实产物**的视口探针，不入库）
- Create: `.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/tmp/acceptance.md`（不入库）
- Modify: `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§10 批 3 行 + 必要的口径注）
- Modify: `docs/versions/v0.22.md`（新增「批 3 · 壳层落地」节）
- Modify（**只有 `--write` 真的改了数字时才动**）: `docs/standards/line-limit-exemptions.md`
- Modify: 本计划文件（追加 **§收口回写**）

**Interfaces:**
- Consumes: 全部前序任务的产物
- Produces: 三条验收的读数 + 规格回写 + 台账 + follow-ups（**逐条具名归属批次**）

- [ ] **Step 1: 验收 ①「9 页全走注册表」**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
npx vitest run src/shell/navRegistry.test.ts
```
**机器判据**：6 用例全绿，其中 ① 层断言**枚举 `app/src/pages/*.tsx` 得到的 9 个页面文件全部在注册表里**（无孤儿）、② 层断言**每个 key 都在 `App.tsx` 里被渲染**（`page === "key"`）、③ 层断言图标名都在 `ui/icons`。
**另附一条反向证据**（探针可枚举）：`node -e "…"` 枚举注册表键并逐个在 `App.tsx` 里找 `page === "<key>"`，输出 9 行 `key → OK`。**把原始输出贴进 `acceptance.md`。**
**仪器自检**：同一条命令对 `"not-a-page"` 必须报 **MISS**（阴性样本）。

- [ ] **Step 2: 验收 ②「1024 无溢出」**（**必须区分「可达的机器证据」与「不可达的部分」，逐条写清**）

**可达（本任务必做）**：
```powershell
cd "D:\Program own\aicode\work space\Entropydecrease\app"
cmd /c "cd /d `"D:\Program own\aicode\work space\Entropydecrease\app`" && npm run build > `"D:\Program own\aicode\work space\Entropydecrease\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\build-final.txt`" 2>&1"
cd "D:\Program own\aicode\work space\Entropydecrease"
node ".superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\viewport-probe.mjs" --width 1024 --height 640 --entry app/dist/index.html
node ".superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\viewport-probe.mjs" --width 1280 --height 800 --entry app/dist/index.html
```
`viewport-probe.mjs` = **把 T1 的 CDP 探针升级为「加载真实产物」**：用 CDP 打开 `file:///…/app/dist/index.html`，等 `#root` 有子节点（或超时 3s），然后量：
1. `document.documentElement.scrollWidth <= document.documentElement.clientWidth`（**页面无横向滚动**）；
2. `document.querySelector('[data-testid="topbar"]').scrollWidth <= clientWidth`（**顶栏自身无溢出**）；
3. 逐个 Tab 的 `getBoundingClientRect().right <= innerWidth`（**没有 Tab 被推出视口**，比 scrollWidth 更严格）；
4. `window.innerWidth === 1024` + `dpr === 1` + 固定块 500 + 哨兵 90（**仪器自检**）。
**预期**：1024 档 4 条全绿（`noHScroll=true` / `topbarOverflow=false` / 无 Tab 越界 / 自检通过）；1280 档同样全绿。
**⚠️ 若 1024 档红** ⇒ **不许在本任务里修改生产代码** ⇒ STOP，指名到任务（T7 或 T11），回退修完再回来重测。

**不可达（必须逐条诚实单列，不许含糊）**：
1. **Tauri WebView2 的真实渲染**：探针跑的是 **headless Edge**（同 Chromium 内核但**不是 WebView2**），差异在字体回退与窗口装饰。
2. **`invoke` 不可用**：`file://` 打开的产物没有 `window.__TAURI__` ⇒ 页面的 IPC 调用会全部失败；`TopBar` 本身零 IPC（故顶栏宽度结论仍成立），但**整页的 `scrollWidth` 会被各页的错误态影响** ⇒ **第 1 条（页面无横向滚动）只是参考项，第 2/3 条（顶栏自身）才是本验收的判据**。这一点**必须在 `acceptance.md` 里写清**，否则会被误读为「整页已验收」。
3. **真机 1024×640 窗口**（`tauri.conf.json` 的 `minWidth`）未实测 —— 需要 `npm run tauri dev` 与人工观察，本批不做（可在 T14 报告里给出手工步骤，登记给批 8 的真机验收）。

- [ ] **Step 3: 验收 ③「7 处魔数归零」**（逐处 before/after）

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node -e "const fs=require('fs');const T=[['M1 nav-h',/height:\s*56\b|top:\s*56\b|100vh\s*-\s*56px/,'App.tsx,components/AiConversationDock.tsx,pages/*'],['M3 chat-sidebar',/width:\s*240\b/,'components/ChatSidebar.tsx'],['M4 goals',/width:\s*380\b/,'pages/GoalsPage.tsx'],['M5 settings',/maxWidth:\s*720\b/,'pages/SettingsPage.tsx'],['M6 right-pane',/maxWidth:\s*640\b/,'components/ClassroomRightPane.tsx'],['M2 breakpoints',/autoFoldBelow:\s*\d/,'pages/*']];for(const [tag,re,where] of T){console.log(tag+' ['+where+'] → '+re);}console.log('--- 逐处人工核对（脚本只给 pattern，判定必须在报告里逐条给 file:line 或「0 命中 + 仪器自检」）---');"
```
**判定口径（每处都要满足）**：
1. **0 命中**，且**点名仪器**（本步的 `node -e` + regex）、并**先证明它能命中一个已知存在的串**（如对 `M1` 的 regex 去命中 `git show HEAD~N:app/src/App.tsx` 的旧版本 —— **阳性对照必须来自旧版本，不是同一个已改好的文件**）；
2. **阴性对照**：对无意义串报 0。
3. M7（窗口尺寸）的判据不是 grep 而是 **`windowSize.test.ts` 的 4 条断言**（JSON 与常量逐字一致）。
4. **M2 的判据是 `columnRegistry.test.ts` 的第 4 条**（`autoFoldBelow` 不许出现裸数字）+ 本步的 grep。

**把 7 处的 before/after 做成一张表**（`文件:行` + 旧值 + 新写法 + 判据命令 + 观测），贴进 `acceptance.md` 与规格回写。

- [ ] **Step 4: 八门禁终态（串行单跑）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
node scripts/line-limits.mjs --full
node scripts/docs-check.mjs
node scripts/check-command-registry.mjs
cd app; npx tsc --noEmit
cd app; npx vitest run
cd app\src-tauri; cargo test --test app_lib_tests 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\cargo-final.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node scripts/check-bundle-budget.mjs
cd app\src-tauri; cargo clippy --all-targets 2>"..\..\.superpowers\sdd\2026-09-11-frontend-redesign-batch3-shell\tmp\clippy-final.txt"
cd "D:\Program own\aicode\work space\Entropydecrease"; node "$d\clippy-set.mjs" --in "$d\clippy-final.txt" --out "$d\clippy-final-set.txt" --min 15
node -e "const fs=require('fs');const a=new Set(fs.readFileSync(process.argv[1],'utf8').trim().split(/\r?\n/));const b=new Set(fs.readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/));const onlyA=[...a].filter(x=>!b.has(x)),onlyB=[...b].filter(x=>!a.has(x));console.log('baseline='+a.size,'final='+b.size,'onlyInBaseline='+onlyA.length,'onlyInFinal='+onlyB.length,onlyA.length||onlyB.length?'SET-DIFFERS':'SET-IDENTICAL');console.log([...onlyA,'---',...onlyB].join('\n'));" "$d\clippy-baseline-set.txt" "$d\clippy-final-set.txt"
```
预期（**全部 exit 0**）：`>600: 0 · 301–600: N · 登记条目 N`（`N` 会有变化，逐条对账）· `docs-check 通过` · `定义 312 / 注册 312 / 重复 0` · `tsc` 0 错 · vitest **只增不减**（相对 T1 的 125 文件 / 1233 用例）· `cargo` **2300 / 0 / 6 逐字持平**（本批 0 Rust 改动）· 首屏 gzip **≤ 200 kB 且给出确切值**· clippy **SET-IDENTICAL**。
**任何一条红 ⇒ STOP，指名到任务，回退修完再来。**

- [ ] **Step 5: 回写规格 §10 批 3 行**（**原文保留，只加注**）

在 `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` 的 §10 表里，把批 3 行改成：

```markdown
| **3 壳层落地** | A′ 顶栏 + ⌘K + 溢出策略 + 窗口尺寸 + 列注册表 + 断点 + `--nav-h` **✅ 已落（<YYYY-MM-DD> 收口，`<起>..<止>`，N 个提交）** | 9 页全走注册表 **✅**；1024 无溢出 **✅**（顶栏自身无溢出，headless Edge CDP 实测；整页与真机项见计划 §收口回写「未验证」）；7 处魔数归零 **✅**（逐处 `文件:行` 见批 3 计划 §收口回写） |
```

并在 §10 表后按批 2 的先例追加一块 `> ↳ 批 3 的收口（批 3 完成时更新）` 注，写清：**8 个文件的改动面** · **`--nav-h` 的落点（token 生成器，不是手改产物）** · **列契约的执行器归属（A5 裁决）** · **`pinnable` 字段是本计划取的默认（规格未给逐行值）** · **本批非目标四条各自的实际处置**。
**若实测与规格原文有出入**（如 §6.1 的「约 1070px / 约 720px」估数），**在 §6.1 就地加注**（原文保留），格式照抄规格里的「**2026-09-12 批 2 回写**」块。

- [ ] **Step 6: 写 `docs/versions/v0.22.md` 的「批 3 · 壳层落地」节**（照抄批 1/批 2 的七段结构）

必须含：**交付** · **验收**（三条 + 八门禁读数）· **规格漂移纠正**（逐处）· **过程中纠正的计划错误**（逐处）· **未做（登记，逐条带归属批次）** · **诚实代价** · **提交清单**。
**诚实代价必须写**：本批在首屏入口 chunk 里加了壳层代码 ⇒ 首屏 gzip **从 92.79 kB 涨到 <实测值>**（涨的是必要成本：注册表 + 顶栏 + 命令面板 + 三个守卫）；`app/index.html` 变大；**且顶栏的 emoji 被自绘图标替换、AI toast 换了位置 —— 这是可感知的观感变化**（与批 0–2 的「界面几乎不变」不同，规格 §10 末句明写「骨架在批 3」）。

- [ ] **Step 7: follow-ups（逐条具名归属批次）**

至少登记：
1. **真机 1024×640 验收**（WebView2，人工）→ **批 8**
2. **命令面板迁移到 `Modal` 原语**（本批自带遮罩/Esc/焦点，批 4 换成 `Modal` 并删掉那份重复实现）→ **批 4**
3. **`ShellFallback` → `Loading` / `StatusLine` 原语**→ **批 4**
4. **`focus*` 状态机的收敛**（本批只做入口收敛，未删字段）→ **批 5**
5. **列折叠的连续运动（Flip）**（本批只有瞬跳）→ **批 6**
6. **相变两态**（采集态 58px LIVE 仪表 + 域导航隐藏 · 复习态零 chrome）—— 规格 §6.3，**本批未做**（需要相变状态机，依赖批 2b 的 `CaptureStatusProvider` 与批 6 的相变凝固）→ **批 6**
7. **导航 `⌘K` 与 `Ctrl+Shift+A` 的快捷键冲突面**（本批两条都注册在 `window`；无集中注册表 —— 审计 B2 的「命令注册中心」）→ **批 4/8**
8. **`app/scripts/*.mjs` 与 `scripts/*.mjs` 不在 `line-limits` 扫描域**（本批新增的守卫因此全部放进 `app/src/**`；生成器与门禁脚本仍无保护）→ **批 8**
9. **`index.html` 的滚动条样式只在页面级生效**（未做弹层/虚拟列表的细滚动条核对）→ **批 4**
10. **`columnRegistry` 的 `pinnable` 字段无消费方**（规格 §6.2 给了字段但没给逐行值）→ **批 6**（与列折叠动效一起定）

- [ ] **Step 8: 追写本计划的 §收口回写（**原文一律保留，只加注**）**

在本文件末尾追加 `## 收口回写（Task 14，<YYYY-MM-DD> —— 批 3 终态 · 验收读数 · 给批 4+ 的输入）`，含：三条验收的判据与读数 · 八门禁终态表 · 7 处魔数 before/after 表 · **A1–A5 五处裁决的实际结果** · **未验证（诚实单列）** · follow-ups 表。

- [ ] **Step 9: 提交（文档）**

```powershell
cd "D:\Program own\aicode\work space\Entropydecrease"
git status --porcelain
git commit --only -m "docs(spec): close out shell batch three" -- docs/superpowers/specs/2026-09-11-frontend-redesign-design.md docs/versions/v0.22.md docs/superpowers/plans/2026-09-11-frontend-redesign-batch3-shell.md
```
> subject `docs(spec): close out shell batch three` = **40** ✅。
> 豁免表若被 `--write` 改动，**把它加进路径清单**（否则它留在工作树里变成下一个 agent 的脏读）。
> **不 commit** `.superpowers/**`（已被 `.gitignore` 的 `.superpowers/` 覆盖；**永不 `git add -f`**）。

**Verification（本任务 = 全批的验收）**

| # | 命令 | 期望 |
|---|---|---|
| V1 | `cd app; npx vitest run src/shell` | 全部壳层守卫全绿（navRegistry · columnRegistry · breakpoints · windowSize · TopBar · CommandPalette · kbCommands · ShellFallback · navHeight.consumption · columnConsumption · ClassroomRightPane） |
| V2 | 八门禁（Step 4 的九行命令） | 逐条 exit 0；读数写进 §收口回写 |
| V3 | clippy 集合比对 | `SET-IDENTICAL` |
| V4 | `node ".superpowers/.../viewport-probe.mjs" --width 1024 --height 640 --entry app/dist/index.html` | 顶栏无溢出 + 无 Tab 越界 + 仪器自检通过 |
| V5 | `node -e "…7 处魔数扫描…"` | 7 处全部 0 命中（含阳性/阴性对照） |
| V6 | `git log --oneline <起>..HEAD` | 12–15 个原子提交，subject 全部 ≤50 字符（逐条数字符数） |

---

## 自审记录（计划者自查，不属执行范围）

- **规格覆盖**：§1 决策 12（导航形态 A′）→ T6/T7 · 13（域数纪律：新增能力进域内页签，本批**不新增域**，注册表键集恒 9）· 14（顶栏溢出两级）→ T7 · 15（相变壳层两态）→ **未做，登记批 6** · 16（列契约 + 断点 + `--nav-h`）→ T2/T5/T8 · 17（窗口 + reset + 滚动条）→ T4 · 18（AI 对话 Tab 保守保留为第 8 项）→ T6/T7 · §6.1（顶栏 8 项 + ⌘K + 采集状态 + 齿轮）→ T7/T11/T12 · §6.2（13 行列契约 + 阈值口径 + 记忆规则）→ T8/T9/T10 · §6.3（相变两态）→ **未做，登记批 6** · §9 表 #14（`kb_search` 补 UI）→ T12 · §10 批 3 行 → 全批 + T14 · §11 验收 → T14 · §14（文档回写）→ T14。
- **非目标覆盖**：不重做批 2（Global Constraints 非目标 1 + 表 5 只做三条）· 不迁原语（T7/T11/T13 三条 V 断言 `primitives=false`）· 不建视图层（全批无 `ViewSpec`/`viewRegistry`/`ViewSwitcher`）· 不装 GSAP/不加动效（T7/T11 的 CSS 断言 `transition=false animation=false`）。
- **类型一致性**：`PageKey`（T6 派生）在 T7/T8/T9/T11/T12 消费；`ColumnSpec` 的七个字段（T8）在 T9/T10 消费；`BREAKPOINTS` 的五个键（T5）在 T7（CSS 注释同值）/T8 消费；`Command` 与 `CommandPaletteProps`（T11）在 T12 扩展；`WINDOW_SIZE` / `NAV_MIN_WIDTH`（T4）在 T5 与 T14 消费。**无第五种写法。**
- **占位符扫描**：T4 Step 4 的 `index.html` 与 T11 的 `CommandPalette` 是**结构性骨架 + 逐条实现要点**（不是「TBD」）；每一条要点都有对应的 V 断言（`role=dialog` / `aria-modal` / `zIndex(` / IME / 无动效）。**没有「类似 Task N」的引用。**
- **风险最高的三处**已就地标注：T5 Step 5（1280 恰在 `outlineCol` 阈值上，边界值）· T9 Step 2（`ChatPage` 只剩 7 行余量）· T14 Step 2（headless 与 WebView2 的差异，必须写清哪条是判据、哪条只是参考）。

---

## 收口回写（Task 14，<YYYY-MM-DD> —— 批 3 终态 · 验收读数 · 给批 4+ 的输入）

> 本节由**收口单元**在 Task 14 追加。上文一律**保留不改**，本节只做**终态读数**与**归账**。
> **批 4 的计划者：你需要的迁移点清单就是本节 §批 4 的迁移点。**
