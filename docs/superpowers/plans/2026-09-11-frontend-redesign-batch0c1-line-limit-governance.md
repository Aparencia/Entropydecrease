# 批 0-C1 行数红线落地（口径 + 登记表重建 + 棘轮守卫）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AGENTS.md §3 的行数红线**第一次成为可执行、可验收、不漂移的规则**：钉死测量口径、把「只追加的历史日志」重建成「一文件一行的快照登记表」、并给 >600 硬限装上只减不增的棘轮守卫。

**Architecture:** 单一工具 `scripts/line-limits.mjs` 同时承担**生成**（`--write`）与**校验**（默认 / `--full`）两种职责，保证「写」与「查」用的是同一套口径与同一份逻辑。登记表仍是**人可读的 Markdown**（沿用仓库文档习惯、可被 `docs-check` 覆盖），但其**行数与条目成员关系由生成器独占维护**，「豁免理由 / 拆分计划」两列由人工维护、生成器按路径保留。>600 硬限用**棘轮**（冻结当前 15 个文件，只允许减少）而非「立刻为零」——否则守卫在拆分完成前无法启用，等于又一个「写了但没人守」的规则。

**Tech Stack:** Node ESM（`node:fs` / `node:path`，零依赖）· Markdown 登记表 · husky pre-commit（本地门禁：**直跑全树校验**，二轮后不经 lint-staged —— 见 Task 4 Step 1）· GitHub Actions `pr-check.yml`（远端门禁）

**Spec:** `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（§10 批 0 行「豁免表纠偏」「拆 4 个超限文件」；§11 验收口径第 1 条）

## Global Constraints

- **本次范围仅「口径 + 登记表 + 守卫」**：`0-C1` **不拆任何文件**。15 个 >600 文件的拆分是 `0-C2`（前端 5 个）与 `0-C3`（Rust 10 个）两份独立计划，本计划交付的是它们的**测量仪器与验收依据**。
- **测量口径（唯一有效）**：行数 = 文件**全部行数**（含空行），以 `[System.IO.File]::ReadAllLines(path, UTF8).Count` 为准（即 `scripts/line-limits.mjs` 的 `countLines()`）。**不要用** `Get-Content`（本机 PowerShell 5.1 + 码页 `gb2312` 会按 GBK 解码、吞掉换行、**少算可达 56 行**/文件 —— 实测最大 `live_session_pause.rs` 353→297）· `Measure-Object -Line`（只数非空行）· **字节 `0x0A` 计数**（对末尾不带换行的文件会**少算 1**；本仓实测有 8 个这样的源文件，含 `NotesPage.tsx` 602/601）。
- **硬限范围为实测 15 个**（用户 2026-09-11 裁决）：前端 5 个 + Rust 10 个。规格原文的「4 个」只扫了前端且漏掉 `SessionListPanel.tsx`，本计划一并更正。
- 单文件 ≤300 行（AGENTS.md §3）—— **本计划新增的脚本自身也必须满足**；若 `line-limits.mjs` 超过 300 行，必须拆分而不是登记。
- 零新增依赖（`package.json` 的 `dependencies`/`devDependencies` 不得变化）。
- 行尾纯 LF；**不要用 `git stash`**（本仓库无 `.gitattributes` 且 `core.autocrlf=true`，0-A 实际踩到过：会把源码变 CRLF 并让 Vite 拒绝转换）。
- 提交信息遵循 Conventional Commits；`.github/workflows/` 属 AGENTS.md §10「变更需额外审查」文件。
- **判定原生命令的结果用 `2>file` 或 `$LASTEXITCODE`，不要用 `2>&1 | …`**（PowerShell 5.1 会把原生 stderr 包成 `NativeCommandError`，让成功的命令报 exit 1 —— 批 0 收尾时已踩过）。

---

### Task 0: 统一 `docs-check` 的两个副本 —— ✅ **已完成**（含一次**设计更正**）

**交付**：`c79c9719`（把缺失的修复移植到实例）+ `c48ccf4a`（恢复模板源 + 加模板同步守卫）。两份现同为 blob `a18f988c…`，各 218 行，门禁绿。

**★ 更正后的模型（本计划初稿写错了，记录在案，勿重犯）**

`docs/` 是一套 **Docs Starter Kit**（`docs/README.md:4`「复制即用」、`:16` 的启用步骤 `cp docs/scripts/docs-check.mjs <你的项目>/scripts/`、`:49` 把 `scripts/` 列为骨架结构）。因此两份文件的真实关系**不是「权威副本 + 散落副本」**，而是：

| 路径 | 角色 |
|---|---|
| `docs/scripts/docs-check.mjs` | **模板源** —— Starter Kit 自包含所必需（删掉它 = 破坏 README 记录的启用步骤） |
| `scripts/docs-check.mjs` | **实例** —— husky pre-commit / `npm run docs:check` / CI 三处真正执行的那份（二轮前 pre-commit 走 lint-staged） |

**初稿的错误写法（已撤回）**：「`docs/scripts/docs-check.mjs` 是散落副本 → `git rm` 删掉」。
**为什么错**：删掉模板源会让 Starter Kit 的启用步骤指向不存在的路径，`docs/` 也不再"可整体复制"。前一位实施者**按计划执行后主动上报了该冲突**（未盲从），修复轮再纠正 —— 这是正确的处置链。
**为什么当时看不出来**：初稿只比对了两个文件的**内容差异**（确实只差 1 个 hunk），没有查它们的**角色**。⇒ 教训：发现两份同源文件时，先查"谁在什么流程里被引用"，再判断哪份该留。

**★ 为什么守卫必须同时写在两份里**

修复轮的第一次派发又踩了一个坑（**控制方指令自相矛盾**）：要求「模板还原成不含守卫的旧 blob」+「守卫只加在实例」+「还原后门禁绿」三者同时成立 —— **不可能**，因为守卫的不变量正是「实例 == 模板」，只加在实例上会立刻恒红、让 lint-staged/CI 永久失败。
⇒ **唯一自洽解**：守卫**写入两份**（两份逐字节一致，不变量为真，门禁绿）。代价：模板相对原文多 20 行。

**守卫规格（现已在 `scripts/docs-check.mjs`，模板侧同一份）**：
- 用 `fileURLToPath(import.meta.url)` 定位自身；用 `ROOT` 拼 `docs/scripts/docs-check.mjs`
- **必须行尾归一化后再比较**：`normalizeEol = (t) => t.replace(/\r\n/g, '\n')` —— 本仓库 `core.autocrlf=true`，不归一化会**在 Windows 检出上恒定误报**（同 批 0-A `tokens.drift.test.ts` 的坑）
- 模板不存在时**跳过**并打印一行说明（本项目以外的实例不会有该路径）
- 失败信息可操作：指明「模板源与实例已分叉，请把改动同步到另一份」

**验证记录**：
- 移植精确性：移植后实例与模板 **blob 同哈希 `68452fff…`** ⇒ 零损失
- 变异探针（非空转）：破坏模板一致性 → `exit=1` 并报「已分叉」；还原 → `exit=0`
- **事实登记**：BASE 的实例在**干净树**上原本就是红的（`exit=1`，18 处误报，含 `v0.10.1.md` 的"配图格式示例"被误判为坏链）⇒ 那处修复此前**从未进入真正生效的门禁**，本任务把门禁从红修成绿
- 行尾：提交内容 `i/lf`、工作树 `w/crlf`（本仓库常态）；两份 218 行、无 BOM

**遗留观察（未处理，属独立治理项）**：`docs/README.md` 的启用步骤本身没问题；但**模板与实例靠守卫保持一致**这件事，是"同一份代码存在两处"的固有成本 —— 若将来 Starter Kit 独立演进，应改为「模板生成实例」而非「两处手工同步」。

---

### Task 1: 钉死测量口径（规范先于代码）

**为什么先改规范**：AGENTS.md §0 第 4 条 —— 「规范与代码冲突时以规范为准；**规范过时时先改规范再改代码**」。现在规范**没说怎么量**，而实测存在三种互不相同的做法（差 1–56 行/文件），所以任何「数值与实测一致」的验收都无从判定。

**Files:**
- Modify: `AGENTS.md:40`（§3.1）与 `AGENTS.md:121`（§11）
- Modify: `docs/standards/refactoring.md:162`
- Test: 文档一致性（`docs-check` + 人工核对三处措辞）

**Interfaces:**
- Consumes: 无
- Produces: 全仓唯一的行数口径定义（Task 2 的脚本与 Task 3 的表头都必须引用同一措辞）

- [ ] **Step 1: 改 AGENTS.md §3.1**

`AGENTS.md:40` 现为：
```
1. **模块化**：单文件 ≤300 行（>600 行必须硬拆；300-600 行登记豁免清单）；纯逻辑与副作用物理分离；显式依赖注入。
```
改为：
```
1. **模块化**：单文件 ≤300 行（>600 行必须硬拆；300-600 行登记豁免清单）；纯逻辑与副作用物理分离；显式依赖注入。
   **行数口径（唯一有效）**：文件**全部行数**（含空行），以 `[System.IO.File]::ReadAllLines(path, UTF8).Count` 为准 —— 即 `scripts/line-limits.mjs` 的 `countLines()`。
   ⚠️ **不要用**：`Get-Content`（本机 PowerShell 5.1 + 码页 `gb2312` 会按 GBK 解码、吞换行、**少算可达 56 行**）· `Measure-Object -Line`（**只数非空行**）· **字节 `0x0A` 计数**（对**末尾不带换行**的文件会少算 1；本仓实测有 8 个这样的源文件，含 `NotesPage.tsx`）。
   判定一律以 `node scripts/line-limits.mjs` 为准。
