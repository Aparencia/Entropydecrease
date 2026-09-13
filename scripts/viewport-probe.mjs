#!/usr/bin/env node
/**
 * 熵减观感 / 像素面仪器 · **真实产物视口探针**（批 8 T12 收编自批 3 T14 的 gitignored `tmp/` 仪器；源件 19,286 B / 298 行）。
 * 加载**真实构建产物 `app/dist`**（本地只读静态服务器 + 真 CDP 精密视口）量顶栏自然宽 / Tab 越界 / 纵向溢出，并按需读**任意选择器的解算样式与几何**（`--probe`）；规范登记：`docs/standards/testing.md` 第十部分。用法与盲区见本头注尾部。
 *
 * 🔴 盲区与硬要求（**必须随读数一起复述；漏一条 ⇒ 该读数不得当判据**）：
 *   1. 🔴 验的是 **WebView2 / Chromium 的渲染引擎**，**不是 IPC / 窗口层** ⇒ **不可替代真机冒烟**（U5 已裁跳过真机）。
 *   2. 🔴 headless 默认 `prefers-reduced-motion: reduce` ⇒ **必须显式调 `Emulation.setEmulatedMedia`**（默认 `no-preference`；`--reduced-motion reduce` 可反测降级路径）；不显式设置 ⇒ **动效类读数全部失真**（自检里验实测值 == 参数）。
 *   3. 🔴 headless **滚动条占位 = 0**（与真机不同）⇒ 依赖滚动条宽度的读数**不可用**（姊妹件 `scrollbar-cdp.mjs` 4,688 B / 105 行专测此面，**批 8 未收编**，登记为将来收编对象）。
 *   4. 🔴 必须用 `Emulation.setDeviceMetricsOverride` 定视口：`--window-size=800` 实测 `innerWidth=776`（**不一致**）。
 *   5. 🔴 `--dump-dom` 的 stdout **抓不到**（实测 0 字节）⇒ 读数只走 CDP `Runtime.evaluate` 或 `Page.captureScreenshot`。
 *   🔴 profile 卫生（**硬要求，非选项**）：profile **必须**落 `$env:TEMP`（`mkdtempSync` 唯一目录）且跑完删（`finally` 里删，异常路径同删）；落仓内会**一次喷进 1,241 文件 / 32.4 MB**（批 3 陷阱 #19；批 8 侦察阶段又复现一次）。
 *   🔴 零安装：本机 Edge 152.0.4191.66 已够用、Node 24 内建 `WebSocket` ⇒ **不得引入新依赖、不得 `npm install`**。不用 tauri-driver / Playwright / vitest browser 的理由：**都要装**，本机**有 TLS 拦截史**（`Cargo.toml:146-148`）⇒ `cargo install` 很可能失败；它们多给的只是 **IPC 真链路 = 真机范畴**（用户已裁跳过真机）。
 *
 * 判据分层（**强度不同，必须分别标注**）：① `documentElement.scrollWidth <= clientWidth`（整页无横向滚动）—— **仅供参考**（无 `window.__TAURI__` 时各页 IPC 全失败、渲染成错误态 ⇒ 整页宽被错误态文案影响）。② **顶栏自身**：`natural_w <= clientWidth`（**这才是判据**）。③ 逐个 Tab：`getBoundingClientRect().right <= innerWidth`（比 scrollWidth 更严格，**判据**）。④ 仪器自检：视口 `innerWidth === width` · `dpr === --dpr` · 固定块 500 · 文本哨兵 · 阳性对照（已知 id 必须命中 1）· 阴性对照（**每次现造的随机串**，必须 0 命中）· `emulatedMedia` 实测值 == `--reduced-motion`。
 *
 * 🔴 §17 受控对比纪律：每条读数**绑定 `app/dist` 的时点**（报告与 stdout 都带 dist mtime + 构造它的树 HEAD）⇒ 拿两次读数做差前**必须先证明两侧 dist mtime 与 HEAD 相同**；否则该差**只能作「上界 / 存在性」证据**，并显式声明它是**非受控对比**。
 * 口径（为什么用静态服务器而非 `file://`）：vite 产物 `index.html` 用**绝对路径** `/assets/…` + `crossorigin`，`file://` 下解析成 `file:///assets/…`（不存在）⇒ 实测 `#root` 子节点 = **0**（一片空白）⇒ 唯一可行口径 = **把 `--dist` 用本地只读静态服务器提供**（绑 127.0.0.1、结束即关）；`--mode file` 只用于复现该失败，其读数**不得**用作结论。加载真实产物 ⇒ **无法制造 toast**（只在 AI 动作后出现）⇒ toast 读数恒为「不存在」，那是事实不是缺陷。
 *
 * 用法：node scripts/viewport-probe.mjs --width 1024 --height 640 --dist app/dist [--port 9490] [--json <out.json>] \
 *        [--probe '<selector>:<cssProp>'] [--screenshot <out.png>]
 *   扩展（可选）：`--dpr 1` · `--reduced-motion no-preference|reduce` · `--mode http|file`。`--probe` 可重复；`<cssProp>` 收解算样式属性（含 `--custom-prop`，camelCase 一并收）与几何名 `rect|x|y|w|h`；输出路径按**仓库根**解析（绝对路径最稳，P-27）；每条 `--probe` 读数自带 `viewport`/`dpr`/`emulatedMedia` 元数据（缺 ⇒ 不得当判据）。
 *   退出码：0 = ②③ 判据与自检全过；1 = 有溢出或自检失败；2 = 产物缺失 / 端口失败 / profile 失败（含 CDP 未就绪）。行数（≤300 预算）：注入代码与调用语句**按行合并**（折行不是行为）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EDGE = process.env.ED_PROBE_EDGE ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const opt = (f, d) => (argv.indexOf(f) >= 0 && argv[argv.indexOf(f) + 1] !== undefined ? argv[argv.indexOf(f) + 1] : d);
const many = (f) => argv.flatMap((a, i) => (a === f && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const WIDTH = Number(opt("--width", "1024")), HEIGHT = Number(opt("--height", "640")), DPR = Number(opt("--dpr", "1"));
const PORT = Number(opt("--port", "9490")), MODE = opt("--mode", "http"), REDUCED = opt("--reduced-motion", "no-preference");
const DIST_DIR = resolve(ROOT, opt("--dist", "app/dist")), ENTRY = join(DIST_DIR, "index.html");
const outAbs = (v) => (v ? resolve(ROOT, v) : null), JSON_OUT = outAbs(opt("--json", null)), SHOT = outAbs(opt("--screenshot", null));
// `<selector>:<prop>[,<prop>…]` —— 选择器**可能含冒号**（`:root` / `a:hover`）⇒ 从**最后一个**冒号切
const splitProbe = (s) => { const i = s.lastIndexOf(":"); return i < 0 ? null : [s.slice(0, i), s.slice(i + 1).split(",").map((p) => p.trim()).filter(Boolean)]; };
const PROBES = many("--probe").map(splitProbe).filter(Boolean);

if (!existsSync(ENTRY)) { console.error(`❌ 找不到产物入口 ${ENTRY} —— 先跑「cd app; npm run build」。`); process.exit(2); }
/** 🔴 profile 落 `$env:TEMP`（硬要求）：`mkdtempSync` 造**唯一**目录，`finally` 里删（承批 3 陷阱 #19） */
let PROFILE = null; try { PROFILE = mkdtempSync(join(tmpdir(), "ed-probe-")); }
catch (err) { console.error(`❌ profile 目录创建失败（$env:TEMP=${tmpdir()}）：${err.message}`); process.exit(2); }
// 阴性对照**每次现造**（承 §C62.8：固定串 `zzz_no_such_symbol_zzz` 已入库 ⇒ 不再有证明力）
const NEG_ID = `zzz_no_such_${Math.random().toString(36).slice(2, 10)}`;

