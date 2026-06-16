import { openDB, type DBSchema } from 'idb';
import { v4 as uuid } from 'uuid';
import type { AppSettings, ExportData, User, VisitRecord } from '../types';

interface AchievementRow {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

interface SettingsRow extends AppSettings {
  user_id: string;
}

interface FootprintDb extends DBSchema {
  users: {
    key: string;
    value: User;
    indexes: { username: string };
  };
  visits: {
    key: string;
    value: VisitRecord & { user_id: string };
    indexes: { user_id: string; city_id: string };
  };
  achievements: {
    key: string;
    value: AchievementRow;
    indexes: { user_id: string };
  };
  settings: {
    key: string;
    value: SettingsRow;
  };
}

const DB_NAME = 'city-footprint-map';
const DB_VERSION = 3;
const defaultSettings: AppSettings = { theme: 'light' };

const dbPromise = openDB<FootprintDb>(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, _newVersion, tx) {
    if (!db.objectStoreNames.contains('users')) {
      const users = db.createObjectStore('users', { keyPath: 'id' });
      users.createIndex('username', 'username', { unique: false });
    }
    if (!db.objectStoreNames.contains('visits')) {
      const visits = db.createObjectStore('visits', { keyPath: 'id' });
      visits.createIndex('user_id', 'user_id');
      visits.createIndex('city_id', 'city_id');
    }
    if (!db.objectStoreNames.contains('achievements')) {
      const achievements = db.createObjectStore('achievements', { keyPath: 'id' });
      achievements.createIndex('user_id', 'user_id');
    }
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings', { keyPath: 'user_id' });
    }

    if (oldVersion < 3) {
      const stores = Array.from(db.objectStoreNames);
      for (const storeName of ['durationRecords', 'departureRecords', 'records'] as const) {
        if ((stores as string[]).includes(storeName)) (db as any).deleteObjectStore(storeName);
      }
    }

    void tx.done.catch(() => undefined);
  },
});