```

- [ ] **Step 2: 改 AGENTS.md §11**

`AGENTS.md:121` 现为：
```
- 单文件 ≤300 行；源码文件含 `@ai-context` 业务背景注释
```
改为：
```
- 单文件 ≤300 行（口径同上，以 `node scripts/line-limits.mjs` 为准）；源码文件含 `@ai-context` 业务背景注释
```

- [ ] **Step 3: 改 refactoring.md**

`docs/standards/refactoring.md:162` 现为：
```
- **§1 单文件 ≤300 行**："过大类/文件"坏味道在本项目有明确阈值——>600 行必须硬拆；300-600 行登记豁免清单待专项重构
```
改为：
```
- **§1 单文件 ≤300 行**："过大类/文件"坏味道在本项目有明确阈值——>600 行必须硬拆；300-600 行登记豁免清单。行数口径见 AGENTS.md §3.1（全部行数，以 `node scripts/line-limits.mjs` 为准）
```

- [ ] **Step 4: 验证三处措辞一致且文档门禁通过**

Run（仓库根）：
```powershell
Select-String -Path AGENTS.md,docs/standards/refactoring.md -Pattern 'line-limits.mjs'
node scripts/docs-check.mjs
```
Expected: 命中 **4** 行（`AGENTS.md:41` 与 `:43` 同一节两处 + `AGENTS.md` §11 一处 + `refactoring.md:162`）；`docs-check` ✅
（⚠️ 计划初稿写「3 行」是**我的计数错**：§3.1 的口径块里 `line-limits.mjs` 出现两次。**不要为了对齐这个 Expected 去删掉任一处** —— 两处各有作用：一处指出权威实现，一处规定判定动作。）

- [ ] **Step 5: 提交**

```powershell
git add AGENTS.md docs/standards/refactoring.md
git commit -m "docs(standards): 钉死行数测量口径"
```

---

### Task 2: 生成器 + 校验器 `scripts/line-limits.mjs`

**Files:**
- Create: `scripts/line-limits.mjs`
- Test: 手工探针（本任务只交付脚本；表的重建在 Task 3）

**Interfaces:**
- Consumes: Task 1 的口径定义
- Produces:
  - 命令 `node scripts/line-limits.mjs`（默认＝校验，exit 0/1）
  - 命令 `node scripts/line-limits.mjs --write`（重写登记表）
  - 命令 `node scripts/line-limits.mjs --full`（校验并附加「声明值 == 实测值」）
  - 导出 `countLines(filePath): number` · `scanTree(): Map<string, number>`（供测试与后续脚本复用）
  - 常量 `FROZEN_OVER_LIMIT: readonly string[]`（15 条，只允许减少）
  - 常量 `HARD_LIMIT = 600` · `SOFT_LIMIT = 300` · `TABLE_PATH`

**四条不变式**（默认校验的判定依据）：
- **(a) 棘轮只减不增**：任何 `>600` 的文件都必须在 `FROZEN_OVER_LIMIT` 里；不在即失败（新增硬限违规）
- **(b) 棘轮无残留**：`FROZEN_OVER_LIMIT` 里每个路径必须**仍存在且仍 >600**；否则失败（拆完了却没删名单 —— 0-B 棘轮同款纪律）
- **(c) 无漏登**：任何 `>300` 的文件都必须在登记表里出现
- **(d) 无幽灵/过期条目**：登记表里每一行的目标文件必须存在且**该文件当前 >300**
- **(e) 数值一致**（仅 `--full`）：登记表声明值 == 实测值

> **为什么 (e) 不进默认校验**：登记的文件有 138 个，任何一次改动都可能让某个数字变化，把它设成每次提交的硬门禁会迫使**每个提交都重写登记表**（噪音淹没信号）。因此：**提交门禁只守 (a)–(d)**（结构性问题，罕见且严重），**(e) 由 CI 与批验收守**。这是一处明确的取舍，不是遗漏。

- [ ] **Step 1: 先写校验器并看它在当前仓库上失败（RED）**

> 先写「查」，因为当前仓库**必然不通过** —— 这个失败就是本任务的验收信号。

创建 `scripts/line-limits.mjs`：

```js
#!/usr/bin/env node
/**
 * @ai-context 行数红线的**唯一**测量与校验工具（AGENTS.md §3.1）。
 *
 * Why：红线此前无法执行 —— 规范没定口径、登记表是只追加的历史日志（同一文件多行、
 * 读者无法判断哪行有效）、且 15 个 >600 违规中有 10 个被登记表用 <600 的数字
 * 「认证为合规」。故把「测量」收进一个脚本：写表与查表共用同一套逻辑，口径只有一处实现。
 *
 * 副作用：`--write` 会重写 docs/standards/line-limit-exemptions.md（人工维护的
 * 「豁免理由 / 拆分计划」两列按路径保留）；默认模式只读。
 * 边界：只扫 app/src 与 app/src-tauri/src 下的 .ts/.tsx/.rs。>600 用**棘轮**而非
 * 「立刻为零」—— 拆分是 0-C2/C3 的事，本脚本负责让违规**不再增加**且**可见**。
 *
 * 用法：node scripts/line-limits.mjs [--write|--full]
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['app/src', 'app/src-tauri/src'];
const SOURCE_EXT = /\.(ts|tsx|rs)$/;
export const TABLE_PATH = 'docs/standards/line-limit-exemptions.md';
export const HARD_LIMIT = 600;
export const SOFT_LIMIT = 300;

/**
 * >600 硬限违规的**冻结名单** —— 只允许减少。
 * 每完成一个拆分（0-C2 / 0-C3），就从这里删掉对应一行。
 */
export const FROZEN_OVER_LIMIT = [
  'app/src-tauri/src/lib.rs',
  'app/src-tauri/src/types.rs',
  'app/src-tauri/src/live_session_frame.rs',
  'app/src-tauri/src/commands_ai_refine.rs',
  'app/src/pages/ClassroomPage.tsx',
  'app/src-tauri/src/db_goals.rs',
  'app/src-tauri/src/commands_goals.rs',
  'app/src-tauri/src/ai_refine_task.rs',
  'app/src/components/SessionDetailPanel.tsx',
  'app/src/components/NoteListView.tsx',
  'app/src-tauri/src/note_filter.rs',
  'app/src-tauri/src/artifact_templates.rs',
  'app/src-tauri/src/video_profile.rs',
  'app/src/components/SessionListPanel.tsx',
  'app/src/pages/NotesPage.tsx',
];

const toPosix = (p) => p.split(sep).join('/');

/**
 * 行数口径的**唯一实现**：全部行数（含空行）。
 * 与 [System.IO.File]::ReadAllLines(path, UTF8).Count 等价：末尾换行不额外算一行。
 */
export function countLines(absPath) {
  const s = readFileSync(absPath, 'utf8');
  if (s === '') return 0;
  return s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
}