/** 注入真实页面的两把尺子 + 阳性对照锚（都在视口外，不影响布局） */
const INSTRUMENT = `
  const fix = document.createElement("div"), sen = document.createElement("span");
  fix.id = "vp-fix"; fix.style.cssText = "position:absolute;left:-9999px;top:0;width:500px;height:8px";
  sen.id = "vp-sentinel"; sen.textContent = "熵减本地知识";
  sen.style.cssText = "position:absolute;left:-9999px;top:0;font-family:system-ui,sans-serif;font-weight:700;font-size:15px;white-space:nowrap"; document.body.appendChild(fix); document.body.appendChild(sen);
`;

const MEASURE = `(() => {
  const px = (v) => Math.round(v * 100) / 100, num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const nav = document.querySelector('[data-testid="topbar"]');
  const out = {
    // ⚠️ 证明力边界：阴性选择器在页面里必然不存在 ⇒ 恒 0，只证明 querySelectorAll 没抛；★ 真阳性对照：已知 id 必须命中 1
    MISS_COUNT: document.querySelectorAll("#${NEG_ID}").length, MISS_POSITIVE_CONTROL: document.querySelectorAll("#vp-sentinel").length,
    viewport_innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, dpr: window.devicePixelRatio,
    fonts_status: document.fonts.status, fixed_500: px(document.getElementById("vp-fix").getBoundingClientRect().width),
    sentinel_text: px(document.getElementById("vp-sentinel").getBoundingClientRect().width),
    root_child_count: document.getElementById("root") ? document.getElementById("root").children.length : -1,
    has_topbar: !!nav, has_tauri_global: typeof window.__TAURI__ !== "undefined", toast_present: !!document.querySelector('[data-testid="ai-toast"]'),
    page_scroll_w: document.documentElement.scrollWidth, page_client_w: document.documentElement.clientWidth, body_scroll_w: document.body.scrollWidth,
    // ★ 盲区 #2 的实测面：emulatedMedia 必须与 --reduced-motion 一致（否则动效类读数失真）
    emulated_reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    emulated_color_scheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  };
  if (!nav) return out;
  const navRect = nav.getBoundingClientRect(), cs = getComputedStyle(nav), padR = num(cs.paddingRight);
  const kids = [...nav.children], saved = kids.map((k) => [k, k.style.flex, k.style.opacity]);
  const inner = kids.flatMap((k) => [...k.querySelectorAll("button")]), savedInner = inner.map((k) => [k, k.style.flex]);
  kids.forEach((k) => { k.style.flex = "0 0 auto"; k.style.opacity = "0"; }); inner.forEach((k) => { k.style.flex = "0 0 auto"; });
  // ⚠️ 仪器更正（批 3 实测踩到并修）：**不得**在这里把 Tab 文字元素强制成 inline —— 那会把「1024–1179 仅图标」这一档测成
  //   「≥1180 图标+文字」的宽度（首轮实测 1024 档因此报 886.36 px，比真值大 ≈270 px）。自然宽必须在**媒体查询的当前状态**下量。
  //   另：本注释原写带反引号的类名选择器 —— 那是批 3 陷阱 #17（模板字符串内的反引号会提前闭合）。
  const savedWidth = nav.style.width; nav.style.width = "max-content";
  const natural = px(nav.getBoundingClientRect().width);
  // 参考值：把文字强制显示后的自然宽（与规格 §6.1「约 1070px」的满档形态对照）
  const savedLabelDisp = [...nav.querySelectorAll(".ed-topbar__tab-label")].map((k) => [k, k.style.display]);
  savedLabelDisp.forEach(([k]) => { k.style.display = "inline"; });
  const naturalLabelsForced = px(nav.getBoundingClientRect().width);
  savedLabelDisp.forEach(([k, dd]) => { k.style.display = dd; });
  nav.style.width = savedWidth; savedInner.forEach(([k, f]) => { k.style.flex = f; });
  saved.forEach(([k, f, o]) => { k.style.flex = f; k.style.opacity = o; });
  const contentRight = navRect.right - padR, maxRight = Math.max(...[...nav.querySelectorAll("*")].map((e) => e.getBoundingClientRect().right));
  const tabs = [...nav.querySelectorAll('[data-testid^="topbar-tab-"]')].map((e) => ({
    // nav 的右缘（= 它在视口里的真实位置）—— 判据 ③ 用的就是这个
    key: e.getAttribute("data-testid").replace("topbar-tab-", ""), text: (e.textContent || "").trim(), right: px(e.getBoundingClientRect().right),
  }));
  const labels = [...nav.querySelectorAll(".ed-topbar__tab-label")], acts = [...nav.querySelectorAll(".ed-topbar__action-label")];
  // ★ A4 的硬要求：量 --nav-h（56）够不够（内容是 38px 级文字/图标行）
  return Object.assign(out, {
    nav_rect_w: px(navRect.width), nav_rect_h: px(navRect.height), nav_client_h: nav.clientHeight, nav_scroll_h: nav.scrollHeight,
    nav_padding_tb: num(cs.paddingTop) + num(cs.paddingBottom), nav_overflow_y: nav.scrollHeight > nav.clientHeight + 1,
    nav_content_h: px(Math.max(...[...nav.children].map((k) => k.getBoundingClientRect().height))),
    nav_natural_w_maxcontent: natural, nav_natural_w_labels_forced: naturalLabelsForced, tab_count: tabs.length, tabs,
    nav_overflow_px: px(natural - document.documentElement.clientWidth), nav_rendered_overflow_px: px(maxRight - contentRight),
    tab_label_visible: labels.length ? labels[0].getBoundingClientRect().width > 0 : null,
    action_label_visible: acts.length ? acts[0].getBoundingClientRect().width > 0 : null,
  });
})()`;

