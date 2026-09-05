// popup 逻辑：保存收件参数 → 抽取当前页 DOM → 投递本地服务。

const $ = (id) => document.getElementById(id);

function result(text, err) {
  const el = $("result");
  el.textContent = text;
  el.className = err ? "err" : "";
}

$("clip").addEventListener("click", async () => {
  const port = $("port").value.trim();
  const token = $("token").value.trim();
  if (!port || !token) {
    result("请先填写端口与 token（设置页 web 采集→本地收件）", true);
    return;
  }
  await chrome.storage.local.set({ port, token });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) {
    result("未找到活动页", true);
    return;
  }
  result("抽取当前页正文…");
  let payload;
  try {
    payload = await chrome.tabs.sendMessage(tab.id, { type: "entropy-extract" });
  } catch (e) {
    result(`抽取失败：请刷新页面后重试（${e.message ?? e}）`, true);
    return;
  }
  if (!payload || !payload.markdown || payload.markdown.trim().length < 10) {
    result("页面无正文可剪藏（框架隔离站点请刷新重试）", true);
    return;
  }
  result("投递本地收件服务…");
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    if (resp.ok) result(`✓ 已投递 kind=web 会话（#${body.sessionId}）`);
    else result(`投递失败 ${resp.status}：${body.error ?? "未知"}`, true);
  } catch (e) {
    result(`连接失败：熵减未开启收件服务？(${e.message ?? e})`, true);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const { port, token } = await chrome.storage.local.get(["port", "token"]);
  if (port) $("port").value = port;
  if (token) $("token").value = token;
});
