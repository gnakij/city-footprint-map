export type ThemeMode = 'rose' | 'stripe' | 'amber' | 'turquoise' | 'azure';
export type SortMode = 'days' | 'name';
export type ColorMode = 'duration' | 'lastDeparture';

export interface CityData {
  city_id: string;
  city_name: string;
  province: string;
  region: '华北' | '华东' | '华南' | '华中' | '西南' | '西北' | '东北';
  pinyin: string;
  level: 'province' | 'prefecture';
  adcode?: number;
}

/**
 * 停留记录：粗粒度模型，不要求精确的到达/离开日期。
 * 用户只需估算「停留了多少天」+「最后一次在那里是什么时候」。
 * 同一城市允许有多条记录（例如老家+大学城市分开记），互不校验重叠。
 */
export interface VisitRecord {
  id: string;
  city_id: string;
  duration_days: number;
  last_stay_date: string;
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
  is_admin: boolean;
  created_at: string;
}

export interface ImportVisitRow {
  username?: string;
  name?: string;
  target_user_id?: string;
  province: string;
  city: string;
  duration_days: number;
  last_stay_date: string;
  notes?: string;
  city_id?: string;
  error?: string;
  notice?: string;
}
