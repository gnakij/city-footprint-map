import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { ACHIEVEMENTS } from '../data/achievements';
import { CITIES } from '../data/cities';
import type { AppSettings, CityData, ExportData, Stats, User, VisitRecord } from '../types';
import { visitDays } from '../utils/date';
import {
  bulkSaveVisits,
  clearAllData,
  createUser,
  deleteUser,
  deleteVisit as dbDeleteVisit,
  exportAll,
  getAchievements,
  getAllVisits,
  getSettings,
  getUsers,
  hashPassword,
  importAll,
  saveSettings,
  saveVisit as dbSaveVisit,
  unlockAchievement,
  updateUser,
} from './db';

interface ToastState { message: string; icon?: string; }

interface StoreState {
  selectedCity?: CityData;
  previewCity?: CityData;
  visits: VisitRecord[];
  achievements: string[];
  settings: AppSettings;
  drawerOpen: boolean;
  searchQuery: string;
  posterOpen: boolean;
  settingsOpen: boolean;
  visitsOpen: boolean;
  adminOpen: boolean;
  statsOpen: boolean;
  toast?: ToastState;
  hydrated: boolean;
  currentUser: User | null;
  users: User[];
  adminSetupRequired: boolean;
  load: () => Promise<void>;
  setupAdmin: (username: string, password: string) => Promise<void>;
  loginAdmin: (username: string, password: string) => Promise<boolean>;
  switchUser: (user: User) => Promise<void>;
  logout: () => void;
  createRegularUser: (name: string) => Promise<User>;
  deleteUserAndData: (id: string) => Promise<void>;
  resetUserPassword: (id: string, password: string) => Promise<void>;
  setSelectedCity: (city?: CityData) => void;
  setPreviewCity: (city?: CityData) => void;
  setDrawerOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setPosterOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setVisitsOpen: (open: boolean) => void;
  setAdminOpen: (open: boolean) => void;
  setStatsOpen: (open: boolean) => void;
  showToast: (toast: ToastState) => void;
  hideToast: () => void;
  saveVisit: (city: CityData, input: Pick<VisitRecord, 'arrival_date' | 'departure_date' | 'notes'> & { id?: string }) => Promise<void>;
  bulkCreateVisits: (records: Array<Pick<VisitRecord, 'city_id' | 'arrival_date' | 'departure_date' | 'notes'>>) => Promise<void>;
  deleteVisit: (id: string) => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  exportBackup: () => Promise<string>;
  importBackup: (data: ExportData) => Promise<void>;
  clearData: () => Promise<void>;
  getStats: () => Stats;
  getSystemStats: () => Promise<{ totalUsers: number; totalVisits: number; adminUsers: number }>;
}

const nowIso = () => new Date().toISOString();

async function loadUserData(user: User) {
  const [visits, ach, setts] = await Promise.all([getAllVisits(user.id), getAchievements(user.id), getSettings(user.id)]);
  document.documentElement.dataset.theme = setts.theme;
  return { visits, achievements: ach.map((item) => item.achievement_id), settings: setts };
}

async function checkAchievements(uid: string, records: VisitRecord[], unlocked: string[]) {
  const next = new Set(unlocked);
  const newly: string[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (!next.has(achievement.id) && achievement.check(records, CITIES)) {
      next.add(achievement.id);
      newly.push(achievement.id);
      await unlockAchievement(uid, achievement.id);
    }
  }
  return { achievements: [...next], newly };
}

