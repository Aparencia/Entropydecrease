// 流式进程环回采集（采集线程 + 回调，声明）
//
// @ai-context: 生产采集入口。独立线程跑 WASAPI 事件循环，按 chunkDurationMs
// 聚合成块后回调，块格式与下游 AudioChunkData 契约一致（Float32 交错 PCM）。
// @ai-context: 采集线程内自建 CaptureSession——COM 单元按线程绑定，
// 不可在主线程 Open 后交给采集线程使用。

#ifndef PROCESS_AUDIO_STREAMING_CAPTURE_H_
#define PROCESS_AUDIO_STREAMING_CAPTURE_H_

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace process_audio {

/** 流式采集配置 */
struct StreamingOptions {
  uint32_t root_pid = 0;
  uint32_t sample_rate = 16000;
  uint32_t channels = 1;
  uint32_t chunk_duration_ms = 5000;
};

/** 一个聚合完成的音频块 */
struct StreamingChunk {
  std::vector<float> samples;
  uint32_t sample_rate = 0;
  uint32_t channels = 0;
  uint32_t duration_ms = 0;
};

/** 块回调（在采集线程调用，实现方需自行转投到目标线程） */
using ChunkHandler = std::function<void(StreamingChunk&&)>;
/** 致命错误回调（采集线程终止前调用一次） */
using ErrorHandler = std::function<void(const std::string&)>;

/**
 * 流式采集器。
 *
 * Start 立即返回（采集在后台线程）；Stop 会阻塞等待线程退出，保证回调
 * 不会在 Stop 返回后继续触发。两者均幂等。
 */
class StreamingCapture {
 public:
  StreamingCapture();
  ~StreamingCapture();

  StreamingCapture(const StreamingCapture&) = delete;
  StreamingCapture& operator=(const StreamingCapture&) = delete;

  /**
   * 启动采集线程。
   *
   * 会话打开在采集线程内完成，因此启动期的失败通过 on_error 异步上报，
   * 而非返回值——调用方应据此触发降级。
   * @return 空字符串表示线程已启动
   */
  std::string Start(const StreamingOptions& options,
                    ChunkHandler on_chunk,
                    ErrorHandler on_error);

  /** 停止采集并等待线程退出（幂等） */
  void Stop();

  bool running() const;

 private:
  void ThreadMain(StreamingOptions options);

  std::atomic<bool> stop_flag_{false};
  std::atomic<bool> running_{false};
  std::thread thread_;
  ChunkHandler on_chunk_;
  ErrorHandler on_error_;
};

}  // namespace process_audio

#endif  // PROCESS_AUDIO_STREAMING_CAPTURE_H_
