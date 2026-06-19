import type { VisitRecord } from '../types';

/**
 * 返回一条记录的停留天数。新模型下天数是用户直接填写的整数，
 * 不再通过到达/离开日期计算区间。
 */
export function visitDays(record: Pick<VisitRecord, 'duration_days'>) {
  const days = record.duration_days;
  if (!Number.isFinite(days) || days < 1) return 0;
  return Math.floor(days);
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
