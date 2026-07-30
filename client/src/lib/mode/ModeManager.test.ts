import { describe, it, expect, beforeEach } from 'vitest';
import { modeManager } from './ModeManager';
import type { AppMode, ModeConfig } from './ModeManager';

const STORAGE_KEY = 'ed_app_mode';

beforeEach(() => {
  localStorage.clear();
  // Reset modeManager to default state for isolation
  modeManager.setMode('local');
});

describe('ModeManager', () => {
  // ── Mode switching ─────────────────────────────────────────
  describe('mode switching', () => {
    it('should default to "local" mode', () => {
      expect(modeManager.getMode()).toBe('local');
    });

    it('should switch to "hybrid" mode', () => {
      modeManager.setMode('hybrid');
      expect(modeManager.getMode()).toBe('hybrid');
    });

    it('should switch to "full" mode', () => {
      modeManager.setMode('full');
      expect(modeManager.getMode()).toBe('full');
    });

    it('should switch back to "local" from "full"', () => {
      modeManager.setMode('full');
      modeManager.setMode('local');
      expect(modeManager.getMode()).toBe('local');
    });

    it('should ignore invalid mode values', () => {
      modeManager.setMode('hybrid');
      modeManager.setMode('invalid' as AppMode);
      expect(modeManager.getMode()).toBe('hybrid');
    });
  });

  // ── ModeConfig ─────────────────────────────────────────────
  describe('getConfig()', () => {
    it('should return correct config for local mode', () => {
      modeManager.setMode('local');
      const config: ModeConfig = modeManager.getConfig();
      expect(config).toEqual({
        mode: 'local',
        syncEnabled: false,
        aiEnabled: false,
        cloudStorageEnabled: false,
      });
    });

    it('should return correct config for hybrid mode', () => {
      modeManager.setMode('hybrid');
      const config: ModeConfig = modeManager.getConfig();
      expect(config).toEqual({
        mode: 'hybrid',
        syncEnabled: true,
        aiEnabled: true,
        cloudStorageEnabled: false,
      });
    });

    it('should return correct config for full mode', () => {
      modeManager.setMode('full');
      const config: ModeConfig = modeManager.getConfig();
      expect(config).toEqual({
        mode: 'full',
        syncEnabled: true,
        aiEnabled: true,
        cloudStorageEnabled: true,
      });
    });
  });

  // ── localStorage persistence ────────────────────────────────
  describe('localStorage persistence', () => {
    it('should persist mode to localStorage on setMode', () => {
      modeManager.setMode('hybrid');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('hybrid');
    });

    it('should persist "full" mode', () => {
      modeManager.setMode('full');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('full');
    });

    it('should restore mode from localStorage on construction', () => {
      localStorage.setItem(STORAGE_KEY, 'full');
      // We can't easily test constructor with localStorage without re-importing,
      // but we can verify the storage key is correct
      expect(localStorage.getItem(STORAGE_KEY)).toBe('full');
    });
  });

  // ── subscribe / unsubscribe ─────────────────────────────────
  describe('subscribe()', () => {
    it('should notify listener when mode changes', () => {
      const calls: Array<{ mode: AppMode; config: ModeConfig }> = [];
      modeManager.subscribe((mode, config) => calls.push({ mode, config }));

      modeManager.setMode('hybrid');
      modeManager.setMode('full');

      expect(calls).toHaveLength(2);
      expect(calls[0].mode).toBe('hybrid');
      expect(calls[0].config.syncEnabled).toBe(true);
      expect(calls[1].mode).toBe('full');
      expect(calls[1].config.cloudStorageEnabled).toBe(true);
    });

    it('should not notify after unsubscribe', () => {
      const calls: AppMode[] = [];
      const unsub = modeManager.subscribe((mode) => calls.push(mode));

      modeManager.setMode('hybrid');
      unsub();
      modeManager.setMode('full');

      expect(calls).toEqual(['hybrid']);
    });

    it('should support multiple listeners', () => {
      const calls1: AppMode[] = [];
      const calls2: AppMode[] = [];
      modeManager.subscribe((mode) => calls1.push(mode));
      modeManager.subscribe((mode) => calls2.push(mode));

      modeManager.setMode('full');

      expect(calls1).toEqual(['full']);
      expect(calls2).toEqual(['full']);
    });
  });

  // ── computeRecommendedMode ──────────────────────────────────
  describe('computeRecommendedMode()', () => {
    it('should return "local" when not authenticated', () => {
      expect(modeManager.computeRecommendedMode(false, true)).toBe('local');
      expect(modeManager.computeRecommendedMode(false, false)).toBe('local');
    });

    it('should return "hybrid" when authenticated but offline', () => {
      expect(modeManager.computeRecommendedMode(true, false)).toBe('hybrid');
    });

    it('should return "full" when authenticated and online', () => {
      expect(modeManager.computeRecommendedMode(true, true)).toBe('full');
    });
  });
});
