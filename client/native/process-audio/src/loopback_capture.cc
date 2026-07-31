// 同步采集与 WAV 落盘（spike 验证用，实现）
//
// @ai-context: 阻塞调用线程，仅供 spike 脚本做可行性验证与人工复核；
// 生产采集走 streaming_capture 的采集线程 + 流式回调。
// WASAPI 细节已下沉到 CaptureSession，本文件只做时长控制与统计。

#include "loopback_capture.h"

#include <windows.h>

#include <cmath>
#include <cstdio>

#include "capture_session.h"

namespace process_audio {

CaptureResult CaptureProcessAudio(uint32_t root_pid,
                                  uint32_t duration_ms,
                                  uint32_t preferred_sample_rate,
                                  uint32_t preferred_channels) {
  CaptureResult result;

  CaptureSession session;
  std::string err = session.Open(root_pid, preferred_sample_rate, preferred_channels);
  if (!err.empty()) {
    result.error = err;
    return result;
  }
  result.sample_rate = session.sample_rate();
  result.channels = session.channels();

  err = session.Start();
  if (!err.empty()) {
    result.error = err;
    return result;
  }

  ReadStats stats;
  const DWORD deadline = GetTickCount() + duration_ms;
  while (GetTickCount() < deadline) {
    const DWORD remain = deadline - GetTickCount();
    // 目标进程静默时不产生事件，等待上限取剩余时长与 200ms 的较小值
    const DWORD wait_ms = remain < 200 ? remain : 200;
    if (!session.ReadPackets(&result.samples, &stats, wait_ms)) break;
  }
  session.Stop();

  result.packet_count = stats.packets;
  result.silent_packet_count = stats.silent_packets;

  double square_sum = 0.0;
  for (const float v : result.samples) {
    const double d = static_cast<double>(v);
    square_sum += d * d;
    const double a = std::fabs(d);
    if (a > result.peak) result.peak = a;
  }
  if (!result.samples.empty()) {
    result.rms = std::sqrt(square_sum / static_cast<double>(result.samples.size()));
  }
  result.ok = true;
  return result;
}

bool WriteWavFloat32(const std::string& path,
                     const std::vector<float>& samples,
                     uint32_t sample_rate,
                     uint32_t channels) {
  FILE* fp = nullptr;
  if (fopen_s(&fp, path.c_str(), "wb") != 0 || fp == nullptr) return false;

  const uint32_t data_bytes = static_cast<uint32_t>(samples.size() * sizeof(float));
  const uint32_t block_align = channels * 4;
  const uint32_t byte_rate = sample_rate * block_align;
  const uint32_t riff_size = 36 + data_bytes;
  const uint16_t format_tag = 3;  // WAVE_FORMAT_IEEE_FLOAT
  const uint16_t bits = 32;
  const uint32_t fmt_size = 16;
  const uint16_t ch = static_cast<uint16_t>(channels);
  const uint16_t align16 = static_cast<uint16_t>(block_align);

  auto put = [fp](const void* p, size_t n) { std::fwrite(p, 1, n, fp); };
  put("RIFF", 4);
  put(&riff_size, 4);
  put("WAVE", 4);
  put("fmt ", 4);
  put(&fmt_size, 4);
  put(&format_tag, 2);
  put(&ch, 2);
  put(&sample_rate, 4);
  put(&byte_rate, 4);
  put(&align16, 2);
  put(&bits, 2);
  put("data", 4);
  put(&data_bytes, 4);
  if (!samples.empty()) put(samples.data(), data_bytes);

  std::fclose(fp);
  return true;
}

}  // namespace process_audio
