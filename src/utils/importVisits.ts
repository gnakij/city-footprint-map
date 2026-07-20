import { CITIES } from '../data/cities';
import type { CityData } from '../types';
import { formatLocalDate } from './date';

type XlsxModule = typeof import('xlsx');

export function normalizeImportCell(value: unknown) {
  return String(value ?? '').trim();
}

export function importDateText(value: unknown, xlsx: XlsxModule) {
  if (value instanceof Date) return formatLocalDate(value);
  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  return normalizeImportCell(value).replace(/\//g, '-');
}

export function importNumber(value: unknown) {
  const n = Number(normalizeImportCell(value));
  return Number.isFinite(n) ? n : NaN;
}

export function findImportCity(province: string, city: string): CityData | undefined {
  const shortProvince = province.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, '');
  const shortCity = city.replace(/市|地区|自治州|盟/g, '');
  return CITIES.find((item) => item.province === shortProvince && item.city_name === shortCity)
    ?? CITIES.find((item) => item.province === shortProvince && (item.city_name.includes(shortCity) || shortCity.includes(item.city_name)));
}

export function importDuplicateKey(input: {
  targetUserId?: string;
  cityId?: string;
  durationDays: number;
  lastStayDate: string;
  notes?: string;
}) {
  return [
    input.targetUserId ?? '',
    input.cityId ?? '',
    Number.isFinite(input.durationDays) ? String(input.durationDays) : '',
    input.lastStayDate,
    input.notes ?? '',
  ].join('|');
}
