# 批 3 壳层落地实施计划（A′ 顶栏 + ⌘K + 溢出策略 + 窗口尺寸 + 列注册表 + 断点 + `--nav-h`）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把壳层从「手写 9 Tab + 每页自建列 + 7 处硬编码尺寸」改造成「**单一导航注册表 + 单一列注册表 + 一套断点 + `--nav-h` 变量**」，使规格 §10 批 3 行的三条验收全部成立：**9 页全走注册表 · 1024 无溢出 · 7 处魔数归零**。

> **🔻 T14 就地回写注（W1 / W2 / A1 · 2026-09-12 收口时加）** —— 上文**原文一律保留**。
> **① 「7 处魔数归零」的「7」从未被定义**：规格全仓 `魔数` **仅 1 命中**（`§10:530`，从不展开）。**A1 裁决：不迁就数字** —— 判据取「**能否被单一真源吸收**」，并按判据做。
> ⇒ **终态计数（T14 实测，不许压回「7」）**：**已吸收 8**（本计划表 2 的 **M1–M7 七处全部归零** + A1 追加的大纲列 `180`）· **有目标未吸收 1**（`KnowledgeDetailPanel` 的 `34` —— `ColumnSpec` 无「折叠窄条宽」概念，取 `.min`(260) 会把 34 px 变成 260 px）· **无目标 2**（`ColumnBar` 的 `26` · `ColumnResizer` 的 `5` —— 规格 §6.2 无对应目标）。逐处 before/after + 判据见本文件 §收口回写。
> **② 「1024 无溢出」必须带限定词**：**常态（toast 已按 A3 移出导航行）**。计划期的推算「含 toast 1375.74 > 1024」已被 T7 的实现改变 —— **toast 移入 fixed 覆盖层后不再参与导航行宽度分配**，T7 实测 toast 两态读数**逐字相同**。⇒ 终态读数用 **T7 实测**（三档 × toast 三态 × 徽标两变体 = 48 行全 OK），**且必须包含 toast 可见态**（A3 裁决④明文禁止把 toast 剔出读数求通过）。
> **③ 本计划表 2 的两处计数错误（W9，T14 更正）**：M1 那行写「**8 个页面**的 `calc(100vh - 56px)`」—— 实测 **7 个页面**（**8 处**，`ReviewPage` 占 2 处；合计仍是「10 处 / 9 文件」正确）；表 1 写 `useColumnLayout`「7 处 / **5 页**」—— 实测 **4 页**（规格 §2 自己写「4/9 页」也对得上）。

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

> **🔻 T14 就地回写注（W28 · **计划自相矛盾第 5 例**）** —— 上表 `ChatPage.tsx` 那行的「**本批不许改 ChatPage.tsx**」**与 Task 9 的 Files / Step 2 正面冲突**（彼处逐字要求「只允许…这一处 props 传递」「这是本批唯一允许动 ChatPage 的地方」）。
> **控制方裁定：走 Task 9 侧（主路）** —— 理由：它与既有 **6 处调用点的形态一致**（页面持 hook、把列规格传给子组件）；Global Constraints 的写法会让 `ChatSidebar` 变成唯一「组件自建 hook」的例外。
> ⇒ **本行应按此读**：「**页面持 hook + 传 props；`ChatPage.tsx` 允许恰好一处 props 传递**」。**代价已登记**：`ChatPage.tsx` 变 **599/600（余 1 行）** ⇒ **下一个动它的任务必须先拆**；T9 的 fallback（hook 下沉进 `ChatSidebar`、页面回到 593）**未实测**，作为备选登记。
> **另注（W27）**：本批 `line-limits` 的 pre-commit 跑**全树**、`--write` 又按**工作树**刷新登记表 ⇒ **并行实施必然产生「提交树不自洽」窗口**，本批已实证 **3 次**（`92ea5d6b` / `4f8f3d3c` / `fd83abb4` 之前同类）⇒ 建议批 8 给门禁加 `--staged` 模式（**只登记，不擅自改流程**）。
> **🔻 收口评审 I-1 加注（2026-09-12，**上句原文保留**）——「3 次」记错，实测为 5 个提交，且 `fd83abb4` 自洽**：上句是我读台账时的**误记**。收口评审把批 3 的**全部 22 棵提交树逐一导出**（`git -c core.autocrlf=false archive -o t.tar <sha>` + `tar -xf`）再跑**该树自带的** `node scripts/line-limits.mjs --full`，实测 **5 个 exit 1 / 17 个 exit 0**（落盘脚本与原始日志：`.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/tmp/review-closing/selfconsistency.{ps1,log}`，**该目录按 `.gitignore` 口径不入库**）：
> - **`92ea5d6b`**（T8）——`(e) 行数不一致：app/src/App.tsx 声明 **509** / 实测 **503**`；
> - **`4f8f3d3c`（T9）· `882a61ef`（T8 补强）· `ecc36a8d`（微单元 M-c）· `6b81f414`（T10）**——四处逐字同形：声明 **548** / 实测 **509**，**全落在 `fd83abb4`(T7) 与 `477bf604`(T11) 之间的同一并行窗口**；
> - **`fd83abb4` 其实自洽**（上句把它列进来是错的）；其余 **17 个（含收口提交 `42e88740`）全部 exit 0**。
> ⇒ **口径更正：批 3 实证 = 5 个提交**（不是 3 次），点名 **5 个 sha**；另须注明 **`ecc36a8d` 的门禁读数取自工作树**（该单元报告 §1 的「提交后门禁 exit 0」只在工作树口径成立，它自己的提交树带一处并行窗口不自洽 —— 性质与修法见 `docs/versions/v0.22.md` 批 3 节的「提交树自洽性更正」）。**机理结论不变**（`--write` 按工作树刷新）⇒ 批 8 `--staged` 的**依据比原先更强**（不是 3 次，是 5 个）。
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

> **🔻 收口评审 M-3 加注（2026-09-12）——本条与本节 7 处「仍 47 文件 / 4 包」的判据已被「三件套」取代（原文保留）**：`47 / 4` 是**开工提交点 `85d51d83` 的工具原始读数**（复跑 `node scripts/bundle-eager-graph.mjs` = `首屏静态可达应用源文件：47` / `首屏拉入的 npm 包：4`），**不是**本批任何一步的期望值。本批实测：**工具口径 47 → 67 文件 / 4 → 4 包**；**真实边口径**（TS 编译器 API 剔纯类型边、含 CSS）**36 → 56 文件 / 4 → 4 包**；**Δ 两口径都是 +20，新增集合完全相同**（20 个全是批 3 的 `shell/*` + `ui/icons/*` + `ui/tokens*` + `ui/zIndex` + `utils/kbHits`，**`pages/**` 新增 0 · npm 包新增 0**）。⇒ **判据一律改为三件套：① 工具原始读数（注明口径把 `import type` 也算）② Δ（相对开工提交点）③ 机理核查 —— 永不使用裸绝对数**（见 §收口回写 §二 的「首屏静态可达图（三件套）」）。

> **🔻 下列 7 处「仍 47 文件 / 4 包」的判据已按上注重述（原文保留，逐处点名）**：Task 2 V6 · Task 5（Step 5 预期 + V5）· Task 6（Step 5 预期）· Task 7 V4 · **Task 8 V5（★ 那句 `STOP` 是假规则）** · Task 13 V5。**统一读法**：`47 / 4` = 开工点原始读数（**不是期望值**）；判据 = **三件套（工具读数 + Δ + 机理核查）**，**Δ 增大 ∧ 机理核查通过（`pages/**` 无新增 ∧ npm 包数不增）才继续，Δ 增大 ∧ 机理核查不通过（有 `pages/**` 或 npm 包新进首屏）才 STOP**。批 3 实测 Δ = **+20 文件**（36→56 真实边口径）、**+0 包**、**`pages/**` 新增 0** ⇒ 7 处按裸绝对数写的 STOP 条件**全部为假告警**（它们会对正确实现误报）。

