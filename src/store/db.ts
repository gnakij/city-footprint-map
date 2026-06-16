import { openDB, type DBSchema } from 'idb';
import { v4 as uuid } from 'uuid';
import type { AppSettings, DepartureRecord, DurationRecord, ExportData, User } from '../types';

interface UserDB extends DBSchema {
  users: { key: string; value: User };
}
interface CityFootprintDB extends DBSchema {
  duration_records: { key: string; value: DurationRecord; indexes: { 'by-city': string } };
  departure_records: { key: string; value: DepartureRecord; indexes: { 'by-city': string } };
  achievements: { key: string; value: { id: string; unlocked_at: string } };
  settings: { key: string; value: AppSettings & { id: string } };
}

const DEFAULT_SETTINGS: AppSettings = { theme: 'light', defaultMode: 'duration' };

const usersDb = openDB<UserDB>('city-footprint-users', 1, {
  upgrade(db) { db.createObjectStore('users', { keyPath: 'id' }); },
});

function openUserDB(userId: string) {
  return openDB<CityFootprintDB>(`city-footprint-db-${userId}`, 1, {
    upgrade(db) {
      const d = db.createObjectStore('duration_records', { keyPath: 'id' });
      d.createIndex('by-city', 'city_id', { unique: true });
      const dep = db.createObjectStore('departure_records', { keyPath: 'id' });
      dep.createIndex('by-city', 'city_id', { unique: true });
      db.createObjectStore('achievements', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'id' });
    },
  });
}

export async function getUsers(): Promise<User[]> {
  return (await usersDb).getAll('users');
}

export async function createUser(name: string): Promise<User> {
  const user: User = { id: uuid(), name, created_at: new Date().toISOString() };
  await (await usersDb).put('users', user);
  return user;
}

export async function deleteUser(id: string): Promise<void> {
  await (await usersDb).delete('users', id);
}

export async function getAllDuration(userId: string) {
  return (await openUserDB(userId)).getAll('duration_records');
}
export async function getAllDeparture(userId: string) {
  return (await openUserDB(userId)).getAll('departure_records');
}
export async function saveRecord(userId: string, record: DurationRecord | DepartureRecord) {
  const db = await openUserDB(userId);
  const storeName = 'days' in record ? 'duration_records' : 'departure_records';
  const tx = db.transaction(storeName, 'readwrite');
  const byCity = await tx.store.index('by-city').get(record.city_id);
  if (byCity && byCity.id !== record.id) await tx.store.delete(byCity.id);
  await tx.store.put(record as never);
  await tx.done;
}
export async function deleteRecord(userId: string, id: string, mode: 'duration' | 'departure') {
  await (await openUserDB(userId)).delete(mode === 'duration' ? 'duration_records' : 'departure_records', id);
}
export async function getAchievements(userId: string) {
  return (await openUserDB(userId)).getAll('achievements');
}
export async function unlockAchievement(userId: string, achievementId: string) {
  await (await openUserDB(userId)).put('achievements', { id: achievementId, unlocked_at: new Date().toISOString() });
}
export async function getSettings(userId: string): Promise<AppSettings> {
  const saved = await (await openUserDB(userId)).get('settings', 'main');
  return saved ? { theme: saved.theme, defaultMode: saved.defaultMode } : DEFAULT_SETTINGS;
}
export async function saveSettings(userId: string, settings: AppSettings) {
  await (await openUserDB(userId)).put('settings', { id: 'main', ...settings });
}
export async function exportAll(userId: string): Promise<ExportData> {
  const [dur, dep, ach, set] = await Promise.all([getAllDuration(userId), getAllDeparture(userId), getAchievements(userId), getSettings(userId)]);
  return { version: '1.0.0', exported_at: new Date().toISOString(), duration_records: dur, departure_records: dep, achievements: ach.map(i => i.id), settings: set };
}
export async function importAll(userId: string, data: ExportData) {
  const db = await openUserDB(userId);
  const tx = db.transaction(['duration_records','departure_records','achievements','settings'], 'readwrite');
  await Promise.all([tx.objectStore('duration_records').clear(), tx.objectStore('departure_records').clear(), tx.objectStore('achievements').clear(), tx.objectStore('settings').clear()]);
  for (const r of data.duration_records) await tx.objectStore('duration_records').put(r);
  for (const r of data.departure_records) await tx.objectStore('departure_records').put(r);
  for (const id of data.achievements) await tx.objectStore('achievements').put({ id, unlocked_at: new Date().toISOString() });
  await tx.objectStore('settings').put({ id: 'main', ...data.settings });
  await tx.done;
}
export async function clearAllData(userId: string) {
  const db = await openUserDB(userId);
  const tx = db.transaction(['duration_records','departure_records','achievements'], 'readwrite');
  await Promise.all([tx.objectStore('duration_records').clear(), tx.objectStore('departure_records').clear(), tx.objectStore('achievements').clear()]);
  await tx.done;
}