/** 递归收集源文件，返回 Map<仓库相对路径(正斜杠), 行数> */
export function scanTree() {
  const out = new Map();
  const walk = (absDir) => {
    for (const entry of readdirSync(absDir)) {
      const abs = join(absDir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (SOURCE_EXT.test(entry)) out.set(toPosix(relative(ROOT, abs)), countLines(abs));
    }
  };
  for (const d of SCAN_DIRS) {
    const abs = join(ROOT, d);
    if (existsSync(abs)) walk(abs);
  }
  return out;
}

/** 从登记表抽出条目：| 路径 | 行数 | … | */
export function parseTable() {
  const abs = join(ROOT, TABLE_PATH);
  if (!existsSync(abs)) return [];
  const rows = [];
  for (const line of readFileSync(abs, 'utf8').split('\n')) {
    const m = /^\|\s*`?([^|`]+?\.(?:rs|tsx?))`?\s*\|\s*(\d+)\s*\|/.exec(line);
    if (m) rows.push({ path: m[1].trim(), declared: Number(m[2]) });
  }
  return rows;
}

function check({ full }) {
  const measured = scanTree();
  const rows = parseTable();
  const registered = new Set(rows.map((r) => r.path));
  const problems = [];

  // (a) 棘轮只减不增
  const frozen = new Set(FROZEN_OVER_LIMIT);
  for (const [p, n] of measured) {
    if (n > HARD_LIMIT && !frozen.has(p)) problems.push(`(a) 新增 >${HARD_LIMIT} 硬限违规：${p}（${n} 行）→ 必须拆分，不允许登记豁免`);
  }
  // (b) 棘轮无残留
  for (const p of FROZEN_OVER_LIMIT) {
    const n = measured.get(p);
    if (n === undefined) problems.push(`(b) 冻结名单里的文件已不存在：${p} → 从 FROZEN_OVER_LIMIT 删除该行`);
    else if (n <= HARD_LIMIT) problems.push(`(b) 冻结名单里的文件已回到 ${HARD_LIMIT} 以内：${p}（${n} 行）→ 从 FROZEN_OVER_LIMIT 删除该行`);
  }
  // (c) 无漏登
  for (const [p, n] of measured) {
    if (n > SOFT_LIMIT && !registered.has(p)) problems.push(`(c) 超过 ${SOFT_LIMIT} 行但未登记：${p}（${n} 行）→ 运行 --write 补登并填写豁免理由`);
  }
  // (d) 无幽灵/过期条目
  for (const r of rows) {
    const n = measured.get(r.path);
    if (n === undefined) problems.push(`(d) 登记表条目指向不存在的文件：${r.path} → 删除该行`);
    else if (n <= SOFT_LIMIT) problems.push(`(d) 登记表条目已回落至 ${SOFT_LIMIT} 行以内：${r.path}（${n} 行）→ 删除该行`);
  }
  // (e) 数值一致（仅 --full）
  if (full) {
    for (const r of rows) {
      const n = measured.get(r.path);
      if (n !== undefined && n !== r.declared) problems.push(`(e) 行数不一致：${r.path} 声明 ${r.declared} / 实测 ${n} → 运行 --write`);
    }
  }

  const over = [...measured.entries()].filter(([, n]) => n > HARD_LIMIT).length;
  const band = [...measured.entries()].filter(([, n]) => n > SOFT_LIMIT && n <= HARD_LIMIT).length;
  const mode = full ? '--full' : '默认';
  if (problems.length) {
    console.error(`❌ line-limits（${mode}）：${problems.length} 处问题`);
    for (const p of problems) console.error(`  · ${p}`);
    console.error(`\n现状：>${HARD_LIMIT} 硬限 ${over}/${FROZEN_OVER_LIMIT.length}（棘轮）· ${SOFT_LIMIT+1}–${HARD_LIMIT} 档 ${band} · 登记条目 ${rows.length}`);
    process.exit(1);
  }
  console.log(`✅ line-limits（${mode}）：>${HARD_LIMIT} 硬限 ${over}（棘轮内）· ${SOFT_LIMIT+1}–${HARD_LIMIT} 档 ${band} · 登记条目 ${rows.length}`);
}

// 主入口判定：**必须**用 fileURLToPath + resolve 比较。
// `import.meta.url` 在 Windows 上是 `file:///D:/.../a%20b.mjs`（三斜杠 + 空格转义成 %20），
// 拼 `file://${process.argv[1]}` 得到的字符串**永远不相等** ⇒ 脚本会静默什么都不做（本计划初稿即有此错）。
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  check({ full: process.argv.includes('--full') });
}
```

- [ ] **Step 2: 跑它，确认它真的报错（RED）**

Run（仓库根）：
```powershell
node scripts/line-limits.mjs 2> $env:TEMP\ll-err.txt
"exit=$LASTEXITCODE   ← 期望 1"
Get-Content $env:TEMP\ll-err.txt | Select-Object -First 20
```
Expected（数量必须与此一致 —— 这是 Task 3 的输入）：
- **共 47 处问题**（= 45 + 2），`exit=1`
- `(c) 超过 300 行但未登记` 共 **45** 条
- `(d)` 共 **2** 条：**1** 条幽灵（`app/src/components/ActionCenterOverlay.tsx`，文件已不存在）+ **1** 条已回落（`app/src/components/AiServicePanel.tsx`，现存 283 行 ≤300）
- `(a)`/`(b)` **无输出**（15 个文件与冻结名单逐条一致）
- 末行现状：`>600 硬限 15/15（棘轮）· 301–600 档 123 · 登记条目 117`
- **交叉自洽**：登记表 95 条路径中 **93** 条仍有效（>300）；**93 + 45 条漏登 = 138**，而实测 **>600 的 15 + 301–600 的 123 = 138** ⇒ Task 3 重建后的条目数**必须是 138**。这个等式是本计划的核心校验点。

> **`--full` 的 (e) 条数是 90（不是 77）—— 两者都对，差在口径**：脚本的 `parseTable()` 返回**全部表格行**（117 行，含同一文件的重复行），故 (e) 按**行**计 = **90**；若按**路径去重**（每路径取首个声明值）则是 **77**。差值正是那 12 组重复行。**看到 90 不要以为有 bug**；Task 3 重建后（一文件一行）两者必然相等。
>
> **控制方已预先验证过本节代码**：把上面这份脚本写到真实路径 `scripts/line-limits.mjs` 跑过一次，实测输出与本节的 47 / 45 / 2 / (a)(b) 为空 / 现状行**逐项一致**，验证后已删除该文件（执行是实施者的事）。⇒ 本节代码不是"看起来能跑"，而是**跑过**。若你的输出与此不同，**先怀疑环境（口径/路径）而不是先改断言**。

> ⚠️ 若 (c) 的条数不是 45，**先停下来核对**（用 `[System.IO.File]::ReadAllLines` 复核），不要改断言去迁就输出。

- [ ] **Step 3: 用变异探针证明三条不变式非空转**

**每一条都要单独验，验完立刻还原**（还原后用 `git diff --stat` 确认干净）：

```powershell
# (a) 让一个未在名单里的文件越过 600：临时往一个 590+ 行的文件尾部追加空行
$f = 'app\src-tauri\src\commands.rs'   # 实测 598 行
Add-Content $f ("`n" * 10)
node scripts/line-limits.mjs 2>&1 | Select-String '新增 >600'
"上面应出现 (a) 报告"
git checkout -- $f    # ⚠️ 若你的环境已禁用 checkout，改为手工删掉刚追加的空行，并用 git diff --stat 确认干净
```
⚠️ **本仓库 `core.autocrlf=true` 且无 `.gitattributes`** —— `git checkout --` 会把该文件变成 CRLF 并使 Vite 拒绝转换。**更安全的做法**：先用 `Copy-Item $f $env:TEMP\bak -Force` 备份，验完 `Copy-Item $env:TEMP\bak $f -Force` 还原，再 `git diff --stat -- $f` 确认空。

同理验证：
- **(b)** 临时把 `FROZEN_OVER_LIMIT` 里的 `app/src/pages/NotesPage.tsx` 改成 `app/src/ui/tokens.ts`（≤300）→ 应报「已回到 600 以内或不存在」→ 还原
- **(d)** 临时把登记表里某行的路径改成 `app/src/components/ActionCenterOverlay.tsx` → 应报不存在 → 还原

- [ ] **Step 4: 提交**

⚠️ 本步**只提交脚本**（登记表的重建是 Task 3）。此时 `node scripts/line-limits.mjs` 仍是红的 —— 这是刻意的：Task 3 才是让它变绿的动作。**不要**为了「提交时全绿」而把表先改了。

```powershell
git add scripts/line-limits.mjs
git commit -m "feat(scripts): 行数红线测量与棘轮校验工具"
```

---

### Task 2 修复轮（**Task 3 的前置**，单独提交）：两条 Minor

Task 2 评审结论 **APPROVE**（无 Important），但给出两条 Minor。**它们必须在 Task 4 接线之前修掉** —— 否则将来会变成静默通过路径。

**Minor 1（真问题，有明确的未来触发条件）**：`check()` 的 `(c)`/`(d)` 全部依赖 `measured` / `rows` 非空，而 `(a)`/`(b)` 只依赖 `FROZEN_OVER_LIMIT` 非空。评审者实测三种失效组合：

| 失效组合 | 问题数 | exit |
|---|---|---|
| 扫描域（`SCAN_DIRS`）不存在 | 132（15 个 `b` + 117 个 `d`） | 1 |
| 登记表不存在 | 138（全走 `c`） | 1 |
| **两者同时失效** | **15（只剩 `b`）** | 1 |

⇒ 问题数从 47 塌缩到 15 时**仍是红的**，**但一旦 `FROZEN_OVER_LIMIT` 被清空（正是 0-C2/0-C3 拆完后的目标状态），同样的双失效会给出 `exit 0` 绿灯** —— "工具坏了却报平安"，而且恰好发生在没人再盯它的时候。

**修法**：在 `check()` **最开头**（`scanTree()` 之后、任何不变式之前）加规模自检：

```js
  // 规模自检：没有它，扫描域失效会让 (a)/(c) 静默通过、(d) 反把 117 条登记行报成"指向不存在的文件"。
  // 更危险的是未来：FROZEN_OVER_LIMIT 被清空（0-C2/C3 拆完后）时，双失效会给出 exit 0 绿灯。
  if (measured.size === 0) {
    console.error(
      `❌ line-limits：扫描域为空 —— ${SCAN_DIRS.join(' / ')} 下没有匹配 ${SOURCE_EXT} 的文件。\n` +
        `   这几乎总是路径写错或工作目录不对，**不是"没有超限文件"**。`,
    );
    process.exit(1);
  }
```

**Minor 2（诊断误导）**：扫描根失效时日志报 117 条「`(d)` 条目指向不存在的文件」——把真实原因（内容树没扫到）说成"登记行该删"，**会把人引向删行**；登记表缺失时则逐条报「未登记」，却不提示"登记表不存在"。

**修法**：在 `parseTable()` 之前显式判定登记表是否存在，并给专用提示：

```js
  const tableAbs = join(ROOT, TABLE_PATH);
  if (!existsSync(tableAbs)) {
    console.error(`❌ line-limits：登记表不存在 —— ${TABLE_PATH}。先运行 --write 生成，或检查路径。`);
    process.exit(1);
  }
```

（扫描根缺失由 Minor 1 覆盖；两者合起来就不再产生那 117 条误导性的 `(d)`。）

**Nit（不单独处理）**：`writeFileSync` 目前 import 未用、docblock 已宣称 `--write` —— **Task 3 Step 1 加上写分支后自然消解**。（这是计划 Step 1 逐字如此，非实施者擅自增删。）

**本修复轮的验收**：
1. 默认校验**行为不变**：仍报 **47** 处、`exit=1`
2. 三条失效组合各自给出**专用提示**（依次把 `SCAN_DIRS` 指向不存在路径、把 `TABLE_PATH` 指向不存在文件、两者同时；**每次都要用 `Copy-Item` 备份还原**，验完 `git diff --stat` 为空）
3. **单独提交**：`fix(scripts): 校验器补规模自检与失效诊断` —— **不要**与 Task 3 的重建混在一个提交里

---

### Task 3: 重建登记表（把历史日志变成快照登记）

**Files:**
- Modify: `scripts/line-limits.mjs`（加 `--write` 分支与理由继承）
- Rewrite: `docs/standards/line-limit-exemptions.md`

**Interfaces:**
- Consumes: Task 2 的 `scanTree()` / `countLines()` / `FROZEN_OVER_LIMIT` / `HARD_LIMIT` / `SOFT_LIMIT`
- Produces: 重建后的登记表（结构：`## 超硬限` 表 + `## 301–600 档` 表 + `## 已拆分 / 登记移除记录`），供 `0-C2`/`0-C3` 每拆完一个文件就 `--write` 刷新

**表的内容契约（写进表头，后续所有人照此维护）**：
- **行数与条目成员关系**：由 `node scripts/line-limits.mjs --write` 生成，**不要手改数字或手删/手加行**（会被校验器判为 (c)/(d)/(e) 违规）
- **「豁免理由」「拆分计划」两列**：由人工维护，生成器按路径**保留**（新增条目若无人写，则自动摘取该文件 `@ai-context` 首行并标注「自动摘取，待细化」）
- **「已拆分 / 登记移除记录」节**：人工维护的历史，生成器**逐字保留**

- [ ] **Step 1: 给脚本加 `--write`**

