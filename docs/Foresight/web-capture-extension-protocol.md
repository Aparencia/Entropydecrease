# Web 采集：扩展投递契约（v0.20.4 / REQ-304 阶段 2 薄壳）

> 状态：落地文档（2026-09-06，与服务 `web_inbox_start/status/stop` 及扩展骨架 `app/extension-web-clipper/` 同批）
> 背景：[web-capture-ingestion-path.md](./web-capture-ingestion-path.md)（三件套机制定案）· REQ-303~305

## 一、安全边界（与 AGENTS.md 红线对齐）

- 服务只绑 `127.0.0.1` 随机端口（应用启动期由用户显式开启）；
- 首启生成随机 token（24 位字母数字，`data_dir/web_inbox.json` 持久化——重启同 token，扩展零重配）；
- 单向投递：服务只收不发；`GET /ping` 仅返回 `{"ok":true}`（Joplin 端口探测范式）；
- 鉴权：`Authorization: Bearer <token>`，恒定时间比较；缺失/错误 → 401；
- CORS：仅需预检放行（`Authorization`/`content-type` 头 + POST/OPTIONS）；扩展服务上下文非同源页面，浏览器 CORS 强制下正常投递；
- 校验：正文 ≤2MB、URL 仅 http(s) 且 ≤2048、图 ≤50 张且单张 ≤8MB、data URI 必须 `data:image/`、文件名禁路径字符（`../` 等穿越拒绝）；
- 体量护栏：请求头+体总量 8MB 上限（慢速/超大直断）。

## 二、投递契约（POST /ingest）

```json
{
  "title": "文章标题",
  "url": "https://mp.weixin.qq.com/s/xxx",
  "site": "公众号名",
  "author": "作者",
  "markdown": "# 标题\n正文段落…\n![图1](data:image/png;base64,…)",
  "images": [{ "name": "图1", "data_base64": "data:image/png;base64,…" }]
}
```

响应：`200 {"ok":true,"sessionId":7}`（已建 kind=web 会话 + 页面）；`422 {"error":"…"}` 校验失败；`500` 落库失败；`401` 未授权。

落库语义：图 base64 解码落 `notes-images/web-{sessionId}-{hash}.{ext}`，md 内 `![name](data:…)` 改写为相对引用（编辑器同解析基座）；标题/URL/站点/作者入会话与页面元数据；投递成功广播 `data:sessions`。

## 三、扩展骨架（app/extension-web-clipper/）

- `manifest.json`：MV3、content script（读已登录 DOM）、popup（端口/token 配置 + 投递按钮）；
- `content.js`：零依赖轻量 DOM→MD（article/main/公众号 `#js_content` 等选区；标题层级/列表/段落；图：data URI 直带，远程图保留 alt 文本——跨域字节不可读，截图/快照路径补）；
- `popup.js/html`：参数存 `chrome.storage.local`，点击 → sendMessage 抽取 → fetch `http://127.0.0.1:{port}/ingest`（Bearer token）。
- 发布：开发期手动加载（扩展管理页→开发者模式→加载已解压）。商店发布（Edge/Chrome/Firefox）周期与审核不确定性登记开放项（v0.20.md 风险 1）。

## 四、与阶段 1/3 的关系

- 阶段 1（URL 静态直取）覆盖无登录墙静态站；本契约同一 `kind=web` 收口（扩展投递与 URL 采集产物同构——会话列表无感同列，Foresight 决策 4）；
- 阶段 3（整页快照）的渲染型 DOM 内联为独立命令（REQ-305），投递失败不阻断剪藏主路径。

## 五、测试与回归

- 纯逻辑层（web_inbox.rs 5 测：头解析/token 恒定比较/载荷白名单/base64 摘要）+ 收口函数（commands_web_inbox_tests 1 测：会话+图落盘改写）；
- 网络面人工冒烟：启动服务 → curl -H "Authorization: Bearer x" -d '{"markdown":"正文"}' http://127.0.0.1:{port}/ingest。
