# 批 0-C1 行数红线落地（口径 + 登记表重建 + 棘轮守卫）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AGENTS.md §3 的行数红线**第一次成为可执行、可验收、不漂移的规则**：钉死测量口径、把「只追加的历史日志」重建成「一文件一行的快照登记表」、并给 >600 硬限装上只减不增的棘轮守卫。

**Architecture:** 单一工具 `scripts/line-limits.mjs` 同时承担**生成**（`--write`）与**校验**（默认 / `--full`）两种职责，保证「写」与「查」用的是同一套口径与同一份逻辑。登记表仍是**人可读的 Markdown**（沿用仓库文档习惯、可被 `docs-check` 覆盖），但其**行数与条目成员关系由生成器独占维护**，「豁免理由 / 拆分计划」两列由人工维护、生成器按路径保留。>600 硬限用**棘轮**（冻结当前 15 个文件，只允许减少）而非「立刻为零」——否则守卫在拆分完成前无法启用，等于又一个「写了但没人守」的规则。

**Tech Stack:** Node ESM（`node:fs` / `node:path`，零依赖）· Markdown 登记表 · lint-staged + husky（本地门禁）· GitHub Actions `pr-check.yml`（远端门禁）

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
| `scripts/docs-check.mjs` | **实例** —— lint-staged / `npm run docs:check` / CI 三处真正执行的那份 |

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
  const m = /@ai-context[：:]?\s*([^\n*]+)/.exec(src);
  if (!m) return '（待补理由：本条目由生成器补登）';
  return `${m[1].trim()}（自动摘取，待细化）`;
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
  const over = [...measured.entries()].filter(([, n]) => n > HARD_LIMIT).sort((a, b) => b[1] - a[1]);
  const band = [...measured.entries()].filter(([, n]) => n > SOFT_LIMIT && n <= HARD_LIMIT).sort((a, b) => b[1] - a[1]);
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

- [ ] **Step 3: 人工处理三件生成器不该擅自决定的事**

1. **45 条自动补登的理由**：逐条核对自动摘取的 `@ai-context` 首行是否恰当（多数应当可用）；`（待补理由）` 的条目必须人工补写。
2. **搬家不丢信息**：原表里嵌在表格中间的两处散注 —— 第 118 行（SessionsPage 审查快照说明）与第 121 行（`ai_refine_protocol.rs` 登记移除）—— 前者若已过时删除并在提交信息里说明，后者**移入「已拆分 / 登记移除记录」节**。
3. **历史节的完整性**：确认 `## 已拆分 / 登记移除记录` 的 13 条注记**一条不少**（逐字保留）。

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
提交信息里写明：**重建前后** —— 条目 117 行/95 路径 → 138 条（15 超硬限 + 123 登记档）；消除 12 组重复、1 条幽灵、45 条漏登、77 条数值偏差（其中 **10 个 >600 违规此前被 <600 的登记值伪装成合规**）。

---

### Task 4: 接线（本地提交门禁 + CI）

**Files:**
- Modify: `package.json`（lint-staged）
- Modify: `.github/workflows/pr-check.yml`（新增 line-limits job）
- Test: 变异探针 + 实跑

**Interfaces:**
- Consumes: Task 2/3 的 `scripts/line-limits.mjs`
- Produces: 让 (a)–(d) 在**每次提交**与**每次推送**时都被执行

- [ ] **Step 1: 接进 lint-staged**

