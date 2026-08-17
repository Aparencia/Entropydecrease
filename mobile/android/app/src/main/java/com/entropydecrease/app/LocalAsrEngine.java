package com.entropydecrease.app;

import android.content.Context;
import android.util.Log;

import com.k2fsa.sherpa.onnx.FeatureConfig;
import com.k2fsa.sherpa.onnx.OnlineModelConfig;
import com.k2fsa.sherpa.onnx.OnlineRecognizer;
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OnlineStream;
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig;

import java.io.BufferedInputStream;
import java.io.DataInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * 熵减 — 本地流式 ASR 引擎（sherpa-onnx 中文流式 Zipformer，模型打进 APK assets）
 *
 * @ai-context: 与桌面端同引擎族（sherpa-onnx），中文课堂场景。sherpa-onnx 1.13.5
 * Android AAR 为 Kotlin API：OnlineRecognizer(AssetManager, config) 直接以 assets
 * 相对路径加载模型（无需拷贝到 filesDir）。一个识别器同时服务两条路径：
 * 流式（录屏/录音实时字幕：createStream/feed/decodePartial/finish）与批量
 * （相册导入视频的分片 WAV：transcribeFile，自解析 WAV 头后整段喂入）。
 * 全部方法 synchronized：Capacitor 桥接线程与解码线程共享实例。
 * @ai-context EN: local streaming ASR via sherpa-onnx (Chinese streaming
 * Zipformer, model bundled in APK assets). The 1.13.5 Android AAR exposes a
 * Kotlin API that loads models straight from assets. One recognizer serves
 * both streaming (realtime subtitles) and batch (WAV chunk) transcription.
 */
public final class LocalAsrEngine {

    private static final String TAG = "LocalAsrEngine";
    /** assets 下模型相对路径（int8 量化：encoder 14.7MB + decoder 7.2MB + joiner 1.7MB） */
    private static final String ASSET_MODEL_DIR = "asr";
    private static final int SAMPLE_RATE = 16000;
    private static final int FEATURE_DIM = 80;

    private OnlineRecognizer recognizer;

    /** 初始化流式识别器（幂等，重复调用直接返回；首次加载约 24MB 模型） */
    public synchronized void init(Context ctx) throws IOException {
        if (recognizer != null) {
            return;
        }
        OnlineTransducerModelConfig transducer = new OnlineTransducerModelConfig(
            ASSET_MODEL_DIR + "/encoder.onnx",
            ASSET_MODEL_DIR + "/decoder.onnx",
            ASSET_MODEL_DIR + "/joiner.onnx",
            null
        );
        OnlineModelConfig model = new OnlineModelConfig();
        model.setTransducer(transducer);
        model.setTokens(ASSET_MODEL_DIR + "/tokens.txt");
        model.setNumThreads(2);
        model.setDebug(false);

        OnlineRecognizerConfig config = new OnlineRecognizerConfig();
        config.setFeatConfig(new FeatureConfig(SAMPLE_RATE, FEATURE_DIM, 0.0f));
        config.setModelConfig(model);
        config.setEnableEndpoint(true);
        config.setDecodingMethod("greedy_search");

        recognizer = new OnlineRecognizer(ctx.getAssets(), config);
        Log.i(TAG, "sherpa-onnx recognizer initialized (assets/" + ASSET_MODEL_DIR + ")");
    }

    public synchronized boolean isReady() {
        return recognizer != null;
    }

    /** 流式：新建识别流 */
    public synchronized OnlineStream createStream() {
        return recognizer.createStream(null);
    }

    /** 流式：喂入 PCM 采样（float，-1..1） */
    public synchronized void feed(OnlineStream stream, float[] samples, int sampleRate) {
        stream.acceptWaveform(samples, sampleRate);
    }

    /** 流式：解码至当前可解码深度，返回部分文本（实时字幕用） */
    public synchronized String decodePartial(OnlineStream stream) {
        while (recognizer.isReady(stream)) {
            recognizer.decode(stream);
        }
        return recognizer.getResult(stream).getText();
    }

    /** 流式：标记输入结束并排空解码，返回最终文本 */
    public synchronized String finish(OnlineStream stream) {
        stream.inputFinished();
        while (recognizer.isReady(stream)) {
            recognizer.decode(stream);
        }
        return recognizer.getResult(stream).getText();
    }

    /** 批量：整段转写 WAV 文件（16-bit PCM 单声道，本机抽取器产物；采样率自适应） */
    public synchronized String transcribeFile(String wavPath) throws IOException {
        int[] rate = new int[1];
        float[] samples = readWavFloats(wavPath, rate);
        int sampleRate = rate[0] > 0 ? rate[0] : SAMPLE_RATE;
        OnlineStream stream = recognizer.createStream(null);
        try {
            stream.acceptWaveform(samples, sampleRate);
            stream.inputFinished();
            while (recognizer.isReady(stream)) {
                recognizer.decode(stream);
            }
            return recognizer.getResult(stream).getText();
        } finally {
            stream.release();
        }
    }

    /**
     * 解析 16-bit PCM 单声道 WAV 为 float[]（-1..1），跳过标准 44 字节头；
     * @param outSampleRate 出参：WAV 头真实采样率（引擎按此自适应，8kHz/16kHz 均可）
     */
    private static float[] readWavFloats(String wavPath, int[] outSampleRate) throws IOException {
        try (DataInputStream in = new DataInputStream(new BufferedInputStream(new FileInputStream(wavPath)))) {
            byte[] header = new byte[44];
            in.readFully(header);
            ByteBuffer hb = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
            if (hb.getInt(0) != 0x46464952) { // "RIFF"
                throw new IOException("非 RIFF/WAV 文件");
            }
            outSampleRate[0] = hb.getInt(24);
            int dataSize = hb.getInt(40);
            int sampleCount = dataSize / 2;
            byte[] pcm = new byte[dataSize];
            in.readFully(pcm);
            ByteBuffer bb = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN);
            float[] out = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++) {
                out[i] = bb.getShort(i * 2) / 32768f;
            }
            return out;
        }
    }

    public synchronized void release() {
        if (recognizer != null) {
            recognizer.release();
            recognizer = null;
        }
    }
}
