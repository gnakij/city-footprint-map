import { v4 as uuid } from 'uuid';
import { ACHIEVEMENTS } from '../../data/achievements';
import type { VisitRecord } from '../../types';
import { bulkSaveVisits, createVisit, deleteVisit as dbDeleteVisit, updateVisit } from '../api';
import { byLastStayDesc, checkAchievements, nowIso } from '../helpers';
import type { StoreGet, StoreSet, StoreState } from '../types';

type VisitsSlice = Pick<StoreState, 'visits' | 'achievements' | 'saveVisit' | 'bulkCreateVisits' | 'deleteVisit'>;

export function createVisitsSlice(set: StoreSet, get: StoreGet): VisitsSlice {
  return {
    visits: [],
    achievements: [],

    /**
     * 保存一条停留记录（粗粒度模型）。
     * 不校验「时间区间是否重叠」：同一城市允许多条独立记录。
     */
    saveVisit: async (city, input) => {
      const state = get();
      if (!state.currentUser) { set({ toast: { icon: '!', message: '请先登录或选择用户' } }); return false; }
      if (!input.last_stay_date) { set({ toast: { icon: '!', message: '请填写最后停留日期' } }); return false; }
      if (!Number.isInteger(input.duration_days) || input.duration_days < 1) {
        set({ toast: { icon: '!', message: '停留天数必须是至少 1 天的整数' } });
        return false;
      }
      const existing = input.id ? state.visits.find((record) => record.id === input.id) : undefined;
      const now = nowIso();
      const record = {
        city_id: city.city_id,
        duration_days: input.duration_days,
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
        set({
          visits,
          achievements: checked.achievements,
          drawerOpen: false,
          selectedCity: undefined,
          previewCity: undefined,
          toast: unlocked ? { icon: unlocked.icon, message: `解锁成就：${unlocked.name}` } : { icon: '✓', message: '访问记录已保存' },
        });
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
  };
}
