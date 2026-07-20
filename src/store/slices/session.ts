import { clearToken, createInitialAdmin, getBootstrapStatus, getCurrentUser, getUsers, hasToken, verifyAdmin, verifyUser } from '../api';
import { loadUserData } from '../helpers';
import type { StoreGet, StoreSet, StoreState } from '../types';

type SessionSlice = Pick<
  StoreState,
  | 'hydrated'
  | 'currentUser'
  | 'users'
  | 'adminSetupRequired'
  | 'load'
  | 'setupAdmin'
  | 'loginAdmin'
  | 'loginUser'
  | 'switchUser'
  | 'logout'
>;

export function createSessionSlice(set: StoreSet, get: StoreGet): SessionSlice {
  return {
    hydrated: false,
    currentUser: null,
    users: [],
    adminSetupRequired: false,

    load: async () => {
      try {
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
        if (import.meta.env.DEV) console.error('Failed to load app data', error);
        clearToken();
        set({
          users: [],
          currentUser: null,
          visits: [],
          achievements: [],
          settings: { theme: 'rose' },
          hydrated: true,
          adminSetupRequired: false,
          toast: { icon: '!', message: '数据加载失败，请重新登录' },
        });
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
      // Admin setup/login should land on the main map; system management opens only from TopBar.
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
      // Keep parity with setup: do not auto-open the admin panel after login.
      set({ currentUser: admin, users, ...data, toast: { icon: '✓', message: '已登录管理员' } });
      return true;
    },

    loginUser: async (username, password) => {
      const user = await verifyUser(username, password);
      if (!user) {
        set({ toast: { icon: '!', message: '用户名或密码错误' } });
        return false;
      }
      // Admin accounts need the admin login path so user-management data is loaded consistently.
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
      set({
        currentUser: null,
        visits: [],
        achievements: [],
        selectedCity: undefined,
        previewCity: undefined,
        drawerOpen: false,
        adminOpen: false,
        visitsOpen: false,
        profileOpen: false,
      });
    },
  };
}
