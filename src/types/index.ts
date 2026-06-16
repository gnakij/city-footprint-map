export type RecordMode = 'duration' | 'departure';

export type ThemeMode = 'light' | 'dark';

export interface CityData {
  city_id: string;
  city_name: string;
  province: string;
  region: '华北' | '华东' | '华南' | '华中' | '西南' | '西北' | '东北';
  pinyin: string;
  level: 'province' | 'prefecture';
}

export interface DurationRecord {
  id: string;
  city_id: string;
  days: number;
  created_at: string;
  updated_at: string;
}

export interface DepartureRecord {
  id: string;
  city_id: string;
  departure_date: string;
  created_at: string;
  updated_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked_at?: string;
  check: (records: Array<DurationRecord | DepartureRecord>, cities: CityData[]) => boolean;
}

export interface AppSettings {
  theme: ThemeMode;
  defaultMode: RecordMode;
}

export interface ExportData {
  version: string;
  exported_at: string;
  duration_records: DurationRecord[];
  departure_records: DepartureRecord[];
  achievements: string[];
  settings: AppSettings;
}

export interface Stats {
  litCount: number;
  totalCities: number;
  provinceCount: number;
  totalDays: number;
  coverage: number;
}
