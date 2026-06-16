import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { ACHIEVEMENTS } from '../data/achievements';
import { CITIES } from '../data/cities';
import type { AppSettings, CityData, DepartureRecord, DurationRecord, RecordMode, Stats, User } from '../types';
import {
  clearAllData,
  createUser,
  deleteRecord as dbDeleteRecord,
  deleteUser,
  exportAll,
  getAchievements,
  getAllDeparture,
  getAllDuration,
  getSettings,
  getUsers,
  importAll,
  saveRecord as dbSaveRecord,
  saveSettings,
  unlockAchievement,
} from './db';

interface ToastState { message: string; icon?: string; }

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
  currentUser: User | null;
  users: User[];
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
  importBackup: (data: Parameters<typeof importAll>[1]) => Promise<void>;
  clearData: () => Promise<void>;
  getStats: () => Stats;
  createUserAndSwitch: (name: string) => Promise<void>;
  switchUser: (user: User) => Promise<void>;
  deleteUserAndReset: (id: string) => Promise<void>;
}

const todayIso = () => new Date().toISOString();

function allRecords(state: Pick<StoreState, 'durationRecords' | 'departureRecords'>) {
  return [...state.durationRecords, ...state.departureRecords];
}

function uid(state: StoreState) {
  if (!state.currentUser) throw new Error('no user');
  return state.currentUser.id;
}

async function checkAchievements(uid: string, records: Array<DurationRecord | DepartureRecord>, unlocked: string[]) {
  const next = new Set(unlocked);
  const newly: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!next.has(a.id) && a.check(records, CITIES)) {
      next.add(a.id); newly.push(a.id);
      await unlockAchievement(uid, a.id);
    }
  }
  return { achievements: [...next], newly };
}

