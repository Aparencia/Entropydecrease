# 知识卡片 · 技术方案

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 安装包分发加速：CDN 接入方案与下载源可切换设计 |
| 日期 | 2026-07-31 |
| 类型 | 技术方案 |
| 标签 | #CDN #阿里云 #安装包分发 #下载加速 #electron-updater #成本优化 |

---

## 场景

官网安装包（约 172MB）托管于自建 ECS，实测下载速率过慢，需在可控成本内提速。

**实测基线数据**（源站 ECS，RTT 21ms）：

| 并发 | 总吞吐 | 172MB 耗时 |
|------|--------|-----------|
| 1（浏览器默认） | ~140 KB/s | **20.5 分钟** |
| 4 | 500 KB/s | 5.9 分钟 |
| 8 | 764 KB/s | 3.8 分钟 |

**关键结论**：
- 单流被限制在 ~140KB/s，原因非延迟、非丢包、非 `limit_rate`（BBR 启用前后无差异，见踩坑记录）；
- 多流可叠加，但**浏览器默认单连接**，故普通用户始终是 20 分钟级体验；
- 服务端调参已触及天花板，**结构性解法只有 CDN**（就近边缘节点 + 充足带宽）。

## 方案描述

### 架构选择：CDN 回源 ECS（推荐）vs CDN + OSS 源站

| 维度 | CDN 回源 ECS | CDN + OSS 源站 |
|------|-------------|---------------|
| 新增组件 | 仅 CDN | CDN + OSS |
| CI 改造 | **无需改动**（沿用现有 scp 同步） | 需新增 OSS 上传步骤 |
| 缓存命中率 | 接近 100%（安装包为固定文件） | 同 |
| ECS 负担 | 仅回源（每版本每节点一次） | 无 |
| 源站可用性 | ECS 故障时无法回源（但已缓存内容仍可服务） | 更高 |

安装包是**内容不变的静态文件**，CDN 缓存命中率接近 100%，回源仅在新版本发布后每节点首次发生。因此 **CDN 回源 ECS 即可解决绝大部分带宽问题**，且改造量最小。OSS 方案可作为后续演进（追求源站高可用时）。

### 下载源可切换设计

无论选哪种架构，客户端与官网需要的都只是「一个可配置的下载源基址」。因此引入 `DOWNLOAD_BASE_URL`（GitHub Secret）作为统一开关：

- **未配置** → 回退自建服务器 `https://entropydecrease.com/downloads`（现状，零风险）
- **已配置** → 官网下载直链与 electron-updater 更新源同时切换至 CDN

好处：CDN 开通进度不阻塞代码合并；出问题只需清空 Secret 重新部署即可**一键回退**。

## 关键代码

**官网下载源（`website/components/DownloadCta.tsx`）**

```ts
const DOWNLOAD_BASE = (
  process.env.NEXT_PUBLIC_DOWNLOAD_BASE || "https://entropydecrease.com/downloads"
).replace(/\/+$/, "");
```

**官网构建注入（`.github/workflows/deploy-website.yml`）**

```yaml
- name: Install dependencies and build
  env:
    NEXT_PUBLIC_DOWNLOAD_BASE: ${{ secrets.DOWNLOAD_BASE_URL }}
```

**客户端更新源覆盖（`.github/workflows/release.yml`）**

```yaml
- name: Build Electron app
  shell: bash
  env:
    DOWNLOAD_BASE_URL: ${{ secrets.DOWNLOAD_BASE_URL }}
  run: |
    cd client
    if [ -n "$DOWNLOAD_BASE_URL" ]; then
      npm run electron:build -- --publish never -c.publish.0.url="$DOWNLOAD_BASE_URL"
    else
      npm run electron:build -- --publish never
    fi
```

`-c.publish.0.url` 覆盖 `electron-builder.yml` 中 generic provider 的地址，写入新包的 `app-update.yml`。

## 开通步骤（CDN 回源 ECS）

1. 阿里云 CDN 添加加速域名，如 `dl.entropydecrease.com`；
2. **业务类型**选「大文件下载加速」；
3. **源站**填 ECS 公网 IP，**端口必须选 443（不能选 80）**——nginx 的 80 端口是纯 `return 301` 重定向，回源到 80 只会拿到重定向而非文件内容；
4. **回源 Host 填 `entropydecrease.com`**——命中 nginx 现有 `server_name`，**无需改动 nginx 配置，也无需为子域申请证书**（CDN 侧可免费签发 HTTPS 证书，并以回源 Host 作 SNI）；
5. 缓存规则：
   - `.exe` / `.blockmap` → 长缓存（如 30 天，文件名含版本号，天然唯一）
   - `.yml` / `.json` → **不缓存**（更新元数据必须实时；源站已设 `Cache-Control: no-cache`）
6. DNS 添加 CNAME 指向 CDN 提供的地址；
7. 在 GitHub 仓库 Secrets 添加
   `DOWNLOAD_BASE_URL = https://dl.entropydecrease.com/downloads`
   ⚠️ **必须带 `/downloads` 路径**：安装包位于 nginx 的 `/downloads/` 下，而前端与
   electron-updater 均以 `{BASE}/文件名` 拼接。若 BASE 不带该路径，回源会变成
   `/文件名`，nginx 会去官网根目录寻找而返回 404。
