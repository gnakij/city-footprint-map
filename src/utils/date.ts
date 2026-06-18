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