export async function hashPassword(password: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function getUsers() {
  const db = await dbPromise;
  return (await db.getAll('users')).sort((a, b) => Number(b.is_admin) - Number(a.is_admin) || a.created_at.localeCompare(b.created_at));
}

export async function getAdminUser() {
  const users = await getUsers();
  return users.find((user) => user.is_admin) ?? null;
}

export async function createAdmin(username: string, password: string) {
  const now = new Date().toISOString();
  const user: User = {
    id: uuid(),
    name: username,
    username,
    password_hash: await hashPassword(password),
    is_admin: true,
    created_at: now,
  };
  const db = await dbPromise;
  await db.put('users', user);
  await db.put('settings', { user_id: user.id, ...defaultSettings });
  return user;
}

export async function createUser(name: string, options?: { username?: string; password?: string; is_admin?: boolean }) {
  const now = new Date().toISOString();
  const user: User = {
    id: uuid(),
    name,
    username: options?.username?.trim() || undefined,
    password_hash: options?.password ? await hashPassword(options.password) : undefined,
    is_admin: Boolean(options?.is_admin),
    created_at: now,
  };
  const db = await dbPromise;
  await db.put('users', user);
  await db.put('settings', { user_id: user.id, ...defaultSettings });
  return user;
}

export async function updateUser(user: User) {
  const db = await dbPromise;
  await db.put('users', user);
}

export async function changePassword(userId: string, password: string) {
  const db = await dbPromise;
  const user = await db.get('users', userId);
  if (!user) return;
  await db.put('users', { ...user, password_hash: await hashPassword(password) });
}

export async function verifyAdmin(username: string, password: string) {
  const db = await dbPromise;
  const users = await db.getAllFromIndex('users', 'username', username);
  const admin = users.find((user) => user.is_admin);
  if (!admin || !admin.password_hash) return null;
  return admin.password_hash === await hashPassword(password) ? admin : null;
}

export async function deleteUser(id: string) {
  const db = await dbPromise;
  const tx = db.transaction(['users', 'visits', 'achievements', 'settings'], 'readwrite');
  await tx.objectStore('users').delete(id);
  const visits = await tx.objectStore('visits').index('user_id').getAll(id);
  await Promise.all(visits.map((visit) => tx.objectStore('visits').delete(visit.id)));
  const achievements = await tx.objectStore('achievements').index('user_id').getAll(id);
  await Promise.all(achievements.map((achievement) => tx.objectStore('achievements').delete(achievement.id)));
  await tx.objectStore('settings').delete(id);
  await tx.done;
}

export async function getVisits(userId: string) {
  const db = await dbPromise;
  return (await db.getAllFromIndex('visits', 'user_id', userId))
    .map(({ user_id: _userId, ...visit }) => visit)
    .sort((a, b) => b.arrival_date.localeCompare(a.arrival_date));
}

export const getAllVisits = getVisits;

export async function saveVisit(userId: string, visit: VisitRecord) {
  const db = await dbPromise;
  await db.put('visits', { ...visit, user_id: userId });
}

export async function saveVisits(userId: string, visits: VisitRecord[]) {
  const db = await dbPromise;
  const tx = db.transaction('visits', 'readwrite');
  await Promise.all(visits.map((visit) => tx.store.put({ ...visit, user_id: userId })));
  await tx.done;
}

export const bulkSaveVisits = saveVisits;

export async function deleteVisit(userId: string, id: string) {
  const db = await dbPromise;
  const visit = await db.get('visits', id);
  if (visit?.user_id === userId) await db.delete('visits', id);
}

export async function getAchievements(userId: string) {
  const db = await dbPromise;
  return db.getAllFromIndex('achievements', 'user_id', userId);
}

export async function unlockAchievement(userId: string, achievementId: string) {
  const db = await dbPromise;
  await db.put('achievements', {
    id: `${userId}:${achievementId}`,
    user_id: userId,
    achievement_id: achievementId,
    unlocked_at: new Date().toISOString(),
  });
}

export async function getSettings(userId: string) {
  const db = await dbPromise;
  const row = await db.get('settings', userId);
  return row ? { theme: row.theme } : defaultSettings;
}

export async function saveSettings(userId: string, settings: AppSettings) {
  const db = await dbPromise;
  await db.put('settings', { user_id: userId, ...settings });
}

export async function clearAllData(userId: string) {
  const db = await dbPromise;
  const tx = db.transaction(['visits', 'achievements'], 'readwrite');
  const visits = await tx.objectStore('visits').index('user_id').getAll(userId);
  await Promise.all(visits.map((visit) => tx.objectStore('visits').delete(visit.id)));
  const achievements = await tx.objectStore('achievements').index('user_id').getAll(userId);
  await Promise.all(achievements.map((achievement) => tx.objectStore('achievements').delete(achievement.id)));
  await tx.done;
}

export async function exportAll(userId: string): Promise<ExportData> {
  return {
    version: '2.0.0',
    exported_at: new Date().toISOString(),
    visits: await getVisits(userId),
    achievements: (await getAchievements(userId)).map((item) => item.achievement_id),
    settings: await getSettings(userId),
  };
}

export async function importAll(userId: string, data: ExportData) {
  const db = await dbPromise;
  const tx = db.transaction(['visits', 'achievements', 'settings'], 'readwrite');
  const existingVisits = await tx.objectStore('visits').index('user_id').getAll(userId);
  await Promise.all(existingVisits.map((visit) => tx.objectStore('visits').delete(visit.id)));
  const existingAchievements = await tx.objectStore('achievements').index('user_id').getAll(userId);
  await Promise.all(existingAchievements.map((achievement) => tx.objectStore('achievements').delete(achievement.id)));
  await Promise.all((data.visits ?? []).map((visit) => tx.objectStore('visits').put({ ...visit, user_id: userId })));
  await Promise.all((data.achievements ?? []).map((achievementId) => tx.objectStore('achievements').put({
    id: `${userId}:${achievementId}`,
    user_id: userId,
    achievement_id: achievementId,
    unlocked_at: new Date().toISOString(),
  })));
  await tx.objectStore('settings').put({ user_id: userId, ...(data.settings ?? defaultSettings) });
  await tx.done;
}