> **🔻 收口评审 M-2 加注（2026-09-12）—— 规格 §10 ↳ 批 3 行的「改动面」两处数字不可追溯（原文保留）**：规格 `…-design.md:560` 写「**改动面 8 个文件族**…+ **4 处页面/组件接线**」，实测（`git diff --name-only 85d51d83^..42e88740 -- app/src app/src-tauri app/index.html app/scripts app/package.json`，剔除 `*.test.*` / `test.mjs`）**生产文件改动面 = 31 个**（`app/src/**` **28** + `app/index.html` + `app/scripts/gen-tokens.mjs` + `app/src-tauri/tauri.conf.json`），接线 **6 处**（`ChatSidebar` / `GoalsPage` / `SettingsPage` / `ClassroomRightPane` / `NoteReadingView` / `NotesReadingColumn`）。⇒ 「8 个文件族」是**计划期陈旧估算**（从下文 Step 5「写清 8 个文件的改动面」逐字搬来），**不是实测**；判据**按实测口径读**。本节及以下 V 表/预期里所有「仍 47 文件 / 4 包」**按此读**，那句 `STOP` 规则也**按 Δ + 机理重述**（`47→48` 这类裸绝对数在 `shell/*` 与 `ui/*` 新模块进首屏后**必然误报**）。
5. **报告必含「你没能验证的地方」**（诚实单列，逐条写清是「仪器不可达」还是「本批未做」）。
6. **提交**：`git diff --stat` 复核只含自己的文件 → 新建文件先 `git add -- <path>` → `git commit --only -m "<msg>" -- <显式路径…>`（subject 人工数到 ≤50）。
7. **冲突即 STOP**：发现两条已批准要求互相排斥，或本计划与实测冲突时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 复现命令 + 代价），一次报控制方裁决**。批 1 有三处、批 2 有两处，**属正常，不是失败**；**不许自行取舍，也不许两条都硬做**。本批已预判两处（A2 的 emoji 存废、A3 的 toast 归宿），遇到新的照此办理。

---

### Task 1: 壳层基线冻结（结构 + 7 处魔数 + CDP 宽度预算 + 八门禁读数）

> **🔻 T14 就地回写注（W23 / W24 / I-3 · 本节的**两条**口径缺陷，2026-09-12 收口时加）**
> **W23 · 宽度探针的两条缺陷**：① Step 4 的全部读数出自**离线复刻页**（`nav-measure3.mjs` 手工拼 HTML，**不加载真实产物**）—— 本节只给**高度**探针写了「T14 须在真实组件复测」，**宽度探针漏了同款声明**；② 探针的 `A_TABS` 顺序（…复习,**体系,目标,AI对话**）与已提交 `navRegistry.ts`（…复习,**AI对话,体系,目标**）**已分叉** ⇒ 总宽对称（`909.99` 仍成立）但**逐项溢出次序会错**。
> ⇒ **T14 的兑现**：① 复用**真 `TopBar` 组件**的探针（顺序由注册表 `map` 决定 ⇒ 不可能分叉）；② 另加**真实产物探针** `tmp/viewport-probe.mjs` 加载 `app/dist`。**两把仪器都跑**，读数见 §收口回写。
> **W24 · 本节无可粘贴 argv / 无代码围栏**（Step 1–7 的命令与 `node -e` 单行散在正文里）⇒ **复现性不足**。**回写口径**：本批之后所有「判据命令」一律给**可粘贴的脚本文件路径**（或带完整参数的单行），不再写「某脚本跑一下」。**同类第 4 处判据缺陷（W29）**：计划 V 表里的 **PowerShell 单行命令在 PS 5.1 下 `SyntaxError`**（嵌套转义被吞）—— T9 实测其 V3 逐字命令**跑不起来**（改用等价 Node 脚本 PASS）。

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

> **🔻 T14 就地回写注（W5 · **第 1 处判据缺陷**，2026-09-12 收口时加）**
> 本节的验收正则含**被转义的 `\|`**（把正则的「或」写成了字面竖线）⇒ **3 种形态只匹配 1 种**。
> **精确后果（评审已修正控制方的初判措辞，控制方接受）**：**不是**「全未迁移也判绿」——全未迁移时**会**红（`App.tsx` 的 `height:56` 在射程内，1 命中）；真实缺口是「**10 处里只有 `App.tsx` 的 `height:56` 在射程内；其余 9 处（`top:56` + 8 处 `calc(100vh - 56px)`）未迁移时恒给 0 ⇒ 判绿**」。
> ⇒ **T3 的结论在正确仪器下仍成立**（评审逐点列名 **10 处消费 / 9 文件**、旧写法残留 **0**），本节判据**已被 T14 的 `tmp/t14-accept/accept3-magic-numbers.mjs` 取代**（剥注释 + 阳性对照取自不可变旧版本 + 阴性对照）。

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
| V6 | `node scripts/bundle-eager-graph.mjs` | 仍 **47 文件 / 4 包**（测试文件不进生产图，`--ed-nav-h` 只是字符串）<br>**🔻 收口评审 M-3 加注（原文保留）**：判据已被**三件套**取代（见 §一 第 4 条后的 M-3 注）⇒ 本条按 **Δ + 机理核查**判（终态 67 文件 / 4 包，Δ +20，`pages/**` 新增 0），**「仍 47」不是期望值**；`--ed-nav-h` 只是字符串 这条机理**不变** |

---

### Task 4: 窗口尺寸（默认 1280×800 / 最小 1024×640）+ 全局 reset + 6px 滚动条

> **🔻 T14 就地回写注（W7 · 「行为中立性」核对程序；W8 · 滚动条互斥；W25 · §10 审查）**
> **W7 —— 本节缺的是「程序」不是「结论」**：Task 4 改了 `index.html`（全局 reset + `::‑webkit‑scrollbar`）与 `tauri.conf.json`，却**没有给出「怎么证明观感没变」的核对程序** ⇒ **补写如下（即 T4 实际做的四步，可复用）**：
> 1. **观测面盘点**：先扫「谁会读这些文件」—— `tmp/t4/test-canary.mjs` 扫 `app/src` 全部 **126 个 `*.test.ts(x)`** ⇒ `index.html` **0 命中**、`scrollbar` **0 命中**、`lang=` **0 命中**；命中对照 `tauri.conf.json` → **2 命中**（`shell/windowSize.test.ts:2,16`）⇒ **既有测试的观测面 = 新守卫自己**，改动不可能被既有断言看见（也就**不可能**靠既有测试证明行为中立）。
> 2. **旧值零残留（带对照）**：用 `git show HEAD:<path>` 作**阳性样本** —— 旧值正则命中 HEAD blob = **true**、新值与新键在 HEAD 上不存在 = **true**、阴性串 = **false**；同一正则在**工作树**上：旧值 **false**、新值 **true**。
> 3. **Δ 归因**：真实构建 + `--no-build` 前后对比 —— 首屏 JS **逐字节不变**（`<style>` 进 CSS 栏，不进 JS 判据），`index.html` **+725 B**（预期）。
> 4. **仪器自证**：`node scripts/check-bundle-budget.mjs --self-test`（14 条）；EOL 保持纯 CRLF（`tauri.conf.json` `crlf=43 / bare_lf=0`）。
> ⇒ **回写口径**：凡「行为中立性」类声明，必须同时给 **① 观测面盘点（带命中/阴性对照）② 旧值零残留（阳性对照来自旧 blob）③ Δ 归因 ④ 仪器自证**，四步缺一即视为未验证。
> **W8（已复核：提交在库）**：Chromium ≥121 起 `* { scrollbar-width: thin }` **压过** `::-webkit-scrollbar`（实测 **10px vs 6px**）⇒ 由 `4c89c687` 删除该行并留解释性注释；`index.html` 现在**只用** `::-webkit-scrollbar`。
> **W25（§10 额外审查必须 durable）**：`tauri.conf.json` 的审查结论（**只含 `app.windows[0]` 的 5 个键；`security`/`bundle` 逐字节未动；无夹带；JSON 与 TS 常量由 `windowSize.test.ts` 4 用例对齐**）此前只留在**不入库**的 `task-4-report.md` ⇒ **T14 已写进 `docs/versions/v0.22.md` 的「批 3 · 壳层落地」节**（durable）。

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
> **🔻 收口评审 M-3 加注（原文保留）**：上句的「仍 47 文件 / 4 包」= **开工点原始读数**、**不是期望值**；判据 = **三件套（Δ + 机理核查）**（见 §一 第 4 条后的 M-3 注）。
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
| V5 | `node scripts/bundle-eager-graph.mjs` | 仍 **47 文件 / 4 包**<br>**🔻 收口评审 M-3 加注（原文保留）**：判据 = **三件套（Δ + 机理核查）**，**「仍 47」不是期望值**（见 §一 第 4 条后的 M-3 注） |
| V6 | `git status --porcelain` | 只含本任务 6 个路径 |

