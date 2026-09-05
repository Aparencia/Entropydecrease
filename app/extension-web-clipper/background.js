// 服务 worker：剪藏动作由 popup 发起（本文件保持最小——消息中继与安装日志）。
chrome.runtime.onInstalled.addListener(() => {
  console.log("熵减 Web 剪藏已安装（开发期加载）——先到熵减设置页开启本地收件服务");
});
