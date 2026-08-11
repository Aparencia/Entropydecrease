# 「深海生物发光」配色与双光源材质设计

> **状态**: 已批准（2026-08-08 实施完成）
> **上位文档**: `docs/product/entropy-visualization-constitution.md`（最高视觉宪法）+ `docs/product/ui-ux-system.md`（执行层）+ `.superdesign/design-system.md`（浓缩设计系统）
> **范围**: 全套令牌重调（按钮/背景/功能色/3D 发光体/质感），双主题（深色·极夜深海 + 浅色·晨曦穹顶）
> **核心命题**: 消除 AI 生成器味的三个根源——Tailwind 原色直用、靛蓝偏离宪法叙事、极致 flat 无材质层次

---

## 一、背景与动机：AI 味诊断报告

### 1.1 深色模式（极夜深海）AI 味重灾区

| 严重度 | 位置 | 当前颜色 | AI 味来源 |
|--------|------|---------|-----------|
| 🔴 极重 | 主按钮 `--primary` | `#6366F1` | Tailwind `indigo-500` 原值，OpenAI/Cursor/Vercel 同款 |
| 🔴 极重 | AI 按钮渐变 | `from-accent-500 to-brand-500`（青→靛蓝） | AI 产品海报渐变标配 |
| 🔴 重 | 辅助色 accent | `#06B6D4` / `#22D3EE` | cyan = 「AI 呼吸灯」专属色 |
| 🔴 重 | AIButton 呼吸光 | `rgba(147,51,234,0.2)` 紫色 | 紫色 glow = AI 标配（Vercel 紫） |
| 🟠 重 | 按钮辉光阴影 | `rgba(99,102,241,0.25)` | 紫蓝弥散光晕 |
| 🟠 中 | 背景 | `#0C1524` 蓝黑 | ChatGPT 深色同调 |
| 🟡 中 | 硬编码 | `bg-indigo-500`/`bg-cyan-500`/`bg-purple-500`/`bg-violet-500` | AI 生成器默认色板直用 |
| 🔴 极重 | 材质 | 纯色块 + 单层阴影，零层次 | AI 产品极致 flat |

### 1.2 浅色模式（晨曦浮光）

| 严重度 | 位置 | 当前颜色 | 问题 |
|--------|------|---------|------|
| 🟠 中 | 主按钮 `--primary` | `#2563EB` | Tailwind blue-700 原值，通用模板蓝，零辨识度 |
| 🟢 良 | 辅助色 accent | `#F59E0B` 琥珀金 | 品牌亮点，保留精神 |
| 🟢 良 | 背景 | `#FAF8F5` 暖米白 | 无 AI 味 |
| 🔴 重 | 硬编码 | InspirationPage 紫渐变、purple→cyan 渐变 | design-system.md 已登记缺口 |

### 1.3 关键诊断（三层根因）

1. **Tailwind 原色直用**：`#6366F1`/`#06B6D4`/`#3B82F6`/`#2563EB` 全部为默认色板原值，未调色偏移。
2. **靛蓝不在宪法叙事里**：宪法美学 DNA 三原色为「深海萤火 / 认知琥珀金 / 赛博青」，深色主题实际 brand 用靛蓝 `#6366F1` 撑场，与「生物发光」叙事有张力。
3. **cyan 功能混淆**：赛博青同时承担品牌辅色、AI 状态色、3D 鱼群色，角色越界。
4. **极致 flat**：按钮无任何材质层次（无内高光、无渐变、无光照方向），AI 产品模板的隐形特征。

---

## 二、设计原则

### 2.1 宪法三原色归位

| 颜色角色 | 归属 | 叙事 |
|---------|------|------|
| 深海萤火磷光青绿 | **主色 primary**（主操作） | 「你按下的是一颗深海发光体」 |
| 认知琥珀金 | **辅色 accent**（成就/强调） | 尤里卡时刻 |
| 赛博青 cyan | **色调退役**（`--kb-cyber-cyan` 令牌名保留、值改为磷光蓝，最小改动） | 3D 生态色保留（鱼群），UI 不再出现青色 |
| 深海磷光蓝（新增） | **AI 专用色** | 深海生物 75% 发光为蓝色——AI 是最常见的深海发光体 |

