import { useMemo, useState } from 'react';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import type { SortMode } from '../types';
import { visitDays } from '../utils/date';
import Modal from './Modal';
import { Tabs } from './ui';

const SORT_TABS: Array<{ id: SortMode; label: string }> = [
  { id: 'days', label: '按天数' },
  { id: 'name', label: '按名称' },
];

export default function DrillDownStats({ embedded = false }: { embedded?: boolean }) {
  const visits = useStore((state) => state.visits);
  const setStatsOpen = useStore((state) => state.setStatsOpen);
  const [province, setProvince] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('days');

  const provinceRows = useMemo(() => {
    const map = new Map<string, { name: string; days: number; visits: number }>();
    for (const visit of visits) {
      const city = CITIES.find((item) => item.city_id === visit.city_id);
      if (!city) continue;
      const row = map.get(city.province) ?? { name: city.province, days: 0, visits: 0 };
      row.days += visitDays(visit);
      row.visits += 1;
      map.set(city.province, row);
    }
    return Array.from(map.values()).sort((a, b) => sort === 'days' ? b.days - a.days : a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }, [sort, visits]);

  const cityRows = useMemo(() => {
    if (!province) return [];
    return CITIES.filter((city) => city.province === province).map((city) => {
      const cityVisits = visits.filter((visit) => visit.city_id === city.city_id);
      return { city, days: cityVisits.reduce((sum, visit) => sum + visitDays(visit), 0), visits: cityVisits.length };
    }).filter((row) => row.visits > 0).sort((a, b) => sort === 'days' ? b.days - a.days : a.city.city_name.localeCompare(b.city.city_name, 'zh-Hans-CN'));
  }, [province, sort, visits]);

  const recordRows = useMemo(() => visits.filter((visit) => visit.city_id === cityId).sort((a, b) => b.last_stay_date.localeCompare(a.last_stay_date)), [cityId, visits]);
  const activeCity = CITIES.find((city) => city.city_id === cityId);
  const title = cityId ? activeCity?.city_name ?? '城市统计' : province ?? '省份统计';

  const content = (
    <>
      {embedded && (
        <div className="modal-head embedded-head">
          <div>
            <h2>{title}</h2>
            {(province || cityId) && <button className="back-btn" onClick={() => cityId ? setCityId(null) : setProvince(null)}>← 返回</button>}
          </div>
        </div>
      )}
      {!embedded && (province || cityId) && <button className="back-btn mb-12" onClick={() => cityId ? setCityId(null) : setProvince(null)}>← 返回</button>}
      <Tabs items={SORT_TABS} value={sort} onChange={setSort} className="sort-pill" />

      {!province && !cityId && provinceRows.map((row) => (
        <button key={row.name} className="list-button" onClick={() => setProvince(row.name)}>
          <span>{row.name}</span><small>{row.days} 天 · {row.visits} 次</small>
        </button>
      ))}

      {province && !cityId && cityRows.map((row) => (
        <button key={row.city.city_id} className="list-button" onClick={() => setCityId(row.city.city_id)}>
          <span>{row.city.city_name}</span><small>{row.days} 天 · {row.visits} 次</small>
        </button>
      ))}

      {cityId && recordRows.map((visit) => (
        <div key={visit.id} className="visit-card">
          <strong>{visitDays(visit)} 天</strong>
          <p className="muted">最后停留 {visit.last_stay_date}{visit.notes ? ` · ${visit.notes}` : ''}</p>
        </div>
      ))}
    </>
  );

  if (embedded) return <div className="embedded-panel">{content}</div>;

  return (
    <Modal title={title} className="stats-modal" onClose={() => setStatsOpen(false)}>
      {content}
    </Modal>
  );
}
