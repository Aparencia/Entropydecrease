# 熵减 UI/UX 设计系统（合并权威版）

> **来源**：本文档由重组合并生成 —— `UI-UX设计系统文档v2.md`（主文，项目权威）+ `颜色与风格简析.md` + `ux想法汇总后的简析.md` + phase-2 `05-design-style-guide.md`/`06-ui-ux-standards.md`（通用方法论附录）。冲突处以更具体/更新版本为准，双方独有内容均保留。

> 主文（第一部分）为项目权威设计系统；附录 A 为设计哲学源头简析（主文 §1/§2/§7 的前身，保留以追溯设计决策脉络）；附录 B 为 UX 灵感维度汇总；附录 C/D 为通用设计流程方法论。

---

# 第一部分：设计系统 v2（权威）


> **版本**: 2.0  
> **最后更新**: 2026-07-18  
> **定位**: 项目视觉设计圣经（Visual Design Bible）  
> **适用范围**: 课伴(KeBan) 全平台客户端

---

### 一、设计宗旨与核心理念

#### 1.1 设计哲学

课伴的 UI/UX 设计遵循 **「温润理性主义」与「有机生长」** 的核心哲学——视觉设计不是装饰，而是「认知科学与情绪体验的翻译器」。

**三大设计目标：**

| 目标 | 描述 |
|------|------|
| **降噪** | 降低外在认知负荷，让用户专注于思考本身 |
| **共情** | 通过色彩与材质调节情绪，提供心理安全感 |
| **滋养** | 通过微反馈与生长隐喻，持续喂养内在动机 |

#### 1.2 视觉关键词

**高级感 · 优雅 · 大胆创新 · 前沿 · 非常规 · 模块交融 · 3D空间化**

#### 1.3 设计原则

- **3D优先**：全屏3D场景为主体，传统UI元素为叠加层
- **双世界隔离**：深浅色模式为两个完全独立、不可互换的3D世界
- **毛玻璃透明性**：功能面板保持背景3D场景可见
- **物理动效**：所有动画基于弹簧物理模型，可中断、有阻尼
- **性能自适应**：三级降级策略，不删减视觉元素，只调精度
- **减少动效尊重**：`prefers-reduced-motion: reduce` 时暂停所有动画而非移除

---

### 二、双世界主题框架

#### 2.1 深色模式「深海意识」(Deep Sea)

##### 视觉概念

深海的隔绝感与安全感。如潜入静谧深海——没有刺眼的白光，只有生物荧光般的微光引导前行，深海磷光蓝的 AI 呼吸灯消解孤独感。

**情绪/氛围关键词**: 沉浸、神秘、隔绝、安全、生物荧光、深海暗流、专注

##### 色彩体系

**品牌主色 — 磷光青绿（磷光绿色系）：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-brand-50` | `#1A1B3A` | 最浅品牌色 |
| `--kb-brand-100` | `#252755` | 浅品牌色 |
| `--kb-brand-200` | `#353878` | 品牌淡色 |
| `--kb-brand-300` | `#4A4E9E` | 品牌中间色 |
| `--kb-brand-400` | `#40AB92` | 品牌强调色（主用） |
| `--kb-brand-500` | `#57C6A9` | 品牌核心色 |
| `--kb-brand-600` | `#40AB92` | 品牌深色 |
| `--kb-brand-700` | `#5558E0` | 品牌更深 |
| `--kb-brand-800` | `#4649C8` | 品牌极深 |
| `--kb-brand-900` | `#373AB0` | 品牌最深 |

**品牌辅色 — 认知琥珀金：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-accent-50` | `#0A1E28` | 最浅辅助色 |
| `--kb-accent-100` | `#0E2E3C` | 浅辅助色 |
| `--kb-accent-200` | `#164E63` | 辅助淡色 |
| `--kb-accent-300` | `#0E7490` | 辅助中间色 |
| `--kb-accent-400` | `#0891B2` | 辅助强调色 |
| `--kb-accent-500` | `#D18A2A` | 辅助核心色 |
| `--kb-accent-600` | `#E8A74A` | 辅助亮色 |
| `--kb-accent-700` | `#67E8F9` | 辅助极亮 |
| `--kb-accent-800` | `#A5F3FC` | 辅助近白 |
| `--kb-accent-900` | `#CFFAFE` | 辅助最亮 |

**功能色（深色模式）：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-focus-blue` | `#60A5FA` | 焦点蓝 |
| `--kb-amber` | `#FBBF24` | 琥珀金（顿悟时刻） |
| `--kb-moss-green` | `#82C9A3` | 苔藓绿（进展） |
| `--kb-stone-purple` | `#3A3545` | 石灰紫 |
| `--kb-cyber-cyan` | `#4A9BD9` | 深海磷光蓝（AI标识） |
| `--kb-color-error` | `#F87171` | 错误红 |
| `--kb-color-warning` | `#FB923C` | 警告橙 |
| `--kb-color-success` | `#4ADE80` | 成功绿 |
| `--kb-color-info` | `#60A5FA` | 信息蓝 |

**背景色 — 极夜深海调：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-bg-primary` | `#0C1524` | 主背景 |
| `--kb-bg-secondary` | `#12203A` | 次级背景 |
| `--kb-bg-tertiary` | `#182A48` | 三级背景 |
| `--kb-bg-elevated` | `#12203A` | 浮层背景 |

**文字色：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-text-primary` | `#E0E6F0` | 主文字 |
| `--kb-text-secondary` | `#90A0B8` | 次级文字 |
| `--kb-text-tertiary` | `#607088` | 辅助文字 |
| `--kb-text-inverse` | `#0C1524` | 反色文字 |

**边框：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-border-default` | `#223550` | 默认边框 |
| `--kb-border-strong` | `#2E4568` | 强调边框 |

##### 场景元素清单

**光照系统：**

| 类型 | 颜色 | 强度 | 位置 | 附加参数 |
|------|------|------|------|----------|
| AmbientLight | `#1E3A5F` | 0.15 | — | — |
| PointLight | `#00BFFF` | 0.5 | `[0, 5, 0]` | distance: 50 |

**环境球：**
- 几何体: SphereGeometry, radius=100, segments=32×32
- 材质: MeshBasicMaterial, color=`#0A1628`, side=BackSide(2)

**场景雾效：**
- 类型: FogExp2
- 颜色: `#0a0a2e`
- 密度: 0.03

**后处理管线：**

| 效果 | 参数 |
|------|------|
| Bloom | intensity=0.5, luminanceThreshold=0.6, luminanceSmoothing=0.9, mipmapBlur=true |
| DepthOfField | focusDistance=0.01, focalLength=0.02, bokehScale=3 |
| Vignette | offset=0.3, darkness=0.7 |

> 后处理在性能等级为 `low` 时完全关闭。

---

#### 2.2 浅色模式「晨曦穹顶」(Aurora Dome)

##### 视觉概念

天文馆般的穹顶世界——太阳系行星轨道 + 星尘粒子 + 云层。如推开林间书房的窗，宣纸般的底色让眼睛瞬间放松，留白让思维自然舒展。

**情绪/氛围关键词**: 温暖、通透、晨光、生机、天文馆、太阳风、星尘

##### 色彩体系

**品牌主色 — 晨光琥珀金（温暖/专注）：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-brand-50` | `#EFF6FF` | 最浅品牌色 |
| `--kb-brand-100` | `#DBEAFE` | 浅品牌色 |
| `--kb-brand-200` | `#BFDBFE` | 品牌淡色 |
| `--kb-brand-300` | `#93C5FD` | 品牌中间色 |
| `--kb-brand-400` | `#60A5FA` | 品牌强调色 |
| `--kb-brand-500` | `#B05E12` | 品牌核心色 |
| `--kb-brand-600` | `#C9761F` | 品牌深色 |
| `--kb-brand-700` | `#1D4ED8` | 品牌更深 |
| `--kb-brand-800` | `#1E40AF` | 品牌极深 |
| `--kb-brand-900` | `#1E3A8A` | 品牌最深 |

**品牌辅色 — 晨空蓝（通透/开阔）：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-accent-50` | `#FFF7ED` | 最浅辅助色 |
| `--kb-accent-100` | `#FFEDD5` | 浅辅助色 |
| `--kb-accent-200` | `#FED7AA` | 辅助淡色 |
| `--kb-accent-300` | `#FDBA74` | 辅助中间色 |
| `--kb-accent-400` | `#FB923C` | 辅助强调色 |
| `--kb-accent-500` | `#4A7DB0` | 辅助核心色 |
| `--kb-accent-600` | `#D97706` | 辅助深色 |
| `--kb-accent-700` | `#B45309` | 辅助更深 |
| `--kb-accent-800` | `#92400E` | 辅助极深 |
| `--kb-accent-900` | `#78350F` | 辅助最深 |

**功能色（浅色模式）：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-focus-blue` | `#3B82F6` | 焦点蓝 |
| `--kb-amber` | `#F59E0B` | 琥珀金 |
| `--kb-moss-green` | `#6BAF8A` | 苔藓绿 |
| `--kb-stone-purple` | `#8B8494` | 石灰紫 |
| `--kb-cyber-cyan` | `#4A9BD9` | 深海磷光蓝 |
| `--kb-color-error` | `#EF4444` | 错误红 |
| `--kb-color-warning` | `#F97316` | 警告橙 |
| `--kb-color-success` | `#22C55E` | 成功绿 |
| `--kb-color-info` | `#3B82F6` | 信息蓝 |

**背景色 — 晨曦浮光调：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-bg-primary` | `#FAF8F5` | 主背景（晨曦砂白） |
| `--kb-bg-secondary` | `#F2EDE6` | 次级背景 |
| `--kb-bg-tertiary` | `#EBE5DC` | 三级背景 |
| `--kb-bg-elevated` | `#FFFFFF` | 浮层背景 |

**文字色：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-text-primary` | `#2C2720` | 主文字 |
| `--kb-text-secondary` | `#7A7570` | 次级文字 |
| `--kb-text-tertiary` | `#9C9590` | 辅助文字 |
| `--kb-text-inverse` | `#FFFFFF` | 反色文字 |

**边框：**

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--kb-border-default` | `#DDD5CA` | 默认边框 |
| `--kb-border-strong` | `#CCC3B7` | 强调边框 |

##### 场景元素清单

**天空穹顶着色器（SkyDome）：**

| uniform | 色值 | 含义 |
|---------|------|------|
| uColorTop | `#FCD34D` | 穹顶顶部金色 |
| uColorMid | `#60A5FA` | 穹顶中部蓝色 |
| uColorBottom | `#F8FAFC` | 穹顶底部近白 |

- 几何体: SphereGeometry, radius=100, segments=64×64
- 着色器: 自定义 GLSL，按归一化 Y 坐标三段混色（阈值 0.6）

**光照系统：**

| 类型 | 颜色 | 强度 | 位置 | 附加参数 |
|------|------|------|------|----------|
| AmbientLight | `#FFF5E6` | 0.4 | — | — |
| PointLight | `#FFF8E7` | 2.0 | `[0, 0, 0]` | distance: 80 |
| HemisphereLight | `#87CEEB` / groundColor: `#FFF8DC` | 0.3 | — | — |

**太阳系统（SunSystem）：**

- 核心球: SphereGeometry r=1.5, color=`#FFF8E7`, toneMapped=false
- 外围光晕: SphereGeometry r=2.5, color=`#FFF8E7`, opacity=0.3, AdditiveBlending, depthWrite=false
- 脉动动画: scale 1.0 ↔ 1.05, 周期4秒, sin波形

**星尘粒子（StarDust）：**

| 参数 | 值 |
|------|-----|
| 粒子数量 | high: 1500, medium: 1000, low: 500 |
| 粒子尺寸 | 0.15 |
| 透明度 | 0.7 |
| 混合模式 | AdditiveBlending |
| 颜色渐变 | `#FFFBEB` → `#F59E0B`（随机插值） |
| 分布范围 | 半径 5~65 球形区域 |
| 流动速度（径向40%粒子） | 0.3 单位/秒 |
| 流动速度（随机60%粒子） | ±0.1 单位/秒 |
| 边界重置距离 | 80 |
| 重置位置 | 太阳附近 r=3~8 |