### 2.2 双光源材质（自创质感）

按钮同时是**世界光照的接收者**与**自身的光源**：

- **环境光层**：深色=光从顶部中央透下（海面光，与 3D God Rays 同源）；浅色=光从左上打下（晨光，太阳方向）
- **自发光层**：inset 径向渐变，核心透光 → 边缘暗带（半透明有机体光衰减）
- **微表面层**：1px 噪点，opacity ≤ 0.03，hover 时微微浮现
- **按压点亮**：active 时仅增强自发光层（150ms），「按下即被点亮」

### 2.3 高级感客观边界（第一原则：克制）

| 边界 | 规则 |
|------|------|
| ① 对比度硬边界 | 按钮文字对比度 ≥ 4.5:1（WCAG AA），质感层不得侵蚀 |
| ② 层次上限 | 单按钮 ≤ 3 视觉层 |
| ③ 面积克制 | 质感仅作用于 primary + ai 变体；secondary/ghost/danger 保持现状 |
| ④ 光环境统一 | 同主题内所有按钮共享同一环境光方向 |
| ⑤ 噪点密度 | opacity ≤ 0.03、1px 尺度，肉眼几乎不可见 |
| ⑥ 动效边界 | 按压点亮 ≤ 150ms、无位移旋转；reduced-motion 退化为纯色 |
| ⑦ 性能边界 | 纯 CSS 合成层，零 GPU 管线（宪法第四条不变） |

---

## 三、双世界色域总纲

| 颜色角色 | 深色·极夜深海（现 → 新） | 浅色·晨曦穹顶（现 → 新） |
|---------|------------------------|------------------------|
| 主色 primary | 靛蓝 `#6366F1` → 磷光青绿 `#40AB92` | 模板蓝 `#2563EB` → 晨光琥珀 `#B05E12` |
| 辅色 accent | 赛博青 `#06B6D4` → 认知琥珀金 `#D18A2A` | 琥珀金 `#F59E0B` → 晨空蓝 `#3B689A` |
| AI 专用色 | 赛博青 `#22D3EE` → 磷光蓝 `#4A9BD9` | `#06B6D4` → 磷光蓝深版 `#2B5F9E` |
| 背景 | 蓝黑 `#0C1524` → 夜海青黑 `#0A1620`（去紫感） | 暖米白 `#FAF8F5` 保持 |
| 辉光阴影 | indigo 光晕 → 磷光青绿光晕 | 蓝光晕 → 暖琥珀光晕 |
| 明度语法 | **亮底 + 深墨字**（发光体本体） | **深底 + 白字**（晨光实体） |

---

## 四、深色令牌全表（极夜深海）

### 4.1 主色 brand（深海萤火磷光青绿）——替代靛蓝

| Stop | 新值 | 用途 |
|------|------|------|
| 50 | `#0C211C` | hover 底色 |
| 100 | `#122E27` | 选中底 |
| 200 | `#184037` | 标签底 |
| 300 | `#1F5748` | 描边 |
| 400 | `#287160` | 边框/图标 |
| 500 | `#328E79` | active/按压、text-brand-500 |
| **600** | **`#40AB92`** | **主按钮 bg**（深字 5.9:1 ✅） |
| 700 | `#57C6A9` | hover（8.2:1 ✅） |
| 800 | `#7DDCC1` | 发光高光 |
| 900 | `#A9F0DB` | 极亮特效 |

按钮语法：`bg-brand-600 text-[#0A1620] hover:bg-brand-700 active:bg-brand-500`；`--primary-foreground: #0A1620`。

### 4.2 辅色 accent（认知琥珀金）——替代赛博青

| Stop | 新值 | Stop | 新值 |
|------|------|------|------|
| 400 | `#8F5818` | 600 | `#D18A2A`（强调实体） |
| 500 | `#B5721E` | 700 | `#E8A74A`（hover） |
| — | — | 800 | `#F5C77E`（高光） |

### 4.3 AI 专用色（深海磷光蓝）

