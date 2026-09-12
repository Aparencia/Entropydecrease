import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * @ai-context **棘轮守卫**：裸数字 z-index 只许减少（ADR-032 决策 5 的执行手段）。
 *
 * Why：批 0-A 已交付六档标尺 `ui/zIndex.ts`（消费方式 `zIndex("modal")`）。批 4 的 T4
 * 之前全仓有 **43 文件 / 58 行**裸数字，17 个值分裂成 10…61 与 900…1150 两个**不相交**的段
 * —— 叠放顺序是涌现的而不是被设计的。T4 已把这 58 处整段迁完：**53 处**落档、**5 处**
 * 例外（3 个 B2 覆盖层 + `ChatPage.tsx` 交 T13-b 拆件的 2 处）。本守卫的职责随之从
 * 「不许新增」升级为**双向**：① 全仓裸数字必须**恰好**等于例外注册表；② 注册表不得过期；
 * ③ 注册表每项必须带理由（B2：例外不许静默）；④ `ChatPage` 的 2 处必须由 T13-b 收口。
 *
 * 副作用：只读磁盘（递归遍历 `app/src` + 定点读例外文件）。不修改任何文件。
 *
 * ★ 检索口径（四项逐条声明 —— 口径本身是守卫的一部分，改口径等于改守卫）
 *   ① 范围：`app/src` 递归；文件 = `*.ts` / `*.tsx`（内联 `zIndex: <num>`）与
 *      `*.css`（`z-index: <num>`）。**不含** `.mjs`（token 生成器在 `app/scripts/`，
 *      不在 `app/src` 下）、不含 `app/src-tauri`（无 TS）。
 *   ② 排除测试：路径以 `.test.ts` / `.test.tsx` 结尾者**整体跳过**。理由是实测的 3 行
 *      `components/CanvasNodes.test.tsx:38,41,44` 的 `zIndex: 0` 是 React Flow 的
 *      **节点字段**而**不是样式**（把它算进来会让名单混入非样式命中，棘轮语义被稀释）。
 *      已知缺口：测试文件里新增的裸数字**样式**同样不会被拦下（测试不承载观感契约）。
 *   ③ `ui/zIndex.ts` 自身**不豁免**：它用 `Z_TIER` 常量表定义档位，不出现 `zIndex: <num>`
 *      形态，故天然 0 命中；最后一个 `it` 把「它在扫描域内且自身 0 命中」钉成断言 ——
 *      若有人在标尺模块里写死裸数字，本守卫照样红。
 *   ④ 匹配形态：`/zIndex\s*:\s*-?\d+/`（内联）与 `/z-index\s*:\s*-?\d+/`（CSS）。
 *      合法写法 `zIndex: zIndex("modal")` / `z-index: var(--ed-…)` **不匹配**、不被误伤；
 *      字符串形态 `zIndex: "300"` 与 `zIndex:` 换行到下一行的写法**不匹配**（已知缺口，已登记）。
 *      命中键 = `相对 app/src 的正斜杠路径::该行 trim 后的原文` —— **刻意不含行号**：行号会随
 *      上方插行／删行漂移，把名单变成天天假红的噪声源；报错信息里则带 **路径:行号** 便于定位。
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 内联形态（TS/TSX）：`zIndex: 300` · `zIndex:300` · `zIndex: -1` */
const INLINE_PATTERN = /zIndex\s*:\s*-?\d+/;
/** CSS 形态：`z-index: 300`（`z-index: var(--ed-…)` 不匹配） */
const CSS_PATTERN = /z-index\s*:\s*-?\d+/;

/** 一条命中：`key` 进冻结名单（无行号，抗行漂移）；`location` 只用于报错定位 */
interface RawZIndexHit {
  key: string;
  location: string;
  text: string;
}

/**
 * **ZINDEX_ACCOUNTS**（T4 之后唯一被授权保留的裸数字 z-index）—— 与 `FROZEN_NUMERIC_ZINDEX` 一一对应。
 * 两种账：`exception`（规格 §11-2 写明例外的系统交互面，保留裸值）与 `delegated`
 * （B7 的 `ChatPage.tsx`：先拆件再迁，本批不动）。
 *
 * 每条带 `why`：理由必须随代码走（B2 逐字「例外必须带理由，不许静默」）。
 * 理由非空且 >20 字由「例外注册表逐条带理由」那条 `it` 钉住。
 */
type ZIndexAccountKind = "exception" | "delegated";

interface ZIndexAccount {
  readonly file: string;
  readonly line: number;
  readonly value: number;
  /** `exception` = 保留裸值（规格 §11-2 的例外）；`delegated` = 本批不迁、已交下游任务 */
  readonly kind: ZIndexAccountKind;
  readonly why: string;
}

