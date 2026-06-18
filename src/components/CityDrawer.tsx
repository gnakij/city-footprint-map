import { useMemo, useState } from 'react';
import DateInput from './ui/DateInput';
import type { CityData, VisitRecord } from '../types';
import { useStore } from '../store/useStore';
import { visitDays } from '../utils/date';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function CityDrawer({ city }: { city: CityData }) {
  const visits = useStore((state) => state.visits);
  const saveVisit = useStore((state) => state.saveVisit);
  const deleteVisit = useStore((state) => state.deleteVisit);
  const setDrawerOpen = useStore((state) => state.setDrawerOpen);
  const cityVisits = useMemo(() => visits.filter((record) => record.city_id === city.city_id), [city.city_id, visits]);
  const totalDays = useMemo(() => cityVisits.reduce((sum, record) => sum + visitDays(record), 0), [cityVisits]);
  const [editing, setEditing] = useState<VisitRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [duration, setDuration] = useState('');
  const [lastStay, setLastStay] = useState(todayStr());
  const [notes, setNotes] = useState('');

  const startEdit = (record: VisitRecord) => {
    setEditing(record);
    setShowForm(true);
    setDuration(String(record.duration_days));
    setLastStay(record.last_stay_date);
    setNotes(record.notes ?? '');
  };

  const resetForm = () => {
    setEditing(null);
    setShowForm(false);
    setDuration('');
    setLastStay(todayStr());
    setNotes('');
  };

  const submit = async () => {
    const days = Number(duration);
    if (!days || days < 1) return;
    if (!lastStay) return;
    await saveVisit(city, { id: editing?.id, duration_days: Math.floor(days), last_stay_date: lastStay, notes });
    const nowVisits = useStore.getState().visits;
    if (nowVisits.length > visits.length || editing) {
      resetForm();
    }
  };

  return (
    <aside className="drawer city-drawer">
      <div className="drawer-head">
        <button className="back-btn" onClick={() => setDrawerOpen(false)} aria-label="返回">← 返回</button>
        <button className="icon-btn" onClick={() => setDrawerOpen(false)}>×</button>
      </div>
      <h2>{city.city_name}</h2>
      <p className="label-sm">{city.province} · {city.region}</p>
      <span className="badge">{cityVisits.length ? `共 ${totalDays} 天 · ${cityVisits.length} 条记录` : '未记录'}</span>

      {/* 访问记录列表 */}
      <div className="drawer-list">
        {cityVisits.map((record) => (
          <div key={record.id} className="visit-card">
            <div>
              <strong>{visitDays(record)} 天</strong>
              <p className="muted">最后停留 {record.last_stay_date}{record.notes ? ` · ${record.notes}` : ''}</p>
            </div>
            <div className="row-actions">
              <button className="btn-outline small" onClick={() => startEdit(record)}>编辑</button>
              <button className="btn-danger small" onClick={() => void deleteVisit(record.id)}>删除</button>
            </div>
          </div>
        ))}
        {cityVisits.length === 0 && !showForm && <p className="muted">还没有访问记录，点击下方按钮添加。</p>}
      </div>

      {/* 添加访问按钮 / 表单 */}
      {!showForm ? (
        <button className="btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={() => setShowForm(true)}>
          ＋ 添加访问
        </button>
      ) : (
        <div className="visit-form" style={{ marginTop: 16 }}>
          <label className="form-row">
            <span className="label-sm">停留天数</span>
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder="例如 30，无需精确，估算即可"
            />
          </label>
          <label className="form-row">
            <span className="label-sm">最后停留日期</span>
            <DateInput value={lastStay} onChange={setLastStay} />
          </label>
          <label className="form-row">
            <span className="label-sm">备注</span>
            <textarea className="input textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="可选，例如：大学期间 / 老家" />
          </label>
          <div className="actions">
            <button className="btn-primary" onClick={submit}>{editing ? '保存修改' : '添加访问'}</button>
            <button className="btn-outline" onClick={resetForm}>取消</button>
          </div>
        </div>
      )}
    </aside>
  );
}