**云层（CloudLayer）：**

| 参数 | 值 |
|------|-----|
| 云层数量 | 4 |
| Y轴高度 | 15~35 |
| 平面尺寸 | 8~20 × 4.8~12（宽高比 1:0.6） |
| 透明度 | 0.1~0.2 |
| 漂移速度 | 0.02~0.05 单位/帧 |
| 旋转速度 | 0.005 rad/帧 |

> 云层在性能等级为 `low` 时隐藏。

**后处理管线：**

| 效果 | 参数 |
|------|------|
| Bloom | intensity=0.3, luminanceThreshold=0.8, luminanceSmoothing=0.3, mipmapBlur=true |
| ChromaticAberration | offset=(0.001, 0.001), BlendFunction.NORMAL, radialModulation=false |
| Vignette | offset=0.4, darkness=0.3 |

> 后处理在性能等级为 `low` 时完全关闭。

---

#### 2.3 深浅色切换规则

##### 触发条件

- 用户手动切换 `data-theme` 属性（`'dark'` ↔ 移除/`'light'`）
- `useSceneTheme` hook 通过 `MutationObserver` 监听 `documentElement` 的 `data-theme` 属性变化
- `data-theme="dark"` → 深海场景（`deep-sea`）
- 无 `data-theme` 或非 `dark` → 穹顶场景（`aurora-dome`）

##### 过渡动画参数

| 参数 | 值 |
|------|-----|
| 总持续时间 | **500ms**（`TRANSITION_DURATION = 0.5`） |
| 缓动函数 | **easeInOutCubic**: `t < 0.5 ? 4*t³ : 1 - (-2t+2)³/2` |
| 过渡方式 | 交叉淡入淡出（两场景同时存在，材质 opacity 渐变） |
| 实现机制 | 递归遍历 Group 内所有 Mesh/Points，乘以 `baseOpacity` |

##### CSS 主题过渡

```css
body, .theme-transition * {
  transition:
    background-color var(--kb-beat-x3) var(--kb-spring-gentle),  /* 360ms */
    color var(--kb-beat-x2) var(--kb-spring-gentle),             /* 240ms */
    border-color var(--kb-beat-x2) var(--kb-spring-gentle),      /* 240ms */
    box-shadow var(--kb-beat-x3) var(--kb-spring-gentle);        /* 360ms */
}
```

##### 元素映射关系

| 深海元素 | ↔ | 穹顶元素 |
|----------|---|----------|
| AmbientLight `#1E3A5F` 0.15 | ↔ | AmbientLight `#FFF5E6` 0.4 |
| PointLight `#00BFFF` | ↔ | PointLight `#FFF8E7`（太阳） |
| 背景球 `#0A1628` | ↔ | SkyDome 着色器穹顶 |
| FogExp2 `#0a0a2e` | ↔ | 无雾（天空环境） |
| ModuleEntity（几何体） | ↔ | AuroraModuleEntity（行星） |
| Bloom+DoF+Vignette | ↔ | Bloom+ChromaticAberration+Vignette |

---

### 三、3D场景架构

#### 3.1 分层渲染模型

```
┌──────────────────────────────────────────────┐
│  Layer 2 — CustomTitlebar (Electron 标题栏)   │  z-index: 最高
│           CommandPalette (Ctrl+K)             │
│           CloseConfirmDialog                  │
├──────────────────────────────────────────────┤
│  Layer 1 — FunctionalOverlay (功能面板)       │  z-index: 10
│           毛玻璃面板 + 半透明遮罩              │
│           BottomNav (移动端底部栏)             │
├──────────────────────────────────────────────┤
│  Layer 0 — SceneProvider (全屏3D Canvas)      │  z-index: -1
│           SceneTransition (双场景管理)         │  pointer-events: none
│           SpatialNav (模块实体+相机控制)       │
│           PerformanceMonitor / MemoryManager  │
└──────────────────────────────────────────────┘
```

**Canvas 全局配置：**

| 参数 | 值 |
|------|-----|
| antialias | true |
| alpha | true |
| powerPreference | `'high-performance'` |
| stencil | false |
| camera.fov | 60 |
| camera.near | 0.1 |
| camera.far | 1000 |
| camera.position | `[0, 0, 10]` |
| dpr | `[1, 2]` |
| toneMapping | ACESFilmicToneMapping |
| toneMappingExposure | 1.0 |
| shadowMap | PCFSoftShadowMap, enabled=true |

---

#### 3.2 深海场景详细规格

##### 环境光照

| 光源 | 色温/颜色 | 强度 | 位置 | 距离 |
|------|-----------|------|------|------|
| AmbientLight | `#1E3A5F`（深海洋蓝） | 0.15 | — | — |
| PointLight | `#00BFFF`（深海荧光青） | 0.5 | [0, 5, 0] | 50 |

##### 粒子系统

> 当前深海场景未实现独立粒子系统（仅有环境球和光照），粒子效果通过 CSS 层实现（`.kb-depth-particle` 等 CSS 类）。

##### 焦散光效

CSS 层焦散光斑（`.kb-caustic-light`）：

| 参数 | 值 |
|------|-----|
| 尺寸 | 300×300px |
| 形状 | 圆形 (border-radius: 50%) |
| 渐变 | radial: `rgba(34, 211, 238, 0.08)` → transparent 70% |
| 漂移周期 | 20s, ease-in-out, infinite |
| 漂移路径 | (0,0)→(30px,-20px)→(-20px,15px)→(0,0) |
| 透明度范围 | 0.03 → 0.06 → 0.04 → 0.03 |

##### 体积雾

- Three.js 场景雾: FogExp2, color=`#0a0a2e`, density=0.03
- CSS 底部雾气: `.kb-depth-fog`, 呼吸动画 0.6↔1.0 opacity

##### 后处理管线

| 阶段 | 效果 | 参数 |
|------|------|------|
| 1 | Bloom | intensity=0.5, threshold=0.6, smoothing=0.9, mipmapBlur |
| 2 | DepthOfField | focusDistance=0.01, focalLength=0.02, bokehScale=3 |
| 3 | Vignette | offset=0.3, darkness=0.7 |

##### 性能降级规则

| 等级 | 触发条件 | 后处理 | 变化 |
|------|----------|--------|------|
| **L0 (high)** | FPS ≥ 45 | 全部开启 | 完整视觉效果 |
| **L1 (medium)** | 25 ≤ FPS < 45 | 全部开启 | 完整视觉效果（待细化） |
| **L2 (low)** | FPS < 25 | **完全关闭** | 无 Bloom/DoF/Vignette |

---

#### 3.3 穹顶场景详细规格

##### 环境光照

| 光源 | 色温/颜色 | 强度 | 位置 | 附加 |
|------|-----------|------|------|------|
| AmbientLight | `#FFF5E6`（暖白） | 0.4 | — | — |
| PointLight | `#FFF8E7`（日光白） | 2.0 | [0, 0, 0] | distance=80 |
| HemisphereLight | sky=`#87CEEB` ground=`#FFF8DC` | 0.3 | — | — |

##### 粒子系统（StarDust）

见 2.2 节星尘粒子参数表。

##### 后处理管线

| 阶段 | 效果 | 参数 |
|------|------|------|
| 1 | Bloom | intensity=0.3, threshold=0.8, smoothing=0.3, mipmapBlur |
| 2 | ChromaticAberration | offset=(0.001,0.001), NORMAL blend |
| 3 | Vignette | offset=0.4, darkness=0.3 |

##### 性能降级规则

| 等级 | 粒子数 | 云层 | 后处理 |
|------|--------|------|--------|
| **L0 (high)** | 1500 | 4层 | 全部开启 |
| **L1 (medium)** | 1000 | 4层 | 全部开启 |
| **L2 (low)** | 500 | **隐藏** | **完全关闭** |

---

#### 3.4 场景切换机制

##### 代码流程

```
用户切换 data-theme
    ↓
MutationObserver 触发
    ↓
useSceneTheme() 返回新 theme
    ↓
SceneTransition 检测到 theme !== prevTheme
    ↓
设置 isTransitioning = true, progress = 0
    ↓
每帧 useFrame: progress += delta / 0.5
    ↓
计算 eased = easeInOutCubic(progress)
    ↓
applyGroupOpacity(deepSeaGroup, opacity)
applyGroupOpacity(auroraGroup, 1-opacity)
    ↓
progress >= 1 → isTransitioning = false
    ↓
更新 activeScene
```

##### 过渡动画时间线

```
t=0ms    旧场景 opacity=1, 新场景 opacity=0
t=100ms  旧场景 opacity≈0.99, 新场景 opacity≈0.01  (缓入)
t=250ms  旧场景 opacity=0.5, 新场景 opacity=0.5    (中点)
t=400ms  旧场景 opacity≈0.01, 新场景 opacity≈0.99  (缓出)
t=500ms  旧场景 opacity=0, 新场景 opacity=1        (完成)
```

---

### 四、导航系统

#### 4.1 空间导航范式

##### Raycasting 交互模型

- Three.js 内建 Raycasting 由 `@react-three/fiber` 自动处理
- 模块实体通过 `onPointerOver` / `onPointerOut` / `onClick` 事件响应交互
- 悬浮时 `document.body.style.cursor = 'pointer'`

##### 相机飞行参数

| 参数 | 值 |
|------|-----|
| 默认飞行时长 | 600ms（`duration = 0.6`） |
| 缓动函数 | easeOutCubic: `1 - (1-t)³` |
| 相机偏移 | `[0, 0, 4]`（从模块位置向Z正方向偏移） |
| 默认全景位置 | `[0, 0, 10]` |
| CameraController lerp速度 | 模块内: 3, 全景: 2（`delta * speed`） |
| 相机始终朝向 | `[0, 0, 0]`（原点） |

##### 模块位置坐标表（深海模式）

| 模块ID | 坐标 [x, y, z] | 路由 | 标签 |
|--------|----------------|------|------|
| dashboard | [0, 0, 0] | `/` | 首页 |
| pomodoro | [4, 2, -2] | `/pomodoro` | 深潜 |
| notes | [-4, 1, -1] | `/notes` | 结礁 |
| flashcards | [3, -2, -3] | `/flashcards` | 闪卡 |
| feynman | [-3, -1, -4] | `/feynman` | 反衰减呼吸 |
| inspiration | [0, 3, -5] | `/inspiration` | 萤火海沟 |

##### 穹顶模式轨道配置

| 模块ID | 轨道半径 | 公转速度 | 初始角度 |
|--------|----------|----------|----------|
| dashboard | 5（AuroraDomeWorld）/ 0（SpatialNav） | 0.3 / 0 | 0 |
| pomodoro | 8 / 3 | 0.22 / 0.3 | π×0.33 / 0 |
| notes | 11 / 4.5 | 0.16 / 0.2 | π×0.77 / π×0.4 |
| flashcards | 14 / 6 | 0.12 / 0.15 | π×1.2 / π×0.8 |
| feynman | 17 / 7.5 | 0.09 / 0.12 | π×1.6 / π×1.2 |
| inspiration | 20 / 9 | 0.06 / 0.1 | π×0.1 / π×1.6 |

> 注：存在两套轨道配置——`AuroraDomeWorld.tsx` 中的 `ORBIT_CONFIGS` 和 `SpatialNav.tsx` 中的 `AURORA_ORBIT_CONFIG`，当前以实际激活的组件为准。

---

#### 4.2 键盘快捷键

| 按键 | 功能 | 条件 |
|------|------|------|
| `Escape` | 退出当前模块，导航至首页 `/` | 仅在 `isInModule` 为 true 时生效 |
| `1` | 导航至首页 `/` | 无修饰键，焦点不在输入元素 |
| `2` | 导航至深潜 `/pomodoro` | 同上 |
| `3` | 导航至结礁 `/notes` | 同上 |
| `4` | 导航至闪卡 `/flashcards` | 同上 |
| `5` | 导航至反衰减呼吸 `/feynman` | 同上 |
| `6` | 导航至萤火海沟 `/inspiration` | 同上 |
| `Ctrl+K` | 打开命令面板 | 全局 |

