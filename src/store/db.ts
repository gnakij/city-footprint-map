import { openDB, type DBSchema } from 'idb';
import type { AppSettings, DepartureRecord, DurationRecord, ExportData } from '../types';

interface CityFootprintDB extends DBSchema {
  duration_records: {
    key: string;
    value: DurationRecord;
    indexes: { 'by-city': string };
  };
  departure_records: {
    key: string;
    value: DepartureRecord;
    indexes: { 'by-city': string };
  };
  achievements: {
    key: string;
    value: { id: string; unlocked_at: string };
  };
  settings: {
    key: string;
    value: AppSettings & { id: string };
  };
}

const DEFAULT_SETTINGS: AppSettings = { theme: 'light', defaultMode: 'duration' };

const dbPromise = openDB<CityFootprintDB>('city-footprint-db', 1, {
  upgrade(db) {
    const duration = db.createObjectStore('duration_records', { keyPath: 'id' });
    duration.createIndex('by-city', 'city_id', { unique: true });
    const departure = db.createObjectStore('departure_records', { keyPath: 'id' });
    departure.createIndex('by-city', 'city_id', { unique: true });
    db.createObjectStore('achievements', { keyPath: 'id' });
    db.createObjectStore('settings', { keyPath: 'id' });
  },
});

export async function getAllDuration() {
  return (await dbPromise).getAll('duration_records');
}

export async function getAllDeparture() {
  return (await dbPromise).getAll('departure_records');
}

export async function saveRecord(record: DurationRecord | DepartureRecord) {
  const db = await dbPromise;
  const storeName = 'days' in record ? 'duration_records' : 'departure_records';
  const tx = db.transaction(storeName, 'readwrite');
  const byCity = await tx.store.index('by-city').get(record.city_id);
  if (byCity && byCity.id !== record.id) {
    await tx.store.delete(byCity.id);
  }
  await tx.store.put(record as never);
  await tx.done;
}

export async function deleteRecord(id: string, mode: 'duration' | 'departure') {
  const db = await dbPromise;
  await db.delete(mode === 'duration' ? 'duration_records' : 'departure_records', id);
}

export async function getAchievements() {
  return (await dbPromise).getAll('achievements');
}

export async function unlockAchievement(id: string) {
  const db = await dbPromise;
  await db.put('achievements', { id, unlocked_at: new Date().toISOString() });
}

export async function getSettings(): Promise<AppSettings> {
  const saved = await (await dbPromise).get('settings', 'main');
  return saved ? { theme: saved.theme, defaultMode: saved.defaultMode } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings) {
  await (await dbPromise).put('settings', { id: 'main', ...settings });
}

export async function exportAll(): Promise<ExportData> {
  const [duration_records, departure_records, achievements, settings] = await Promise.all([
    getAllDuration(),
    getAllDeparture(),
    getAchievements(),
    getSettings(),
  ]);
  return {
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    duration_records,
    departure_records,
    achievements: achievements.map((item) => item.id),
    settings,
  };
}

export async function importAll(data: ExportData) {
  const db = await dbPromise;
  const tx = db.transaction(['duration_records', 'departure_records', 'achievements', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('duration_records').clear(),
    tx.objectStore('departure_records').clear(),
    tx.objectStore('achievements').clear(),
    tx.objectStore('settings').clear(),
  ]);
  for (const record of data.duration_records) {
    await tx.objectStore('duration_records').put(record);
  }
  for (const record of data.departure_records) {
    await tx.objectStore('departure_records').put(record);
  }
  for (const id of data.achievements) {
    await tx.objectStore('achievements').put({ id, unlocked_at: new Date().toISOString() });
  }
  await tx.objectStore('settings').put({ id: 'main', ...data.settings });
  await tx.done;
}

export async function clearAllData() {
  const db = await dbPromise;
  const tx = db.transaction(['duration_records', 'departure_records', 'achievements'], 'readwrite');
  await Promise.all([
    tx.objectStore('duration_records').clear(),
    tx.objectStore('departure_records').clear(),
    tx.objectStore('achievements').clear(),
  ]);
  await tx.done;
}