| 令牌 | 新值 | 用途 |
|------|------|------|
| `--kb-cyber-cyan`（值改，名保留最小改动） | `#4A9BD9` | AI 按钮 bg（深字 5.7:1 ✅） |
| AI hover | `#6FB4E8` | AI 呼吸灯/悬停 |
| AIButton 呼吸辉光 | `rgba(147,51,234,0.2)` → `rgba(74,155,217,0.3)` | 紫色退役 |

### 4.4 背景 / 文字 / 边框 / 功能色（去紫感）

| 令牌 | 旧 → 新 | 令牌 | 旧 → 新 |
|------|---------|------|---------|
| bg-primary | `#0C1524` → `#0A1620` | text-primary | `#E0E6F0` → `#E2EAF2` |
| bg-secondary | `#12203A` → `#0F1F2E` | text-secondary | `#90A0B8` → `#93A7BC` |
| bg-tertiary | `#182A48` → `#152A3D` | text-tertiary | `#607088` → `#647B90` |
| bg-elevated | `#12203A` → `#0F1F2E` | border-default | `#223550` → `#1F3348` |
| success | `#4ADE80` → `#4EC985` | border-strong | `#2E4568` → `#29425C` |
| info | `#60A5FA` → `#4A9BD9`（AI 同族） | warning / error | 保持 |
| focus-blue | `#60A5FA` → `#6FB4E8` | moss / stone-purple | 保持 |

### 4.5 辉光与沉浸渐变

| 令牌 | 旧 → 新 |
|------|---------|
| shadow-brand | `rgba(99,102,241,.25)` → `rgba(64,171,146,.28)` |
| shadow-accent | `rgba(6,182,212,.25)` → `rgba(209,138,42,.25)` |
| shadow-sm/md/lg 内嵌弥散蓝 | `rgba(59,130,246,…)` → `rgba(64,171,146,…)` |
| dive-bubble / dive-ray | `rgba(34,211,238,…)` → `rgba(74,155,217,…)` |

---

## 五、浅色令牌全表（晨曦穹顶）

### 5.1 主色 brand（晨光琥珀金）——替代模板蓝

| Stop | 新值 | 用途 |
|------|------|------|
| 50 | `#FDF3E7` | hover 底色 |
| 100 | `#FAE6CC` | 选中底 |
| 200 | `#F3CD9E` | 标签底 |
| 300 | `#E8AD66` | 描边 |
| 400 | `#DB8F3C` | 边框/图标 |
| 500 | `#C9761F` | text-brand-500 / active |
| **600** | **`#B05E12`** | **主按钮 bg**（白字 4.8:1 ✅） |
| 700 | `#9A4F0C` | hover（6.0:1 ✅） |
| 800 | `#7E420A` | 深态 |
| 900 | `#61330B` | 极深 |

### 5.2 辅色 accent（晨空蓝）——替代琥珀金

| Stop | 新值 | Stop | 新值 |
|------|------|------|------|
| 50 | `#EDF3FA` | 600 | `#3B689A` |
| 100 | `#DBE8F4` | 700 | `#31577F` |
| 300 | `#8CB2D8` | 800 | `#27455F` |
| 500 | `#4A7DB0` | 900 | `#1E3448` |

### 5.3 AI / 功能色 / 阴影（浅色）

| 令牌 | 旧 → 新 | 令牌 | 旧 → 新 |
|------|---------|------|---------|
| AI 专用 | `#06B6D4` → `#2B5F9E`（白字 6.3:1 ✅） | shadow-brand | `rgba(59,130,246,.2)` → `rgba(176,94,18,.18)` |
| info | `#3B82F6` → `#2B5F9E` | shadow-accent | `rgba(245,158,11,.2)` → `rgba(59,104,154,.18)` |
| success | `#22C55E` → `#41A96E` | dive-bubble/ray | 蓝 → 晨空蓝系 |
| focus-blue | `#3B82F6` → `#4A7DB0` | warning / error / moss | 保持 |

### 5.4 shadcn 兼容层

- 深色：`--primary: var(--kb-brand-600)`、`--primary-foreground: #0A1620`、`--ring: var(--kb-brand-400)`
- 浅色：`--primary: var(--kb-brand-600)`、`--primary-foreground: #FFFFFF`、`--accent: var(--kb-brand-600)`（随 brand 自动生效）