/**
 * `--probe` 读数（判据参数化）：**解算值必须来自 `getComputedStyle`** —— 读 `element.style` 是**内联**样式，对走类规则
 * 的元素恒为空串（那是 M5 变异体，具名判据见 `testing.md` 第十部分）。每条读数带 viewport / dpr / emulatedMedia 元数据。
 */
const PROBE_EXPR = `(() => {
  // 末项 = **探针自检 canary**（与用户读数**走同一条代码路径** ⇒ 它空则说明解算值来源被换成了内联样式）
  const specs = ${JSON.stringify([...PROBES, ["html", ["font-size"]]])};
  const meta = { viewport: { width: ${WIDTH}, height: ${HEIGHT}, innerWidth: window.innerWidth, innerHeight: window.innerHeight },
    dpr: window.devicePixelRatio,
    emulatedMedia: { prefersReducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      prefersColorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" } };
  const GEO = { rect: (r) => Math.round(r.width * 100) / 100 + "x" + Math.round(r.height * 100) / 100,
    x: (r) => r.x, y: (r) => r.y, w: (r) => r.width, h: (r) => r.height };
  const kebab = (p) => p.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
  return { meta, readings: specs.map(([sel, props]) => {
    const els = document.querySelectorAll(sel), el = els[0] || null;
    const cs = el ? getComputedStyle(el) : null, rect = el ? el.getBoundingClientRect() : null;
    const values = {};
    for (const p of props) values[p] = !el ? null : (p in GEO) ? GEO[p](rect)
      : p.startsWith("--") ? cs.getPropertyValue(p).trim() : cs.getPropertyValue(kebab(p)).trim();
    return Object.assign({ selector: sel, matched: els.length, values }, meta);
  }) };
})()`;