> 输入框（`<input>`, `<textarea>`, `contentEditable`）获焦时不拦截任何快捷键。

---

#### 4.3 导航状态管理（OrbitalStore）

**完整状态定义：**

```typescript
interface OrbitalState {
  currentModule: ModuleId | null;    // 当前激活的模块
  isInModule: boolean;                // 是否在模块内（控制覆盖层显示）
  hoveredModule: ModuleId | null;    // 当前悬浮的模块
  modules: ModulePosition[];          // 所有模块的位置信息
  enterModule: (id: ModuleId) => void;  // 进入模块
  exitModule: () => void;               // 退出模块
  setHovered: (id: ModuleId | null) => void;  // 设置悬浮状态
  syncWithRoute: (pathname: string) => void;   // 与路由同步
}
```

**ModuleId 类型：** `'dashboard' | 'pomodoro' | 'notes' | 'flashcards' | 'feynman' | 'inspiration'`

**路由同步规则：**
- 精确匹配路由路径（如 `/pomodoro` → pomodoro）
- 支持子路由前缀匹配（如 `/flashcards/:deckId/study` → flashcards）
- `/settings` 和 `/analytics` 归属 dashboard
- 无匹配时退出模块状态

---

### 五、模块视觉表达

#### 5.1 深海模式模块映射表

| 模块 | 几何体 | 颜色 (color) | 发光色 (emissive) | 位置 [x,y,z] | 动效描述 |
|------|--------|-------------|-------------------|--------------|----------|
| 首页 (dashboard) | dodecahedron (r=0.8) | `#6366F1` | `#818CF8` | [0,0,0] | 自转+浮动 |
| 深潜 (pomodoro) | octahedron (r=0.8) | `#F97316` | `#FB923C` | [4,2,-2] | 自转+浮动 |
| 结礁 (notes) | box (1×1.2×0.6) | `#3B82F6` | `#60A5FA` | [-4,1,-1] | 自转+浮动 |
| 闪卡 (flashcards) | 双平面卡片堆 | `#3B82F6`+`#6366F1` | `#3B82F6`+`#6366F1` | [3,-2,-3] | 自转+浮动 |
| 反衰减呼吸 (feynman) | torus (r=0.6, tube=0.25) | `#8B5CF6` | `#A78BFA` | [-3,-1,-4] | 自转+浮动 |
| 萤火海沟 (inspiration) | sphere (r=0.7) | `#EC4899` | `#F472B6` | [0,3,-5] | 自转+浮动 |

**闪卡专用几何：**
- 前卡片: PlaneGeometry 0.9×1.2, position z=0.05, rotation z=0.05
- 后卡片: PlaneGeometry 0.9×1.2, position z=-0.05, rotation z=-0.05

**通用材质参数：**

| 参数 | 值 |
|------|-----|
| metalness | 0.3 |
| roughness | 0.4 |
| transparent | true |
| opacity | 0.9 |

**Float 包装参数：**

| 参数 | 值 |
|------|-----|
| speed | 1.0 |
| rotationIntensity | 0.5 |
| floatIntensity | 0.8 |

**自转配置：**
- 旋转轴: 随机归一化向量 `(random-0.5, random-0.5, random-0.5)`
- 旋转速度: `0.2 + random * 0.3` rad/s

---

#### 5.2 穹顶模式模块映射表

| 模块 | 形态 | 半径 | 颜色 | 发光色 | 标签 |
|------|------|------|------|--------|------|
| 首页 (dashboard) | 球体行星 | 1.0 | `#FCD34D` | `#F59E0B` | 首页 |
| 深潜 (pomodoro) | 球体行星 | 0.7 | `#F97316` | `#EA580C` | 深潜 |
| 结礁 (notes) | 球体行星 | 0.7 | `#60A5FA` | `#3B82F6` | 结礁 |
| 闪卡 (flashcards) | 球体行星 | 0.5 | `#34D399` | `#059669` | 闪卡 |
| 反衰减呼吸 (feynman) | 球体行星 | 0.6 | `#A78BFA` | `#7C3AED` | 反衰减呼吸 |
| 萤火海沟 (inspiration) | 球体行星 | 0.4 | `#F472B6` | `#EC4899` | 萤火海沟 |

**通用行星材质参数：**

| 参数 | 值 |
|------|-----|
| metalness | 0.3 |
| roughness | 0.5 |
| segments | 32×32 |

**轨道线：**
- 几何体: LineLoop, 128段, 圆形轨道
- 材质: LineBasicMaterial, color=`#FFFFFF`, opacity=0.15, transparent

**Float 包装参数：**

| 参数 | 值 |
|------|-----|
| speed | 1.5 |
| rotationIntensity | 0.1 |
| floatIntensity | 0.2 |

**行星自转**: rotation.y += delta × 0.5

**Y轴浮动**: `y = sin(angle × 0.5) × 0.5`

---

#### 5.3 模块交互状态

##### 深海模式（ModuleEntity）

| 状态 | emissiveIntensity | scale | 标签 | lerp速度 |
|------|-------------------|-------|------|----------|
| **默认态** | 0.3 | 1.0 | 无 | — |
| **悬浮态** | 0.8 | 1.15 | Html标签浮现 (y=1.3, distanceFactor=8) | delta × 4 |
| **激活态** | 1.2 | 1.3 | — | delta × 4 |

**悬浮标签样式：**
- 背景: `bg-slate-900/80`
- 圆角: `rounded-lg`
- 内边距: `px-3 py-1.5`
- 字体: `text-sm font-medium text-white`
- 边框: `border border-indigo-500/30`
- backdrop: `backdrop-blur-sm`

##### 穹顶模式（AuroraModuleEntity）

| 状态 | emissiveIntensity | scale | 光环透明度 | lerp速度 |
|------|-------------------|-------|-----------|----------|
| **默认态** | 0.15 | 1.0 | 0 | — |
| **悬浮态** | 0.4 | 1.4 | 0.6 | delta × 5 |
| **激活态** | 0.4 | 1.4 | 0.6 | delta × 5 |

**光环几何：**
- 类型: RingGeometry
- 内径: `config.radius × 1.3`
- 外径: `config.radius × 1.6`
- 段数: 64
- 材质: MeshBasicMaterial, transparent, side=DoubleSide

**悬浮/激活行为：**
- 公转停止（angle 不再递增）
- scale lerp 至 1.4
- 光环 opacity lerp 至 0.6

---

### 六、功能面板设计

#### 6.1 FunctionalOverlay 样式规格

**外层容器：**
```
fixed inset-0 z-10
flex items-center justify-center
p-8
pointer-events-none（背景不拦截事件）
```

**入场/出场动画（外层）：**

| 参数 | 值 |
|------|-----|
| initial | opacity: 0 |
| animate | opacity: 1 |
| exit | opacity: 0 |
| duration | 300ms |
| easing | [0.25, 0.46, 0.45, 0.94] |

**半透明背景遮罩：**
```
absolute inset-0
bg-black/20
backdrop-blur-sm
pointer-events-auto（遮罩拦截事件，点击遮罩可关闭）
```

**功能面板：**

| 属性 | 值 |
|------|-----|
| 宽度 | `w-full max-w-5xl` |
| 最大高度 | `max-h-[85vh]` |
| 溢出 | `overflow-y-auto` |
| 圆角 | **不对称**: `24px 12px 20px 16px`（左上→右上→右下→左下） |
| 背景 | `bg-white/10 dark:bg-black/30` |
| 毛玻璃 | `backdrop-blur-2xl` |
| 边框 | `border border-white/20 dark:border-white/10` |
| 阴影 | `0 8px 40px rgba(0,0,0,0.3)` |
| 内边距 | `p-8` |
| pointer-events | `auto` |

**面板入场/出场动画（弹簧物理）：**

| 参数 | 值 |
|------|-----|
| initial | scale: 0.9, y: 30 |
| animate | scale: 1, y: 0 |
| exit | scale: 0.9, y: 30 |
| type | spring |
| stiffness | **300** |
| damping | **30** |

#### 6.2 pointer-events 分层策略

| 层级 | 元素 | pointer-events |
|------|------|----------------|
| 外层容器 | motion.div | `none`（穿透到3D场景） |
| 背景遮罩 | div | `auto`（拦截点击，可关闭模块） |
| 功能面板 | motion.div | `auto`（正常交互） |
| 3D Canvas | div | `none`（作为纯背景） |

#### 6.3 各模块面板适配规则

- **移除背景色**：模块页面不再自带 `bg-white` 或 `bg-bg-primary`，由毛玻璃面板统一提供背景
- **移除固定高度**：模块页面使用 `max-h-[85vh] overflow-y-auto` 而非固定高度
- **保留业务逻辑**：模块内部交互、状态管理、数据操作完全保留
- **文字颜色适配**：使用 CSS 变量 `var(--kb-text-primary)` 等确保深浅色模式可读性

---

### 七、设计令牌系统

#### 7.1 色彩令牌

完整的双主题色彩系统，前缀 `--kb-`，通过 `[data-theme="dark"]` 选择器切换。

**品牌主色对比表：**

| 级别 | 浅色模式 | 深色模式 |
|------|----------|----------|
| 50 | `#EFF6FF` | `#1A1B3A` |
| 100 | `#DBEAFE` | `#252755` |
| 200 | `#BFDBFE` | `#353878` |
| 300 | `#93C5FD` | `#4A4E9E` |
| 400 | `#60A5FA` | `#40AB92` |
| 500 | `#B05E12` | `#57C6A9` |
| 600 | `#C9761F` | `#40AB92` |
| 700 | `#1D4ED8` | `#5558E0` |
| 800 | `#1E40AF` | `#4649C8` |
| 900 | `#1E3A8A` | `#373AB0` |

**品牌辅色对比表：**

| 级别 | 浅色模式（晨空蓝） | 深色模式（认知琥珀金） |
|------|-----------------|-------------------|
| 50 | `#FFF7ED` | `#0A1E28` |
| 100 | `#FFEDD5` | `#0E2E3C` |
| 200 | `#FED7AA` | `#164E63` |
| 300 | `#FDBA74` | `#0E7490` |
| 400 | `#FB923C` | `#0891B2` |
| 500 | `#4A7DB0` | `#D18A2A` |
| 600 | `#D97706` | `#E8A74A` |
| 700 | `#B45309` | `#67E8F9` |
| 800 | `#92400E` | `#A5F3FC` |
| 900 | `#78350F` | `#CFFAFE` |

**模块专属色（Tailwind 扩展，不随主题切换）：**

| 名称 | 色值 | 浅色 | 用途 |
|------|------|------|------|
| pomodoro | `#5B8A72` | `#AAC9B5` | 番茄钟/深潜模块 |
| note | `#6B9BD2` | `#ADD6FF` | 笔记/结礁模块 |
| flashcard | `#7BC4B8` | `#B8E0D8` | 闪卡模块 |
| feynman | `#C4956A` | `#DEBB92` | 费曼/反衰减模块 |

---

#### 7.2 动效节拍系统

