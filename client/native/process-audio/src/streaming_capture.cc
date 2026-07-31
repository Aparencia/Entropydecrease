// 流式进程环回采集（实现）
//
// @ai-context: 聚合策略——WASAPI 每 ~10ms 给一包，直接回调会让下游承受
// 高频 IPC；故在采集线程内累积到 chunkDurationMs 再整块回调，与端点环回
// 路径的分块粒度保持一致（下游 VAD/ASR 对块大小有预期）。

#include "streaming_capture.h"

#include "capture_session.h"

namespace process_audio {

StreamingCapture::StreamingCapture() = default;

StreamingCapture::~StreamingCapture() { Stop(); }

std::string StreamingCapture::Start(const StreamingOptions& options,
                                    ChunkHandler on_chunk,
                                    ErrorHandler on_error) {
  if (running_.load()) return "采集已在进行中";
  if (options.root_pid == 0) return "目标 PID 无效";

  on_chunk_ = std::move(on_chunk);
  on_error_ = std::move(on_error);
  stop_flag_.store(false);
  running_.store(true);
  thread_ = std::thread(&StreamingCapture::ThreadMain, this, options);
  return "";
}

void StreamingCapture::Stop() {
  stop_flag_.store(true);
  if (thread_.joinable()) thread_.join();
  running_.store(false);
}

bool StreamingCapture::running() const { return running_.load(); }

void StreamingCapture::ThreadMain(StreamingOptions options) {
  CaptureSession session;

  std::string err = session.Open(options.root_pid, options.sample_rate, options.channels);
  if (err.empty()) err = session.Start();
  if (!err.empty()) {
    running_.store(false);
    if (on_error_) on_error_(err);
    return;
  }

  const uint32_t rate = session.sample_rate();
  const uint32_t channels = session.channels();
  // 一个完整块的交错样本数
  const size_t chunk_samples = static_cast<size_t>(
      static_cast<uint64_t>(rate) * options.chunk_duration_ms / 1000 * channels);

  std::vector<float> pending;
  pending.reserve(chunk_samples * 2);

  while (!stop_flag_.load()) {
    ReadStats stats;
    if (!session.ReadPackets(&pending, &stats, 100)) {
      if (on_error_) on_error_("采集流读取失败，可能目标进程已退出");
      break;
    }

    while (pending.size() >= chunk_samples && chunk_samples > 0) {
      StreamingChunk chunk;
      chunk.samples.assign(pending.begin(),
                           pending.begin() + static_cast<ptrdiff_t>(chunk_samples));
      chunk.sample_rate = rate;
      chunk.channels = channels;
      chunk.duration_ms = options.chunk_duration_ms;
      pending.erase(pending.begin(), pending.begin() + static_cast<ptrdiff_t>(chunk_samples));
      if (on_chunk_) on_chunk_(std::move(chunk));
    }
  }

  session.Stop();
  running_.store(false);
}

}  // namespace process_audio
