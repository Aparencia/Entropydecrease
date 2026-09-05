// content script：已登录 DOM → Markdown + 元数据 + 图 data URI（零依赖轻量规则；
// 无 readability/turndown 依赖——规则只做常见文章结构，精确度不承诺，登录墙
// 优势=读已渲染 DOM）。

function collectMeta() {
  const pick = (sel) => document.querySelector(sel)?.content?.trim() || null;
  return {
    title: document.title || pick("meta[property='og:title']"),
    url: location.href,
    site: pick("meta[property='og:site_name']") || location.hostname,
    author: pick("meta[name='author']") || pick("meta[property='article:author']"),
  };
}

function mdText(node) {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) out += child.textContent;
    else if (child.nodeType === Node.ELEMENT_NODE) out += mdText(child);
  }
  return out;
}

function nodeToMd(node, depth) {
  if (!node || depth > 8) return "";
  const tag = node.tagName ? node.tagName.toLowerCase() : "";
  if (["script", "style", "noscript", "svg", "iframe", "template", "nav", "aside"].includes(tag)) return "";
  if (tag === "img") {
    const src = node.currentSrc || node.src || "";
    if (src.startsWith("data:")) {
      const alt = node.alt || "";
      return alt ? `![${alt}](${src})\n` : "";
    }
    // 远程图：扩展无跨域读字节权限（fetch 被 CORS 拦）——跳过并保留 alt 文本
    return node.alt ? `${node.alt}\n` : "";
  }
  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
    const t = mdText(node).trim();
    return t ? `${"#".repeat(Number(tag[1]))} ${t}\n` : "";
  }
  if (tag === "li") {
    const t = mdText(node).trim();
    return t ? `- ${t}\n` : "";
  }
  if (tag === "p" || tag === "blockquote" || tag === "pre") {
    const t = mdText(node).trim();
    return t ? `${t}\n\n` : "";
  }
  let inner = "";
  for (const child of node.children || []) inner += nodeToMd(child, depth + 1);
  if (tag === "article" || tag === "section" || tag === "main") inner += "\n";
  return inner;
}

function extract() {
  const main =
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.querySelector(".article-content") ||
    document.querySelector("#js_content") ||
    document.body;
  const markdown = nodeToMd(main, 0).replace(/\n{3,}/g, "\n\n").trim();
  return { ...collectMeta(), markdown: markdown || "" };
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req && req.type === "entropy-extract") sendResponse(extract());
});
