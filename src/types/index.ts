export type ThemeMode = 'light' | 'dark';
export type SortMode = 'days' | 'name';

export interface CityData {
  city_id: string;
  city_name: string;
  province: string;
  region: '华北' | '华东' | '华南' | '华中' | '西南' | '西北' | '东北';
  pinyin: string;
  level: 'province' | 'prefecture';
}

export interface VisitRecord {
  id: string;
  city_id: string;
  arrival_date: string;
  departure_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked_at?: string;
  check: (records: VisitRecord[], cities: CityData[]) => boolean;
}

export interface AppSettings {
  theme: ThemeMode;
}

export interface ExportData {
  version: string;
  exported_at: string;
  visits: VisitRecord[];
  achievements: string[];
  settings: AppSettings;
}

export interface Stats {
  litCount: number;
  totalCities: number;
  provinceCount: number;
  totalDays: number;
  visitCount: number;
  coverage: number;
}

export interface User {
  id: string;
  name: string;
  username?: string;
  password_hash?: string;
  is_admin: boolean;
  created_at: string;
}

export interface ImportVisitRow {
  province: string;
  city: string;
  arrival_date: string;
  departure_date: string;
  notes?: string;
  city_id?: string;
  error?: string;
}