---

### Task 6: 导航注册表 `shell/navRegistry.ts` + 9 页接线 + 可达性探针

> **🔻 T14 就地回写注（W6 · **第 2 处判据缺陷**；W26 · 计划文本落后于实现）**
> **W6 —— 本节 V4 的「47 文件」把 `import type` 算成了静态边**：`bundle-eager-graph.mjs` 用正则 `from "…"` 抽边，**不区分 `import type`**（编译期被完全擦除）。⇒ **判据重定为「三件套」且永不使用裸绝对数**：① 工具原始读数（**注明口径**：把 `import type` 也算）② **Δ（相对开工提交点）** ③ **机理核查**（`pages/**` 新增 0 · npm 包新增 0 · 新进首屏 = []）。**为什么必须这样**：同一个「真实静态可达」被三方测出 **38 / 39 / 49**（T8 评审自测 38/39、T1–T6 评审给 49、工具口径 47→48→57）⇒ **绝对数不可复现**。最干净的第二口径 = **用 TS 编译器 API 剔掉纯类型边**（T10 评审首创，工具 `tmp/review-t10/eager-ts.mjs`）；**修工具会改历史读数 ⇒ 必须新旧口径并列**。
> **T14 终态实测**：工具口径 **47 → 67** · 真实边口径 **36 → 56** ⇒ **两口径 Δ 都是 +20**（新增集合完全相同：`shell/*` 10 + `ui/icons/*` 6 + `ui/tokens{,.gen}` + `ui/zIndex` + `utils/kbHits`），**`pages/**` 新增 0 · npm 包 4 → 4**。
> **W26 —— 本节（与 Verification V1/V4）写的是「`Component` 字段」，实现改成了 `PAGE_COMPONENTS` + `navComponent`**（`task-6-report.md:53/:210` 已披露，控制方**批准**）：**严格更强** —— 保精确 props（联合类型会抹掉各页 props）、**无 `any`**、多两条判据（`App.tsx` 不直连页面模块 · 9 个标识符都取自 `navComponent(key)`）。⇒ 本节文本按实现读。

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
> **🔻 收口评审 M-3 加注（原文保留）**：上句「仍 47 文件 / 4 包」= **开工点原始读数**、**不是期望值**；判据 = **三件套（Δ + 机理核查）**（见 §一 第 4 条后的 M-3 注）。**机理部分保留**：注册表确实只把 `lazy` 搬位置、不增加静态可达（终态实测 `pages/**` 新增 0）。

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

> **🔻 T14 就地回写注（W19 · **第 3 处判据缺陷**；W11/A6；W3；W18；W31）**
> **W19 —— 本节 Step 5 的预期值被实测推翻**：计划写 `a-tabs@1280 ≈ 909.99`（余量 ≈370），**实测 1281.8（−16.8）** —— 那个估数**只数了 8 个 Tab**，漏掉 brand 135.53 + 右侧簇 389.44 + padding/gaps 40 ⇒ **在默认窗宽 1280 上的可见回归，而「1024 无溢出」这条验收反而判绿**。**教训（写进本计划）**：**判据没覆盖的地方，绿灯不是证据**。A7 裁决 **R2** 返工后三档全绿（1024 **+317.89** / 1180 **+137.06** / 1280 **+237.06**，最坏徽标下 +245.89 / +65.06 / +165.06）。
> **W11 / A6 —— 本节 Step 3 第②层「只断言 `title`」的口径不足**：T7 按授权**删除了 `legacyLabel` 列**（计划三处要求删、而成既有测试 `navRegistry.test.ts:41/:50-59` 冻结着该列 ⇒ 计划**自相矛盾第 3 例**；控制方裁定：**删列 + 同提交机械改写冻结镜像**）。删列后**注册表 `label` 成为规范态文字的唯一真源** ⇒ 追加两条判据：① 可见文字 `textContent` 逐字 === `e.label`；② **A2 的 emoji 负判据**（渲染文案与注册表都不含 `\p{Extended_Pictographic}`）；配 **4 个变异体**（改 label / 换序 / 可见文字写错 / label 塞 emoji）。**落地**：`TopBar.test.tsx` + `TopBar.persistent.test.tsx`（后者用**渲染级**判据证明「两个常驻状态件仍在顶栏里」—— 旧的文本匹配在「挪走 `dock-toggle`」时**全绿**）。
> **W3 —— 「课堂助手 → 课堂」是用户可见改名**（不是纯样式）：A2 裁决顺带产生。**产品口径需确认/登记**（已登记为 follow-up）。**另**：本任务**顶栏三处配色确实变了**（边框 → `#EAE7E0`、未选中文字 → `#3A3A36`、选中青绿 → `#1F5FBF`），**T7 报告未登记**（评审点名）⇒ 与本条一并登记为**可感知的观感变化**。
> **W18 / A7 落点（走 R2）**：本节「≥1180 图标+文字」**只适用 8 个域 Tab**；**右侧簇（⌘K / 对话面板 / 齿轮）在 `<1400px` 只有图标 + `title`** —— 这是规格未写明的形态，阈值住在 `BREAKPOINTS.navActionsFull = 1400`（**由 T8 的提交拥有**，跨任务锁序）。**为何 R2 不是偏离规格**：规格 §6.1 的「约 1070px」只有在「右侧簇不带文字」前提下才成立（R2 预测 1073.94，实测 1027.94）。
> **W31 —— `metaKey` 未实现**（Windows 目标 + 顶栏文案已定 `Ctrl+K`），且**「Ctrl+K 真开面板」没有运行期判据**（仓内无测试 import `App`，App 接线只有源码文本判据；真机按 W16 跳过）⇒ **这是未验证项，不许写成已验证**。

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
| V4 | `node scripts/bundle-eager-graph.mjs` | **47 文件 / 4 包**（TopBar 与 CSS 不新增 npm 依赖；若包数涨到 5 ⇒ STOP，说明误装了依赖或误 import 了重模块）<br>**🔻 收口评审 M-3 加注（原文保留）**：**「47」= 开工点原始读数、不是期望值**（该步实测已是 67 / 4）；**STOP 条件重述为「Δ 增大 ∧ 机理核查不通过（有 `pages/**` 或 npm 包新进首屏）才 STOP」** ⇒ 原句「包数涨到 5」判据**保留有效**（终态实测 **4 → 4**、未触发）
| V5 | 八门禁 | 逐条 exit 0；首屏 gzip 记下新值（应 ≤ 92.79 + 8 kB） |
| V6 | `git status --porcelain` | 只含本任务 6 个路径 |

---

### Task 8: 列注册表 `shell/columnRegistry.ts`（13 行规格）+ 阈值改判 + 大纲列接线 + 34px 窄条