在 `scripts/line-limits.mjs` 中新增（放在 `check()` 之前）：

```js
/** 从现有登记表按路径抽出人工维护的两列（生成器保留它们） */
function parseReasons() {
  const abs = join(ROOT, TABLE_PATH);
  const map = new Map();
  if (!existsSync(abs)) return map;
  for (const line of readFileSync(abs, 'utf8').split('\n')) {
    const m = /^\|\s*`?([^|`]+?\.(?:rs|tsx?))`?\s*\|\s*\d+\s*\|\s*([^|]*)\|\s*([^|]*)\|/.exec(line);
    if (m) map.set(m[1].trim(), { why: m[2].trim(), split: m[3].trim() });
  }
  return map;
}

/** 取该文件 `@ai-context` 的首行要点，作为自动补登时的理由 */
function autoReason(absPath) {
  const src = readFileSync(absPath, 'utf8');
  // 捕获**整行**再清洗，而不是用 `[^\n*]+` 直接卡在 `*` 上 —— 本仓大量 `@ai-context` 行以
  // `**加粗**` 开头（如 `@ai-context **域图标**几何（9 个）：…`），卡 `*` 会**一格都捕获不到**，
  // 使 45 条自动理由全部退化成占位符。
  const m = /@ai-context[：:]?\s*([^\n]+)/.exec(src);
  if (!m) return '（待补理由：本条目由生成器补登）';
  const text = m[1]
    .replace(/\*\/\s*$/, '') // 单行块注释的收尾 `*/`
    .replace(/\*\*/g, '') // 加粗标记
    .trim();
  return text ? `${text}（自动摘取，待细化）` : '（待补理由：本条目由生成器补登）';
}

/** 逐字保留「已拆分 / 登记移除记录」整节 */
function parseHistory() {
  const abs = join(ROOT, TABLE_PATH);
  if (!existsSync(abs)) return '';
  const src = readFileSync(abs, 'utf8');
  const at = src.indexOf('## 已拆分');
  return at < 0 ? '' : src.slice(at).trimEnd() + '\n';
}

function writeTable() {
  const measured = scanTree();
  const reasons = parseReasons();
  // 并列时必须按路径断开：`scanTree` 的 Map 迭代序来自 readdirSync，**跨平台不一致**
  // （Windows 与 Linux 的顺序可能不同）⇒ 只按行数排会让 `--write` 在不同平台产出不同字节。
  const byLinesDesc = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
  const over = [...measured.entries()].filter(([, n]) => n > HARD_LIMIT).sort(byLinesDesc);
  const band = [...measured.entries()].filter(([, n]) => n > SOFT_LIMIT && n <= HARD_LIMIT).sort(byLinesDesc);
  // 单元格净化：文本里的半角 `|` 会撑破 Markdown 表格，并让下次 `parseReasons` 误切列。
  // 换**全角** `｜` 而不是 `\|` —— 转义写法在下次读取时会被再次转义，破坏 `--write` 的幂等性。
  const cell = (t, fallback) => {
    const s = (t ?? '').replace(/\|/g, '｜').replace(/\s*\n\s*/g, ' ').trim();
    return s || fallback;
  };
  const row = (p, n, why, split) => `| ${p} | ${n} | ${cell(why, '（待补理由）')} | ${cell(split, '若再增长：按职责拆分')} |`;

  const lines = [
    '# 单文件行数豁免登记（AGENTS.md §3：单文件 ≤300 行；301–600 行须登记本清单）',
    '',
    '> ⚠️ **本文件是生成物** —— 行数与条目成员关系由 `node scripts/line-limits.mjs --write` 生成，',
    '> **不要手改数字、手加行或手删行**（会被 `node scripts/line-limits.mjs` 判为违规）。',
    '> 「豁免理由」「拆分计划」两列由**人工**维护，生成器按路径保留；「已拆分 / 登记移除记录」节逐字保留。',
    '>',
    '> **测量口径（唯一有效）**：文件**全部行数**（含空行），等价于 `[System.IO.File]::ReadAllLines(path, UTF8).Count`。',
    '> ⚠️ **禁用** `Get-Content` 数行（本机 PowerShell 5.1 + 码页 `gb2312` 会按 GBK 解码、吞换行、**少算**）与 `Measure-Object -Line`（**只数非空行**）。',
    '>',
    `> 规则：≤${SOFT_LIMIT} 行无需登记；${SOFT_LIMIT + 1}–${HARD_LIMIT} 行须登记；**>${HARD_LIMIT} 行必须硬拆，不允许豁免**。`,
    '',
    `## 超硬限（>${HARD_LIMIT} 行，必须硬拆，不允许豁免）`,
    '',
    '> 本表受棘轮守卫保护：**只允许减少**。每完成一个拆分，从 `scripts/line-limits.mjs` 的 `FROZEN_OVER_LIMIT` 删掉对应一行。',
    '',
    // ⚠️ 本表**保持 4 列**（与下一节同形），不要"顺手"简化成 3 列 —— `parseReasons` 用 4 列正则
    // 按路径保留人工维护的两列，改成 3 列会让这些拆分计划在**下一次重生成时静默丢失**。
    '| 文件 | 行数 | 说明 | 拆分计划 |',
    '|---|---|---|---|',
    ...over.map(([p, n]) => row(p, n, `超硬限（>${HARD_LIMIT} 行），不允许豁免`, reasons.get(p)?.split || `**超硬限必须拆**：拆到各文件 ≤${SOFT_LIMIT} 行`)),
    '',
    `## ${SOFT_LIMIT + 1}–${HARD_LIMIT} 档（须登记）`,
    '',
    '| 文件 | 行数 | 豁免理由 | 拆分计划 |',
    '|---|---|---|---|',
    ...band.map(([p, n]) => {
      const r = reasons.get(p);
      return row(p, n, r?.why || autoReason(join(ROOT, p)), r?.split);
    }),
    '',
    parseHistory(),
  ];
  writeFileSync(join(ROOT, TABLE_PATH), lines.join('\n'), 'utf8');
  console.log(`✅ 已重写 ${TABLE_PATH}：>${HARD_LIMIT} 硬限 ${over.length} · ${SOFT_LIMIT + 1}–${HARD_LIMIT} 档 ${band.length}`);
}
```

并把文件末尾的分发改为：
```js
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.includes('--write')) writeTable();
  else check({ full: process.argv.includes('--full') });
}
```

- [ ] **Step 2: 重建表**

Run（仓库根）：
```powershell
node scripts/line-limits.mjs --write
```
Expected: `>600 硬限 15 · 301–600 档 123`

> **控制方已把本步的逻辑干跑验证过**（探针 `.superpowers/sdd/probe-writetable-dryrun.mjs`，输出到 `%TEMP%`，**未触碰真实登记表**）。实测结果 —— 你跑完 `--write` 后应得到同样性质的结果：
> - **表格条目总数 138**（15 超硬限 + 123 登记档）· `(c)` 漏登 **0** · `(d)` 幽灵/过期 **0** ⇒ **`node scripts/line-limits.mjs` 会变绿**
> - **幂等**：连跑两次字节相同 ✓ · 单元格内**无裸 `|`** ✓ · 自动摘取理由 **43** 条、占位符 **2** 条
> - **理由继承取"每个路径最新那一行"**：`NotesPage.tsx` 原有 **7 行**（478/572/616/575/571/599/602），收敛为 1 行并继承了 **602 那行**的拆分计划；`GroupSidebar.tsx`（原 6 行）同理；`SessionListPanel.tsx` 保住了它原有的「拆至 `SessionSelectionToolbar.tsx`」。
> - 一个**易误判点**：干跑时「历史节注记数 = 13」而非计划后面要求的 ≥14 —— 因为干跑发生在你把第 121 行那条注记**迁入历史节之前**。迁入后才是 14。

- [ ] **Step 3: 人工处理三件生成器不该擅自决定的事**

1. **45 条自动补登的理由**：控制方已**预先实测**该逻辑的产出率（探针 `.superpowers/sdd/probe-autoreason.mjs`）：**43 条能自动摘到可用理由，仅 2 条会留 `（待补理由）` 占位符**。
   ⇒ 你的工作量是：**抽查**若干条自动摘取的文字是否恰当（样例显示质量可用，如 `streaming_asr.rs → sherpa-onnx OnlineRecognizer（Zipformer transducer 中英双语流式）`），并**人工补写那 2 条**占位符。
   ⚠️ 这条产出率依赖计划里改进后的正则（**捕获整行再清洗**）。若你发现占位符远多于 2 条，说明正则被改回了 `[^\n*]+`（那个写法会卡在本仓大量的 `**加粗**` 开头处、**一条都摘不到**）—— 先修正则，不要手工填 45 条。
2. **搬家不丢信息**：⚠️ **计划这里写「两处」是错的 —— 实际有四处**（实施者实测指出）。原文嵌在表格中间、不被生成器承载的散注共四条：
   - 第 118 行（SessionsPage 审查快照说明）——**判定已过时**：其动作项「随 NotesPage/types.ts 拆分任务一并复核，若仍越线按上表模式登记」已由本次重建兑现（实测 352 行，现为正式条目），快照值 304 本身也过期 ⇒ **删除**并在提交信息里说明
   - 第 121 行（`ai_refine_protocol.rs` 登记移除，实测仍 295 ≤300）· 第 119 行（`EnrichPanel.tsx` 登记移除→复核实测 **324 行已恢复登记**）· 第 117 行（`app/src/types.ts`「拆分中暂不登记」，拆分已完成、实测 20 行 barrel）⇒ **三条逐字迁入「已拆分 / 登记移除记录」节**
   - **★ 控制方裁决：接受这处「超出计划字面枚举」的扩张。** 理由：本步的意图是**搬家不丢信息**，而这四条都嵌在表格中间、重建后**生成器不会承载它们** —— 只迁 121、把 117/119 丢掉，等于用"严格遵守字面"换"静默丢失两条机构记忆"。实施者**主动上报了这处扩张**并给出复核数字，处置正确。
3. **历史节的完整性**：确认 `## 已拆分 / 登记移除记录` 的 **13 条**注记逐字保留 —— 迁入上面三条后应为 **16 条**。

