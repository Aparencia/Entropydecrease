// 窗口枚举与目标进程解析
//
// @ai-context: 进程环回采集必须拿到"能覆盖真实发声进程"的 PID。浏览器
// （Chrome/Edge）的音频由 browser process 派生的 audio service utility
// 进程播放，而窗口 HWND 归属 renderer 进程——直接对窗口 PID 采集会静默
// 采到空。故需向上回溯到同名祖先进程（即 browser process），再配合
// PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE 覆盖整棵进程树。

#include "window_finder.h"

#include <windows.h>
#include <psapi.h>
#include <tlhelp32.h>

#include <algorithm>
#include <map>
#include <string>

namespace process_audio {
namespace {

/** 取进程可执行文件名（小写，不含路径）；失败返回空串 */
std::wstring GetProcessImageName(DWORD pid) {
  HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (h == nullptr) return L"";
  wchar_t buf[MAX_PATH] = {0};
  DWORD size = MAX_PATH;
  std::wstring name;
  if (QueryFullProcessImageNameW(h, 0, buf, &size) != 0) {
    std::wstring full(buf, size);
    size_t pos = full.find_last_of(L'\\');
    name = (pos == std::wstring::npos) ? full : full.substr(pos + 1);
    std::transform(name.begin(), name.end(), name.begin(), ::towlower);
  }
  CloseHandle(h);
  return name;
}

/** 构建 pid -> parentPid 映射（一次快照，避免逐进程重复枚举） */
std::map<DWORD, DWORD> BuildParentMap() {
  std::map<DWORD, DWORD> parents;
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return parents;
  PROCESSENTRY32W entry;
  entry.dwSize = sizeof(entry);
  if (Process32FirstW(snap, &entry)) {
    do {
      parents[entry.th32ProcessID] = entry.th32ParentProcessID;
    } while (Process32NextW(snap, &entry));
  }
  CloseHandle(snap);
  return parents;
}

/**
 * 向上回溯到同名祖先进程（应用根进程）。
 *
 * Chrome/Edge 的 renderer、utility（含 audio service）与 browser process
 * 同为 chrome.exe/msedge.exe，且都以 browser process 为祖先。逐级上溯，
 * 只要父进程与自身同名就继续，直到父进程名不同——此时当前 PID 即根进程。
 * 单进程应用（如多数播放器）回溯结果就是自身。
 */
DWORD ResolveRootPid(DWORD pid, const std::map<DWORD, DWORD>& parents) {
  const std::wstring target = GetProcessImageName(pid);
  if (target.empty()) return pid;

  DWORD current = pid;
  // 防御上限：避免异常的父子环导致死循环
  for (int depth = 0; depth < 16; ++depth) {
    auto it = parents.find(current);
    if (it == parents.end()) break;
    const DWORD parent = it->second;
    if (parent == 0 || parent == current) break;
    if (GetProcessImageName(parent) != target) break;
    current = parent;
  }
  return current;
}

struct EnumContext {
  std::vector<WindowInfo>* out;
  std::map<DWORD, DWORD>* parents;
};

BOOL CALLBACK EnumProc(HWND hwnd, LPARAM lparam) {
  auto* ctx = reinterpret_cast<EnumContext*>(lparam);

  if (IsWindowVisible(hwnd) == 0) return TRUE;
  // 过滤工具窗口与无标题窗口（任务栏不可见的辅助窗口）
  if ((GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0) return TRUE;
  const int len = GetWindowTextLengthW(hwnd);
  if (len <= 0) return TRUE;

  std::wstring title(static_cast<size_t>(len) + 1, L'\0');
  GetWindowTextW(hwnd, title.data(), len + 1);
  title.resize(static_cast<size_t>(len));

  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  if (pid == 0) return TRUE;

  WindowInfo info;
  info.hwnd = reinterpret_cast<uint64_t>(hwnd);
  info.pid = pid;
  info.root_pid = ResolveRootPid(pid, *ctx->parents);
  info.title = title;
  info.process_name = GetProcessImageName(pid);
  info.root_process_name = GetProcessImageName(info.root_pid);

  RECT rect = {0, 0, 0, 0};
  if (GetWindowRect(hwnd, &rect) != 0) {
    info.left = rect.left;
    info.top = rect.top;
    info.width = rect.right - rect.left;
    info.height = rect.bottom - rect.top;
  }
  info.always_on_top = (GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOPMOST) != 0;

  ctx->out->push_back(std::move(info));
  return TRUE;
}

}  // namespace

std::vector<WindowInfo> ListAudioWindows() {
  std::vector<WindowInfo> result;
  auto parents = BuildParentMap();
  EnumContext ctx{&result, &parents};
  EnumWindows(EnumProc, reinterpret_cast<LPARAM>(&ctx));
  return result;
}

uint32_t ResolveRootPidForPid(uint32_t pid) {
  auto parents = BuildParentMap();
  return ResolveRootPid(static_cast<DWORD>(pid), parents);
}

uint64_t GetForegroundWindowHwnd() {
  HWND hwnd = ::GetForegroundWindow();
  if (hwnd == nullptr) return 0;
  return reinterpret_cast<uint64_t>(hwnd);
}

}  // namespace process_audio