> **🔻 T14 就地回写注（W22 · **第 4 处判据缺陷**；W21；A1 分类口径）**
> **W22 —— 本节 Step 4 的字面指令有歧义**：计划逐字写「`onToggleOutline` **改为 `outlineCol.expand()`**」—— **字面照做会把 ✕「收起大纲」也变成 `expand()`**，凭空制造一个新缺陷（评审用变异体实测：照计划字面写 ⇒ 判据当场红）。**实现取 `folded ? expand() : setManualFolded(true)`**（窄条 → 展开、✕ → 手动折叠），**两个控件各自语义正确**，且未折叠态与旧实现逐字一致 ⇒ **控制方认可**。本节文本按此读。
> **W21 —— 规格 §6.2 的 `ColumnSpec` 只写 6 个字段，实现是 7 个**（多 `page: PageKey`，用于 `columnsOf(page)` 与「列不许挂在已删页上」的 ③ 守卫）⇒ 收口时已回写规格 §6.2。
> **A1 的最终分类（本节产生的两处 + 我新发现的一处）**：**已吸收** = 大纲列 `180`（注册表 `notes-outline.default`）+ **M2 断点**（本节完成收口）；**有目标但未吸收** = `KnowledgeDetailPanel:132` 的 **`34`**（Step 5 自带逃生门「允许跳过本步…不许为了做它引入新的 magic number」）⇒ **登记批 4**；**无目标** = `ColumnBar:20` 的 **`26`**（§6.2 通篇不提）与 **新发现** `ColumnResizer:74` 的 **`5`**（既有共享常数，本任务只是把手柄带进大纲列、**未写任何新字面量**）⇒ 登记不碰。**T14 出的最终计数是 8 / 1 / 2，不许压回「7」。**

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
| V5 | `node scripts/bundle-eager-graph.mjs` | **47 文件 / 4 包**（注册表是纯数据模块；**若变 48 ⇒ 说明有页面被静态拉回首屏，STOP**）<br>**🔻 收口评审 M-3 加注（★ 本条是假 STOP 规则，原文保留）**：**「47」= 开工点原始读数**（注册表自己就是新增的 20 个首屏模块之一 ⇒ 本步之后读数**必然** 47→67，裸绝对数判据**必然误报**）。**STOP 条件重述为「Δ 增大 ∧ 机理核查不通过（有 `pages/**` 或 npm 包新进首屏）才 STOP」** ⇒ 终态实测：**Δ +20 文件 / +0 包 · `pages/**` 新增 0**，**未触发**（即原句「变 48 就 STOP」在正确实现下是假告警） |
| V6 | `git status --porcelain` | 只含本任务改动路径 |

---

### Task 9: 未接入三处接入列基础设施（`ChatSidebar` / `GoalsPage` / `SettingsPage`）

> **🔻 T14 就地回写注（W29 · **第 4 处判据缺陷**；W28 的兑现；I-1 的落点）**
> **W29 —— 本节 V3 的逐字命令在 PS 5.1 下 `SyntaxError`（嵌套转义被吞）**：实施者实测**跑不起来**，改用等价 Node 脚本（`legacy380=false / columnSpec(goals-left)=true` PASS）。⇒ **回写口径**：计划里所有「`node -e` / PowerShell 单行 + 嵌套引号」的判据都应改成**可粘贴的脚本文件**（同 W24）。
> **W28 的兑现**：本节 Step 2「`ChatPage` 只加两行」= 主路（页面持 hook + 传 props）⇒ **`ChatPage.tsx` 599/600（余 1 行）**；T9 评审 I-1 之后（裁决 **(e)**）`ChatSidebar` 的 props **收敛为一个 `col?: ColumnLayout` 整对象**、手柄落在**折叠三元之外**，`ChatPage.tsx` **净增 0 行**（599 → 599）。
> **判据现状（已知两处「注释不实」，见 §收口回写 follow-ups）**：`shell/columnConsumption.test.ts:50` 注释自称「旧字面量**只在这一个数组里写一次**，① 与 ② 共用」，实则 ①/② 体内**内联重复**了三条正则（`:60` / `:76` / `:86`），`LEGACY` 数组只被后面的扫描与仪器自检用到 ⇒ **注释不实（评审 M-2）**，**T14 不改测试代码**，登记为 follow-up。

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

> **🔻 T14 就地回写注（W30 · **计划自相矛盾第 6 例**；W31；A3 的落地口径）**
> **W30 —— 本节 Interfaces 与 Step 4 互相排斥**：Interfaces 逐字要 `onPick: (cmd: Command) => void`，而 Step 4 逐字要 `onPick { kind:"page",key }` / `{kind:"dock"}`。**T11 取可执行的 Step 4**（回调按 `kind` 分支），`Command` 类型仍按计划导出 ⇒ T12 的交接面不变。⇒ **本节 Interfaces 那行按 Step 4 读**。
> **Step 1 = 核对不重做**（T7 已按 A3 走法甲落地：fixed 覆盖层 + `role="status"` + `top: calc(var(--ed-nav-h) + 8px)`；`TopBar.test.tsx` 已把该形态钉住）⇒ 重做会撞红既有断言。**本节 Step 1 的代码示例应按「核对并登记」读。**
> **`dock-toggle` 保留在顶栏**（T11-b 裁决）：命令面板里的 dock 命令是**增量**，不得移除顶栏那条已提交的守卫。
> **V5 换口径**：本节 V5 的「≤ **92.79** + 12 kB」里，`92.79` 是**批 2 收口值**、批 3 已在其上加了 T2–T6 ⇒ 判据改为「**收口当次实测 + ≤12 kB 增量**」（T11 实测：当次 **95.89 kB** + 同树 A/B 净增 **+0.76 kB**）。
> **W31 —— `metaKey` 未实现**（见 Task 7 的同款注）；**V2 的 `bareZ` 只扫 `CommandPalette.tsx`** ✓（`App.tsx` 里对话面板的裸 `900` 是**既有**冻结项，**不许顺手改**，已登记批 4）。

> **本任务是「1024 无溢出」的第二半**，也是**唯一需要 A3 裁决才能定形**的任务。规格 §6.1「⌘K 命令入口用来替代现在手写的 9 个 `focus*` 参数跳转，数据源接 `kb_search`」；§6.1 的顶栏清单**没有 toast**。

**Files:**
- Create: `app/src/shell/CommandPalette.tsx`（≤220 行）
  > **🔻 收口评审 M-8 就地加注（2026-09-12，原文保留）**：T11 交付时 **179/220**，**T12 追加「取数 / 降级 / skipped」三条渲染 +40 行 ⇒ 收口实测 `219/220`（余 1 行）**（口径 = `scripts/line-limits.mjs` 的 `countLines()`）。**仍 ≤300 硬限、无需豁免登记**，但**下一个动它的单元（批 4 的 `Modal` 迁移必动它）会立刻撞预算** ⇒ 控制方建议：**批 4 迁移时把预算提升到 ≤260，或先抽出 `CommandList` 子组件**（二选一，由批 4 计划裁决）。已同步登记进 `docs/versions/v0.22.md` 批 3 节的「贴边文件」表。
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

> **🔻 T14 就地回写注（T12 评审 I-1/I-2 的**精确语义**，2026-09-12 收口时加）**
> 上面那句「**页面命令恒在最前**」**已被实现改写为第三种语义**（控制方裁决 **B**，落地于 `2b426236`）：
> **`filterCommands(…, hits.length ? "" : query)`** —— **有检索命中时页面命令恒在（9 条全在）**；**零命中时页面命令按查询词过滤并显示空态**。
> **为什么不是字面照做**：T12 评审实测「去掉过滤」与 **T11 已提交、禁止修改的 3 条断言**正面冲突；而「永远列出 9 条页面命令」会让「没有匹配的命令」变成**假陈述**。⇒ **本节按 B 的语义读**，并且 `CommandPalette.tsx` 的头注释已如实改写（**含「此前那句属不实承诺」**）。
> **另两条同任务的口径更正**：① **`Limit` 上界不是自引用的** —— `kbCommands.test.ts` 曾用模块自己导出的 `KB_SEARCH_MAX_LIMIT` 作右值（**永真断言**），现已锚死字面量 `50` / `10`（实核 Rust `kb_search.rs:23-24`）；② **「Rust 侧 clamp 同口径」注释原为不实** —— Rust **命令层只夹上界**、**引擎层 `kb_search.rs:107` 有 `.clamp(1,50)`** ⇒ 有效区间同为 `[1,50]`，只是不在同一处 clamp。

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
| V5 | `node scripts/bundle-eager-graph.mjs` | 仍 **47 文件 / 4 包**<br>**🔻 收口评审 M-3 加注（原文保留）**：判据 = **三件套（Δ + 机理核查）**，**「仍 47」不是期望值**（见 §一 第 4 条后的 M-3 注） |

---

### Task 14: 验收测量 + 收口（三条验收的机器判据 + 八门禁 + 规格 §10 回写 + 台账 + follow-ups）

