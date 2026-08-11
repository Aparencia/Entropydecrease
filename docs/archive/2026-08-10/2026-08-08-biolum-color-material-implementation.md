# 「深海生物发光」配色与双光源材质实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全套令牌重调消除 AI 生成器味（靛蓝/赛博青/模板蓝/紫色呼吸光退役），并为 primary/ai 按钮注入「双光源材质」质感（环境光+自发光+微噪点+按压点亮）。

**Architecture:** 主题差异全部收进 `client/src/styles/tokens.css`（令牌值 + `[data-theme]` 材质类），`Button.tsx` 只挂类名——主题切换零 JS、零 Tailwind 解析依赖。3D 场景与硬编码色块通过令牌类或直接替换色值归位。

**Tech Stack:** React 18 / TypeScript / Tailwind CSS（CSS 变量令牌）/ R3F（3D）/ Vitest / Oxlint

**设计依据:** `2026-08-08-biolum-color-material-design.md`（已批准，随本批次归档于 docs/archive/2026-08-10/）

**验证基线:** 每任务后 `npx tsc -b --noEmit` 与 `npm run lint` 零错误；全部完成后 `npm run test` 全绿 + `npm run build` 成功 + 浏览器双主题实测。

---

### Task 1: tokens.css 深色令牌替换（极夜深海）

**Files:**
- Modify: `client/src/styles/tokens.css:262-337`（`[data-theme="dark"]` 块）

- [ ] **Step 1: 替换深色 brand 色板（靛蓝 → 磷光青绿）**

将 `[data-theme="dark"]` 块内 `--kb-brand-50` 至 `--kb-brand-900` 全部替换为：

```css
  /* 品牌主色 - 深海萤火磷光青绿（深色模式） */
  --kb-brand-50: #0C211C;
  --kb-brand-100: #122E27;
  --kb-brand-200: #184037;
  --kb-brand-300: #1F5748;
  --kb-brand-400: #287160;
  --kb-brand-500: #328E79;
  --kb-brand-600: #40AB92;
  --kb-brand-700: #57C6A9;
  --kb-brand-800: #7DDCC1;
  --kb-brand-900: #A9F0DB;
```

- [ ] **Step 2: 替换深色 accent 色板（赛博青 → 认知琥珀金）**

```css
  /* 品牌辅色 - 认知琥珀金（深色模式，成就/强调） */
  --kb-accent-50: #2B1A08;
  --kb-accent-100: #3A240C;
  --kb-accent-200: #4E3010;
  --kb-accent-300: #6B4214;
  --kb-accent-400: #8F5818;
  --kb-accent-500: #B5721E;
  --kb-accent-600: #D18A2A;
  --kb-accent-700: #E8A74A;
  --kb-accent-800: #F5C77E;
  --kb-accent-900: #FBE3B5;
```

- [ ] **Step 3: 替换深色功能色 + cyber（AI 专用磷光蓝）**

```css
  --kb-focus-blue: #6FB4E8;
  --kb-cyber-cyan: #4A9BD9;
  --kb-color-success: #4EC985;
  --kb-color-info: #4A9BD9;
```

（`--kb-amber: #FBBF24`、`--kb-moss-green: #82C9A3`、`--kb-stone-purple: #3A3545`、`--kb-color-warning: #FB923C`、`--kb-color-error: #F87171` 保持不动）

- [ ] **Step 4: 替换深色背景/文字/边框（去紫感）**

```css
  --kb-bg-primary: #0A1620;
  --kb-bg-secondary: #0F1F2E;
  --kb-bg-tertiary: #152A3D;
  --kb-bg-elevated: #0F1F2E;

  --kb-text-primary: #E2EAF2;
  --kb-text-secondary: #93A7BC;
  --kb-text-tertiary: #647B90;

  --kb-border-default: #1F3348;
  --kb-border-strong: #29425C;
```

- [ ] **Step 5: 替换深色阴影（青绿光晕）+ dive 渐变（磷光蓝）**