以 **120ms** 为基准单位的全局节拍系统：

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--kb-beat-xs` | 60ms | 微交互（图标旋转等） |
| `--kb-beat` | 120ms | 基础节拍 |
| `--kb-beat-x2` | 240ms | 标准过渡 |
| `--kb-beat-x3` | 360ms | 较缓过渡 |
| `--kb-beat-x5` | 600ms | 入场/大面积过渡 |

**传统时长令牌：**

| 令牌 | 值 |
|------|-----|
| `--kb-duration-fast` | 150ms |
| `--kb-duration-normal` | 250ms |
| `--kb-duration-slow` | 400ms |
| `--kb-duration-stagger` | 75ms |
| `--kb-duration-immersive` | 600ms |
| `--kb-duration-synapse` | 800ms |
| `--kb-duration-converge` | 400ms |

**缓动函数令牌：**

| 令牌 | 值 | 描述 |
|------|-----|------|
| `--kb-ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | 标准缓动 |
| `--kb-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 缓入 |
| `--kb-ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | 缓出 |
| `--kb-ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | 缓入缓出 |
| `--kb-ease-bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 弹性 |
| `--kb-ease-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | 平滑 |
| `--kb-ease-spring` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | 弹簧 |
| `--kb-ease-synapse` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | 突触 |

---

#### 7.3 间距系统

**基础间距（4px 基准）：**

| 令牌 | 值 | 像素 |
|------|-----|------|
| `--kb-space-xs` | 0.25rem | 4px |
| `--kb-space-sm` | 0.5rem | 8px |
| `--kb-space-md` | 1rem | 16px |
| `--kb-space-lg` | 1.5rem | 24px |
| `--kb-space-xl` | 2rem | 32px |
| `--kb-space-2xl` | 3rem | 48px |

**Rhythm Grid（有机布局专用，响应式 clamp）：**

`index.css` 中的定义（覆盖 tokens.css 的静态值）：

| 令牌 | 值 | 范围 |
|------|-----|------|
| `--kb-rhythm-xs` | `clamp(4px, 0.5vw, 8px)` | 4~8px |
| `--kb-rhythm-sm` | `clamp(8px, 1vw, 12px)` | 8~12px |
| `--kb-rhythm-md` | `clamp(16px, 1.5vw, 24px)` | 16~24px |
| `--kb-rhythm-lg` | `clamp(24px, 2vw, 32px)` | 24~32px |
| `--kb-rhythm-xl` | `clamp(32px, 3vw, 48px)` | 32~48px |

**信息密度调节：**

| data-density | --kb-spacing-scale | --kb-font-scale |
|-------------|-------------------|-----------------|
| compact | 0.75 | 0.9 |
| normal（默认） | 1.0 | 1.0 |
| loose | 1.25 | 1.05 |

---

#### 7.4 3D 透视基准

| 令牌 | 值 | 描述 |
|------|-----|------|
| `--kb-perspective` | 1200px | CSS 3D 透视距离 |
| `--kb-z-near` | 50px | Z轴近裁剪面 |
| `--kb-z-far` | -200px | Z轴远裁剪面 |
| `--kb-blend-radius` | 80px | 模块交融渐变半径 |
| `--kb-blend-opacity` | 0.15 | 模块交融透明度 |

Three.js Canvas 透视：fov=60, near=0.1, far=1000

---

#### 7.5 阴影系统

**浅色模式 — 暖色调阴影：**

| 令牌 | 值 |
|------|-----|
| `--kb-shadow-sm` | `0 1px 2px rgba(30, 27, 24, 0.04)` |
| `--kb-shadow-md` | `0 4px 6px -1px rgba(30, 27, 24, 0.06), 0 2px 4px -2px rgba(30, 27, 24, 0.04)` |
| `--kb-shadow-lg` | `0 4px 12px rgba(30, 27, 24, 0.06)` |
| `--kb-shadow-brand` | `0 4px 12px rgba(59, 130, 246, 0.2)` |
| `--kb-shadow-accent` | `0 4px 12px rgba(245, 158, 11, 0.2)` |
| `--kb-shadow-brand-hover` | `0 6px 20px rgba(59, 130, 246, 0.3)` |
| `--kb-shadow-accent-hover` | `0 6px 20px rgba(245, 158, 11, 0.3)` |

**深色模式 — 黑色投影 + 蓝光弥散双层：**

| 令牌 | 值 |
|------|-----|
| `--kb-shadow-sm` | `0 1px 3px rgba(12,21,36,0.4), 0 0 8px rgba(99,102,241,0.05)` |
| `--kb-shadow-md` | `0 4px 12px rgba(12,21,36,0.5), 0 0 16px rgba(99,102,241,0.08)` |
| `--kb-shadow-lg` | `0 8px 24px rgba(12,21,36,0.6), 0 0 24px rgba(99,102,241,0.12)` |
| `--kb-shadow-brand` | `0 4px 16px rgba(99,102,241,0.25)` |
| `--kb-shadow-accent` | `0 4px 16px rgba(6,182,212,0.2)` |

> `index.css` 中 `[data-theme="dark"]` 的阴影使用 indigo 色 `rgba(99,102,241,...)` 弥散光，`tokens.css` 中使用 blue 色 `rgba(59,130,246,...)`。以 `index.css` 的覆盖值为最终标准。

---

#### 7.6 文字系统

**字体家族：**

| 令牌 | 字体栈 | 用途 |
|------|--------|------|
| `--kb-font-sans` | `'Inter', 'PingFang SC', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif` | 正文/UI |
| `--kb-font-serif` | `'LXGW WenKai Lite', 'Noto Serif SC', 'Source Han Serif SC', serif` | 品牌衬线体/核心概念 |
| `--kb-font-mono` | `'JetBrains Mono', 'Fira Code', monospace` | 代码 |
| `--kb-font-timer` | `'JetBrains Mono', monospace` | 计时器数字 |

**字号体系：**

| 令牌 | 值 | 像素 | 用途 |
|------|-----|------|------|
| `--kb-text-d1` | 2.25rem | 36px | 超大标题 |
| `--kb-text-d2` | 1.875rem | 30px | 大标题 |
| `--kb-text-h1` | 1.5rem | 24px | H1 |
| `--kb-text-h2` | 1.25rem | 20px | H2 |
| `--kb-text-h3` | 1rem | 16px | H3 |
| `--kb-text-b1` | 1rem | 16px | 正文大 |
| `--kb-text-b2` | 0.875rem | 14px | 正文小 |
| `--kb-text-b3` | 0.75rem | 12px | 辅助文字 |
| `--kb-text-c1` | 0.75rem | 12px | 注释 |
| `--kb-text-c2` | 0.625rem | 10px | 极小 |
| `--kb-text-timer` | `clamp(4rem, 8vw, 6rem)` | 64~96px | 计时器数字 |

**深色模式文字优化：**

| 参数 | 浅色模式 | 深色模式 |
|------|----------|----------|
| font-weight-body | 默认(400) | **500**（+100） |
| line-height-body | 默认(1.8) | **2.0**（+0.2） |
| letter-spacing-heading | 默认(0) | **0.5px** |

**图标系统（Lucide Icons）：**

| 令牌 | 值 |
|------|-----|
| `--kb-icon-stroke-width` | 1.5 |
| `--kb-icon-size-xs` | 14px |
| `--kb-icon-size-sm` | 16px |
| `--kb-icon-size-md` | 20px |
| `--kb-icon-size-lg` | 24px |
| `--kb-icon-size-xl` | 32px |

**圆角系统：**

| 令牌 | 值 | 像素 |
|------|-----|------|
| `--kb-radius-sm` | 0.5rem | 8px |
| `--kb-radius-md` | 0.75rem | 12px |
| `--kb-radius-lg` | 1rem | 16px |
| `--kb-radius-xl` | 1.25rem | 20px |
| `--kb-radius-full` | 9999px | 圆形/胶囊 |

---

### 八、动画系统

#### 8.1 弹簧动效配置

所有动画可中断，基于 Framer Motion 弹簧物理模型：

| 预设名 | type | stiffness | damping | 用途 |
|--------|------|-----------|---------|------|
| `default` | spring | **300** | **28** | 标准交互 |
| `bouncy` | spring | **400** | **20** | 弹性强调（3D翻转等） |
| `gentle` | spring | **200** | **35** | 柔和过渡 |
| `stiff` | spring | **500** | **35** | 快速刚性响应 |

**CSS 弹簧近似曲线：**

| 令牌 | CSS 值 | 对应预设 |
|------|--------|----------|
| `--kb-spring-default` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | default |
| `--kb-spring-bouncy` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | bouncy |
| `--kb-spring-gentle` | `cubic-bezier(0.23, 1, 0.32, 1)` | gentle |

---

#### 8.2 动画预设变体

**fadeInUp（渐入上移）：**

| 阶段 | 属性 |
|------|------|
| initial | opacity: 0, y: 12 |
| animate | opacity: 1, y: 0, transition: SPRING.default |
| exit | opacity: 0, y: -8, transition: duration 0.2s |

**scaleIn（缩放进入）：**

| 阶段 | 属性 |
|------|------|
| initial | opacity: 0, scale: 0.95 |
| animate | opacity: 1, scale: 1, transition: SPRING.default |
| exit | opacity: 0, scale: 0.95, transition: duration 0.15s |

**flip3D（3D翻页）：**

| 面 | 属性 |
|----|------|
| front | rotateY: 0, transition: SPRING.bouncy |
| back | rotateY: 180, transition: SPRING.bouncy |

---

#### 8.3 页面转场

**CSS 页面淡入（`.page-fade-in`）：**

| 参数 | 值 |
|------|-----|
| 动画名 | fadeIn |
| 持续时间 | 250ms |
| 缓动 | ease-out |
| 初始状态 | opacity: 0, translateY: 4px |
| 结束状态 | opacity: 1, translateY: 0 |

**FunctionalOverlay 转场：**

| 参数 | 值 |
|------|-----|
| 外层 duration | 300ms |
| 外层 easing | [0.25, 0.46, 0.45, 0.94] |
| 面板 type | spring |
| 面板 stiffness | 300 |
| 面板 damping | 30 |
| 面板 initial | scale: 0.9, y: 30 |
| 面板 exit | scale: 0.9, y: 30 |

---

#### 8.4 3D 动画

**模块浮动（Float 组件 from @react-three/drei）：**

深海模式：

| 参数 | 值 |
|------|-----|
| speed | 1.0 |
| rotationIntensity | 0.5 |
| floatIntensity | 0.8 |

穹顶模式：

| 参数 | 值 |
|------|-----|
| speed | 1.5 |
| rotationIntensity | 0.1 |
| floatIntensity | 0.2 |

**相机飞行：**

| 参数 | 值 |
|------|-----|
| 飞行时长 | 600ms |
| 缓动 | easeOutCubic |
| CameraController lerp | delta × speed（模块内 speed=3, 全景 speed=2） |

**粒子运动（穹顶星尘）：**

- 径向粒子（40%）：速度 0.3 单位/秒，沿径向方向
- 随机粒子（60%）：速度 ±0.1 单位/秒，随机方向
- Y轴浮动：±0.05 单位/秒
- 边界重置：距离 > 80 时重置到太阳附近 r=3~8

---

### 九、性能策略

#### 9.1 三级降级矩阵

| 等级 | FPS 阈值 | 粒子数(穹顶) | 云层 | 后处理 | 像素比 |
|------|----------|-------------|------|--------|--------|
| **L0 (high)** | ≥ 45 | 1500 | 4层 | 全部开启 | dpr [1,2] |
| **L1 (medium)** | 25~44 | 1000 | 4层 | 全部开启 | dpr [1,2] |
| **L2 (low)** | < 25 | 500 | 隐藏 | 完全关闭 | dpr [1,2] |

**性能检测频率：** 每 2000ms 采样一次 FPS

**降级策略说明：**
- 不删减视觉元素（模块实体始终渲染）
- 仅降低粒子数量和关闭后处理/云层
- Canvas dpr 固定为 `[1, 2]`，由浏览器根据设备自动选择

---

#### 9.2 Electron 内存管理

**失焦帧率控制：**

| 状态 | 行为 |
|------|------|
| 窗口可见 | 正常渲染每帧 |
| 窗口不可见（blur/minimize） | 每 4 帧渲染 1 帧（跳过 3/4 帧） |

**内存监控：**

| 参数 | 阈值 | 检查频率 |
|------|------|----------|
| geometries | > 500 时告警 | 每 30 秒 |
| textures | > 100 时告警 | 每 30 秒 |

**dispose 策略：** 待定义（当前未实现显式 dispose，依赖 WebGL 垃圾回收）

---

#### 9.3 GPU 加速配置

Canvas WebGL 渲染器配置：

| 参数 | 值 | 说明 |
|------|-----|------|
| antialias | true | 抗锯齿 |
| alpha | true | 透明背景 |
| powerPreference | `'high-performance'` | 请求独立 GPU |
| stencil | false | 关闭模板缓冲 |
| toneMapping | ACESFilmicToneMapping | 电影级色调映射 |
| toneMappingExposure | 1.0 | 标准曝光 |
| shadowMap.type | PCFSoftShadowMap | 柔和阴影 |

**Electron GPU 启动参数：** 待定义（建议在 `main.ts` 中添加 `--enable-gpu-rasterization`、`--use-angle=default` 等）

---

### 十、已知局限与优化方向

#### 10.1 当前局限

1. **3D场景为概念原型**：深海场景仅有基础光照和环境球，缺少粒子系统、海底地形、生物发光体等细节
2. **穹顶着色器待深化**：SkyDome 使用简单三段混色，缺少云层体积渲染、光线散射等高级效果
3. **双轨道配置不一致**：`AuroraDomeWorld.tsx` 和 `SpatialNav.tsx` 中存在两套不同的轨道参数
4. **首次加载延迟**：WebGL 上下文初始化 + Three.js 资源加载可能导致首屏白闪
5. **低端设备体验**：依赖降级策略，L2 级别下视觉效果大幅削减
6. **深海模块实体为简单几何体**：缺少自定义着色器、纹理贴图
7. **Dispose 策略缺失**：MemoryManager 仅做帧跳过和监控，未实现显式资源释放
8. **CSS 阴影值不一致**：`index.css` 和 `tokens.css` 中深色阴影的 rgba 基色不同

#### 10.2 建议优化方向

1. **自定义着色器**：为深海场景编写水体着色器（焦散、光柱、散射），为穹顶添加大气散射着色器
2. **Onboarding 引导动画**：首次进入时的相机环绕飞行 + 模块高亮引导
3. **模块间数据流可视化**：知识关联的发光粒子流连接不同模块实体
4. **声音设计**：深海环境音（水下低频）、穹顶环境音（风声/鸟鸣）、UI 交互音效
5. **WebXR 支持（远期）**：VR/AR 沉浸式学习空间
6. **统一轨道配置**：合并两套轨道参数为单一数据源
7. **显式资源管理**：场景切换时 dispose 旧场景的 Geometry/Material/Texture
8. **GPU 启动参数优化**：在 Electron 主进程中配置 GPU 加速参数
9. **骨架屏 + 渐进加载**：3D 场景加载期间显示 CSS 骨架屏
10. **动态 FOV**：进入模块时收窄 FOV 营造聚焦感，退出时恢复

---

### 附录A：文件索引

#### 3D 核心文件

| 路径 | 说明 |
|------|------|
| `client/src/lib/3d/core/SceneProvider.tsx` | Canvas 容器与全局配置 |
| `client/src/lib/3d/core/PerformanceMonitor.tsx` | FPS 追踪与动态降级 |
| `client/src/lib/3d/core/CameraController.tsx` | 相机位置 lerp 控制 |
| `client/src/lib/3d/core/MemoryManager.tsx` | 失焦帧率控制与内存监控 |
| `client/src/lib/3d/core/QualityController.tsx` | 待确认 |
| `client/src/lib/3d/core/ContextRecovery.tsx` | WebGL 上下文恢复 |

#### 3D 场景文件

| 路径 | 说明 |
|------|------|
| `client/src/lib/3d/scenes/DeepSeaWorld.tsx` | 深海场景 |
| `client/src/lib/3d/scenes/AuroraDomeWorld.tsx` | 晨曦穹顶场景 |
| `client/src/lib/3d/scenes/SceneTransition.tsx` | 场景切换管理 |

#### 3D 对象文件

| 路径 | 说明 |
|------|------|
| `client/src/lib/3d/objects/ModuleEntity.tsx` | 深海模式模块实体 |
| `client/src/lib/3d/objects/AuroraModuleEntity.tsx` | 穹顶模式行星实体 |

#### 3D 导航文件

| 路径 | 说明 |
|------|------|
| `client/src/lib/3d/navigation/OrbitalStore.ts` | 导航状态 (Zustand) |
| `client/src/lib/3d/navigation/SpatialNav.tsx` | 空间导航组件 |

#### 3D Hooks

| 路径 | 说明 |
|------|------|
| `client/src/lib/3d/hooks/useSceneTheme.ts` | 主题监听 hook |
| `client/src/lib/3d/hooks/useCameraFlight.ts` | 相机飞行 hook |

#### 布局与覆盖层

| 路径 | 说明 |
|------|------|
| `client/src/components/layout/AppLayout.tsx` | 应用主布局（分层架构） |
| `client/src/components/overlay/FunctionalOverlay.tsx` | 毛玻璃功能面板 |

#### 设计令牌与样式

| 路径 | 说明 |
|------|------|
| `client/src/styles/tokens.css` | 设计令牌定义 |
| `client/src/index.css` | 全局 CSS + 动效 + 令牌覆盖 |
| `client/src/lib/animation/springConfig.ts` | 弹簧动效配置 |
| `client/tailwind.config.js` | Tailwind 扩展配置 |

#### 设计文档

| 路径 | 说明 |
|------|------|
| `docs/phase_design/颜色与风格简析.md` | 原始设计风格文档 |

---

### 附录B：色彩参考速查表

#### 深色模式（深海意识）

**品牌色（磷光青绿）：**
`#1A1B3A` `#252755` `#353878` `#4A4E9E` `#40AB92` `#57C6A9` `#40AB92` `#5558E0` `#4649C8` `#373AB0`

