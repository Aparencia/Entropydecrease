// WASAPI 进程环回采集（声明）
//
// @ai-context: Windows 10 2004+ 的 AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
// 在系统混音之前按进程树截取音频，故不受系统主音量/静音影响，且天然隔离
// 其他应用声音——这是相对 endpoint loopback（getDisplayMedia）的两项核心优势。

#ifndef PROCESS_AUDIO_LOOPBACK_CAPTURE_H_
#define PROCESS_AUDIO_LOOPBACK_CAPTURE_H_

#include <cstdint>
#include <string>
#include <vector>

namespace process_audio {

/** 一次采集的结果与诊断信息 */
struct CaptureResult {
  bool ok = false;
  /** 失败原因（ok=false 时有效） */
  std::string error;
  /** 实际生效的采样率与声道数（Windows 可能拒绝请求格式而需回退） */
  uint32_t sample_rate = 0;
  uint32_t channels = 0;
  /** 采集到的 Float32 交错样本 */
  std::vector<float> samples;
  /** 收到的数据包总数 */
  uint32_t packet_count = 0;
  /** 其中被标记为 AUDCLNT_BUFFERFLAGS_SILENT 的包数 */
  uint32_t silent_packet_count = 0;
  /** 全程 RMS（判断"是否真的采到声音"的客观依据） */
  double rms = 0.0;
  /** 样本绝对值峰值 */
  double peak = 0.0;
};

/**
 * 对指定进程树采集音频。
 *
 * @param root_pid 目标进程树根 PID（浏览器场景传 browser process，
 *                 由 window_finder 解析；采集覆盖其全部子进程，
 *                 因此能拿到 Chromium audio service 播放的声音）
 * @param duration_ms 采集时长
 * @param preferred_sample_rate 优先请求的采样率（失败自动回退 48000）
 * @param preferred_channels 优先请求的声道数（失败自动回退 2）
 */
CaptureResult CaptureProcessAudio(uint32_t root_pid,
                                  uint32_t duration_ms,
                                  uint32_t preferred_sample_rate,
                                  uint32_t preferred_channels);

/** 将 Float32 交错样本写为 IEEE float WAV 文件；失败返回 false */
bool WriteWavFloat32(const std::string& path,
                     const std::vector<float>& samples,
                     uint32_t sample_rate,
                     uint32_t channels);

}  // namespace process_audio

#endif  // PROCESS_AUDIO_LOOPBACK_CAPTURE_H_