```css
  --kb-shadow-sm: 0 1px 3px rgba(10, 22, 32, 0.4), 0 0 8px rgba(64, 171, 146, 0.05);
  --kb-shadow-md: 0 4px 12px rgba(10, 22, 32, 0.5), 0 0 16px rgba(64, 171, 146, 0.08);
  --kb-shadow-lg: 0 8px 24px rgba(10, 22, 32, 0.6), 0 0 24px rgba(64, 171, 146, 0.12);

  --kb-shadow-brand: 0 4px 12px rgba(64, 171, 146, 0.28);
  --kb-shadow-accent: 0 4px 12px rgba(209, 138, 42, 0.25);
  --kb-shadow-brand-hover: 0 6px 20px rgba(87, 198, 169, 0.35);
  --kb-shadow-accent-hover: 0 6px 20px rgba(209, 138, 42, 0.35);
```

```css
  --kb-dive-bubble: rgba(74, 155, 217, 0.3);
  --kb-dive-ray: rgba(74, 155, 217, 0.06);
```

（`--kb-dive-top/mid/bot/fog` 不含 AI 色相，保持不动）

- [ ] **Step 6: 深色块新增 `--primary-foreground`（亮底深字）**

在深色块 shadcn 兼容区（`--ring: var(--kb-brand-400);` 之后）追加：

```css
  --primary-foreground: #0A1620;
```

- [ ] **Step 7: 验证无残留 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

残留扫描：`grep -rn "6366F1\|818CF8\|22D3EE\|06B6D4" src/styles/tokens.css` 应仅剩 `:root`（浅色）块中的值（Task 2 处理）。

```bash
git add client/src/styles/tokens.css
git commit -m "style(tokens): 深色主题回归生物发光叙事 - 靛蓝换磷光青绿、赛博青退役、去紫背景"
```

---

### Task 2: tokens.css 浅色令牌替换（晨曦穹顶）

**Files:**
- Modify: `client/src/styles/tokens.css:8-186`（`:root` 块）

- [ ] **Step 1: 替换浅色 brand 色板（模板蓝 → 晨光琥珀金）**

```css
  /* 品牌主色 - 晨光琥珀金系（专注/温暖） */
  --kb-brand-50: #FDF3E7;
  --kb-brand-100: #FAE6CC;
  --kb-brand-200: #F3CD9E;
  --kb-brand-300: #E8AD66;
  --kb-brand-400: #DB8F3C;
  --kb-brand-500: #C9761F;
  --kb-brand-600: #B05E12;
  --kb-brand-700: #9A4F0C;
  --kb-brand-800: #7E420A;
  --kb-brand-900: #61330B;
```

- [ ] **Step 2: 替换浅色 accent 色板（琥珀金 → 晨空蓝）**

```css
  /* 品牌辅色 - 晨空蓝（浅色模式，强调/选中） */
  --kb-accent-50: #EDF3FA;
  --kb-accent-100: #DBE8F4;
  --kb-accent-200: #B7CFE8;
  --kb-accent-300: #8CB2D8;
  --kb-accent-400: #6494C4;
  --kb-accent-500: #4A7DB0;
  --kb-accent-600: #3B689A;
  --kb-accent-700: #31577F;
  --kb-accent-800: #27455F;
  --kb-accent-900: #1E3448;
```

- [ ] **Step 3: 替换浅色功能色 + cyber**

```css
  --kb-focus-blue: #4A7DB0;
  --kb-cyber-cyan: #2B5F9E;
  --kb-color-success: #41A96E;
  --kb-color-info: #2B5F9E;
```

- [ ] **Step 4: 替换浅色阴影（暖琥珀）与 dive 渐变（晨空蓝）**

```css
  --kb-shadow-brand: 0 4px 12px rgba(176, 94, 18, 0.18);
  --kb-shadow-accent: 0 4px 12px rgba(59, 104, 154, 0.18);
  --kb-shadow-brand-hover: 0 6px 20px rgba(176, 94, 18, 0.26);
  --kb-shadow-accent-hover: 0 6px 20px rgba(59, 104, 154, 0.26);
```

