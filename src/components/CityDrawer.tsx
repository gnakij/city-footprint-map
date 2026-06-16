import { useMemo, useState } from 'react';
import type { CityData, VisitRecord } from '../types';
import { useStore } from '../store/useStore';
import { visitDays } from '../utils/date';

const today = () => new Date().toISOString().slice(0, 10);

export default function CityDrawer({ city }: { city: CityData }) {
  const visits = useStore((state) => state.visits);
  const saveVisit = useStore((state) => state.saveVisit);
  const deleteVisit = useStore((state) => state.deleteVisit);
  const setDrawerOpen = useStore((state) => state.setDrawerOpen);
  const showToast = useStore((state) => state.showToast);
  const cityVisits = useMemo(() => visits.filter((record) => record.city_id === city.city_id).sort((a, b) => b.arrival_date.localeCompare(a.arrival_date)), [city.city_id, visits]);
  const [editing, setEditing] = useState<VisitRecord | null>(null);
  const [arrival, setArrival] = useState(today());
  const [departure, setDeparture] = useState(today());
  const [notes, setNotes] = useState('');

  const startEdit = (record: VisitRecord) => {
    setEditing(record);
    setArrival(record.arrival_date);
    setDeparture(record.departure_date);
    setNotes(record.notes ?? '');
  };

  const resetForm = () => {
    setEditing(null);
    setArrival(today());
    setDeparture(today());
    setNotes('');
  };

  const save = () => {
    if (!arrival || !departure || departure < arrival) {
      showToast({ icon: '!', message: '请检查到达和离开日期' });
      return;
    }
    void saveVisit(city, { id: editing?.id, arrival_date: arrival, departure_date: departure, notes });
  };

  return (
    <aside className="drawer city-drawer">
      <div className="drawer-head">
        <button className="back-btn" onClick={() => setDrawerOpen(false)} aria-label="返回">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          返回
        </button>
        <button className="icon-btn" onClick={() => setDrawerOpen(false)}>×</button>
      </div>
      <h2>{city.city_name}</h2>
      <p className="label-sm">{city.province} · {city.region}</p>
      <span className="badge">累计 {cityVisits.reduce((sum, record) => sum + visitDays(record), 0)} 天 · {cityVisits.length} 次访问</span>

      <div className="visit-form">
        <div className="form-grid-2">
          <label className="form-row">
            <span className="label-sm">到达日期</span>
            <input className="input" type="date" value={arrival} onChange={(event) => setArrival(event.target.value)} />
          </label>
          <label className="form-row">
            <span className="label-sm">离开日期</span>
            <input className="input" type="date" value={departure} onChange={(event) => setDeparture(event.target.value)} />
          </label>
        </div>
        <label className="form-row">
          <span className="label-sm">备注</span>
          <textarea className="input textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="可选" />
        </label>
        <div className="label-sm">停留天数：{visitDays({ arrival_date: arrival, departure_date: departure }) || '-'}</div>
        <div className="actions">
          <button className="btn-primary" onClick={save}>{editing ? '保存修改' : '新增访问'}</button>
          {editing && <button className="btn-outline" onClick={resetForm}>取消编辑</button>}
        </div>
      </div>

      <div className="visit-stack">
        {cityVisits.map((record) => (
          <div className="visit-card" key={record.id}>
            <div>
              <strong>{record.arrival_date} 至 {record.departure_date}</strong>
              <div className="label-sm">{visitDays(record)} 天{record.notes ? ` · ${record.notes}` : ''}</div>
            </div>
            <div className="mini-actions">
              <button className="btn-outline" onClick={() => startEdit(record)}>编辑</button>
              <button className="btn-danger" onClick={() => void deleteVisit(record.id)}>删除</button>
            </div>
          </div>
        ))}
        {cityVisits.length === 0 && <p className="empty-state">暂无访问记录</p>}
      </div>
    </aside>
  );
}