**辅助色（认知琥珀金）：**
`#0A1E28` `#0E2E3C` `#164E63` `#0E7490` `#0891B2` `#D18A2A` `#E8A74A` `#67E8F9` `#A5F3FC` `#CFFAFE`

**背景：**
`#0C1524` `#12203A` `#182A48`

**文字：**
`#E0E6F0` `#90A0B8` `#607088`

**边框：**
`#223550` `#2E4568`

**功能色：**
`#60A5FA` `#FBBF24` `#82C9A3` `#4A9BD9` `#F87171` `#FB923C` `#4ADE80`

#### 浅色模式（晨曦穹顶）

**品牌色（晨光琥珀金）：**
`#EFF6FF` `#DBEAFE` `#BFDBFE` `#93C5FD` `#60A5FA` `#B05E12` `#C9761F` `#1D4ED8` `#1E40AF` `#1E3A8A`

**辅助色（晨空蓝）：**
`#FFF7ED` `#FFEDD5` `#FED7AA` `#FDBA74` `#FB923C` `#4A7DB0` `#D97706` `#B45309` `#92400E` `#78350F`

**背景：**
`#FAF8F5` `#F2EDE6` `#EBE5DC` `#FFFFFF`

**文字：**
`#2C2720` `#7A7570` `#9C9590`

**边框：**
`#DDD5CA` `#CCC3B7`

**功能色：**
`#B05E12` `#4A7DB0` `#6BAF8A` `#D18A2A` `#EF4444` `#F97316` `#22C55E`

#### 3D 场景专用色

**深海场景：**
- 环境球: `#0A1628`
- 环境光: `#1E3A5F`
- 点光源: `#00BFFF`
- 场景雾: `#0a0a2e`
- 焦散光: `rgba(34, 211, 238, 0.08)`

**穹顶场景：**
- 穹顶顶部: `#FCD34D`
- 穹顶中部: `#60A5FA`
- 穹顶底部: `#F8FAFC`
- 太阳核心: `#FFF8E7`
- 太阳光晕: `#FFF8E7` (opacity 0.3)
- 星尘渐变: `#FFFBEB` → `#F59E0B`
- 轨道线: `#FFFFFF` (opacity 0.15)
- 半球光天空: `#87CEEB`
- 半球光地面: `#FFF8DC`

---

> **文档维护说明**：本文档中的所有参数值均从项目源代码中提取。当代码中的设计参数发生变化时，应同步更新本文档以保持设计圣经的准确性。


---

# 附录A：颜色与风格简析（设计哲学源头）

一份完整、严谨且极具差异化的**《KeBan（课伴）认知美学系统设计蓝图》**。
这套方案将视觉设计提升为“认知科学与情绪体验的翻译器”，其核心设计哲学是：**“温润理性主义”与“有机生长”**。
以下是为您整理的最终方案：
---
### 一、 核心设计哲学：让视觉服务于认知
课伴不追求极简的冷淡，也不追求娱乐的喧闹。我们的设计旨在实现三个目标：
1.  **降噪**：降低外在认知负荷，让用户专注于思考本身。
2.  **共情**：通过色彩与材质调节情绪，提供心理安全感。
3.  **滋养**：通过微反馈与生长隐喻，持续喂养内在动机。
---
### 二、 双模色彩系统：动态映射认知状态
课伴的色彩不是静态皮肤，而是随光线、生理节律与认知状态变化的**生物反馈界面**。
#### 1. 深色模式：深海静谧 —— 夜间与深度专注
*   **核心隐喻**：深海的隔绝感与安全感。
*   **基底色**：**极夜深青 / 深空蓝紫**（替代纯黑）。
    *   像深海或夜空，吸收多余光线，消除眩光，迅速切入沉浸状态。
*   **功能色**：
    *   **专注蓝**（主色）：激活前额叶，抑制杏仁核焦虑。
    *   **认知琥珀金**（高光）：代表“尤里卡时刻”（顿悟），用于CTA按钮与纠错反馈。高自信答错时闪烁金光，暗示“发现了宝藏”。
    *   **生物荧光绿**（进展）：模拟深海发光生物，用于进度条与正向反馈，温和喂养多巴胺。
*   **动态机制**：
    *   **情绪急救**：检测到卡壳挫败时，界面缓缓注入**柔粉治愈色**（贝克-米勒粉），像导师的手轻拍肩膀，降低心率。
    *   **记忆黑洞唤醒**：课程中段背景明度极微小波动，潜意识唤醒注意力。
#### 2. 浅色模式：晨光迷雾 —— 日间与清晰阅读
*   **核心隐喻**：雨后清晨的林间书房，通透且有呼吸感。
*   **基底色**：**晨曦砂白 / 羊皮纸白**（替代纯白）。
    *   带有极微弱暖调的米白，模拟自然光下的纸张，消除纯白屏幕的刺眼蓝光，提供“旧书与茶”般的沉静。
*   **材质**：叠加肉眼难察觉的**宣纸纤维纹理**，打破数字屏幕的完美平滑，增加真实触感。
*   **功能色**：
    *   **晴空蓝**：通透冷静，用于导航。
    *   **林叶绿**：饱和度适中，像被阳光穿透的树叶，用于进度与掌握状态。
    *   **晨曦琥珀**：柔和的暖光，用于重点强调。
*   **动态机制**：
    *   **加载动效**：不再是旋转圈，而是**一道柔和的亮光缓慢扫过**，像阳光穿过窗帘。
---
### 三、 视觉风格维度：温润理性的骨架
#### 1. 形态语言：超级椭圆与有机曲线
*   **拒绝尖锐**：全局采用**连续曲率圆角**，比普通圆角更柔和、更有数学美感，消除直角带来的潜意识警觉。
*   **神经突触连线**：知识图谱的连线采用**渐细渐隐的流线**，模仿神经元放电形态，拒绝僵硬的直线。
*   **边缘暧昧**：卡片与模块间摒弃1px硬边框，改用**羽化渐隐**或大面积留白分隔，营造“呼吸感”。
#### 2. 质感与层级：空气感玻璃与微纸质
*   **深色模式**：采用**深海毛玻璃**（轻量Glassmorphism），背景模糊化，前景聚光，营造悬浮的深邃感。
*   **浅色模式**：采用**轻量弥散阴影**与**微纸质纹理**，像落叶散落在宣纸上，自然且真实。
*   **有色阴影**：摒弃黑色投影，使用**环境色深吻式阴影**（如蓝色卡片带蓝光晕），让元素像发光体。
#### 3. 排版节奏：呼吸式信息密度
*   **留白叙事**：遵循“黄金梯形”原则，越往内容深处，留白越慷慨。段落间距约为字号1.5倍，拒绝拥挤。
*   **双字体策略**：
    *   **正文**：现代无衬线体（思源柔黑/Inter），锐利舒适，适合长时间屏幕阅读。
    *   **核心概念/悬念**：切换为**人文衬线体**（思源宋体/霞鹜文楷），带来“学术著作”的庄重感，激活重要信息编码。