const ZINDEX_ACCOUNTS: readonly ZIndexAccount[] = [
  {
    file: "components/CaptureOverlayPanel.tsx",
    line: 144,
    value: 10,
    kind: "exception",
    why: "采集覆盖层的子操作条（确认/取消截图）：它就嵌在全屏采集覆盖层内部，迁档会把它踢出「覆盖层内部层」的语义",
  },
  {
    file: "components/ImagePreviewOverlay.tsx",
    line: 32,
    value: 1000,
    kind: "exception",
    why: "系统交互面（图片查看：zoom-out 遮罩 + 92vw 大图）：迁 modal(300) 会让大图落到对话框档之下",
  },
  {
    file: "components/ScreenSelectOverlay.tsx",
    line: 149,
    value: 999,
    kind: "exception",
    why: "系统交互面（全屏十字光标屏幕点选）：迁 modal(300) 会让采集面被任何弹层盖住",
  },
  {
    file: "pages/ChatPage.tsx",
    line: 504,
    value: 30,
    kind: "delegated",
    why: "B7：ChatPage.tsx 599/600 先拆件（T13-b）再迁移 ⇒ 本批不动它，拆件时改用 zIndex(\"popover\")",
  },
  {
    file: "pages/ChatPage.tsx",
    line: 505,
    value: 31,
    kind: "delegated",
    why: "同上（同一对：透明点击层 + 锚定发起菜单，层内相对序由 DOM 序保持）",
  },
];

/** 例外集（保留裸值的那几条）—— 规格 §11-2 的例外判据逐条落地 */
const ZINDEX_EXCEPTIONS = ZINDEX_ACCOUNTS.filter((a) => a.kind === "exception");

/** 已委托集（本批不迁、交下游任务）—— B7 的 `ChatPage.tsx` */
const ZINDEX_DELEGATED = ZINDEX_ACCOUNTS.filter((a) => a.kind === "delegated");

/**
 * 委托面基线（B7 / T13-b 的 `ChatPage.tsx` 两处裸值）—— **本判据的真源**。
 *
 * 刻意**独立于** `ZINDEX_ACCOUNTS`：委托账从注册表里整段消失时，`ZINDEX_DELEGATED` 会变空、
 * 「实际 == 注册表」会退化成 `[] == []` 的**空真**（实测 M7 全绿）。用这份写死的基线兜底 ⇒
 * 无论注册表怎么删，ChatPage 的两处裸值都必须能被解释。
 */
const CHATPAGE_DELEGATED_BASELINE: readonly { readonly line: number; readonly value: number }[] = [
  { line: 504, value: 30 },
  { line: 505, value: 31 },
];

/**
 * 改造前就存在的裸数字 z-index（相对 `app/src`，正斜杠）—— **只允许减少**。
 *
 * 批 4 T4 逐段迁移后收口到**例外集**（与 `ZINDEX_ACCOUNTS` 一一对应）：名单从 58 条删到
 * 「规格 §11-2 写明例外」的 3 条 + 「B7 交给 T13-b 拆件」的 2 条，与 `FROZEN_OVER_LIMIT`
 * 的棘轮同源 —— 名单只能缩短。
 */
const FROZEN_NUMERIC_ZINDEX: readonly string[] = [
  "components/CaptureOverlayPanel.tsx::<div style={{ position: \"fixed\", bottom: 24, left: \"50%\", transform: \"translateX(-50%)\", display: \"flex\", gap: 8, zIndex: 10 }}>",
  "components/ImagePreviewOverlay.tsx::zIndex: 1000,",
  "components/ScreenSelectOverlay.tsx::style={{ position: \"fixed\", inset: 0, zIndex: 999, background: \"rgba(17,24,39,0.45)\", cursor: \"crosshair\" }}",
  "pages/ChatPage.tsx::<div data-testid=\"task-launch-menu\" data-app-menu=\"\" style={{ position: \"absolute\", top: \"100%\", left: 0, zIndex: 31, background: \"#fff\", border: \"1px solid #e5e7eb\", borderRadius: 6, padding: 4, boxShadow: \"0 4px 12px rgba(0,0,0,0.12)\", minWidth: 180 }}>",
  "pages/ChatPage.tsx::<div onClick={() => setLaunchMenuOpen(false)} style={{ position: \"fixed\", inset: 0, zIndex: 30, background: \"transparent\" }} />",
];

/** 递归收集 `app/src` 下受管辖的源文件（口径①） */
function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (/\.tsx?$/.test(entry) || entry.endsWith(".css")) out.push(full);
  }
  return out;
}