`package.json` 的 `lint-staged` 现为：
```json
{
  "docs/**/*.md": "node scripts/docs-check.mjs"
}
```
改为：
```json
{
  "docs/**/*.md": "node scripts/docs-check.mjs",
  "app/**/*.{ts,tsx,rs}": "node scripts/line-limits.mjs"
}
```
（脚本忽略传入的文件名参数，只读全树 —— 这是刻意的：漏登与棘轮都是**全树性质**，只看暂存文件会漏。）

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
"↑ 期望：提交被 lint-staged 拦下并报 (c)"
Remove-Item app\src\__probe-lines.ts
git reset
```
（`git reset` 只取消暂存，不动工作树。）

- [ ] **Step 4: 验证 CI 配置合法**

```powershell
node -e "const s=require('fs').readFileSync('.github/workflows/pr-check.yml','utf8'); if(!/line-limits:/.test(s)) throw new Error('job 未写入'); console.log('job 存在，行数 ' + s.split('\n').length)"
```
（本机无 YAML 解析器，且 workflow 语法由 GitHub 侧校验；这里只做存在性与整体结构的粗检。）

- [ ] **Step 5: 提交**

```powershell
git add package.json .github/workflows/pr-check.yml
git commit -m "ci: 行数红线接入提交门禁与 CI"
```
⚠️ `.github/workflows/` 属 AGENTS.md §10「变更需额外审查」——请评审者确认 job 未引入密钥/权限面。

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
5. 新增脚本自身是否 ≤300 行（用 `node scripts/line-limits.mjs` 自己量自己）？

---

## 完成本计划后的状态

- **红线的口径唯一且写进规范**：AGENTS.md §3.1 / §11 / refactoring.md / 表头四处同一措辞
- **登记表是快照而非日志**：138 条（15 超硬限 + 123 登记档），一文件一行，数字由生成器独占维护
- **>600 有棘轮守卫**：15 个违规**可见、只减不增**；每完成一个拆分删一行
- **门禁只跑一份程序、且那份是最新的**：`docs-check` 的模板源与实例经守卫强制逐字节一致（此前实例落后于模板一处修复，门禁在干净树上本就是红的）；`line-limits` 同时挂在 lint-staged（结构）与 CI（结构 + 数值）
- **仍未做**：15 个文件的实际拆分 → `0-C2`（前端 5）/ `0-C3`（Rust 10）

## 未做（登记）

- **15 个 >600 文件的拆分**：`0-C2`（`ClassroomPage.tsx` / `SessionDetailPanel.tsx` / `NoteListView.tsx` / `SessionListPanel.tsx` / `NotesPage.tsx`）与 `0-C3`（`lib.rs` / `types.rs` / `live_session_frame.rs` / `commands_ai_refine.rs` / `db_goals.rs` / `commands_goals.rs` / `ai_refine_task.rs` / `note_filter.rs` / `artifact_templates.rs` / `video_profile.rs`）。`0-C3` 含 `lib.rs`（AGENTS.md §10 需额外审查：Tauri command 注册边界）。
- **`scripts/validate-all.mjs` 已失效**：它引用 `client/`、`server/ai-gateway` 等**本仓库不存在的目录**（重构前遗留），跑起来第一步即失败。并行审查曾建议把行数守卫挂进它 —— **该建议的前提不成立**（落点本身是坏的）。修它或删它属独立治理项。
- **`REQ-201` 状态标注**、豁免表历史节的进一步精简：不属本批。

## 自审记录

**规范覆盖**：本计划对应规格 §10 批 0 行内的「豁免表纠偏」与 §11 验收口径第 1 条；已在 Task 5 Step 1 回写门槛措辞与实测值。
**占位符扫描**：无 TBD/TODO；脚本代码、命令、期望输出均为具体字面量；唯一需要实施者填写的空是 **Task 3 Step 3 的 45 条人工理由**，那是刻意的（生成器只摘取事实，理由需要人判断）。
**类型一致性**：`countLines` / `scanTree` / `parseTable` / `parseReasons` / `autoReason` / `parseHistory` / `writeTable` / `check` 的名称与签名在本计划内一致；`FROZEN_OVER_LIMIT` / `HARD_LIMIT` / `SOFT_LIMIT` / `TABLE_PATH` 四处引用同名同义。
**数字来源**：本计划中所有「实测」数字均由控制方以 `[System.IO.File]::ReadAllLines(p, [Text.Encoding]::UTF8).Count` 全量扫描 **868 个文件**（前端 328 + Rust 540）得出，**不是**转述他人报告；可复现的复核脚本见 SDD 工作区 `.superpowers/sdd/probe-exemption-table.mjs`（该目录被 gitignore，故此处同时给出方法：递归 `app/src` + `app/src-tauri/src` 下 `.ts/.tsx/.rs`，用上述 `ReadAllLines` 口径计数，再与登记表的 `| 路径 | 数字 |` 行比对）。Task 2 的脚本代码**已在真实路径上实跑验证**（见 Task 2 Step 2 的说明），不是纸面推演。
