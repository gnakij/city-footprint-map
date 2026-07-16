import { changePassword, createManagedUser, deleteUser, getUsers, updateMe, updateUser } from '../api';
import type { StoreGet, StoreSet, StoreState } from '../types';

type UsersSlice = Pick<
  StoreState,
  | 'createRegularUser'
  | 'deleteUserAndData'
  | 'resetUserPassword'
  | 'updateUserName'
  | 'updateAnyUserName'
>;

export function createUsersSlice(set: StoreSet, get: StoreGet): UsersSlice {
  return {
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
      set({
        users,
        currentUser,
        visits: currentUser ? state.visits : [],
        achievements: currentUser ? state.achievements : [],
        toast: { icon: '✓', message: '用户和数据已删除' },
      });
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
        set({
          users: await getUsers(),
          currentUser: get().currentUser?.id === id ? next : get().currentUser,
          toast: { icon: '✓', message: '密码已更新' },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '密码更新失败';
        set({ toast: { icon: '!', message: msg } });
      }
    },

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
  };
}
