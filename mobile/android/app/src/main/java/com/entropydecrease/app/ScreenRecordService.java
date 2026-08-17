package com.entropydecrease.app;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Point;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.IOException;

/**
 * 熵减 — 录屏前台服务（MediaProjection + MediaRecorder）
 *
 * @ai-context: Android 14+（targetSdk 34+）强制要求录屏在前台服务中运行且
 * foregroundServiceType="mediaProjection"；MediaProjection 实例只能从
 * getMediaProjection() 获取一次，故由插件启动本服务并持有。
 * 音频策略：画面（VirtualDisplay）+ 麦克风人声（AudioSource.MIC）；
 * Android 10+ 无法可靠捕获第三方 App 播放音频（见 README 已知限制）。
 * @ai-context EN: screen-recording foreground service. Android 14+ requires
 * mediaProjection FGS type; the MediaProjection instance is obtained once
 * here. Audio = MIC only — capturing third-party app playback audio is
 * restricted on Android 10+.
 */
public class ScreenRecordService extends Service {

    private static final String TAG = "ScreenRecordService";
    public static final String ACTION_START = "com.entropydecrease.app.START_RECORD";
    public static final String ACTION_STOP = "com.entropydecrease.app.STOP_RECORD";
    private static final String CHANNEL_ID = "screen_record";
    private static final int NOTIFICATION_ID = 1001;

    /** 全局状态（插件/JS 查询用） */
    public static volatile boolean isRecording = false;
    public static volatile String lastOutputPath = null;

    private MediaProjection projection;
    private MediaRecorder recorder;
    private VirtualDisplay virtualDisplay;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_START.equals(action)) {
            int resultCode = intent.getIntExtra("resultCode", Activity.RESULT_CANCELED);
            Intent resultData = intent.getParcelableExtra("resultData");
            startRecording(resultCode, resultData);
        } else if (ACTION_STOP.equals(action)) {
            stopRecording();
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void startRecording(int resultCode, Intent resultData) {
        if (isRecording) return;
        try {
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection = mpm.getMediaProjection(resultCode, resultData);
            if (projection == null) {
                Log.e(TAG, "getMediaProjection returned null");
                stopSelf();
                return;
            }
            projection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    stopRecording();
                    stopSelf();
                }
            }, null);

            Point size = getScreenSize();
            File out = new File(EntropyCapturePlugin.mediaDir(this), "rec-" + System.currentTimeMillis() + ".mp4");
            lastOutputPath = out.getAbsolutePath();

            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
            recorder.setVideoSize(size.x, size.y);
            recorder.setVideoFrameRate(30);
            recorder.setVideoEncodingBitRate(4_000_000);
            recorder.setAudioEncodingBitRate(128_000);
            recorder.setAudioSamplingRate(44100);
            recorder.setOutputFile(out.getAbsolutePath());
            recorder.prepare();

            virtualDisplay = projection.createVirtualDisplay(
                "EntropyCapture",
                size.x,
                size.y,
                getResources().getDisplayMetrics().densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                recorder.getSurface(),
                null,
                null
            );

            recorder.start();
            isRecording = true;
            startAsForeground();
            Log.i(TAG, "Recording started -> " + out.getAbsolutePath());
        } catch (IOException | RuntimeException e) {
            Log.e(TAG, "startRecording failed", e);
            releaseResources();
            isRecording = false;
            stopSelf();
        }
    }

    private void stopRecording() {
        if (!isRecording) return;
        isRecording = false;
        releaseResources();
    }

    private void releaseResources() {
        try {
            if (recorder != null) {
                try {
                    recorder.stop();
                } catch (RuntimeException e) {
                    Log.w(TAG, "recorder.stop failed (short recording)", e);
                }
                recorder.reset();
                recorder.release();
                recorder = null;
            }
        } catch (Exception e) {
            Log.w(TAG, "release recorder failed", e);
        }
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (projection != null) {
            projection.stop();
            projection = null;
        }
    }

    private Point getScreenSize() {
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        Point size = new Point();
        wm.getDefaultDisplay().getRealSize(size);
        return size;
    }

    private void startAsForeground() {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("熵减 · 课堂采集")
            .setContentText("正在录制屏幕，点击停止按钮结束")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "课堂录屏",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("课堂助手录屏前台服务通知");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        releaseResources();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
