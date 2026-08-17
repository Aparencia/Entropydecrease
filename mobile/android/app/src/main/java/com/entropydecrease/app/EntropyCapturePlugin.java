package com.entropydecrease.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadataRetriever;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.Locale;

/**
 * 熵减 — 自定义原生能力插件（视频选取 / 元数据 / 音频抽取 / 录屏 / 本地流式 ASR）
 *
 * @ai-context: 移动端课堂助手的原生侧唯一插件。职责：
 * ① pickVideo 系统视频选择器 → 拷贝到应用私有目录（content:// 生命周期隔离）；
 * ② getVideoMetadata 时长/尺寸（60 分钟超限拦截）；
 * ③ extractAudio MediaExtractor/MediaCodec 解码 → 分片 16kHz 16bit 单声道 WAV；
 * ④ startScreenRecording MediaProjection 录屏（前台服务，Android 14+ 合规）；
 * ⑤ initAsr/asrStart/asrFeedPcm/asrStop/asrTranscribeFile 本地流式 ASR
 * （sherpa-onnx JNI，模型打进 APK）——本期为接口占位，引擎接入见后续迭代。
 * @ai-context EN: the single custom native plugin of the mobile classroom
 * assistant: video picking, metadata, audio extraction to WAV chunks,
 * MediaProjection screen recording (foreground service), and local streaming
 * ASR (sherpa-onnx JNI — interface stubs this iteration, engine next).
 * Capacitor 7 API: @ActivityCallback + startActivityForResult(call, intent, name).
 */
@CapacitorPlugin(name = "EntropyCapture")
public class EntropyCapturePlugin extends Plugin {

    private static final String TAG = "EntropyCapturePlugin";

    /** 重活工作池：模型加载/音频抽取/批量转写为 CPU 密集且可达分钟级，
     *  严禁占用 Capacitor 桥接主线程（否则 ANR）；单线程保证引擎访问有序 */
    private final java.util.concurrent.ExecutorService workExecutor =
        java.util.concurrent.Executors.newSingleThreadExecutor();