---

## 六、3D 发光体色板与硬编码清理

### 6.1 模块发光体（SpatialNav.tsx，去 indigo/purple/pink/lime 原值）

| 模块 | 旧 → 新 | 叙事 |
|------|---------|------|
| dashboard | `#6366F1/#818CF8` → `#40AB92/#57C6A9` | 磷光青绿（主色同族） |
| pomodoro | `#F97316/#FB923C` → `#E8833A/#F4A05E` | 灯笼鱼橙 |
| notes | `#3B82F6/#60A5FA` → `#4A9BD9/#6FB4E8` | 磷光蓝 |
| flashcards | `#10B981/#34D399` → `#43C58B/#63DBA5` | 荧光翠绿 |
| feynman | `#8B5CF6/#A78BFA` → `#F0E3C8/#F8F0DC` | 晨光暖白（海面日出） |
| inspiration | `#EC4899/#F472B6` → `#E8B84B/#F2CF7D` | 萤火暖黄 |
| classroom | `#14B8A6/#2DD4BF` → `#2FB8AC/#4ED0C2` | 声呐青 |
| constellation | `#F59E0B/#FBBF24` → `#9FB8D8/#C3D6EA` | 星光淡蓝 |
| sop | `#84CC16/#A3E635` → `#B5D84E/#CCE672` | 苔藓荧光黄绿 |

> **注**：3D 发光体色与 UI 模块色（`tailwind.config.js` 的 pomodoro/note/flashcard/feynman/classroom + 模块色印章规范）是**不同层**——3D 是氛围色、UI 是标识色，UI 模块色为既定资产**保持不动**。

### 6.2 3D 场景

| 文件 | 现值 → 新值 |
|------|------------|
| SceneProvider | 背景 `#0a0a2e` → `#0A1620`（去紫） |
| DeepSeaWorld shader | `#0A1628/#0D1F3C` → 同族微调 |
| AuroraDomeWorld | shader 靛蓝 `#818CF8` → `#4A9BD9`（磷光蓝） |
| FishSchool 鱼群 | `#67e8f9` → 保留（深海鱼生态色） |

### 6.3 硬编码清理清单

| 文件 | 现值 → 新值 |
|------|------------|
| QuickStartTab / ModuleGuideTab | `bg-indigo-500`→青绿、`bg-cyan-500`→磷光蓝、`bg-purple-500`→萤火黄 |
| MobileNavGrid | `indigo`→磷光青绿、`violet`→晨空蓝 |
| InspirationPage | `from-purple-400 to-purple-600`→萤火暖黄渐变、`purple-500 to-cyan-500`→磷光蓝渐变 |
| ModuleEntity / AuroraModuleEntity tooltip | `border-indigo-500/30`→青绿 |
| PodcastPlayer | `violet-500`→磷光蓝 |
| AnglerfishAchievements / UnifiedTimeline | `cyan-*`→磷光蓝系 |
| AIButton | 呼吸辉光紫色 → 磷光蓝 `rgba(74,155,217,0.3)` |

---

## 七、双光源材质实现规格

### 7.1 架构

主题差异全部收进 `tokens.css`（原生 CSS 材质类 + `[data-theme]` 覆盖），`Button.tsx` 变体只挂类名——主题切换零 JS、零 Tailwind 解析依赖。

### 7.2 材质类