> **🔻 T14 执行时就地回写注（2026-09-12）—— 本节的三处口径更正，实测所得**
> **① Step 2 的探针路径走不通（**第 7 处判据缺陷**）**：本节逐字让 `viewport-probe.mjs` 用 CDP 打开 `file:///…/app/dist/index.html` —— **实测 `#root` 子节点 = 0**（页面一片空白）。根因：vite 产物 `index.html` 用**绝对路径** `/assets/index-*.js` + `crossorigin`（Tauri 的 `WebviewUrl::App("index.html")` 从应用协议根提供，**绝对路径是对的**）⇒ `file://` 下解析成 `file:///assets/…`（不存在）。
> ⇒ **正解 = 把 `app/dist` 用本地只读静态服务器提供**（探针 `--mode http`，绑 `127.0.0.1`、结束即关）。**`--mode file` 的失败读数保留在 `tmp/acceptance.md` 用于复现，不得用作结论。**
> **② Step 8 写「A1–A5 五处裁决」，实为 A1–A7（T14-b）**：**A6** = 删 `legacyLabel` 列的授权（+ 同提交机械改写冻结镜像）；**A7** = 顶栏 ≥1180 回归与 **R2 返工**。⇒ §收口回写按 **A1–A7 七处**给「裁决 → 实际做法 → 证据」。
> **③ V6 期望「12–15 个原子提交」，实数 22（T14-d）**：**报实数并说明构成，不为落进区间而合并提交**（与「每个提交都绿」冲突时后者优先）。构成：1 计划 + 13 实现任务（T2–T13，其中 T8 与 T4 各两次）+ 1 微单元 + 3 评审修复单元 + 1 收口 = **22**（`85d51d83^..` 至收口提交，含左端点）。
> **④ 本节 Step 5/6 引用的首屏基线「92.79 kB」= 批 2 收口值**（T14-c）：终值必须是**收口当次真实构建**的读数并写明 `dist` 出处 —— 本批沿途出现过 **3 个不同时刻的 `dist`**（12:37:56 / 12:56:20 / 13:15:48），不写出处就会把别人更早的构建误当自己的 Δ。**T14 实测终值：97.16 kB（`dist` mtime 2026-09-12 14:06:11，由本次真实构建产出）**。
> **⑤ Step 4 的 vitest 判据「≥1256」已被评审 I-1 证伪**（1256 是 T6 之后读数，真基线 **125 文件 / 1233 用例**）⇒ 改为**两条**：① **既有 1233 条逐文件一条不许少** ② 新增只增不减。**T14 实测**：125 个既有文件用例数**一模一样**、0 消失、0 减少；+18 新文件 / +137 用例 ⇒ 143 文件 / 1370 用例。
> **⑥ Step 4 的 `cargo` 若撞上负载敏感用例**（`ffmpeg::tests::run_captured_handles_large_output`）⇒ **两种读数都报**（含重跑）；T14 本次未撞（9.26s 一次过）。
> **⑦ V1 的壳层守卫清单已扩充**：除本节列的 11 个文件外，另有 `CommandPalette.{test,kb.test,followups.test}.tsx` · `kbCommands.test.ts` · `useKbPaletteSearch.test.tsx` · `TopBar.persistent.test.tsx` · `navHeight.consumption.test.ts` · `columnConsumption.test.ts` · `ShellFallback.test.tsx` · `columnRegistry.test.ts`（T8 补强）· `GoalsPage.test.tsx` · `ChatSidebar.test.tsx` · `ClassroomRightPane.test.tsx` · `NotesReadingColumn.outline.test.tsx`。

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

## 收口回写（Task 14，2026-09-12 —— 批 3 终态 · 验收读数 · 给批 4+ 的输入）

> 本节由**收口单元**在 Task 14 追加。上文一律**保留不改**，本节只做**终态读数**与**归账**。
> **批 4 的计划者：你需要的迁移点清单就是本节 §批 4 的迁移点。**
> **读数出处（本批硬纪律，因为沿途出现过 3 个不同时刻的 `dist`：12:37:56 / 12:56:20 / 13:15:48）**：
> `HEAD = d9d0dfc0de75e914248de7bb35b8a754da7067aa` · **干净树**（`git status --porcelain` 仅 `?? docs/tech-debt/`）· `app/dist` **mtime 2026-09-12 14:06:11**，入口 chunk `index-Cf249NJv.js`（99,860 B），**由本节的真实构建产出**（`node scripts/check-bundle-budget.mjs`，非 `--no-build`）· 全部读数采集于 **2026-09-12 14:06–14:12**。

### 一、三条验收的判据与读数

| # | 验收（规格 §10 批 3 行逐字） | 机器判据（命令） | 读数 | 判定 |
|---|---|---|---|---|
| ① | **9 页全走注册表** | `cd app; npx vitest run src/shell/navRegistry.test.ts`（**12 用例**）+ `node tmp/t14-accept/accept1-key-wiring.mjs`（**非同源反向证据**） | 12/12 绿 · 探针 **PASS（exit 0）**：9 个 key 全部 `page === "<key>"` + `navComponent("<key>")`；`App.tsx` 的 `page ===` 字面量集合与注册表键集**双向相等**（两向差集均为空） | ✅ |
| ① 仪器自检 | 阴性样本 | 同一条判据对 `"not-a-page"` | **MISS** ✅（且探针自带抽取器阳性/阴性合成样本对照） | ✅ |
| ② | **1024 无溢出**（限定：**常态；toast 已不在导航行**） | `node tmp/t7-acceptance/nav-width-t7.mjs --widths 1024,1180,1280`（**48 行** = 2 树 × 3 档 × **3 toast 态** × 2 徽标）+ 加跑 `--widths …,1440`（**64 行**，覆盖 `navActionsFull=1400`） | **AFTER_OVERFLOWS = 0 · SELFTEST_PROBLEMS = 0 · BEFORE_OVERFLOWS = 21**（1440 版：0 / 0 / 26）⇒ **红得起来**。逐档余量（after，含徽标）：**1024 +317.89**（最坏徽标 **+245.89**）· **1180 +137.06**（最坏 **+65.06**）· **1280 +237.06**（最坏 **+165.06**）· **1440 +237.2**（最坏 +165.2） | ✅ |
| ② | 同上（**真实产物**） | `node tmp/viewport-probe.mjs --width {1024,1180,1280} --entry app/dist/index.html --mode http` | 三档 **problems = 0**：判据②顶栏自然宽 ≤ 可用宽 **true**（1024 **613.53/1024** 余 410.47 · 1180/1280 **950.36**，余 229.64 / 329.64）· 判据③无 Tab 越界 **true** · 判据①整页无横向滚动 **true（参考项）** · 仪器自检：视口/dpr/固定块 500/哨兵 90/阳性对照 1 全过 | ✅ |
| ② | **A4 的硬要求**（T7 未记录，**T14 补测**） | 同上探针的纵向读数 | 1024/1180/1280 三档一致：**顶栏高 56 · clientHeight 55 · 最高子项 38 · 上下 padding 0 · 纵向溢出 false** ⇒ **余量 17 px，`--nav-h = 56` 够用**（与简报的推算一致，现在是**实测**） | ✅ |
| ③ | **「7 处魔数归零」** | `node tmp/t14-accept/accept3-magic-numbers.mjs`（剥注释口径 + **阳性对照取自不可变提交 `a7bd1899`** + 阴性对照） | **PASS（exit 0）**：**已吸收 8** · **有目标未吸收 1** · **无目标 2**（表见下） | ✅（**按判据，不按「7」**） |

### 二、八门禁终态表（逐条命令 + exit code + 读数）

| # | 命令 | exit | 读数 |
|---|---|---|---|
| 1 | `node scripts/line-limits.mjs --full` | **0** | `>600` **0** · 301–600 档 **123** · 登记条目 **123**；`--write` 复跑 **零 diff**（豁免表**不在**本次提交路径里） |
| 2 | `node scripts/docs-check.mjs` | **0** | 扫描 274 个 Markdown（检查 174），5 项全 ✅ |
| 3 | `node scripts/check-command-registry.mjs` | **0** | 定义 **312** / 注册 **312** / 重复 **0** |
| 4 | `cd app; npx tsc --noEmit` | **0** | **0 错**（输出文件 0 字节）。⚠️ **必须单独跑**:vitest 不暴露 TS6133/TS2873 |
| 5 | `cd app; npx vitest run` | **0** | **143 文件 / 1370 用例 / 0 失败**（40.32s）· **既有 1233 条：125 个文件逐文件用例数一模一样、0 消失、0 减少**；+18 新文件 / +137 用例 |
| 6 | `cd app/src-tauri; cargo test --test app_lib_tests` | **0** | **2300 passed / 0 failed / 6 ignored**（9.26s）—— **逐字持平**，本批零 Rust 改动；未撞负载敏感用例（两种读数无需并列） |
| 7 | `node scripts/check-bundle-budget.mjs`（**真实构建**） | **0** | 首屏 **97.16 kB**（原始 309,524 B / gzip 97,155 B）· 预算 200 kB · **余量 102.85 kB**；懒 21 个 574.71 kB 不计入；**CSS 3 个 52.27 kB 原始 / 12.58 kB gzip **不计入判据**，只报告**；766 modules；无 `Circular chunk` |
| 8 | `cd app/src-tauri; cargo clippy --all-targets` + `clippy-set.mjs` | **0** | **唯一位置集合 20 = 基线，`SET-IDENTICAL`**（`onlyInBaseline=0 / onlyInFinal=0`）。**两种口径都记**：汇总行 = lib 15 / lib test 19（15 重复）/ app_lib_tests 19（19 重复）；批 2 台账的「19」是**汇总行口径** |

