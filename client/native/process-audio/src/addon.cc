// N-API 绑定入口
//
// @ai-context: 导出三类能力——窗口/进程解析、能力探测、采集。
// 采集分两个入口：captureToWav（同步阻塞，spike 验证用）与
// startCapture/stopCapture（采集线程 + ThreadSafeFunction 流式回调，生产用）。
// @ai-context: 单实例语义——IPC 层同时只有一路采集，重复 startCapture 报错
// 而非默默覆盖，避免采集线程泄漏。

#include <napi.h>

#include <memory>
#include <utility>

#include "capture_session.h"
#include "loopback_capture.h"
#include "streaming_capture.h"
#include "window_finder.h"

namespace {

/** std::wstring → Napi::String（UTF-16 直通，避免中文标题乱码） */
Napi::String ToNapiString(Napi::Env env, const std::wstring& s) {
  return Napi::String::New(env, std::u16string(s.begin(), s.end()));
}

/** listAudioWindows(): 返回所有可见顶层窗口及其 pid / rootPid */
Napi::Value ListAudioWindows(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const auto windows = process_audio::ListAudioWindows();

  Napi::Array arr = Napi::Array::New(env, windows.size());
  for (size_t i = 0; i < windows.size(); ++i) {
    const auto& w = windows[i];
    Napi::Object obj = Napi::Object::New(env);
    // hwnd 可能超过 2^32，用字符串传递避免 JS number 精度问题
    obj.Set("hwnd", Napi::String::New(env, std::to_string(w.hwnd)));
    obj.Set("pid", Napi::Number::New(env, static_cast<double>(w.pid)));
    obj.Set("rootPid", Napi::Number::New(env, static_cast<double>(w.root_pid)));
    obj.Set("title", ToNapiString(env, w.title));
    obj.Set("processName", ToNapiString(env, w.process_name));
    obj.Set("rootProcessName", ToNapiString(env, w.root_process_name));
    arr.Set(i, obj);
  }
  return arr;
}

/** resolveRootPid(pid): 解析某 PID 的应用根进程 */
Napi::Value ResolveRootPid(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "resolveRootPid(pid: number) 需要一个数字参数")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const uint32_t pid = info[0].As<Napi::Number>().Uint32Value();
  const uint32_t root = process_audio::ResolveRootPidForPid(pid);
  return Napi::Number::New(env, static_cast<double>(root));
}

/**
 * captureToWav({ pid, durationMs, sampleRate, channels, outPath }):
 * 同步采集指定时长并可选落盘，返回含 RMS/peak 的诊断信息。
 *
 * spike 阶段故意采用同步造型（会阻塞调用线程），Phase 2 集成时
 * 改为采集线程 + ThreadSafeFunction 流式回调。
 */
Napi::Value CaptureToWav(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "captureToWav(options) 需要一个配置对象")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  Napi::Object opts = info[0].As<Napi::Object>();

  if (!opts.Has("pid")) {
    Napi::TypeError::New(env, "options.pid 为必填项").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const uint32_t pid = opts.Get("pid").As<Napi::Number>().Uint32Value();
  const uint32_t duration_ms = opts.Has("durationMs")
      ? opts.Get("durationMs").As<Napi::Number>().Uint32Value() : 5000;
  const uint32_t sample_rate = opts.Has("sampleRate")
      ? opts.Get("sampleRate").As<Napi::Number>().Uint32Value() : 16000;
  const uint32_t channels = opts.Has("channels")
      ? opts.Get("channels").As<Napi::Number>().Uint32Value() : 1;

  const auto result = process_audio::CaptureProcessAudio(
      pid, duration_ms, sample_rate, channels);

  Napi::Object out = Napi::Object::New(env);
  out.Set("ok", Napi::Boolean::New(env, result.ok));
  out.Set("error", Napi::String::New(env, result.error));
  out.Set("sampleRate", Napi::Number::New(env, result.sample_rate));
  out.Set("channels", Napi::Number::New(env, result.channels));
  out.Set("sampleCount", Napi::Number::New(env,
      static_cast<double>(result.samples.size())));
  out.Set("packetCount", Napi::Number::New(env, result.packet_count));
  out.Set("silentPacketCount",
          Napi::Number::New(env, result.silent_packet_count));
  out.Set("rms", Napi::Number::New(env, result.rms));
  out.Set("peak", Napi::Number::New(env, result.peak));

  if (result.ok && opts.Has("outPath")) {
    const std::string path = opts.Get("outPath").As<Napi::String>().Utf8Value();
    const bool written = process_audio::WriteWavFloat32(
        path, result.samples, result.sample_rate, result.channels);
    out.Set("wavWritten", Napi::Boolean::New(env, written));
    out.Set("outPath", Napi::String::New(env, path));
  }
  return out;
}

/** isProcessLoopbackSupported(): 能力探测（真实尝试激活一次） */
Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), process_audio::IsProcessLoopbackSupported());
}

