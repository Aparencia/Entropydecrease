// N-API 绑定入口
//
// @ai-context: Phase 1 spike 第一步仅暴露窗口/进程解析，用于验证编译链路
// 与"窗口 → PID → 应用根进程"回溯是否可靠；WASAPI 进程环回采集在验证
// 通过后追加。

#include <napi.h>

#include "loopback_capture.h"
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

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("listAudioWindows", Napi::Function::New(env, ListAudioWindows));
  exports.Set("resolveRootPid", Napi::Function::New(env, ResolveRootPid));
  exports.Set("captureToWav", Napi::Function::New(env, CaptureToWav));
  return exports;
}

}  // namespace

NODE_API_MODULE(process_audio, Init)