```css
  --kb-dive-bubble: rgba(74, 125, 176, 0.4);
  --kb-dive-ray: rgba(74, 125, 176, 0.07);
  --kb-dive-fog: rgba(219, 232, 244, 0.4);
```

（`--kb-dive-top: rgba(219,234,254,0.55)` → `rgba(219,232,244,0.55)`、`--kb-dive-bot: rgba(147,197,253,0.5)` → `rgba(140,178,216,0.5)`）

- [ ] **Step 5: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

残留扫描：`grep -rn "3B82F6\|2563EB\|F59E0B\|FB923C" src/styles/tokens.css` 应无命中（浅色 accent 旧值全换）。

```bash
git add client/src/styles/tokens.css
git commit -m "style(tokens): 浅色主题晨光琥珀金化 - 模板蓝退役、晨空蓝辅色、暖琥珀阴影"
```

---

### Task 3: 双光源材质类定义（tokens.css）

**Files:**
- Modify: `client/src/styles/tokens.css`（文件末尾追加材质区）

- [ ] **Step 1: 追加深色材质类（生物发光体）**

在 `tokens.css` 末尾追加（深色主题版）：

```css
/* ============================================
   双光源材质（按钮质感） - 环境光 + 自发光 + 微噪点 + 按压点亮
   ============================================ */
[data-theme="dark"] .kb-btn-primary-material,
[data-theme="dark"] .kb-btn-ai-material {
  position: relative;
  overflow: hidden;
}
/* 深色 · 主按钮：海面光（顶部环境光）+ 磷光自发光（内透） */
[data-theme="dark"] .kb-btn-primary-material {
  background: radial-gradient(120% 130% at 50% 0%,
    #57C6A9 0%, #40AB92 55%, #2F7D6A 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    inset 0 -3px 8px rgba(4, 16, 12, 0.25),
    0 1px 3px rgba(4, 16, 12, 0.35),
    0 0 14px rgba(64, 171, 146, 0.22);
  transition:
    box-shadow 150ms var(--kb-ease-smooth),
    background 150ms var(--kb-ease-smooth),
    transform 150ms var(--kb-ease-out);
}
[data-theme="dark"] .kb-btn-primary-material:hover {
  background: radial-gradient(120% 130% at 50% 0%,
    #6FDDBF 0%, #57C6A9 55%, #3B9E86 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -3px 8px rgba(4, 16, 12, 0.22),
    0 1px 3px rgba(4, 16, 12, 0.3),
    0 0 18px rgba(64, 171, 146, 0.32);
}
[data-theme="dark"] .kb-btn-primary-material:active {
  background: radial-gradient(120% 130% at 50% 0%,
    #47AB92 0%, #328E79 60%, #256B5C 100%);
  box-shadow:
    inset 0 0 14px rgba(255, 255, 255, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 0 10px rgba(64, 171, 146, 0.25);
  transform: scale(0.97);
}
/* 深色 · AI 按钮：磷光蓝自发光 */
[data-theme="dark"] .kb-btn-ai-material {
  background: radial-gradient(120% 130% at 50% 0%,
    #6FB4E8 0%, #4A9BD9 55%, #3578B5 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 -3px 8px rgba(4, 16, 12, 0.22),
    0 0 14px rgba(74, 155, 217, 0.22);
  transition:
    box-shadow 150ms var(--kb-ease-smooth),
    background 150ms var(--kb-ease-smooth),
    transform 150ms var(--kb-ease-out);
}
[data-theme="dark"] .kb-btn-ai-material:hover {
  background: radial-gradient(120% 130% at 50% 0%,
    #8AC6F0 0%, #6FB4E8 55%, #4A9BD9 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    inset 0 -3px 8px rgba(4, 16, 12, 0.2),
    0 0 18px rgba(74, 155, 217, 0.32);
}
[data-theme="dark"] .kb-btn-ai-material:active {
  background: radial-gradient(120% 130% at 50% 0%,
    #5FA8DE 0%, #3D7FBB 60%, #2E6598 100%);
  box-shadow:
    inset 0 0 14px rgba(255, 255, 255, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 0 10px rgba(74, 155, 217, 0.25);
  transform: scale(0.97);
}
/* 微噪点层：1px 颗粒，肉眼近不可见（feTurbulence data-URI） */
[data-theme="dark"] .kb-btn-primary-material::after,
[data-theme="dark"] .kb-btn-ai-material::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  background-size: 120px 120px;
  opacity: 0.03;
  transition: opacity 150ms ease;
}
[data-theme="dark"] .kb-btn-primary-material:hover::after,
[data-theme="dark"] .kb-btn-ai-material:hover::after {
  opacity: 0.06;
}
```