export const useStore = create<StoreState>((set, get) => ({
  visits: [], achievements: [], settings: { theme: 'light' },
  drawerOpen: false, searchQuery: '', posterOpen: false, settingsOpen: false, visitsOpen: false, adminOpen: false, statsOpen: false,
  hydrated: false, currentUser: null, users: [], adminSetupRequired: false,

  load: async () => {
    try {
      const users = await getUsers();
      const adminSetupRequired = !users.some((user) => user.is_admin);
      document.documentElement.dataset.theme = 'light';
      set({ users, adminSetupRequired, currentUser: null, visits: [], achievements: [], hydrated: true });
    } catch (error) {
      console.error('Failed to load app data', error);
      set({ users: [], currentUser: null, visits: [], achievements: [], settings: { theme: 'light' }, hydrated: true, adminSetupRequired: true, toast: { icon: '!', message: '数据加载失败，请刷新重试' } });
    }
  },

  setupAdmin: async (username, password) => {
    if (!username.trim() || password.length < 4) {
      set({ toast: { icon: '!', message: '管理员用户名和密码不能为空，密码至少4位' } });
      return;
    }
    const admin = await createUser('管理员', { username, password, is_admin: true });
    const data = await loadUserData(admin);
    set({ currentUser: admin, users: await getUsers(), adminSetupRequired: false, adminOpen: true, ...data, toast: { icon: '✓', message: '管理员已创建' } });
  },

  loginAdmin: async (username, password) => {
    const users = await getUsers();
    const hash = await hashPassword(password);
    const admin = users.find((user) => user.is_admin && user.username === username.trim() && user.password_hash === hash);
    if (!admin) {
      set({ toast: { icon: '!', message: '管理员账号或密码错误' } });
      return false;
    }
    const data = await loadUserData(admin);
    set({ currentUser: admin, users, adminOpen: true, ...data, toast: { icon: '✓', message: '已登录管理员' } });
    return true;
  },

  switchUser: async (user) => {
    const data = await loadUserData(user);
    set({ currentUser: user, ...data, selectedCity: undefined, previewCity: undefined, drawerOpen: false, adminOpen: false });
  },

  logout: () => {
    document.documentElement.dataset.theme = 'light';
    set({ currentUser: null, visits: [], achievements: [], selectedCity: undefined, previewCity: undefined, drawerOpen: false, adminOpen: false, visitsOpen: false, settingsOpen: false, posterOpen: false });
  },

  createRegularUser: async (name) => {
    const user = await createUser(name);
    set({ users: await getUsers(), toast: { icon: '✓', message: '用户已创建' } });
    return user;
  },

  deleteUserAndData: async (id) => {
    const state = get();
    const target = state.users.find((user) => user.id === id);
    if (target?.is_admin && state.users.filter((user) => user.is_admin).length <= 1) {
      set({ toast: { icon: '!', message: '至少保留一个管理员' } });
      return;
    }
    await deleteUser(id);
    const users = await getUsers();
    const currentUser = state.currentUser?.id === id ? null : state.currentUser;
    set({ users, currentUser, visits: currentUser ? state.visits : [], achievements: currentUser ? state.achievements : [], toast: { icon: '✓', message: '用户和数据已删除' } });
  },

  resetUserPassword: async (id, password) => {
    if (password.length < 4) {
      set({ toast: { icon: '!', message: '密码至少4位' } });
      return;
    }
    const user = get().users.find((item) => item.id === id);
    if (!user) return;
    const next = { ...user, password_hash: await hashPassword(password) };
    await updateUser(next);
    set({ users: await getUsers(), currentUser: get().currentUser?.id === id ? next : get().currentUser, toast: { icon: '✓', message: '密码已更新' } });
  },

  setSelectedCity: (selectedCity) => set({ selectedCity, drawerOpen: Boolean(selectedCity) }),
  setPreviewCity: (previewCity) => set({ previewCity }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setPosterOpen: (posterOpen) => set({ posterOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setVisitsOpen: (visitsOpen) => set({ visitsOpen }),
  setAdminOpen: (adminOpen) => set({ adminOpen }),
  setStatsOpen: (statsOpen) => set({ statsOpen }),
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: undefined }),

  saveVisit: async (city, input) => {
    const state = get();
    if (!state.currentUser) { set({ toast: { icon: '!', message: '请先登录或选择用户' } }); return; }
    if (visitDays(input) < 1) { set({ toast: { icon: '!', message: '离开日期不能早于到达日期' } }); return; }
    const existing = input.id ? state.visits.find((record) => record.id === input.id) : undefined;
    const now = nowIso();
    const record: VisitRecord = {
      id: input.id ?? uuid(),
      city_id: city.city_id,
      arrival_date: input.arrival_date,
      departure_date: input.departure_date,
      notes: input.notes?.trim() || undefined,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await dbSaveVisit(state.currentUser.id, record);
    const visits = [record, ...state.visits.filter((item) => item.id !== record.id)].sort((a, b) => b.arrival_date.localeCompare(a.arrival_date));
    const checked = await checkAchievements(state.currentUser.id, visits, state.achievements);
    const unlocked = checked.newly[0] ? ACHIEVEMENTS.find((item) => item.id === checked.newly[0]) : undefined;
    set({ visits, achievements: checked.achievements, drawerOpen: false, selectedCity: undefined, previewCity: undefined, toast: unlocked ? { icon: unlocked.icon, message: `解锁成就：${unlocked.name}` } : { icon: '✓', message: '访问记录已保存' } });
  },

  bulkCreateVisits: async (records) => {
    const state = get();
    if (!state.currentUser) { set({ toast: { icon: '!', message: '请先登录或选择用户' } }); return; }
    const now = nowIso();
    const visits: VisitRecord[] = records.map((record) => ({ id: uuid(), created_at: now, updated_at: now, ...record, notes: record.notes?.trim() || undefined }));
    await bulkSaveVisits(state.currentUser.id, visits);
    const next = [...visits, ...state.visits].sort((a, b) => b.arrival_date.localeCompare(a.arrival_date));
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
    const users = await getUsers();
    const perUser = await Promise.all(users.map((user) => getAllVisits(user.id).catch(() => [])));
    return { totalUsers: users.length, totalVisits: perUser.reduce((sum, records) => sum + records.length, 0), adminUsers: users.filter((user) => user.is_admin).length };
  },
}));
