import type { ExportData } from '../types';

export function importData(jsonString: string): { success: boolean; data?: ExportData; error?: string } {
  try {
    const data = JSON.parse(jsonString) as ExportData;
    if (!data || !Array.isArray(data.visits)) {
      return { success: false, error: '备份文件格式不正确' };
    }
    if (!Array.isArray(data.achievements) || !data.settings?.theme) {
      return { success: false, error: '备份文件缺少必要字段' };
    }
    return { success: true, data };
  } catch {
    return { success: false, error: '无法解析备份文件' };
  }
}
