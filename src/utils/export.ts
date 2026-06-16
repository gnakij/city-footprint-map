import type { AppSettings, DurationRecord, ExportData } from '../types';

export function exportData(
  records: DurationRecord[],
  achievements: string[],
  settings: AppSettings,
  departureRecords = [],
): ExportData {
  return {
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    duration_records: records,
    departure_records: departureRecords,
    achievements,
    settings,
  };
}

export function importData(jsonString: string): { success: boolean; data?: ExportData; error?: string } {
  try {
    const data = JSON.parse(jsonString) as ExportData;
    if (!data || !Array.isArray(data.duration_records) || !Array.isArray(data.departure_records)) {
      return { success: false, error: '备份文件格式不正确' };
    }
    if (!Array.isArray(data.achievements) || !data.settings?.theme || !data.settings?.defaultMode) {
      return { success: false, error: '备份文件缺少必要字段' };
    }
    return { success: true, data };
  } catch {
    return { success: false, error: '无法解析备份文件' };
  }
}
