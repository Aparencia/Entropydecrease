package com.entropydecrease.app;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;

/**
 * 熵减 — 视频音频抽取器：MediaExtractor + MediaCodec 解码 → 下混/重采样 →
 * 分片输出 16-bit PCM WAV（默认 16kHz 单声道，每段 ≤ segmentSeconds）。
 *
 * @ai-context: 云端 ASR（/api/v1/asr/transcribe）按 base64 ≤32MB 分片接收，
 * 10 分钟 16kHz/16bit/mono WAV ≈ 19MB（base64 ≈ 25.6MB），分片参数默认 600s。
 * 线性重采样器仅用于语音（移动端 ASR 场景精度足够），避免引入额外依赖。
 * @ai-context EN: decode the audio track to PCM, downmix to mono, resample
 * linearly to the target rate, and write WAV chunk files. Chunk size keeps
 * base64 payloads within the gateway's 32MB limit.
 */
public final class AudioExtractor {

    private static final String TAG = "EntropyAudioExtractor";
    private static final int TARGET_SAMPLE_RATE = 16000;
    private static final int TARGET_CHANNELS = 1;

    private AudioExtractor() {
    }

    public static List<String> extract(Context ctx, String videoPath, String outDir, int segmentSeconds, int sampleRate) throws IOException {
        int targetRate = sampleRate > 0 ? sampleRate : TARGET_SAMPLE_RATE;
        File dir = new File(outDir);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("无法创建输出目录: " + outDir);
        }