```css
/* 深色 · 主按钮：海面光（顶部环境光） + 磷光自发光（内透） + 微噪点 */
.kb-btn-biolum {
  background: radial-gradient(120% 120% at 50% 0%,
    #57C6A9 0%, #40AB92 55%, #2F7D6A 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18),      /* 湿润高光 */
              inset 0 -3px 8px rgba(4,16,12,.25),       /* 底部光衰减 */
              0 0 14px rgba(64,171,146,.22);            /* 磷光辉光 */
}
.kb-btn-biolum::after {           /* 微噪点层（实施时生成 feTurbulence data-URI：
                                      baseFrequency 高值 → 1px 颗粒，加透明度） */
  background-image: url("data:image/svg+xml,…");   /* 实施时具体化 */
  opacity: .03;                   /* 1px 尺度，肉眼近不可见 */
}
.kb-btn-biolum:active {           /* 按压点亮：仅增强自发光层，150ms */
  box-shadow: inset 0 0 14px rgba(255,255,255,.22),
              inset 0 1px 0 rgba(255,255,255,.18),
              0 0 18px rgba(64,171,146,.3);
  scale: .97;
}

/* 浅色 · 主按钮：晨光（左上） + 琥珀自发光 */
.kb-btn-morning {
  background: linear-gradient(180deg, #C97A22, #B05E12 55%, #A3550E);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.28),      /* 晨光高光边 */
              inset 0 -1px 0 rgba(0,0,0,.12),           /* 底部投影线 */
              0 2px 6px rgba(154,79,12,.22);            /* 暖棕投影 */
}
/* .kb-btn-biolum-ai / .kb-btn-morning-ai：磷光蓝同构变体 */

@media (prefers-reduced-motion: reduce) { /* 退化为纯色变化 */ }
```

### 7.3 变体挂载

| 变体 | 深色 | 浅色 |
|------|------|------|
| primary | `.kb-btn-biolum` | `.kb-btn-morning` |
| ai | `.kb-btn-biolum-ai` | `.kb-btn-morning-ai` |
| secondary / ghost / danger | **保持现状**（边界③） | 同左 |

`Button.tsx` 修改：primary 变体文字色 `text-white` → `text-[var(--primary-foreground)]`（深色自动变深墨字）；挂材质类；`relative overflow-hidden`（承载伪元素）。

---

## 八、实施影响面

| 文件 | 改动 |
|------|------|
| `client/src/styles/tokens.css` | 双主题令牌全量替换 + 材质类定义（核心，§4/§5/§7） |
| `client/src/components/ui/Button.tsx` | primary/ai 变体挂材质类 + 文字色变量化 |
| `client/src/components/ui/AIButton.tsx` | 呼吸辉光紫色 → 磷光蓝 |
| `client/src/lib/3d/navigation/SpatialNav.tsx` | 模块 9 色板重调 |
| `client/src/lib/3d/objects/ModuleEntity.tsx` / `AuroraModuleEntity.tsx` | tooltip 边框色 |
| `client/src/lib/3d/scenes/SceneProvider.tsx` / `DeepSeaWorld.tsx` / `AuroraDomeWorld.tsx` | 背景去紫 + shader 靛蓝替换 |
| `client/src/components/onboarding/help/QuickStartTab.tsx` / `ModuleGuideTab.tsx` | 硬编码色 |
| `client/src/lib/3d/scenes/MobileNavGrid.tsx` | 硬编码色 |
| `client/src/features/inspiration/pages/InspirationPage.tsx`（及渐变所在组件） | 紫渐变替换 |
| `client/src/features/assistant/components/PodcastPlayer.tsx` | violet → 磷光蓝 |
| `client/src/features/dashboard/components/deep-sea/creatures/AnglerfishAchievements.tsx` | cyan → 磷光蓝 |
| `client/src/features/classroom/components/UnifiedTimeline.tsx` | cyan → 磷光蓝 |
| `.superdesign/design-system.md` + `docs/product/ui-ux-system.md` 颜色章节 | 文档同步 |

## 九、验证计划

1. `npm run lint`（Oxlint 零警告）
2. `npm run test`（Vitest 全绿，含现有快照/断言更新）
3. `npm run build`（tsc + vite 构建零错误）
4. 双主题浏览器实测：主按钮/AI 按钮/次级按钮对比度、按压点亮动效、reduced-motion 降级、主题切换一致性
5. 3D 场景实测：dashboard 发光体新色、Aurora 穹顶 shader、低档位（low）渲染正常
6. 文档同步：design-system.md 色表更新

---

> **裁决记录**: 2026-08-08 设计评审通过——范围=全套令牌重调；方向=回归生物发光叙事；AI 色=深海磷光蓝；质感=双光源材质（环境光+自发光+微噪点+按压点亮）；边界=七条客观克制原则。
