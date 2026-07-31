// WASAPI 进程环回采集（实现）
//
// @ai-context: 三个易踩的坑：①process loopback 不支持 GetMixFormat，
// 必须显式指定 WAVEFORMATEX，被拒时需回退；②必须用
// PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE，否则采不到
// Chromium audio service（browser process 的子进程）播放的声音；
// ③目标进程无音频输出时不产生数据包，需靠超时而非"等够包数"退出。

#include "loopback_capture.h"

#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <wrl/implements.h>

#include <cmath>
#include <cstdio>
#include <cstring>

namespace process_audio {
namespace {

using Microsoft::WRL::ComPtr;

/** 事件驱动采集的缓冲时长（100ns 单位，20ms） */
constexpr REFERENCE_TIME kBufferDuration = 200000;

/** ActivateAudioInterfaceAsync 的完成回调（异步激活转同步等待） */
class ActivationHandler
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
          Microsoft::WRL::FtmBase,
          IActivateAudioInterfaceCompletionHandler> {
 public:
  HANDLE done_event = nullptr;
  HRESULT activate_hr = E_FAIL;
  ComPtr<IAudioClient> client;

  STDMETHODIMP ActivateCompleted(
      IActivateAudioInterfaceAsyncOperation* operation) override {
    HRESULT inner_hr = S_OK;
    ComPtr<IUnknown> unknown;
    const HRESULT hr = operation->GetActivateResult(&inner_hr, &unknown);
    if (SUCCEEDED(hr) && SUCCEEDED(inner_hr) && unknown) {
      activate_hr = unknown.As(&client);
    } else {
      activate_hr = FAILED(hr) ? hr : inner_hr;
    }
    if (done_event != nullptr) SetEvent(done_event);
    return S_OK;
  }
};

/** 构造 Float32 交错格式描述 */
WAVEFORMATEX MakeFloatFormat(uint32_t sample_rate, uint32_t channels) {
  WAVEFORMATEX wfx = {};
  wfx.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  wfx.nChannels = static_cast<WORD>(channels);
  wfx.nSamplesPerSec = sample_rate;
  wfx.wBitsPerSample = 32;
  wfx.nBlockAlign = static_cast<WORD>(channels * 4);
  wfx.nAvgBytesPerSec = sample_rate * wfx.nBlockAlign;
  wfx.cbSize = 0;
  return wfx;
}

std::string HrToString(const char* stage, HRESULT hr) {
  char buf[128];
  std::snprintf(buf, sizeof(buf), "%s 失败 (hr=0x%08lX)", stage,
                static_cast<unsigned long>(hr));
  return std::string(buf);
}

/** 激活目标进程树的 IAudioClient */
HRESULT ActivateProcessLoopbackClient(uint32_t root_pid,
                                      ComPtr<IAudioClient>* out_client) {
  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = static_cast<DWORD>(root_pid);
  // 关键：包含整棵进程树，才能覆盖 Chromium audio service 等发声子进程
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activate_params = {};
  activate_params.vt = VT_BLOB;
  activate_params.blob.cbSize = sizeof(params);
  activate_params.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  auto handler = Microsoft::WRL::Make<ActivationHandler>();
  if (!handler) return E_OUTOFMEMORY;
  handler->done_event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (handler->done_event == nullptr) return HRESULT_FROM_WIN32(GetLastError());

  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  HRESULT hr = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient),
      &activate_params, handler.Get(), &operation);

  if (SUCCEEDED(hr)) {
    // 激活为异步流程，等待 handler 回调（含超时兜底避免永久阻塞）
    if (WaitForSingleObject(handler->done_event, 3000) != WAIT_OBJECT_0) {
      hr = HRESULT_FROM_WIN32(WAIT_TIMEOUT);
    } else {
      hr = handler->activate_hr;
      if (SUCCEEDED(hr)) *out_client = handler->client;
    }
  }
  CloseHandle(handler->done_event);
  handler->done_event = nullptr;
  return hr;
}

}  // namespace