- [ ] **Step 2: 追加浅色材质类（晨光实体）**

```css
:root .kb-btn-primary-material,
:root .kb-btn-ai-material {
  position: relative;
  overflow: hidden;
}
/* 浅色 · 主按钮：晨光（顶部受光）+ 琥珀自发光 */
:root .kb-btn-primary-material {
  background: linear-gradient(180deg, #C97A22 0%, #B05E12 55%, #A3550E 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 -1px 0 rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(154, 79, 12, 0.22);
  transition:
    box-shadow 150ms var(--kb-ease-smooth),
    background 150ms var(--kb-ease-smooth),
    transform 150ms var(--kb-ease-out);
}
:root .kb-btn-primary-material:hover {
  background: linear-gradient(180deg, #D88A2E 0%, #C06A15 55%, #B05E12 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.32),
    inset 0 -1px 0 rgba(0, 0, 0, 0.1),
    0 4px 10px rgba(154, 79, 12, 0.28);
}
:root .kb-btn-primary-material:active {
  background: linear-gradient(180deg, #B05E12 0%, #9A4F0C 55%, #8A450A 100%);
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 1px 3px rgba(154, 79, 12, 0.2);
  transform: scale(0.97);
}
/* 浅色 · AI 按钮：磷光蓝 */
:root .kb-btn-ai-material {
  background: linear-gradient(180deg, #3B6FA8 0%, #2B5F9E 55%, #24517F 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1px 0 rgba(0, 0, 0, 0.1),
    0 2px 6px rgba(43, 95, 158, 0.22);
  transition:
    box-shadow 150ms var(--kb-ease-smooth),
    background 150ms var(--kb-ease-smooth),
    transform 150ms var(--kb-ease-out);
}
:root .kb-btn-ai-material:hover {
  background: linear-gradient(180deg, #4A7DB0 0%, #3B6FA8 55%, #2B5F9E 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    inset 0 -1px 0 rgba(0, 0, 0, 0.08),
    0 4px 10px rgba(43, 95, 158, 0.28);
}
:root .kb-btn-ai-material:active {
  background: linear-gradient(180deg, #2B5F9E 0%, #24517F 55%, #1E4366 100%);
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 1px 3px rgba(43, 95, 158, 0.2);
  transform: scale(0.97);
}
/* 浅色微噪点（晨光实体表面，更淡） */
:root .kb-btn-primary-material::after,
:root .kb-btn-ai-material::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  background-size: 120px 120px;
  opacity: 0.025;
  transition: opacity 150ms ease;
}
:root .kb-btn-primary-material:hover::after,
:root .kb-btn-ai-material:hover::after {
  opacity: 0.05;
}
/* reduced-motion：动效退化（按压点亮仅保留纯色变化） */
@media (prefers-reduced-motion: reduce) {
  .kb-btn-primary-material,
  .kb-btn-ai-material {
    transition: none;
    transform: none !important;
  }
}
```

- [ ] **Step 3: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

```bash
git add client/src/styles/tokens.css
git commit -m "style(tokens): 双光源材质类 - 环境光+自发光+微噪点+按压点亮"
```

---

### Task 4: Button.tsx 变体挂载材质

**Files:**
- Modify: `client/src/components/ui/Button.tsx:22-50`（variant 定义）

- [ ] **Step 1: primary 变体改为材质类 + 文字色变量化**

```tsx
        primary: [
          'kb-btn-primary-material',
          'text-[var(--primary-foreground)]',
          'hover:shadow-md',
        ].join(' '),
```

