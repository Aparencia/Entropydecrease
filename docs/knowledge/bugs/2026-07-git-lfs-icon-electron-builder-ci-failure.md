# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | Git LFS 图标未在 CI 拉取致 electron-builder 打包报 `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` |
| 日期 | 2026-07-30 |
| 类型 | 踩坑记录 |
| 标签 | #CI #GitLFS #electron-builder #GitHubActions #发布 #安装包 |

---

## 症状

GitHub Actions `Release Electron App`（`release.yml`）中 `cd client && npm run electron:build` 每次发版必失败，导致 **GitHub Release 资产为空**、自动更新链断裂、安装包从未同步到服务器。Windows 与 macOS 报同一个错：

```
app-builder.exe process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
Exit code: 1
  at ChildProcess.cp.emit (client/node_modules/cross-spawn/lib/enoent.js:34:29)
  at WinPackager.signApp (app-builder-lib/src/winPackager.ts:270:27)
  at WinPackager.doSignAfterPack (app-builder-lib/src/platformPackager.ts:346:32)
```

关键陷阱：**本地能构建成功（存在历史 `Setup 0.25.0.exe` 产物），只有 CI 失败**；错误信息 `CANNOT_EXECUTE` 极具误导性，看似"二进制无法执行"。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| CI | GitHub Actions（ubuntu 触发、windows-latest/macos-latest 构建） |
| 打包 | electron ^35.7.5 + electron-builder ^25.1.8 |
| 相关文件 | `.github/workflows/release.yml`、`client/electron-builder.yml`、`.gitattributes` |
| 资源托管 | Git LFS（`.gitattributes`: `*.png filter=lfs`） |

## 排查过程

1. 先发现 `release.yml` 从未成功 → GitHub Release（v0.27.0）资产为空，正是 electron-updater 拿不到 `latest.yml` 的根源
2. 看 build job 日志：`fail-fast` 默认开启，**macOS 腿失败连带取消了 Windows 腿** → 先移除无有效 target 的 macOS 腿（产品实为 Windows-only）
3. Windows 单独跑仍失败，报同一 `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` at `signApp`
4. **误判一次**：依据上游 issue 假设为"Windows Defender 锁住刚生成的 exe 致 rcedit 失败"，加了 Defender 排除步骤 → **仍失败**，假设被证伪
5. 抓取**完整堆栈**（而非只看顶部几帧），发现真正的失败函数：
   ```
   app-builder/pkg/icons.DecodeImageAndClose (image-util.go:90)  ← 图片解码失败
   → LoadImage → doConvertIcon → ConvertIcon
   ```
   即失败发生在 **PNG→ICO 图标转换**阶段
6. 顺藤查图标文件：`.gitattributes` 有 `*.png filter=lfs`；`git cat-file -s HEAD:client/app-icon.png` = **131 字节**，内容是 LFS 指针文本（`version https://git-lfs...`）而非真图（真图 550KB 在 LFS）
7. 查 `release.yml` 的 `actions/checkout@v4` → **未配置 `lfs: true`** → 定位真因

## 根因

`*.png` 全部由 Git LFS 托管，而 `release.yml` 的 checkout 未开启 LFS：

```yaml
# 错误：CI 拿到的是 131 字节 LFS 指针文本，不是真实 PNG
- uses: actions/checkout@v4
```

electron-builder 在 `signAndEditResources`（写入版本号 + 嵌入图标，**无论是否配置签名证书都会执行**）阶段调用 app-builder 把 `app-icon.png` 转成 `.ico`，对指针文本解码失败，抛出泛化的 `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`。本地因 LFS 文件已 checkout 为真图，故本地正常、CI 失败。

## 解决方案

给需要 LFS 资源的 workflow 的 checkout 显式启用 LFS：

```yaml
# release.yml（打包需 app-icon.png）
- uses: actions/checkout@v4
  with:
    lfs: true

# deploy-website.yml 同理（beian.png / sponsor-qr.png 否则为线上坏图）
- uses: actions/checkout@v4
  with:
    lfs: true
```

验证：release.yml 三 job 全绿；GitHub Release 出现 `Entropydecrease-Setup-0.28.3.exe/.blockmap/latest.yml`；服务器 `https://entropydecrease.com/downloads/latest.json` 返回正确版本，`.exe` 带 `Accept-Ranges: bytes`、`latest.yml` 带 `Cache-Control: no-cache`；官网 `sponsor-qr.png` 由 131 字节指针恢复为 193KB 真图。

## 教训

- **下次如何避免**：仓库启用 Git LFS 后，**所有会读取 LFS 资源的 CI 流程**（打包、静态站点构建、任何用到 `*.png`/大文件的 job）checkout 都必须加 `lfs: true`。新增 workflow 时把它当默认项检查。
- **如何更快定位**：遇到 `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` / app-builder 相关报错，**先抓完整堆栈**看具体失败的 Go 函数（`icons.*` = 图标、`rcedit` = 资源编辑、`nsis`/`makensis` = 安装器），而不是被泛化的 `CANNOT_EXECUTE` 字面误导。
- **"本地能跑、CI 挂"的经典嫌疑**：环境差异优先排查——LFS 指针未拉取、平台可选依赖缺失、大小写敏感、密钥/环境变量缺失。
- **假设要用证据证伪**：上游 issue 的相似结论（Defender 文件锁）只是候选假设，改完仍失败即应立刻放弃并回到堆栈证据，不要在错误方向叠加修补。
- **误判产物要清理**：被证伪的修复（Defender 排除步骤）连同其误导性注释一并删除，避免留下错误认知。

## 参考

- 修复提交涉及文件：`.github/workflows/release.yml`、`.github/workflows/deploy-website.yml`
- 关联特性：安装包自建服务器托管（`server/nginx/nginx.conf` 的 `/downloads/`、`client/electron-builder.yml` 双 publish）
- app-builder 图标转换源码路径：`app-builder/pkg/icons/icon-converter.go`
- [actions/checkout — lfs 选项](https://github.com/actions/checkout#usage)