#### 4. 动效交互：克制的生命力
*   **流体缓动**：所有交互采用**水滴融合般的慢入慢出曲线**（400-500ms），带有物理阻尼感，安抚急躁情绪。
*   **触觉涟漪**：完成学习时，从点击处扩散极淡的色光，并触发手机线性马达轻柔震动，提供三重微小滋养。
*   **生长隐喻**：知识图谱节点点亮时，像植物缓慢舒展；进度条填充时，像藤蔓生长。
#### 5. 图形语言：认知星图与有机拓扑
*   **拒绝旧符号**：摒弃书本、铅笔、时钟等老旧icon。
*   **微缩星图**：用**发光节点 + 引力连线**构建知识网络，视角如俯瞰深空（深色）或林间空地（浅色）。
*   **悬念视觉化**：未解锁内容用**带光晕的暗色渐变**覆盖，利用视觉“未闭合原则”，制造心痒的探索欲。
---
### 四、 总结：用户的第一眼体验
当用户打开课伴：
*   **如果是夜晚**，他潜入了一片**静谧的深海**。没有刺眼的白光，只有生物荧光般的微光引导他前行，孤独感被深海磷光蓝的AI呼吸灯消解。
*   **如果是清晨**，他推开了一扇**林间书房的窗**。宣纸般的底色让眼睛瞬间放松，留白让思维自然舒展，每一处交互都像触碰晨光一样温润。
这套设计不是“好看”，而是一种**视觉认知策略**——让用户在无意识中，被引导向更专注、更深沉、更持久的学习状态。


---

# 附录B：UX 想法维度汇总简析

