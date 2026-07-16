import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { ACHIEVEMENTS } from '../data/achievements';
import { CITIES } from '../data/cities';
import type { VisitRecord } from '../types';
import { visitDays } from '../utils/date';
import { byLastStayDesc, checkAchievements, loadUserData, nowIso } from './helpers';
import type { StoreState } from './types';
import {
  bulkSaveVisits,
  changePassword,
  clearAllData,
  clearToken,
  createVisit,
  createInitialAdmin,
  createManagedUser,
  deleteUser,
  deleteVisit as dbDeleteVisit,
  exportAll,
  getCurrentUser,
  getBootstrapStatus,
  hasToken,
  getUsers,
  importAll,
  saveSettings,
  updateUser,
  updateMe,
  updateVisit,
  verifyAdmin,
  verifyUser,
  getSystemStats as apiGetSystemStats,
} from './api';

export const useStore = create<StoreState>((set, get) => ({
  visits: [], achievements: [], settings: { theme: 'rose' },
  drawerOpen: false, searchQuery: '', visitsOpen: false, adminOpen: false, statsOpen: false, profileOpen: false,
  hydrated: false, currentUser: null, users: [], adminSetupRequired: false, statsCollapsed: false, profileTab: 'profile', colorMode: 'duration',

  load: async () => {
    try {
      document.documentElement.dataset.theme = 'rose';
      if (!hasToken()) {
        const bootstrap = await getBootstrapStatus();
        set({
          users: [],
          adminSetupRequired: bootstrap.requires_admin_setup,
          currentUser: null,
          visits: [],
          achievements: [],
          hydrated: true,
        });
        return;
      }
      const currentUser = await getCurrentUser();
      const data = await loadUserData(currentUser);
      const users = currentUser.is_admin ? await getUsers() : [];
      set({ users, adminSetupRequired: false, currentUser, hydrated: true, ...data });
    } catch (error) {
      console.error('Failed to load app data', error);
      clearToken();
      set({ users: [], currentUser: null, visits: [], achievements: [], settings: { theme: 'rose' }, hydrated: true, adminSetupRequired: false, toast: { icon: '!', message: '数据加载失败，请重新登录' } });
    }
  },

  setupAdmin: async (username, password) => {
    if (!username.trim() || password.length < 6) {
      set({ toast: { icon: '!', message: '管理员用户名和密码不能为空，密码至少6位' } });
      return;
    }
    await createInitialAdmin('管理员', { username, password });
    const admin = await verifyAdmin(username, password);
    if (!admin) {
      set({ toast: { icon: '!', message: '管理员创建后登录失败' } });
      return;
    }
    const data = await loadUserData(admin);
    // 2026-06-20: adminOpen之前一直是true，但此前没有任何渲染入口消费这个
    // 状态（是遗留的死代码）。这次给adminOpen补上了独立弹窗挂载点（见App.tsx），
    // 如果继续传true，管理员创建后会自动弹出管理员面板——用户确认不需要这个
    // 行为，登录/创建后应该正常进入主地图页，"系统管理"只通过TopBar下拉菜单
    // 手动打开。
    set({ currentUser: admin, users: await getUsers(), adminSetupRequired: false, ...data, toast: { icon: '✓', message: '管理员已创建' } });
  },

  loginAdmin: async (username, password) => {
    const admin = await verifyAdmin(username, password);
    if (!admin) {
      set({ toast: { icon: '!', message: '管理员账号或密码错误' } });
      return false;
    }
    const users = await getUsers();
    const data = await loadUserData(admin);
    // 同上：不再自动弹出管理员面板，登录后进主地图页。
    set({ currentUser: admin, users, ...data, toast: { icon: '✓', message: '已登录管理员' } });
    return true;
  },

  loginUser: async (username, password) => {
    const user = await verifyUser(username, password);
    if (!user) {
      set({ toast: { icon: '!', message: '用户名或密码错误' } });
      return false;
    }
    // 2026-06-21: 管理员账号禁止走普通用户登录入口。根因——loginUser只
    // 调用switchUser加载该用户自己的足迹数据，不会像loginAdmin那样额外
    // getUsers()拉取用户列表，导致管理员从这条入口登录后能进系统、但
    // 用户管理/数据管理里的数据全是空的(并非请求失败，是从未发起请求)。
    // 用户明确要求限制登录方式而非自动补数据，因此这里直接拒绝并
    // 提示改用管理员入口，同时clearToken()清掉verifyUser内部刚设置的
    // token，避免出现前端拒绝登录但token已写入本地的不一致状态。
    if (user.is_admin) {
      clearToken();
      set({ toast: { icon: '!', message: '管理员账号请使用管理员登录入口' } });
      return false;
    }
    await get().switchUser(user);
    set({ toast: { icon: '✓', message: '已登录' } });
    return true;
  },

  switchUser: async (user) => {
    const data = await loadUserData(user);
    set({ currentUser: user, ...data, selectedCity: undefined, previewCity: undefined, drawerOpen: false, adminOpen: false });
  },

  logout: () => {
    clearToken();
    document.documentElement.dataset.theme = 'rose';
    set({ currentUser: null, visits: [], achievements: [], selectedCity: undefined, previewCity: undefined, drawerOpen: false, adminOpen: false, visitsOpen: false, profileOpen: false });
  },

  createRegularUser: async (name) => {
    const user = await createManagedUser(name);
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
    if (password.length < 6) {
      set({ toast: { icon: '!', message: '密码至少6位' } });
      return;
    }
    const user = get().users.find((item) => item.id === id);
    if (!user) return;
    try {
      const next = await changePassword(id, password);
      set({ users: await getUsers(), currentUser: get().currentUser?.id === id ? next : get().currentUser, toast: { icon: '✓', message: '密码已更新' } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '密码更新失败';
      set({ toast: { icon: '!', message: msg } });
    }
  },

  setSelectedCity: (selectedCity) => set({ selectedCity, drawerOpen: Boolean(selectedCity) }),
  setPreviewCity: (previewCity) => set({ previewCity }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setVisitsOpen: (visitsOpen) => set({ visitsOpen }),
  setAdminOpen: (adminOpen) => set({ adminOpen }),
  setStatsOpen: (statsOpen) => set({ statsOpen }),
  setProfileOpen: (profileOpen, tab) => set({ profileOpen, ...(tab ? { profileTab: tab } : {}) }),
  toggleStatsCollapsed: () => set((s) => ({ statsCollapsed: !s.statsCollapsed })),
  setColorMode: (colorMode) => set({ colorMode }),
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: undefined }),
  updateUserName: async (name) => {
    const user = get().currentUser;
    const trimmed = name.trim();
    if (!user) return false;
    if (!trimmed) {
      set({ toast: { icon: '!', message: '名称不能为空' } });
      return false;
    }

    try {
      const updated = await updateMe({ name: trimmed });
      set({
        currentUser: updated,
        users: get().users.map((item) => item.id === updated.id ? updated : item),
        toast: { icon: '✓', message: '名称已更新' },
      });
      return true;
    } catch (err) {
      set({ toast: { icon: '!', message: err instanceof Error ? err.message : '名称更新失败' } });
      return false;
    }
  },

  updateAnyUserName: async (userId, name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      set({ toast: { icon: '!', message: '名称不能为空' } });
      return;
    }
    const user = get().users.find((item) => item.id === userId);
    if (!user) return;
    const updated = { ...user, name: trimmed };
    await updateUser(updated);
    const users = await getUsers();
    set({
      users,
      currentUser: get().currentUser?.id === userId ? updated : get().currentUser,
      toast: { icon: '✓', message: '名称已更新' },
    });
  },

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