（删除 `bg-brand-600 text-white`、`hover:bg-brand-700`、`active:bg-brand-800`、`shadow-kb-sm`——材质类接管背景/阴影/按压；`hover:shadow-md` 保留会被材质类覆盖，一并删除：最终 primary 只有材质类 + 文字色）

```tsx
        primary: [
          'kb-btn-primary-material text-[var(--primary-foreground)]',
        ].join(' '),
```

- [ ] **Step 2: ai 变体改为材质类**

```tsx
        ai: [
          'kb-btn-ai-material text-[var(--primary-foreground)]',
        ].join(' '),
```

（删除 `bg-gradient-to-r from-accent-500 to-brand-500 text-white` 及 hover/shadow 行）

- [ ] **Step 3: danger 变体保持不动**（红色语义色，白字）

- [ ] **Step 4: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

```bash
git add client/src/components/ui/Button.tsx
git commit -m "style(button): primary/ai 变体挂载双光源材质类，文字色变量化"
```

---

### Task 5: AIButton.tsx 呼吸光紫色 → 磷光蓝

**Files:**
- Modify: `client/src/components/ui/AIButton.tsx:44`

- [ ] **Step 1: 替换呼吸光颜色**

```tsx
          style={{
            filter: 'drop-shadow(0 0 12px rgba(74,155,217,0.3))',
          }}
```

- [ ] **Step 2: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

```bash
git add client/src/components/ui/AIButton.tsx
git commit -m "style(ai-button): 呼吸光紫色退役，换磷光蓝"
```

---

### Task 6: SpatialNav 模块发光体 9 色板

**Files:**
- Modify: `client/src/lib/3d/navigation/SpatialNav.tsx:37-45`

- [ ] **Step 1: 替换模块色配置**

```tsx
    dashboard: { geometry: 'dodecahedron', color: '#40AB92', emissiveColor: '#57C6A9' },
    pomodoro: { geometry: 'octahedron', color: '#E8833A', emissiveColor: '#F4A05E' },
    notes: { geometry: 'box', color: '#4A9BD9', emissiveColor: '#6FB4E8' },
    flashcards: { geometry: 'icosahedron', color: '#43C58B', emissiveColor: '#63DBA5' },
    feynman: { geometry: 'torus', color: '#F0E3C8', emissiveColor: '#F8F0DC' },
    inspiration: { geometry: 'sphere', color: '#E8B84B', emissiveColor: '#F2CF7D' },
    classroom: { geometry: 'torus', color: '#2FB8AC', emissiveColor: '#4ED0C2' },
    constellation: { geometry: 'octahedron', color: '#9FB8D8', emissiveColor: '#C3D6EA' },
    sop: { geometry: 'box', color: '#B5D84E', emissiveColor: '#CCE672' },
```

- [ ] **Step 2: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

```bash
git add client/src/lib/3d/navigation/SpatialNav.tsx
git commit -m "style(3d): 模块发光体 9 色板回归生物发光光谱，靛蓝/紫/粉退役"
```

---

### Task 7: 3D 场景背景与 shader

**Files:**
- Modify: `client/src/lib/3d/core/SceneProvider.tsx:53`
- Modify: `client/src/lib/3d/scenes/DeepSeaWorld.tsx:75-76`
- Modify: `client/src/lib/3d/scenes/AuroraDomeWorld.tsx:43-45,121-123,395`

- [ ] **Step 1: SceneProvider 深色背景去紫**

`scene.background = new THREE.Color('#0a0a2e')` → `new THREE.Color('#0A1620')`

- [ ] **Step 2: DeepSeaWorld shader 背景同步**

`uColorTop: { value: new THREE.Color('#0A1628') }` → `'#0A1620'`；`uColorMid: { value: new THREE.Color('#0D1F3C') }` → `'#0F1F2E'`

- [ ] **Step 3: AuroraDomeWorld 去模板色**

```tsx
    uColorTop: { value: new THREE.Color('#FCD34D') },          // 保持（晨光金）
    uColorMid: { value: new THREE.Color('#4A7DB0') },          // 蓝 → 晨空蓝
    uColorBottom: { value: new THREE.Color('#F8FAFC') },       // 保持
```

