import { ACHIEVEMENTS } from '../data/achievements';
import { CITIES } from '../data/cities';
import type { User, VisitRecord } from '../types';
import { getAchievements, getAllVisits, getSettings, unlockAchievement } from './api';

export const nowIso = () => new Date().toISOString();

export const byLastStayDesc = (a: VisitRecord, b: VisitRecord) => b.last_stay_date.localeCompare(a.last_stay_date);

export async function loadUserData(user: User) {
  const [visits, ach, setts] = await Promise.all([getAllVisits(user.id), getAchievements(user.id), getSettings(user.id)]);
  document.documentElement.dataset.theme = setts.theme;
  return { visits, achievements: ach.map((item) => item.achievement_id), settings: setts };
}

export async function checkAchievements(uid: string, records: VisitRecord[], unlocked: string[]) {
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