CaptureResult CaptureProcessAudio(uint32_t root_pid,
                                  uint32_t duration_ms,
                                  uint32_t preferred_sample_rate,
                                  uint32_t preferred_channels) {
  CaptureResult result;

  const HRESULT co_hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  const bool need_uninit = SUCCEEDED(co_hr);

  ComPtr<IAudioClient> client;
  HRESULT hr = ActivateProcessLoopbackClient(root_pid, &client);
  if (FAILED(hr) || !client) {
    result.error = HrToString("进程环回激活", hr);
    if (need_uninit) CoUninitialize();
    return result;
  }

  // process loopback 不支持 GetMixFormat，必须显式指定格式；
  // 优先请求下游所需的 16kHz mono，被拒时回退 48kHz stereo 由调用方重采样
  WAVEFORMATEX wfx = MakeFloatFormat(preferred_sample_rate, preferred_channels);
  const DWORD stream_flags =
      AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
  hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED, stream_flags,
                          kBufferDuration, 0, &wfx, nullptr);
  if (FAILED(hr)) {
    // 回退格式重试（需重新激活：Initialize 失败后的 client 不可复用）
    client.Reset();
    hr = ActivateProcessLoopbackClient(root_pid, &client);
    if (SUCCEEDED(hr) && client) {
      wfx = MakeFloatFormat(48000, 2);
      hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED, stream_flags,
                             kBufferDuration, 0, &wfx, nullptr);
    }
    if (FAILED(hr)) {
      result.error = HrToString("IAudioClient::Initialize", hr);
      if (need_uninit) CoUninitialize();
      return result;
    }
  }
  result.sample_rate = wfx.nSamplesPerSec;
  result.channels = wfx.nChannels;

  HANDLE sample_event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (sample_event == nullptr) {
    result.error = "创建采集事件失败";
    if (need_uninit) CoUninitialize();
    return result;
  }
  hr = client->SetEventHandle(sample_event);
  if (FAILED(hr)) {
    result.error = HrToString("SetEventHandle", hr);
    CloseHandle(sample_event);
    if (need_uninit) CoUninitialize();
    return result;
  }

  ComPtr<IAudioCaptureClient> capture;
  hr = client->GetService(__uuidof(IAudioCaptureClient),
                         reinterpret_cast<void**>(capture.GetAddressOf()));
  if (FAILED(hr)) {
    result.error = HrToString("GetService(IAudioCaptureClient)", hr);
    CloseHandle(sample_event);
    if (need_uninit) CoUninitialize();
    return result;
  }

  hr = client->Start();
  if (FAILED(hr)) {
    result.error = HrToString("IAudioClient::Start", hr);
    CloseHandle(sample_event);
    if (need_uninit) CoUninitialize();
    return result;
  }

  const DWORD deadline = GetTickCount() + duration_ms;
  double square_sum = 0.0;
  while (GetTickCount() < deadline) {
    const DWORD remain = deadline - GetTickCount();
    // 目标进程静默时不产生事件，故等待上限取剩余时长与 200ms 的较小值，
    // 保证到点即退出而非无限等待
    const DWORD wait_ms = remain < 200 ? remain : 200;
    WaitForSingleObject(sample_event, wait_ms);

    UINT32 packet_frames = 0;
    while (SUCCEEDED(capture->GetNextPacketSize(&packet_frames)) &&
           packet_frames > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      hr = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;

      result.packet_count++;
      const size_t sample_count =
          static_cast<size_t>(frames) * result.channels;
      if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0) {
        result.silent_packet_count++;
        result.samples.insert(result.samples.end(), sample_count, 0.0f);
      } else {
        const auto* floats = reinterpret_cast<const float*>(data);
        result.samples.insert(result.samples.end(), floats,
                              floats + sample_count);
        for (size_t i = 0; i < sample_count; ++i) {
          const double v = static_cast<double>(floats[i]);
          square_sum += v * v;
          const double a = std::fabs(v);
          if (a > result.peak) result.peak = a;
        }
      }
      capture->ReleaseBuffer(frames);
    }
  }

  client->Stop();
  CloseHandle(sample_event);
  if (need_uninit) CoUninitialize();

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
  put(reinterpret_cast<const void*>(&block_align), 2);
  put(&bits, 2);
  put("data", 4);
  put(&data_bytes, 4);
  if (!samples.empty()) put(samples.data(), data_bytes);

  std::fclose(fp);
  return true;
}

}  // namespace process_audio
