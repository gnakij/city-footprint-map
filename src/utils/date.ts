import type { VisitRecord } from '../types';

export function visitDays(record: Pick<VisitRecord, 'arrival_date' | 'departure_date'>) {
  const start = new Date(`${record.arrival_date}T00:00:00`).getTime();
  const end = new Date(`${record.departure_date}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}
