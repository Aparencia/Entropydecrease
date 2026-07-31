# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | Tailwind v3 对 `var()` 令牌色的 `/透明度` 修饰符静默失效，明亮主题弹窗背景全透明 |
| 日期 | 2026-07-31 |
| 类型 | 踩坑记录 |
| 标签 | #Tailwind #CSS #主题 #DesignTokens #color-mix #明亮主题 |

---

## 症状

内测反馈"明亮主题下弹窗小字看不清"：设定番茄目标弹窗在明亮主题下**面板背景完全透明**，描述文字、复选框标签直接叠在明亮的模糊壁纸上，几乎不可读；暗色主题下因遮罩为黑色而"侥幸"可读。

无任何构建报错、无 lint 警告、无运行时错误——样式类写在 JSX 里看起来完全正常。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| Tailwind CSS | 3.4.x |
| 主题方案 | CSS 变量令牌（`--kb-*`）+ `data-theme` 切换，tailwind.config 中 `colors: { bg: { elevated: 'var(--kb-bg-elevated)' } }` |
| 相关文件 | `client/tailwind.config.js`、`client/src/components/ui/Modal.tsx` |

## 排查过程

1. 初判以为是弹窗组件硬编码了暗色文字色 → 检查 `GoalInput.tsx`/`Modal.tsx`，发现全部正确使用了 `text-text-secondary` 等令牌类，**排除组件问题**
2. 对照截图细节：明亮主题下弹窗**整个面板不见了**（只剩遮罩的 backdrop-blur），不只是文字问题 → 怀疑面板背景类 `bg-bg-elevated/90` 未生效
3. 关键一步：**直接在构建产物 `dist/assets/index-*.css` 里 grep 该类名** → `.bg-bg-elevated\/90` 根本不存在，而无修饰符的 `.bg-bg-elevated` 存在，`bg-black/40`（字面色）也存在
4. 全仓正则扫描 `(bg|text|border|...)-(令牌)/\d+` → 约 **800 处**使用点全部失效，涉及弹窗、卡片、边框、辅助文字

## 根因

Tailwind v3 的透明度修饰符依赖将颜色拆成 RGB 通道再拼 `rgb(r g b / alpha)`。当颜色定义为不透明的字符串 `'var(--kb-bg-elevated)'` 时，Tailwind 无法注入 alpha，于是**静默跳过整条 utility 的生成**——不报错、不警告，类名留在 HTML 里但没有对应 CSS。

暗色主题未暴露此问题，是因为失效后露出的深色遮罩/背景恰好与设计效果接近，属于"两个错误互相掩盖"。

## 解决方案

在 `tailwind.config.js` 将令牌色改为**函数式颜色定义**，用 `color-mix()` 实现透明度（Chromium 111+ / Electron 35 支持），一处修复全部恢复：

```js
const tokenColor = (variable) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `var(${variable})`
    : `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;

// colors: { bg: { elevated: tokenColor('--kb-bg-elevated') }, ... }
```

验证：构建产物中生成 `.bg-bg-elevated\/90 { background-color: color-mix(in srgb, var(--kb-bg-elevated) calc(.9 * 100%), transparent) }`；全量测试 433 通过。

## 教训

- **CSS 变量做 Tailwind 颜色时，必须验证 `/alpha` 修饰符**：要么用函数式 `tokenColor` + `color-mix`，要么把变量定义成裸通道（`--kb-bg: 250 248 245` + `rgb(var(--kb-bg) / <alpha-value>)`）。纯 `var()` 字符串 + `/修饰符` 是静默陷阱。
- **样式"看起来写了但没效果"时，第一时间 grep 构建产物 CSS**，确认类是否真的被生成——比在 DevTools 里逐个元素排查快得多。
- **双主题项目必须两个主题都过验收**：一个主题下"能看"不代表样式正确，可能是失效样式与该主题底色巧合兼容。
- 修复此类全局样式基建问题后，发版前应对主要页面做一轮**明亮主题视觉回归**——恢复的是设计原意，但与用户已习惯的"错误效果"存在肉眼差异。

## 参考

- [Tailwind v3 — Using CSS variables with opacity](https://v3.tailwindcss.com/docs/customizing-colors#using-css-variables)
- [MDN — color-mix()](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix)
- 修复提交涉及文件：`client/tailwind.config.js`
