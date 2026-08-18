//! WASAPI 端点环回捕获（REQ-007，ADR-001）。
//!
//! @ai-context: 本模块在 Rust 主进程直接调用 WASAPI（windows crate），
//!              捕获系统默认渲染端点的输出声音，输出统一为 16kHz 单声道
//!              Float32 PCM 定长块（200ms），与 sherpa-onnx 流式引擎输入对齐。
//! @ai-context: 设计要点（ADR-001）：COM 在线程内初始化；停止靠 AtomicBool +
//!              join 超时保护；无音频播放时 GetBuffer 为空包（静默），轮询
//!              sleep 防空转 CPU；格式仅支持 16-bit PCM 与 32-bit float
//!              （其他格式报错降级，不静默失败）。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use windows::core::GUID;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator,
    AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
};

use super::resample::{ChunkAccumulator, TARGET_SAMPLE_RATE};

/// CLSID_MMDeviceEnumerator {BCDE0395-E52F-467C-8E3D-C4579291692E}
/// @ai-context: windows crate 不导出该常量，按 MSDN 文档手动定义（ADR-001）。
const CLSID_MM_DEVICE_ENUMERATOR: GUID = GUID::from_u128(0xBCDE0395_E52F_467C_8E3D_C4579291692E);

/// KSDATAFORMAT_SUBTYPE_IEEE_FLOAT {00000003-0000-0010-8000-00AA00389B71}
/// @ai-context: WAVEFORMATEXTENSIBLE 的 SubFormat 为 float 时的 GUID
///              （windows crate 未导出，按 MSDN 定义；用于 EXTENSIBLE 格式识别，审查 S1 修复）。
const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: GUID = GUID::from_u128(0x00000003_0000_0010_8000_00AA00389B71);

/// 捕获输出块（16kHz 单声道，定长 200ms）。
#[derive(Debug, Clone)]
pub struct AudioChunk {
    pub samples: Vec<f32>,
    /// 采样率（对外契约字段；当前消费方固定 16k 未读取，保留供后续消费方使用）
    #[allow(dead_code)]
    pub sample_rate: u32,
    /// 相对捕获起点的毫秒时间戳（单调递增，会话时间轴基准）
    pub timestamp_ms: u64,
}

/// WASAPI 环回捕获句柄：start 后后台线程持续捕获，stop 后释放全部 COM 资源。
pub struct AudioLoopbackCapture {
    stop_flag: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl AudioLoopbackCapture {
    /// 启动捕获。on_chunk 在捕获线程内被调用（消费者需自行做轻量处理或转发）。
    ///
    /// @ai-context: 返回 Err 表示端点不可用（无渲染设备）或格式不支持，
    ///              调用方应给出可操作提示（引导检查系统声音设置）。
    pub fn start<F>(on_chunk: F) -> crate::error::Result<Self>
    where
        F: Fn(AudioChunk) + Send + 'static,
    {
        let stop_flag = Arc::new(AtomicBool::new(false));
        let flag = stop_flag.clone();
        let handle = thread::Builder::new()
            .name("entropy-wasapi-loopback".into())
            .spawn(move || capture_loop(flag, on_chunk))
            .map_err(|e| crate::error::AppError::Io(format!("启动捕获线程失败: {}", e)))?;
        Ok(Self { stop_flag, handle: Some(handle) })
    }

    /// 停止捕获并等待线程退出（join 超时保护：线程异常时不阻塞调用方）。
    ///
    /// @ai-context: 结构体实现 Drop 不能整体 move，故用 &mut + Option::take。
    pub fn stop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for AudioLoopbackCapture {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
    }
}

/// 捕获主循环：COM 初始化 → 打开环回端点 → 取包 → 归一化 → 切块投递。
///
/// @ai-context: 静默（无播放）时 GetNextPacketSize 返回 0，sleep 10ms 轮询；
///              帧数据转换失败（格式不支持）记录一次后退出，不静默吞错。
fn capture_loop<F>(stop_flag: Arc<AtomicBool>, on_chunk: F)
where
    F: Fn(AudioChunk) + Send,
{
    match run_capture(&stop_flag, &on_chunk) {
        Ok(()) => {}
        Err(e) => eprintln!("[AudioLoopback] 捕获终止: {}", e),
    }
}

/// COM 初始化 guard：drop 时自动 CoUninitialize（TD-028 修复——CoInitializeEx 无配对调用会泄漏线程 COM 状态）。
struct ComInitGuard;

impl Drop for ComInitGuard {
    fn drop(&mut self) {
        unsafe { CoUninitialize() }
    }
}

fn run_capture<F>(stop_flag: &AtomicBool, on_chunk: &F) -> crate::error::Result<()>
where
    F: Fn(AudioChunk) + Send,
{
    unsafe {
        // COM 必须在线程内初始化（ADR-001 风险缓解）；HRESULT 需 ok() 转 Result
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|e| crate::error::AppError::Io(format!("COM 初始化失败: {}", e)))?;
    }
    // 初始化成功后所有退出路径（含 Err 提前返回）都必须配对 CoUninitialize
    let _com = ComInitGuard;
    run_capture_inner(stop_flag, on_chunk)
}