    /** 应用私有媒体目录（与 JS 侧 Filesystem Directory.Data 对齐） */
    static File mediaDir(Context ctx) {
        File dir = new File(ctx.getFilesDir(), "media");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    // ───────────────────────── 视频选取 ─────────────────────────

    /** 打开系统视频选择器，选中后拷贝到应用私有目录，返回本地绝对路径 */
    @PluginMethod
    public void pickVideo(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        try {
            startActivityForResult(call, intent, "onPickVideoResult");
        } catch (Exception e) {
            Log.w(TAG, "pickVideo launch failed", e);
            call.reject("无法打开系统视频选择器", "PICKER_UNAVAILABLE");
        }
    }

    @ActivityCallback
    private void onPickVideoResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null
            && result.getData().getData() != null) {
            try {
                String path = copyContentUriToDataDir(result.getData().getData());
                JSObject ret = new JSObject();
                ret.put("path", path);
                ret.put("name", new File(path).getName());
                ret.put("size", new File(path).length());
                call.resolve(ret);
            } catch (Exception e) {
                Log.w(TAG, "pickVideo copy failed", e);
                call.reject("拷贝视频失败: " + e.getMessage(), "COPY_ERROR");
            }
        } else {
            call.resolve(null); // 用户取消
        }
    }

    /** content:// → 应用私有目录拷贝（流式，不占 JS 内存） */
    private String copyContentUriToDataDir(Uri uri) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        String ext = "mp4";
        String type = resolver.getType(uri);
        if (type != null) {
            String mime = type.toLowerCase(Locale.ROOT);
            if (mime.contains("mp4") || mime.contains("mpeg4")) ext = "mp4";
            else if (mime.contains("webm")) ext = "webm";
            else if (mime.contains("mkv")) ext = "mkv";
            else if (mime.contains("quicktime") || mime.contains("mov")) ext = "mov";
        }
        File out = new File(mediaDir(getContext()), "video-" + System.currentTimeMillis() + "." + ext);
        try (InputStream in = resolver.openInputStream(uri);
             OutputStream os = new FileOutputStream(out)) {
            if (in == null) throw new Exception("无法读取所选视频");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                os.write(buf, 0, n);
            }
        }
        return out.getAbsolutePath();
    }

    // ───────────────────────── 视频元数据 ─────────────────────────

    /** 读取视频时长（毫秒）与分辨率，供 60 分钟超限拦截与进度展示 */
    @PluginMethod
    public void getVideoMetadata(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("缺少 path 参数", "INVALID_ARGUMENT");
            return;
        }
        try {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                if (path.startsWith("content://")) {
                    retriever.setDataSource(getContext(), Uri.parse(path));
                } else {
                    retriever.setDataSource(path);
                }
                String durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                String width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
                String height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                JSObject ret = new JSObject();
                ret.put("durationMs", durationMs != null ? Long.parseLong(durationMs) : 0L);
                ret.put("width", width != null ? Integer.parseInt(width) : 0);
                ret.put("height", height != null ? Integer.parseInt(height) : 0);
                call.resolve(ret);
            } finally {
                retriever.release();
            }
        } catch (Exception e) {
            Log.w(TAG, "getVideoMetadata failed", e);
            call.reject("读取视频信息失败", "METADATA_ERROR");
        }
    }

    // ───────────────────────── 音频抽取 ─────────────────────────

    /**
     * 从视频抽取音频并输出分片 WAV（16kHz 16bit 单声道，按 segmentSeconds 切片）
     * @param call path 视频路径；outDir 输出目录（默认应用私有目录 media/asr）；
     *             segmentSeconds 分片秒数（默认 600）
     */
    @PluginMethod
    public void extractAudio(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("缺少 path 参数", "INVALID_ARGUMENT");
            return;
        }
        String outDir = call.getString("outDir");
        if (outDir == null || outDir.isEmpty()) {
            outDir = new File(mediaDir(getContext()), "asr").getAbsolutePath();
        }
        final String finalOutDir = outDir;
        int segmentSeconds = call.getInt("segmentSeconds", 600);
        int sampleRate = call.getInt("sampleRate", 16000);
        workExecutor.execute(() -> {
            try {
                List<String> chunks = AudioExtractor.extract(getContext(), path, finalOutDir, segmentSeconds, sampleRate);
                JSArray arr = new JSArray();
                for (String chunk : chunks) {
                    arr.put(chunk);
                }
                JSObject ret = new JSObject();
                ret.put("chunks", arr);
                call.resolve(ret);
            } catch (Exception e) {
                Log.w(TAG, "extractAudio failed", e);
                call.reject("音频抽取失败: " + e.getMessage(), "EXTRACT_ERROR");
            }
        });
    }

    // ───────────────────────── 录屏（MediaProjection） ─────────────────────────

    /** 请求录屏授权并启动前台录屏服务（画面 + 麦克风人声） */
    @PluginMethod
    public void startScreenRecording(PluginCall call) {
        if (ScreenRecordService.isRecording) {
            call.resolve(new JSObject().put("started", true));
            return;
        }
        MediaProjectionManager mpm =
            (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        Intent intent = mpm.createScreenCaptureIntent();
        try {
            startActivityForResult(call, intent, "onScreenRecordPermission");
        } catch (Exception e) {
            Log.w(TAG, "startScreenRecording launch failed", e);
            call.reject("无法发起录屏授权", "RECORD_START_FAILED");
        }
    }

    @ActivityCallback
    private void onScreenRecordPermission(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Intent svc = new Intent(getContext(), ScreenRecordService.class);
            svc.setAction(ScreenRecordService.ACTION_START);
            svc.putExtra("resultCode", result.getResultCode());
            svc.putExtra("resultData", result.getData());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(svc);
            } else {
                getContext().startService(svc);
            }
            call.resolve(new JSObject().put("started", true));
        } else {
            call.reject("用户未授予录屏权限", "PERMISSION_DENIED");
        }
    }

    /** 停止录屏并返回产物路径 */
    @PluginMethod
    public void stopScreenRecording(PluginCall call) {
        boolean wasRecording = ScreenRecordService.isRecording;
        getContext().stopService(new Intent(getContext(), ScreenRecordService.class));
        JSObject ret = new JSObject();
        ret.put("stopped", wasRecording);
        ret.put("filePath", ScreenRecordService.lastOutputPath != null ? ScreenRecordService.lastOutputPath : "");
        call.resolve(ret);
    }

    /** 查询录屏状态 */
    @PluginMethod
    public void getRecordingState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("recording", ScreenRecordService.isRecording);
        ret.put("filePath", ScreenRecordService.lastOutputPath != null ? ScreenRecordService.lastOutputPath : "");
        call.resolve(ret);
    }

    // ───────────────────────── 本地流式 ASR（sherpa-onnx） ─────────────────────────

    private final LocalAsrEngine asr = new LocalAsrEngine();
    /** 流式识别流：asrStart/asrStop 在工作池线程访问，asrFeedPcm 在桥接线程访问；
     *  引擎方法全部 synchronized 保证底层串行；停止后 feed 由空值守卫拒绝 */
    private com.k2fsa.sherpa.onnx.OnlineStream asrStream;

    /** 初始化本地 ASR（幂等；首次从 assets 加载约 24MB 模型，后台执行） */
    @PluginMethod
    public void initAsr(PluginCall call) {
        workExecutor.execute(() -> {
            try {
                asr.init(getContext());
                call.resolve(new JSObject().put("ready", true));
            } catch (Exception e) {
                Log.w(TAG, "initAsr failed", e);
                call.reject("本地 ASR 初始化失败: " + e.getMessage(), "ASR_INIT_ERROR");
            }
        });
    }

    /** 开始一段流式识别（录屏/录音期间实时字幕） */
    @PluginMethod
    public void asrStart(PluginCall call) {
        workExecutor.execute(() -> {
            try {
                asr.init(getContext());
                asrStream = asr.createStream();
                call.resolve(new JSObject().put("started", true));
            } catch (Exception e) {
                Log.w(TAG, "asrStart failed", e);
                call.reject("本地 ASR 启动失败: " + e.getMessage(), "ASR_START_ERROR");
            }
        });
    }

    /** 喂入 PCM 采样（float[]），返回当前部分文本并推送 asrPartialText 事件 */
    @PluginMethod
    public void asrFeedPcm(PluginCall call) {
        JSArray samples = call.getArray("samples");
        if (samples == null || asrStream == null) {
            call.reject("缺少 samples 或识别流未启动", "INVALID_ARGUMENT");
            return;
        }
        int sampleRate = call.getInt("sampleRate", 16000);
        try {
            java.util.List<Object> items = samples.toList();
            float[] floats = new float[items.size()];
            for (int i = 0; i < floats.length; i++) {
                floats[i] = ((Number) items.get(i)).floatValue();
            }
            asr.feed(asrStream, floats, sampleRate);
            String partial = asr.decodePartial(asrStream);
            JSObject ret = new JSObject().put("partial", partial);
            if (!partial.isEmpty()) {
                notifyListeners("asrPartialText", new JSObject().put("text", partial));
            }
            call.resolve(ret);
        } catch (Exception e) {
            Log.w(TAG, "asrFeedPcm failed", e);
            call.reject("ASR 喂入失败: " + e.getMessage(), "ASR_FEED_ERROR");
        }
    }

    /** 结束流式识别：排空解码，推送 asrFinalText 并返回最终文本 */
    @PluginMethod
    public void asrStop(PluginCall call) {
        workExecutor.execute(() -> {
            try {
                com.k2fsa.sherpa.onnx.OnlineStream stream = asrStream;
                if (stream == null) {
                    call.reject("识别流未启动", "INVALID_STATE");
                    return;
                }
                asrStream = null;
                String text = asr.finish(stream);
                stream.release();
                notifyListeners("asrFinalText", new JSObject().put("text", text));
                call.resolve(new JSObject().put("text", text));
            } catch (Exception e) {
                Log.w(TAG, "asrStop failed", e);
                call.reject("ASR 停止失败: " + e.getMessage(), "ASR_STOP_ERROR");
            }
        });
    }

    /** 批量转写 WAV 文件（相册导入视频的分片音频，本地优先路径；后台执行） */
    @PluginMethod
    public void asrTranscribeFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("缺少 path 参数", "INVALID_ARGUMENT");
            return;
        }
        workExecutor.execute(() -> {
            try {
                asr.init(getContext());
                String text = asr.transcribeFile(path);
                call.resolve(new JSObject().put("text", text));
            } catch (Exception e) {
                Log.w(TAG, "asrTranscribeFile failed", e);
                call.reject("本地转写失败: " + e.getMessage(), "ASR_TRANSCRIBE_ERROR");
            }
        });
    }
}