// ================================================================
// 流式采集（生产入口）
// ================================================================

/** 投递给 JS 线程的负载：一个音频块或一次错误 */
struct StreamEvent {
  bool is_error = false;
  std::string error;
  process_audio::StreamingChunk chunk;
};

/** 全局单例采集器与其线程安全回调句柄 */
std::unique_ptr<process_audio::StreamingCapture> g_capture;
Napi::ThreadSafeFunction g_tsfn;

/** 在 JS 线程消费采集线程投递的事件 */
void DispatchStreamEvent(Napi::Env env, Napi::Function callback, StreamEvent* event) {
  if (env != nullptr && callback != nullptr) {
    Napi::Object payload = Napi::Object::New(env);
    if (event->is_error) {
      payload.Set("error", Napi::String::New(env, event->error));
    } else {
      const size_t bytes = event->chunk.samples.size() * sizeof(float);
      // 拷贝一份给 JS：采集线程的 vector 回调后即释放，不能共享内存
      Napi::ArrayBuffer buffer = Napi::ArrayBuffer::New(env, bytes);
      if (bytes > 0) {
        std::memcpy(buffer.Data(), event->chunk.samples.data(), bytes);
      }
      payload.Set("audioBuffer", buffer);
      payload.Set("sampleRate", Napi::Number::New(env, event->chunk.sample_rate));
      payload.Set("channels", Napi::Number::New(env, event->chunk.channels));
      payload.Set("durationMs", Napi::Number::New(env, event->chunk.duration_ms));
    }
    callback.Call({payload});
  }
  delete event;
}

/**
 * startCapture({ pid, sampleRate, channels, chunkDurationMs }, cb):
 * 启动采集线程，每聚成一块就回调 cb({audioBuffer, sampleRate, channels,
 * durationMs})；致命错误回调 cb({error})。
 *
 * 会话打开在采集线程内完成，故"目标不可采"这类失败以 error 回调形式
 * 异步上报，调用方应据此触发降级。
 */
Napi::Value StartCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "startCapture(options, callback) 参数不完整")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (g_capture && g_capture->running()) {
    Napi::Error::New(env, "采集已在进行中，请先 stopCapture")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Object opts = info[0].As<Napi::Object>();
  process_audio::StreamingOptions options;
  options.root_pid = opts.Has("pid")
      ? opts.Get("pid").As<Napi::Number>().Uint32Value() : 0;
  options.sample_rate = opts.Has("sampleRate")
      ? opts.Get("sampleRate").As<Napi::Number>().Uint32Value() : 16000;
  options.channels = opts.Has("channels")
      ? opts.Get("channels").As<Napi::Number>().Uint32Value() : 1;
  options.chunk_duration_ms = opts.Has("chunkDurationMs")
      ? opts.Get("chunkDurationMs").As<Napi::Number>().Uint32Value() : 5000;

  g_tsfn = Napi::ThreadSafeFunction::New(
      env, info[1].As<Napi::Function>(), "process-audio-capture", 0, 1);

  g_capture = std::make_unique<process_audio::StreamingCapture>();
  const std::string err = g_capture->Start(
      options,
      [](process_audio::StreamingChunk&& chunk) {
        auto* event = new StreamEvent();
        event->chunk = std::move(chunk);
        // 采集线程不能直接碰 JS，统一经 ThreadSafeFunction 投递
        if (g_tsfn.BlockingCall(event, DispatchStreamEvent) != napi_ok) {
          delete event;
        }
      },
      [](const std::string& message) {
        auto* event = new StreamEvent();
        event->is_error = true;
        event->error = message;
        if (g_tsfn.BlockingCall(event, DispatchStreamEvent) != napi_ok) {
          delete event;
        }
      });

  Napi::Object result = Napi::Object::New(env);
  if (!err.empty()) {
    g_tsfn.Release();
    g_capture.reset();
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error", Napi::String::New(env, err));
    return result;
  }
  result.Set("ok", Napi::Boolean::New(env, true));
  result.Set("error", Napi::String::New(env, ""));
  return result;
}

/** stopCapture(): 停止采集并等待线程退出（幂等） */
Napi::Value StopCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (g_capture) {
    g_capture->Stop();
    g_capture.reset();
    g_tsfn.Release();
  }
  return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("listAudioWindows", Napi::Function::New(env, ListAudioWindows));
  exports.Set("resolveRootPid", Napi::Function::New(env, ResolveRootPid));
  exports.Set("captureToWav", Napi::Function::New(env, CaptureToWav));
  exports.Set("isProcessLoopbackSupported",
              Napi::Function::New(env, IsSupported));
  exports.Set("startCapture", Napi::Function::New(env, StartCapture));
  exports.Set("stopCapture", Napi::Function::New(env, StopCapture));
  return exports;
}

}  // namespace

NODE_API_MODULE(process_audio, Init)
