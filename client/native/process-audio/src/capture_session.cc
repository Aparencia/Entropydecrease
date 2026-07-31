// WASAPI 进程环回会话（实现）
//
// @ai-context: 三个易踩的坑：①process loopback 不支持 GetMixFormat，必须
// 显式指定 WAVEFORMATEX，被拒时需重新激活后再用回退格式（Initialize 失败
// 的 client 不可复用）；②必须用 PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE，
// 否则采不到 Chromium audio service（browser process 的子进程）播放的声音；
// ③目标进程静默时不产生事件包，等待必须带超时否则永久阻塞。

#include "capture_session.h"

#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <wrl/implements.h>

#include <cstdio>

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
HRESULT ActivateClient(uint32_t root_pid, ComPtr<IAudioClient>* out_client) {
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

struct CaptureSession::Impl {
  ComPtr<IAudioClient> client;
  ComPtr<IAudioCaptureClient> capture;
  HANDLE sample_event = nullptr;
  WAVEFORMATEX wfx = {};
  bool com_initialized = false;
  bool started = false;

  ~Impl() {
    if (started && client) client->Stop();
    capture.Reset();
    client.Reset();
    if (sample_event != nullptr) CloseHandle(sample_event);
    if (com_initialized) CoUninitialize();
  }
};

CaptureSession::CaptureSession() : impl_(std::make_unique<Impl>()) {}
CaptureSession::~CaptureSession() = default;

std::string CaptureSession::Open(uint32_t root_pid,
                                 uint32_t sample_rate,
                                 uint32_t channels) {
  const HRESULT co_hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  impl_->com_initialized = SUCCEEDED(co_hr);

  HRESULT hr = ActivateClient(root_pid, &impl_->client);
  if (FAILED(hr) || !impl_->client) return HrToString("进程环回激活", hr);

  const DWORD stream_flags =
      AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
  impl_->wfx = MakeFloatFormat(sample_rate, channels);
  hr = impl_->client->Initialize(AUDCLNT_SHAREMODE_SHARED, stream_flags,
                                 kBufferDuration, 0, &impl_->wfx, nullptr);
  if (FAILED(hr)) {
    // 回退格式重试（Initialize 失败后的 client 不可复用，需重新激活）
    impl_->client.Reset();
    hr = ActivateClient(root_pid, &impl_->client);
    if (SUCCEEDED(hr) && impl_->client) {
      impl_->wfx = MakeFloatFormat(48000, 2);
      hr = impl_->client->Initialize(AUDCLNT_SHAREMODE_SHARED, stream_flags,
                                     kBufferDuration, 0, &impl_->wfx, nullptr);
    }
    if (FAILED(hr)) return HrToString("IAudioClient::Initialize", hr);
  }

  impl_->sample_event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (impl_->sample_event == nullptr) return "创建采集事件失败";
  hr = impl_->client->SetEventHandle(impl_->sample_event);
  if (FAILED(hr)) return HrToString("SetEventHandle", hr);

  hr = impl_->client->GetService(
      __uuidof(IAudioCaptureClient),
      reinterpret_cast<void**>(impl_->capture.GetAddressOf()));
  if (FAILED(hr)) return HrToString("GetService(IAudioCaptureClient)", hr);

  return "";
}

std::string CaptureSession::Start() {
  if (!impl_->client) return "会话未初始化";
  const HRESULT hr = impl_->client->Start();
  if (FAILED(hr)) return HrToString("IAudioClient::Start", hr);
  impl_->started = true;
  return "";
}

bool CaptureSession::ReadPackets(std::vector<float>* out,
                                 ReadStats* stats,
                                 uint32_t wait_ms) {
  if (!impl_->capture) return false;
  WaitForSingleObject(impl_->sample_event, wait_ms);

  const uint32_t channels = impl_->wfx.nChannels;
  UINT32 packet_frames = 0;
  while (SUCCEEDED(impl_->capture->GetNextPacketSize(&packet_frames)) &&
         packet_frames > 0) {
    BYTE* data = nullptr;
    UINT32 frames = 0;
    DWORD flags = 0;
    const HRESULT hr =
        impl_->capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
    if (FAILED(hr)) return false;

    const size_t sample_count = static_cast<size_t>(frames) * channels;
    if (stats != nullptr) stats->packets++;
    if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0) {
      if (stats != nullptr) stats->silent_packets++;
      out->insert(out->end(), sample_count, 0.0f);
    } else {
      const auto* floats = reinterpret_cast<const float*>(data);
      out->insert(out->end(), floats, floats + sample_count);
    }
    impl_->capture->ReleaseBuffer(frames);
  }
  return true;
}

void CaptureSession::Stop() {
  if (impl_->started && impl_->client) {
    impl_->client->Stop();
    impl_->started = false;
  }
}

uint32_t CaptureSession::sample_rate() const { return impl_->wfx.nSamplesPerSec; }
uint32_t CaptureSession::channels() const { return impl_->wfx.nChannels; }

bool IsProcessLoopbackSupported() {
  const HRESULT co_hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  const bool need_uninit = SUCCEEDED(co_hr);

  ComPtr<IAudioClient> client;
  // 以当前进程为目标试探激活：只验证 API 可用性，不 Initialize、不采集
  const HRESULT hr = ActivateClient(GetCurrentProcessId(), &client);
  const bool supported = SUCCEEDED(hr) && client;

  client.Reset();
  if (need_uninit) CoUninitialize();
  return supported;
}

}  // namespace process_audio