**首屏账（批 3 起点 = 批 2 收口值）**：**92,789 → 97,155 B = 92.79 → 97.16 kB（Δ+4,366 B = +4.37 kB，+4.7%）**；入口 chunk **87,573 → 99,860 B**；`index.html` **655 → 1,558 B**；懒 chunk **22 → 21 个**。

**首屏静态可达图（三件套，**永不使用裸绝对数**）**：工具口径（把 `import type` 也算边）**47 → 67 文件 / 4 → 4 包**；**真实边口径**（TS 编译器 API 剔纯类型）**36 → 56 文件**；**Δ 两口径都是 +20，新增集合完全相同** ⇒ 机理：新增 20 个全是批 3 的壳层/ui 模块，**`pages/**` 新增 0 · npm 包 4 → 4 ⇒ 没有任何页面被静态拉回首屏**。

**逐任务 vitest 读数轨迹（T14-a 的「既有 1233 一条不许少」用逐文件比，不用总数）**：`a7bd1899` **125/1233**（真基线）→ T2 125/1233 → T3 **125/1236** → T4 127/1240 → T5 **128/1244** → T6 **129/1256** → T7 **132/1289** → T8 **131/1272→1330**（两次提交）→ T9 **135/1303** → T10 **136/1312** → T11 **138/1338** → T12 **140/1359** → T13 **141/1364** → T12-followups **143/1370** → **终态 143/1370**。（沿途数字取自各任务报告；**判据本身是终态与基线树的逐文件比对**，见 `tmp/acceptance.md`。）

### 三、魔数 before/after 表（`node tmp/t14-accept/accept3-magic-numbers.mjs`，剥注释口径）

| # | 魔数 | 今日落点 | before → after（剥注释） | 分类 | 判据 |
|---|---|---|---|---|---|
| M1 | 导航高 `56` | `App.tsx` + `AiConversationDock` + 8 个页面（**10 处 / 9 文件**） | **10 → 0** | ✅ **已吸收**（T2 token + T3 消费） | `shell/navHeight.consumption.test.ts`（3 用例，逐文件判 token 消费）+ `ui/zIndex.guard.test.ts` 冻结镜像同提交改写 |
| M2 | 断点阈值 | 4 页面 + hook（**6 处**） | **6 → 0** | ✅ **已吸收**（T5 单一真源 + T8 注册表） | `shell/breakpoints.test.ts`（5 用例，含 `navActionsFull` 逐字 1400）+ `columnRegistry.test.ts` ④ 行↔档位映射 |
| M3 | `ChatSidebar` 240 | `components/ChatSidebar.tsx` | **1 → 0** | ✅ **已吸收**（T9 → 注册表 260） | `shell/columnConsumption.test.ts` ①（剥注释判据 + 原始文本第二仪器） |
| M4 | `GoalsPage` 380 | `pages/GoalsPage.tsx` | **1 → 0** | ✅ **已吸收**（T9 → 注册表 320） | `columnConsumption.test.ts` ② + `pages/GoalsPage.test.tsx` |
| M5 | `SettingsPage` 720 | `pages/SettingsPage.tsx` | **1 → 0** | ✅ **已吸收**（T9 → 860 + 居中） | `columnConsumption.test.ts` ③ + ④ 反向判据 |
| M6 | 课堂右栏 `640` | `components/ClassroomRightPane.tsx` | **3 → 0** | ✅ **已吸收**（T10 统一 wrapper） | `components/ClassroomRightPane.test.tsx`（9 用例，值必须来自 `PANE_BODY_MAX`／注册表） |
| M7 | 窗口 `960×720` | `app/src-tauri/tauri.conf.json` | 旧值 0 残留（新 4 键就位） | ✅ **已吸收**（T4 → 1280×800 / 最小 1024×640） | `shell/windowSize.test.ts`（4 用例，JSON 与常量逐字一致） |
| A1-a | 大纲列 `180`（写死） | `components/NoteReadingView.tsx` | **1 → 0** | ✅ **已吸收**（T8 → 注册表 `notes-outline.default`） | `NotesReadingColumn.outline.test.tsx`（6 用例） |
| A1-b | 详情列折叠窄条 `34` | `components/KnowledgeDetailPanel.tsx` | **1 → 1** | ⛔ **有目标未吸收**（登记 **批 4**） | 无 —— `ColumnSpec` 无「折叠窄条宽」概念；取 `.min`(260) 会把 34 px 变 260 px（可见回归） |
| A1-c | 折叠窄条约 `26` | `components/ColumnBar.tsx` | **1 → 1** | ⛔ **无目标**（登记不碰） | 无 —— 规格 §6.2 通篇不提 `ColumnBar`（唯一出处是审计 J1-9/P3） |
| A1-d | 拖拽手柄宽 `5` | `components/ColumnResizer.tsx` | **1 → 1** | ⛔ **无目标**（既有共享常数，登记不碰） | 无 —— §6.2 无此数目标；T8 只是把手柄带进大纲列，**未写任何新字面量** |

> **合计：已吸收 8 · 有目标未吸收 1 · 无目标 2 = 11 个语义位点**。**「7」是一个从未被定义的数**（A1），**本节不压回 7**。
> 仪器：**剥注释**（块注释 + 整行 `//`；行尾 `//` 与字符串字面量**不剥** —— T10-M-1 的已知边界）；**阳性对照来自不可变提交 `a7bd1899` 的 git 对象**（不是同一个已改好的文件）；阴性对照 = 无意义模式 0 命中。

### 四、A1–A7 七处裁决的实际结果（**T14-b 更正：计划 Step 8 写「A1–A5」，实为七处**）