### 📊 总览：参与方与思考维度
| 参与方 | 基础四维度 | 新增维度数 |
|--------|-----------|-----------|
| GLM5.2 | 空间/动效/感知/前沿技术 | 5个（时间节奏、社交协作、物理虚拟融合、记忆遗忘、伦理包容） |
| 豆包 | 空间/动效/感知/前沿技术 | 6个（时间节律、桌面生态、记忆强化、挫折正向、轻量社交、隐式交互） |
| Qwen3.7 | 空间/动效/感知/前沿技术 | 3个（输入表达重构、社会物理学、时间架构） |
| DeepSeek4.0 | 空间/动效/感知/前沿技术 | 5个（时间生物节律、知识拓扑共生、负向空间、触觉材料、伦理透明） |
| Kimi2.6 | 空间/动效/感知/前沿技术 | 8个（时间拓扑、身体共生、环境渗透、认知脚手架、失败美学、跨应用中枢、情感代理、负空间） |
---
### 一、核心四维度：各方创意对比
#### 维度1：空间布局与信息管理
**共同理念**：突破平面侧边栏/仪表盘范式，引入深度感知、物理隐喻、动态拓扑
| 参与方 | 概念名称 | 核心原理 | 难度 |
|--------|---------|---------|------|
| GLM5.2 | 认知负荷分层系统 | Z轴三层（前景/中景/远景）+ 自适应密度 + 热力图布局 | 中 |
| GLM5.2 | 焦点流布局 | 太阳系模型，任务居中、工具环绕轨道分布 | 高 |
| GLM5.2 | 空间锚点导航 | 主题空间化，手势缩放/旋转切换空间 | 高 |
| 豆包 | 认知景深工作台 | Z轴三层 + 行为推断任务 + 动态景深 | 中 |
| 豆包 | 行为热力自适应栅格 | 行为数据驱动CSS Grid动态重组 | 中高 |
| 豆包 | 知识拓扑空间 | 2.5D力导向网络，可漫游可缩放 | 高 |
| Qwen3.7 | 重力知识星系 | 2.5D物理力场 + 动态引力 + 自适应密度 | 高 |
| DeepSeek4.0 | 焦点引力透镜 | 天体物理引力模型，注意力热力图 | 中高 |
| DeepSeek4.0 | 液态密铺网格 | 认知负荷驱动密度/形态自适应 | 中 |
| Kimi2.6 | 引力场工作台 | Verlet积分物理引擎 + 力导向布局 | 高 |
| Kimi2.6 | 神经突触知识图谱 | 神经元节点 + 脉冲动画 + D3力模拟 | 中 |
| Kimi2.6 | 自适应密度流体布局 | TensorFlow.js推断认知负荷 + CSS Grid | 中 |
**共识**：
- ✅ 深度感知/Z轴分层是普遍选择
- ✅ 物理引力隐喻是高频创意
- ✅ 基于行为/认知负荷的自适应密度
- ✅ 力导向知识图谱替代文件夹结构
**差异化亮点**：
- GLM5.2的"太阳系轨道"模型最具空间直观性
- 豆包的"行为热力栅格"最贴近工程实现
- Qwen3.7的"重力知识星系"最有诗意
- Kimi2.6的"神经突触图谱"最有生命感
---
#### 维度2：动效与微交互
**共同理念**：超越fade/slide/scale，引入物理模拟、流体形变、空间连续性
| 参与方 | 概念名称 | 核心原理 | 难度 |
|--------|---------|---------|------|
| GLM5.2 | 弹性知识图谱 | Verlet积分弹簧 + 拖拽传播 | 中 |
| GLM5.2 | 流体数据形变过渡 | WebGL着色器流体动力学模拟 | 高 |
| GLM5.2 | 手势惯性弹性系统 | Framer Motion内置物理 + react-use-gesture | 低 |
| 豆包 | 流体形变过渡 | SVG路径插值 + 自定义流体算法 | 高 |
| 豆包 | 惯性弹性交互 | Framer Motion Spring + 衰减算法 | 中 |
| 豆包 | 空间视差导航 | CSS 3D + translateZ + 多速度视差 | 中 |
| Qwen3.7 | 形态融合导航 | 物质守恒 + 弹性反馈 + 粘滞感 | 中高 |
| DeepSeek4.0 | 胶体形变动画 | 胶体表面张力 + flubber路径插值 | 中高 |
| DeepSeek4.0 | 回声导航与空间惯性 | 速度矢量 + 3D倾斜残影 + layoutId | 中 |
| Kimi2.6 | 弹性信息物质化 | 自定义Verlet + 果冻形变 + 黑洞扭曲 | 中 |
| Kimi2.6 | 流体形变空间导航 | WebGL Fragment Shader + Simplex Noise | 高 |
| Kimi2.6 | 惯性手势与多指协同 | Electron全局手势 + 空气阻力物理 | 中 |
**共识**：
- ✅ 弹簧物理是基础标配
- ✅ 流体形变是最受推崇的"高级感"动效
- ✅ 跨组件layout动画实现空间连续性
- ✅ 惯性滚动 + 边界反弹
**差异化亮点**：
- Qwen3.7的"粘滞感反馈"把负面状态变成设计语言
- DeepSeek4.0的"回声残影"强化因果关系
- Kimi2.6的"黑洞扭曲"最具视觉冲击
---
#### 维度3：感知与情感化设计
**共同理念**：多模态协同，营造心流与仪式感，环境氛围动态适应
| 参与方 | 概念名称 | 核心原理 | 难度 |
|--------|---------|---------|------|
| GLM5.2 | 心流氛围引擎 | 色温/光照/音景动态调整 | 中 |
| GLM5.2 | 成就粒子系统 | GPU粒子 + 物理特性 + 残留尘埃 | 高 |
| GLM5.2 | 多模态反馈环 | 视/听/触同步编码 | 中 |
| 豆包 | 心流环境光适应 | 径向渐变 + 色温变量 + 番茄钟联动 | 低-中 |
| 豆包 | 多模态成就共振 | 粒子波纹 + Web Audio泛音 + 振动 | 中 |
| 豆包 | 专注沉浸式遮罩 | CSS mask + backdrop-filter柔边遮罩 | 低 |
| Qwen3.7 | 活体环境光 | 呼吸式色温 + 环境音和弦 + 仪式遮罩 | 中 |
| DeepSeek4.0 | 活体光环与进化光色 | WebGL极光着色器 + 专注度映射 | 中高 |
| DeepSeek4.0 | 触感反馈编织 | Electron hapticFeedback + 跨模态异步 | 中 |
| Kimi2.6 | 心流氛围场 | CSS变量 + WebGL焦散光斑 + 色温过渡 | 中 |
| Kimi2.6 | 粒子仪式与成就具象化 | GPU粒子 + 学科内容视觉化 | 高 |
| Kimi2.6 | 微音效与触觉交响 | Web Audio合成 + Electron触觉 | 低 |
**共识**：
- ✅ 色温/光照随专注度变化
- ✅ 成就用GPU粒子庆祝
- ✅ 多模态（视+听+触）反馈协同
- ✅ 专注模式遮罩/极简化
**差异化亮点**：
- Qwen3.7的"植物藤蔓/星云遮罩"最有仪式感
- DeepSeek4.0的"极光着色器光环"最有生命力
- Kimi2.6的"学科内容视觉化粒子"最有记忆点
---
#### 维度4：前沿技术融合
**共同理念**：AI自适应、WebGL/Shader特效、眼动/手势追踪
| 参与方 | 概念名称 | 核心原理 | 难度 |
|--------|---------|---------|------|
| GLM5.2 | AI自适应界面 | 摄像头情绪/疲劳检测 + UI复杂度调整 | 高 |
| GLM5.2 | Shader视觉特效系统 | Perlin噪声 + 景深模糊 + 光照响应 | 高 |
| GLM5.2 | 眼动追踪交互 | 视线悬停激活 + 眨眼确认 | 高 |
| 豆包 | AI认知负荷自适应界面 | ONNX本地模型 + 行为特征推断 | 高 |
| 豆包 | Shader有机数据可视化 | GLSL替代图表 + 细胞生长隐喻 | 高 |
| 豆包 | 非接触手势导航 | MediaPipe Hands + 极简手势集 | 高 |
| Qwen3.7 | AI认知调光器 | 端侧AI + Chromatic Aberration后处理 | 极高 |
| DeepSeek4.0 | 共情自适应界面 | TensorFlow.js + MediaPipe FaceMesh | 高 |
| DeepSeek4.0 | 手势-目光空悬术 | MediaPipe Hands + WebGazer.js | 高 |
| Kimi2.6 | 情感自适应界面引擎 | face-api.js + 状态机UI响应 | 高 |
| Kimi2.6 | 眼动追踪景深增强 | Tobii SDK + backdrop-filter追焦 | 高 |
| Kimi2.6 | AI空间编排助手 | LLM意图识别 + 自动布局算法 | 中 |
| Kimi2.6 | WebGL沉浸式专注舱 | 复杂Shader + React状态同步 | 高 |
**共识**：
- ✅ AI检测情绪/疲劳/认知负荷自适应UI
- ✅ WebGL/Shader实现传统CSS无法做到的视觉特效
- ✅ MediaPipe手势识别 + 眼动追踪
- ✅ 隐私优先：本地推理，不上传数据
**差异化亮点**：
- 豆包的"Shader有机数据可视化"把图表变成生命体
- Kimi2.6的"AI空间编排助手"让LLM做导演
- Qwen3.7的"色差后处理引导注意力"最subtle
---
### 二、新增维度：各方独创疆域
#### 维度A：时间与生物节律
**核心理念**：界面应成为生理时钟的延伸，与认知节律同步
| 参与方 | 概念名称 | 核心原理 |
|--------|---------|---------|
| GLM5.2 | 昼夜节律光照同步 | 色温/亮度随日照变化，调节褪黑素 |
| GLM5.2 | 注意力周期导航 | 90-120分钟周期，主动建议切换 |
| GLM5.2 | 节奏化交互反馈 | 任务节奏与视听脉冲同步，强化记忆 |
| 豆包 | 注意力潮汐界面 | 个人潮汐曲线驱动信息密度 |
| 豆包 | 时间景深时间线 | 时间映射Z轴景深 |
| 豆包 | 微休息情境重置 | 10-30秒呼吸引导场景 |
| Qwen3.7 | 四维知识地层 | 学习历史像地质层堆叠 |
| DeepSeek4.0 | 昼夜节律光桌 | 历史高峰期70Hz微闪脉冲提升警觉 |
| Kimi2.6 | 时间地形图 | 三维地形地貌映射学习历史 |
| Kimi2.6 | 记忆半衰期可视化 | 节点亮度衰减 + 脉动提醒 |
| Kimi2.6 | 昼夜节律自适应引擎 | 个人注意力模型预测波峰波谷 |
**共识亮点**：
- 个人化注意力曲线（非通用番茄钟）
- 时间可视化（地形/地层/景深）
- 与生物钟协同而非对抗
---
#### 维度B：社交与协作
**核心理念**：营造"在场感"而非"社交感"，零压力陪伴
| 参与方 | 概念名称 | 核心原理 |
|--------|---------|---------|
| GLM5.2 | 分布式空间学习圈 | 空间化音频 + 实体化协作 + 化身 |
| GLM5.2 | 接力式知识构建 | CRDTs算法 + 可见的知识传递链 |
| GLM5.2 | 学习伙伴光环 | 困境检测 + 匿名求助信号 |
| 豆包 | 专注灯塔 | 好友状态抽象为灯塔光 |
| 豆包 | 匿名同频共振 | 主题匹配 + 集体波纹 |
| Qwen3.7 | 环境式共在 | 抽象光点 + 异步知识回响 + 集体心流 |
| Kimi2.6 | （未单独展开，但与Qwen理念相近） | - |
**共识亮点**：
- 反对排行榜/内卷攀比
- 抽象化同伴存在（光点/灯塔/呼吸）
- 匿名 + 隐私保护
- 重建"图书馆氛围"而非"教室"
---
#### 维度C：记忆与认知科学
**核心理念**：将遗忘曲线、间隔重复、空间记忆等认知科学原理直接嵌入UI
| 参与方 | 概念名称 | 核心原理 |
|--------|---------|---------|
| GLM5.2 | 遗忘曲线可视化景观 | "记忆森林"，巩固度映射植被状态 |
| GLM5.2 | 上下文唤醒式复习 | 学新知时旧知识自动微弱浮现 |
| GLM5.2 | 记忆宫殿构建器 | 知识点与3D空间位置关联 |
| 豆包 | 空间记忆锚点 | 知识点固定物理位置，复习=漫游 |
| 豆包 | 间隔重复微侵入 | 利用操作间隙1-2秒闪卡 |
| 豆包 | 具身化输入交互 | 拖拽/滑动等肢体动作强化记忆 |
| Kimi2.6 | 概念晶体生长 | 理解度从"云雾→凝胶→晶体→钻石"演化 |
| Kimi2.6 | 认知冲突可视化 | 矛盾节点间生成张力场 |
**共识亮点**：
- 空间记忆是核心机制
- 间隔重复不应该是独立模块，应嵌入日常操作
- 知识掌握度应有视觉具象化（晶体/植被/光）
---
#### 维度D：身体共生与具身认知（Kimi2.6独家深耕）
| 概念 | 核心原理 |
|------|---------|
| 姿态感知界面 | 摄像头检测坐姿，驼背时界面"压迫" |
| 呼吸同步场 | 检测呼吸节律，界面动画同步呼吸 |
| 距离景深感知 | 摄像头估算距离，近看细节远看概览 |
**独特价值**：身体姿态成为隐式交互语言，建立生物反馈回路
---
#### 维度E：环境渗透与混合现实
| 参与方 | 概念名称 | 核心原理 |
|--------|---------|---------|
| Kimi2.6 | 桌面延伸 | Electron透明窗口 + 穿透点击，笔记悬浮桌面 |
| Kimi2.6 | 环境光窃取 | 摄像头读取环境光色温，界面融入环境 |
| Kimi2.6 | 窗外世界 | 摄像头画面经Shader艺术化作为专注背景 |
| GLM5.2 | 实体计算器映射 | AR识别实体物件，生成数字孪生 |
| GLM5.2 | 桌面力场反馈 | 智能灯带/震动马达物理反馈 |
| 豆包 | 环境式桌面挂件矩阵 | 多透明无边框窗口吸附桌面边缘 |
| 豆包 | 跨应用内容引力场 | 全局监听选中文本，引力球一键收录 |
| 豆包 | 系统状态协同适配 | 电源/时间/显示器自动切换模式 |
**共识亮点**：
- 数字内容突破窗口边界
- 与物理环境/真实桌面融合
- 系统级能力调用
---
#### 维度F：挫折耐受与正向设计（豆包/Kimi2.6独创）
| 参与方 | 概念名称 | 核心原理 |
|--------|---------|---------|
| 豆包 | 错题生长式反馈 | 植物生长隐喻，错题对应可成长植株 |
| 豆包 | 卡壳支持梯度递送 | 识别卡壳，三级提示梯度递送 |
| Kimi2.6 | 优雅崩溃 | 错误时钢化玻璃裂纹，功能在裂纹间继续 |
| Kimi2.6 | 分心接纳 | 检测切出应用，捕获为气泡而非阻断 |
| Kimi2.6 | 放弃仪式 | 关闭应用时封装"时间胶囊"，温柔告别 |
**独特价值**：把负面场景变成情感设计机会，保护学习内驱力
---
#### 维度G：伦理与负空间设计
| 参与方 | 概念名称 | 核心原理 |
|--------|---------|---------|
| GLM5.2 | 自适应包容性界面 | 多模态动态重组，适应用户能力 |
| GLM5.2 | 数字detox模式 | 黑白模式 + 通知拦截 + 数字避难所 |
| DeepSeek4.0 | 收缩式存在 | 心流时界面"蒸发"，只留裸文本 |
| DeepSeek4.0 | 可感知的隐私边界 | 数据流可视化球体 + 可撤销 |
| Kimi2.6 | 空白画布 | 95%留白 + 中央呼吸光点 |
| Kimi2.6 | 边缘意识 | 1%色调偏移 + 几乎不可闻低频音 |
**共识亮点**：
- "敢于消失"是高级设计
- 隐私可视化而非权限列表
- 负空间/留白是正反馈
---
#### 维度H：输入重构与思维流（Qwen3.7独家）
| 概念 | 核心原理 |
|------|---------|
| 多模态思维画布 | 语音-文本-图示实时转译，手势作为语法，草稿即数据 |
**独特价值**：从"指令发射器"变为"思维延伸器"，捕获思考过程本身
---
#### 维度I：跨应用神经中枢（Kimi2.6/豆包）
| 参与方 | 概念名称 | 核心原理 |
|--------|---------|---------|
| Kimi2.6 | 全局知识捕获 | 全局快捷键+OCR，从任何应用提取内容 |
| Kimi2.6 | 上下文预知 | 读取活动窗口，主动浮现相关笔记 |
| 豆包 | 跨应用内容引力场 | 全局选中文本监听 + 引力球拖拽 |
**独特价值**：应用成为整个电脑的知识消化系统
---
#### 维度J：情感代理与微观叙事（Kimi2.6独家）
| 概念 | 核心原理 |
|------|---------|
| 学习化身 | 进度/习惯具象化为可成长的数字生命体 |
| 历史自我对话 | 召唤"过去的自己"鼓励现在的自己 |
**独特价值**：情感依恋成为比自律更强的驱动力
---
#### 维度K：隐式交互与预判服务（豆包独家）
| 概念 | 核心原理 |
|------|---------|
| 意图预判操作建议 | 行为序列预判，气泡推送操作入口 |
| 零点击上下文工具 | 选中文本即触发工具，无需点击 |
**独特价值**：减少主动操作，服务主动找用户
---
### 三、各方设计哲学对比
| 参与方 | 核心隐喻 | 设计哲学金句 |
|--------|---------|-------------|
| GLM5.2 | 认知增强空间 | "技术服务于认知，每个动效传递信息" |
| 豆包 | 会呼吸的认知空间 | "惊艳感服务于学习效率，而非单纯炫技" |
| Qwen3.7 | 认知外骨骼 | "界面应成为人类意图的延伸，而非注意力的牢笼" |
| DeepSeek4.0 | 流动的智慧工作室 | "软件应像一盏会呼吸的灯，懂你、适应你" |
| Kimi2.6 | 认知外延与记忆居所 | "学习如何成为生命体验的一部分" |
---
### 四、各方实施路线建议对比
| 参与方 | 阶段划分 | MVP重点 |
|--------|---------|---------|
| GLM5.2 | 3阶段（1-3月/3-6月/6-12月） | 认知分层+弹性图谱+心流引擎 |
| 豆包 | 3阶段（1-2月/3-4月/6月+） | 认知景深+惯性弹性+心流光+专注遮罩 |
| Qwen3.7 | 4层架构（核心/增强/生态/智能） | 空间布局+动效微交互做到极致 |
| DeepSeek4.0 | 未明确分阶段 | 焦点引力透镜+胶体形变+活体光环 |
| Kimi2.6 | P0-P3优先级矩阵 | 弹性物质化+微音效+环境光窃取+放弃仪式+空白画布 |
---
### 五、共识与差异化总结
#### 🎯 五方高度共识的设计原则
1. **物理隐喻优先**：引力/弹簧/流体/惯性 > 静态栅格
2. **认知负荷驱动**：自适应密度 > 固定布局
3. **多模态协同**：视+听+触同步 > 单视觉反馈
4. **隐私优先的AI**：本地推理 > 云端上传
5. **空间记忆**：拓扑网络/3D地形 > 列表/卡片
6. **生物节律同步**：动态色温/光照 > 固定主题
7. **敢于消失**：负空间/留白 > 信息堆砌
8. **失败正向设计**：成长隐喻/接纳分心 > 红叉/阻断
#### 🌟 各方最具差异化亮点
- **GLM5.2**：伦理包容性维度（数字detox/多模态翻译器）最系统化
- **豆包**：挫折耐受维度（错题生长/卡壳梯度）最具人文关怀
- **Qwen3.7**：输入重构维度（多模态思维画布）最具颠覆性
- **DeepSeek4.0**：负空间维度（收缩式存在）+ 触觉纹理最具感官深度
- **Kimi2.6**：维度覆盖最广（12个维度），失败美学+情感代理最完整
#### 💡 综合建议的实施优先级
**P0（MVP必须）**：认知景深分层 + 弹性物理动效 + 心流氛围光 + 专注遮罩 + 环境光窃取 + 空白画布 + 放弃仪式
**P1（差异化）**：行为热力栅格 + 空间视差导航 + 多模态成就共振 + 流体形变过渡 + 注意力潮汐 + 思维暂存区 + 错题生长反馈 + 全局知识捕获
**P2（长期留存）**：知识拓扑空间 + AI自适应界面 + Shader有机可视化 + 记忆半衰期 + 学习化身 + 概念晶体
**P3（行业标杆）**：眼动追踪 + 手势空悬术 + 呼吸同步场 + 活体知识花园 + 时间地形图
---
### 六、最终设计哲学共识
尽管各方表述不同，五方共同指向一个核心信念：
> **真正的惊艳，不在于技术堆砌，而在于技术服务于认知。每个动效都应减少认知负荷，每个反馈都应强化学习，每个维度都应回答"这如何让用户更聪明、更专注、更连接"。**
这是从"工具"到"认知伙伴"的范式跃迁——学习伴侣应用不再是"内容容器"，而是**懂你、适应你、激发你、陪伴你**的思维延伸。


---

# 附录C：通用设计风格指南（phase-2/05）


### 目的

在开发前确定产品的视觉方向，建立一致的设计语言系统，避免开发过程中反复修改样式、风格不统一。

### 适用时机

- 新项目启动，需要确定视觉方向
- 产品改版/品牌升级
- 现有产品风格不统一，需要整理
- 新增暗色/亮色主题
- 建立或更新 Design Token 系统

### 流程步骤

#### 第一步：设计探索

**1.1 竞品分析**
- 选取 3-5 个同类/标杆产品
- 截图记录其色彩、排版、间距、风格特征
- 分析：它们为什么这样设计？目标用户是谁？

