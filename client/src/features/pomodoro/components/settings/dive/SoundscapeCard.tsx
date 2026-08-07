/**
 * SoundscapeCard — 水下声景（音效设置卡）
 *
 * 覆盖原 AudioSettings 全部 7 项：白噪音开关/轨道/音量、BGM 开关/轨道/音量、设备类型。
 * 偏好直接读写全局音频 store（audioPrefsStore），即改即存。
 *
 * @ai-context: 深潜设置页改造——水下声景卡，主题化文案。
 */
import { Music, Volume2 } from 'lucide-react';
import { audioTracks, DEVICE_TYPE_LABELS, type AudioDeviceType } from '@/lib/audio/audioConfig';
import { useAudioPrefsStore } from '@/lib/audio/audioPrefsStore';
import { SettingRow, Toggle } from '../shared';

export function SoundscapeCard() {
  const audioPrefs = useAudioPrefsStore();

  return (
    <div className="rounded-kb-lg border border-border/40 bg-bg-secondary/60 p-kb-md">
      <div className="flex items-center gap-2 mb-kb-sm">
        <Music className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
        <h2 className="text-h3 font-medium text-text-primary">水下声景</h2>
      </div>

      <div className="divide-y divide-border/30">
        <SettingRow label="白噪音" description="专注阶段自动播放白噪音">
          <Toggle
            checked={audioPrefs.whiteNoiseEnabled}
            onChange={audioPrefs.toggleWhiteNoise}
          />
        </SettingRow>
        <SettingRow label="白噪音轨道" description="选择水下声景">
          <select
            value={audioPrefs.whiteNoiseTrackId}
            onChange={(e) => audioPrefs.setWhiteNoiseTrack(e.target.value)}
            className="bg-bg-tertiary border border-border/50 rounded-kb-md px-2 py-1 text-b2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          >
            {audioTracks.filter((t) => t.category === 'white_noise').map((t) => (
              <option key={t.id} value={t.id}>{t.nameZh}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="白噪音音量" description="调整白噪音音量">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-text-tertiary" strokeWidth={1.5} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioPrefs.whiteNoiseVolume}
              onChange={(e) => audioPrefs.setWhiteNoiseVolume(parseFloat(e.target.value))}
              className="w-24 h-1 accent-brand-500 cursor-pointer"
            />
          </div>
        </SettingRow>
        <SettingRow label="背景音乐" description="专注阶段播放轻音乐">
          <Toggle
            checked={audioPrefs.bgmEnabled}
            onChange={audioPrefs.toggleBgm}
          />
        </SettingRow>
        <SettingRow label="背景音乐轨道" description="选择背景音乐">
          <select
            value={audioPrefs.bgmTrackId}
            onChange={(e) => audioPrefs.setBgmTrack(e.target.value)}
            className="bg-bg-tertiary border border-border/50 rounded-kb-md px-2 py-1 text-b2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          >
            {audioTracks.filter((t) => t.category === 'bgm').map((t) => (
              <option key={t.id} value={t.id}>{t.nameZh}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="背景音乐音量" description="调整背景音乐音量">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-text-tertiary" strokeWidth={1.5} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioPrefs.bgmVolume}
              onChange={(e) => audioPrefs.setBgmVolume(parseFloat(e.target.value))}
              className="w-24 h-1 accent-brand-500 cursor-pointer"
            />
          </div>
        </SettingRow>
        <SettingRow label="音频输出设备" description="选择当前输出设备，音量估算更准确">
          <select
            value={audioPrefs.deviceType}
            onChange={(e) => audioPrefs.setDeviceType(e.target.value as AudioDeviceType)}
            className="bg-bg-tertiary border border-border/50 rounded-kb-md px-2 py-1 text-b2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          >
            {(Object.keys(DEVICE_TYPE_LABELS) as AudioDeviceType[]).map((type) => (
              <option key={type} value={type}>{DEVICE_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </SettingRow>
      </div>
    </div>
  );
}