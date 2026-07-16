import type { VisitRecord } from '../types';

/**
 * 返回一条记录的停留天数。新模型下天数是用户直接填写的整数，
 * 不再通过到达/离开日期计算区间。
 */
export function visitDays(record: Pick<VisitRecord, 'duration_days'>) {
  const days = record.duration_days;
  if (!Number.isFinite(days) || days < 1) return 0;
  return Number.isInteger(days) ? days : 0;
}

export function todayLocalDateText(date = new Date()) {
  return formatLocalDate(date);
}

export function daysSinceDate(dateText: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return Number.POSITIVE_INFINITY;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - date.getTime()) / 86400000);
  return Math.max(0, diff);
}

export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isValidDateText(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
