// WASAPI 进程环回会话（声明）
//
// @ai-context: 把"激活 + 初始化 + 读包"的 COM 细节收在 pimpl 内，供同步
// 采集（spike）与流式采集线程共用，避免两处重复 WASAPI 样板代码。
// @ai-context: 同一个 CaptureSession 实例的全部方法必须在同一线程调用——
// COM 单元（CoInitializeEx）按线程绑定，跨线程使用会失败。

#ifndef PROCESS_AUDIO_CAPTURE_SESSION_H_
#define PROCESS_AUDIO_CAPTURE_SESSION_H_

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace process_audio {

/** 单次读包的统计 */
struct ReadStats {
  uint32_t packets = 0;
  uint32_t silent_packets = 0;
};

/**
 * 进程环回采集会话。
 *
 * 生命周期：Open → Start → ReadPackets（循环）→ Stop。
 * 失败的方法返回非空错误描述字符串。
 */
class CaptureSession {
 public:
  CaptureSession();
  ~CaptureSession();

  CaptureSession(const CaptureSession&) = delete;
  CaptureSession& operator=(const CaptureSession&) = delete;

  /**
   * 激活目标进程树的音频客户端并初始化格式。
   *
   * @param root_pid 目标进程树根 PID（浏览器场景为 browser process）
   * @param sample_rate 期望采样率（被拒时自动回退 48000）
   * @param channels 期望声道数（被拒时自动回退 2）
   * @return 空字符串表示成功
   */
  std::string Open(uint32_t root_pid, uint32_t sample_rate, uint32_t channels);

  /** 开始采集流；Open 成功后调用 */
  std::string Start();

  /**
   * 等待并取出当前可用的所有样本（追加到 out）。
   *
   * @param wait_ms 事件等待上限；目标进程静默时不产生事件，靠超时返回
   * @return false 表示发生不可恢复错误，调用方应终止采集
   */
  bool ReadPackets(std::vector<float>* out, ReadStats* stats, uint32_t wait_ms);

  /** 停止采集流（幂等） */
  void Stop();

  /** 实际生效的采样率（Open 成功后有效） */
  uint32_t sample_rate() const;
  /** 实际生效的声道数（Open 成功后有效） */
  uint32_t channels() const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

/**
 * 探测当前环境是否支持进程环回。
 *
 * 实现方式为真实尝试激活一次（不 Initialize），比查 Windows 版本号可靠——
 * 版本号可被兼容性设置伪造，而 API 可用性是最终判据。
 */
bool IsProcessLoopbackSupported();

}  // namespace process_audio

#endif  // PROCESS_AUDIO_CAPTURE_SESSION_H_