/** §17：构造 dist 的树 —— `.git/HEAD` 直读（不起子进程；worktree 形态读不到 ⇒ "unknown"） */
const HEAD = (() => { try { const h = readFileSync(join(ROOT, ".git", "HEAD"), "utf8").trim();
  return h.startsWith("ref: ") ? readFileSync(join(ROOT, ".git", h.slice(5)), "utf8").trim() : h;
} catch { return "unknown（.git/HEAD 不可读）"; } })();

const problems = [];
let exitCode = 0, server = null, httpPort = null, child = null, ws = null; // 副作用句柄（finally 里清）
try {
  // 只读静态服务器（`--mode http`）：把 `--dist` 按真实 HTTP 语义提供，让产物里的**绝对路径** `/assets/…` 与 `crossorigin`
  // 模块脚本按 vite 的假定工作（Why 见文件头「口径」）。
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png", ".map": "application/json" };
  if (MODE === "http") {
    server = createServer((req, res) => {
      const rel = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "") || "index.html";
      const file = resolve(DIST_DIR, rel);
      if (!file.startsWith(DIST_DIR) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404, { "content-type": "text/plain" }); res.end("404 " + rel); return;
      }
      res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    httpPort = server.address().port;
  }

  child = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files",
    `--force-device-scale-factor=${DPR}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "about:blank",
  ], { stdio: "ignore", detached: false });
  async function wsUrl() {
    for (let i = 0; i < 80; i++) {
      try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; }
      catch { /* 未就绪 */ }
      await sleep(250);
    }
    throw new Error(`CDP 未在 20s 内就绪（Edge=${EDGE}，端口 ${PORT}）`);
  }

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  // 🔴 盲区 #4：视口只走 CDP 精密覆盖（`--window-size=800` 实测 innerWidth=776，不一致）
  await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR, mobile: false }, sessionId);
  // 🔴 盲区 #2：headless 默认 prefers-reduced-motion=reduce ⇒ **显式**设定，绝不听凭默认（自检里验它生效）
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: REDUCED }] }, sessionId);
  const url = MODE === "http" ? `http://127.0.0.1:${httpPort}/index.html` : `file:///${ENTRY.split("\\").join("/")}`;
  await send("Page.navigate", { url }, sessionId);

  // 等 #root 有子节点（最多 10s）；超时不算失败，但要如实报出 root_child_count
  let mounted = false;
  for (let i = 0; i < 40 && !mounted; i++) {
    await sleep(250);
    const r = await send("Runtime.evaluate", { expression: `(document.getElementById("root")||{children:[]}).children.length`, returnByValue: true }, sessionId);
    mounted = r.result.value > 0;
  }
  await send("Runtime.evaluate", { expression: INSTRUMENT }, sessionId);
  await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true }, sessionId);
  await sleep(400);
  const res = await send("Runtime.evaluate", { expression: MEASURE, returnByValue: true }, sessionId);
  if (res.exceptionDetails) throw new Error("测量抛错：" + JSON.stringify(res.exceptionDetails.exception));
  const d = res.result.value;

  let probeOut = null;
  if (PROBES.length) {
    const pr = await send("Runtime.evaluate", { expression: PROBE_EXPR, returnByValue: true }, sessionId);
    if (pr.exceptionDetails) throw new Error("--probe 测量抛错：" + JSON.stringify(pr.exceptionDetails.exception));
    probeOut = pr.result.value;
    // 「没有元数据的读数不得当判据」⇒ 元数据缺失本身就是问题
    if (!probeOut.meta?.viewport || probeOut.meta.dpr === undefined || !probeOut.meta.emulatedMedia)
      problems.push("--probe 读数缺 viewport/dpr/emulatedMedia 元数据 ⇒ 不得当判据");
    // ★ 探针自检：canary 必须取到**解算值**（`html` 的 font-size 恒为 px）—— 空 ⇒ 解算值来源不是 getComputedStyle
    const canary = probeOut.readings.at(-1);
    if (canary?.selector !== "html" || !/^\d+(\.\d+)?px$/.test(canary.values["font-size"] ?? "")) {
      problems.push("★--probe 自检失效：canary 未取到解算值 ⇒ **解算值必须来自 getComputedStyle**（内联样式读类规则恒为空串）");
    }
  }
  if (SHOT) {
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    mkdirSync(dirname(SHOT), { recursive: true });
    writeFileSync(SHOT, Buffer.from(shot.data, "base64"));
  }

  const r2 = (n) => Math.round(n * 100) / 100;
  if (!mounted) problems.push(`#root 在 10s 内没有子节点（root_child_count=${d.root_child_count}）⇒ 真实产物没渲染出来，本档结论不成立`);
  if (d.MISS_POSITIVE_CONTROL !== 1) problems.push(`★阳性对照失效：已知存在的 #vp-sentinel 命中 ${d.MISS_POSITIVE_CONTROL} 次★`);
  if (d.MISS_COUNT !== 0) problems.push(`★阴性对照失效：现造随机串 #${NEG_ID} 命中 ${d.MISS_COUNT} 次★`);
  if (d.viewport_innerWidth !== WIDTH) problems.push(`视口=${d.viewport_innerWidth}（应为 ${WIDTH}）—— 缺 setDeviceMetricsOverride 的典型症状是 800 ⇒ 776`);
  if (d.dpr !== DPR) problems.push(`dpr=${d.dpr}（应为 ${DPR}）`);
  if (Math.abs(d.fixed_500 - 500) > 0.01) problems.push(`固定块=${d.fixed_500}（应为 500）`);
  if (d.emulated_reduced_motion !== (REDUCED === "reduce"))
    problems.push(`emulatedMedia 未按 --reduced-motion=${REDUCED} 生效（实测 reduce=${d.emulated_reduced_motion}）⇒ 动效类读数失真`);
  if (!d.has_topbar) problems.push("页面上没有 [data-testid=topbar] ⇒ 判据 ②③ 无法判定");
  // ★ A4：`--nav-h = 56` 够不够 —— 顶栏纵向溢出即「不够」（内容高 + 上下 padding > 56）
  if (d.has_topbar && d.nav_overflow_y) problems.push(`判据④ A4：顶栏纵向溢出（scrollH=${d.nav_scroll_h} > clientH=${d.nav_client_h}）⇒ --nav-h=56 不足`);
  const overflow = d.has_topbar && d.nav_natural_w_maxcontent > d.clientWidth + 0.5;
  if (overflow) problems.push(`判据② 顶栏自然宽 ${d.nav_natural_w_maxcontent} > 可用宽 ${d.clientWidth} ⇒ 溢出 ${r2(d.nav_natural_w_maxcontent - d.clientWidth)} px`);
  const outTabs = (d.tabs ?? []).filter((t) => t.right > d.viewport_innerWidth + 0.5);
  if (outTabs.length) problems.push(`判据③ 被推出视口的 Tab：${outTabs.map((t) => t.key + "(right=" + t.right + ")").join(", ")}`);

  const report = {
    probe: "viewport-real-artifact", mode: MODE,
    // 🔴 §17：读数绑定产物时点与树 —— 与**别的时点**比就是非受控对比（dist 不带构建时点戳，tree_head = 当时 HEAD）
    dist: { dir: DIST_DIR, entry: ENTRY, entry_mtime: statSync(ENTRY).mtime.toISOString(), tree_head: HEAD },
    served_from: MODE === "http" ? `http://127.0.0.1:${httpPort}/` : "file://（⚠️ 该模式实测 #root=0，读数不得用作结论）",
    request: { width: WIDTH, height: HEIGHT, dpr: DPR, reduced_motion: REDUCED },
    emulatedMedia: { prefersReducedMotion: d.emulated_reduced_motion, prefersColorScheme: d.emulated_color_scheme },
    profile_dir: PROFILE, negative_control_id: NEG_ID, width: WIDTH, height: HEIGHT, mounted, ...d, probes: probeOut,
    // ① 仅供参考 · ②③ 判据 · ④ 仪器自检（强度不同，分层依据见文件头）
    judgments: {
      judge_1_page_no_hscroll: { value: d.page_scroll_w <= d.page_client_w, role: "参考项（无 __TAURI__ ⇒ 各页错误态影响整页宽）" },
      judge_2_topbar_natural_le_client: { value: d.has_topbar ? !overflow : null, role: "判据" },
      judge_3_no_tab_beyond_viewport: { value: d.has_topbar ? outTabs.length === 0 : null, role: "判据" },
      judge_4_instrument_selftest: { value: problems.length === 0, role: "判据" },
    }, problems,
  };
  if (JSON_OUT) { mkdirSync(dirname(JSON_OUT), { recursive: true }); writeFileSync(JSON_OUT, JSON.stringify(report, null, 1), "utf8"); }

  const L = (s) => console.log(s);
  L(`== 真实产物视口探针 @${WIDTH}x${HEIGHT}（mode=${MODE} · dpr=${DPR} · reduced-motion=${REDUCED}） ==`);
  L(`入口：${ENTRY}（mtime ${statSync(ENTRY).mtime.toLocaleString("sv-SE")}）`);
  L(`产物来源（§17 受控对比）：dist mtime=${statSync(ENTRY).mtime.toISOString()} · 树 HEAD=${HEAD} ⇒ 与别的时点做差 = 非受控对比`);
  L(`page_url=${url}`);
  L(`#root 子节点=${d.root_child_count} · 已挂载=${mounted} · window.__TAURI__=${d.has_tauri_global}（本探针走 CDP、无 IPC ⇒ 预期 false）`);
  L(`仪器自检：innerWidth=${d.viewport_innerWidth} · dpr=${d.dpr} · fonts=${d.fonts_status} · 固定块=${d.fixed_500} · 哨兵=${d.sentinel_text} · 阳性对照=${d.MISS_POSITIVE_CONTROL} · 阴性对照(现造 ${NEG_ID})=${d.MISS_COUNT} · emulatedMedia(reduce)=${d.emulated_reduced_motion}`);
  L(`顶栏：存在=${d.has_topbar} · 渲染宽=${d.nav_rect_w} · 自然宽(max-content)=${d.nav_natural_w_maxcontent} · 可用宽=${d.clientWidth} · 余量=${d.has_topbar ? r2(d.clientWidth - d.nav_natural_w_maxcontent) : "-"} · Tab 数=${d.tab_count ?? "-"} · Tab 文字可见=${d.tab_label_visible} · 右簇文字可见=${d.action_label_visible}`);
  L(`参考：强制显示 Tab 文字后的自然宽=${d.nav_natural_w_labels_forced}（**不是判据**，仅用于与规格 §6.1「约 1070px」的满档形态对照）`);
  L(`A4 纵向（--nav-h=56 够不够）：顶栏高=${d.nav_rect_h} · clientH=${d.nav_client_h} · 最高子项=${d.nav_content_h} · 上下 padding=${d.nav_padding_tb} · 纵向溢出=${d.nav_overflow_y}`);
  L(`判据① 整页无横向滚动（**参考**）：scrollW=${d.page_scroll_w} clientW=${d.page_client_w} ⇒ ${d.page_scroll_w <= d.page_client_w}`);
  L(`判据② 顶栏自然宽 ≤ 可用宽（**判据**）：${d.has_topbar ? !overflow : "无法判定"}`);
  L(`判据③ 无 Tab 越出视口（**判据**）：${d.has_topbar ? outTabs.length === 0 : "无法判定"}（越界 ${outTabs.length} 个）`);
  L(`toast：真实产物里 ${d.toast_present ? "存在" : "不存在"}（预期不存在——toast 只在 AI 动作后出现，见文件头诚实边界）`);
  for (const [i, rd] of (probeOut?.readings ?? []).entries())
    L(`--probe[${i}] ${rd.selector} ⇒ matched=${rd.matched} ${JSON.stringify(rd.values)}（meta: viewport=${rd.viewport.innerWidth}x${rd.viewport.innerHeight} dpr=${rd.dpr} emulatedMedia.reduce=${rd.emulatedMedia.prefersReducedMotion}）`);
  if (SHOT) L(`截图：${SHOT}`);
  L(`问题（${problems.length}）：`);
  for (const p of problems) L("  ! " + p);
} catch (err) {
  exitCode = 2; console.error(`❌ 探针失败（exit 2）：${err?.message ?? err}`);
} finally {
  if (ws) { try { ws.close(); } catch { /* 已关 */ } }
  if (child) { try { child.kill(); } catch { /* 已退 */ } }
  if (server) await new Promise((r) => server.close(r));
  await new Promise((r) => { if (!child || child.exitCode !== null) r(); else child.on("exit", r); });
  for (let i = 0; i < 20 && existsSync(PROFILE); i++) {
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* 还锁着 */ }
    if (existsSync(PROFILE)) await sleep(250);
  }
  console.log(`profile removed: ${!existsSync(PROFILE)}（$env:TEMP 下：${PROFILE}）`);
}
process.exit(exitCode === 2 ? 2 : problems.length ? 1 : 0);
