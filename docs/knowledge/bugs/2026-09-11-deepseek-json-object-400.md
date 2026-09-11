# DeepSeek 测试连接 400：json_object 前置条件 + V4.1 适配

## 症状

设置页 AI 服务提供商 → DeepSeek → **测试连接**：

```
网络错误: 请求被拒绝 HTTP 400（不重试——4xx 非瞬态）
```

错误里没有任何上游原因；密钥、端点、模型名看起来都正常，用户无法自救。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| OS | Windows（中文，ANSI 码页 gb2312） |
| 应用 | 熵减 v0.13.9（Tauri 2 + React + Rust） |
| 客户端 | `ureq`（`app/src-tauri/src/ai_client.rs`） |
| 端点/模型 | `https://api.deepseek.com/v1` + `deepseek-v4-flash`（用户 `ai_providers.json` 实存） |
| 日期 | 2026-09-11（DeepSeek-V4.1-Flash 发布次日） |

## 排查过程

1. 定位调用链：设置页"测试连接"→ `ai_provider_test` → `AiClient::chat_text`
   → `build_chat_payload`（**恒带** `response_format={"type":"json_object"}`）。
2. 只用应用自身配置复现（本机 DPAPI 解密已存密钥 → `curl` 打真实端点），
   拿到被应用丢弃的**真实错误体**：

   ```json
   {"error":{"message":"Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'.","type":"invalid_request_error","param":null,"code":"invalid_request_error"}}
   ```

3. 控制变量探针（T1–T11，全部真实请求）确认归因：

   | 探针 | 变量 | 结果 |
   |------|------|------|
   | T1 | 应用原样（模型 `deepseek-v4-flash` + 探活提示词 + json_object） | **400**（同上错误体） |
   | T2 | 只换现役名 `deepseek-flash` | **400**（同样错误体 → **与模型名无关**） |
   | T3 | 去掉 `response_format` | **200**（`content:"正常"`，另带 `reasoning_content`） |
   | T4 | 改根路径 `https://api.deepseek.com/chat/completions` | 400（仍是 json 前置条件错） |
   | T5 | 加 `thinking:{type:disabled}` | 400（同理，未解决前置条件） |
   | T6 | `GET /user/balance` | 200（余额链路不受影响） |
   | T7 | 含 "json" 的提示词 + json_object（思考默认开） | 200，`content` 为合法 JSON；**输出 172 token（其中 reasoning 155）** |
   | T8 | 同上 + `thinking:{type:disabled}` | 200，**输出 16 token、无 reasoning** |
   | T9a/T9b | `deepseek-chat` / `deepseek-reasoner`（官方称 2026-07-24 停用） | 仍 200（兼容路由）——`reasoner` 在小 `max_tokens` 下**思考吃满预算、`content` 为空** |
   | T9c/T9d | `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp`（模型已退役） | 200（临时路由到 V4.1 Flash） |
   | T10a | `deepseek-flash` + 图像 | 200（原生多模态，视觉链路可用） |
   | T10b | `deepseek-v4-pro` + 图像 | 200 但模型"看不见"（`[Unsupported Image]`，官方标注 Vision 不支持） |
   | T11 | `reasoning_effort:"low"` | 200（仍产生 reasoning token，只是变少） |

## 根因

**两个叠加缺陷**：

1. **请求侧**：DeepSeek 的 JSON Output 有前置条件——`response_format=json_object`
   要求 system/user 提示词里出现 "json" 字样，否则**硬 400**
   （`invalid_request_error`）。探活提示词是"你是连通性测试助手。/只回复两个字：
   正常"，天然不含 "json" ⇒ 每次测试连接必 400。探活复用了业务请求构造器
   （恒 json_object），把"测密钥/端点"变成了"测提示词合规"。
2. **诊断侧**：`post_completions` 在 4xx 分支只读状态码、**丢弃响应体**——
   上游写在 `error.message` 里的原因被扔掉，用户只看到"HTTP 400"。

另有两个**同批暴露的供应商变更**（"最近更新"）：

- **模型名世代更替**：2026-09-10 发布 DeepSeek-V4.1-Flash，现役名 `deepseek-flash`
  （`deepseek-v4-pro` 有序退役中，2026-09-14 起路由到 V4.1 Flash 同价计费）；
  预设里的 `deepseek-chat` / `deepseek-reasoner` / `deepseek-v4-flash` /
  `deepseek-v4-flash-vision-exp` 全部退役（前两者已停用，后两者仅临时路由）。
- **思考模式默认开启**（effort=high）：实测同一请求 16 → 172 输出 token；
  思考与正文**共享 `max_tokens`**，预算不足时 `content` 直接为空（T9b 实证）。