| 裁决 | 内容 | 实际做法 | 证据 |
|---|---|---|---|
| **A1** | 「7 处魔数」的点名口径 —— **不迁就数字，定义判据** | 判据取「能否被单一真源吸收」；M1–M7 **全做**；`180` 一并吸收；`34`/`26`/`5` 登记 | 本节 §三 + 规格 §10 批 3 行 |
| **A2** | ≥1180 档文字形态 = **线性图标 + 纯文字（emoji 出局）** | `TopBar` 渲染 **2 元素**；9 个目的地全部有自绘图标；emoji **计数 9 → 0** | `TopBar.test.tsx`（渲染文案 + 注册表双口径 emoji 负判据，带阳性对照）+ 变异体 m4（塞 emoji ⇒ 3 红） |
| **A3** | AI toast 归宿 —— **移入 fixed 覆盖层**，与 T11 合并为一次提交，**只能自足实现**，**验收必须含 toast 可见态** | toast 落在 `MainShell` 最外层（`</main>` 之后、**nav 之外**），`position: fixed` + `calc(var(--ed-nav-h) + 8px)` + `zIndex("toast")`；**T7 与 T11 未产生「两个常驻状态同时消失」的中间提交**；48 行读数**含 toast 三态** | `TopBar.test.tsx` 四条声明 + 两条负判据；探针 `TOAST_PRESENT`/`TOAST_PRESENT_TEXTUAL`/`TOAST_IS_NAV_CHILD`/`TOAST_COVER`/`ROOT_SCROLL_W` 全接进 `problems` |
| **A4** | 1024 下 `--nav-h` 的值 —— **只搬变量、值保持 56，并要求 T7 实测内容高** | 只把 `56` 搬进 token 生成器；**T7 未记录内容高 ⇒ T14 补测**：三档 **顶栏高 56 / clientH 55 / 最高子项 38 / 纵向溢出 false（余 17 px）** | 本节 §一 的 A4 行（真实产物探针） |
| **A5** | 列契约执行器归属 —— **(a) 注册表委派给 `useColumnLayout`**，不取代 | 注册表持**规格**、hook 仍**执行**（`useColumnLayout.ts` **零改动**）；选项 (b) 登记为日后合并方向，**且不得声称能力对等** | `columnRegistry.ts` + 7 处旧调用点/4 处新接入全部 `columnSpec(<key>)`；规格 §10 `↳ 批 3 的收口` 行 |
| **A6** | T7 撞上「计划 Files 删列 vs 既有测试读列」⇒ **批准删 `legacyLabel` + 同提交机械改写冻结镜像** | **删列**（计划本意）；`navRegistry.test.ts` 同提交改写（`FROZEN_TOP_BAR` 换纯文字）；**追加两条牙齿**：可见文字 `textContent` 逐字 === `e.label`、**A2 的 emoji 负判据**；**4 个变异体**全红 | `fd83abb4` 的 6 路径；变异体 m3（可见文字写 key ⇒ 红）、m4（emoji ⇒ 3 红） |
| **A7** | A′ 顶栏在 ≥1180 放不下、**在默认窗宽 1280 上回归** ⇒ **打回 T7 走 R2** | 走 **R2**：Tab padding `8/16 → 8/12`、tabs gap `4→2`、right gap `8→4`、**右簇 `<1400` 只显示图标 + `title`**（**独立修饰类**，不与域 Tab 共用隐藏规则）；**R1 未启用** | 三档 × 两态 × 徽标两变体 **12 行全 OK**（改前 9/12 溢出）；`BREAKPOINTS.navActionsFull = 1400`；`TopBar.test.tsx` ③ 静态判据 + 变异体 m5（两类混用类名 ⇒ 红） |

### 五、W 表逐条落地清单（§七 W1–W31；**未复核的三条已先复核再回写**）

| # | 落到哪里 |
|---|---|
| W1 | **规格 §10 批 3 行**（验收词改为判据 + 实测计数）+ **本计划 Goal 注①** + 本节 §三 |
| W2 | **规格 §10 批 3 行**（加限定词「常态」）+ 本计划 **Goal 注②** |
| W3 | 本计划 **Task 7 注**（用户可见改名 + 三处配色变化登记）+ **v0.22 诚实代价** + follow-up #12 |
| W4 | 本计划 **Task 7 注 / A4** + 本节 §四 A4 行（**T14 补测**） |
| W5 | 本计划 **Task 3 注**（措辞按评审修正版） |
| W6 | 本计划 **Task 6 注** + 本节 §二 eager 三件套 |
| W7 | 本计划 **Task 4 注**（补**四步核对程序**） |
| W8 | 本计划 **Task 4 注**（滚动条互斥，提交 `4c89c687` 在库） |
| W9 | 本计划 **Goal 注③**（两处计数错误） |
| W10 | **规格 §2 回写块**（D1/D2/D4/D5/D7）+ **§6.1 / §6.2 回写块**（D3/D6） |
| W11 | 本计划 **Task 7 注**（A6 的两条追加牙齿 + 4 变异体） |
| W12 | **`$env:TEMP` profile 纪律已写进** `.superpowers/sdd/DISPATCH-TEMPLATE.md` §二（**该文件 gitignored，不入库**）+ T14 **实删 26 个 profile 目录 / 6,715 文件 / 322.2 MB**（见 follow-up #13） |
| W13 | 已在 `DISPATCH-TEMPLATE.md` §二（本轮复核：**在位**） |
| W14 | **已复核并修正**：`app/README.md` 由脚手架标题改为本仓说明（**未复核项先复核再回写**的兑现）—— 该文件**进了本次提交路径** |
| W15 | **已复核并统一**：`92.80` 是 **T3 引入的漂移值**（T3 报告 §6-D2：+11 B gzip），**不是**批 3 基线；**批 3 起点以 `check-bundle-budget.mjs` 实测的批 2 收口值 92.79 kB 为准**，终值 97.16 kB。本节 §二 首屏账 |
| W16 | 本节 **§六 未验证** 第 1 条（真机/WebView2 跳过；**全文无「已在真机确认」类表述**） |
| W17 | 本计划 **Task 8 注** + 规格 §10 `↳ 批 3 的收口` 行（登记，**不声称能力对等**） |
| W18 | **规格 §6.1 回写块 ②** + 本计划 **Task 7 注**（R2 落点） |
| W19 | 本计划 **Task 7 注**（第 3 处判据缺陷 + 「判据没覆盖的地方绿灯不是证据」） |
| W20 | **规格 §6.1 回写块 ①**（两个估数各自的前提与实测） |
| W21 | **规格 §6.2 回写块 ①**（7 字段）+ 本计划 Task 8 注 |
| W22 | **规格 §6.2 回写块 ③** + 本计划 **Task 8 注** |
| W23 | 本计划 **Task 1 注** + 本节 §一 验收②（两把仪器都跑、真 `TopBar` 顺序） |
| W24 | 本计划 **Task 1 注**（判据命令一律给可粘贴脚本）+ **Task 9 注（W29 同源）** |
| W25 | **`docs/versions/v0.22.md` 的「批 3 · 壳层落地」节**（durable §10 审查记录）+ 本计划 Task 4 注 |
| W26 | 本计划 **Task 6 注**（`PAGE_COMPONENTS` + `navComponent` 取代 `Component`） |
| W27 | 本计划 **Global Constraints 注** + follow-up #1（归批 8） |
| W28 | 本计划 **Global Constraints 注** + **Task 9 注** |
| W29 | 本计划 **Task 1 注 / Task 9 注**（PS 5.1 单行 `SyntaxError`） |
| W30 | 本计划 **Task 11 注** |
| W31 | 本计划 **Task 7 / Task 11 注** + 本节 §六 未验证 第 3 条 |

> **另落两处计划没登记、T14 复核出来的**：**W3 附带**「顶栏三处配色确实变了」（评审点名 T7 未登记）· **ADR-034 未写**（规格 §14 的「顺延至批 3」未兑现，已就地登记并给出建议归属）。

### 六、未验证（诚实单列，**不许含糊**）

1. **真机 / Tauri WebView2**：`tauri.conf.json` 的 1280×800 与最小 1024×640 在**真实窗口**里的表现**一次未跑**；顶栏像素证据来自 **headless Edge（Chromium）**，**不是 WebView2**（字体回退与窗口装饰可能不同）。**用户已裁决本批跳过真机冒烟 ⇒ 不得出现「已在真机确认」类表述**（登记批 8）。
2. **`file://` / `http://127.0.0.1` 下无 `window.__TAURI__`** ⇒ 各页 IPC 全失败、渲染成错误态 ⇒ 真实产物探针的**判据①（整页无横向滚动）只是参考项**；**判据②③（顶栏自身，零 IPC）才是本验收的判据**。
3. **`Ctrl+K` 真开面板没有运行期判据**（仓内无测试 import `App`；App 接线只有源码文本判据；真机跳过）· **`metaKey`（⌘K）未实现**（Windows 目标 + 文案已定，属明示取舍）。
4. **`ClassroomPage` 零自动化覆盖**（T10 自陈）⇒ `ClassroomRightPane` 的「整栏 vs ≤860」在**采集态**的差异只有源码级证据；像素归探针（已做），真机归批 8。
5. **`SettingsPage` 的 15 个重面板无渲染级测试**（T9 自陈）。
6. **`App.tsx`（574 行）无渲染级测试面**（T13 自陈）⇒ 四处错误边界接线的证据是**源码结构尺 + 叶级行为复刻**，不是 `App` 真渲染。
7. **两个测试文件超计划预算**（D-1，控制方已裁定接受并回写预算）：`ShellFallback.test.tsx` **163**（≤120）· `ClassroomRightPane.test.tsx` **138**（≤120）；同类另有 `TopBar.css` **142**、`columnConsumption.test.ts` **126**。**四者均 ≤300 硬限、无需豁免登记、`--write` 零变化**。
8. **`KnowledgeGraphView.test.tsx` 的 flake 仍在**（既有，非本批引入；两种读数已记）。
9. **首屏可达的绝对数不可复现**（38/39/49/47/67 五种读数）⇒ 本节只用 **Δ + 机理**三件套。
10. **`bundle-eager-graph.mjs` 的 `import type` 缺陷未修**（修它会改历史读数 ⇒ 必须新旧口径并列）⇒ 登记 follow-up #2。
11. **`ChatPage.tsx` 599/600（余 1 行）· `NotesPage.tsx` 300/300（余 0）** ⇒ 下一个动它们的任务**必须先拆件**。
    > **🔻 收口评审 M-8 就地加注（2026-09-12，原文保留）**：本条的**硬限贴边**只列了两个（`ChatPage` 余 1 / `NotesPage` 余 0）。**按「任务预算贴边」口径还须加第三个：`app/src/shell/CommandPalette.tsx` 219/220（余 1 行，硬限 ≤300 不贴边，但任务预算贴边）** —— 批 4 的 `Modal` 迁移必动它 ⇒ 同列登记（见 Task 11 Files 行的 M-8 注与 `docs/versions/v0.22.md` 的「贴边文件」表）。
