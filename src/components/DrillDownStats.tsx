import { useMemo, useState } from 'react';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import { visitDays } from '../utils/date';

type Level = 'province' | 'city' | 'visit';
type SortKey = 'days' | 'name';
type SortDir = 'asc' | 'desc';

export default function DrillDownStats() {
  const visits = useStore((state) => state.visits);
  const setStatsOpen = useStore((state) => state.setStatsOpen);
  const [level, setLevel] = useState<Level>('province');
  const [province, setProvince] = useState('');
  const [cityId, setCityId] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('days');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const cityById = useMemo(() => new Map(CITIES.map((city) => [city.city_id, city])), []);

  const rows = useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1;
    if (level === 'province') {
      const map = new Map<string, number>();
      for (const visit of visits) {
        const city = cityById.get(visit.city_id);
        if (city) map.set(city.province, (map.get(city.province) ?? 0) + visitDays(visit));
      }
      return Array.from(map.entries()).map(([name, days]) => ({ id: name, name, days })).sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name, 'zh') * factor : (a.days - b.days) * factor);
    }
    if (level === 'city') {
      const map = new Map<string, number>();
      for (const visit of visits) {
        const city = cityById.get(visit.city_id);
        if (city?.province === province) map.set(city.city_id, (map.get(city.city_id) ?? 0) + visitDays(visit));
      }
      return Array.from(map.entries()).map(([id, days]) => ({ id, name: cityById.get(id)?.city_name ?? id, days })).sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name, 'zh') * factor : (a.days - b.days) * factor);
    }
    return visits.filter((visit) => visit.city_id === cityId).map((visit) => ({ id: visit.id, name: `${visit.arrival_date} 至 ${visit.departure_date}`, days: visitDays(visit), notes: visit.notes })).sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name, 'zh') * factor : (a.days - b.days) * factor);
  }, [cityById, cityId, level, province, sortDir, sortKey, visits]);

  const goBack = () => {
    if (level === 'visit') {
      setLevel('city');
      setCityId('');
      return;
    }
    if (level === 'city') {
      setLevel('province');
      setProvince('');
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-wide">
        <div className="modal-head">
          <h2>累计天数明细</h2>
          <button className="icon-btn" onClick={() => setStatsOpen(false)}>×</button>
        </div>
        <div className="drill-toolbar">
          {level !== 'province' && <button className="btn-outline" onClick={goBack}>返回上级</button>}
          <select className="input" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="days">按天数</option>
            <option value="name">按名称</option>
          </select>
          <select className="input" value={sortDir} onChange={(event) => setSortDir(event.target.value as SortDir)}>
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
        </div>
        <div className="drill-list">
          {rows.map((row) => (
            <button
              key={row.id}
              className="drill-row"
              onClick={() => {
                if (level === 'province') { setProvince(row.id); setLevel('city'); }
                else if (level === 'city') { setCityId(row.id); setLevel('visit'); }
              }}
            >
              <span><strong>{row.name}</strong>{'notes' in row && row.notes ? <small>{String(row.notes)}</small> : null}</span>
              <b>{row.days} 天</b>
            </button>
          ))}
          {rows.length === 0 && <p className="empty-state">暂无数据</p>}
        </div>
      </section>
    </div>
  );
}
