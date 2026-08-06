/**
 * 深潜设置页 — 音效设置区块（白噪音 / BGM）
 *
 * @ai-context: 从 PomodoroSettingsPage 拆分。偏好直接读写全局音频 store
 * （useAudioPrefsStore），播放器在全局层 PomodoroAudioLayer。
 */
import { Music, Volume2 } from 'lucide-react';
import { Card } from '@/components/ui';
import { audioTracks } from '@/lib/audio/audioConfig';
import { useAudioPrefsStore } from '@/lib/audio/audioPrefsStore';
import { SettingsBlock, SettingRow, Toggle } from './shared';

export function AudioSettings() {
  const audioPrefs = useAudioPrefsStore();

  return (
    <SettingsBlock className="mb-kb-xl">
      <Card variant="default" padding="lg">
        <div className="flex items-center gap-2 mb-kb-sm">
          <Music className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">音效设置</h2>
        </div>

        {/* 白噪音 */}
        <div className="divide-y divide-border/30">
          <SettingRow label="白噪音" description="工作阶段自动播放白噪音">
            <Toggle
              checked={audioPrefs.whiteNoiseEnabled}
              onChange={audioPrefs.toggleWhiteNoise}
            />
          </SettingRow>

          <SettingRow label="白噪音轨道" description="选择背景音效">
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

          {/* 背景音乐 */}
          <SettingRow label="背景音乐" description="工作阶段播放轻音乐">
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
        </div>
      </Card>
    </SettingsBlock>
  );
}
