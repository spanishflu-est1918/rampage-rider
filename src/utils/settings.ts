/**
 * Settings persistence via localStorage
 */

import { MobileControlScheme } from '../input/MobileInputManager';

const STORAGE_KEY = 'cmm-settings';

export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  mobileScheme: MobileControlScheme;
}

const DEFAULT_SETTINGS: GameSettings = {
  musicVolume: 0.7,
  sfxVolume: 1.0,
  muted: false,
  mobileScheme: 'hybrid',
};

export function loadSettings(): GameSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Partial<GameSettings>): void {
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

export function saveSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
  saveSettings({ [key]: value });
}