12. **本批的七处控制方裁决（A1–A7）散在 gitignored 的批次台账里**，`ADR-034` 未写 ⇒ 决策缺 durable 载体（见 §七 #17）。

### 七、follow-ups（逐条具名归属）

| # | 项 | 归属 |
|---|---|---|
| 1 | **W27**：`.husky/pre-commit` 跑**全树** `line-limits --full`、`--write` 按**工作树**刷新 ⇒ 并行提交**必然**产生「提交树不自洽」窗口（批 3 实证 **3 次**）⇒ 建议加 **`--staged`** 模式（或规定登记表刷新只由批次最后一个提交做） | **批 8** |

> **🔻 收口评审 I-1 加注（2026-09-12，**上表原文保留**）——本行「实证 **3 次**」应为 **5 个提交**，且 `fd83abb4` 自洽**：22 棵提交树逐一导出重跑（方法与落盘证据同 §一 W27 注）实测 **5 个 exit 1** = `92ea5d6b`（509/503）+ `4f8f3d3c` · `882a61ef` · `ecc36a8d` · `6b81f414`（548/509，同一并行窗口）；**`fd83abb4` 自洽**（原句把它算进来是错的）；其余 **17 个（含 `42e88740`）exit 0**。⇒ **本 follow-up 的依据按 5 个读**（`--staged` 的收益比原先记的更大）；`ecc36a8d` 另须注明**其门禁读数取自工作树**。
| 2 | **`bundle-eager-graph.mjs` 把 `import type` 计成静态边**（11 个假阳性文件）⇒ 修工具；**改它会改历史读数 ⇒ 必须新旧口径并列** | **批 4 或独立小单元** |
| 3 | **`T5` 无变异体证明**（阈值正确性已由评审独立复核 ⇒ 不返工） | **批 4 计划模板强制「新判据必带变异体」** |
| 4 | `docs/tech-debt/`（1555 行审查文档）**仍未跟踪**（`docs-check` 已用「故意不写链接」规避断链） | **待用户裁决** |
| 5 | **`KnowledgeGraphView.test.tsx` 的既有负载 flake** | **批 8 或测试治理单元** |
| 6 | `app/src/shell/columnRegistry.ts:44` 的注释「（**T10 消费**）」**已过时**（T10 按 T10-b 裁定**没有**消费 `classroom-right`，它用的是 `settings-main` 的 `.default`）⇒ **标签不许说谎** | **微单元**（T14 **不改生产代码**） |
| 7 | `app/src/shell/columnConsumption.test.ts:43-55` 的注释**不实**（自称「旧字面量只在一个数组里写一次，① 与 ② 共用」，实则 ①/② 体内内联重复三条正则） | **微单元** |
| 8 | **真机 1024×640 / WebView2 验收**（人工） | **批 8** |
| 9 | **命令面板迁移到 `Modal` 原语**（本批自带遮罩/Esc/焦点实现）· **`ShellFallback` → `Loading`/`StatusLine`** · **AI toast → `Toast`** · **`App.tsx` 对话面板裸 `zIndex: 900`** | **批 4** |
| 10 | **`focus*` 状态机的收敛**（本批只做入口收敛，10 个字段一个未删） | **批 5** |
| 11 | **列折叠的连续运动（Flip）** · **相变两态（§6.3）** · **`pinnable` 定值** | **批 6** |
| 12 | **产品口径**：「课堂助手 → 课堂」是**用户可见改名**（需确认/登记）；顶栏三处配色变化（`#EAE7E0` / `#3A3A36` / `#1F5FBF`）需一并登记 | **产品文档 pass（批 8）** |
| 13 | **Edge profile 清理**：T14 已删 **26 个**（`tmp/edge-probe/profile-*` 25 个 + `tmp/t7/gen/profile-*` 1 个）= **6,715 文件 / 322.2 MB**；**另有 8 个同类目录在 `tmp/t4/profile-layout-*`（4,314 文件 / 241.8 MB）不在派发书点名的两类里，按要求未动** ⇒ 建议一并清理 | **控制方点名后清理** |
| 14 | **`ecc36a8d` 的 subject = 53 字符**（超 `≤50` 约定，`commitlint` 沿用 100 未拦）⇒ 建议 `header-max-length: [2,'always',50]` | **批 8** |
| 15 | 规格 §6.2「本次改动」列里的 **`会话·详情头改粘性`** 与 **`笔记·工具栏三层合并为单行`** 批 3 **未做** | **需裁决（批 4/批 5）** |
| 16 | **3 套 markdown 渲染器归一**（批 4 裁决 B8：不并入批 4） | **批 5 或批 7** |
| 17 | **`ADR-034`（壳层）未写** —— 规格 §14 的「顺延至批 3」未兑现；A1–A7 七处裁决只有 gitignored 台账 | **批 4 开工前 或 批 8（需裁决）** |
| 18 | **`scripts/**/*.mjs` 与 `app/vite.config.ts` 不在 `line-limits` 扫描域** · `check-bundle-budget.mjs` 未接 CI/pre-commit | **批 8** |
| 19 | **汇总行 / 集合两种 clippy 口径**已写进本节 §二（判据 = 集合 20） | 承批 2，已结清 |

### 八、批 4 的迁移点（本节承诺的清单）

`app/src/shell/CommandPalette.tsx`（遮罩 / Esc / 焦点 → `Modal`）· `app/src/shell/ShellFallback.tsx`（→ `Loading` / `StatusLine`）· `App.tsx` 的 **AI toast**（→ `Toast` + 位置槽）· `App.tsx` 对话面板的**裸 `zIndex: 900`**（→ `panel` 档）· `KnowledgeDetailPanel` 的 **34px 折叠窄条**（与统一列头 / `ColumnBar` 收敛一起做）· `ColumnBar` 的 `26` 与 `ColumnResizer` 的 `5`（同批收进注册表）· `ChatPage.tsx`（**599/600，先拆件再迁移**）· `NotesPage.tsx`（**300/300，先拆件**）。

### 九、与计划的偏差（本节自陈）

1. **第一节的两处命令未能按计划逐字执行**：Step 2 的 `file://` 探针路径**走不通**（实测 `#root` = 0）⇒ 改用本地静态服务器（`--mode http`）；失败读数保留复现。**这是本批第 7 处判据缺陷**（见 v0.22 的批 3 节）。
2. **提交数 22 ≠ 计划的「12–15」**（**不为落进区间而合并提交**；构成见 v0.22 的提交清单）。
3. **两把仪器都跑**（计划只要求一把）⇒ 合成页探针（能切 toast 三态）+ 真实产物探针（真 CSS / 真 App 外壳）。
4. **加跑 1440 档**（计划只有 3 档）⇒ 覆盖 `navActionsFull = 1400` 的第二级阈值。
5. **A4 的内容高由 T14 补测**（计划把它派给 T7，T7 未记录）。
6. **`--write` 零变化** ⇒ 豁免表**不在**本次提交路径里（与计划 Step 9 的条件分支一致）。
7. **改了两个计划外的文件**：`app/README.md`（W14 的兑现）· `.superpowers/sdd/DISPATCH-TEMPLATE.md`（W12 的兑现，**gitignored、不入库**）。
