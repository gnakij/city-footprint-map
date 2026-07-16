import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { ACHIEVEMENTS } from '../data/achievements';
import { CITIES } from '../data/cities';
import type { VisitRecord } from '../types';
import { visitDays } from '../utils/date';
import { byLastStayDesc, checkAchievements, loadUserData, nowIso } from './helpers';
import { createSessionSlice } from './slices/session';
import { createUiSlice } from './slices/ui';
import { createUsersSlice } from './slices/users';
import type { StoreState } from './types';
import {
  bulkSaveVisits,
  clearAllData,
  createVisit,
  deleteVisit as dbDeleteVisit,
  exportAll,
  importAll,
  saveSettings,
  updateVisit,
  getSystemStats as apiGetSystemStats,
} from './api';

export const useStore = create<StoreState>((set, get) => ({
  visits: [], achievements: [], settings: { theme: 'rose' },
  ...createSessionSlice(set, get),
  ...createUiSlice(set),
  ...createUsersSlice(set, get),

  /**
   * 保存一条停留记录（粗粒度模型）。
   * 不再校验「时间区间是否重叠」——同一城市允许多条独立记录，
   * 例如老家记一条、大学城市记一条，互不冲突。
   */
  saveVisit: async (city, input) => {
    const state = get();
    if (!state.currentUser) { set({ toast: { icon: '!', message: '请先登录或选择用户' } }); return false; }
    if (!input.last_stay_date) { set({ toast: { icon: '!', message: '请填写最后停留日期' } }); return false; }
    if (!Number.isFinite(input.duration_days) || input.duration_days < 1) {
      set({ toast: { icon: '!', message: '停留天数至少为 1 天' } });
      return false;
    }
    const existing = input.id ? state.visits.find((record) => record.id === input.id) : undefined;
    const now = nowIso();
    const record = {
      city_id: city.city_id,
      duration_days: Math.floor(input.duration_days),
      last_stay_date: input.last_stay_date,
      notes: input.notes?.trim() || undefined,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    try {
      const saved = existing
        ? await updateVisit(state.currentUser.id, existing.id, record)
        : await createVisit(state.currentUser.id, record);
      const visits = [saved, ...state.visits.filter((item) => item.id !== input.id && item.id !== saved.id)].sort(byLastStayDesc);
      const checked = await checkAchievements(state.currentUser.id, visits, state.achievements);
      const unlocked = checked.newly[0] ? ACHIEVEMENTS.find((item) => item.id === checked.newly[0]) : undefined;
      set({ visits, achievements: checked.achievements, drawerOpen: false, selectedCity: undefined, previewCity: undefined, toast: unlocked ? { icon: unlocked.icon, message: `解锁成就：${unlocked.name}` } : { icon: '✓', message: '访问记录已保存' } });
      return true;
    } catch (err) {
      set({ toast: { icon: '!', message: err instanceof Error ? err.message : '访问记录保存失败' } });
      return false;
    }
  },

  bulkCreateVisits: async (records) => {
    const state = get();
    if (!state.currentUser) { set({ toast: { icon: '!', message: '请先登录或选择用户' } }); return; }
    const now = nowIso();
    const visits: VisitRecord[] = records.map((record) => ({ id: uuid(), created_at: now, updated_at: now, ...record, notes: record.notes?.trim() || undefined }));
    const saved = await bulkSaveVisits(state.currentUser.id, visits);
    const next = [...saved, ...state.visits].sort(byLastStayDesc);
    const checked = await checkAchievements(state.currentUser.id, next, state.achievements);
    set({ visits: next, achievements: checked.achievements, toast: { icon: '✓', message: `已导入 ${visits.length} 条访问记录` } });
  },

  deleteVisit: async (id) => {
    const state = get();
    if (!state.currentUser) return;
    await dbDeleteVisit(state.currentUser.id, id);
    set({ visits: state.visits.filter((record) => record.id !== id), toast: { icon: '✓', message: '记录已删除' } });
  },

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