8. 触发官网部署与一次发版，验证生效。

## 预热：大文件分发的必要步骤（非可选优化）

阿里云 CDN 对大文件采用**分片缓存**，只有被请求过的分片才进入缓存。未预热时，首批用户会退化为**实时回源**，速度被源站带宽拖垮——此时 CDN 几乎毫无效果。

**实测对比（同一文件、同一节点、RTT 5ms）**：

| 分片状态 | 速率 | 172MB 耗时 |
|---------|------|-----------|
| 已缓存（HIT） | **10.5 MB/s** | **约 16 秒** |
| 未缓存（回源） | 106 KB/s | 约 27 分钟 |

相差约 **95 倍**。因此每次发版必须预热新版本，否则“接了 CDN 却仍然很慢”。

### 已在 CI 中自动化

`release.yml` 在同步安装包至源站后调用阿里云 `PushObjectCache` 接口预热：

```yaml
- name: Prefetch CDN cache
  if: ${{ secrets.DOWNLOAD_BASE_URL != '' && secrets.ALIYUN_ACCESS_KEY_ID != '' }}
  continue-on-error: true          # 预热失败不推翻已成功的发布
  run: |
    /tmp/aliyun cdn PushObjectCache --region cn-hangzhou \
      --ObjectPath "$OBJECTS" --Area domestic
```

要点：
- 预热对象仅需 `.exe` 与 `.blockmap`；`latest.yml/json` 按设计不缓存且仅几百字节，无需预热。
- 预热是**异步任务**，API 返回后后台继续拉取，CI 不等待完成。
- 预热会从源站回源拉取全量文件，**会占用 ECS 带宽**，可能短暂影响 API；属一次性行为。
- 需额外两个 Secrets：`ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET`，建议专用 RAM 用户仅授予 CDN 刷新预热权限。

## 优缺点

| 优点 | 缺点 |
|------|------|
| 边缘节点就近，单流吞吐大幅提升（对症浏览器单连接痛点） | 引入按量计费，需设费用预警 |
| 下载流量与业务 API 带宽彻底解耦 | 公开大文件存在被刷流量风险 |
| 按量付费无预付、无最低消费，初期月费可能仅几元 | 缓存策略配错（如缓存了 latest.yml）会导致更新异常 |
| 一个 Secret 即可切换/回退，架构侵入极小 | — |

## 成本参考

按 172MB/次（≈0.168GB）估算，国内 CDN 首档约 0.2–0.24 元/GB（**实际以控制台阶梯价为准**）：

| 月下载量 | 流量 | 预估月费 |
|---------|------|---------|
| 50 次 | 8.4 GB | 约 2 元 |
| 200 次 | 34 GB | 约 8 元 |
| 1000 次 | 168 GB | 约 40 元 |

OSS/存储侧可忽略（保留 3 个版本约 0.5GB）。流量稳定后可购买流量包，单价降至约 0.1–0.12 元/GB。

## 注意事项

- **不预热等于 CDN 白接**：大文件按分片缓存，未预热时首批用户实时回源，速度与直连源站无异（实测 106KB/s vs 已缓存 10.5MB/s）。诊断时切勿只看 `X-Cache: HIT` 就下结论——文件头部分片可能已 HIT 而中段仍需回源，应分别测量不同偏移量的 Range 速率。
- **采购防踩坑**：本方案**不需要 OSS**，切勿购买「OSS 资源包」（尤其是「标准-同城冗余存储」容量包，与下载速度无关）。若要预付，应选「CDN/全站加速/ESA 资源包 → CDN/DCDN 下行流量 → 全国通用（中国内地）」。资源包**额度可叠加**，故先买最小规格、用完再加即可，无需预估准确；资源包过期不退。
- **买包不等于费用封顶**：资源包用完后会**自动转为按量付费**，故费用预警与防盗链仍属必选。
- **必须先设防再上线**：费用预算提醒 + 资源用量预警 + Referer 防盗链 + 单 IP 频次限制；可选用量封顶。公开大文件按量计费若被恶意刷取，账单会飙升。
- **`latest.yml` 绝不可被 CDN 缓存**：否则客户端长期读到旧版本，表现为「明明发布了新版却检测不到更新」。
- **存量客户端更新源已固化**：已安装版本的 `app-update.yml` 指向旧地址，故切换 CDN 后 **ECS 与 GitHub 两侧资产仍需继续发布**，不可下线。
- **CDN 回源可能触发源站限流**：nginx `/downloads/` 有 `limit_conn dl_conn 8`（按 IP）。若回源出现 503，需为 CDN 回源 IP 段放行或提高该限制。
- 差量更新（blockmap）依赖 HTTP Range，CDN 需确认支持 Range 回源与分片缓存。

## 参考

- 相关文件：`website/components/DownloadCta.tsx`、`.github/workflows/deploy-website.yml`、`.github/workflows/release.yml`、`client/electron-builder.yml`、`server/nginx/nginx.conf`
- 关联踩坑记录：[Git LFS 图标未在 CI 拉取致 electron-builder 打包失败](../bugs/2026-07-git-lfs-icon-electron-builder-ci-failure.md)
- 前置实现：安装包自建服务器托管（nginx `/downloads/`、双 publish、`latest.json`）
