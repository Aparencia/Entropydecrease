// 窗口枚举与目标进程解析（声明）
//
// @ai-context: 见 window_finder.cc 头部说明——root_pid 是进程环回采集
// 真正应传入的目标，pid（窗口所属进程）在浏览器场景下不发声。

#ifndef PROCESS_AUDIO_WINDOW_FINDER_H_
#define PROCESS_AUDIO_WINDOW_FINDER_H_

#include <cstdint>
#include <string>
#include <vector>

namespace process_audio {

/** 单个可见顶层窗口的信息 */
struct WindowInfo {
  uint64_t hwnd = 0;
  /** 窗口所属进程（浏览器场景下为 renderer，不发声） */
  uint32_t pid = 0;
  /** 回溯得到的应用根进程（浏览器场景下为 browser process，进程树覆盖发声进程） */
  uint32_t root_pid = 0;
  std::wstring title;
  std::wstring process_name;
  std::wstring root_process_name;

  /** 窗口矩形（像素，GetWindowRect） */
  int32_t left = 0;
  int32_t top = 0;
  int32_t width = 0;
  int32_t height = 0;
  /** 置顶窗口（WS_EX_TOPMOST） */
  bool always_on_top = false;
};

/** 枚举所有可见且有标题的顶层窗口 */
std::vector<WindowInfo> ListAudioWindows();

/** 单独解析某个 PID 的应用根进程 */
uint32_t ResolveRootPidForPid(uint32_t pid);

/** 取当前前台窗口 HWND；无前台窗口时返回 0 */
uint64_t GetForegroundWindowHwnd();

}  // namespace process_audio

#endif  // PROCESS_AUDIO_WINDOW_FINDER_H_
