import { create } from 'zustand';
import { CITIES } from '../data/cities';
import { visitDays } from '../utils/date';
import { loadUserData } from './helpers';
import { createSessionSlice } from './slices/session';
import { createUiSlice } from './slices/ui';
import { createUsersSlice } from './slices/users';
import { createVisitsSlice } from './slices/visits';
import type { StoreState } from './types';
import {
  clearAllData,
  exportAll,
  importAll,
  saveSettings,
  getSystemStats as apiGetSystemStats,
} from './api';

export const useStore = create<StoreState>((set, get) => ({
  settings: { theme: 'rose' },
  ...createSessionSlice(set, get),
  ...createUiSlice(set),
  ...createUsersSlice(set, get),
  ...createVisitsSlice(set, get),

  updateSettings: async (settings) => {
    const state = get();
    if (!state.currentUser) return;
    await saveSettings(state.currentUser.id, settings);
    document.documentElement.dataset.theme = settings.theme;
    set({ settings });
  },

  exportBackup: async () => {
    const state = get();
    if (!state.currentUser) return '{}';
    return JSON.stringify(await exportAll(state.currentUser.id), null, 2);
  },

  importBackup: async (data) => {
    const state = get();
    if (!state.currentUser) { set({ toast: { icon: '!', message: '请先登录或选择用户' } }); return; }
    await importAll(state.currentUser.id, data);
    const loaded = await loadUserData(state.currentUser);
    set({ ...loaded, toast: { icon: '✓', message: '数据已导入' } });
  },

  clearData: async () => {
    const state = get();
    if (!state.currentUser) return;
    await clearAllData(state.currentUser.id);
    set({ visits: [], achievements: [], selectedCity: undefined, drawerOpen: false, toast: { icon: '✓', message: '数据已清空' } });
  },

  getStats: () => {
    const visits = get().visits;
    const litIds = new Set(visits.map((record) => record.city_id));
    const provinces = new Set(CITIES.filter((city) => litIds.has(city.city_id)).map((city) => city.province));
    const totalDays = visits.reduce((sum, record) => sum + visitDays(record), 0);
    return { litCount: litIds.size, totalCities: CITIES.length, provinceCount: provinces.size, totalDays, visitCount: visits.length, coverage: Number(((litIds.size / CITIES.length) * 100).toFixed(1)) };
  },

  getSystemStats: async () => {
    return apiGetSystemStats();
  },
}));
