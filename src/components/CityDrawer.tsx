import { useMemo, useState } from 'react';
import type { CityData } from '../types';
import { useStore } from '../store/useStore';

export default function CityDrawer({ city }: { city: CityData }) {
  const mode = useStore((state) => state.mode);
  const durationRecords = useStore((state) => state.durationRecords);
  const departureRecords = useStore((state) => state.departureRecords);
  const saveDuration = useStore((state) => state.saveDuration);
  const saveDeparture = useStore((state) => state.saveDeparture);
  const deleteCityRecord = useStore((state) => state.deleteCityRecord);
  const setDrawerOpen = useStore((state) => state.setDrawerOpen);
  const showToast = useStore((state) => state.showToast);
  const today = new Date().toISOString().slice(0, 10);
  const duration = durationRecords.find((record) => record.city_id === city.city_id);
  const departure = departureRecords.find((record) => record.city_id === city.city_id);
  const [days, setDays] = useState(duration?.days ?? 1);
  const [date, setDate] = useState(departure?.departure_date ?? today);
  const hasRecord = useMemo(() => mode === 'duration' ? Boolean(duration) : Boolean(departure), [departure, duration, mode]);

  const save = () => {
    if (mode === 'duration') {
      if (!Number.isFinite(days) || days < 1) {
        showToast({ icon: '!', message: '停留天数至少为1天' });
        return;
      }
      void saveDuration(city, Math.floor(days));
      return;
    }
    if (!date || date > today) {
      showToast({ icon: '!', message: '离开日期不能晚于今天' });
      return;
    }
    void saveDeparture(city, date);
  };

  return (
    <aside className="drawer city-drawer">
      <div className="drawer-head">
        <div>
          <h2>{city.city_name}</h2>
          <p className="label-sm">{city.province} · {city.region}</p>
        </div>
        <button className="icon-btn" onClick={() => setDrawerOpen(false)}>×</button>
      </div>
      <span className="badge">{mode === 'duration' ? '停留时长' : '最后离开'}</span>
      {mode === 'duration' ? (
        <label className="form-row">
          <span className="label-sm">停留天数</span>
          <input className="input" type="number" min={1} value={days} onChange={(event) => setDays(Number(event.target.value))} />
        </label>
      ) : (
        <label className="form-row">
          <span className="label-sm">最后离开日期</span>
          <input className="input" type="date" max={today} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      )}
      <div className="actions">
        <button className="btn-primary" onClick={save}>保存</button>
        <button className="btn-outline" onClick={() => setDrawerOpen(false)}>取消</button>
        {hasRecord && <button className="btn-danger" onClick={() => void deleteCityRecord(city)}>清除</button>}
      </div>
    </aside>
  );
}
