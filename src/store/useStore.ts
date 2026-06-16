import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { ACHIEVEMENTS } from '../data/achievements';
import { CITIES } from '../data/cities';
import type { AppSettings, CityData, DepartureRecord, DurationRecord, RecordMode, Stats } from '../types';
import {
  clearAllData,
  deleteRecord as dbDeleteRecord,
  exportAll,
  getAchievements,
  getAllDeparture,
  getAllDuration,
  getSettings,
  importAll,
  saveRecord as dbSaveRecord,
  saveSettings,
  unlockAchievement,
} from './db';

interface ToastState {
  message: string;
  icon?: string;
}

interface StoreState {
  mode: RecordMode;
  selectedCity?: CityData;
  previewCity?: CityData;
  durationRecords: DurationRecord[];
  departureRecords: DepartureRecord[];
  achievements: string[];
  settings: AppSettings;
  drawerOpen: boolean;
  searchQuery: string;
  posterOpen: boolean;
  settingsOpen: boolean;
  toast?: ToastState;
  hydrated: boolean;
  load: () => Promise<void>;
  setMode: (mode: RecordMode) => Promise<void>;
  setSelectedCity: (city?: CityData) => void;
  setPreviewCity: (city?: CityData) => void;
  setDrawerOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setPosterOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  showToast: (toast: ToastState) => void;
  hideToast: () => void;
  saveDuration: (city: CityData, days: number) => Promise<void>;
  saveDeparture: (city: CityData, departureDate: string) => Promise<void>;
  deleteCityRecord: (city: CityData) => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  exportBackup: () => Promise<string>;
  importBackup: (data: Parameters<typeof importAll>[0]) => Promise<void>;
  clearData: () => Promise<void>;
  getStats: () => Stats;
}

const todayIso = () => new Date().toISOString();

function allRecords(state: Pick<StoreState, 'durationRecords' | 'departureRecords'>) {
  return [...state.durationRecords, ...state.departureRecords];
}

async function checkAchievements(records: Array<DurationRecord | DepartureRecord>, unlocked: string[]) {
  const next = new Set(unlocked);
  const newly: string[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (!next.has(achievement.id) && achievement.check(records, CITIES)) {
      next.add(achievement.id);
      newly.push(achievement.id);
      await unlockAchievement(achievement.id);
    }
  }
  return { achievements: [...next], newly };
}

export const useStore = create<StoreState>((set, get) => ({
  mode: 'duration',
  durationRecords: [],
  departureRecords: [],
  achievements: [],
  settings: { theme: 'light', defaultMode: 'duration' },
  drawerOpen: false,
  searchQuery: '',
  posterOpen: false,
  settingsOpen: false,
  hydrated: false,

  load: async () => {
    const [durationRecords, departureRecords, achievements, settings] = await Promise.all([
      getAllDuration(),
      getAllDeparture(),
      getAchievements(),
      getSettings(),
    ]);
    document.documentElement.dataset.theme = settings.theme;
    set({
      durationRecords,
      departureRecords,
      achievements: achievements.map((item) => item.id),
      settings,
      mode: settings.defaultMode,
      hydrated: true,
    });
  },

  setMode: async (mode) => {
    const settings = { ...get().settings, defaultMode: mode };
    await saveSettings(settings);
    set({ mode, settings, previewCity: undefined });
  },
  setSelectedCity: (selectedCity) => set({ selectedCity, drawerOpen: Boolean(selectedCity) }),
  setPreviewCity: (previewCity) => set({ previewCity }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setPosterOpen: (posterOpen) => set({ posterOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: undefined }),

  saveDuration: async (city, days) => {
    const existing = get().durationRecords.find((record) => record.city_id === city.city_id);
    const now = todayIso();
    const record: DurationRecord = {
      id: existing?.id ?? uuid(),
      city_id: city.city_id,
      days,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await dbSaveRecord(record);
    const durationRecords = [record, ...get().durationRecords.filter((item) => item.city_id !== city.city_id)];
    const checked = await checkAchievements([...durationRecords, ...get().departureRecords], get().achievements);
    const unlocked = checked.newly[0] ? ACHIEVEMENTS.find((item) => item.id === checked.newly[0]) : undefined;
    set({
      durationRecords,
      achievements: checked.achievements,
      drawerOpen: false,
      selectedCity: undefined,
      previewCity: undefined,
      toast: unlocked ? { icon: unlocked.icon, message: `解锁成就：${unlocked.name}` } : { icon: '✓', message: '足迹已保存' },
    });
  },

  saveDeparture: async (city, departureDate) => {
    const existing = get().departureRecords.find((record) => record.city_id === city.city_id);
    const now = todayIso();
    const record: DepartureRecord = {
      id: existing?.id ?? uuid(),
      city_id: city.city_id,
      departure_date: departureDate,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await dbSaveRecord(record);
    const departureRecords = [record, ...get().departureRecords.filter((item) => item.city_id !== city.city_id)];
    const checked = await checkAchievements([...get().durationRecords, ...departureRecords], get().achievements);
    const unlocked = checked.newly[0] ? ACHIEVEMENTS.find((item) => item.id === checked.newly[0]) : undefined;
    set({
      departureRecords,
      achievements: checked.achievements,
      drawerOpen: false,
      selectedCity: undefined,
      previewCity: undefined,
      toast: unlocked ? { icon: unlocked.icon, message: `解锁成就：${unlocked.name}` } : { icon: '✓', message: '足迹已保存' },
    });
  },

  deleteCityRecord: async (city) => {
    const { mode } = get();
    const list = mode === 'duration' ? get().durationRecords : get().departureRecords;
    const existing = list.find((record) => record.city_id === city.city_id);
    if (!existing) return;
    await dbDeleteRecord(existing.id, mode);
    if (mode === 'duration') {
      set({ durationRecords: get().durationRecords.filter((record) => record.id !== existing.id), drawerOpen: false, toast: { icon: '✓', message: '记录已清除' } });
    } else {
      set({ departureRecords: get().departureRecords.filter((record) => record.id !== existing.id), drawerOpen: false, toast: { icon: '✓', message: '记录已清除' } });
    }
  },

  updateSettings: async (settings) => {
    await saveSettings(settings);
    document.documentElement.dataset.theme = settings.theme;
    set({ settings, mode: settings.defaultMode });
  },

  exportBackup: async () => JSON.stringify(await exportAll(), null, 2),

  importBackup: async (data) => {
    await importAll(data);
    await get().load();
    set({ toast: { icon: '✓', message: '数据已导入' } });
  },

  clearData: async () => {
    await clearAllData();
    set({ durationRecords: [], departureRecords: [], achievements: [], selectedCity: undefined, drawerOpen: false, toast: { icon: '✓', message: '数据已清空' } });
  },

  getStats: () => {
    const records = allRecords(get());
    const litIds = new Set(records.map((record) => record.city_id));
    const provinces = new Set(CITIES.filter((city) => litIds.has(city.city_id)).map((city) => city.province));
    const totalDays = get().durationRecords.reduce((sum, record) => sum + record.days, 0);
    const litCount = litIds.size;
    return {
      litCount,
      totalCities: CITIES.length,
      provinceCount: provinces.size,
      totalDays,
      coverage: Number(((litCount / CITIES.length) * 100).toFixed(1)),
    };
  },
}));