/** 按口径①②④ 扫描给定文件列表（默认 = 全 `app/src`），返回按 `key` 排序的命中明细 */
function numericZIndexHits(files: readonly string[] = collectFiles(SRC)): RawZIndexHit[] {
  const hits: RawZIndexHit[] = [];
  for (const file of files) {
    const isCss = file.endsWith(".css");
    if (!isCss && /\.test\.tsx?$/.test(file)) continue; // 口径②
    const rel = relative(SRC, file).split(sep).join("/");
    const pattern = isCss ? CSS_PATTERN : INLINE_PATTERN;
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (!pattern.test(line)) return;
        const text = line.trim();
        hits.push({ key: `${rel}::${text}`, location: `${rel}:${index + 1}`, text });
      });
  }
  return hits.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** 违规明细格式 = `相对路径:行号  该行原文`（报错必须点名到行，否则无法定位） */
function describeHits(hits: readonly RawZIndexHit[]): string {
  return hits.map((h) => `${h.location}  ${h.text}`).join("\n");
}

/** 把注册表里的相对路径解析成绝对文件路径（**去重**；直接传给扫描器：只有默认参数才做目录递归） */
function resolveFiles(entries: readonly { readonly file: string }[]): string[] {
  return [...new Set(entries.map((e) => join(SRC, ...e.file.split("/"))))];
}