export const useStore = create<StoreState>((set, get) => ({
  mode: 'duration', durationRecords: [], departureRecords: [], achievements: [],
  settings: { theme: 'light', defaultMode: 'duration' },
  drawerOpen: false, searchQuery: '', posterOpen: false, settingsOpen: false, hydrated: false,
  currentUser: null, users: [],

  load: async () => {
    const users = await getUsers();
    if (users.length === 0) { set({ users, hydrated: true }); return; }
    const user = users[0];
    const [dur, dep, ach, setts] = await Promise.all([getAllDuration(user.id), getAllDeparture(user.id), getAchievements(user.id), getSettings(user.id)]);
    document.documentElement.dataset.theme = setts.theme;
    set({ currentUser: user, users, durationRecords: dur, departureRecords: dep, achievements: ach.map(i => i.id), settings: setts, mode: setts.defaultMode, hydrated: true });
  },

  createUserAndSwitch: async (name) => {
    const user = await createUser(name);
    const [dur, dep, ach, setts] = await Promise.all([getAllDuration(user.id), getAllDeparture(user.id), getAchievements(user.id), getSettings(user.id)]);
    document.documentElement.dataset.theme = setts.theme;
    set({ currentUser: user, users: await getUsers(), durationRecords: dur, departureRecords: dep, achievements: ach.map(i => i.id), settings: setts, mode: setts.defaultMode, toast: { icon: '✓', message: `欢迎，${name}！` } });
  },

  switchUser: async (user) => {
    const [dur, dep, ach, setts] = await Promise.all([getAllDuration(user.id), getAllDeparture(user.id), getAchievements(user.id), getSettings(user.id)]);
    document.documentElement.dataset.theme = setts.theme;
    set({ currentUser: user, durationRecords: dur, departureRecords: dep, achievements: ach.map(i => i.id), settings: setts, mode: setts.defaultMode, previewCity: undefined, selectedCity: undefined, drawerOpen: false });
  },

  deleteUserAndReset: async (id) => {
    await deleteUser(id);
    const users = await getUsers();
    if (users.length === 0) { set({ users: [], currentUser: null, durationRecords: [], departureRecords: [], achievements: [], toast: { icon: '✓', message: '用户已删除' } }); return; }
    const user = users[0];
    const [dur, dep, ach, setts] = await Promise.all([getAllDuration(user.id), getAllDeparture(user.id), getAchievements(user.id), getSettings(user.id)]);
    document.documentElement.dataset.theme = setts.theme;
    set({ users, currentUser: user, durationRecords: dur, departureRecords: dep, achievements: ach.map(i => i.id), settings: setts, mode: setts.defaultMode });
  },

  setMode: async (mode) => {
    const state = get();
    if (!state.currentUser) return;
    const settings = { ...state.settings, defaultMode: mode };
    await saveSettings(state.currentUser.id, settings);
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
    const state = get();
    if (!state.currentUser) { set({ toast: { icon: '!', message: '请先选择用户' } }); return; }
    const existing = state.durationRecords.find(r => r.city_id === city.city_id);
    const now = todayIso();
    const record: DurationRecord = { id: existing?.id ?? uuid(), city_id: city.city_id, days, created_at: existing?.created_at ?? now, updated_at: now };
    await dbSaveRecord(state.currentUser.id, record);
    const dur = [record, ...state.durationRecords.filter(r => r.city_id !== city.city_id)];
    const checked = await checkAchievements(state.currentUser.id, [...dur, ...state.departureRecords], state.achievements);
    const unlocked = checked.newly[0] ? ACHIEVEMENTS.find(a => a.id === checked.newly[0]) : undefined;
    set({ durationRecords: dur, achievements: checked.achievements, drawerOpen: false, selectedCity: undefined, previewCity: undefined, toast: unlocked ? { icon: unlocked.icon, message: `解锁成就：${unlocked.name}` } : { icon: '✓', message: '足迹已保存' } });
  },

  saveDeparture: async (city, departureDate) => {
    const state = get();
    if (!state.currentUser) { set({ toast: { icon: '!', message: '请先选择用户' } }); return; }
    const existing = state.departureRecords.find(r => r.city_id === city.city_id);
    const now = todayIso();
    const record: DepartureRecord = { id: existing?.id ?? uuid(), city_id: city.city_id, departure_date: departureDate, created_at: existing?.created_at ?? now, updated_at: now };
    await dbSaveRecord(state.currentUser.id, record);
    const dep = [record, ...state.departureRecords.filter(r => r.city_id !== city.city_id)];
    const checked = await checkAchievements(state.currentUser.id, [...state.durationRecords, ...dep], state.achievements);
    const unlocked = checked.newly[0] ? ACHIEVEMENTS.find(a => a.id === checked.newly[0]) : undefined;
    set({ departureRecords: dep, achievements: checked.achievements, drawerOpen: false, selectedCity: undefined, previewCity: undefined, toast: unlocked ? { icon: unlocked.icon, message: `解锁成就：${unlocked.name}` } : { icon: '✓', message: '足迹已保存' } });
  },

  deleteCityRecord: async (city) => {
    const state = get();
    if (!state.currentUser) return;
    const list = state.mode === 'duration' ? state.durationRecords : state.departureRecords;
    const existing = list.find(r => r.city_id === city.city_id);
    if (!existing) return;
    await dbDeleteRecord(state.currentUser.id, existing.id, state.mode);
    if (state.mode === 'duration') set({ durationRecords: state.durationRecords.filter(r => r.id !== existing.id), drawerOpen: false, toast: { icon: '✓', message: '记录已清除' } });
    else set({ departureRecords: state.departureRecords.filter(r => r.id !== existing.id), drawerOpen: false, toast: { icon: '✓', message: '记录已清除' } });
  },

  updateSettings: async (settings) => {
    const state = get();
    if (!state.currentUser) return;
    await saveSettings(state.currentUser.id, settings);
    document.documentElement.dataset.theme = settings.theme;
    set({ settings, mode: settings.defaultMode });
  },

  exportBackup: async () => {
    const state = get();
    if (!state.currentUser) return '{}';
    return JSON.stringify(await exportAll(state.currentUser.id), null, 2);
  },

  importBackup: async (data) => {
    const state = get();
    if (!state.currentUser) { set({ toast: { icon: '!', message: '请先选择用户' } }); return; }
    await importAll(state.currentUser.id, data);
    await get().load();
    set({ toast: { icon: '✓', message: '数据已导入' } });
  },

  clearData: async () => {
    const state = get();
    if (!state.currentUser) return;
    await clearAllData(state.currentUser.id);
    set({ durationRecords: [], departureRecords: [], achievements: [], selectedCity: undefined, drawerOpen: false, toast: { icon: '✓', message: '数据已清空' } });
  },

  getStats: () => {
    const records = allRecords(get());
    const litIds = new Set(records.map(r => r.city_id));
    const provinces = new Set(CITIES.filter(c => litIds.has(c.city_id)).map(c => c.province));
    const totalDays = get().durationRecords.reduce((sum, r) => sum + r.days, 0);
    return { litCount: litIds.size, totalCities: CITIES.length, provinceCount: provinces.size, totalDays, coverage: Number(((litIds.size / CITIES.length) * 100).toFixed(1)) };
  },
}));