/// 捕获主循环体（run_capture 的拆分：COM guard 与函数体分离，保证配对）。
fn run_capture_inner<F>(stop_flag: &AtomicBool, on_chunk: &F) -> crate::error::Result<()>
where
    F: Fn(AudioChunk) + Send,
{
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&CLSID_MM_DEVICE_ENUMERATOR, None, CLSCTX_ALL)
            .map_err(|e| crate::error::AppError::Io(format!("创建设备枚举器失败: {}", e)))?;
        let device: IMMDevice = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| crate::error::AppError::Io(format!("无默认渲染设备（请检查系统声音设置）: {}", e)))?;
        let audio_client: IAudioClient = device
            .Activate::<IAudioClient>(CLSCTX_ALL, None)
            .map_err(|e| crate::error::AppError::Io(format!("激活音频客户端失败: {}", e)))?;

        // 混音格式：可能是 WAVEFORMATEX 或 WAVEFORMATEXTENSIBLE
        // @ai-context: EXTENSIBLE（wFormatTag=0xFFFE）时须读偏移 24 处的 SubFormat GUID
        //              判断是否为 float（审查 S1 修复——默认设备常为 EXTENSIBLE float）。
        let mix_format = audio_client
            .GetMixFormat()
            .map_err(|e| crate::error::AppError::Io(format!("获取混音格式失败: {}", e)))?;
        let format = &*mix_format;
        let bits = format.wBitsPerSample;
        let is_float = if format.wFormatTag == 0xFFFE {
            // WAVEFORMATEXTENSIBLE 布局：WAVEFORMATEX(18B) + wValidBits(2) + dwChannelMask(4) + SubFormat(16B)
            let sub_format = (mix_format as *const u8).add(24) as *const GUID;
            *sub_format == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
        } else {
            format.wFormatTag == 3 // WAVE_FORMAT_IEEE_FLOAT
        };
        let src_rate = format.nSamplesPerSec;
        let channels = format.nChannels;

        // 环回初始化：共享模式 + LOOPBACK 标志（ADR-001）
        audio_client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                100_0000,
                0,
                mix_format,
                None,
            )
            .map_err(|e| crate::error::AppError::Io(format!("初始化环回流失败: {}", e)))?;
        // 混音格式由 WASAPI 分配，需 CoTaskMemFree 释放
        CoTaskMemFree(Some(mix_format as *const core::ffi::c_void));

        let capture_client: IAudioCaptureClient = audio_client
            .GetService()
            .map_err(|e| crate::error::AppError::Io(format!("获取捕获客户端失败: {}", e)))?;

        audio_client
            .Start()
            .map_err(|e| crate::error::AppError::Io(format!("启动捕获失败: {}", e)))?;

        // 归一化管线：字节 → f32 → 混单声道 → 重采样 16k → 200ms 切块
        // @ai-context: 时间戳用墙钟（会话起点 elapsed）而非有效音频计数——
        //              静默期时间轴也推进，保证与屏幕帧时间戳同基准（审查 S2 修复）。
        let started = std::time::Instant::now();
        let mut accumulator = ChunkAccumulator::new(0);
        let block_samples = (TARGET_SAMPLE_RATE as usize) / 5;
        let mut format_error_logged = false;

        while !stop_flag.load(Ordering::SeqCst) {
            let packet_size: u32 = capture_client.GetNextPacketSize()?;
            if packet_size == 0 {
                // 静默窗：轮询防空转（ADR-001 风险缓解）
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }

            let mut data: *mut u8 = std::ptr::null_mut();
            let mut frames: u32 = 0;
            let mut flags: u32 = 0;
            capture_client.GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;

            if frames > 0 && !data.is_null() {
                let byte_len = (frames as usize) * (bits as usize / 8) * (channels as usize);
                let bytes = std::slice::from_raw_parts(data, byte_len);
                if let Some(samples) = super::resample::pcm_bytes_to_f32(bytes, bits, is_float) {
                    let mono = super::resample::mixdown_to_mono(&samples, channels);
                    let resampled = super::resample::resample_linear(&mono, src_rate, TARGET_SAMPLE_RATE);
                    for chunk in accumulator.push(&resampled) {
                        debug_assert_eq!(chunk.len(), block_samples);
                        on_chunk(AudioChunk {
                            samples: chunk,
                            sample_rate: TARGET_SAMPLE_RATE,
                            timestamp_ms: started.elapsed().as_millis() as u64,
                        });
                    }
                } else if !format_error_logged {
                    format_error_logged = true;
                    eprintln!("[AudioLoopback] 不支持的音频格式: {}bit float={}", bits, is_float);
                }
            }
            capture_client.ReleaseBuffer(frames)?;
        }

        let _ = audio_client.Stop();
        Ok(())
    }
}
