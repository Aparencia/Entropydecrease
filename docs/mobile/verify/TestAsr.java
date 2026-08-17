/**
 * 本地 ASR 引擎桌面验证（JVM 版 sherpa-onnx，与 Android 端同模型/同解码链）
 *
 * 用途：无 Android 设备环境下，验证「流式 Zipformer 中文模型 + greedy_search
 * + 16kHz」本地转写链路真实可用。编译运行：
 *   javac -cp sherpa-onnx-jvm-1.13.5.jar TestAsr.java
 *   java -cp "sherpa-onnx-jvm-1.13.5.jar;sherpa-onnx-native-lib-win-x64-1.13.5.jar;." TestAsr <modelDir> <wav>
 */
import com.k2fsa.sherpa.onnx.FeatureConfig;
import com.k2fsa.sherpa.onnx.OnlineModelConfig;
import com.k2fsa.sherpa.onnx.OnlineRecognizer;
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OnlineStream;
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig;
import com.k2fsa.sherpa.onnx.WaveReader;

public class TestAsr {
    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("usage: TestAsr <modelDir> <wav>");
            System.exit(2);
        }
        String modelDir = args[0];
        String wavPath = args[1];

        OnlineRecognizerConfig config = OnlineRecognizerConfig.builder()
            .setFeatureConfig(FeatureConfig.builder().setSampleRate(16000).setFeatureDim(80).build())
            .setOnlineModelConfig(OnlineModelConfig.builder()
                .setTransducer(OnlineTransducerModelConfig.builder()
                    .setEncoder(modelDir + "/encoder.onnx")
                    .setDecoder(modelDir + "/decoder.onnx")
                    .setJoiner(modelDir + "/joiner.onnx")
                    .build())
                .setTokens(modelDir + "/tokens.txt")
                .setNumThreads(2)
                .setDebug(false)
                .build())
            .setDecodingMethod("greedy_search")
            .setEnableEndpoint(true)
            .build();

        long t0 = System.currentTimeMillis();
        OnlineRecognizer recognizer = new OnlineRecognizer(config);
        System.out.println("[init] " + (System.currentTimeMillis() - t0) + "ms");

        WaveReader reader = new WaveReader(wavPath);
        System.out.println("[wav] sampleRate=" + reader.getSampleRate() + " samples=" + reader.getSamples().length);

        OnlineStream stream = recognizer.createStream();
        stream.acceptWaveform(reader.getSamples(), reader.getSampleRate());
        stream.inputFinished();
        long t1 = System.currentTimeMillis();
        while (recognizer.isReady(stream)) {
            recognizer.decode(stream);
        }
        System.out.println("[decode] " + (System.currentTimeMillis() - t1) + "ms");
        System.out.println("RESULT: " + recognizer.getResult(stream).getText());
        stream.release();
        recognizer.release();
    }
}
