package com.entropydecrease.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * 熵减 — Android 入口
 *
 * @ai-context: 注册自定义原生插件 EntropyCapturePlugin（录屏/视频选取/音频
 * 抽取/本地流式 ASR），须在 super.onCreate 之前调用。
 * @ai-context EN: register the custom native plugin before super.onCreate.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EntropyCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