        MediaExtractor extractor = new MediaExtractor();
        MediaCodec codec = null;
        try {
            if (videoPath.startsWith("content://")) {
                extractor.setDataSource(ctx, Uri.parse(videoPath), null);
            } else {
                extractor.setDataSource(videoPath);
            }
            int trackIndex = findAudioTrack(extractor);
            if (trackIndex < 0) {
                throw new IOException("视频中未找到音轨");
            }
            MediaFormat format = extractor.getTrackFormat(trackIndex);
            extractor.selectTrack(trackIndex);

            String mime = format.getString(MediaFormat.KEY_MIME);
            codec = MediaCodec.createDecoderByType(mime);
            codec.configure(format, null, null, 0);
            codec.start();

            ChunkWriter writer = new ChunkWriter(dir, targetRate, segmentSeconds);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean inputDone = false;
            boolean outputDone = false;

            while (!outputDone) {
                if (!inputDone) {
                    int inIndex = codec.dequeueInputBuffer(10_000);
                    if (inIndex >= 0) {
                        ByteBuffer inBuf = codec.getInputBuffer(inIndex);
                        int size = extractor.readSampleData(inBuf, 0);
                        if (size < 0) {
                            codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inputDone = true;
                        } else {
                            codec.queueInputBuffer(inIndex, 0, size, extractor.getSampleTime(), 0);
                            extractor.advance();
                        }
                    }
                }
                int outIndex = codec.dequeueOutputBuffer(info, 10_000);
                if (outIndex >= 0) {
                    ByteBuffer outBuf = codec.getOutputBuffer(outIndex);
                    if (outBuf != null) {
                        outBuf.position(info.offset);
                        outBuf.limit(info.offset + info.size);
                        if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0 && info.size > 0) {
                            byte[] pcm = new byte[info.size];
                            outBuf.get(pcm);
                            writer.write(pcm);
                        }
                    }
                    codec.releaseOutputBuffer(outIndex, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        outputDone = true;
                    }
                } else if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat outFormat = codec.getOutputFormat();
                    int srcRate = outFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)
                        ? outFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE) : targetRate;
                    int srcChannels = outFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
                        ? outFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : TARGET_CHANNELS;
                    writer.configure(srcRate, srcChannels, targetRate);
                }
            }
            writer.finish();
            return writer.getPaths();
        } finally {
            if (codec != null) {
                try {
                    codec.stop();
                } catch (Exception ignored) {
                }
                codec.release();
            }
            extractor.release();
        }
    }

    private static int findAudioTrack(MediaExtractor extractor) {
        for (int i = 0; i < extractor.getTrackCount(); i++) {
            MediaFormat format = extractor.getTrackFormat(i);
            String mime = format.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) {
                return i;
            }
        }
        return -1;
    }

    /** PCM → 下混/重采样 → 分片 WAV 写入器 */
    private static final class ChunkWriter {
        private final File outDir;
        private final int targetRate;
        private final int segmentSeconds;
        private final List<String> paths = new ArrayList<>();

        private int srcRate = 16000;
        private int srcChannels = 1;
        private int targetRateActual = 16000;
        /** 下一个输出采样对应的源采样位置（全局，跨解码 buffer 连续推进） */
        private double nextOutSrcPos = 0.0;
        /** 已消费的源采样帧数（跨解码 buffer 累计） */
        private long totalSrcFrames = 0;
        private long totalSamples = 0;
        private FileOutputStream current;
        private File currentFile;
        private int currentSampleCount = 0;
        private boolean configured = false;

        ChunkWriter(File outDir, int targetRate, int segmentSeconds) {
            this.outDir = outDir;
            this.targetRate = targetRate;
            this.segmentSeconds = segmentSeconds;
            this.targetRateActual = targetRate;
        }

        void configure(int srcRate, int srcChannels, int targetRate) {
            this.srcRate = srcRate > 0 ? srcRate : targetRate;
            this.srcChannels = srcChannels > 0 ? srcChannels : 1;
            this.targetRateActual = targetRate > 0 ? targetRate : this.targetRate;
            this.configured = true;
        }

        /**
         * 输入：解码后的 PCM（源采样率/声道，16-bit LE）。
         * 以「全局源帧游标」驱动重采样：nextOutSrcPos 持续指向下一个输出采样
         * 应取的源位置，跨 buffer 不重置——修复早期实现用单 buffer 索引比较
         * 全局游标导致首个解码 buffer 后全部音频被丢弃的问题。
         */
        void write(byte[] pcm) throws IOException {
            ensureChunk();
            ByteBuffer bb = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN);
            int frames = pcm.length / 2;
            for (int i = 0; i < frames; i++) {
                long globalSrc = totalSrcFrames + i;
                while (nextOutSrcPos <= globalSrc) {
                    int localIdx = (int) (nextOutSrcPos - totalSrcFrames);
                    localIdx = Math.max(0, Math.min(localIdx, frames - 1));
                    int sample;
                    if (srcRate == targetRateActual) {
                        sample = readSample(bb, localIdx, srcChannels);
                    } else {
                        double frac = nextOutSrcPos - Math.floor(nextOutSrcPos);
                        int s0 = readSample(bb, localIdx, srcChannels);
                        int s1 = readSample(bb, Math.min(localIdx + 1, frames - 1), srcChannels);
                        sample = (int) (s0 + (s1 - s0) * frac);
                    }
                    writeSample(sample);
                    nextOutSrcPos += (double) targetRateActual / srcRate;
                }
            }
            totalSrcFrames += frames;
        }

        private int readSample(ByteBuffer bb, int frame, int channels) {
            int sum = 0;
            for (int c = 0; c < channels; c++) {
                int pos = frame * channels + c;
                sum += bb.getShort(pos * 2);
            }
            return sum / channels; // 下混平均
        }

        private void writeSample(int sample) throws IOException {
            current.write((byte) (sample & 0xFF));
            current.write((byte) ((sample >> 8) & 0xFF));
            currentSampleCount++;
            totalSamples++;
            if (currentSampleCount >= targetRateActual * segmentSeconds) {
                rotateChunk();
            }
        }

        private void ensureChunk() throws IOException {
            if (current == null) {
                currentFile = new File(outDir, "chunk-" + System.currentTimeMillis() + "-" + paths.size() + ".wav");
                current = new FileOutputStream(currentFile);
                // 先写 44 字节 WAV 头占位，finish/rotate 时回填
                current.write(new byte[44]);
            }
        }

        private void rotateChunk() throws IOException {
            if (current == null) return;
            current.flush();
            current.close();
            writeWavHeader(currentFile, currentSampleCount, targetRateActual);
            paths.add(currentFile.getAbsolutePath());
            current = null;
            currentSampleCount = 0;
        }

        void finish() throws IOException {
            if (current != null) {
                rotateChunk();
            }
        }

        List<String> getPaths() {
            return paths;
        }
    }

    /** 覆盖写前 44 字节回填标准 RIFF/WAVE 头（16-bit PCM，单声道），不截断已写入的数据 */
    private static void writeWavHeader(File file, int sampleCount, int sampleRate) throws IOException {
        int dataSize = sampleCount * 2;
        int byteRate = sampleRate * 2;
        ByteBuffer h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        h.put("RIFF".getBytes("US-ASCII"));
        h.putInt(36 + dataSize);
        h.put("WAVE".getBytes("US-ASCII"));
        h.put("fmt ".getBytes("US-ASCII"));
        h.putInt(16);
        h.putShort((short) 1);          // PCM
        h.putShort((short) 1);          // 单声道
        h.putInt(sampleRate);
        h.putInt(byteRate);
        h.putShort((short) 2);          // block align
        h.putShort((short) 16);         // bits per sample
        h.put("data".getBytes("US-ASCII"));
        h.putInt(dataSize);
        try (java.io.RandomAccessFile raf = new java.io.RandomAccessFile(file, "rw")) {
            raf.write(h.array());
        }
    }
}
