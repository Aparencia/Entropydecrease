// Chromium 架构声源（Phase 1 spike 验证用）
//
// @ai-context: Electron 与 Chrome/Edge 同为 Chromium 多进程架构——音频由
// browser process 派生的 audio service utility 进程播放。用它当声源即可
// 等价验证"进程树模式能否覆盖浏览器的发声子进程"这一网课场景成败点。
// @ai-context: 必须自报播放状态——否则"采到 0"无法区分是采集失败还是
// 声源没响（实验设计自证伪优先于怀疑被测对象）。

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// Windows 上 Electron 的 console.log 不会传到父进程 stdout，故状态写文件
const STATE_FILE = path.join(__dirname, '..', '.source-state.json');
const writeState = (obj) => {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ at: Date.now(), ...obj }), 'utf-8');
  } catch { /* 忽略写入失败 */ }
};

// 无用户手势场景下强制允许自动播放（否则 Chromium autoplay 策略会拦截）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  writeState({ stage: 'ready' });

  // show: true 避免后台窗口被 Chromium 节流导致音频暂停
  const win = new BrowserWindow({
    width: 320,
    height: 200,
    show: true,
    webPreferences: { backgroundThrottling: false },
  });

  win.webContents.on('did-fail-load', (_e, code, desc) => {
    writeState({ stage: 'load-failed', code, desc });
  });

  try {
    await win.loadFile(path.join(__dirname, 'index.html'));
    writeState({ stage: 'loaded' });
  } catch (err) {
    writeState({ stage: 'load-throw', message: String(err) });
  }

  // 每秒自报播放状态，供 spike 脚本判断声源是否有效
  setInterval(async () => {
    try {
      const state = await win.webContents.executeJavaScript(`
        (() => {
          const a = document.querySelector('audio');
          if (!a) return { found: false };
          return {
            found: true,
            paused: a.paused,
            currentTime: Number(a.currentTime.toFixed(2)),
            readyState: a.readyState,
            error: a.error ? a.error.code : null,
            muted: a.muted,
            volume: a.volume,
            src: a.currentSrc,
          };
        })()
      `);
      writeState({ stage: 'playing-check', ...state });
    } catch (err) {
      writeState({ stage: 'check-failed', message: String(err) });
    }
  }, 1000);
});