```tsx
    uColorA: { value: new THREE.Color('#6FB4E8') },            // 青 → 磷光蓝亮版
    uColorB: { value: new THREE.Color('#9FB8D8') },            // 靛蓝 → 星光淡蓝
    uColorC: { value: new THREE.Color('#34D399') },            // 保持（翠绿极光）
```

第 395 行 uniforms 中 `uColorC: { value: new THREE.Color('#818CF8') }` → `'#9FB8D8'`

- [ ] **Step 4: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

```bash
git add client/src/lib/3d/core/SceneProvider.tsx client/src/lib/3d/scenes/DeepSeaWorld.tsx client/src/lib/3d/scenes/AuroraDomeWorld.tsx
git commit -m "style(3d): 场景背景去紫感，穹顶极光色退役靛蓝/青"
```

---

### Task 8: 3D 物体 tooltip 边框

**Files:**
- Modify: `client/src/lib/3d/objects/ModuleEntity.tsx:450`
- Modify: `client/src/lib/3d/objects/AuroraModuleEntity.tsx:196`

- [ ] **Step 1: 替换 tooltip 边框**

两处 `border border-indigo-500/30` → `border border-brand-400/30`

- [ ] **Step 2: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

```bash
git add client/src/lib/3d/objects/ModuleEntity.tsx client/src/lib/3d/objects/AuroraModuleEntity.tsx
git commit -m "style(3d): tooltip 边框靛蓝换品牌令牌色"
```

---

### Task 9: onboarding 硬编码清理

**Files:**
- Modify: `client/src/components/onboarding/help/QuickStartTab.tsx:10,14-15,79`
- Modify: `client/src/components/onboarding/help/ModuleGuideTab.tsx:19,47,54`
- Modify: `client/src/lib/3d/scenes/MobileNavGrid.tsx:18-25`（先读完整文件确认全部行）

- [ ] **Step 1: QuickStartTab 色点与按钮**

```tsx
    { color: 'bg-brand-500', name: '仪表盘', desc: '学习概览与数据统计' },
    // ...
    { color: 'bg-amber', name: '浮出水面', desc: '费曼学习法输出练习' },
    { color: 'bg-accent-500', name: '灵感', desc: '灵感收集与知识关联' },
```

第 79 行：`bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-200` → `bg-brand-500/20 hover:bg-brand-500/30 border border-brand-400/30 text-brand-200`

- [ ] **Step 2: ModuleGuideTab 同构映射**

第 19/47/54 行 `color:` 值：`bg-indigo-500` → `bg-brand-500`、`bg-cyan-500` → `bg-cyber`、`bg-purple-500` → `bg-accent-500`

- [ ] **Step 3: MobileNavGrid 全行映射**（读取文件后逐行替换）

| 现值 | 新值 |
|------|------|
| `from-indigo-500/20 to-indigo-600/10` + `text-indigo-400` | `from-brand-500/20 to-brand-600/10` + `text-brand-400` |
| `from-blue-500/20 to-blue-600/10` + `text-blue-400` | `from-accent-500/20 to-accent-600/10` + `text-accent-400` |
| `from-violet-500/20 to-violet-600/10` + `text-violet-400` | `from-amber/20 to-amber/10` + `text-amber` |

（文件内其余同构行按此映射处理；`from-amber/20` 用 `amber: { DEFAULT: tokenColor('--kb-amber') }` 令牌）

- [ ] **Step 4: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

```bash
git add client/src/components/onboarding/help/QuickStartTab.tsx client/src/components/onboarding/help/ModuleGuideTab.tsx client/src/lib/3d/scenes/MobileNavGrid.tsx
git commit -m "style(onboarding): 硬编码 AI 色板换令牌色（主色/琥珀/晨空蓝）"
```

---

### Task 10: 灵感模块硬编码清理

