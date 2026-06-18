import { ChangeEvent, lazy, Suspense, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import DateInput from './ui/DateInput';
import FuzzySelect from './ui/FuzzySelect';
import DrillDownStats from './DrillDownStats';

// 仅管理员可见，按需加载，避免普通用户打开个人资料时也下载这部分代码
const AdminPanel = lazy(() => import('./AdminPanel'));
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import { updateMe } from '../store/api';
import type { ImportVisitRow, VisitRecord } from '../types';
import { visitDays } from '../utils/date';

type ProfileTab = 'profile' | 'visits' | 'admin' | 'settings';

const todayStr = () => new Date().toISOString().slice(0, 10);

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  return normalize(value).replace(/\//g, '-');
}

function numberValue(value: unknown) {
  const n = Number(normalize(value));
  return Number.isFinite(n) ? n : NaN;
}

function isValidDateText(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function findCity(province: string, city: string) {
  const shortProvince = province.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, '');
  const shortCity = city.replace(/市|地区|自治州|盟/g, '');
  return CITIES.find((item) => item.province === shortProvince && item.city_name === shortCity)
    ?? CITIES.find((item) => item.province === shortProvince && (item.city_name.includes(shortCity) || shortCity.includes(item.city_name)));
}

function writeWorkbook(filename: string, rows: Array<Record<string, string | number | undefined>>) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ['省份', '城市', '停留天数', '最后停留日期', '备注'] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '访问记录');
  XLSX.writeFile(workbook, filename);
}