**1.2 情绪板 (Mood Board)**
- 收集 15-30 张参考图（不限于软件，可含建筑/自然/艺术）
- 提取关键词：如"简洁""温暖""专业""科技感"
- 收敛为 2-3 个风格方向

**1.3 方案对比**

| 维度 | 方向 A | 方向 B | 方向 C |
|------|--------|--------|--------|
| 关键词 | | | |
| 色彩倾向 | | | |
| 目标感受 | | | |
| 适合场景 | | | |
| 参考产品 | | | |

选定一个方向后进入细化。

#### 第二步：色彩系统

**2.1 色彩定义**

| 色彩角色 | 用途 | 示例 |
|---------|------|------|
| Primary（主色） | 品牌色、主要按钮、链接 | #2563EB |
| Secondary（辅色） | 次要强调、标签 | #7C3AED |
| Neutral（中性色） | 文字、背景、边框 | Gray 50-900 |
| Success | 成功状态 | #16A34A |
| Warning | 警告状态 | #D97706 |
| Error/Danger | 错误、危险操作 | #DC2626 |
| Info | 信息提示 | #0891B2 |

**2.2 色阶梯度**

每个主色生成 10 级色阶（50, 100, 200, ..., 900）：
- 50-100: 背景、hover 状态
- 200-300: 边框、分割线
- 400-500: 次要元素
- 600-700: 主要交互元素
- 800-900: 文字、强调

**2.3 对比度要求**
- 正文文字 vs 背景：至少 4.5:1（WCAG AA）
- 大标题 vs 背景：至少 3:1
- 交互元素 vs 背景：至少 3:1
- 工具：使用 WebAIM Contrast Checker 验证

#### 第三步：排版系统

**3.1 字体选择**

| 用途 | 推荐 | 备选 |
|------|------|------|
| 中文正文 | 系统默认（苹方/微软雅黑） | Noto Sans SC |
| 英文/代码 | Inter / SF Pro | Roboto |
| 等宽/代码 | JetBrains Mono / Fira Code | SF Mono |

**3.2 字号阶梯（基于 1.25 比率）**

| Token | 大小 | 行高 | 用途 |
|-------|------|------|------|
| text-xs | 12px | 16px | 辅助文字、标签 |
| text-sm | 14px | 20px | 次要正文 |
| text-base | 16px | 24px | 正文 |
| text-lg | 18px | 28px | 小标题 |
| text-xl | 20px | 28px | 标题 |
| text-2xl | 24px | 32px | 页面标题 |
| text-3xl | 30px | 36px | 大标题 |
| text-4xl | 36px | 40px | Hero 标题 |

**3.3 字重**
- Regular (400): 正文
- Medium (500): 强调、导航
- Semibold (600): 小标题、按钮
- Bold (700): 大标题

#### 第四步：间距与栅格

**4.1 间距系统（4px 基准）**

| Token | 值 | 用途 |
|-------|-----|------|
| space-1 | 4px | 图标与文字间距 |
| space-2 | 8px | 紧凑元素间距 |
| space-3 | 12px | 表单元素内部 |
| space-4 | 16px | 卡片内边距 |
| space-6 | 24px | 区块间距 |
| space-8 | 32px | 大区块间距 |
| space-12 | 48px | 页面区块分隔 |
| space-16 | 64px | 大段落分隔 |

**4.2 栅格系统**
- 最大内容宽度：1280px（或 1440px）
- 列数：12 列
- 列间距 (Gutter)：24px（桌面）/ 16px（移动）
- 页面边距：24px（桌面）/ 16px（移动）

#### 第五步：主题策略

**暗色/亮色主题：**
- 不是简单反转颜色
- 暗色主题：降低对比度、减少纯白、使用深色背景层级
- 亮色主题：标准对比度、白色/浅灰背景
- 语义色在两个主题下可能需要不同色值

**背景层级（暗色）：**
```
Base:    #0F172A (最深)
Surface: #1E293B (卡片)
Overlay: #334155 (弹窗)
```

#### 第六步：Design Token 命名规范

```
格式：{category}-{property}-{variant}-{state}

示例：
color-primary-500
color-primary-500-hover
font-size-lg
spacing-4
radius-md
shadow-lg
border-width-1
```

输出为 CSS 变量或 JSON：
```css
:root {
  --color-primary-500: #2563EB;
  --color-primary-600: #1D4ED8;
  --font-size-base: 16px;
  --spacing-4: 16px;
  --radius-md: 8px;
}
```

### 检查清单

- [ ] 竞品分析完成（3-5 个）
- [ ] 风格方向已确定（关键词 + 情绪板）
- [ ] 主色/辅色/中性色/语义色已定义
- [ ] 色阶梯度已生成
- [ ] 对比度满足 WCAG AA（4.5:1）
- [ ] 字体已选定（正文/标题/代码）
- [ ] 字号阶梯已定义
- [ ] 间距系统已确定（4px 基准）
- [ ] 栅格系统已确定
- [ ] 暗色/亮色主题策略已确定
- [ ] Design Token 已命名并输出为变量
- [ ] 风格指南文档已归档

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| 风格指南文档 | Markdown/PDF | docs/design/style-guide.md |
| Design Token 文件 | CSS/JSON | src/styles/tokens.css |
| 色彩系统 | 色板 | 设计工具 + 代码变量 |
| 情绪板 | 图片/链接 | docs/design/moodboard/ |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| 凭感觉选颜色 | 基于品牌定位和用户研究选择 |
| 颜色太多太杂 | 主色 1 个 + 辅色 1 个 + 语义色，够了 |
| 忽略对比度 | 每次选色都验证 WCAG 对比度 |
| 暗色主题直接反转 | 暗色需要独立设计，不是 invert |
| 间距随意（13px, 17px） | 严格使用 4px 倍数系统 |
| 不输出为代码变量 | Token 必须落地为 CSS 变量/配置文件 |

### 相关文档

- [UI/UX 设计规范](ui-ux-system.md) — 基于风格系统设计组件
- [文档编写规范](../standards/documentation.md) — 风格指南文档化
- [项目启动与立项](requirements-pool.md) — 风格选择的前提


---

# 附录D：通用 UI/UX 标准（phase-2/06）


### 目的

建立统一的界面设计和交互标准，确保产品各页面体验一致、可用、可访问，减少设计返工和开发歧义。

### 适用时机

- 设计新页面/组件时
- 审查 UI 实现是否符合规范
- 新成员加入需要了解设计标准
- 产品可用性出现问题需要对照检查
- 开发前确认交互细节

### 流程步骤

#### 第一部分：设计原则

所有 UI 决策应遵循以下原则（优先级从高到低）：

1. **可用性优先** — 用户能完成任务比好看更重要
2. **一致性** — 相同功能相同表现，降低学习成本
3. **反馈** — 每个操作都有即时、明确的反馈
4. **容错** — 允许犯错，容易恢复
5. **简洁** — 减少认知负担，渐进式披露
6. **可访问** — 所有人（含残障用户）都能使用

#### 第二部分：组件设计标准

每个组件必须定义以下状态：

| 状态 | 说明 | 必须？ |
|------|------|--------|
| Default | 默认外观 | 是 |
| Hover | 鼠标悬停 | 是 |
| Active/Pressed | 按下状态 | 是 |
| Focus | 键盘聚焦（focus-visible） | 是 |
| Disabled | 不可用 | 是 |
| Loading | 加载中 | 视情况 |
| Error | 错误状态 | 视情况 |
| Selected | 选中状态 | 视情况 |

**组件变体规范：**
- Size: sm / md / lg（最多 3 种）
- Variant: primary / secondary / ghost / danger
- 每个变体 × 状态都应有明确样式

#### 第三部分：交互模式规范

**导航：**
- 主导航不超过 7 项（Miller's Law）
- 当前位置始终可见（面包屑/高亮）
- 移动端导航折叠为汉堡菜单
- 返回路径明确（浏览器后退 + 应用内返回）

**表单：**
- 标签在输入框上方（非 placeholder 替代）
- 必填/选填明确标注
- 实时验证 + 提交时验证
- 错误信息具体且靠近对应字段
- 提交按钮有 loading 状态防重复提交
- 长表单分步骤，显示进度

**加载状态：**
- < 300ms: 无需 loading 指示
- 300ms - 1s: 使用 skeleton/spinner
- > 1s: 显示进度或骨架屏
- > 3s: 提供取消选项
- 后台操作: toast 通知完成

**错误处理：**
- 用户错误: 明确告知问题 + 如何修复
- 系统错误: 友好提示 + 重试选项
- 404: 提供导航回正常路径
- 网络错误: 自动重试 + 离线提示

**空状态：**
- 不是空白一片
- 说明为什么是空的
- 提供下一步操作引导
- 首次使用提供 onboarding 提示

#### 第四部分：响应式断点

| 断点 | 范围 | 布局策略 |
|------|------|---------|
| Mobile | < 640px | 单列，全宽 |
| Tablet | 640px - 1024px | 双列或自适应 |
| Desktop | 1024px - 1440px | 多列，侧边栏 |
| Wide | > 1440px | 最大宽度限制，居中 |

原则：
- Mobile First（先设计移动端，再扩展）
- 触摸目标最小 44×44px
- 桌面端交互元素最小 32×32px

#### 第五部分：无障碍标准 (WCAG 2.1 AA)

**必须满足：**
- 色彩对比度 ≥ 4.5:1（正文）/ 3:1（大文字）
- 所有图片有 alt 文本
- 键盘可完成所有操作
- Focus 顺序合理且可见
- 表单字段有关联 label
- 动态内容有 aria-live 通知
- 不仅靠颜色传达信息（加图标/文字）
- 支持 prefers-reduced-motion

**检查工具：**
- axe DevTools（浏览器插件）
- Lighthouse Accessibility 审计
- 键盘 Tab 遍历测试
- 屏幕阅读器测试（NVDA/VoiceOver）

#### 第六部分：动效规范

| 场景 | 时长 | 缓动 |
|------|------|------|
| 微交互（hover/press） | 100-150ms | ease-out |
| 展开/折叠 | 200-300ms | ease-in-out |
| 页面转场 | 300-400ms | ease-in-out |
| 弹窗/抽屉 | 250-350ms | ease-out |
| 通知/toast | 进入 200ms / 退出 150ms | ease-out |

规则：
- 动效服务于反馈和引导，不是装饰
- 提供关闭动效的选项（prefers-reduced-motion）
- 同一产品内动效时长和缓动保持一致
- 避免同时多个动效竞争注意力

### 检查清单

- [ ] 设计原则已确认并传达
- [ ] 组件所有状态已定义（default/hover/focus/disabled）
- [ ] 表单交互符合规范（标签/验证/错误）
- [ ] 加载状态已设计（skeleton/spinner/progress）
- [ ] 错误状态和空状态已设计
- [ ] 响应式断点已确定
- [ ] 触摸目标 ≥ 44px
- [ ] 色彩对比度满足 WCAG AA
- [ ] 键盘导航可用
- [ ] 动效时长和缓动统一
- [ ] prefers-reduced-motion 已支持

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| UI 规范文档 | Markdown | docs/design/ui-standards.md |
| 组件库/设计稿 | Figma/代码 | 设计工具或 src/components/ |
| 交互说明 | 标注/文档 | 设计稿内或 docs/interactions.md |
| 无障碍检查报告 | 报告 | docs/a11y-report.md |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| 用 placeholder 替代 label | label 始终可见，placeholder 只是示例 |
| 只设计 happy path | 空状态/错误/加载/边界都是必须设计的 |
| 动效太多太花哨 | 动效是反馈工具，不是表演 |
| 忽略键盘用户 | Tab 遍历是基本测试 |
| 移动端只是缩小桌面版 | 移动端需要独立的交互设计 |
| 颜色是唯一信息载体 | 色盲用户需要图标/文字辅助 |

### 相关文档

- [色调与风格选择](ui-ux-system.md) — 视觉基础
- [测试策略](../standards/testing.md) — E2E 测试覆盖交互
- [性能优化](../standards/performance.md) — 动效性能