**Files:**
- Modify: `client/src/features/inspiration/pages/InspirationPage.tsx:177,194,281-282,298`
- Modify: `client/src/features/inspiration/components/InspirationCard.tsx:107,190`
- Modify: `client/src/features/inspiration/components/PulseAnimation.tsx:75,163,175,190`
- Modify: `client/src/features/inspiration/components/SortPendingBanner.tsx:50`

- [ ] **Step 1: InspirationPage 渐变**

第 177/281-282/298 行 `from-accent-500 to-brand-500`（AI 整理按钮渐变）→ `from-cyber to-brand-500`：

```tsx
'bg-gradient-to-r from-cyber to-brand-500 text-text-inverse',
'hover:from-cyber/90 hover:to-brand-600 shadow-sm shadow-cyber/20',
```

（194 行 `via-accent-400/30` 保持——装饰线用强调色）

- [ ] **Step 2: InspirationCard**

第 190 行 `from-purple-500 to-cyan-500` → `from-cyber to-brand-500`；第 107 行 `accent-purple-500` → `accent-brand-500`

- [ ] **Step 3: PulseAnimation cyan 径向 → 磷光蓝**

`rgba(34,211,238,…)` 全部 → `rgba(74,155,217,…)`（75/163/175/190 行）

- [ ] **Step 4: SortPendingBanner**

第 50 行 `from-cyan-500/20 to-amber-500/20 border-cyan-400/30` → `from-cyber/20 to-amber/20 border-cyber/30`

- [ ] **Step 5: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

```bash
git add client/src/features/inspiration
git commit -m "style(inspiration): 紫青渐变退役，AI 按钮统一磷光蓝渐变"
```

---

### Task 11: 其余硬编码清理

**Files:**
- Modify: `client/src/features/assistant/components/PodcastPlayer.tsx:24,142`
- Modify: `client/src/components/PersonaCard.tsx:17,33`
- Modify: `client/src/features/notes/components/RollingRecallMode.tsx:19,252`
- Modify: `client/src/features/dashboard/components/deep-sea/creatures/AnglerfishAchievements.tsx:45,52,58`
- Modify: `client/src/features/dashboard/components/deep-sea/creatures/BubbleStreak.tsx:50,88`
- Modify: `client/src/features/dashboard/components/deep-sea/creatures/PlanktonStream.tsx:36-37,53-54,82,88`
- Modify: `client/src/features/classroom/components/UnifiedTimeline.tsx:176,201`

- [ ] **Step 1: 语义标签色 → accent/cyber 令牌**

| 文件 | 现值 | 新值 |
|------|------|------|
| PodcastPlayer:24 | `text-violet-500 bg-violet-500/10` | `text-accent-500 bg-accent-500/10` |
| PodcastPlayer:142 | `to-violet-500/5` | `to-accent-500/5` |
| PersonaCard:17 | `text-violet-500 bg-violet-500/10 border-violet-500/20` | `text-accent-500 bg-accent-500/10 border-accent-500/20` |
| PersonaCard:33 | `to-violet-500/10` | `to-accent-500/10` |
| RollingRecallMode:19 | `text-violet-500 bg-violet-500/10 border-violet-500/20` | `text-accent-500 bg-accent-500/10 border-accent-500/20` |
| UnifiedTimeline:201 | `hover:text-cyan-500 hover:bg-cyan-500/10` | `hover:text-cyber hover:bg-cyber/10` |
| UnifiedTimeline:176 | `border-cyan-400/50` | `border-cyber/50` |

- [ ] **Step 2: RollingRecallMode 实底按钮（琥珀金底白字对比度不达标 → 磷光蓝底深/白字）**

第 252 行 `'bg-violet-500 text-white hover:bg-violet-600'` → `'bg-cyber text-text-inverse hover:bg-cyber/90'`（text-text-inverse 深色=深墨字 ✅ 5.7:1、浅色=白字 ✅ 6.3:1）

- [ ] **Step 3: deep-sea 生物组件 cyan → cyber**