Run（核对历史节条数）：
```powershell
$src = [System.IO.File]::ReadAllText((Get-Item 'docs/standards/line-limit-exemptions.md').FullName, [System.Text.Encoding]::UTF8)
$at = $src.IndexOf('## 已拆分')
($src.Substring($at) -split "`n" | Where-Object { $_ -match '^> ' }).Count
```
Expected: **≥14**（原 13 条 + 迁入的 1 条）

- [ ] **Step 4: 校验通过（GREEN）**

Run（仓库根）：
```powershell
node scripts/line-limits.mjs      ; "默认 exit=$LASTEXITCODE   ← 期望 0"
node scripts/line-limits.mjs --full ; "full exit=$LASTEXITCODE    ← 期望 0"
```
Expected: 两条都 ✅，且 `--full` 报 `登记条目 138`

- [ ] **Step 5: 幂等性（生成器必须是确定性的）**

Run：
```powershell
node scripts/line-limits.mjs --write
git diff --stat -- docs/standards/line-limit-exemptions.md   # 期望：空（连跑两次字节相同）
```

- [ ] **Step 6: 提交**

```powershell
git add scripts/line-limits.mjs docs/standards/line-limit-exemptions.md
git commit -m "docs(standards): 重建行数豁免登记为快照表"
```
提交信息里写明：**重建前后** —— 条目 117 行 / 95 路径 → **138 条**（15 超硬限 + 123 登记档）；消除 **12 组重复**、**1 条幽灵**（`ActionCenterOverlay.tsx`）、**1 条已回落**（`AiServicePanel.tsx` 390→283）、**45 条漏登**、**数值偏差 90 条**（⚠️ 这是**按行**计，脚本 `--full` 的 `(e)` 就是这个口径；按**路径去重**是 77 条 —— 两个数都对，写提交信息时别只写一个而不说明口径）；其中 **10 个 >600 违规此前被 <600 的登记值伪装成合规**。

---

### Task 3 修复轮（**Task 4 的前置**，两个提交）：评审的 2 条 Important

Task 3 评审结论 **NEEDS_FIXES**。两条 Important **根因都在本计划的设计里**，不是执行问题 —— 记在这里，以免后来者照抄上面的代码块。

**★ Important 1：`--write` 缺规模自检 —— 另一个入口在"报平安"。**
本计划给 `check()` 加了 `measured.size === 0` 守卫（Task 2 修复轮），**但 `writeTable()` 没有**。评审者实测：把 `SCAN_DIRS` 指向不存在路径后跑 `--write` → **`exit 0`、stderr 0 字节、stdout 打印「✅ 已重写 …：>600 硬限 0 · 301–600 档 0」**，而登记表从 **179 行塌到 41 行**（138 条与全部理由清空，只剩表头与历史节）。git 可还原，但 **✅ + exit 0 掩盖了破坏** —— 而且恰在 0-C2/C3 会**反复执行 `--write`** 的窗口里。
⇒ **修法**：把规模自检**抽成两个入口共用的守卫**，`writeTable()` 必须在 `writeFileSync` **之前** `exit 1`；并**逐目录断言**（存在 + 至少贡献 1 个文件）——否则只坏一个目录时仍会刷出上百条「`(b)` 冻结名单里的文件已不存在 → 从 `FROZEN_OVER_LIMIT` 删除该行」「`(d)` … → 删除该行」，**把人引向删棘轮/删条目**（与已修的 Minor 2 同类误导）。

**★ Important 2：超硬限行的「豁免理由」人工文字被常量整列丢弃。**
本计划把超硬限行写成 `row(p, n, \`超硬限（>N 行），不允许豁免\`, reasons.get(p)?.split)` —— **只保留了 `split`，把 `why` 换成常量**。于是旧表那 15 条理由（**≥1009 字**，含 `TD-2026-09-09-D` / `TD-2026-08-30-A` / `TD-2026-09-09-A` 编号、「超限为预存债务」、`lib.rs` 的「拆分会破坏注册可读性」等）在新表里**出现 0 次**；而**表头与脚本 docblock 都宣称「两列由人工维护，生成器按路径保留」** —— 自述与行为不符，且下次 `--write` 会继续吞掉按表头指引写进该列的理由。
⇒ **修法**：保留常量前缀**并追加**人工理由，且**必须幂等**（读回时先剥掉生成器自己加的前缀，否则每次 `--write` 会层层叠加）：

```js
  const OVER_PREFIX = `超硬限（>${HARD_LIMIT} 行），不允许豁免`;
  /** 幂等：先剥掉生成器自己加的前缀，否则每次 --write 都会叠加一层 */
  const stripOverPrefix = (t) =>
    t.startsWith(OVER_PREFIX) ? t.slice(OVER_PREFIX.length).replace(/^\s*——\s*/, '').trim() : t.trim();
  const overWhy = (p) => {
    const human = stripOverPrefix(reasons.get(p)?.why ?? '');
    return human ? `${OVER_PREFIX} —— ${human}` : OVER_PREFIX;
  };
```

⚠️ **光改代码 + 重跑 `--write` 恢复不了那 15 条** —— 它们**已被上一次重建丢掉**，必须先从 git 旧版捞回：`git show a4cb549d:docs/standards/line-limit-exemptions.md`，按路径取出原文写回，再跑 `--write` 验证「跑一次后仍在」且「第二次运行 SHA256 不变」。

**本修复轮的验收**：① `SCAN_DIRS` 全失效 → 两个入口**都** `exit=1` 且**登记表字节不变**（SHA256 对照）；② `SCAN_DIRS` 部分失效（只留 `app/src`）→ `exit=1` 且报「扫描目录不存在」，**不再**刷 (b)/(d) 的"→ 删除该行"；③ 15 条人工理由**全部捞回**（旧/新字数对照，证明零丢失）；④ 连跑两次 `--write` **SHA256 相同**（前缀不叠加）；⑤ 默认与 `--full` 仍 `exit=0`、`138` 条。
**提交**：`fix(scripts): write 入口补规模守卫并保留超硬限人工理由` + `docs(standards): 恢复 15 条超硬限人工理由并重生成`。

### ★★ 实施者超出本计划补的第三条断言 —— **控制方采纳**（`2208e72a`）

本计划上面给的守卫片段（「扫描域为空」+「逐目录存在且贡献 ≥1 文件」）**拦不住一种更隐蔽的失效**：`SCAN_DIRS` **只保留 `app/src`**（把 `app/src-tauri/src` 从配置里删掉）。此场景下**列出的目录都存在、都有命中**，前两条断言**全过** —— 而实测后果是：

| 入口 | 未加第三条断言时 | 加后 |
|---|---|---|
| 默认校验 | 刷出 `(b)`×10 + `(d)`×102（"→ 删除该行"） | `exit=1`，报「**扫描域覆盖不全**」 |
| **`--write`** | **`exit 0` + ✅ + 登记表 179→77 行 / 138→36 条** | `exit=1`，**表逐字节不变** |

⇒ **这正是本批反复出现的那一类**（"看起来在守、实际有洞"），而且**又是在 `--write` 这个会真正造成破坏的入口上**。
实施者补的第三条断言：**`FROZEN_OVER_LIMIT` ∪ 登记表内路径必须全部落在 `SCAN_DIRS` 覆盖范围内**；提示措辞按事实写「扫描域覆盖不全」而非「扫描目录不存在」（后者由"某个目录整个不存在"的场景兑现）。它**主动上报了这处超出计划字面的扩张并附实测**（未加时 `--write` 的破坏数字）—— 处置正确。
⇒ **控制方裁决：采纳，且不需要逐字输出「扫描目录不存在」**（两种场景本来就该给不同的提示）。计划片段按此补齐。

### 其余两处顾虑的裁决

- **捞回口径取「每路径最后一行」** ⇒ **采纳**。理由：① 与 `parseReasons` 及干跑说明同口径；② 更早行的措辞（如 `live_session_frame.rs` 683 行版「超限为预存债务」、`types.rs` 958 行版 DTO 说明）若并入同一格，会让单元格变成历史堆叠，**重新引入本批刚消灭的"哪一行有效"歧义**。实施者另做了一次独立对账：旧登记值已 >600 的 **8 条**理由合计 **1009 字**，与评审者报的「≥1009 字」精确吻合。
- **未复现评审者那次 41 行破坏** ⇒ 无妨（评审者已实测），它改为在收窄配置下做受控破坏并 `Copy-Item` 回滚，同样达到证明目的。

**遗留 Nit（不处理）**：迁入历史节的 3 条散注里只有 121 是逐字，117/119 被**改写**（原文内容保住并补上复核结论）—— 与计划「逐字迁入」的字面不符，但**结果更好**（补了复核数字），不影响合并。

---

### Task 4: 接线（本地提交门禁 + CI）

**Files:**
- Modify: `.husky/pre-commit`（**最终形态**：直跑全树校验 —— 见 Step 1 的 ★ 二轮接线）
- Modify: `package.json`（初版加 lint-staged 条目；二轮**删除**该块）
- Modify: `.github/workflows/pr-check.yml`（新增 line-limits job）
- Test: 变异探针 + 实跑

**Interfaces:**
- Consumes: Task 2/3 的 `scripts/line-limits.mjs`
- Produces: 让 (a)–(e) 在**每次提交**（本地 hook 跑 `--full`）与**每次推送**（CI 跑 `--full`）时都被执行

- [ ] **Step 1: 接进本地提交门禁 —— ★ 2026-09-11 二轮（终局评审）后就地改写，最终形态是「直跑全树」而非 lint-staged**

**最终接线**（`.husky/pre-commit` 的命令行，逐字）：
```sh
node scripts/line-limits.mjs --full && node scripts/docs-check.mjs
```
配套：`package.json` 的 `lint-staged` 块**已删除**（`devDependencies` 里的 `lint-staged` 保留，留给将来的文件级任务）。

**为什么不是 lint-staged**（三条，逐条已实测）：
1. **暂存语义零贡献**：两个检查都是**全树只读扫描**、且**忽略传入的文件参数**（`line-limits.mjs` 只认 `--write` / `--full`）⇒ lint-staged「把暂存文件列表交给命令」对它**没有任何作用**。
2. **风险整类消除**：lint-staged 的 stash / `git reset --hard` / hide / auto-stage / `.git/lint-staged_unstaged.patch` 是**一整类**工作树风险（本节末尾「附带隐患」记录的那次丢改动即出自这里）；`--no-stash` 只是把它从「会丢」降级成「不丢但仍有多余副作用」。**最终形态连 lint-staged 都不进** ⇒ `.git/lint-staged_unstaged.patch` 与「`MM` 被 auto-stage 成 `M `」一并消失（实测：部分暂存文件跑完仍是 `MM`，文件 sha256 不变）。
3. **不再依赖 glob ⇒ 消除"假覆盖"**：旧接线的第三个条目只在暂存到 `{package.json, scripts/line-limits.mjs, docs/standards/line-limit-exemptions.md}` 之一时才跑 `--full` —— 只暂存一个改动过的源文件时该段 **0 files / `[SKIPPED]`** ⇒ **(e) 在本地全时绿灯**（实测：同一暂存态下旧门禁 `npx lint-staged` **exit 0**，新 hook **exit 1** 报 `(e) 行数不一致：app/src-tauri/src/lib.rs 声明 1025 / 实测 1026`）；而 glob `app/**/*.{ts,tsx,rs}` 命中 **872** 个 tracked 文件、脚本扫描域只有 **868** ⇒ 有 **4** 个文件（`app/src-tauri/build.rs`、`app/src-tauri/examples/capture_ocr_diag.rs`、`app/vite.config.ts`、`app/vitest.config.ts`）是「命令跑了却永远看不见」。（评审记录为 870 / 差 2 个，那是 `git ls-files 'app/**/*.ts' …` 的数 —— git pathspec 的 `**` 比 micromatch 少算 `app/*.config.ts`；按 lint-staged 实际使用的 micromatch 复核是 872 / 差 4 个。）每次都跑全树，这两处一起消掉。

**为什么这里可以用 `--full`**（初版曾担心"会逼人每次提交重生成表"）：`--full` **只读** —— 写登记表只走 `--write` —— 门禁**不会**改任何文件；数值过期时它做的是**报错并要求人决定**（`--write` 重生成，或把改动改回去），而不是悄悄改表。这也正是把它与 CI 拉成**同一口径**的理由。

**初版接线（已作废，保留以示来源）**：`package.json` 曾把 `docs/**/*.md` / `app/**/*.{ts,tsx,rs}` / `{package.json,scripts/line-limits.mjs,docs/standards/line-limit-exemptions.md}` 三条映射给 lint-staged；`.husky/pre-commit` 曾为 `npx lint-staged --no-stash --no-hide-partially-staged`。**不要在将来"补回"这个块** —— 它已不是生效路径，留着只会让人误以为它在守。

> **两点行为说明（写下来避免将来困惑）** —— ★ **二轮后第 1 条整体作废**（门禁已不经 lint-staged），第 2 条仍成立：
> 1. ~~**lint-staged 会附带暂存文件名**，脚本予以忽略。~~ **★ 2026-09-11 二轮：此条随 lint-staged 一并作废**（门禁改为直跑，不再有"附带暂存文件名"这回事）；下面保留它当日的首次就地更正记录，以示证据链：⚠️ **本条已于 2026-09-11 就地更正（本计划唯一一处被授权就地修改的行为说明）**：原文写「部分暂存时会把未暂存的改动 stash 起来再跑命令 ⇒ 校验看到的是『即将提交的状态』（暂存文件 = 暂存内容，其余 = `HEAD`）」，该行为在门禁加固后**不再成立** —— 加固见下文「Task 4 附带隐患」（`.husky/pre-commit` 改为 `npx lint-staged --no-stash --no-hide-partially-staged`）：现在 lint-staged **不 stash、不 hide**，校验看到的是**当前工作树**（含未暂存改动），**不再等于"即将提交的状态"**。若你看到行数与暂存内容不符，先想这一点；并注意加固的**代价**：落在受管 glob 上的部分暂存文件会在跑完时被整文件 `git add`（不丢内容，但抹掉"只提交一半"的意图）。
> 2. **跨平台行数一致**：Windows 工作树是 CRLF、Linux 检出是 LF，而 `countLines` 只数 `\n` ⇒ 同一提交在两边的行数**相同**（`"a\r\nb\r\n"` 与 `"a\nb\n"` 都得 2）。故 CI 的 `--full` 与本地门禁不会互相打架。

- [ ] **Step 2: 接进 CI**

在 `.github/workflows/pr-check.yml` 的 `jobs:` 下新增一个**无 `needs`/`if`**（每次都跑，约 10 秒）的 job：
```yaml
  # ===========================================================================
  # 行数红线 — AGENTS.md §3（全部行数口径；>600 棘轮只减不增）
  # ===========================================================================
  line-limits:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      # --full：CI 额外守「登记值 == 实测值」（本地提交门禁不守，避免每次提交重写表）
      - name: Line limits
        run: node scripts/line-limits.mjs --full
```

- [ ] **Step 3: 验证本地门禁真的会拦**

```powershell
# 造一个「未登记的 >300 文件」提交，确认被拦
Set-Content -Path app\src\__probe-lines.ts -Value ("// x`n" * 320) -Encoding utf8
git add app/src/__probe-lines.ts
git commit -m "chore: 探针" 2>&1 | Select-String 'line-limits|超过 300'
"↑ 期望：提交被 pre-commit hook 拦下并报 (c)"
Remove-Item app\src\__probe-lines.ts
git reset
```
（`git reset` 只取消暂存，不动工作树。）

- [ ] **Step 4: 验证 CI 配置合法**

```powershell
node -e "const s=require('fs').readFileSync('.github/workflows/pr-check.yml','utf8'); if(!/line-limits:/.test(s)) throw new Error('job 未写入'); console.log('job 存在，行数 ' + s.split('\n').length)"
```
（本机无 YAML 解析器，且 workflow 语法由 GitHub 侧校验；这里只做存在性与整体结构的粗检。）
⚠️ **二轮补记（2026-09-11）**：上面 `# --full` 那行注释里的「本地提交门禁不守」与本地跑 `--full` 的取舍，**已被 Step 1 的最终接线推翻**（本地现在每次提交都跑 `--full`）。**实际文件 `.github/workflows/pr-check.yml` 的注释仍写着旧理由**（含「见 `package.json` 的 lint-staged 条目」，而该块已删除）—— 本批按铁律边界**未改动该文件**（CI job 本身保留、行为仍正确：照跑 `--full`），注释更正已登记在「未做（登记）」。

- [ ] **Step 5: 提交**

```powershell
git add package.json .github/workflows/pr-check.yml
git commit -m "ci: 行数红线接入提交门禁与 CI"
```
⚠️ `.github/workflows/` 属 AGENTS.md §10「变更需额外审查」——请评审者确认 job 未引入密钥/权限面。

**★ Task 4 附带隐患（同日实测并修复）：门禁的失败路径会重写工作树**

**实测事实**：`lint-staged@15.5.0` 默认 `stash:true` + `hidePartiallyStaged:true`，其**失败路径**是「先毁工作树，再赌一次还原」：`git stash create` + `stash store` 备份 → 跑任务 → **失败则 `git reset --hard HEAD`**（清掉整个工作树）→ `git stash apply --quiet --index <备份>` 重建 → `cleanup` 把备份 `stash drop`（实现：`node_modules/lint-staged/lib/gitWorkflow.js` 的 `prepare`/`restoreOriginalState`/`cleanup`、`runAll.js` 的 step 5–7、`state.js` 的 `restoreOriginalStateEnabled`）。部分暂存的文件还会被 `git checkout --force --` 强行改写（`hideUnstagedChanges`）—— 门禁会动别人的在制品，而本批是多代理并发。

- **控制方实测**（`docs/standards/README.md` 追加 1 行未暂存 + 暂存未登记的 321 行 `app/src/__probe-fail.ts`）：`[COMPLETED] Backed up original state in git stash (c85e00a1)` → `[FAILED]` → **那行未暂存改动从工作树消失，且 `git stash list` 为空**。那次备份**确实含**这行改动：`git diff HEAD c85e00a1` 显示 `docs/standards/README.md` 增 2 行，而其二父 `6f66e014` 只含探针文件 ⇒ README 是**纯未暂存**改动、与 `hidePartiallyStaged` 无关。⇒ **备份里有、工作树里没有**：还原那一半没兑现，备份随后只被丢成悬空 commit。
- **实施者复跑**（`git version 2.54.0.windows.1`，同一实验）：失败后内容侥幸还在（`git diff` 仍显示那行），但**整个文件被重写** —— LF→CRLF、`sha256 7D9EE928…→682FE077…`；`git stash list` 同样为空，只留悬空 commit `7a472ea6`。⇒ 「内容还在」是那次 `apply` 恰好成功，**不是设计保证**。
- **修法**：`.husky/pre-commit` 改为 `npx lint-staged --no-stash --no-hide-partially-staged`（上游 `--no-stash` 本就 `implies` 关掉 hide；第二个 flag 写死，防将来 imply 变化后悄悄退回"藏了未暂存部分却没有备份可还原"—— 那条路失败时必丢）。修后 lint-staged 在**任何路径**都不碰工作树与索引：不 `stash create`、不 `reset --hard`、不 `checkout --force`、不 `stash drop`。逐字实测：`[FAILED]` + `exit=1`（拦截力不变，`husky - pre-commit script failed (code 1)`、HEAD 未动）；未暂存改动 **sha256 前后相同**；部分暂存（同一文件一段已暂存、一段未暂存）**工作树同样逐字相同**。
- **代价（须知）**：上游把 hide 与 stash 绑在一起，故关掉 stash 必然一并失去 hide —— ① 门禁看到的是**工作树态**而不再是"隐去未暂存部分的索引态"；本仓两个任务都是**全树只读扫描**，看工作树反而口径单一，故可接受（**Step 1 的第 1 条行为说明自本条起不再成立**）。② 落在 `docs/**/*.md`、`app/**/*.{ts,tsx,rs}` 或三文件条目上的**部分暂存文件会在跑完时被 `git add` 整文件入暂存区**（`state.js`：`!shouldBackup` 时 `applyModifications` 不因任务失败而跳过）⇒ **不丢内容，但抹掉"只提交一半"的意图**：提交前看 `git status`（`MM` 会变 `M `）。③ 存在部分暂存时会残留 `.git/lint-staged_unstaged.patch`（没有步骤再删它）。
- **补救指引（失败后怀疑丢了改动）**：备份是 `WIP on <分支>: <HEAD>` 的**悬空 commit**，`git stash list` 为空**不代表**它不存在：

  ```powershell
  git fsck --dangling                    # 或 git fsck --lost-found：列出悬空 commit
  git log -1 --format='%H %s' <备份ID>    # 备份ID = 当次 lint-staged 打印的 (c85e00a1)
  git diff --name-status HEAD <备份ID>    # 先确认它确实含你的改动
  git stash apply --index <备份ID>        # 整份还原（索引 + 工作树）
  git checkout <备份ID> -- <path>         # 只找回单个文件（不引入 stash）
  ```

  实例：控制方那次备份 `c85e00a1`（`c85e00a1e69c…`）至今可读，`git show c85e00a1:docs/standards/README.md` 就是丢掉的那 44 行版本（sha256 `4250548E…`；干净版为 `9DC65378…`）。

- **★ 二轮后的现状（2026-09-11，`31b59239`）**：本节记录的**整类风险已随 lint-staged 一起从路径上消失** —— `.husky/pre-commit` 不再调用 lint-staged（见 Step 1 的最终接线），故上面的「修法」两个 flag、以及「代价」里的 ②「`MM` 跑完变 `M `」③「残留 `.git/lint-staged_unstaged.patch`」**都不再适用**（实测：部分暂存文件跑完仍是 `MM`、文件 sha256 前后相同）。**下面的补救指引仍然有效**（历史悬空 commit 依旧存在，找回方式不变；同理 `git gc --prune=now` 依旧禁止）。

---

### ★★ Task 4 带回的系统性发现：**本地门禁在本机从未武装**（`7476fd0b`）

实施者实测：**本克隆此前从未安装 husky** —— `core.hooksPath` **为空**、无 `.git/hooks/pre-commit`、无 `node_modules`。
⇒ **`.husky/pre-commit`（`npx lint-staged`）与 `.husky/commit-msg`（commitlint）在本机对所有提交都是静默失效的** —— 不只是 Task 4 之前，而是**历史上每一次提交**，**包括本批 Task 0–3 的交付提交**。
**旁证（控制方）**：本会话我提交了 40+ 次，**从未见过任何 lint-staged 或 commitlint 输出** —— 与"钩子从未运行"完全一致。

**它第一次探针提交因此意外成功**（hook 输出 0 字节），已按指令 `git reset --soft HEAD~1` 撤回；随后 `npm install --no-save --no-package-lock` + `npm run prepare` **武装门禁**，才取得真实拦截证据（`(c) 超过 300 行但未登记：app/src/__probe-lines.ts（320 行）`、`husky - pre-commit script failed`、`commit-exit=1`、HEAD 未动）。副作用是两项**非 tracked 环境变更**：`node_modules/`（433 包、**未生成 `package-lock.json`**）与 `.git/config` 的 `core.hooksPath=.husky/_`。

**控制方裁决**：**保留武装**（这正是 Task 4 的目的；两项变更都不进 git，工作树仍只 `?? docs/tech-debt/`）。
**⇒ 必须一并记住的三件事**：
1. **本批（乃至 0-A/0-B）至今没有任何自动化门禁跑过**：本地门禁此前失效、CI 又因 **67 个提交未推送**而未触发。所有校验都是**人工/子代理跑出来的**（有证据），但**从未被强制**。⇒ 建议推送到 `dev` 以激活 CI（属用户决策）。
2. **提交信息规范（AGENTS.md §5，subject ≤50 字等）此前也未被 commitlint 校验**；现已武装，**后续提交会真被拦**。
3. **新克隆若未 `npm install`，门禁默认静默失效** —— 没有任何机制会提醒。这是本批发现的**环境依赖**，已写入 `7476fd0b` 的提交信息；Task 5 应把它一并回写进 `v0.22.md`（属"工具链真相"的一部分）。

---

### Task 5: 回写与批次验收

**Files:**
- Modify: `docs/versions/v0.22.md`（门槛 1 的措辞）
- Modify: `docs/standards/README.md:11`（描述）
- Test: 文档门禁 + 全量门禁

**Interfaces:**
- Consumes: Task 1–4 的全部产物
- Produces: 批次 0-C1 的验收记录（供 0-C2/0-C3 引用）

- [ ] **Step 1: 改 v0.22 的门槛 1**

`docs/versions/v0.22.md` 的门槛 1 现为「4 个 >600 行文件 → 0；>300 行 100% 在豁免表内且数值与实测一致」，其下已有一条 2026-09-11 的事实注记（记录实测 15 个、门槛不可达、三种口径并存）。
**把注记改写为已裁决的状态**：
```
1. **15 个 >600 行文件 → 0**（实测值：前端 5 + Rust 10；规格原文的「4 个」只扫了前端且漏掉 `SessionListPanel.tsx`）；>300 行 **100% 在豁免表内且数值与实测一致**。
   > **2026-09-11 用户裁决**：范围取实测 15 个；口径取「全部行数」，**以 `[System.IO.File]::ReadAllLines(path, UTF8).Count` 为准**（即 `scripts/line-limits.mjs`），**禁用 `Get-Content`（少算可达 56 行）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数（末尾无换行时少算 1）**。
   > 执行机制：`node scripts/line-limits.mjs`（本地提交门禁 + CI `--full` 守数值），>600 用**棘轮**只减不增 —— 拆分由 0-C2（前端 5）/ 0-C3（Rust 10）推进，每拆完一个从 `FROZEN_OVER_LIMIT` 删一行。
```

- [ ] **Step 2: 改 standards/README 描述**

`docs/standards/README.md:11` 现为：
```
| [line-limit-exemptions.md](./line-limit-exemptions.md) | 行数豁免登记（>300 行文件清单，配合 ai-coding） | ✅ | ✅ |
```
改为：
```
| [line-limit-exemptions.md](./line-limit-exemptions.md) | 行数豁免登记（**生成物**，>300 行文件清单；口径与守卫见 `scripts/line-limits.mjs`） | ✅ | ✅ |
```

- [ ] **Step 2b: 一并回写三条"工具链真相"（Task 3/4 期间发现，勿漏）**

`docs/versions/v0.22.md` 的「本机工具链的读数陷阱」一节需要补三件事（该节已存在，是控制方在批 0-B 期间写下的）：

1. **★ 本地门禁此前从未武装**（Task 4 发现）：本克隆此前**从未安装 husky**（`core.hooksPath` 为空、无 `.git/hooks/pre-commit`、无 `node_modules`）⇒ `.husky/pre-commit`（当时是 lint-staged）与 `commit-msg`（commitlint）**对所有提交静默失效**，**包括批 0-A/0-B/0-C1 的全部交付提交**。⇒ **新克隆若未 `npm install`，门禁默认失效且无任何提示**。写清：现已武装（`node_modules` + `core.hooksPath=.husky/_`，两项均不进 git），且**后续提交会真被 pre-commit + commitlint 拦**（★ 二轮后 pre-commit 跑的是 `line-limits --full && docs-check`，**不再是 lint-staged**）。
2. **陷阱 1 的量级要写准**：源码域实测最大少算 **56 行**（`live_session_pause.rs` 353→297）；而**文档域可远超** —— 本批台账自身实测 **真实 385 行 / `Get-Content` 报 247 行（少算 138 行、36%）**，因为少算幅度随**中文密度**放大。⇒ 「禁用 `Get-Content` 数行」不是只对源码成立。
3. **门禁自身纳入校验**（Task 4 修复轮）：lint-staged 增加覆盖 `scripts/line-limits.mjs` 与 `docs/standards/line-limit-exemptions.md` 的条目（跑 `--full`）—— 否则"改工具/改登记表"在本地无自动拦截。写进该节时请与 `package.json` 的实际内容一致。
   ⚠️ **★ 二轮已改写本条要求的落点**：直跑全树的最终接线（Task 4 Step 1）让 `--full` **每次提交都跑**、不再靠"暂存到某个文件才触发"，`lint-staged` 块也已从 `package.json` 删除。`docs/versions/v0.22.md` 的该段已按新架构改写（并如实登记「CI 从未跑过、最近 5 次 `PR Quality Check` 全为 failure ⇒ CI 兜底在修好前不成立」）——**不要**再照本条的旧措辞回写。

- [ ] **Step 3: 全量门禁**

```powershell
node scripts/line-limits.mjs --full      ; "line-limits=$LASTEXITCODE"
node scripts/docs-check.mjs              ; "docs-check=$LASTEXITCODE"
cd app; npx tsc --noEmit                 ; "tsc=$LASTEXITCODE"
npx vitest run 2>&1 | Select-String 'Test Files|Tests '
cd ..\app\src-tauri; cargo test --test app_lib_tests 2> $env:TEMP\ct.txt | Select-String 'test result'
"cargo=$LASTEXITCODE"
```
Expected: 全部 0。⚠️ **cargo 用 `--test app_lib_tests`**：本机 `cargo test --lib` 因 onnxruntime DLL 版本冲突在加载期崩（`0xc0000139`，与代码无关，已登记于 v0.22）。⚠️ **不要用 `2>&1 |`** 判定 cargo 结果。

- [ ] **Step 4: 提交**

```powershell
git add docs/versions/v0.22.md docs/standards/README.md
git commit -m "docs(versions): 0-C1 行数红线验收与门槛更正"
```

- [ ] **Step 5: 批次自审记录（写进提交信息或计划末尾）**

逐条回答，**不要用「已达成」敷衍**：
1. 口径是否**只有一处实现**（`countLines`）？还有没有别处按旧口径数行（grep `Measure-Object -Line`、`Get-Content` 在 `scripts/`、`docs/`、`.github/` 下的出现）？
2. 四条不变式是否**各自**用变异探针证明过会失败？
3. 登记表是否**只剩一条有效路径一行**（`parseTable` 的行数 == 去重后的路径数）？
4. `>600` 是否仍是 **15**（本批不拆文件，数字不应变化）？
5. 新增脚本自身是否 ≤300 行？⚠️ **不能**用 `node scripts/line-limits.mjs` 自己量 —— 它的扫描域**只有** `app/src` 与 `app/src-tauri/src`，**不含 `scripts/`**（刻意的边界：`.mjs` 不在本批口径内，见「未做（登记）」）。请直接量：`[System.IO.File]::ReadAllLines('scripts/line-limits.mjs', [Text.Encoding]::UTF8).Count`。

---

## 完成本计划后的状态

- **红线的口径唯一且写进规范**：AGENTS.md §3.1 / §11 / refactoring.md / 表头四处同一措辞
- **登记表是快照而非日志**：138 条（15 超硬限 + 123 登记档），一文件一行，数字由生成器独占维护
- **>600 有棘轮守卫**：15 个违规**可见、只减不增**；每完成一个拆分删一行
- **门禁只跑一份程序、且那份是最新的**：`docs-check` 的模板源与实例经守卫强制逐字节一致（此前实例落后于模板一处修复，门禁在干净树上本就是红的）；`line-limits` 在**每次提交**（`.husky/pre-commit` 直跑 `--full`，不经 lint-staged、不依赖 glob）与**每次推送**（CI `line-limits` job 跑 `--full`）**同口径**执行 —— 结构 (a)–(d) 与数值 (e) 两处都守
- **仍未做**：15 个文件的实际拆分 → `0-C2`（前端 5）/ `0-C3`（Rust 10）

## 未做（登记）

- **15 个 >600 文件的拆分**：`0-C2`（`ClassroomPage.tsx` / `SessionDetailPanel.tsx` / `NoteListView.tsx` / `SessionListPanel.tsx` / `NotesPage.tsx`）与 `0-C3`（`lib.rs` / `types.rs` / `live_session_frame.rs` / `commands_ai_refine.rs` / `db_goals.rs` / `commands_goals.rs` / `ai_refine_task.rs` / `note_filter.rs` / `artifact_templates.rs` / `video_profile.rs`）。`0-C3` 含 `lib.rs`（AGENTS.md §10 需额外审查：Tauri command 注册边界）。
- **`scripts/validate-all.mjs` 已失效**：它引用 `client/`、`server/ai-gateway` 等**本仓库不存在的目录**（重构前遗留），跑起来第一步即失败。并行审查曾建议把行数守卫挂进它 —— **该建议的前提不成立**（落点本身是坏的）。修它或删它属独立治理项。
- **`REQ-201` 状态标注**、豁免表历史节的进一步精简：不属本批。
- **`.github/workflows/pr-check.yml` 的 `line-limits` job 注释已过期**：它仍写「本地提交门禁默认只守结构」与「故本地改为在『门禁自身/登记表被改动』时跑它（见 `package.json` 的 lint-staged 条目）」，而这两点已被二轮接线推翻（本地每次提交都跑 `--full`）与删除（该 `lint-staged` 块已不存在）。本批的**铁律边界明确不动该文件**（CI job 保留，行为仍正确 —— 照跑 `node scripts/line-limits.mjs --full`），故注释更正登记为独立治理项。
- **★ 自动摘取的 43 条理由里有 16 条在连接符处截断**（Task 3 实施者实测）：`autoReason` 只取 `@ai-context` 的**第一个物理行**，于是形如「…（自动摘取，待细化）」的理由中，有 16 条是半句话（以「，」「——」「+」等结尾）。**不算缺陷**（表格的验收口径是**结构一致性**：成员关系 + 数值，不含散文质量），且**修法零人工成本** —— 表格是生成物，改 `autoReason` 让它续读后续物理行直到句末或空行，再跑一次 `--write` 即可整体刷新。⇒ **并入 `0-C2` 顺手做**（建议同时把理由上限截到合理长度）。
- **★ 扫描域外的 4 个 `app/**` 源文件（glob 假覆盖的另一半）**：旧门禁的 glob `app/**/*.{ts,tsx,rs}` 命中 **872** 个 tracked 文件，而 `SCAN_DIRS` 只覆盖 **868** 个 ⇒ 下列 4 个文件**从来不在守卫视野内**（`(a)`/`(c)` 永远看不到它们：长到 700 行本地仍绿）：**`app/src-tauri/build.rs`（152 行）**、**`app/src-tauri/examples/capture_ocr_diag.rs`（208 行）**、`app/vite.config.ts`（40 行）、`app/vitest.config.ts`（23 行）。本批**不扩域**（铁律边界未动 `SCAN_DIRS`；四个都 ≤300、当前无违规）。二轮后门禁已直跑全树、**"命令跑了却看不见"这层假覆盖消失**，但这 4 个文件本身**仍未纳入登记表** —— 扩域须另立批次（理由同下一条）。
- **扫描域不含 `scripts/` 与 `docs/`**：本批的口径域**只有** `app/src` + `app/src-tauri/src` 的 `.ts/.tsx/.rs`（868 个文件）。AGENTS.md §3 说"单文件 ≤300 行"字面上是**全仓**要求，故这是一处**有意的窄化**：`scripts/**`（现 **80–299 行**，含本批的 `line-limits.mjs` = **299**）与 `docs/**` 未纳入登记表，也**不会**被守卫拦 ⇒ **`line-limits.mjs` 自己不被自己看守**。若要扩域，须另立批次（并先把 `SOURCE_EXT` 与登记表节的措辞一起改）。
- **超硬限表里 10 行的拆分计划仍写「若再增长：…」**（继承来的人工文字；生成器只对**没有**人工计划的超硬限行写「**超硬限必须拆**」）。对**已经**越限的文件，这个前缀有误导性（像在说"长大了才拆"）。
  ⇒ **控制方裁定：不修**。理由有两条：① 强制语气已由**两处**承载（节标题「>600 行，必须硬拆，不允许豁免」+ 该行 `说明` 列逐行重复「超硬限（>600 行），不允许豁免」），`拆分计划` 列只回答"**拆什么**"；② **这些行正是 `0-C2`/`0-C3` 要拆掉的文件，拆完行就从表里消失** —— 给它们改措辞是**会被蒸发的工作**。若 0-C2/C3 因故长期不做，再回来改前缀（一行正则 + 重跑 `--write`）。

> **执行结果（2026-09-11 收尾时补记）**：Task 0–5 已全部交付。工具现为**绿**（默认与 `--full` 都 `exit=0`，stderr 0 字节），登记表 **138 条 / 179 行**、历史节 16 条、占位符 0、脚本 **299 行**（二轮把 docblock 等价性措辞改准、并给 `--full` 成功文案加「· 数值一致」标记后 **余量只剩 1 行**）。
> ⚠️ **`line-limits.mjs` 的 300 行余量只剩 1 行** ⇒ `0-C2` 拟并入的 `autoReason` 续行改进（见上）**几乎必然越线**，届时须在「**写紧**」（合并重复分支、缩短注释）与「**拆文件**」（把 `check` 与 `writeTable` 分文件）之间二选一 —— **不要**因为"它是工具"就默认它可豁免。
> 门禁接线两轮收敛：一版加固（`--no-stash --no-hide-partially-staged`，见 Task 4 节末尾）→ **二轮直接绕开 lint-staged**（`.husky/pre-commit` 每次提交直跑 `node scripts/line-limits.mjs --full && node scripts/docs-check.mjs`，`package.json` 的 `lint-staged` 块删除；见 Task 4 Step 1 的最终接线）。故「部分暂存的文件跑完会被整文件 `git add`」这条**代价已不存在**（实测 `MM` 跑完仍是 `MM`、文件 sha256 不变），本文档早先那句「校验看到的是即将提交的状态」同样不成立（Task 5 已就地修正）。

## 自审记录

**规范覆盖**：本计划对应规格 §10 批 0 行内的「豁免表纠偏」与 §11 验收口径第 1 条；已在 Task 5 Step 1 回写门槛措辞与实测值。
**占位符扫描**：无 TBD/TODO；脚本代码、命令、期望输出均为具体字面量；唯一需要实施者填写的空是 **Task 3 Step 3 的 45 条人工理由**，那是刻意的（生成器只摘取事实，理由需要人判断）。
**类型一致性**：`countLines` / `scanTree` / `parseTable` / `parseReasons` / `autoReason` / `parseHistory` / `writeTable` / `check` 的名称与签名在本计划内一致；`FROZEN_OVER_LIMIT` / `HARD_LIMIT` / `SOFT_LIMIT` / `TABLE_PATH` 四处引用同名同义。
**数字来源**：本计划中所有「实测」数字均由控制方以 `[System.IO.File]::ReadAllLines(p, [Text.Encoding]::UTF8).Count` 全量扫描 **868 个文件**（前端 328 + Rust 540）得出，**不是**转述他人报告；可复现的复核脚本见 SDD 工作区 `.superpowers/sdd/probe-exemption-table.mjs`（该目录被 gitignore，故此处同时给出方法：递归 `app/src` + `app/src-tauri/src` 下 `.ts/.tsx/.rs`，用上述 `ReadAllLines` 口径计数，再与登记表的 `| 路径 | 数字 |` 行比对）。Task 2 的脚本代码**已在真实路径上实跑验证**（见 Task 2 Step 2 的说明），不是纸面推演。
