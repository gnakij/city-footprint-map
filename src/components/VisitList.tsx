import { ChangeEvent, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import type { CityData, ImportVisitRow, VisitRecord } from '../types';
import { visitDays } from '../utils/date';

function asDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return text.slice(0, 10);
}

function resolveCity(province: string, city: string) {
  const cleanProvince = province.replace(/省|市|自治区|特别行政区/g, '');
  const cleanCity = city.replace(/市|地区|自治州|盟/g, '');
  return CITIES.find((item) => item.province === cleanProvince && item.city_name === cleanCity)
    ?? CITIES.find((item) => item.province === cleanProvince && (item.city_name.includes(cleanCity) || cleanCity.includes(item.city_name)));
}

export default function VisitList() {
  const visits = useStore((state) => state.visits);
  const setVisitsOpen = useStore((state) => state.setVisitsOpen);
  const saveVisit = useStore((state) => state.saveVisit);
  const deleteVisit = useStore((state) => state.deleteVisit);
  const bulkCreateVisits = useStore((state) => state.bulkCreateVisits);
  const showToast = useStore((state) => state.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<VisitRecord | null>(null);
  const [cityId, setCityId] = useState(CITIES[0].city_id);
  const [arrival, setArrival] = useState(new Date().toISOString().slice(0, 10));
  const [departure, setDeparture] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<ImportVisitRow[]>([]);

  const cityById = useMemo(() => new Map(CITIES.map((city) => [city.city_id, city])), []);
  const sortedVisits = useMemo(() => [...visits].sort((a, b) => b.arrival_date.localeCompare(a.arrival_date)), [visits]);

  const startEdit = (record: VisitRecord) => {
    setEditing(record);
    setCityId(record.city_id);
    setArrival(record.arrival_date);
    setDeparture(record.departure_date);
    setNotes(record.notes ?? '');
  };

  const resetForm = () => {
    setEditing(null);
    setCityId(CITIES[0].city_id);
    setArrival(new Date().toISOString().slice(0, 10));
    setDeparture(new Date().toISOString().slice(0, 10));
    setNotes('');
  };

  const save = () => {
    const city = cityById.get(cityId);
    if (!city) return;
    void saveVisit(city, { id: editing?.id, arrival_date: arrival, departure_date: departure, notes });
    resetForm();
  };

  const onExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const parsed = rows.map((row) => {
      const province = String(row['省份'] ?? '').trim();
      const city = String(row['城市'] ?? '').trim();
      const arrival_date = asDate(row['到达日期']);
      const departure_date = asDate(row['离开日期']);
      const matched = resolveCity(province, city);
      const error = !matched ? '城市未匹配' : !arrival_date || !departure_date || departure_date < arrival_date ? '日期无效' : undefined;
      return { province, city, arrival_date, departure_date, notes: String(row['备注'] ?? '').trim(), city_id: matched?.city_id, error };
    });
    setPreview(parsed);
    event.target.value = '';
  };

  const confirmImport = async () => {
    const valid = preview.filter((row) => row.city_id && !row.error);
    if (!valid.length) {
      showToast({ icon: '!', message: '没有可导入的有效记录' });
      return;
    }
    await bulkCreateVisits(valid.map((row) => ({ city_id: row.city_id!, arrival_date: row.arrival_date, departure_date: row.departure_date, notes: row.notes })));
    setPreview([]);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-xl">
        <div className="modal-head">
          <h2>访问明细</h2>
          <button className="icon-btn" onClick={() => setVisitsOpen(false)}>×</button>
        </div>
        <div className="visit-editor">
          <select className="input" value={cityId} onChange={(event) => setCityId(event.target.value)}>
            {CITIES.map((city) => <option key={city.city_id} value={city.city_id}>{city.province} · {city.city_name}</option>)}
          </select>
          <input className="input" type="date" value={arrival} onChange={(event) => setArrival(event.target.value)} />
          <input className="input" type="date" value={departure} onChange={(event) => setDeparture(event.target.value)} />
          <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="备注" />
          <button className="btn-primary" onClick={save}>{editing ? '保存' : '新增访问'}</button>
          {editing && <button className="btn-outline" onClick={resetForm}>取消</button>}
          <button className="btn-outline" onClick={() => fileRef.current?.click()}>导入Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onExcel} />
        </div>

        {preview.length > 0 && (
          <div className="import-preview card">
            <div className="modal-head">
              <strong>导入预览</strong>
              <div className="actions">
                <button className="btn-primary" onClick={() => void confirmImport()}>确认导入</button>
                <button className="btn-outline" onClick={() => setPreview([])}>取消</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>省份</th><th>城市</th><th>到达日期</th><th>离开日期</th><th>备注</th><th>状态</th></tr></thead>
                <tbody>{preview.map((row, index) => <tr key={index}><td>{row.province}</td><td>{row.city}</td><td>{row.arrival_date}</td><td>{row.departure_date}</td><td>{row.notes}</td><td>{row.error ?? '可导入'}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>省份</th><th>城市</th><th>到达日期</th><th>离开日期</th><th>停留天数</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>
              {sortedVisits.map((record) => {
                const city = cityById.get(record.city_id) as CityData | undefined;
                return (
                  <tr key={record.id}>
                    <td>{city?.province ?? '-'}</td>
                    <td>{city?.city_name ?? record.city_id}</td>
                    <td>{record.arrival_date}</td>
                    <td>{record.departure_date}</td>
                    <td>{visitDays(record)}</td>
                    <td>{record.notes ?? ''}</td>
                    <td><div className="mini-actions"><button className="btn-outline" onClick={() => startEdit(record)}>编辑</button><button className="btn-danger" onClick={() => void deleteVisit(record.id)}>删除</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
