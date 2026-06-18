import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { adminExportVisits, adminImportVisits, createUser, getUsers } from '../api';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import type { ImportVisitRow } from '../types';
import type { AdminVisitExportRow } from '../api';

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

function writeAdminWorkbook(filename: string, rows: Array<Record<string, string | number | undefined>>) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ['用户名', '省份', '城市', '停留天数', '最后停留日期', '备注'] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '访问记录');
  XLSX.writeFile(workbook, filename);
}

export default function AdminPanel({ embedded = false }: { embedded?: boolean }) {
  const users = useStore((state) => state.users);
  const setAdminOpen = useStore((state) => state.setAdminOpen);
  const deleteUserAndData = useStore((state) => state.deleteUserAndData);
  const resetUserPassword = useStore((state) => state.resetUserPassword);
  const updateAnyUserName = useStore((state) => state.updateAnyUserName);
  const getSystemStats = useStore((state) => state.getSystemStats);
  const [pendingReset, setPendingReset] = useState<{ userId: string; name: string } | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [newUsername, setNewUsername] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [stats, setStats] = useState({ totalUsers: users.length, totalVisits: 0, adminUsers: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [adminTab, setAdminTab] = useState<'users' | 'data'>('users');
  const [allVisits, setAllVisits] = useState<AdminVisitExportRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [showImportTools, setShowImportTools] = useState(false);
  const [targetUserId, setTargetUserId] = useState(users[0]?.id ?? '');
  const [importPreview, setImportPreview] = useState<ImportVisitRow[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);

  const cityById = useMemo(() => new Map(CITIES.map((city) => [city.city_id, city])), []);
  const targetUser = users.find((user) => user.id === targetUserId);
  const filteredUserOptions = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const username = (user.username ?? '').toLowerCase();
      const name = user.name.toLowerCase();
      return username.includes(query) || name.includes(query);
    });
  }, [userSearch, users]);
  const ledgerVisits = useMemo(() => {
    return allVisits
      .filter((visit) => !selectedUserId || visit.user_id === selectedUserId)
      .sort((a, b) => {
        const usernameCompare = (a.username || a.name).localeCompare(b.username || b.name, 'zh-CN');
        if (usernameCompare !== 0) return usernameCompare;
        return b.last_stay_date.localeCompare(a.last_stay_date);
      });
  }, [allVisits, selectedUserId]);

  useEffect(() => {
    void getSystemStats().then(setStats);
  }, [getSystemStats, users.length]);

  useEffect(() => {
    setNames(Object.fromEntries(users.map((user) => [user.id, user.name])));
  }, [users]);

  useEffect(() => {
    if (!targetUserId && users[0]) setTargetUserId(users[0].id);
    if (targetUserId && !users.some((user) => user.id === targetUserId)) setTargetUserId(users[0]?.id ?? '');
    if (selectedUserId && !users.some((user) => user.id === selectedUserId)) setSelectedUserId('');
  }, [targetUserId, users]);

  useEffect(() => {
    if (adminTab !== 'data' || users.length === 0) return;
    void adminExportVisits(users.map((user) => user.id)).then((data) => setAllVisits(data.visits));
  }, [adminTab, users]);

  const handleCreateUser = async () => {
    const username = newUsername.trim();
    const name = newNickname.trim();
    if (!username || !name || !newPassword) {
      useStore.getState().showToast({ icon: '!', message: '请填写所有字段' });
      return;
    }
    await createUser(name, { username, password: newPassword, is_admin: false });
    setNewUsername('');
    setNewNickname('');
    setNewPassword('');
    setShowCreateModal(false);
    const refreshed = await getUsers();
    useStore.setState({ users: refreshed, toast: { icon: '✓', message: '用户已创建' } });
    void getSystemStats().then(setStats);
  };

  const handleResetPassword = async () => {
    if (!pendingReset) return;
    if (resetPw.length < 6) {
      useStore.getState().showToast({ icon: '!', message: '密码至少6位' });
      return;
    }
    if (resetPw !== resetConfirm) {
      useStore.getState().showToast({ icon: '!', message: '两次密码不一致' });
      return;
    }
    await resetUserPassword(pendingReset.userId, resetPw);
    setPendingReset(null);
    setResetPw('');
    setResetConfirm('');
  };

  const removeUser = (id: string) => {
    if (window.confirm('确定删除该用户及其所有数据？此操作不可恢复。')) void deleteUserAndData(id);
  };

  const handleNameBlur = (userId: string) => {
    const currentName = names[userId];
    const originalName = users.find((u) => u.id === userId)?.name;
    if (currentName !== undefined && currentName !== originalName) {
      void updateAnyUserName(userId, currentName);
    }
  };

  const downloadCurrentLedger = () => {
    writeAdminWorkbook('城市足迹当前视图.xlsx', ledgerVisits.map((visit) => {
      const city = cityById.get(visit.city_id);
      return {
        用户名: visit.username,
        省份: city?.province ?? '',
        城市: city?.city_name ?? visit.city_id,
        停留天数: visit.duration_days,
        最后停留日期: visit.last_stay_date,
        备注: visit.notes ?? '',
      };
    }));
    useStore.getState().showToast({ icon: '✓', message: `已导出 ${ledgerVisits.length} 条访问记录` });
  };

  const downloadAdminTemplate = () => {
    writeAdminWorkbook('城市足迹导入模板.xlsx', [{
      用户名: targetUser?.username ?? '',
      省份: '广东',
      城市: '广州',
      停留天数: 365,
      最后停留日期: '2024-01-01',
      备注: '示例',
    }]);
  };

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!targetUserId) {
      useStore.getState().showToast({ icon: '!', message: '请选择导入目标用户' });
      event.target.value = '';
      return;
    }

    const [workbook, existingData] = await Promise.all([
      file.arrayBuffer().then((buffer) => XLSX.read(buffer, { type: 'array', cellDates: true })),
      adminExportVisits([targetUserId]),
    ]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const existingCityIds = new Set(existingData.visits.map((visit) => visit.city_id));
    const seenCityIds = new Set<string>();

    setImportPreview(records.map((record) => {
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
      else if (seenCityIds.has(matched.city_id)) row.error = '文件内重复';
      if (matched) seenCityIds.add(matched.city_id);
      return row;
    }));
    event.target.value = '';
  };

  const confirmAdminImport = async () => {
    if (!targetUserId) {
      useStore.getState().showToast({ icon: '!', message: '请选择导入目标用户' });
      return;
    }
    const validRows = importPreview.filter((row) => !row.error && row.city_id);
    const result = await adminImportVisits(targetUserId, validRows.map((row) => ({
      city_id: row.city_id as string,
      duration_days: row.duration_days,
      last_stay_date: row.last_stay_date,
      notes: row.notes,
    })));
    setImportPreview([]);
    useStore.getState().showToast({ icon: '✓', message: `已导入 ${result.inserted_count} 条访问记录` });
    void getSystemStats().then(setStats);
    if (adminTab === 'data') {
      void adminExportVisits(users.map((user) => user.id)).then((data) => setAllVisits(data.visits));
    }
  };

  const content = (
    <>
      <div className="mode-pill" style={{ marginBottom: 20 }}>
        <button className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>用户管理</button>
        <button className={adminTab === 'data' ? 'active' : ''} onClick={() => setAdminTab('data')}>数据管理</button>
      </div>

      {adminTab === 'users' && (
        <>
          <div className="admin-stats">
            <div className="stat"><span className="label-sm">总用户</span><strong>{stats.totalUsers}</strong></div>
            <div className="stat"><span className="label-sm">管理员</span><strong>{stats.adminUsers}</strong></div>
            <div className="stat"><span className="label-sm">总访问</span><strong>{stats.totalVisits}</strong></div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>+ 新增用户</button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>用户</th><th>类型</th><th>创建时间</th><th>密码</th><th>操作</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <input
                        className="input"
                        value={names[user.id] ?? user.name}
                        onChange={(event) => setNames({ ...names, [user.id]: event.target.value })}
                        onBlur={() => handleNameBlur(user.id)}
                        placeholder="用户名称"
                      />
                      {user.username && <div className="muted">@{user.username}</div>}
                    </td>
                    <td>{user.is_admin ? '管理员' : '普通用户'}</td>
                    <td>{user.created_at.slice(0, 10)}</td>
                    <td>
                      <button className="btn-outline small" onClick={() => { setPendingReset({ userId: user.id, name: user.name }); setResetPw(''); setResetConfirm(''); }}>重置密码</button>
                    </td>
                    <td>
                      {!user.is_admin && <button className="btn-danger small" onClick={() => removeUser(user.id)}>删除</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {adminTab === 'data' && (
        <div className="stack">
          <div className="panel-title">
            <strong>数据管理</strong>
            <span className="muted">所有用户访问记录台账</span>
          </div>

          <div className="form-row">
            <span className="label-sm">用户名筛选</span>
            <input
              className="input"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="搜索用户名…"
            />
            <div className="actions" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn-outline small" onClick={() => { setSelectedUserId(''); setUserSearch(''); }}>全部</button>
              {filteredUserOptions.map((user) => (
                <button
                  key={user.id}
                  className="btn-outline small"
                  onClick={() => setSelectedUserId(user.id)}
                  style={{ fontWeight: selectedUserId === user.id ? 700 : 400 }}
                >
                  {user.username || user.name}{user.username ? ` · ${user.name}` : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="actions">
            <button className="btn-primary" onClick={downloadCurrentLedger}>📤 导出当前视图</button>
            <button className="btn-outline" onClick={() => setShowImportTools((value) => !value)}>📥 导入数据</button>
            <button className="btn-outline" onClick={downloadAdminTemplate}>📥 下载模板</button>
          </div>

          {showImportTools && (
            <div className="card" style={{ padding: 16 }}>
              <div className="form-row">
                <span className="label-sm">批量导入</span>
                <div className="form-grid-2">
                  <select className="input" value={targetUserId} onChange={(event) => { setTargetUserId(event.target.value); setImportPreview([]); }}>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.username || user.name} · {user.name}</option>
                    ))}
                  </select>
                  <div className="actions">
                    <button className="btn-primary" disabled={!targetUserId} onClick={() => importFileRef.current?.click()}>📥 选择文件</button>
                  </div>
                </div>
                <input ref={importFileRef} type="file" accept=".xlsx" hidden onChange={onImportFile} />
              </div>
            </div>
          )}

          {importPreview.length > 0 && (
            <div className="import-preview card">
              <div className="panel-title">
                <strong>导入预览</strong>
                <span className="muted">
                  ✅ 有效 {importPreview.filter((row) => !row.error).length} 行 / ⚠️ 跳过 {importPreview.filter((row) => row.error === '城市已存在' || row.error === '文件内重复').length} 行 / ❌ 错误 {importPreview.filter((row) => row.error && row.error !== '城市已存在' && row.error !== '文件内重复').length} 行
                </span>
              </div>
              <div className="table-wrap compact">
                <table className="data-table">
                  <thead><tr><th>省份</th><th>城市</th><th>天数</th><th>最后停留</th><th>备注</th><th>状态</th></tr></thead>
                  <tbody>
                    {importPreview.map((row, index) => {
                      const isDuplicate = row.error === '城市已存在' || row.error === '文件内重复';
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
                <button className="btn-primary" disabled={importPreview.every((row) => row.error)} onClick={() => void confirmAdminImport()}>确认导入</button>
                <button className="btn-outline" onClick={() => setImportPreview([])}>取消</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>用户名</th><th>省份</th><th>城市</th><th>停留天数</th><th>最后停留日期</th><th>备注</th></tr></thead>
              <tbody>
                {ledgerVisits.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32 }} className="muted">暂无访问记录</td></tr>
                ) : ledgerVisits.map((visit) => {
                  const city = cityById.get(visit.city_id);
                  return (
                    <tr key={`${visit.user_id}-${visit.id}`}>
                      <td>{visit.username || visit.name}</td>
                      <td>{city?.province ?? '-'}</td>
                      <td>{city?.city_name ?? visit.city_id}</td>
                      <td>{visit.duration_days}</td>
                      <td>{visit.last_stay_date}</td>
                      <td>{visit.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingReset && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <h2>重置密码 · {pendingReset.name}</h2>
              <button className="icon-btn" onClick={() => setPendingReset(null)}>×</button>
            </div>
            <div className="stack" style={{ gap: 10, marginBottom: 16 }}>
              <div className="form-row">
                <span className="label-sm">新密码</span>
                <input className="input" type="password" autoFocus value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="至少6位" />
              </div>
              <div className="form-row">
                <span className="label-sm">确认密码</span>
                <input className="input" type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="再次输入" onKeyDown={(e) => { if (e.key === 'Enter') void handleResetPassword(); }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-outline" onClick={() => setPendingReset(null)}>取消</button>
              <button className="btn-primary" onClick={() => void handleResetPassword()}>确认重置</button>
            </div>
          </section>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal">
            <div className="modal-head">
              <h2>新增用户</h2>
              <button className="icon-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
              <input className="input" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="用户名" />
              <input className="input" value={newNickname} onChange={(event) => setNewNickname(event.target.value)} placeholder="昵称" />
              <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="密码" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-outline" onClick={() => { setShowCreateModal(false); setNewUsername(''); setNewNickname(''); setNewPassword(''); }}>取消</button>
              <button className="btn-primary" onClick={() => void handleCreateUser()}>确认创建</button>
            </div>
          </section>
        </div>
      )}
    </>
  );

  if (embedded) return <div className="embedded-panel">{content}</div>;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-wide">
        <div className="modal-head">
          <h2>管理员面板</h2>
          <button className="icon-btn" onClick={() => setAdminOpen(false)}>×</button>
        </div>
        {content}
      </section>
    </div>
  );
}