| 文件 | 现值 | 新值 |
|------|------|------|
| AnglerfishAchievements:45 | `border-cyan-400/15` | `border-cyber/15` |
| AnglerfishAchievements:52 | `text-cyan-200/60` | `text-cyber/60` |
| AnglerfishAchievements:58 | `text-cyan-200/50 hover:text-cyan-200` | `text-cyber/50 hover:text-cyber` |
| BubbleStreak:50 | `border-cyan-300/20 bg-cyan-400/10` | `border-cyber/20 bg-cyber/10` |
| BubbleStreak:88 | `bg-cyan-400` | `bg-cyber` |
| PlanktonStream:53-54 | `bg-cyan-400/10` / `bg-cyan-400/40` | `bg-cyber/10` / `bg-cyber/40` |
| PlanktonStream:82 | `hover:bg-cyan-400/5` | `hover:bg-cyber/5` |
| PlanktonStream:88 | `bg-cyan-400` | `bg-cyber` |
| PlanktonStream:36-37 | `bg-purple-400`（flashcard）/ `bg-cyan-400`（feynman） | `bg-amber` / `bg-cyber` |

- [ ] **Step 4: 验证 + 提交**

```bash
cd client
npx tsc -b --noEmit
npm run lint
```

```bash
git add client/src/features/assistant client/src/components/PersonaCard.tsx client/src/features/notes client/src/features/dashboard client/src/features/classroom
git commit -m "style: 硬编码 violet/cyan/purple 全部归位令牌色"
```

---

### Task 12: 全量验证 + 文档同步

**Files:**
- Modify: `.superdesign/design-system.md:30-38`（双世界主题色表 + 组件风格约束）
- Modify: `docs/product/ui-ux-system.md`（颜色章节，grep `#6366F1`/`#06B6D4`/`#3B82F6`/`#2563EB` 定位后替换）

- [ ] **Step 1: design-system.md 色表更新**

双世界主题表格按设计文档 §三 更新（深色主色磷光青绿 `#40AB92/#57C6A9`、浅色主色晨光琥珀 `#B05E12/#C9761F`、深色辅色琥珀金、浅色辅色晨空蓝、AI 磷光蓝）；「组件风格约束」按钮行更新为材质类说明。

- [ ] **Step 2: ui-ux-system.md 颜色章节同步**（grep 定位旧值逐一替换）

- [ ] **Step 3: 全量验证**

```bash
cd client
npm run lint
npm run test
npm run build
```

预期：lint 零警告；Vitest 全绿；build 成功。若组件测试断言了旧色值（此前 grep 未发现），同步更新断言。

- [ ] **Step 4: 残留扫描（全仓库）**

```bash
grep -rn "6366F1\|818CF8\|06B6D4\|22D3EE\|8B5CF6\|A78BFA\|EC4899\|F472B6" client/src --include="*.tsx" --include="*.css"
```

预期：仅剩设计文档引用（如有）。任何命中需归位。

- [ ] **Step 5: 浏览器双主题实测**

启动 `npm run dev`，深色/浅色各验证：
1. 主按钮（primary）：发光体质感、按压点亮动效、文字对比度
2. AI 按钮（AIButton）：磷光蓝呼吸光（非紫色）
3. secondary/ghost/danger：不受影响
4. Dashboard 3D：模块发光体新色、深海背景去紫、穹顶极光
5. 系统 reduced-motion 下按钮无动效残留
6. 截图存档（如 tmp-*.png 惯例）

- [ ] **Step 6: 提交**

```bash
git add .superdesign/design-system.md docs/product/ui-ux-system.md
git commit -m "docs: 设计系统色表同步生物发光叙事"
```

---

## 自审记录

- **Spec 覆盖**：设计文档 §四（Task 1）、§五（Task 2）、§七（Task 3-5）、§六.1（Task 6）、§六.2（Task 7-8）、§六.3（Task 9-11）、§八（Task 12）；§九 验证计划并入 Task 12 Step 3-5。
- **Placeholder**：无 TBD/TODO；所有色值与类名给出完整代码。
- **类型一致性**：材质类名 `kb-btn-primary-material`/`kb-btn-ai-material` 在 Task 3 定义、Task 4 挂载，命名全篇一致；`cyber` 令牌类（`text-cyber`/`bg-cyber`）沿用现有 Tailwind 映射，无需新增配置。