/** 按 `相对路径:行号` 排序 —— 消掉「注册表声明序」与「命中按整行原文排序」的口径差 */
function byLocation(sites: readonly string[]): string[] {
  return [...sites].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** 一处站点的三元组 `相对路径:行号 → 裸值`（供例外注册表与源码对拍） */
function bareZIndexSites(hits: readonly RawZIndexHit[]): string[] {
  return hits.map((h) => `${h.location} → ${bareValueOf(h)}`);
}

/** 该行的裸值（`?` = 口径④的正则没抓到位，属仪器故障，必须显形而不是静默） */
function bareValueOf(hit: RawZIndexHit): string {
  return /(?:zIndex|z-index)\s*:\s*(-?\d+)/.exec(hit.text)?.[1] ?? "?";
}

/** 一处站点的二元组 `相对路径 → 裸值`（行号会随拆件重排的文件用这个口径比） */
function bareZIndexByFile(hits: readonly RawZIndexHit[]): string[] {
  return hits.map((h) => `${h.location.replace(/:\d+$/, "")} → ${bareValueOf(h)}`);
}

describe("z-index 棘轮", () => {
  it("不得新增裸数字 z-index（只允许减少）", () => {
    const current = numericZIndexHits();
    const added = current.filter((h) => !FROZEN_NUMERIC_ZINDEX.includes(h.key));
    expect(
      added.map((h) => `${h.location}  ${h.text}`),
      `新增了裸数字 z-index（请改用 zIndex("<档名>")，六档见 ui/zIndex.ts）：\n${describeHits(added)}`,
    ).toEqual([]);
    // 名单无重复（第 3 个 it）⇒「命中行数 ≤ 名单长度」就等价于棘轮单调。这一条闭合上面那条
    // 集合差集的漏洞：在同一文件里**整行复制**一条文本完全相同的 `zIndex: 1000,`，key 会撞车。
    expect(current.length, "裸数字 z-index 的行数变多了（只允许减少）").toBeLessThanOrEqual(
      FROZEN_NUMERIC_ZINDEX.length,
    );
  });

  it("冻结名单没有过期项（批 4 迁完要及时从名单删除）", () => {
    const current = new Set(numericZIndexHits().map((h) => h.key));
    const stale = FROZEN_NUMERIC_ZINDEX.filter((key) => !current.has(key));
    expect(stale, `名单里这些行已不含裸数字 z-index，请删除：\n${stale.join("\n")}`).toEqual([]);
  });

  it("名单非空且已排序、无重复（防空名单/失序把棘轮静默关掉）", () => {
    expect(FROZEN_NUMERIC_ZINDEX.length).toBeGreaterThan(0);
    expect([...FROZEN_NUMERIC_ZINDEX]).toEqual([...FROZEN_NUMERIC_ZINDEX].sort());
    expect(new Set(FROZEN_NUMERIC_ZINDEX).size).toBe(FROZEN_NUMERIC_ZINDEX.length);
  });

  it("例外注册表逐条带理由，且与冻结名单一一对应（B2：例外不许静默）", () => {
    // 阴性样本：空理由必须被判为不合格（否则「把 why 留空」就是静默收口）
    const bad = ZINDEX_ACCOUNTS.filter((e) => e.why.trim().length <= 20).map((e) => `${e.file} 缺理由`);
    expect(bad).toEqual([]);
    expect(ZINDEX_EXCEPTIONS.length, "B2 的例外集不能为空（3 个覆盖层必须留账）").toBe(3);
    expect(ZINDEX_ACCOUNTS.length, "注册表与冻结名单条数不一致").toBe(FROZEN_NUMERIC_ZINDEX.length);
    // 注册表 ↔ 冻结名单：注册表每一处都能在名单里找到同键（少一条就红）
    const keys = new Set(FROZEN_NUMERIC_ZINDEX);
    const missing = numericZIndexHits(resolveFiles(ZINDEX_ACCOUNTS)).filter((h) => !keys.has(h.key));
    expect(missing.map((h) => `${h.location}  ${h.text}`), "注册表条目与冻结名单键不一致").toEqual([]);
  });

  it("例外注册表与源码逐行对拍（双向：不多不少、行号不漂移）", () => {
    const hits = numericZIndexHits();
    // ① 反方向覆盖：裸数字**必须恰好**是注册表那几处（少一处=被静默删，多一处=偷加裸数字）
    //    两侧都按 `路径:行号` 排序 —— 命中序按整行原文、注册表序按声明，不排序会把口径差报成假红
    const expected = ZINDEX_ACCOUNTS.map((e) => `${e.file}:${e.line} → ${e.value}`);
    expect(byLocation(bareZIndexSites(hits)), "裸数字 z-index 的实测集合与例外注册表不一致").toEqual(
      byLocation(expected),
    );
    // ② 行号锚点：`line` 必须真的是那一行（防行号漂移后注册表变成谎话）
    for (const e of ZINDEX_ACCOUNTS) {
      const line = readFileSync(join(SRC, ...e.file.split("/")), "utf8").split(/\r?\n/)[e.line - 1] ?? "";
      expect(line, `${e.file}:${e.line} 不是注册表声称的那一行`).toContain(`zIndex: ${e.value}`);
    }
    expect(hits.length, "仪器自检：对已知存在的 5 处应命中 5").toBe(ZINDEX_ACCOUNTS.length);
  });

  it("`ChatPage.tsx` 的两处裸值仍由 T13-b 拆件任务收口（本批不迁、但必须留账）", () => {
    // B7：`ChatPage.tsx` 599/600 先拆件再迁移 ⇒ 它的 2 处裸值**不算例外**，只算「已委托」。
    // 本条是**双向**的：裸值提前消失 ⇒ 红（「已委托」这句话过期了，必须从账上删）；
    // 裸值数目/值变了 ⇒ 红（委托面被悄悄改动）。把「交给 T13-b」从承诺变成会失败的判据。
    // 只比 `文件 → 值`（不比行号：拆件会重排 ChatPage，行号不是本条的语义）
    const hits = numericZIndexHits(resolveFiles(ZINDEX_DELEGATED));
    const actual = byLocation(bareZIndexByFile(hits));
    const expected = ZINDEX_DELEGATED.map((a) => `${a.file} → ${a.value}`);
    expect(actual, "ChatPage.tsx 的委托面已变：拆件完成后请从注册表删掉这两条").toEqual(byLocation(expected));
    // ★ 兜底（防「注册表删空 ⇒ [] == []」的空真；实测 M7 全绿的漏洞就出在这里）：
    //   把**独立基线**与注册表两边都钉住 —— 任何一侧偷偷清空都红。
    expect(ZINDEX_DELEGATED.length, "委托账不能空：ChatPage 的 2 处裸值必须留在账上（或从基线删掉并说明）").toBe(
      CHATPAGE_DELEGATED_BASELINE.length,
    );
    expect(
      ZINDEX_DELEGATED.map((a) => `${a.file.replace(/^.*\//, "")}#${a.value}`).sort(),
      "委托账的内容必须与独立基线一致（否则基线形同虚设）",
    ).toEqual(CHATPAGE_DELEGATED_BASELINE.map((b) => `ChatPage.tsx#${b.value}`).sort());
    // 仪器自检：同一扫描函数对已知存在的 3 条例外文件应命中 3；再对一个**域内 0 命中**的负样本
    // （`utils/entityLabel.ts`）应命中 0 —— 否则「命中数恰好」是假绿
    expect(numericZIndexHits(resolveFiles(ZINDEX_EXCEPTIONS)).length).toBe(3);
    expect(numericZIndexHits([join(SRC, "utils", "entityLabel.ts")]).length, "负样本控件失效").toBe(0);
  });

  it("扫描域锚点：标尺模块在扫描域内且自身 0 命中（口径③：不设豁免）", () => {
    const inDomain = collectFiles(SRC).map((f) => relative(SRC, f).split(sep).join("/"));
    expect(inDomain.includes("ui/zIndex.ts"), "标尺模块掉出了扫描域（口径①失效）").toBe(true);
    const fromScale = numericZIndexHits().filter((h) => h.location.startsWith("ui/zIndex.ts:"));
    expect(fromScale.map((h) => h.location), "标尺模块里出现了裸数字 z-index").toEqual([]);
  });
});