export default function UserProfile() {
  const currentUser = useStore((s) => s.currentUser);
  const visits = useStore((s) => s.visits);
  const settings = useStore((s) => s.settings);
  const saveVisit = useStore((s) => s.saveVisit);
  const deleteVisit = useStore((s) => s.deleteVisit);
  const bulkCreateVisits = useStore((s) => s.bulkCreateVisits);
  const updateSettings = useStore((s) => s.updateSettings);
  const clearData = useStore((s) => s.clearData);
  const profileTab = useStore((s) => s.profileTab);
  const setProfileOpen = useStore((s) => s.setProfileOpen);
  const showToast = useStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<ProfileTab>(profileTab);
  const [name, setName] = useState(currentUser?.name ?? '');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [citySearchText, setCitySearchText] = useState('');
  const [citySearchLabel, setCitySearchLabel] = useState('');
  const [cityId, setCityId] = useState('');
  const [duration, setDuration] = useState('');
  const [lastStay, setLastStay] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [editingVisit, setEditingVisit] = useState<VisitRecord | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [preview, setPreview] = useState<ImportVisitRow[]>([]);

  // 城市映射：值/标签分离，供 FuzzySelect 使用
  const CITY_LABELS = useMemo(() => Object.fromEntries(CITIES.map((c) => [c.city_id, `${c.province} · ${c.city_name}`])), []);
  const CITY_PINYINS = useMemo(() => Object.fromEntries(CITIES.map((c) => [c.city_id, c.pinyin])), []);
  const CITY_IDS = useMemo(() => CITIES.map((c) => c.city_id), []);

  const selectedCityName = useMemo(() => {
    if (!cityId) return '';
    const c = CITIES.find((item) => item.city_id === cityId);
    return c ? `${c.province} · ${c.city_name}` : '';
  }, [cityId]);

  const rows = useMemo(() => visits.map((v) => ({
    visit: v,
    city: CITIES.find((c) => c.city_id === v.city_id),
    days: visitDays(v),
  })).sort((a, b) => b.visit.last_stay_date.localeCompare(a.visit.last_stay_date)), [visits]);

  const pickCity = (id: string) => {
    setCityId(id);
    const label = CITY_LABELS[id] ?? id;
    setCitySearchText('');
    setCitySearchLabel(label);
  };

  const startEdit = (visit: VisitRecord) => {
    setEditingVisit(visit);
    setShowForm(true);
    setCityId(visit.city_id);
    setDuration(String(visit.duration_days));
    setLastStay(visit.last_stay_date);
    setNotes(visit.notes ?? '');
    const c = CITIES.find((item) => item.city_id === visit.city_id);
    const label = c ? `${c.province} · ${c.city_name}` : '';
    setCitySearchLabel(label);
    setCitySearchText(label);
  };

  const resetForm = () => {
    setEditingVisit(null);
    setShowForm(false);
    setCityId('');
    setCitySearchText('');
    setCitySearchLabel('');
    setDuration('');
    setLastStay(todayStr());
    setNotes('');
  };

  const submitVisit = async () => {
    if (!cityId) { showToast({ icon: '!', message: '请选择城市' }); return; }
    const days = Number(duration);
    if (!days || days < 1) { showToast({ icon: '!', message: '请填写停留天数（至少1天）' }); return; }
    if (!lastStay) { showToast({ icon: '!', message: '请选择最后停留日期' }); return; }
    const city = CITIES.find((c) => c.city_id === cityId);
    if (!city) return;
    await saveVisit(city, { id: editingVisit?.id, duration_days: Math.floor(days), last_stay_date: lastStay, notes });
    // saveVisit returns after success OR failure (toast shown either way).
    // Check if visits actually changed — if so, it succeeded.
    const nowVisits = useStore.getState().visits;
    const oldLen = visits.length;
    if (nowVisits.length > oldLen || editingVisit) {
      resetForm();
    }
  };

  const updateName = () => {
    if (!name.trim()) { showToast({ icon: '!', message: '名称不能为空' }); return; }
    const store = useStore.getState();
    if (store.currentUser) store.updateUserName(name.trim());
    showToast({ icon: '✓', message: '名称已更新' });
  };

  const changePassword = async () => {
    if (newPw.length < 6) { showToast({ icon: '!', message: '新密码至少6位' }); return; }
    if (newPw !== confirmPw) { showToast({ icon: '!', message: '两次密码不一致' }); return; }
    const store = useStore.getState();
    if (!store.currentUser) return;
    try {
      await updateMe({ password: newPw });
      showToast({ icon: '✓', message: '密码已更新' });
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      showToast({ icon: '!', message: err?.message || '密码更新失败' });
    }
  };

  const download = () => {
    writeWorkbook('城市足迹备份.xlsx', rows.map(({ visit, city, days }) => ({
      省份: city?.province ?? '',
      城市: city?.city_name ?? visit.city_id,
      停留天数: days,
      最后停留日期: visit.last_stay_date,
      备注: visit.notes ?? '',
    })));
  };

  const downloadTemplate = () => {
    writeWorkbook('城市足迹导入模板.xlsx', [{
      省份: '广东',
      城市: '广州',
      停留天数: 365,
      最后停留日期: '2024-01-01',
      备注: '示例',
    }]);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const existingCityIds = new Set(visits.map((visit) => visit.city_id));
    setPreview(records.map((record) => {
      const province = normalize(record['省份']);
      const city = normalize(record['城市']);
      const duration_days = numberValue(record['停留天数']);
      const last_stay_date = dateValue(record['最后停留日期']);
      const notesValue = normalize(record['备注']);
      const matched = city ? findCity(province, city) : undefined;
      const row: ImportVisitRow = { province, city, duration_days, last_stay_date, notes: notesValue || undefined, city_id: matched?.city_id };
      if (!city) row.error = '城市必填';
      else if (!matched) row.error = '城市未匹配';
      else if (!Number.isFinite(duration_days) || !Number.isInteger(duration_days) || duration_days < 1) row.error = '停留天数无效';
      else if (!isValidDateText(last_stay_date)) row.error = '日期无效';
      else if (existingCityIds.has(matched.city_id)) row.error = '城市已存在';
      return row;
    }));
    event.target.value = '';
  };

  const confirmImport = async () => {
    await bulkCreateVisits(preview.filter((row) => !row.error && row.city_id).map((row) => ({
      city_id: row.city_id as string,
      duration_days: row.duration_days,
      last_stay_date: row.last_stay_date,
      notes: row.notes,
    })));
    setPreview([]);
  };

  const confirmClear = () => {
    if (window.confirm('确定清空所有数据？此操作不可恢复。')) void clearData();
  };

  if (!currentUser) return null;

  const tabs: Array<{ id: ProfileTab; label: string }> = [
    { id: 'profile', label: '个人信息' },
    { id: 'visits', label: '访问记录' },
    ...(currentUser.is_admin ? [{ id: 'admin' as ProfileTab, label: '系统管理' }] : []),
    { id: 'settings', label: '系统设置' },
  ];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-xl">
        <div className="modal-head">
          <h2>{currentUser.name}</h2>
          <button className="icon-btn" onClick={() => setProfileOpen(false)}>×</button>
        </div>

        <div className="mode-pill profile-tabs" style={{ marginBottom: 20 }}>
          {tabs.map((item) => (
            <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setShowStats(false); }}>{item.label}</button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="stack">
            <div className="form-row">
              <span className="label-sm">用户名（登录用）</span>
              <input className="input" value={currentUser.username} readOnly style={{ background: 'var(--color-surface-container-low)', cursor: 'not-allowed' }} />
            </div>

            <div className="form-row">
              <span className="label-sm">昵称</span>
              {editingName ? (
                <>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入新昵称" />
                  <div className="actions">
                    <button className="btn-primary" onClick={() => { updateName(); setEditingName(false); }}>保存</button>
                    <button className="btn-outline" onClick={() => { setName(currentUser.name); setEditingName(false); }}>取消</button>
                  </div>
                </>
              ) : (
                <input className="input" value={currentUser.name} readOnly style={{ background: 'var(--color-surface-container-low)', cursor: 'default' }} />
              )}
            </div>

            <div className="actions">
              <button className="btn-primary" onClick={() => { setName(currentUser.name); setEditingName(true); }}>修改昵称</button>
              <button className="btn-primary" onClick={() => setEditingPassword(true)}>修改密码</button>
            </div>

            {editingPassword && (
              <div className="card" style={{ padding: 16 }}>
                <div className="form-row">
                  <span className="label-sm">新密码</span>
                  <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="至少6位" />
                </div>
                <div className="form-row">
                  <span className="label-sm">确认密码</span>
                  <input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="再次输入新密码" />
                </div>
                <div className="actions">
                  <button className="btn-primary" onClick={async () => { await changePassword(); setEditingPassword(false); }}>更新密码</button>
                  <button className="btn-outline" onClick={() => { setNewPw(''); setConfirmPw(''); setEditingPassword(false); }}>取消</button>
                </div>
              </div>
            )}

            <p className="muted">
              {currentUser.is_admin ? '🔑 管理员' : '👤 普通用户'} · 于 {new Date(currentUser.created_at).toLocaleDateString('zh-CN')} 创建
            </p>
          </div>
        )}

        {tab === 'visits' && !showStats && (
          <>
            {/* 访问记录列表 */}
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>省份</th><th>城市</th><th>天数</th><th>最后停留</th><th>备注</th><th>操作</th></tr></thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32 }} className="muted">暂无访问记录</td></tr>
                  ) : rows.map(({ visit, city, days }) => (
                    <tr key={visit.id}>
                      <td>{city?.province ?? '-'}</td>
                      <td>{city?.city_name ?? visit.city_id}</td>
                      <td><strong>{days}</strong> 天</td>
                      <td>{visit.last_stay_date}</td>
                      <td>{visit.notes || '-'}</td>
                      <td className="mini-actions">
                        <button className="btn-outline" onClick={() => startEdit(visit)}>编辑</button>
                        <button className="btn-danger" onClick={() => void deleteVisit(visit.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 操作按钮行 */}
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn-primary" onClick={() => setShowForm(true)}>＋ 添加访问</button>
              <button className="btn-outline" onClick={() => fileRef.current?.click()}>📥 导入数据</button>
              <button className="btn-primary" onClick={download}>📤 导出数据</button>
              <button className="btn-outline" onClick={downloadTemplate}>📥 下载模板</button>
              <button className="btn-danger" onClick={confirmClear}>清空所有数据</button>
              <button className="btn-outline" onClick={() => setShowStats(true)} style={{ marginLeft: 'auto' }}>📊 统计</button>
            </div>

            {preview.length > 0 && (
              <div className="import-preview card">
                <div className="panel-title">
                  <strong>导入预览</strong>
                  <span className="muted">
                    ✅ 有效 {preview.filter((row) => !row.error).length} 行 / ⚠️ 跳过 {preview.filter((row) => row.error === '城市已存在').length} 行 / ❌ 错误 {preview.filter((row) => row.error && row.error !== '城市已存在').length} 行
                  </span>
                </div>
                <div className="table-wrap compact">
                  <table className="data-table">
                    <thead><tr><th>省份</th><th>城市</th><th>天数</th><th>最后停留</th><th>备注</th><th>状态</th></tr></thead>
                    <tbody>
                      {preview.map((row, index) => {
                        const isDuplicate = row.error === '城市已存在';
                        return (
                          <tr key={`${row.city}-${index}`} style={isDuplicate ? { background: 'color-mix(in srgb, #f59e0b 12%, transparent)' } : row.error ? { background: 'color-mix(in srgb, var(--color-error) 10%, transparent)' } : undefined}>
                            <td>{row.province || '-'}</td>
                            <td>{row.city || '-'}</td>
                            <td>{Number.isFinite(row.duration_days) ? row.duration_days : '-'}</td>
                            <td>{row.last_stay_date || '-'}</td>
                            <td>{row.notes || '-'}</td>
                            <td className={row.error && !isDuplicate ? 'danger-text' : ''}>{row.error ?? '✓ 可导入'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="btn-primary" disabled={preview.every((row) => row.error)} onClick={() => void confirmImport()}>确认导入</button>
                  <button className="btn-outline" onClick={() => setPreview([])}>取消</button>
                </div>
              </div>
            )}

            {/* 添加/编辑表单 */}
            {showForm && (
              <div className="card" style={{ marginTop: 12, padding: 16 }}>
                <div className="form-row">
                  <span className="label-sm">搜索并选择城市</span>
                  <FuzzySelect
                    options={CITY_IDS}
                    optionLabels={CITY_LABELS}
                    searchKeys={CITY_PINYINS}
                    value={citySearchText}
                    selectedLabel={citySearchLabel}
                    onChange={(text) => {
                      setCitySearchText(text);
                      setCitySearchLabel('');
                      if (cityId) setCityId('');
                    }}
                    onSelect={(id) => pickCity(id)}
                    placeholder="搜索选择城市"
                    maxResults={12}
                  />
                  {selectedCityName && cityId && (
                    <p className="muted" style={{ marginTop: 6 }}>已选：{selectedCityName}</p>
                  )}
                </div>

                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  <div className="form-row">
                    <span className="label-sm">停留天数</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="例如 365，无需精确"
                    />
                  </div>
                  <div className="form-row">
                    <span className="label-sm">最后停留日期</span>
                    <DateInput value={lastStay} onChange={setLastStay} />
                  </div>
                  <div className="form-row">
                    <span className="label-sm">备注</span>
                    <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="可选，例如：大学期间 / 老家" />
                  </div>
                </div>

                <div className="actions" style={{ marginTop: 8 }}>
                  <button className="btn-primary" onClick={submitVisit}>{editingVisit ? '保存修改' : '添加记录'}</button>
                  <button className="btn-outline" onClick={resetForm}>取消</button>
                </div>
              </div>
            )}

            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onFile} />
          </>
        )}

        {tab === 'visits' && showStats && (
          <>
            <button className="back-btn" onClick={() => setShowStats(false)} style={{ marginBottom: 12 }}>← 返回访问列表</button>
            <DrillDownStats embedded />
          </>
        )}

        {tab === 'admin' && (
          <div className="stack">
            <Suspense fallback={<p className="muted">加载管理面板…</p>}>
              <AdminPanel embedded />
            </Suspense>
          </div>
        )}

        {tab === 'settings' && (
          <div className="stack">
            <div className="settings-section" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
              <label>
                <span className="label-sm">主题</span>
                <select className="input" value={settings.theme} onChange={(event) => void updateSettings({ ...settings, theme: event.target.value as typeof settings.theme })}>
                  <option value="linear">Linear · 暗黑</option>
                  <option value="stripe">Stripe · 白紫</option>
                  <option value="rose">Rose · 樱花</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