## 解决方案

| # | 改动 | 文件 |
|---|------|------|
| 1 | 探活改走**最小 plain chat**：无 `response_format`、512 token 上限，返回带模型名（`deepseek-flash → 正常`） | `commands_ai_providers.rs`、`ai_client.rs`（`chat_plain` / `build_plain_payload`） |
| 2 | json_object **前置条件兜底**：提示词两侧都没有 "json" 时自动追加"必须输出合法 JSON"（既有模板已含 JSON，零改动；纯函数 `ensure_json_hint`，**chat 与 vision 两条构造路径都覆盖**） | `ai_client.rs` + 新模块 `ai_request_policy.rs` |
| 3 | 4xx/5xx **透出上游 error.message**（非 JSON 体回退原文、截断 300 字符、空白压行），流式 `map_status` 同口径 | `ai_client.rs`、`ai_chat_stream.rs`、`ai_request_policy.rs` |
| 4 | 模型名现代化：预设改 `["deepseek-flash","deepseek-v4-pro"]`，默认 `deepseek-flash`；**既有安装启动时归一**（只对 `api.deepseek.com` 端点生效，OpenRouter 的 `deepseek/deepseek-chat` 等零改动，幂等） | `ai_provider.rs`、`app_setup.rs`、`AiProviderSettings.tsx` |
| 5 | 思考模式策略：**结构化 JSON 任务默认 `thinking:{type:disabled}`**（成本/时延/输出预算可预期），**AI 对话保留 provider 默认**（要推理质量）；`AI_THINKING=enabled` 可整体切回；仅对 `api.deepseek.com` 注入（第三方兼容端点不收未知字段） | `ai_request_policy.rs`、`ai_client.rs`、`ai_note_refine.rs`、`ai_chat_client.rs` |
| 6 | 单价表按 V4.1 调价更新（flash 输出峰时 ≈¥9/百万 token、pro 保守 ¥28；旧名登记使历史成本可回溯） | `ai_cost.rs` |

### 关键代码

```rust
// 1) json_object 前置条件兜底（纯函数，chat + vision 共用）
pub fn ensure_json_hint(system: &str, user: &str) -> String {
    if json_hint_needed(system, user) { format!("{}{}", system, JSON_PRECONDITION_HINT) }
    else { system.to_string() }
}

// 2) 思考模式按端点收紧（只认官方 host；调用方已显式设置则不覆盖）
pub fn apply_thinking_policy(body: &mut serde_json::Value, base_url: &str, policy: ThinkingPolicy) {
    if policy != ThinkingPolicy::Disabled || !is_deepseek_endpoint(base_url) { return; }
    ...body.insert("thinking", json!({"type": "disabled"}));
}

// 3) 错误体不再丢弃
Err(ureq::Error::Status(code, resp)) => { let suffix = error_suffix(resp); ... }
```

## 教训

- **上游 4xx 的响应体必须透出**。只报状态码等于把"能自救的错误"降级成"HTTP 400"；
  `error.message` 是唯一根因来源（本次一条 message 直接结案）。
- **探活请求要最小**：连通性测试只该验证端点/密钥/模型三者可达，不要复用带业务
  约束（json_object / schema / 长 prompt）的构造器，否则测的是别的东西。
- **不要把供应商默认值当常量**：V4 家族思考模式**默认开启**，同一请求输出 token
  翻 10 倍且与正文抢 `max_tokens`——升级供应商模型后必须重测 token 预算与成本口径。
- **模型名会退役**：预设只是"新装默认"，既有用户配置需要**启动期归一迁移**
  （带端点收紧 + 幂等），否则旧名一旦停止兼容路由就会线上 400。
- 复现脚本要点：探针必须打**真实端点**并保留原始响应体；本次正是"控制变量 +
  原始错误体"两步把"模型名猜疑"排除掉的（T2 与 T1 错误体逐字相同）。

## 参考

- [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode)（前置条件第 2 条：提示词须含 "json"）
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)（默认开启 / `thinking` 开关 / effort 映射 / 与 `max_tokens` 的关系）
- [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)（`deepseek-flash` 现役名、旧名临时路由、V4.1 调价）
- [Change Log 2026-09-10](https://api-docs.deepseek.com/updates)（V4.1-Flash 发布与旧模型退役）
- [Error Codes](https://api-docs.deepseek.com/quick_start/error_codes)（400/422 语义）
- 代偿代码：`app/src-tauri/src/ai_request_policy.rs`（纯函数 + 单测）

日期：2026-09-11
标签：#DeepSeek #AI接入 #HTTP400 #供应商API变更 #token预算 #成本透明
